use super::fs::{
    copy_directory_recursive, discover_project_roots, merge_json_object_files, move_directory,
    read_json_file, sanitize_file_name, unique_path,
};
use super::library::{normalize_unique_id, scan_library_at_path};
use super::paths::{launcher_backup_dir, launcher_settings_path, launcher_updates_cache_path};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherArchiveTreeNode,
};
use super::update_cache::invalidate_launcher_updates_cache_at_path;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use serde_json::Value;
use std::collections::BTreeSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

    let temp_root = temp_work_dir("launcher-inspect");
    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    fs::create_dir_all(&temp_root).map_err(|error| {
        format!(
            "Failed to create launcher archive inspection directory {}: {error}",
            normalize_path(&temp_root)
        )
    })?;

    let inspect_result = (|| {
        expand_archive_to_path(archive_path, &temp_root)?;
        let mut state = ArchiveInspectionState::default();
        let tree = build_archive_tree(&temp_root, &temp_root, &mut state)?;
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
    })();

    let _ = fs::remove_dir_all(&temp_root);
    inspect_result
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

    let temp_root = temp_work_dir("launcher-install");
    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    fs::create_dir_all(&temp_root).map_err(|error| {
        format!(
            "Failed to create launcher temp directory {}: {error}",
            normalize_path(&temp_root)
        )
    })?;

    let install_result = (|| {
        expand_archive_to_path(archive_path, &temp_root)?;
        let project_roots = discover_project_roots(&temp_root)?;
        if project_roots.is_empty() {
            return Err("The archive did not contain a SMAPI manifest.json file.".to_string());
        }
        if project_roots.len() > 1 {
            return Err(
                "The archive contains multiple mod roots. Split the archive and install one mod at a time.".to_string(),
            );
        }

        let extracted_root = &project_roots[0];
        log_launcher_trace(
            "install.extracted",
            &[
                ("archivePath", normalize_path(archive_path)),
                ("extractedRoot", normalize_path(extracted_root)),
            ],
        );
        let manifest = read_json_file(&extracted_root.join("manifest.json"))?;
        let mod_name = project_name_from_manifest(&manifest, extracted_root);
        let unique_id = string_field(&manifest, "UniqueID");
        let version = string_field(&manifest, "Version");
        let existing_mod_path = unique_id.as_deref().and_then(|item| {
            find_existing_mod_path_by_unique_id(&mods_path, item)
                .ok()
                .flatten()
        });
        let _backup_snapshot =
            backup_existing_mod_to_launcher_dir(existing_mod_path.as_deref(), backup_root)?;
        let backup_root = temp_root.join("_backup");
        let preserved_config = backup_existing_config(existing_mod_path.as_deref(), &backup_root)?;
        let preserved_i18n_files =
            backup_existing_i18n(existing_mod_path.as_deref(), &backup_root)?;

        if let Some(existing_path) = existing_mod_path.as_deref() {
            log_launcher_trace(
                "install.replace-existing",
                &[
                    ("existingPath", normalize_path(existing_path)),
                    (
                        "uniqueId",
                        unique_id.clone().unwrap_or_else(|| "unknown".to_string()),
                    ),
                ],
            );
            fs::remove_dir_all(existing_path).map_err(|error| {
                format!(
                    "Failed to remove existing launcher mod {}: {error}",
                    normalize_path(existing_path)
                )
            })?;
        }

        let target_path = mods_path.join(
            extracted_root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("InstalledMod"),
        );
        if target_path.exists() {
            fs::remove_dir_all(&target_path).map_err(|error| {
                format!(
                    "Failed to clear existing launcher target {}: {error}",
                    normalize_path(&target_path)
                )
            })?;
        }
        move_directory(extracted_root, &target_path)?;
        restore_backed_up_config(&backup_root, &target_path)?;
        let restored_i18n_files = restore_backed_up_i18n(&backup_root, &target_path)?;

        let result = InstallLauncherArchiveResult {
            mod_name,
            unique_id,
            version,
            target_path: normalize_path(&target_path),
            preserved_config,
            preserved_i18n_files: preserved_i18n_files.max(restored_i18n_files),
        };
        log_launcher_trace(
            "install.complete",
            &[
                ("targetPath", result.target_path.clone()),
                ("modName", result.mod_name.clone()),
                (
                    "uniqueId",
                    result
                        .unique_id
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string()),
                ),
                (
                    "version",
                    result
                        .version
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string()),
                ),
            ],
        );
        Ok(result)
    })();

    let _ = fs::remove_dir_all(&temp_root);
    install_result
}

fn temp_work_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    env::temp_dir().join(format!("modforge-{name}-{unique}"))
}

fn project_name_from_manifest(manifest: &Value, project_path: &Path) -> String {
    string_field(manifest, "Name")
        .or_else(|| {
            project_path
                .file_name()
                .and_then(|value| value.to_str())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| "Unnamed Mod".to_string())
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn backup_existing_mod_to_launcher_dir(
    existing_mod_path: Option<&Path>,
    backup_root: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
    let Some(existing_mod_path) = existing_mod_path else {
        return Ok(None);
    };
    let Some(backup_root) = backup_root else {
        return Ok(None);
    };

    fs::create_dir_all(backup_root).map_err(|error| {
        format!(
            "Failed to create launcher backup root {}: {error}",
            normalize_path(backup_root)
        )
    })?;

    let folder_name = existing_mod_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("mod");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup_path = unique_path(&backup_root.join(format!(
        "{}-{}",
        timestamp,
        sanitize_file_name(folder_name)
    )));
    copy_directory_recursive(existing_mod_path, &backup_path)?;
    Ok(Some(backup_path))
}

#[cfg(target_os = "windows")]
fn expand_archive_to_path(archive_path: &Path, destination_path: &Path) -> Result<(), String> {
    let archive = normalize_path(archive_path).replace('\'', "''");
    let destination = normalize_path(destination_path).replace('\'', "''");
    let status = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!(
            "Expand-Archive -LiteralPath '{archive}' -DestinationPath '{destination}' -Force"
        ))
        .status()
        .map_err(|error| {
            format!("Failed to launch Expand-Archive for launcher install: {error}")
        })?;
    if !status.success() {
        return Err(format!(
            "Expand-Archive failed for launcher install {}.",
            normalize_path(archive_path)
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn expand_archive_to_path(_archive_path: &Path, _destination_path: &Path) -> Result<(), String> {
    Err("Launcher archive installation currently requires Windows.".to_string())
}

fn find_existing_mod_path_by_unique_id(
    mods_path: &Path,
    unique_id: &str,
) -> Result<Option<PathBuf>, String> {
    let normalized_target = normalize_unique_id(unique_id);
    let scan = scan_library_at_path(mods_path)?;
    Ok(scan.mods.into_iter().find_map(|mod_summary| {
        let project_unique_id = mod_summary.unique_id?;
        if normalize_unique_id(&project_unique_id) == normalized_target {
            Some(clean_input_path(&mod_summary.absolute_path))
        } else {
            None
        }
    }))
}

fn backup_existing_config(
    existing_mod_path: Option<&Path>,
    backup_root: &Path,
) -> Result<bool, String> {
    let Some(existing_mod_path) = existing_mod_path else {
        return Ok(false);
    };
    let config_path = existing_mod_path.join("config.json");
    if !config_path.is_file() {
        return Ok(false);
    }

    fs::create_dir_all(backup_root).map_err(|error| {
        format!(
            "Failed to create launcher backup directory {}: {error}",
            normalize_path(backup_root)
        )
    })?;
    fs::copy(&config_path, backup_root.join("config.json")).map_err(|error| {
        format!(
            "Failed to back up launcher config {}: {error}",
            normalize_path(&config_path)
        )
    })?;
    Ok(true)
}

fn backup_existing_i18n(
    existing_mod_path: Option<&Path>,
    backup_root: &Path,
) -> Result<usize, String> {
    let Some(existing_mod_path) = existing_mod_path else {
        return Ok(0);
    };
    let i18n_path = existing_mod_path.join("i18n");
    if !i18n_path.is_dir() {
        return Ok(0);
    }

    let backup_i18n_path = backup_root.join("i18n");
    fs::create_dir_all(&backup_i18n_path).map_err(|error| {
        format!(
            "Failed to create launcher i18n backup directory {}: {error}",
            normalize_path(&backup_i18n_path)
        )
    })?;

    let mut copied = 0;
    for entry in fs::read_dir(&i18n_path).map_err(|error| {
        format!(
            "Failed to read launcher i18n directory {}: {error}",
            normalize_path(&i18n_path)
        )
    })? {
        let entry =
            entry.map_err(|error| format!("Failed to inspect launcher i18n entry: {error}"))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        fs::copy(&path, backup_i18n_path.join(entry.file_name())).map_err(|error| {
            format!(
                "Failed to back up launcher i18n file {}: {error}",
                normalize_path(&path)
            )
        })?;
        copied += 1;
    }

    Ok(copied)
}

fn restore_backed_up_config(backup_root: &Path, target_mod_path: &Path) -> Result<(), String> {
    let backup_config = backup_root.join("config.json");
    if !backup_config.is_file() {
        return Ok(());
    }

    fs::copy(&backup_config, target_mod_path.join("config.json")).map_err(|error| {
        format!(
            "Failed to restore launcher config {}: {error}",
            normalize_path(&backup_config)
        )
    })?;
    Ok(())
}

fn restore_backed_up_i18n(backup_root: &Path, target_mod_path: &Path) -> Result<usize, String> {
    let backup_i18n_path = backup_root.join("i18n");
    if !backup_i18n_path.is_dir() {
        return Ok(0);
    }

    let target_i18n_path = target_mod_path.join("i18n");
    fs::create_dir_all(&target_i18n_path).map_err(|error| {
        format!(
            "Failed to create launcher target i18n directory {}: {error}",
            normalize_path(&target_i18n_path)
        )
    })?;

    let mut restored = 0;
    for entry in fs::read_dir(&backup_i18n_path).map_err(|error| {
        format!(
            "Failed to read launcher i18n backup directory {}: {error}",
            normalize_path(&backup_i18n_path)
        )
    })? {
        let entry = entry
            .map_err(|error| format!("Failed to inspect launcher i18n backup entry: {error}"))?;
        let source_path = entry.path();
        if !source_path.is_file()
            || source_path.extension().and_then(|value| value.to_str()) != Some("json")
        {
            continue;
        }

        let target_path = target_i18n_path.join(entry.file_name());
        if target_path.is_file() {
            merge_json_object_files(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "Failed to restore launcher i18n file {}: {error}",
                    normalize_path(&source_path)
                )
            })?;
        }
        restored += 1;
    }

    Ok(restored)
}

pub fn install_launcher_archive(
    app: tauri::AppHandle,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "install_launcher_archive",
        (|| {
            let settings_path = launcher_settings_path(&app)?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let result = install_archive_at_path(
                &clean_input_path(request.archive_path.trim()),
                request
                    .mods_path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .or(settings.mods_path.as_deref()),
                Some(launcher_backup_dir(&app)?.as_path()),
            )?;

            if let Some(mods_path) = clean_input_path(&result.target_path)
                .parent()
                .map(normalize_path)
            {
                let cache_path = launcher_updates_cache_path(&app)?;
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
