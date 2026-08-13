use super::fs::read_json_file;
use super::install_manager::{
    collect_relative_files, files_differ, install_archive_bundle_at_path,
    list_backup_sessions_at_root, normalize_relative_path, restore_backup_session_at_path,
};
use super::library::scan_library_at_path;
use super::paths::{launcher_backup_dir, launcher_settings_path, launcher_updates_cache_path};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult,
    InstallLauncherArchiveInstalledMod, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherArchiveDiffSummary, LauncherArchiveFileChangeKind,
    LauncherArchiveFileDiff, LauncherArchiveModRootInfo, LauncherArchiveTreeNode,
    LauncherInstallBackupSummary, LauncherLibraryScanResult, ListLauncherInstallBackupsRequest,
    RestoreLauncherInstallBackupRequest, RestoreLauncherInstallBackupResult,
};
use super::update_cache::invalidate_launcher_updates_cache_at_path;
use crate::AppHandle;
use crate::domain::manifest::{normalize_unique_id, string_field};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::text_encoding::decode_text_bytes;
use anyhow::{Context, bail};
use flate2::read::GzDecoder;
use sevenz_rust::{Error as SevenZipError, decompress_file_with_extract_fn};
use similar::TextDiff;
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tar::Archive as TarArchive;
use unrar::Archive as RarArchive;
use zip::ZipArchive;

static TEMP_WORK_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Per-mod-root cap for the file detail list inside a diff summary. The
/// added/changed/removed counts still cover every differing file.
const MAX_DIFF_FILES_PER_ROOT: usize = 300;
/// Text diff size budget per file: both sides must fit within this many bytes.
const MAX_TEXT_DIFF_BYTES: u64 = 256 * 1024;
/// Text diff line budget; longer diffs are truncated and flagged.
const MAX_TEXT_DIFF_LINES: usize = 500;

/// Archive-relative file path (forward slashes) -> unix epoch milliseconds of
/// the entry's last-modified time, captured from archive entry metadata during
/// extraction. Only populated when the archive format exposes mtimes.
type ArchiveEntryMtimes = BTreeMap<String, u128>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LauncherArchiveFormat {
    Zip,
    SevenZip,
    Rar,
    Tar,
    TarGz,
    Tgz,
}

#[derive(Default)]
struct ArchiveInspectionState {
    total_entries: usize,
    total_files: usize,
    mod_roots: BTreeSet<String>,
}

/// Inspects an archive at `archive_path`.
///
/// Returns the expanded file tree, detected mod roots, and — when `mods_path`
/// is provided and readable — per-root manifest metadata plus install diff info
/// against already-installed mods matched by unique ID. Manifest parsing and the
/// library scan are best-effort: missing or malformed manifests and an
/// unreadable Mods folder degrade to `None` diff fields instead of failing the
/// inspection (the failure is traced).
pub(crate) fn inspect_archive_at_path(
    archive_path: &Path,
    mods_path: Option<&Path>,
) -> anyhow::Result<InspectLauncherArchiveResult> {
    log_launcher_trace("inspect.start", |event| {
        event
            .path("archivePath", archive_path)
            .flag("hasModsPath", mods_path.is_some())
    });
    if !archive_path.is_file() {
        bail!(
            "Launcher archive {} does not exist.",
            normalize_path(archive_path)
        );
    }

    with_temp_work_dir("launcher-inspect", "archive inspection", |temp_root| {
        let mut entry_mtimes = BTreeMap::new();
        expand_archive_to_path(archive_path, temp_root, Some(&mut entry_mtimes))?;
        let mut state = ArchiveInspectionState::default();
        let tree = build_archive_tree(temp_root, temp_root, &mut state)?;
        let existing_library = match mods_path {
            Some(path) => match scan_library_at_path(path) {
                Ok(scan) => Some(scan),
                Err(error) => {
                    log_launcher_trace("inspect.library-scan-failed", |event| {
                        event
                            .path("modsPath", path)
                            .field("error", &error.to_string())
                    });
                    None
                }
            },
            None => None,
        };
        let mod_roots = state
            .mod_roots
            .iter()
            .map(|root| {
                build_mod_root_info(temp_root, root, existing_library.as_ref(), &entry_mtimes)
                    .unwrap_or_else(|error| {
                        log_launcher_trace("inspect.mod-root-failed", |event| {
                            event.field("root", root).field("error", &error.to_string())
                        });
                        LauncherArchiveModRootInfo {
                            path: root.clone(),
                            manifest_unique_id: None,
                            manifest_name: None,
                            manifest_version: None,
                            existing_unique_id: None,
                            existing_version: None,
                            existing_path: None,
                            diff_summary: None,
                        }
                    })
            })
            .collect();
        let result = InspectLauncherArchiveResult {
            archive_path: normalize_path(archive_path),
            archive_file_name: archive_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            total_entries: state.total_entries,
            total_files: state.total_files,
            mod_roots,
            tree,
        };
        log_launcher_trace("inspect.complete", |event| {
            event
                .field("archivePath", &result.archive_path)
                .count("modRootCount", result.mod_roots.len())
                .field("totalFiles", result.total_files)
        });
        Ok(result)
    })
}

/// Builds the inspect info for one detected mod root: parses its manifest for
/// unique ID/name/version (best-effort) and, when the manifest unique ID matches
/// an installed mod in the scanned library, attaches the existing install info
/// and a file diff summary between the archive root and the installed folder.
fn build_mod_root_info(
    archive_root: &Path,
    root_path: &str,
    existing_library: Option<&LauncherLibraryScanResult>,
    entry_mtimes: &ArchiveEntryMtimes,
) -> anyhow::Result<LauncherArchiveModRootInfo> {
    let root_dir = if root_path == "." {
        archive_root.to_path_buf()
    } else {
        archive_root.join(root_path)
    };
    let manifest_path = root_dir.join("manifest.json");
    let manifest = if manifest_path.is_file() {
        match read_json_file(&manifest_path) {
            Ok(value) => Some(value),
            Err(error) => {
                log_launcher_trace("inspect.manifest-parse-failed", |event| {
                    event
                        .path("manifestPath", &manifest_path)
                        .field("error", &error.to_string())
                });
                None
            }
        }
    } else {
        None
    };
    let manifest_unique_id = manifest
        .as_ref()
        .and_then(|value| string_field(value, "UniqueID"));
    let manifest_name = manifest
        .as_ref()
        .and_then(|value| string_field(value, "Name"));
    let manifest_version = manifest
        .as_ref()
        .and_then(|value| string_field(value, "Version"));

    let existing = manifest_unique_id.as_deref().and_then(|unique_id| {
        existing_library.and_then(|scan| {
            scan.mods.iter().find(|item| {
                item.unique_id.as_deref().is_some_and(|value| {
                    normalize_unique_id(value) == normalize_unique_id(unique_id)
                })
            })
        })
    });

    let (existing_unique_id, existing_version, existing_path, diff_summary) = match existing {
        Some(item) => {
            let existing_root = clean_input_path(&item.absolute_path);
            let diff_summary = if existing_root.is_dir() {
                Some(compute_archive_diff_summary(
                    &root_dir,
                    &existing_root,
                    root_path,
                    entry_mtimes,
                )?)
            } else {
                None
            };
            (
                item.unique_id.clone(),
                item.version.clone(),
                Some(item.absolute_path.clone()),
                diff_summary,
            )
        }
        None => (None, None, None, None),
    };

    Ok(LauncherArchiveModRootInfo {
        path: root_path.to_string(),
        manifest_unique_id,
        manifest_name,
        manifest_version,
        existing_unique_id,
        existing_version,
        existing_path,
        diff_summary,
    })
}

/// Computes the file-level diff between the incoming archive mod root and the
/// installed folder it would replace: full added/changed/removed counts plus a
/// capped per-file detail list. Paths are normalized to forward slashes and
/// relative to the mod root; files present in both trees are compared
/// byte-for-byte. Changed text files get a unified diff (size and line budgets
/// apply); binary and oversized files only carry size/mtime metadata. Entry
/// mtimes are looked up by archive-relative path (`root_path` + file path).
fn compute_archive_diff_summary(
    incoming_root: &Path,
    existing_root: &Path,
    root_path: &str,
    entry_mtimes: &ArchiveEntryMtimes,
) -> anyhow::Result<LauncherArchiveDiffSummary> {
    let incoming_files = collect_relative_files(incoming_root)?;
    let existing_files = collect_relative_files(existing_root)?;
    let incoming_set = incoming_files
        .iter()
        .map(|path| normalize_relative_path(path))
        .collect::<BTreeSet<_>>();
    let existing_set = existing_files
        .iter()
        .map(|path| normalize_relative_path(path))
        .collect::<BTreeSet<_>>();
    let archive_key = |normalized: &str| -> String {
        if root_path == "." {
            normalized.to_string()
        } else {
            format!("{root_path}/{normalized}")
        }
    };

    let mut added = 0;
    let mut changed = 0;
    let mut files = Vec::new();
    let mut truncated_file_count = 0usize;
    let mut push_file = |file: LauncherArchiveFileDiff| {
        if files.len() < MAX_DIFF_FILES_PER_ROOT {
            files.push(file);
        } else {
            truncated_file_count += 1;
        }
    };

    for relative_path in &incoming_files {
        let normalized = normalize_relative_path(relative_path);
        let incoming_path = incoming_root.join(relative_path);
        if !existing_set.contains(&normalized) {
            added += 1;
            let incoming_meta = fs::metadata(&incoming_path).with_context(|| {
                format!(
                    "Failed to read launcher archive file metadata {}",
                    normalize_path(&incoming_path)
                )
            })?;
            push_file(LauncherArchiveFileDiff {
                path: normalized.clone(),
                change_kind: LauncherArchiveFileChangeKind::Added,
                old_size: None,
                new_size: Some(incoming_meta.len()),
                old_modified_ms: None,
                new_modified_ms: entry_mtimes.get(&archive_key(&normalized)).copied(),
                text_diff: None,
                text_diff_truncated: false,
            });
        } else if files_differ(&existing_root.join(relative_path), &incoming_path)? {
            changed += 1;
            push_file(build_changed_file_diff(
                &normalized,
                &existing_root.join(relative_path),
                &incoming_path,
                &archive_key(&normalized),
                entry_mtimes,
            )?);
        }
    }
    for relative_path in &existing_files {
        let normalized = normalize_relative_path(relative_path);
        if !incoming_set.contains(&normalized) {
            let existing_path = existing_root.join(relative_path);
            let existing_meta = fs::metadata(&existing_path).with_context(|| {
                format!(
                    "Failed to read installed mod file metadata {}",
                    normalize_path(&existing_path)
                )
            })?;
            push_file(LauncherArchiveFileDiff {
                path: normalized.clone(),
                change_kind: LauncherArchiveFileChangeKind::Removed,
                old_size: Some(existing_meta.len()),
                new_size: None,
                old_modified_ms: existing_meta.modified().ok().and_then(system_time_ms),
                new_modified_ms: None,
                text_diff: None,
                text_diff_truncated: false,
            });
        }
    }

    Ok(LauncherArchiveDiffSummary {
        added,
        changed,
        removed: existing_files
            .iter()
            .filter(|path| !incoming_set.contains(&normalize_relative_path(path)))
            .count(),
        files,
        truncated_file_count: (truncated_file_count > 0).then_some(truncated_file_count),
    })
}

/// Builds the diff detail for one changed file: byte sizes, modified times
/// (existing side from fs metadata, archive side from entry metadata), and —
/// for text files within the size budget — a unified diff string.
fn build_changed_file_diff(
    path: &str,
    existing_path: &Path,
    incoming_path: &Path,
    archive_key: &str,
    entry_mtimes: &ArchiveEntryMtimes,
) -> anyhow::Result<LauncherArchiveFileDiff> {
    let existing_meta = fs::metadata(existing_path).with_context(|| {
        format!(
            "Failed to read installed mod file metadata {}",
            normalize_path(existing_path)
        )
    })?;
    let incoming_meta = fs::metadata(incoming_path).with_context(|| {
        format!(
            "Failed to read launcher archive file metadata {}",
            normalize_path(incoming_path)
        )
    })?;
    let old_size = existing_meta.len();
    let new_size = incoming_meta.len();

    let (text_diff, text_diff_truncated) = if old_size <= MAX_TEXT_DIFF_BYTES
        && new_size <= MAX_TEXT_DIFF_BYTES
    {
        let old_bytes = fs::read(existing_path).with_context(|| {
            format!(
                "Failed to read installed mod file {}",
                normalize_path(existing_path)
            )
        })?;
        let new_bytes = fs::read(incoming_path).with_context(|| {
            format!(
                "Failed to read launcher archive file {}",
                normalize_path(incoming_path)
            )
        })?;
        if is_text_path(path) || (is_utf8_text_bytes(&old_bytes) && is_utf8_text_bytes(&new_bytes))
        {
            match build_text_diff(&old_bytes, &new_bytes, path) {
                Some((text, truncated)) => (Some(text), truncated),
                None => (None, false),
            }
        } else {
            (None, false)
        }
    } else {
        (None, false)
    };

    Ok(LauncherArchiveFileDiff {
        path: path.to_string(),
        change_kind: LauncherArchiveFileChangeKind::Changed,
        old_size: Some(old_size),
        new_size: Some(new_size),
        old_modified_ms: existing_meta.modified().ok().and_then(system_time_ms),
        new_modified_ms: entry_mtimes.get(archive_key).copied(),
        text_diff,
        text_diff_truncated,
    })
}

/// True when the file extension is on the known text whitelist.
fn is_text_path(path: &str) -> bool {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    matches!(
        extension.as_deref(),
        Some(
            "json"
                | "json5"
                | "jsonc"
                | "txt"
                | "md"
                | "csv"
                | "tsv"
                | "xml"
                | "yaml"
                | "yml"
                | "tmx"
                | "lua"
                | "js"
                | "ts"
                | "tsx"
                | "jsx"
                | "css"
                | "html"
                | "htm"
                | "svg"
                | "ini"
                | "cfg"
                | "conf"
                | "properties"
                | "toml"
                | "log"
                | "cs"
                | "py"
                | "java"
                | "c"
                | "h"
                | "cpp"
                | "hpp"
                | "rb"
                | "sh"
                | "bat"
                | "ps1"
                | "map"
        )
    )
}

/// Content sniff: valid UTF-8 with no NUL bytes.
fn is_utf8_text_bytes(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok() && !bytes.contains(&0)
}

/// Builds a unified diff for two text payloads, truncated to
/// `MAX_TEXT_DIFF_LINES` lines. Returns `None` when either side is not valid
/// UTF-8 or the payloads are identical.
fn build_text_diff(old_bytes: &[u8], new_bytes: &[u8], path: &str) -> Option<(String, bool)> {
    let old_text = std::str::from_utf8(old_bytes).ok()?;
    let new_text = std::str::from_utf8(new_bytes).ok()?;
    if old_text == new_text {
        return None;
    }
    let diff = TextDiff::from_lines(old_text, new_text);
    let full = diff
        .unified_diff()
        .context_radius(3)
        .header(path, path)
        .to_string();
    let total_lines = full.lines().count();
    if total_lines <= MAX_TEXT_DIFF_LINES {
        Some((full, false))
    } else {
        let truncated = full
            .lines()
            .take(MAX_TEXT_DIFF_LINES)
            .map(|line| format!("{line}\n"))
            .collect::<String>();
        Some((truncated, true))
    }
}

fn system_time_ms(time: SystemTime) -> Option<u128> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

/// Converts DOS date/time fields (zip entries, RAR headers) to a system time.
/// Invalid field combinations return `None`.
fn dos_fields_to_system_time(
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
) -> Option<SystemTime> {
    if month == 0 || day == 0 || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let month = time::Month::try_from(month).ok()?;
    let date = time::Date::from_calendar_date(i32::from(year), month, day).ok()?;
    let datetime = date.with_hms(hour, minute, second).ok()?;
    Some(datetime.assume_utc().into())
}

/// Converts a packed DOS date/time value (bits 15-0 date, 23-16 time) used by
/// RAR headers to a system time. `0` and invalid dates yield `None`.
fn dos_datetime_to_system_time(raw: u32) -> Option<SystemTime> {
    if raw == 0 {
        return None;
    }
    dos_fields_to_system_time(
        1980 + ((raw >> 25) & 0x7f) as u16,
        ((raw >> 21) & 0x0f) as u8,
        ((raw >> 16) & 0x1f) as u8,
        ((raw >> 11) & 0x1f) as u8,
        ((raw >> 5) & 0x3f) as u8,
        ((raw & 0x1f) as u8) * 2,
    )
}

fn build_archive_tree(
    archive_root: &Path,
    current_dir: &Path,
    state: &mut ArchiveInspectionState,
) -> anyhow::Result<Vec<LauncherArchiveTreeNode>> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(current_dir).with_context(|| {
        format!(
            "Failed to read launcher archive directory {}",
            normalize_path(current_dir)
        )
    })?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect launcher archive entry"))?;
        let entry_path = entry.path();
        let name = entry
            .file_name()
            .to_str()
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| normalize_path(&entry_path));
        let relative_path = to_archive_relative_path(&entry_path, archive_root);

        if entry_path.is_dir() {
            state.total_entries += 1;
            let children = build_archive_tree(archive_root, &entry_path, state)?;
            nodes.push(LauncherArchiveTreeNode {
                name,
                path: relative_path,
                is_directory: true,
                size_bytes: None,
                children,
            });
            continue;
        }

        state.total_entries += 1;
        state.total_files += 1;
        let size_bytes = entry.metadata().with_context(|| {
            format!(
                "Failed to read launcher archive file metadata {}",
                normalize_path(&entry_path)
            )
        })?;

        if name.eq_ignore_ascii_case("manifest.json") {
            state
                .mod_roots
                .insert(manifest_root_for_entry(&relative_path));
        }

        nodes.push(LauncherArchiveTreeNode {
            name,
            path: relative_path,
            is_directory: false,
            size_bytes: Some(size_bytes.len()),
            children: Vec::new(),
        });
    }

    nodes.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(nodes)
}

fn to_archive_relative_path(path: &Path, archive_root: &Path) -> String {
    normalize_path(path.strip_prefix(archive_root).unwrap_or(path)).replace('\\', "/")
}

fn manifest_root_for_entry(relative_path: &str) -> String {
    let parent = Path::new(relative_path)
        .parent()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .replace('\\', "/");
    let normalized = parent.trim_matches('/').to_string();
    if normalized.is_empty() {
        ".".to_string()
    } else {
        normalized
    }
}

pub(crate) fn install_archive_at_path(
    archive_path: &Path,
    mods_path: Option<&str>,
    backup_root: Option<&Path>,
) -> anyhow::Result<InstallLauncherArchiveResult> {
    if !archive_path.is_file() {
        bail!(
            "Launcher archive {} does not exist.",
            normalize_path(archive_path)
        );
    }
    let mods_path = mods_path
        .map(clean_input_path)
        .context("modsPath is required to install launcher archives.")?;
    log_launcher_trace("install.start", |event| {
        event
            .path("archivePath", archive_path)
            .path("modsPath", &mods_path)
            .flag("hasBackupRoot", backup_root.is_some())
    });
    fs::create_dir_all(&mods_path).with_context(|| {
        format!(
            "Failed to create launcher mods directory {}",
            normalize_path(&mods_path)
        )
    })?;
    let persisted_backup_root = backup_root
        .map(Path::to_path_buf)
        .unwrap_or_else(|| temp_work_dir("launcher-install-backups"));
    fs::create_dir_all(&persisted_backup_root).with_context(|| {
        format!(
            "Failed to create launcher backup directory {}",
            normalize_path(&persisted_backup_root)
        )
    })?;

    let result = install_archive_bundle_at_path(
        archive_path,
        &mods_path,
        &persisted_backup_root,
        |temp_root| {
            expand_archive_to_path(archive_path, temp_root, None)?;
            Ok(temp_root.to_path_buf())
        },
    )?;
    let public_result = InstallLauncherArchiveResult {
        mod_name: result.mod_name,
        unique_id: result.unique_id,
        version: result.version,
        target_path: result.target_path,
        preserved_config: result.preserved_config,
        preserved_i18n_files: result.preserved_i18n_files,
        installed_mods: result
            .installed_mods
            .into_iter()
            .map(|item| InstallLauncherArchiveInstalledMod {
                mod_name: item.mod_name,
                unique_id: item.unique_id,
                version: item.version,
                target_path: item.target_path,
                preserved_config: item.preserved_config,
                preserved_i18n_files: item.preserved_i18n_files,
            })
            .collect(),
        backup_id: result.backup_id,
        backup_path: result.backup_path,
        previous_version: result.previous_version,
        upgraded: result.upgraded,
    };
    log_launcher_trace("install.complete", |event| {
        event
            .field("targetPath", &public_result.target_path)
            .field("modName", &public_result.mod_name)
            .optional("uniqueId", public_result.unique_id.as_deref())
            .optional("version", public_result.version.as_deref())
            .count("installedModCount", public_result.installed_mods.len())
            .field("backupId", &public_result.backup_id)
    });
    Ok(public_result)
}

pub(crate) fn resolve_backup_session_path(
    backup_root: &Path,
    backup_id: &str,
) -> anyhow::Result<PathBuf> {
    let backup_id = backup_id.trim();
    if backup_id.is_empty() {
        bail!("backupId is required.");
    }
    if backup_id
        .chars()
        .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        bail!("backupId {backup_id} must identify a direct backup entry.");
    }

    let mut components = Path::new(backup_id).components();
    match components.next() {
        Some(Component::Normal(_)) if components.next().is_none() => {
            Ok(backup_root.join(backup_id))
        }
        _ => Err(anyhow::anyhow!(
            "backupId {backup_id} must identify a direct backup entry."
        )),
    }
}

/// Resolves a unique temp work directory for launcher operations. The caller owns
/// creation and cleanup; see [`with_temp_work_dir`] for the guarded variant.
pub(crate) fn temp_work_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = TEMP_WORK_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    env::temp_dir().join(format!(
        "modforge-{name}-{}-{unique}-{counter}",
        std::process::id()
    ))
}

pub(crate) fn with_expanded_archive<T>(
    archive_path: &Path,
    operation: impl FnOnce(&Path) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    with_temp_work_dir("mod-inspect", "mod archive inspection", |temp_root| {
        expand_archive_to_path(archive_path, temp_root, None)?;
        operation(temp_root)
    })
}

fn with_temp_work_dir<T>(
    name: &str,
    purpose: &str,
    operation: impl FnOnce(&Path) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    let temp_root = temp_work_dir(name);
    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    fs::create_dir_all(&temp_root).with_context(|| {
        format!(
            "Failed to create launcher {purpose} directory {}",
            normalize_path(&temp_root)
        )
    })?;

    let result = operation(&temp_root);
    let _ = fs::remove_dir_all(&temp_root);
    result
}

fn expand_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    match detect_archive_format(archive_path)? {
        LauncherArchiveFormat::Zip => {
            expand_zip_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::SevenZip => expand_seven_zip_archive_to_path(
            archive_path,
            destination_path,
            entry_mtimes.as_deref_mut(),
        ),
        LauncherArchiveFormat::Rar => {
            expand_rar_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::Tar => {
            expand_tar_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::TarGz | LauncherArchiveFormat::Tgz => expand_tar_gz_archive_to_path(
            archive_path,
            destination_path,
            entry_mtimes.as_deref_mut(),
        ),
    }
}

/// Expands any supported archive into `destination_path` (path-traversal safe),
/// without capturing entry mtimes. Used by the SMAPI updater to unpack inner
/// "double-zipped" installer archives.
pub(crate) fn expand_archive_to_destination(
    archive_path: &Path,
    destination_path: &Path,
) -> anyhow::Result<()> {
    expand_archive_to_path(archive_path, destination_path, None)
}

/// Records the entry's modified time (when the format exposes one) into the
/// mtime map under its normalized relative path.
fn record_entry_mtime(
    entry_mtimes: Option<&mut ArchiveEntryMtimes>,
    relative_path: &Path,
    modified: Option<SystemTime>,
) {
    if let (Some(mtimes), Some(modified)) = (entry_mtimes, modified) {
        if let Some(ms) = system_time_ms(modified) {
            mtimes.insert(normalize_relative_path(relative_path), ms);
        }
    }
}

fn detect_archive_format(archive_path: &Path) -> anyhow::Result<LauncherArchiveFormat> {
    let file_name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name.ends_with(".tar.gz") {
        return Ok(LauncherArchiveFormat::TarGz);
    }
    if file_name.ends_with(".tgz") {
        return Ok(LauncherArchiveFormat::Tgz);
    }

    match archive_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("zip") => Ok(LauncherArchiveFormat::Zip),
        Some("7z") => Ok(LauncherArchiveFormat::SevenZip),
        Some("rar") => Ok(LauncherArchiveFormat::Rar),
        Some("tar") => Ok(LauncherArchiveFormat::Tar),
        _ => Err(anyhow::anyhow!(
            "Unsupported archive format: {}",
            archive_format_label(archive_path)
        )),
    }
}

fn archive_format_label(archive_path: &Path) -> String {
    let file_name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name.ends_with(".tar.gz") {
        return ".tar.gz".to_string();
    }
    if file_name.ends_with(".tgz") {
        return ".tgz".to_string();
    }

    archive_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_else(|| archive_path.display().to_string())
}

fn sanitize_archive_entry_path(path: &Path, archive_path: &Path) -> anyhow::Result<PathBuf> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            _ => {
                bail!(
                    "Launcher archive {} contains an unsafe path entry: {}",
                    normalize_path(archive_path),
                    normalize_path(path)
                );
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        bail!(
            "Launcher archive {} contains an empty path entry: {}",
            normalize_path(archive_path),
            normalize_path(path)
        );
    }

    Ok(normalized)
}

fn decode_zip_entry_name<R: io::Read>(entry: &zip::read::ZipFile<'_, R>) -> String {
    let raw = entry.name_raw();
    if std::str::from_utf8(raw).is_ok() {
        return entry.name().to_string();
    }
    decode_text_bytes(raw)
}

fn expand_zip_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    let mut archive = ZipArchive::new(archive_file).with_context(|| {
        format!(
            "Failed to read launcher archive {} as a zip file",
            normalize_path(archive_path)
        )
    })?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).with_context(|| {
            format!(
                "Failed to read launcher archive entry #{index} from {}",
                normalize_path(archive_path)
            )
        })?;
        let decoded_name = decode_zip_entry_name(&entry);
        let relative_path = sanitize_archive_entry_path(Path::new(&decoded_name), archive_path)
            .with_context(|| {
                format!(
                    "Launcher archive {} contains an unsafe path entry: {}",
                    normalize_path(archive_path),
                    decoded_name
                )
            })?;
        let output_path = destination_path.join(&relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        let modified = entry.last_modified().and_then(|datetime| {
            dos_fields_to_system_time(
                datetime.year(),
                datetime.month(),
                datetime.day(),
                datetime.hour(),
                datetime.minute(),
                datetime.second(),
            )
        });
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        let mut output_file = fs::File::create(&output_path).with_context(|| {
            format!(
                "Failed to create launcher archive output file {}",
                normalize_path(&output_path)
            )
        })?;
        io::copy(&mut entry, &mut output_file).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                decoded_name,
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

fn expand_tar_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    extract_tar_entries(
        TarArchive::new(archive_file),
        archive_path,
        destination_path,
        entry_mtimes.as_deref_mut(),
    )
}

fn expand_tar_gz_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    let decoder = GzDecoder::new(archive_file);
    extract_tar_entries(
        TarArchive::new(decoder),
        archive_path,
        destination_path,
        entry_mtimes.as_deref_mut(),
    )
}

fn extract_tar_entries<R: io::Read>(
    mut archive: TarArchive<R>,
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let entries = archive.entries().with_context(|| {
        format!(
            "Failed to read launcher archive {} as a tar file",
            normalize_path(archive_path)
        )
    })?;

    for entry in entries {
        let mut entry = entry.with_context(|| {
            format!(
                "Failed to read launcher archive entry from {}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = entry.path().with_context(|| {
            format!(
                "Failed to read launcher archive entry path from {}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = sanitize_archive_entry_path(relative_path.as_ref(), archive_path)?;
        let output_path = destination_path.join(&relative_path);
        let entry_type = entry.header().entry_type();

        if entry_type.is_dir() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        if !entry_type.is_file() {
            bail!(
                "Launcher archive {} contains an unsupported tar entry: {}",
                normalize_path(archive_path),
                normalize_path(&relative_path)
            );
        }

        let modified = entry
            .header()
            .mtime()
            .ok()
            .map(|seconds| UNIX_EPOCH + std::time::Duration::from_secs(seconds));
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        entry.unpack(&output_path).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                normalize_path(&relative_path),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

fn expand_seven_zip_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    decompress_file_with_extract_fn(archive_path, destination_path, |entry, reader, _| {
        if entry.is_directory() && entry.name().is_empty() {
            return Ok(true);
        }

        let relative_path = sanitize_archive_entry_path(Path::new(entry.name()), archive_path)
            .map_err(|error| SevenZipError::other(error.to_string()))?;
        let output_path = destination_path.join(&relative_path);

        if entry.is_directory() {
            fs::create_dir_all(&output_path).map_err(|error| {
                SevenZipError::io_msg(
                    error,
                    format!(
                        "Failed to create launcher archive directory {}",
                        normalize_path(&output_path)
                    ),
                )
            })?;
            return Ok(true);
        }

        if entry.has_last_modified_date {
            let modified: SystemTime = entry.last_modified_date().into();
            record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, Some(modified));
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                SevenZipError::io_msg(
                    error,
                    format!(
                        "Failed to create launcher archive parent {}",
                        normalize_path(parent)
                    ),
                )
            })?;
        }

        let mut output_file = fs::File::create(&output_path).map_err(|error| {
            SevenZipError::io_msg(
                error,
                format!(
                    "Failed to create launcher archive output file {}",
                    normalize_path(&output_path)
                ),
            )
        })?;
        io::copy(reader, &mut output_file).map_err(|error| {
            SevenZipError::io_msg(
                error,
                format!(
                    "Failed to extract launcher archive entry {} to {}",
                    normalize_path(&relative_path),
                    normalize_path(&output_path)
                ),
            )
        })?;
        Ok(true)
    })
    .with_context(|| {
        format!(
            "Failed to extract launcher archive {} as a 7z file",
            normalize_path(archive_path)
        )
    })
}

fn expand_rar_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let mut archive = RarArchive::new(archive_path)
        .open_for_processing()
        .with_context(|| {
            format!(
                "Failed to read launcher archive {} as a rar file",
                normalize_path(archive_path)
            )
        })?;

    while let Some(header) = archive.read_header().with_context(|| {
        format!(
            "Failed to read launcher archive entry from {}",
            normalize_path(archive_path)
        )
    })? {
        let relative_path =
            sanitize_archive_entry_path(header.entry().filename.as_path(), archive_path)?;
        let output_path = destination_path.join(&relative_path);

        if header.entry().is_directory() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            archive = header.skip().with_context(|| {
                format!(
                    "Failed to advance launcher archive entry {}",
                    normalize_path(&relative_path)
                )
            })?;
            continue;
        }

        let modified = dos_datetime_to_system_time(header.entry().file_time);
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        archive = header.extract_to(&output_path).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                normalize_path(&relative_path),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

pub fn install_launcher_archive(
    _app: AppHandle,
    request: InstallLauncherArchiveRequest,
) -> anyhow::Result<InstallLauncherArchiveResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "install_launcher_archive",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let result = install_archive_at_path(
                &clean_input_path(request.archive_path.trim()),
                request
                    .mods_path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .or(settings.mods_path.as_deref()),
                Some(launcher_backup_dir()?.as_path()),
            )?;

            if let Some(mods_path) = clean_input_path(&result.target_path)
                .parent()
                .map(normalize_path)
            {
                let cache_path = launcher_updates_cache_path()?;
                invalidate_launcher_updates_cache_at_path(&cache_path, Some(&mods_path))?;
            }

            Ok(result)
        })(),
    )
}

pub fn inspect_launcher_archive(
    request: InspectLauncherArchiveRequest,
) -> anyhow::Result<InspectLauncherArchiveResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "inspect_launcher_archive",
        (|| {
            let archive_path = request.archive_path.trim();
            if archive_path.is_empty() {
                bail!("archivePath is required.");
            }

            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(clean_input_path);

            inspect_archive_at_path(&clean_input_path(archive_path), mods_path.as_deref())
        })(),
    )
}

pub fn list_launcher_install_backups(
    _app: AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> anyhow::Result<Vec<LauncherInstallBackupSummary>> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "list_launcher_install_backups",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .or(settings.mods_path.as_deref())
                .map(clean_input_path);
            let backup_root = launcher_backup_dir()?;
            let sessions = list_backup_sessions_at_root(&backup_root, mods_path.as_deref())?;
            Ok(sessions
                .into_iter()
                .map(|session| LauncherInstallBackupSummary {
                    backup_id: session.backup_id,
                    backup_path: session.backup_path,
                    delete_count: session.delete_count,
                    overwrite_count: session.overwrite_count,
                    created_at_ms: session.created_at_ms,
                    primary_mod_name: session.primary_mod_name,
                    primary_version: session.primary_version,
                    mod_count: session.mod_count,
                })
                .collect())
        })(),
    )
}

pub fn restore_launcher_install_backup(
    _app: AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> anyhow::Result<RestoreLauncherInstallBackupResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "restore_launcher_install_backup",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .or(settings.mods_path.as_deref())
                .map(clean_input_path);
            let backup_root = launcher_backup_dir()?;
            let backup_path = resolve_backup_session_path(&backup_root, &request.backup_id)?;
            let result = restore_backup_session_at_path(&backup_path, mods_path.as_deref())?;

            let cache_path = launcher_updates_cache_path()?;
            let mut invalidated = BTreeSet::new();
            for restored_path in &result.restored_paths {
                if let Some(mods_path) =
                    clean_input_path(restored_path).parent().map(normalize_path)
                {
                    if invalidated.insert(mods_path.clone()) {
                        invalidate_launcher_updates_cache_at_path(&cache_path, Some(&mods_path))?;
                    }
                }
            }

            Ok(RestoreLauncherInstallBackupResult {
                backup_id: result.backup_id,
                backup_path: result.backup_path,
                restored_paths: result.restored_paths,
            })
        })(),
    )
}

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/archive_tests.rs"]
mod tests;
