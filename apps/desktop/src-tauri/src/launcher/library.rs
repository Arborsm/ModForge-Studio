use super::fs::{discover_project_roots, read_json_file};
use super::paths::{launcher_library_covers_path, launcher_library_path};
use super::types::{
    LauncherLibraryCover, LauncherLibraryCoversState, LauncherLibraryModSummary,
    LauncherLibraryPackPreset, LauncherLibraryScanResult, LauncherLibraryScopeMode,
    LauncherLibraryState, LauncherLibraryStorageFolder, ScanLauncherLibraryRequest,
    SetLauncherLibraryCoverRequest, SetLauncherModEnabledRequest, SetLauncherModEnabledResult,
    UNSORTED_STORAGE_FOLDER_ID, UNSORTED_STORAGE_FOLDER_NAME,
};
use crate::pathing::{clean_input_path, normalize_path};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
struct ScannedLauncherMod {
    project_path: PathBuf,
    manifest: Value,
    enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyLauncherLibraryLabel {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub mod_keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyLauncherLibraryLabelsState {
    pub labels: Vec<LegacyLauncherLibraryLabel>,
}

pub(crate) fn normalize_unique_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn normalize_library_state(state: LauncherLibraryState) -> LauncherLibraryState {
    let unsorted_key = normalize_unique_id(UNSORTED_STORAGE_FOLDER_ID);
    let mut seen_folder_ids = BTreeSet::new();
    let mut seen_folder_members = BTreeSet::new();
    let mut storage_folders = Vec::new();
    let mut has_unsorted_folder = false;

    for folder in state.storage_folders {
        let id = folder.id.trim();
        let name = folder.name.trim();
        if id.is_empty() || name.is_empty() {
            continue;
        }

        let normalized_id_key = normalize_unique_id(id);
        let id = if normalized_id_key == unsorted_key {
            has_unsorted_folder = true;
            UNSORTED_STORAGE_FOLDER_ID.to_string()
        } else {
            id.to_string()
        };
        if !seen_folder_ids.insert(normalize_unique_id(&id)) {
            continue;
        }

        let mut seen_folder_mods = BTreeSet::new();
        let mut mod_keys = Vec::new();
        for mod_key in folder.mod_keys {
            let mod_key = mod_key.trim();
            if mod_key.is_empty() {
                continue;
            }

            let normalized_mod_key = normalize_unique_id(mod_key);
            if !seen_folder_mods.insert(normalized_mod_key.clone()) {
                continue;
            }
            if !seen_folder_members.insert(normalized_mod_key) {
                continue;
            }

            mod_keys.push(mod_key.to_string());
        }

        storage_folders.push(LauncherLibraryStorageFolder {
            id: id.clone(),
            name: if id == UNSORTED_STORAGE_FOLDER_ID {
                UNSORTED_STORAGE_FOLDER_NAME.to_string()
            } else {
                name.to_string()
            },
            mod_keys,
        });
    }

    if !has_unsorted_folder {
        storage_folders.push(LauncherLibraryStorageFolder {
            id: UNSORTED_STORAGE_FOLDER_ID.to_string(),
            name: UNSORTED_STORAGE_FOLDER_NAME.to_string(),
            mod_keys: Vec::new(),
        });
    }

    let mut seen_pack_ids = BTreeSet::new();
    let mut pack_id_lookup = BTreeMap::new();
    let mut pack_presets = Vec::new();
    for pack in state.pack_presets {
        let id = pack.id.trim();
        let name = pack.name.trim();
        if id.is_empty() || name.is_empty() {
            continue;
        }

        let normalized_id = normalize_unique_id(id);
        if !seen_pack_ids.insert(normalized_id.clone()) {
            continue;
        }

        let mut seen_pack_mods = BTreeSet::new();
        let mod_keys = pack
            .mod_keys
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .filter(|value| seen_pack_mods.insert(normalize_unique_id(value)))
            .collect::<Vec<_>>();

        let id = id.to_string();
        pack_id_lookup.insert(normalized_id, id.clone());
        pack_presets.push(LauncherLibraryPackPreset {
            id,
            name: name.to_string(),
            mod_keys,
        });
    }

    let current_pack_id = state.current_pack_id.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        pack_id_lookup.get(&normalize_unique_id(value)).cloned()
    });

    LauncherLibraryState {
        storage_folders,
        pack_presets,
        current_pack_id,
        scope_mode: state.scope_mode,
    }
}

fn migrate_legacy_library_labels(legacy_state: LegacyLauncherLibraryLabelsState) -> LauncherLibraryState {
    let storage_folders = legacy_state
        .labels
        .into_iter()
        .filter(|label| !label.hidden)
        .map(|label| LauncherLibraryStorageFolder {
            id: label.id,
            name: label.name,
            mod_keys: label.mod_keys,
        })
        .collect::<Vec<_>>();

    normalize_library_state(LauncherLibraryState {
        storage_folders,
        pack_presets: Vec::new(),
        current_pack_id: None,
        scope_mode: LauncherLibraryScopeMode::All,
    })
}

fn normalize_library_covers(state: LauncherLibraryCoversState) -> LauncherLibraryCoversState {
    let mut seen = BTreeSet::new();

    LauncherLibraryCoversState {
        covers: state
            .covers
            .into_iter()
            .filter_map(|cover| {
                let label_key = cover.label_key.trim().to_string();
                let image_path = cover.image_path.trim().to_string();
                if label_key.is_empty() || image_path.is_empty() {
                    return None;
                }

                let normalized_key = normalize_unique_id(&label_key);
                if !seen.insert(normalized_key) {
                    return None;
                }

                Some(LauncherLibraryCover {
                    label_key,
                    image_path: normalize_path(&clean_input_path(&image_path)),
                })
            })
            .collect(),
    }
}

pub(crate) fn load_or_create_library_state_at_path(
    state_path: &Path,
) -> Result<LauncherLibraryState, String> {
    if state_path.is_file() {
        let content = fs::read_to_string(state_path).map_err(|error| {
            format!(
                "Failed to read launcher library state {}: {error}",
                normalize_path(state_path)
            )
        })?;
        if let Ok(parsed) = serde_json::from_str::<LauncherLibraryState>(&content) {
            return Ok(normalize_library_state(parsed));
        }
        if let Ok(legacy_state) = serde_json::from_str::<LegacyLauncherLibraryLabelsState>(&content) {
            let migrated = migrate_legacy_library_labels(legacy_state);
            save_library_state_at_path(state_path, &migrated)?;
            return Ok(migrated);
        }

        return Err(format!(
            "Launcher library state {} is invalid JSON.",
            normalize_path(state_path)
        ));
    }

    let defaults = LauncherLibraryState::default();
    save_library_state_at_path(state_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_library_state_at_path(
    state_path: &Path,
    state: &LauncherLibraryState,
) -> Result<(), String> {
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher library directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_library_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize launcher library state JSON: {error}"))?;
    fs::write(state_path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher library state {}: {error}",
            normalize_path(state_path)
        )
    })?;
    Ok(())
}

pub(crate) fn load_or_create_library_covers_at_path(
    covers_path: &Path,
) -> Result<LauncherLibraryCoversState, String> {
    if covers_path.is_file() {
        let content = fs::read_to_string(covers_path).map_err(|error| {
            format!(
                "Failed to read launcher library covers {}: {error}",
                normalize_path(covers_path)
            )
        })?;
        let parsed: LauncherLibraryCoversState = serde_json::from_str(&content).map_err(|error| {
            format!(
                "Launcher library covers {} is invalid JSON: {error}",
                normalize_path(covers_path)
            )
        })?;
        return Ok(normalize_library_covers(parsed));
    }

    let defaults = LauncherLibraryCoversState { covers: Vec::new() };
    save_library_covers_at_path(covers_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_library_covers_at_path(
    covers_path: &Path,
    state: &LauncherLibraryCoversState,
) -> Result<(), String> {
    if let Some(parent) = covers_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher cover directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_library_covers(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize launcher cover JSON: {error}"))?;
    fs::write(covers_path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher cover state {}: {error}",
            normalize_path(covers_path)
        )
    })?;
    Ok(())
}

fn collect_scanned_projects(project_roots: Vec<PathBuf>) -> Vec<ScannedLauncherMod> {
    let mut projects = Vec::new();
    for project_path in project_roots {
        let manifest_path = project_path.join("manifest.json");
        let manifest = match read_json_file(&manifest_path) {
            Ok(manifest) => manifest,
            Err(error) => {
                log::debug!("{error}");
                continue;
            }
        };
        let enabled = !project_path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with('.'));
        projects.push(ScannedLauncherMod {
            project_path,
            manifest,
            enabled,
        });
    }

    projects
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn string_array_field(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
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

fn required_dependency_ids(manifest: &Value) -> Vec<String> {
    let mut dependencies = Vec::new();
    let mut seen = BTreeSet::new();

    for dependency in manifest
        .get("Dependencies")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(object) = dependency.as_object() else {
            continue;
        };
        if object.get("IsRequired").and_then(Value::as_bool) != Some(true) {
            continue;
        }
        let Some(unique_id) = object
            .get("UniqueID")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if seen.insert(normalize_unique_id(unique_id)) {
            dependencies.push(unique_id.to_string());
        }
    }

    dependencies
}

fn collect_available_enabled_mod_ids(projects: &[ScannedLauncherMod]) -> BTreeSet<String> {
    let mut available = BTreeSet::new();
    for project in projects {
        if !project.enabled {
            continue;
        }
        let Some(unique_id) = string_field(&project.manifest, "UniqueID") else {
            continue;
        };
        available.insert(normalize_unique_id(&unique_id));
    }
    available
}

fn extract_nexus_mod_id(update_keys: &[String]) -> Option<i64> {
    update_keys.iter().find_map(|item| {
        let (provider, value) = item.split_once(':')?;
        if !provider.eq_ignore_ascii_case("Nexus") {
            return None;
        }
        value.trim().parse::<i64>().ok().filter(|mod_id| *mod_id > 0)
    })
}

fn build_mod_page_url(mod_id: i64) -> String {
    format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}")
}

fn build_mod_summary(
    project: &ScannedLauncherMod,
    available_enabled_mod_ids: &BTreeSet<String>,
) -> LauncherLibraryModSummary {
    let folder_name = project
        .project_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let update_keys = string_array_field(&project.manifest, "UpdateKeys");
    let nexus_mod_id = extract_nexus_mod_id(&update_keys);
    let missing_required_dependencies = required_dependency_ids(&project.manifest)
        .into_iter()
        .filter(|dependency| !available_enabled_mod_ids.contains(&normalize_unique_id(dependency)))
        .collect::<Vec<_>>();

    LauncherLibraryModSummary {
        id: normalize_path(&project.project_path).replace('\\', "/"),
        label_key: string_field(&project.manifest, "UniqueID")
            .unwrap_or_else(|| folder_name.trim_start_matches('.').to_string()),
        name: project_name_from_manifest(&project.manifest, &project.project_path),
        author: string_field(&project.manifest, "Author"),
        version: string_field(&project.manifest, "Version"),
        description: string_field(&project.manifest, "Description"),
        unique_id: string_field(&project.manifest, "UniqueID"),
        folder_name,
        absolute_path: normalize_path(&project.project_path),
        enabled: project.enabled,
        nexus_mod_id,
        update_keys,
        mod_url: nexus_mod_id.map(build_mod_page_url),
        image_url: None,
        missing_required_dependencies,
    }
}

pub(crate) fn scan_library_at_path(path: &Path) -> Result<LauncherLibraryScanResult, String> {
    let scan_root = if path.join("Mods").is_dir() {
        path.join("Mods")
    } else {
        path.to_path_buf()
    };
    let project_roots = discover_project_roots(path)?;
    let scanned_projects = collect_scanned_projects(project_roots);
    let available_enabled_mod_ids = collect_available_enabled_mod_ids(&scanned_projects);
    let mut mods = scanned_projects
        .iter()
        .map(|project| build_mod_summary(project, &available_enabled_mod_ids))
        .collect::<Vec<_>>();
    mods.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.absolute_path.cmp(&right.absolute_path))
    });

    Ok(LauncherLibraryScanResult {
        mods_path: normalize_path(&scan_root),
        mods,
    })
}

fn set_mod_enabled_at_path(
    current_path: &Path,
    enabled: bool,
) -> Result<SetLauncherModEnabledResult, String> {
    if !current_path.is_dir() {
        return Err(format!(
            "Launcher mod path {} does not exist.",
            normalize_path(current_path)
        ));
    }
    let current_name = current_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Unable to resolve launcher mod folder name.".to_string())?;
    let parent = current_path
        .parent()
        .ok_or_else(|| "Unable to resolve launcher mod parent folder.".to_string())?;
    let is_enabled = !current_name.starts_with('.');
    if is_enabled == enabled {
        return Ok(SetLauncherModEnabledResult {
            absolute_path: normalize_path(current_path),
            enabled,
        });
    }

    let next_name = if enabled {
        current_name.trim_start_matches('.').to_string()
    } else {
        format!(".{current_name}")
    };
    let next_path = parent.join(next_name);
    if next_path.exists() {
        return Err(format!(
            "Cannot rename launcher mod to {} because that path already exists.",
            normalize_path(&next_path)
        ));
    }

    fs::rename(current_path, &next_path).map_err(|error| {
        format!(
            "Failed to toggle launcher mod {}: {error}",
            normalize_path(current_path)
        )
    })?;

    Ok(SetLauncherModEnabledResult {
        absolute_path: normalize_path(&next_path),
        enabled,
    })
}

#[tauri::command]
pub fn load_launcher_library_state(app: tauri::AppHandle) -> Result<LauncherLibraryState, String> {
    let state_path = launcher_library_path(&app)?;
    load_or_create_library_state_at_path(&state_path)
}

#[tauri::command]
pub fn save_launcher_library_state(
    app: tauri::AppHandle,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    let state_path = launcher_library_path(&app)?;
    let normalized = normalize_library_state(request);
    save_library_state_at_path(&state_path, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn load_launcher_library_covers(
    app: tauri::AppHandle,
) -> Result<LauncherLibraryCoversState, String> {
    let covers_path = launcher_library_covers_path(&app)?;
    load_or_create_library_covers_at_path(&covers_path)
}

#[tauri::command]
pub fn set_launcher_library_cover(
    app: tauri::AppHandle,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    let label_key = request.label_key.trim();
    if label_key.is_empty() {
        return Err("labelKey is required.".to_string());
    }

    let covers_path = launcher_library_covers_path(&app)?;
    let current = load_or_create_library_covers_at_path(&covers_path)?;
    let normalized_key = normalize_unique_id(label_key);
    let mut covers = current
        .covers
        .into_iter()
        .filter(|cover| normalize_unique_id(&cover.label_key) != normalized_key)
        .collect::<Vec<_>>();

    if let Some(image_path) = request
        .image_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let image_path = clean_input_path(image_path);
        if !image_path.is_file() {
            return Err(format!(
                "Launcher cover image {} does not exist.",
                normalize_path(&image_path)
            ));
        }
        covers.push(LauncherLibraryCover {
            label_key: label_key.to_string(),
            image_path: normalize_path(&image_path),
        });
    }

    let normalized = normalize_library_covers(LauncherLibraryCoversState { covers });
    save_library_covers_at_path(&covers_path, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
pub fn scan_launcher_library(
    app: tauri::AppHandle,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    let mods_path = request.mods_path.trim();
    if mods_path.is_empty() {
        return Err("modsPath is required.".to_string());
    }

    let mut scan = scan_library_at_path(&clean_input_path(mods_path))?;
    let covers_path = launcher_library_covers_path(&app)?;
    let covers = load_or_create_library_covers_at_path(&covers_path)?;
    let cover_map = covers
        .covers
        .into_iter()
        .filter_map(|cover| {
            let image_path = clean_input_path(&cover.image_path);
            if !image_path.is_file() {
                return None;
            }
            Some((
                normalize_unique_id(&cover.label_key),
                normalize_path(&image_path),
            ))
        })
        .collect::<BTreeMap<_, _>>();

    for mod_summary in &mut scan.mods {
        mod_summary.image_url = cover_map
            .get(&normalize_unique_id(&mod_summary.label_key))
            .cloned();
    }

    Ok(scan)
}

#[tauri::command]
pub fn set_launcher_mod_enabled(
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    let mod_path = request.mod_path.trim();
    if mod_path.is_empty() {
        return Err("modPath is required.".to_string());
    }

    set_mod_enabled_at_path(&clean_input_path(mod_path), request.enabled)
}
