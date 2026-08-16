use super::extract::{
    ArchiveEntryMtimes, expand_archive_to_path, system_time_ms, with_temp_work_dir,
};
use crate::domain::launcher::fs::read_json_file;
use crate::domain::launcher::install_manager::{
    collect_relative_files, files_differ, normalize_relative_path,
};
use crate::domain::launcher::library::scan_library_at_path;
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    InspectLauncherArchiveResult, LauncherArchiveDiffSummary, LauncherArchiveFileChangeKind,
    LauncherArchiveFileDiff, LauncherArchiveModRootInfo, LauncherArchiveTreeNode,
    LauncherLibraryScanResult,
};
use crate::domain::manifest::{normalize_unique_id, string_field};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path, normalize_separators};
use anyhow::{Context, bail};
use similar::TextDiff;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

/// Per-mod-root cap for the file detail list inside a diff summary. The
/// added/changed/removed counts still cover every differing file.
const MAX_DIFF_FILES_PER_ROOT: usize = 300;
/// Text diff size budget per file: both sides must fit within this many bytes.
const MAX_TEXT_DIFF_BYTES: u64 = 256 * 1024;
/// Text diff line budget; longer diffs are truncated and flagged.
const MAX_TEXT_DIFF_LINES: usize = 500;

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
    normalize_separators(&normalize_path(
        path.strip_prefix(archive_root).unwrap_or(path),
    ))
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
