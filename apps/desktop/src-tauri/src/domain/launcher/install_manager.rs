use super::fs::{discover_project_roots, read_json_file, sanitize_file_name, unique_path};
use super::library::scan_library_at_path;
use crate::domain::manifest::{
    content_pack_for_unique_id, normalize_unique_id, project_name_from_manifest, string_field,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InstallManagerInstalledMod {
    pub mod_name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub target_path: String,
    pub preserved_config: bool,
    pub preserved_i18n_files: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InstallManagerSessionResult {
    pub mod_name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub target_path: String,
    pub preserved_config: bool,
    pub preserved_i18n_files: usize,
    pub installed_mods: Vec<InstallManagerInstalledMod>,
    pub backup_id: String,
    pub backup_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InstallManagerBackupSummary {
    pub backup_id: String,
    pub backup_path: String,
    pub delete_count: usize,
    pub overwrite_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InstallManagerRestoreResult {
    pub backup_id: String,
    pub backup_path: String,
    pub restored_paths: Vec<String>,
}

#[derive(Debug, Clone)]
struct PlannedTarget {
    mod_name: String,
    unique_id: Option<String>,
    version: Option<String>,
    folder_name: String,
    target_path: PathBuf,
}

#[derive(Debug, Clone)]
struct ModBundle {
    root: PathBuf,
    mod_name: String,
    unique_id: Option<String>,
    version: Option<String>,
    content_pack_for: Option<String>,
    folder_name: String,
}

#[derive(Debug, Clone)]
struct OverlayBundle {
    root: PathBuf,
    target: PlannedTarget,
}

#[derive(Debug, Clone)]
enum InstallOperation {
    FreshInstall {
        bundle: ModBundle,
        target: PlannedTarget,
    },
    UpgradeReplace {
        bundle: ModBundle,
        target: PlannedTarget,
    },
    OverlayMerge {
        bundle: OverlayBundle,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSessionMetadata {
    backup_id: String,
    backup_path: String,
    created_at_ms: u128,
    mods_path: String,
    entries: Vec<BackupEntryMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntryMetadata {
    entry_id: String,
    target_path: String,
    existed_before: bool,
    saved_paths: Vec<String>,
    added_paths: Vec<String>,
}

#[derive(Debug, Clone)]
struct BackupEntryRecorder {
    entry_id: String,
    target_path: PathBuf,
    existed_before: bool,
    saved_paths: BTreeSet<String>,
    added_paths: BTreeSet<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JsonMergePreference {
    ExistingWins,
    IncomingWins,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum PrimaryInstallPriority {
    DirectMod,
    ContentPack,
    OverlayOnly,
}

#[derive(Debug, Clone)]
struct ExecutedInstall {
    priority: PrimaryInstallPriority,
    result: InstallManagerInstalledMod,
}

impl BackupEntryRecorder {
    fn new(entry_id: String, target_path: PathBuf, existed_before: bool) -> Self {
        Self {
            entry_id,
            target_path,
            existed_before,
            saved_paths: BTreeSet::new(),
            added_paths: BTreeSet::new(),
        }
    }

    fn finish(self) -> BackupEntryMetadata {
        BackupEntryMetadata {
            entry_id: self.entry_id,
            target_path: normalize_path(&self.target_path),
            existed_before: self.existed_before,
            saved_paths: self.saved_paths.into_iter().collect(),
            added_paths: self.added_paths.into_iter().collect(),
        }
    }
}

pub(crate) fn install_staged_bundle_at_path(
    bundle_root: &Path,
    mods_path: &Path,
    backup_root: &Path,
) -> Result<InstallManagerSessionResult, String> {
    if !bundle_root.is_dir() {
        return Err(format!(
            "Bundle root {} does not exist.",
            normalize_path(bundle_root)
        ));
    }

    fs::create_dir_all(mods_path).map_err(|error| {
        format!(
            "Failed to create mods directory {}: {error}",
            normalize_path(mods_path)
        )
    })?;
    fs::create_dir_all(backup_root).map_err(|error| {
        format!(
            "Failed to create backup directory {}: {error}",
            normalize_path(backup_root)
        )
    })?;

    let operations = plan_install_operations(bundle_root, mods_path)?;
    if operations.is_empty() {
        return Err("The bundle did not contain any installable mods or overlays.".to_string());
    }

    let (backup_id, backup_path) = create_backup_session_dir(backup_root)?;
    let work_root = backup_path.join("_work");
    fs::create_dir_all(&work_root).map_err(|error| {
        format!(
            "Failed to create install work directory {}: {error}",
            normalize_path(&work_root)
        )
    })?;

    let mut entries = Vec::new();
    let mut executed_installs = Vec::new();
    let mut installed_mods = Vec::new();

    for (index, operation) in operations.iter().enumerate() {
        let entry_id = format!("entry-{:02}", index + 1);
        let entry_root = backup_path.join("entries").join(&entry_id);
        let before_root = entry_root.join("before");
        fs::create_dir_all(&before_root).map_err(|error| {
            format!(
                "Failed to create backup entry directory {}: {error}",
                normalize_path(&before_root)
            )
        })?;

        let mut recorder = BackupEntryRecorder::new(
            entry_id.clone(),
            operation.target_path().to_path_buf(),
            operation.target_path().exists(),
        );
        let result = execute_install_operation(
            operation,
            &work_root.join(&entry_id),
            &before_root,
            &mut recorder,
        )?;
        executed_installs.push(ExecutedInstall {
            priority: primary_install_priority(operation),
            result: result.clone(),
        });
        installed_mods.push(result);
        entries.push(recorder.finish());
    }

    let _ = fs::remove_dir_all(&work_root);

    installed_mods.sort_by(|left, right| {
        normalize_unique_id(&left.mod_name)
            .cmp(&normalize_unique_id(&right.mod_name))
            .then_with(|| left.target_path.cmp(&right.target_path))
    });

    let primary = executed_installs
        .into_iter()
        .min_by(|left, right| {
            left.priority
                .cmp(&right.priority)
                .then_with(|| {
                    normalize_unique_id(&left.result.mod_name)
                        .cmp(&normalize_unique_id(&right.result.mod_name))
                })
                .then_with(|| left.result.target_path.cmp(&right.result.target_path))
        })
        .map(|item| item.result)
        .ok_or_else(|| "The install manager did not produce any installed targets.".to_string())?;

    let metadata = BackupSessionMetadata {
        backup_id: backup_id.clone(),
        backup_path: normalize_path(&backup_path),
        created_at_ms: current_timestamp_ms(),
        mods_path: normalize_path(mods_path),
        entries,
    };
    save_backup_metadata(&backup_path.join("metadata.json"), &metadata)?;

    Ok(InstallManagerSessionResult {
        mod_name: primary.mod_name.clone(),
        unique_id: primary.unique_id.clone(),
        version: primary.version.clone(),
        target_path: primary.target_path.clone(),
        preserved_config: primary.preserved_config,
        preserved_i18n_files: primary.preserved_i18n_files,
        installed_mods,
        backup_id,
        backup_path: normalize_path(&backup_path),
    })
}

pub(crate) fn list_backup_sessions_at_root(
    backup_root: &Path,
    expected_mods_path: Option<&Path>,
) -> Result<Vec<InstallManagerBackupSummary>, String> {
    if !backup_root.is_dir() {
        return Ok(Vec::new());
    }

    let expected_mods_path = expected_mods_path.map(normalize_path);
    let mut sessions = Vec::new();
    for entry in fs::read_dir(backup_root).map_err(|error| {
        format!(
            "Failed to read backup root {}: {error}",
            normalize_path(backup_root)
        )
    })? {
        let entry =
            entry.map_err(|error| format!("Failed to inspect backup root entry: {error}"))?;
        let entry_path = entry.path();
        let metadata_path = entry_path.join("metadata.json");
        if !metadata_path.is_file() {
            continue;
        }
        let metadata = load_backup_metadata(&metadata_path)?;
        if let Some(expected_mods_path) = expected_mods_path.as_ref() {
            let backup_mods_path = normalize_path(&clean_input_path(&metadata.mods_path));
            if &backup_mods_path != expected_mods_path {
                continue;
            }
        }
        sessions.push(InstallManagerBackupSummary {
            backup_id: metadata.backup_id,
            backup_path: metadata.backup_path,
            delete_count: metadata
                .entries
                .iter()
                .map(|entry| entry.added_paths.len())
                .sum(),
            overwrite_count: metadata
                .entries
                .iter()
                .map(|entry| entry.saved_paths.len())
                .sum(),
        });
    }

    sessions.sort_by(|left, right| right.backup_id.cmp(&left.backup_id));
    Ok(sessions)
}

pub(crate) fn restore_backup_session_at_path(
    backup_path: &Path,
    expected_mods_path: Option<&Path>,
) -> Result<InstallManagerRestoreResult, String> {
    let metadata = load_backup_metadata(&backup_path.join("metadata.json"))?;
    if let Some(expected_mods_path) = expected_mods_path {
        let backup_mods_path = normalize_path(&clean_input_path(&metadata.mods_path));
        let expected_mods_path = normalize_path(expected_mods_path);
        if backup_mods_path != expected_mods_path {
            return Err(format!(
                "Backup {} belongs to modsPath {}, not {}.",
                metadata.backup_id, backup_mods_path, expected_mods_path
            ));
        }
    }

    let mut restored_paths = BTreeSet::new();

    for entry in metadata.entries.iter().rev() {
        let target_root = clean_input_path(&entry.target_path);
        let before_root = backup_path
            .join("entries")
            .join(&entry.entry_id)
            .join("before");

        for relative_path in &entry.added_paths {
            let target_path = target_root.join(relative_path);
            if target_path.is_file() {
                fs::remove_file(&target_path).map_err(|error| {
                    format!(
                        "Failed to remove added file {} during restore: {error}",
                        normalize_path(&target_path)
                    )
                })?;
            } else if target_path.is_dir() {
                fs::remove_dir_all(&target_path).map_err(|error| {
                    format!(
                        "Failed to remove added directory {} during restore: {error}",
                        normalize_path(&target_path)
                    )
                })?;
            }
            cleanup_empty_parents(&target_root, target_path.parent());
        }

        for relative_path in &entry.saved_paths {
            let source_path = before_root.join(relative_path);
            if !source_path.is_file() {
                return Err(format!(
                    "Backup {} is missing backup file {}.",
                    metadata.backup_id,
                    normalize_path(&source_path)
                ));
            }
            let target_path = target_root.join(relative_path);
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Failed to create restore parent {}: {error}",
                        normalize_path(parent)
                    )
                })?;
            }
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "Failed to restore backup file {} to {}: {error}",
                    normalize_path(&source_path),
                    normalize_path(&target_path)
                )
            })?;
        }

        if !entry.existed_before {
            cleanup_empty_tree(&target_root)?;
            if target_root.is_dir()
                && target_root
                    .read_dir()
                    .map_err(|error| {
                        format!(
                            "Failed to inspect restored target {}: {error}",
                            normalize_path(&target_root)
                        )
                    })?
                    .next()
                    .is_none()
            {
                let _ = fs::remove_dir_all(&target_root);
            }
        } else {
            cleanup_empty_tree(&target_root)?;
        }

        restored_paths.insert(entry.target_path.clone());
    }

    Ok(InstallManagerRestoreResult {
        backup_id: metadata.backup_id,
        backup_path: metadata.backup_path,
        restored_paths: restored_paths.into_iter().collect(),
    })
}

pub(crate) fn install_archive_bundle_at_path(
    archive_path: &Path,
    mods_path: &Path,
    backup_root: &Path,
    extract_bundle_to_path: impl FnOnce(&Path) -> Result<PathBuf, String>,
) -> Result<InstallManagerSessionResult, String> {
    let work_root = temp_work_dir("launcher-install-bundle");
    if work_root.exists() {
        let _ = fs::remove_dir_all(&work_root);
    }
    fs::create_dir_all(&work_root).map_err(|error| {
        format!(
            "Failed to create install archive temp directory {}: {error}",
            normalize_path(&work_root)
        )
    })?;

    let staged_root = extract_bundle_to_path(&work_root).map_err(|error| {
        let _ = fs::remove_dir_all(&work_root);
        format!(
            "Failed to stage archive bundle {}: {error}",
            normalize_path(archive_path)
        )
    })?;
    let result = install_staged_bundle_at_path(&staged_root, mods_path, backup_root);
    let _ = fs::remove_dir_all(&work_root);
    result
}

fn plan_install_operations(
    bundle_root: &Path,
    mods_path: &Path,
) -> Result<Vec<InstallOperation>, String> {
    let existing_targets = load_existing_targets(mods_path)?;
    let discovered_mod_roots = discover_project_roots(bundle_root)?;
    let mut mod_bundles = discovered_mod_roots
        .into_iter()
        .map(|root| build_mod_bundle(bundle_root, &root))
        .collect::<Result<Vec<_>, _>>()?;
    mod_bundles.sort_by(|left, right| {
        normalize_unique_id(&left.mod_name)
            .cmp(&normalize_unique_id(&right.mod_name))
            .then_with(|| left.root.cmp(&right.root))
    });

    let mut targets_by_alias = BTreeMap::<String, Vec<PlannedTarget>>::new();
    let mut planned_unique_ids = BTreeSet::<String>::new();
    let mut operations = Vec::new();

    for existing in existing_targets.values() {
        register_target_aliases(&mut targets_by_alias, existing);
    }

    for bundle in mod_bundles {
        let planned_target = if let Some(unique_id) = bundle.unique_id.as_deref() {
            if let Some(existing) = existing_targets.get(&normalize_unique_id(unique_id)) {
                PlannedTarget {
                    mod_name: existing.mod_name.clone(),
                    unique_id: existing.unique_id.clone(),
                    version: bundle.version.clone(),
                    folder_name: existing.folder_name.clone(),
                    target_path: existing.target_path.clone(),
                }
            } else {
                let target_path = resolve_new_target_path(mods_path, &bundle.folder_name);
                PlannedTarget {
                    mod_name: bundle.mod_name.clone(),
                    unique_id: bundle.unique_id.clone(),
                    version: bundle.version.clone(),
                    folder_name: target_path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or(&bundle.folder_name)
                        .to_string(),
                    target_path,
                }
            }
        } else {
            let target_path = resolve_new_target_path(mods_path, &bundle.folder_name);
            PlannedTarget {
                mod_name: bundle.mod_name.clone(),
                unique_id: bundle.unique_id.clone(),
                version: bundle.version.clone(),
                folder_name: target_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or(&bundle.folder_name)
                    .to_string(),
                target_path,
            }
        };

        if let Some(unique_id) = planned_target.unique_id.as_deref() {
            if !planned_unique_ids.insert(normalize_unique_id(unique_id)) {
                return Err(format!(
                    "The bundle contains multiple install targets for unique ID {}.",
                    unique_id
                ));
            }
        }
        register_target_aliases(&mut targets_by_alias, &planned_target);

        let exists_before = planned_target.target_path.exists();
        operations.push(if exists_before {
            InstallOperation::UpgradeReplace {
                bundle,
                target: planned_target,
            }
        } else {
            InstallOperation::FreshInstall {
                bundle,
                target: planned_target,
            }
        });
    }

    let mut overlay_operations =
        discover_overlay_operations(bundle_root, &targets_by_alias, &operations)?;
    operations.append(&mut overlay_operations);
    Ok(operations)
}

fn discover_overlay_operations(
    bundle_root: &Path,
    targets_by_alias: &BTreeMap<String, Vec<PlannedTarget>>,
    mod_operations: &[InstallOperation],
) -> Result<Vec<InstallOperation>, String> {
    let mod_roots = mod_operations
        .iter()
        .filter_map(|operation| match operation {
            InstallOperation::FreshInstall { bundle, .. }
            | InstallOperation::UpgradeReplace { bundle, .. } => Some(bundle.root.clone()),
            InstallOperation::OverlayMerge { .. } => None,
        })
        .collect::<Vec<_>>();

    let mut roots = BTreeMap::<String, OverlayBundle>::new();
    for file_path in collect_relative_files(bundle_root)? {
        let absolute_path = bundle_root.join(&file_path);
        if mod_roots.iter().any(|root| absolute_path.starts_with(root)) {
            continue;
        }
        let components = file_path
            .components()
            .filter_map(component_to_string)
            .collect::<Vec<_>>();
        if components.len() < 2 {
            continue;
        }

        let mut matched_root = PathBuf::new();
        let mut matched_target = None;
        for segment in components.iter().take(components.len().saturating_sub(1)) {
            matched_root.push(segment);
            let normalized = normalize_alias(segment);
            let Some(targets) = targets_by_alias.get(&normalized) else {
                continue;
            };
            if targets.len() > 1 {
                return Err(format!(
                    "Overlay path {} matched multiple install targets.",
                    normalize_path(&absolute_path)
                ));
            }
            matched_target = targets.first().cloned();
            break;
        }

        let Some(target) = matched_target else {
            continue;
        };
        let overlay_root = bundle_root.join(&matched_root);
        let key = normalize_path(&overlay_root);
        roots.entry(key).or_insert_with(|| OverlayBundle {
            root: overlay_root,
            target,
        });
    }

    let mut operations = roots
        .into_values()
        .map(|bundle| InstallOperation::OverlayMerge { bundle })
        .collect::<Vec<_>>();
    operations.sort_by(|left, right| {
        left.target_path()
            .cmp(right.target_path())
            .then_with(|| left.operation_kind().cmp(right.operation_kind()))
    });
    Ok(operations)
}

fn execute_install_operation(
    operation: &InstallOperation,
    work_root: &Path,
    before_root: &Path,
    recorder: &mut BackupEntryRecorder,
) -> Result<InstallManagerInstalledMod, String> {
    match operation {
        InstallOperation::FreshInstall { bundle, target } => {
            let prepared_root = work_root.join("prepared");
            copy_tree(&bundle.root, &prepared_root)?;
            apply_replace_snapshot(&prepared_root, &target.target_path, before_root, recorder)?;
            Ok(InstallManagerInstalledMod {
                mod_name: target.mod_name.clone(),
                unique_id: target.unique_id.clone(),
                version: target.version.clone(),
                target_path: normalize_path(&target.target_path),
                preserved_config: false,
                preserved_i18n_files: 0,
            })
        }
        InstallOperation::UpgradeReplace { bundle, target } => {
            let prepared_root = work_root.join("prepared");
            copy_tree(&bundle.root, &prepared_root)?;
            let (preserved_config, preserved_i18n_files) =
                preserve_existing_files_for_upgrade(&target.target_path, &prepared_root)?;
            apply_replace_snapshot(&prepared_root, &target.target_path, before_root, recorder)?;
            Ok(InstallManagerInstalledMod {
                mod_name: target.mod_name.clone(),
                unique_id: target.unique_id.clone(),
                version: target.version.clone(),
                target_path: normalize_path(&target.target_path),
                preserved_config,
                preserved_i18n_files,
            })
        }
        InstallOperation::OverlayMerge { bundle } => {
            let target_root = &bundle.target.target_path;
            if !target_root.is_dir() {
                return Err(format!(
                    "Overlay target {} does not exist.",
                    normalize_path(target_root)
                ));
            }

            let mut merged_i18n_files = 0;
            for relative_path in collect_relative_files(&bundle.root)? {
                let source_path = bundle.root.join(&relative_path);
                let target_path = target_root.join(&relative_path);
                let normalized_relative = normalize_relative_path(&relative_path);

                if target_path.is_file() {
                    backup_existing_file(before_root, target_root, &relative_path, recorder)?;
                } else {
                    recorder.added_paths.insert(normalized_relative.clone());
                }

                if is_json_path(&relative_path) && target_path.is_file() {
                    let merged = merge_json_files_at_paths(
                        &target_path,
                        &source_path,
                        JsonMergePreference::IncomingWins,
                    )?;
                    write_json_file(&target_path, &merged)?;
                    if is_i18n_path(&relative_path) {
                        merged_i18n_files += 1;
                    }
                    continue;
                }

                copy_file(&source_path, &target_path)?;
                if is_i18n_path(&relative_path) {
                    merged_i18n_files += 1;
                }
            }

            Ok(InstallManagerInstalledMod {
                mod_name: bundle.target.mod_name.clone(),
                unique_id: bundle.target.unique_id.clone(),
                version: bundle.target.version.clone(),
                target_path: normalize_path(target_root),
                preserved_config: false,
                preserved_i18n_files: merged_i18n_files,
            })
        }
    }
}

fn preserve_existing_files_for_upgrade(
    existing_root: &Path,
    prepared_root: &Path,
) -> Result<(bool, usize), String> {
    let mut preserved_config = false;
    let existing_config = existing_root.join("config.json");
    let prepared_config = prepared_root.join("config.json");
    if existing_config.is_file() {
        preserved_config = true;
        if prepared_config.is_file() {
            let merged = merge_json_files_at_paths(
                &existing_config,
                &prepared_config,
                JsonMergePreference::ExistingWins,
            )?;
            write_json_file(&prepared_config, &merged)?;
        } else {
            copy_file(&existing_config, &prepared_config)?;
        }
    }

    let mut preserved_i18n_files = 0;
    let existing_i18n = existing_root.join("i18n");
    if existing_i18n.is_dir() {
        for relative_path in collect_relative_files(&existing_i18n)? {
            if !is_json_path(&relative_path) {
                continue;
            }
            let existing_path = existing_i18n.join(&relative_path);
            let prepared_path = prepared_root.join("i18n").join(&relative_path);
            if prepared_path.is_file() {
                let merged = merge_json_files_at_paths(
                    &existing_path,
                    &prepared_path,
                    JsonMergePreference::ExistingWins,
                )?;
                write_json_file(&prepared_path, &merged)?;
            } else {
                copy_file(&existing_path, &prepared_path)?;
            }
            preserved_i18n_files += 1;
        }
    }

    Ok((preserved_config, preserved_i18n_files))
}

fn apply_replace_snapshot(
    prepared_root: &Path,
    target_root: &Path,
    before_root: &Path,
    recorder: &mut BackupEntryRecorder,
) -> Result<(), String> {
    let existing_files = if target_root.is_dir() {
        collect_relative_files(target_root)?
    } else {
        Vec::new()
    };
    let new_files = collect_relative_files(prepared_root)?;
    let new_file_set = new_files
        .iter()
        .map(|path| normalize_relative_path(path))
        .collect::<BTreeSet<_>>();

    for relative_path in &existing_files {
        let normalized_relative = normalize_relative_path(relative_path);
        if !new_file_set.contains(&normalized_relative) {
            backup_existing_file(before_root, target_root, relative_path, recorder)?;
            let target_path = target_root.join(relative_path);
            if target_path.is_file() {
                fs::remove_file(&target_path).map_err(|error| {
                    format!(
                        "Failed to remove stale target file {}: {error}",
                        normalize_path(&target_path)
                    )
                })?;
            }
            continue;
        }

        let existing_path = target_root.join(relative_path);
        let prepared_path = prepared_root.join(relative_path);
        if files_differ(&existing_path, &prepared_path)? {
            backup_existing_file(before_root, target_root, relative_path, recorder)?;
        }
    }
    cleanup_empty_tree(target_root)?;

    let existing_file_set = existing_files
        .iter()
        .map(|path| normalize_relative_path(path))
        .collect::<BTreeSet<_>>();
    for relative_path in new_files {
        let source_path = prepared_root.join(&relative_path);
        let target_path = target_root.join(&relative_path);
        let normalized_relative = normalize_relative_path(&relative_path);
        if !existing_file_set.contains(&normalized_relative) {
            recorder.added_paths.insert(normalized_relative.clone());
        }
        copy_file(&source_path, &target_path)?;
    }

    cleanup_empty_tree(target_root)?;
    Ok(())
}

fn backup_existing_file(
    before_root: &Path,
    target_root: &Path,
    relative_path: &Path,
    recorder: &mut BackupEntryRecorder,
) -> Result<(), String> {
    let normalized_relative = normalize_relative_path(relative_path);
    if !recorder.saved_paths.insert(normalized_relative.clone()) {
        return Ok(());
    }

    let source_path = target_root.join(relative_path);
    if !source_path.is_file() {
        return Ok(());
    }

    let backup_path = before_root.join(relative_path);
    if let Some(parent) = backup_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create backup parent {}: {error}",
                normalize_path(parent)
            )
        })?;
    }
    fs::copy(&source_path, &backup_path).map_err(|error| {
        format!(
            "Failed to back up file {} to {}: {error}",
            normalize_path(&source_path),
            normalize_path(&backup_path)
        )
    })?;
    Ok(())
}

fn load_existing_targets(mods_path: &Path) -> Result<BTreeMap<String, PlannedTarget>, String> {
    let scan = scan_library_at_path(mods_path)?;
    let mut targets = BTreeMap::new();
    for item in scan.mods {
        let Some(unique_id) = item.unique_id.as_deref() else {
            continue;
        };
        targets.insert(
            normalize_unique_id(unique_id),
            PlannedTarget {
                mod_name: item.name,
                unique_id: item.unique_id,
                version: item.version,
                folder_name: item.folder_name.trim_start_matches('.').to_string(),
                target_path: clean_input_path(&item.absolute_path),
            },
        );
    }
    Ok(targets)
}

fn build_mod_bundle(bundle_root: &Path, root: &Path) -> Result<ModBundle, String> {
    let manifest = read_json_file(&root.join("manifest.json"))?;
    let mod_name = project_name_from_manifest(&manifest, root);
    Ok(ModBundle {
        root: root.to_path_buf(),
        mod_name: mod_name.clone(),
        unique_id: string_field(&manifest, "UniqueID"),
        version: string_field(&manifest, "Version"),
        content_pack_for: content_pack_for_unique_id(&manifest),
        folder_name: install_folder_name_for_root(bundle_root, root, &mod_name),
    })
}

fn install_folder_name_for_root(bundle_root: &Path, root: &Path, mod_name: &str) -> String {
    if root == bundle_root {
        let sanitized = sanitize_file_name(mod_name).trim().to_string();
        if sanitized.is_empty() {
            "InstalledMod".to_string()
        } else {
            sanitized
        }
    } else {
        root.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("InstalledMod")
            .to_string()
    }
}

fn primary_install_priority(operation: &InstallOperation) -> PrimaryInstallPriority {
    match operation {
        InstallOperation::FreshInstall { bundle, .. }
        | InstallOperation::UpgradeReplace { bundle, .. } => {
            if bundle.content_pack_for.is_some() {
                PrimaryInstallPriority::ContentPack
            } else {
                PrimaryInstallPriority::DirectMod
            }
        }
        InstallOperation::OverlayMerge { .. } => PrimaryInstallPriority::OverlayOnly,
    }
}

fn resolve_new_target_path(mods_path: &Path, folder_name: &str) -> PathBuf {
    unique_path(&mods_path.join(folder_name))
}

fn register_target_aliases(
    aliases: &mut BTreeMap<String, Vec<PlannedTarget>>,
    target: &PlannedTarget,
) {
    for alias in [
        Some(target.mod_name.clone()),
        target.unique_id.clone(),
        Some(target.folder_name.clone()),
    ]
    .into_iter()
    .flatten()
    {
        let normalized = normalize_alias(&alias);
        if normalized.is_empty() {
            continue;
        }
        let targets = aliases.entry(normalized).or_default();
        if targets
            .iter()
            .any(|existing| existing.target_path == target.target_path)
        {
            continue;
        }
        targets.push(target.clone());
    }
}

fn merge_json_files_at_paths(
    existing_path: &Path,
    incoming_path: &Path,
    preference: JsonMergePreference,
) -> Result<Value, String> {
    let existing = read_json_file(existing_path)?;
    let incoming = read_json_file(incoming_path)?;
    Ok(merge_json_values(&existing, &incoming, preference))
}

fn merge_json_values(existing: &Value, incoming: &Value, preference: JsonMergePreference) -> Value {
    match (existing, incoming) {
        (Value::Object(existing_object), Value::Object(incoming_object)) => {
            let mut merged = Map::new();
            let keys = existing_object
                .keys()
                .chain(incoming_object.keys())
                .cloned()
                .collect::<BTreeSet<_>>();

            for key in keys.iter() {
                match (existing_object.get(key), incoming_object.get(key)) {
                    (Some(existing_value), Some(incoming_value)) => {
                        merged.insert(
                            key.clone(),
                            merge_json_values(existing_value, incoming_value, preference),
                        );
                    }
                    (Some(existing_value), None) => {
                        merged.insert(key.clone(), existing_value.clone());
                    }
                    (None, Some(incoming_value)) => {
                        merged.insert(key.clone(), incoming_value.clone());
                    }
                    (None, None) => {}
                }
            }

            Value::Object(merged)
        }
        _ => match preference {
            JsonMergePreference::ExistingWins => existing.clone(),
            JsonMergePreference::IncomingWins => incoming.clone(),
        },
    }
}

fn create_backup_session_dir(backup_root: &Path) -> Result<(String, PathBuf), String> {
    let backup_id = format!("install-{}", current_timestamp_ms());
    let backup_path = unique_path(&backup_root.join(&backup_id));
    fs::create_dir_all(&backup_path).map_err(|error| {
        format!(
            "Failed to create backup session directory {}: {error}",
            normalize_path(&backup_path)
        )
    })?;
    let backup_id = backup_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&backup_id)
        .to_string();
    Ok((backup_id, backup_path))
}

fn save_backup_metadata(path: &Path, metadata: &BackupSessionMetadata) -> Result<(), String> {
    let json = serde_json::to_string_pretty(metadata)
        .map_err(|error| format!("Failed to serialize backup metadata JSON: {error}"))?;
    fs::write(path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write backup metadata {}: {error}",
            normalize_path(path)
        )
    })?;
    Ok(())
}

fn load_backup_metadata(path: &Path) -> Result<BackupSessionMetadata, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "Failed to read backup metadata {}: {error}",
            normalize_path(path)
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        format!(
            "Backup metadata {} is invalid JSON: {error}",
            normalize_path(path)
        )
    })
}

fn copy_tree(source_root: &Path, target_root: &Path) -> Result<(), String> {
    for relative_path in collect_relative_files(source_root)? {
        let source_path = source_root.join(&relative_path);
        let target_path = target_root.join(&relative_path);
        copy_file(&source_path, &target_path)?;
    }
    Ok(())
}

fn copy_file(source_path: &Path, target_path: &Path) -> Result<(), String> {
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create target parent {}: {error}",
                normalize_path(parent)
            )
        })?;
    }
    fs::copy(source_path, target_path).map_err(|error| {
        format!(
            "Failed to copy file {} to {}: {error}",
            normalize_path(source_path),
            normalize_path(target_path)
        )
    })?;
    Ok(())
}

fn files_differ(left_path: &Path, right_path: &Path) -> Result<bool, String> {
    let left_bytes = fs::read(left_path)
        .map_err(|error| format!("Failed to read file {}: {error}", normalize_path(left_path)))?;
    let right_bytes = fs::read(right_path).map_err(|error| {
        format!(
            "Failed to read file {}: {error}",
            normalize_path(right_path)
        )
    })?;
    Ok(left_bytes != right_bytes)
}

fn collect_relative_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    collect_relative_files_recursive(root, root, &mut files)?;
    files.sort();
    Ok(files)
}

fn collect_relative_files_recursive(
    scan_root: &Path,
    current_dir: &Path,
    output: &mut Vec<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(current_dir).map_err(|error| {
        format!(
            "Failed to read directory {}: {error}",
            normalize_path(current_dir)
        )
    })? {
        let entry = entry.map_err(|error| format!("Failed to inspect directory entry: {error}"))?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_relative_files_recursive(scan_root, &entry_path, output)?;
            continue;
        }
        let relative_path = entry_path
            .strip_prefix(scan_root)
            .map_err(|error| format!("Failed to resolve relative path: {error}"))?;
        output.push(relative_path.to_path_buf());
    }
    Ok(())
}

fn cleanup_empty_tree(root: &Path) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }

    let mut directories = collect_directories(root)?;
    directories.sort_by(|left, right| right.components().count().cmp(&left.components().count()));
    for directory in directories {
        if directory == root {
            continue;
        }
        if directory.is_dir()
            && directory
                .read_dir()
                .map_err(|error| {
                    format!(
                        "Failed to inspect directory {}: {error}",
                        normalize_path(&directory)
                    )
                })?
                .next()
                .is_none()
        {
            let _ = fs::remove_dir(&directory);
        }
    }

    Ok(())
}

fn cleanup_empty_parents(root: &Path, mut current: Option<&Path>) {
    while let Some(path) = current {
        if path == root || !path.is_dir() {
            break;
        }
        let is_empty = path
            .read_dir()
            .ok()
            .is_some_and(|mut entries| entries.next().is_none());
        if !is_empty {
            break;
        }
        let next = path.parent();
        let _ = fs::remove_dir(path);
        current = next;
    }
}

fn collect_directories(root: &Path) -> Result<Vec<PathBuf>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut directories = vec![root.to_path_buf()];
    collect_directories_recursive(root, &mut directories)?;
    Ok(directories)
}

fn collect_directories_recursive(root: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(root)
        .map_err(|error| format!("Failed to read directory {}: {error}", normalize_path(root)))?
    {
        let entry = entry.map_err(|error| format!("Failed to inspect directory entry: {error}"))?;
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        output.push(entry_path.clone());
        collect_directories_recursive(&entry_path, output)?;
    }
    Ok(())
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Failed to serialize merged JSON: {error}"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create JSON parent {}: {error}",
                normalize_path(parent)
            )
        })?;
    }
    fs::write(path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write JSON file {}: {error}",
            normalize_path(path)
        )
    })?;
    Ok(())
}

fn is_json_path(relative_path: &Path) -> bool {
    relative_path.extension().and_then(|value| value.to_str()) == Some("json")
}

fn is_i18n_path(relative_path: &Path) -> bool {
    relative_path
        .components()
        .next()
        .and_then(component_to_string)
        .is_some_and(|value| value.eq_ignore_ascii_case("i18n"))
}

fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn component_to_string(component: Component<'_>) -> Option<String> {
    match component {
        Component::Normal(value) => value.to_str().map(ToOwned::to_owned),
        _ => None,
    }
}

fn normalize_alias(value: &str) -> String {
    normalize_unique_id(value.trim_start_matches('.'))
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn temp_work_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("modforge-{name}-{unique}"))
}

impl InstallOperation {
    fn target_path(&self) -> &Path {
        match self {
            InstallOperation::FreshInstall { target, .. }
            | InstallOperation::UpgradeReplace { target, .. } => &target.target_path,
            InstallOperation::OverlayMerge { bundle } => &bundle.target.target_path,
        }
    }

    fn operation_kind(&self) -> &'static str {
        match self {
            InstallOperation::FreshInstall { .. } => "fresh",
            InstallOperation::UpgradeReplace { .. } => "upgrade",
            InstallOperation::OverlayMerge { .. } => "overlay",
        }
    }
}

#[cfg(test)]
#[path = "tests/install_manager_tests.rs"]
mod tests;
