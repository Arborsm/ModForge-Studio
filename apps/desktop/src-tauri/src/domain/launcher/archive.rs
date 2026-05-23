use super::install_manager::{
    install_archive_bundle_at_path, list_backup_sessions_at_root, restore_backup_session_at_path,
};
use super::paths::{launcher_backup_dir, launcher_settings_path, launcher_updates_cache_path};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult,
    InstallLauncherArchiveInstalledMod, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherArchiveTreeNode, LauncherInstallBackupSummary,
    ListLauncherInstallBackupsRequest, RestoreLauncherInstallBackupRequest,
    RestoreLauncherInstallBackupResult,
};
use super::update_cache::invalidate_launcher_updates_cache_at_path;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use flate2::read::GzDecoder;
use sevenz_rust::{decompress_file_with_extract_fn, Error as SevenZipError};
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tar::Archive as TarArchive;
use unrar::Archive as RarArchive;
use zip::ZipArchive;

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

pub(crate) fn inspect_archive_at_path(
    archive_path: &Path,
) -> Result<InspectLauncherArchiveResult, String> {
    log_launcher_trace(
        "inspect.start",
        &[("archivePath", normalize_path(archive_path))],
    );
    if !archive_path.is_file() {
        return Err(format!(
            "Launcher archive {} does not exist.",
            normalize_path(archive_path)
        ));
    }

    with_temp_work_dir("launcher-inspect", "archive inspection", |temp_root| {
        expand_archive_to_path(archive_path, temp_root)?;
        let mut state = ArchiveInspectionState::default();
        let tree = build_archive_tree(temp_root, temp_root, &mut state)?;
        let result = InspectLauncherArchiveResult {
            archive_path: normalize_path(archive_path),
            archive_file_name: archive_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default()
                .to_string(),
            total_entries: state.total_entries,
            total_files: state.total_files,
            mod_roots: state.mod_roots.into_iter().collect(),
            tree,
        };
        log_launcher_trace(
            "inspect.complete",
            &[
                ("archivePath", result.archive_path.clone()),
                ("modRootCount", result.mod_roots.len().to_string()),
                ("totalFiles", result.total_files.to_string()),
            ],
        );
        Ok(result)
    })
}

fn build_archive_tree(
    archive_root: &Path,
    current_dir: &Path,
    state: &mut ArchiveInspectionState,
) -> Result<Vec<LauncherArchiveTreeNode>, String> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(current_dir).map_err(|error| {
        format!(
            "Failed to read launcher archive directory {}: {error}",
            normalize_path(current_dir)
        )
    })?;

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Failed to inspect launcher archive entry: {error}"))?;
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
        let size_bytes = entry.metadata().map_err(|error| {
            format!(
                "Failed to read launcher archive file metadata {}: {error}",
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
) -> Result<InstallLauncherArchiveResult, String> {
    if !archive_path.is_file() {
        return Err(format!(
            "Launcher archive {} does not exist.",
            normalize_path(archive_path)
        ));
    }
    let mods_path = mods_path
        .map(clean_input_path)
        .ok_or_else(|| "modsPath is required to install launcher archives.".to_string())?;
    log_launcher_trace(
        "install.start",
        &[
            ("archivePath", normalize_path(archive_path)),
            ("modsPath", normalize_path(&mods_path)),
            (
                "hasBackupRoot",
                backup_root.map(Path::to_path_buf).is_some().to_string(),
            ),
        ],
    );
    fs::create_dir_all(&mods_path).map_err(|error| {
        format!(
            "Failed to create launcher mods directory {}: {error}",
            normalize_path(&mods_path)
        )
    })?;
    let persisted_backup_root = backup_root
        .map(Path::to_path_buf)
        .unwrap_or_else(|| temp_work_dir("launcher-install-backups"));
    fs::create_dir_all(&persisted_backup_root).map_err(|error| {
        format!(
            "Failed to create launcher backup directory {}: {error}",
            normalize_path(&persisted_backup_root)
        )
    })?;

    let result = install_archive_bundle_at_path(
        archive_path,
        &mods_path,
        &persisted_backup_root,
        |temp_root| {
            expand_archive_to_path(archive_path, temp_root)?;
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
    };
    log_launcher_trace(
        "install.complete",
        &[
            ("targetPath", public_result.target_path.clone()),
            ("modName", public_result.mod_name.clone()),
            (
                "uniqueId",
                public_result
                    .unique_id
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
            ),
            (
                "version",
                public_result
                    .version
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
            ),
            (
                "installedModCount",
                public_result.installed_mods.len().to_string(),
            ),
            ("backupId", public_result.backup_id.clone()),
        ],
    );
    Ok(public_result)
}

pub(crate) fn resolve_backup_session_path(
    backup_root: &Path,
    backup_id: &str,
) -> Result<PathBuf, String> {
    let backup_id = backup_id.trim();
    if backup_id.is_empty() {
        return Err("backupId is required.".to_string());
    }
    if backup_id
        .chars()
        .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        return Err(format!(
            "backupId {backup_id} must identify a direct backup entry."
        ));
    }

    let mut components = Path::new(backup_id).components();
    match components.next() {
        Some(Component::Normal(_)) if components.next().is_none() => {
            Ok(backup_root.join(backup_id))
        }
        _ => Err(format!(
            "backupId {backup_id} must identify a direct backup entry."
        )),
    }
}

fn temp_work_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    env::temp_dir().join(format!("modforge-{name}-{unique}"))
}

fn with_temp_work_dir<T>(
    name: &str,
    purpose: &str,
    operation: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    let temp_root = temp_work_dir(name);
    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    fs::create_dir_all(&temp_root).map_err(|error| {
        format!(
            "Failed to create launcher {purpose} directory {}: {error}",
            normalize_path(&temp_root)
        )
    })?;

    let result = operation(&temp_root);
    let _ = fs::remove_dir_all(&temp_root);
    result
}

fn expand_archive_to_path(archive_path: &Path, destination_path: &Path) -> Result<(), String> {
    match detect_archive_format(archive_path)? {
        LauncherArchiveFormat::Zip => expand_zip_archive_to_path(archive_path, destination_path),
        LauncherArchiveFormat::SevenZip => {
            expand_seven_zip_archive_to_path(archive_path, destination_path)
        }
        LauncherArchiveFormat::Rar => expand_rar_archive_to_path(archive_path, destination_path),
        LauncherArchiveFormat::Tar => expand_tar_archive_to_path(archive_path, destination_path),
        LauncherArchiveFormat::TarGz | LauncherArchiveFormat::Tgz => {
            expand_tar_gz_archive_to_path(archive_path, destination_path)
        }
    }
}

fn detect_archive_format(archive_path: &Path) -> Result<LauncherArchiveFormat, String> {
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
        _ => Err(format!(
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

fn sanitize_archive_entry_path(path: &Path, archive_path: &Path) -> Result<PathBuf, String> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            _ => {
                return Err(format!(
                    "Launcher archive {} contains an unsafe path entry: {}",
                    normalize_path(archive_path),
                    normalize_path(path)
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(format!(
            "Launcher archive {} contains an empty path entry: {}",
            normalize_path(archive_path),
            normalize_path(path)
        ));
    }

    Ok(normalized)
}

fn expand_zip_archive_to_path(archive_path: &Path, destination_path: &Path) -> Result<(), String> {
    let archive_file = fs::File::open(archive_path).map_err(|error| {
        format!(
            "Failed to open launcher archive {}: {error}",
            normalize_path(archive_path)
        )
    })?;
    let mut archive = ZipArchive::new(archive_file).map_err(|error| {
        format!(
            "Failed to read launcher archive {} as a zip file: {error}",
            normalize_path(archive_path)
        )
    })?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| {
            format!(
                "Failed to read launcher archive entry #{index} from {}: {error}",
                normalize_path(archive_path)
            )
        })?;
        let Some(relative_path) = entry.enclosed_name() else {
            return Err(format!(
                "Launcher archive {} contains an unsafe path entry: {}",
                normalize_path(archive_path),
                entry.name()
            ));
        };
        let output_path = destination_path.join(&relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| {
                format!(
                    "Failed to create launcher archive directory {}: {error}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create launcher archive parent {}: {error}",
                    normalize_path(parent)
                )
            })?;
        }

        let mut output_file = fs::File::create(&output_path).map_err(|error| {
            format!(
                "Failed to create launcher archive output file {}: {error}",
                normalize_path(&output_path)
            )
        })?;
        io::copy(&mut entry, &mut output_file).map_err(|error| {
            format!(
                "Failed to extract launcher archive entry {} to {}: {error}",
                entry.name(),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

fn expand_tar_archive_to_path(archive_path: &Path, destination_path: &Path) -> Result<(), String> {
    let archive_file = fs::File::open(archive_path).map_err(|error| {
        format!(
            "Failed to open launcher archive {}: {error}",
            normalize_path(archive_path)
        )
    })?;
    extract_tar_entries(
        TarArchive::new(archive_file),
        archive_path,
        destination_path,
    )
}

fn expand_tar_gz_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
) -> Result<(), String> {
    let archive_file = fs::File::open(archive_path).map_err(|error| {
        format!(
            "Failed to open launcher archive {}: {error}",
            normalize_path(archive_path)
        )
    })?;
    let decoder = GzDecoder::new(archive_file);
    extract_tar_entries(TarArchive::new(decoder), archive_path, destination_path)
}

fn extract_tar_entries<R: io::Read>(
    mut archive: TarArchive<R>,
    archive_path: &Path,
    destination_path: &Path,
) -> Result<(), String> {
    let entries = archive.entries().map_err(|error| {
        format!(
            "Failed to read launcher archive {} as a tar file: {error}",
            normalize_path(archive_path)
        )
    })?;

    for entry in entries {
        let mut entry = entry.map_err(|error| {
            format!(
                "Failed to read launcher archive entry from {}: {error}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = entry.path().map_err(|error| {
            format!(
                "Failed to read launcher archive entry path from {}: {error}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = sanitize_archive_entry_path(relative_path.as_ref(), archive_path)?;
        let output_path = destination_path.join(&relative_path);
        let entry_type = entry.header().entry_type();

        if entry_type.is_dir() {
            fs::create_dir_all(&output_path).map_err(|error| {
                format!(
                    "Failed to create launcher archive directory {}: {error}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        if !entry_type.is_file() {
            return Err(format!(
                "Launcher archive {} contains an unsupported tar entry: {}",
                normalize_path(archive_path),
                normalize_path(&relative_path)
            ));
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create launcher archive parent {}: {error}",
                    normalize_path(parent)
                )
            })?;
        }

        entry.unpack(&output_path).map_err(|error| {
            format!(
                "Failed to extract launcher archive entry {} to {}: {error}",
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
) -> Result<(), String> {
    decompress_file_with_extract_fn(archive_path, destination_path, |entry, reader, _| {
        if entry.is_directory() && entry.name().is_empty() {
            return Ok(true);
        }

        let relative_path = sanitize_archive_entry_path(Path::new(entry.name()), archive_path)
            .map_err(SevenZipError::other)?;
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
    .map_err(|error| {
        format!(
            "Failed to extract launcher archive {} as a 7z file: {error}",
            normalize_path(archive_path)
        )
    })
}

fn expand_rar_archive_to_path(archive_path: &Path, destination_path: &Path) -> Result<(), String> {
    let mut archive = RarArchive::new(archive_path)
        .open_for_processing()
        .map_err(|error| {
            format!(
                "Failed to read launcher archive {} as a rar file: {error}",
                normalize_path(archive_path)
            )
        })?;

    while let Some(header) = archive.read_header().map_err(|error| {
        format!(
            "Failed to read launcher archive entry from {}: {error}",
            normalize_path(archive_path)
        )
    })? {
        let relative_path =
            sanitize_archive_entry_path(header.entry().filename.as_path(), archive_path)?;
        let output_path = destination_path.join(&relative_path);

        if header.entry().is_directory() {
            fs::create_dir_all(&output_path).map_err(|error| {
                format!(
                    "Failed to create launcher archive directory {}: {error}",
                    normalize_path(&output_path)
                )
            })?;
            archive = header.skip().map_err(|error| {
                format!(
                    "Failed to advance launcher archive entry {}: {error}",
                    normalize_path(&relative_path)
                )
            })?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create launcher archive parent {}: {error}",
                    normalize_path(parent)
                )
            })?;
        }

        archive = header.extract_to(&output_path).map_err(|error| {
            format!(
                "Failed to extract launcher archive entry {} to {}: {error}",
                normalize_path(&relative_path),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

pub fn install_launcher_archive(
    _app: tauri::AppHandle,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
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
) -> Result<InspectLauncherArchiveResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "inspect_launcher_archive",
        (|| {
            let archive_path = request.archive_path.trim();
            if archive_path.is_empty() {
                return Err("archivePath is required.".to_string());
            }

            inspect_archive_at_path(&clean_input_path(archive_path))
        })(),
    )
}

pub fn list_launcher_install_backups(
    _app: tauri::AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
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
                })
                .collect())
        })(),
    )
}

pub fn restore_launcher_install_backup(
    _app: tauri::AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
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
#[path = "tests/archive_tests.rs"]
mod tests;
