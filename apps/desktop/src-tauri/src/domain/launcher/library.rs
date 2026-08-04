use super::fs::{discover_project_roots, read_json_file};
use super::image_cache::resolve_launcher_image_blocking;
use super::paths::{
    launcher_library_covers_path, launcher_library_path, launcher_settings_path,
    launcher_updates_cache_path,
};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    LauncherLibraryChildModGroup, LauncherLibraryCover, LauncherLibraryCoversState,
    LauncherLibraryDependency, LauncherLibraryFolder, LauncherLibraryModSummary,
    LauncherLibraryPackPreset, LauncherLibraryScanResult, LauncherLibraryState,
    LauncherLibraryStorageFolder, PersistLauncherLibraryRemoteCoverRequest,
    ResolveLauncherImageRequest, ScanLauncherLibraryRequest, SetLauncherLibraryCoverRequest,
    SetLauncherModEnabledRequest, SetLauncherModEnabledResult, UNSORTED_STORAGE_FOLDER_ID,
    UNSORTED_STORAGE_FOLDER_NAME,
};
use super::update_cache::invalidate_launcher_updates_cache_at_path;
use super::updates::resolve_smapi_runtime_versions;
use super::versions::version_is_newer;
use crate::AppHandle;
use crate::domain::manifest::{
    manifest_dependencies, normalize_unique_id, project_name_from_manifest,
    required_dependency_ids, string_array_field, string_field,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

static LAUNCHER_LIBRARY_COVERS_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_launcher_library_covers_files() -> MutexGuard<'static, ()> {
    match LAUNCHER_LIBRARY_COVERS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            LogEvent::new("launcher.lock.poisoned")
                .field("resource", "library-covers-file")
                .emit_error(targets::LAUNCHER);
            poisoned.into_inner()
        }
    }
}

#[derive(Debug, Clone)]
struct ScannedLauncherMod {
    project_path: PathBuf,
    manifest: Value,
    enabled: bool,
}

fn json_file_has_config_schema(path: &Path) -> bool {
    match read_json_file(path) {
        Ok(Value::Object(root)) => root
            .get("ConfigSchema")
            .and_then(Value::as_object)
            .is_some_and(|schema| !schema.is_empty()),
        _ => false,
    }
}

fn has_launcher_mod_config(root: &Path, manifest: &Value) -> bool {
    if root.join("config.json").is_file() || root.join("assets").join("options.json").is_file() {
        return true;
    }

    if manifest
        .get("ConfigSchema")
        .and_then(Value::as_object)
        .is_some_and(|schema| !schema.is_empty())
    {
        return true;
    }

    json_file_has_config_schema(&root.join("content.json"))
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
            folder_classification_mode: pack.folder_classification_mode,
        });
    }

    let pack_mod_lookup = pack_presets
        .iter()
        .map(|pack| {
            (
                normalize_unique_id(&pack.id),
                pack.mod_keys
                    .iter()
                    .map(|value| normalize_unique_id(value))
                    .collect::<BTreeSet<_>>(),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let current_pack_id = state.current_pack_id.and_then(|value| {
        let value = value.trim();
        if value.is_empty() {
            return None;
        }
        pack_id_lookup.get(&normalize_unique_id(value)).cloned()
    });

    let mut seen_hidden_mod_keys = BTreeSet::new();
    let hidden_mod_keys = state
        .hidden_mod_keys
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| seen_hidden_mod_keys.insert(normalize_unique_id(value)))
        .collect::<Vec<_>>();

    let mut globally_seen_child_keys = BTreeSet::new();
    let mut child_mod_groups = Vec::new();
    for group in state.child_mod_groups {
        let parent_mod_key = group.parent_mod_key.trim().to_string();
        if parent_mod_key.is_empty() {
            continue;
        }

        let parent_lookup = normalize_unique_id(&parent_mod_key);
        let mut seen_group_child_keys = BTreeSet::new();
        let child_mod_keys = group
            .child_mod_keys
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .filter(|value| normalize_unique_id(value) != parent_lookup)
            .filter(|value| seen_group_child_keys.insert(normalize_unique_id(value)))
            .filter(|value| globally_seen_child_keys.insert(normalize_unique_id(value)))
            .collect::<Vec<_>>();

        if child_mod_keys.is_empty() {
            continue;
        }

        child_mod_groups.push(LauncherLibraryChildModGroup {
            parent_mod_key,
            child_mod_keys,
        });
    }

    let mut seen_library_folder_ids = BTreeSet::new();
    let mut folder_id_lookup = BTreeMap::new();
    let mut raw_library_folders = Vec::new();
    for folder in state.library_folders {
        let id = folder.id.trim().to_string();
        let name = folder.name.trim().to_string();
        if id.is_empty() || name.is_empty() {
            continue;
        }
        let id_lookup = normalize_unique_id(&id);
        if !seen_library_folder_ids.insert(id_lookup.clone()) {
            continue;
        }
        let pack_id = folder.pack_id.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }
            pack_id_lookup.get(&normalize_unique_id(trimmed)).cloned()
        });
        let hidden = pack_id.is_none() && folder.hidden;
        folder_id_lookup.insert(id_lookup, (id.clone(), pack_id.clone()));
        raw_library_folders.push(LauncherLibraryFolder {
            id,
            name,
            pack_id,
            hidden,
            parent_folder_id: folder
                .parent_folder_id
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            mod_keys: folder.mod_keys,
            cover_mod_keys: folder.cover_mod_keys,
        });
    }

    let mut seen_library_folder_mods_by_scope = BTreeMap::<String, BTreeSet<String>>::new();
    let mut parent_lookup = BTreeMap::new();
    let mut library_folders = raw_library_folders
        .into_iter()
        .map(|folder| {
            let folder_lookup = normalize_unique_id(&folder.id);
            let folder_scope = folder
                .pack_id
                .as_ref()
                .map(|pack_id| format!("pack:{}", normalize_unique_id(pack_id)))
                .unwrap_or_else(|| "global".to_string());
            let parent_folder_id = folder.parent_folder_id.and_then(|parent_id| {
                let parent_lookup = normalize_unique_id(&parent_id);
                if parent_lookup == folder_lookup {
                    return None;
                }
                folder_id_lookup
                    .get(&parent_lookup)
                    .and_then(|(parent_id, parent_pack_id)| {
                        let parent_scope = parent_pack_id
                            .as_ref()
                            .map(|pack_id| format!("pack:{}", normalize_unique_id(pack_id)))
                            .unwrap_or_else(|| "global".to_string());
                        if parent_scope == folder_scope {
                            Some(parent_id.clone())
                        } else {
                            None
                        }
                    })
            });
            parent_lookup.insert(folder_lookup, parent_folder_id.clone());
            let pack_members = folder
                .pack_id
                .as_ref()
                .and_then(|pack_id| pack_mod_lookup.get(&normalize_unique_id(pack_id)));
            let seen_library_folder_mods = seen_library_folder_mods_by_scope
                .entry(folder_scope)
                .or_default();

            let mut seen_folder_mods = BTreeSet::new();
            let mod_keys = folder
                .mod_keys
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .filter(|value| seen_folder_mods.insert(normalize_unique_id(value)))
                .filter(|value| seen_library_folder_mods.insert(normalize_unique_id(value)))
                .filter(|value| {
                    pack_members
                        .map(|members| members.contains(&normalize_unique_id(value)))
                        .unwrap_or(true)
                })
                .collect::<Vec<_>>();

            let mut seen_cover_mods = BTreeSet::new();
            let cover_mod_keys = folder
                .cover_mod_keys
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .filter(|value| seen_cover_mods.insert(normalize_unique_id(value)))
                .filter(|value| {
                    pack_members
                        .map(|members| members.contains(&normalize_unique_id(value)))
                        .unwrap_or(true)
                })
                .collect::<Vec<_>>();

            LauncherLibraryFolder {
                id: folder.id,
                name: folder.name,
                hidden: folder.pack_id.is_none() && folder.hidden,
                pack_id: folder.pack_id,
                parent_folder_id,
                mod_keys,
                cover_mod_keys,
            }
        })
        .collect::<Vec<_>>();

    let creates_cycle = |folder_id: &str, parent_folder_id: Option<&str>| {
        let folder_lookup = normalize_unique_id(folder_id);
        let mut current_parent_id = parent_folder_id.map(|value| value.to_string());
        let mut visited = BTreeSet::new();
        while let Some(parent_id) = current_parent_id {
            let parent_lookup_key = normalize_unique_id(&parent_id);
            if parent_lookup_key == folder_lookup || !visited.insert(parent_lookup_key.clone()) {
                return true;
            }
            current_parent_id = parent_lookup
                .get(&parent_lookup_key)
                .and_then(|value| value.clone());
        }
        false
    };

    for folder in &mut library_folders {
        if creates_cycle(&folder.id, folder.parent_folder_id.as_deref()) {
            folder.parent_folder_id = None;
        }
        let mod_lookup = folder
            .mod_keys
            .iter()
            .map(|value| normalize_unique_id(value))
            .collect::<BTreeSet<_>>();
        folder
            .cover_mod_keys
            .retain(|value| mod_lookup.contains(&normalize_unique_id(value)));
    }

    let custom_orders =
        normalize_custom_orders(state.custom_orders, &pack_id_lookup, &library_folders);

    LauncherLibraryState {
        storage_folders,
        hidden_mod_keys,
        pack_presets,
        child_mod_groups,
        library_folders,
        custom_orders,
        current_pack_id,
        scope_mode: state.scope_mode,
    }
}

fn normalize_custom_orders(
    custom_orders: BTreeMap<String, Vec<String>>,
    pack_id_lookup: &BTreeMap<String, String>,
    library_folders: &[LauncherLibraryFolder],
) -> BTreeMap<String, Vec<String>> {
    let folder_id_lookup = library_folders
        .iter()
        .map(|folder| (normalize_unique_id(&folder.id), folder.id.clone()))
        .collect::<BTreeMap<_, _>>();
    let root_folder_ids = library_folders
        .iter()
        .filter(|folder| folder.parent_folder_id.is_none())
        .map(|folder| normalize_unique_id(&folder.id))
        .collect::<BTreeSet<_>>();
    let folder_item_lookup = library_folders
        .iter()
        .map(|folder| {
            let mut valid_items = folder
                .mod_keys
                .iter()
                .map(|value| format!("m:{}", value.trim()))
                .map(|value| normalize_unique_id(&value))
                .collect::<BTreeSet<_>>();
            valid_items.extend(
                library_folders
                    .iter()
                    .filter(|candidate| {
                        candidate
                            .parent_folder_id
                            .as_deref()
                            .is_some_and(|parent_id| {
                                normalize_unique_id(parent_id) == normalize_unique_id(&folder.id)
                            })
                    })
                    .map(|candidate| normalize_unique_id(&format!("f:{}", candidate.id))),
            );
            (normalize_unique_id(&folder.id), valid_items)
        })
        .collect::<BTreeMap<_, _>>();

    let mut normalized = BTreeMap::new();
    for (container_key, order) in custom_orders {
        let Some(canonical_container_key) =
            normalize_custom_order_container_key(&container_key, pack_id_lookup, &folder_id_lookup)
        else {
            continue;
        };
        let is_view_container = canonical_container_key.starts_with("view:");
        let valid_folder_items = canonical_container_key
            .strip_prefix("folder:")
            .and_then(|folder_id| folder_item_lookup.get(&normalize_unique_id(folder_id)));
        let mut seen = BTreeSet::new();
        let mut normalized_order = Vec::new();
        for item_key in order {
            let Some(canonical_item_key) =
                normalize_custom_order_item_key(&item_key, &folder_id_lookup)
            else {
                continue;
            };
            let normalized_item_key = normalize_unique_id(&canonical_item_key);
            if is_view_container
                && canonical_item_key.starts_with("f:")
                && !root_folder_ids.contains(&normalize_unique_id(
                    canonical_item_key.trim_start_matches("f:"),
                ))
            {
                continue;
            }
            if valid_folder_items.is_some_and(|items| !items.contains(&normalized_item_key)) {
                continue;
            }
            if seen.insert(normalized_item_key) {
                normalized_order.push(canonical_item_key);
            }
        }

        if !normalized_order.is_empty() {
            normalized.insert(canonical_container_key, normalized_order);
        }
    }
    normalized
}

fn normalize_custom_order_container_key(
    container_key: &str,
    pack_id_lookup: &BTreeMap<String, String>,
    folder_id_lookup: &BTreeMap<String, String>,
) -> Option<String> {
    let container_key = container_key.trim();
    if container_key == "view:all" || container_key == "view:hidden" {
        return Some(container_key.to_string());
    }
    if let Some(pack_id) = container_key.strip_prefix("view:pack:") {
        return pack_id_lookup
            .get(&normalize_unique_id(pack_id.trim()))
            .map(|id| format!("view:pack:{id}"));
    }
    if let Some(folder_id) = container_key.strip_prefix("folder:") {
        return folder_id_lookup
            .get(&normalize_unique_id(folder_id.trim()))
            .map(|id| format!("folder:{id}"));
    }
    None
}

fn normalize_custom_order_item_key(
    item_key: &str,
    folder_id_lookup: &BTreeMap<String, String>,
) -> Option<String> {
    let item_key = item_key.trim();
    let (kind, value) = item_key.split_once(':')?;
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    match kind {
        "f" => {
            let normalized_folder_id = normalize_unique_id(value);
            folder_id_lookup
                .get(&normalized_folder_id)
                .map(|id| format!("f:{id}"))
        }
        "m" => Some(format!("m:{value}")),
        _ => None,
    }
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

fn prune_missing_library_covers(state: LauncherLibraryCoversState) -> LauncherLibraryCoversState {
    LauncherLibraryCoversState {
        covers: state
            .covers
            .into_iter()
            .filter(|cover| clean_input_path(&cover.image_path).is_file())
            .collect(),
    }
}

pub(crate) fn load_or_create_library_state_at_path(
    state_path: &Path,
) -> anyhow::Result<LauncherLibraryState> {
    if state_path.is_file() {
        let content = read_text_file(state_path).with_context(|| {
            format!(
                "Failed to read launcher library state {}",
                normalize_path(state_path)
            )
        })?;
        if let Ok(parsed) = serde_json::from_str::<LauncherLibraryState>(&content) {
            return Ok(normalize_library_state(parsed));
        }
        bail!(
            "Launcher library state {} is invalid JSON.",
            normalize_path(state_path)
        );
    }

    let defaults = LauncherLibraryState::default();
    save_library_state_at_path(state_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_library_state_at_path(
    state_path: &Path,
    state: &LauncherLibraryState,
) -> anyhow::Result<()> {
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create launcher library directory {}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_library_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize launcher library state JSON"))?;
    fs::write(state_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher library state {}",
            normalize_path(state_path)
        )
    })?;
    Ok(())
}

pub(crate) fn load_or_create_library_covers_at_path(
    covers_path: &Path,
) -> anyhow::Result<LauncherLibraryCoversState> {
    let _covers_file_guard = lock_launcher_library_covers_files();
    load_or_create_library_covers_at_path_unlocked(covers_path)
}

fn load_or_create_library_covers_at_path_unlocked(
    covers_path: &Path,
) -> anyhow::Result<LauncherLibraryCoversState> {
    if covers_path.is_file() {
        let content = read_text_file(covers_path).with_context(|| {
            format!(
                "Failed to read launcher library covers {}",
                normalize_path(covers_path)
            )
        })?;
        let parsed: LauncherLibraryCoversState =
            serde_json::from_str(&content).with_context(|| {
                format!(
                    "Launcher library covers {} is invalid JSON",
                    normalize_path(covers_path)
                )
            })?;
        let normalized = normalize_library_covers(parsed);
        let pruned = prune_missing_library_covers(normalized.clone());
        if pruned != normalized {
            save_library_covers_at_path_unlocked(covers_path, &pruned)?;
        }
        return Ok(pruned);
    }

    let defaults = LauncherLibraryCoversState { covers: Vec::new() };
    save_library_covers_at_path_unlocked(covers_path, &defaults)?;
    Ok(defaults)
}

fn save_library_covers_at_path_unlocked(
    covers_path: &Path,
    state: &LauncherLibraryCoversState,
) -> anyhow::Result<()> {
    if let Some(parent) = covers_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create launcher cover directory {}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_library_covers(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize launcher cover JSON"))?;
    fs::write(covers_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher cover state {}",
            normalize_path(covers_path)
        )
    })?;
    Ok(())
}

pub(crate) fn persist_auto_library_cover_at_path(
    covers_path: &Path,
    label_key: &str,
    image_path: &Path,
) -> anyhow::Result<LauncherLibraryCoversState> {
    let label_key = label_key.trim();
    if label_key.is_empty() {
        bail!("labelKey is required.");
    }
    if !image_path.is_file() {
        bail!(
            "Launcher cover image {} does not exist.",
            normalize_path(image_path)
        );
    }

    let _covers_file_guard = lock_launcher_library_covers_files();
    let current = load_or_create_library_covers_at_path_unlocked(covers_path)?;
    let normalized_key = normalize_unique_id(label_key);
    if current
        .covers
        .iter()
        .any(|cover| normalize_unique_id(&cover.label_key) == normalized_key)
    {
        return Ok(current);
    }

    let mut covers = current.covers;
    covers.push(LauncherLibraryCover {
        label_key: label_key.to_string(),
        image_path: normalize_path(image_path),
    });

    let normalized = normalize_library_covers(LauncherLibraryCoversState { covers });
    save_library_covers_at_path_unlocked(covers_path, &normalized)?;
    Ok(normalized)
}

fn collect_scanned_projects(project_roots: Vec<PathBuf>) -> Vec<ScannedLauncherMod> {
    let mut projects = Vec::new();
    for project_path in project_roots {
        let manifest_path = project_path.join("manifest.json");
        let manifest = match read_json_file(&manifest_path) {
            Ok(manifest) => manifest,
            Err(error) => {
                LogEvent::new("launcher.library.manifestUnreadable")
                    .path("manifestPath", &manifest_path)
                    .error(format!("{error}"))
                    .emit_debug(targets::LAUNCHER);
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

#[derive(Debug, Clone)]
struct DependencyHealthNode {
    enabled: bool,
    required_dependencies: Vec<String>,
}

fn build_dependency_health_graph(
    projects: &[ScannedLauncherMod],
) -> BTreeMap<String, DependencyHealthNode> {
    let mut graph = BTreeMap::new();
    for project in projects {
        let Some(unique_id) = string_field(&project.manifest, "UniqueID") else {
            continue;
        };
        graph.insert(
            normalize_unique_id(&unique_id),
            DependencyHealthNode {
                enabled: project.enabled,
                required_dependencies: required_dependency_ids(&project.manifest),
            },
        );
    }
    graph
}

fn dependency_has_issue(
    dependency_id: &str,
    graph: &BTreeMap<String, DependencyHealthNode>,
    memo: &mut BTreeMap<String, bool>,
    visiting: &mut BTreeSet<String>,
) -> bool {
    let dependency_key = normalize_unique_id(dependency_id);
    if let Some(cached) = memo.get(&dependency_key) {
        return *cached;
    }
    if !visiting.insert(dependency_key.clone()) {
        return false;
    }

    let has_issue = match graph.get(&dependency_key) {
        None => true,
        Some(node) if !node.enabled => true,
        Some(node) => node.required_dependencies.iter().any(|child_dependency| {
            let child_key = normalize_unique_id(child_dependency);
            child_key != dependency_key
                && dependency_has_issue(child_dependency, graph, memo, visiting)
        }),
    };

    visiting.remove(&dependency_key);
    memo.insert(dependency_key, has_issue);
    has_issue
}

fn missing_required_dependencies_for_project(
    project: &ScannedLauncherMod,
    graph: &BTreeMap<String, DependencyHealthNode>,
) -> Vec<String> {
    let project_key = string_field(&project.manifest, "UniqueID")
        .map(|value| normalize_unique_id(&value))
        .unwrap_or_default();
    let mut memo = BTreeMap::new();
    required_dependency_ids(&project.manifest)
        .into_iter()
        .filter(|dependency| {
            let dependency_key = normalize_unique_id(dependency);
            dependency_key != project_key
                && dependency_has_issue(dependency, graph, &mut memo, &mut BTreeSet::new())
        })
        .collect()
}

fn extract_nexus_mod_id(update_keys: &[String]) -> Option<i64> {
    update_keys.iter().find_map(|item| {
        let (provider, value) = item.split_once(':')?;
        if !provider.eq_ignore_ascii_case("Nexus") {
            return None;
        }
        value
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|mod_id| *mod_id > 0)
    })
}

fn build_mod_page_url(mod_id: i64) -> String {
    format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}")
}

fn preferred_cover_label_key(
    nexus_mod_id: Option<i64>,
    unique_id: Option<&str>,
    folder_name: &str,
) -> String {
    nexus_mod_id
        .map(|value| value.to_string())
        .or_else(|| unique_id.map(ToOwned::to_owned))
        .unwrap_or_else(|| folder_name.trim_start_matches('.').to_string())
}

fn cover_lookup_keys(mod_summary: &LauncherLibraryModSummary) -> Vec<String> {
    let mut keys = Vec::new();
    let preferred = preferred_cover_label_key(
        mod_summary.nexus_mod_id,
        mod_summary.unique_id.as_deref(),
        &mod_summary.folder_name,
    );
    if !preferred.trim().is_empty() {
        keys.push(preferred);
    }
    if !mod_summary.label_key.trim().is_empty()
        && !keys
            .iter()
            .any(|value| normalize_unique_id(value) == normalize_unique_id(&mod_summary.label_key))
    {
        keys.push(mod_summary.label_key.clone());
    }
    if let Some(unique_id) = mod_summary.unique_id.as_deref() {
        if !unique_id.trim().is_empty()
            && !keys
                .iter()
                .any(|value| normalize_unique_id(value) == normalize_unique_id(unique_id))
        {
            keys.push(unique_id.to_string());
        }
    }
    keys
}

fn build_mod_summary(
    project: &ScannedLauncherMod,
    dependency_health_graph: &BTreeMap<String, DependencyHealthNode>,
) -> LauncherLibraryModSummary {
    let folder_name = project
        .project_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let update_keys = string_array_field(&project.manifest, "UpdateKeys");
    let nexus_mod_id = extract_nexus_mod_id(&update_keys);
    let dependencies = manifest_dependencies(&project.manifest)
        .into_iter()
        .map(|dependency| LauncherLibraryDependency {
            unique_id: dependency.unique_id,
            required: dependency.is_required,
        })
        .collect::<Vec<_>>();
    let required_dependencies = required_dependency_ids(&project.manifest);
    let missing_required_dependencies =
        missing_required_dependencies_for_project(project, dependency_health_graph);

    LauncherLibraryModSummary {
        id: normalize_path(&project.project_path).replace('\\', "/"),
        label_key: preferred_cover_label_key(
            nexus_mod_id,
            string_field(&project.manifest, "UniqueID").as_deref(),
            &folder_name,
        ),
        name: project_name_from_manifest(&project.manifest, &project.project_path),
        author: string_field(&project.manifest, "Author"),
        version: string_field(&project.manifest, "Version"),
        description: string_field(&project.manifest, "Description"),
        unique_id: string_field(&project.manifest, "UniqueID"),
        folder_name,
        absolute_path: normalize_path(&project.project_path),
        enabled: project.enabled,
        has_config: has_launcher_mod_config(&project.project_path, &project.manifest),
        nexus_mod_id,
        update_keys,
        mod_url: nexus_mod_id.map(build_mod_page_url),
        image_url: None,
        dependencies,
        required_dependencies,
        missing_required_dependencies,
        minimum_api_version: string_field(&project.manifest, "MinimumApiVersion"),
        requires_newer_smapi: false,
    }
}

/// Sets `requires_newer_smapi` on each summary by comparing the mod's parsed
/// `MinimumApiVersion` against the detected installed SMAPI version. Mods without
/// a `MinimumApiVersion` — or when no installed version was detected — keep `false`.
pub(crate) fn apply_smapi_requirement_flags(
    summaries: &mut [LauncherLibraryModSummary],
    installed_smapi_version: Option<&str>,
) {
    let Some(installed_smapi_version) = installed_smapi_version else {
        return;
    };
    for summary in summaries {
        let Some(minimum_api_version) = summary.minimum_api_version.as_deref() else {
            continue;
        };
        summary.requires_newer_smapi =
            version_is_newer(installed_smapi_version, minimum_api_version);
    }
}

pub(crate) fn scan_library_at_path(path: &Path) -> anyhow::Result<LauncherLibraryScanResult> {
    let scan_root = if path.join("Mods").is_dir() {
        path.join("Mods")
    } else {
        path.to_path_buf()
    };
    let project_roots = discover_project_roots(path)?;
    let scanned_projects = collect_scanned_projects(project_roots);
    let dependency_health_graph = build_dependency_health_graph(&scanned_projects);
    let mut mods = scanned_projects
        .iter()
        .map(|project| build_mod_summary(project, &dependency_health_graph))
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
) -> anyhow::Result<SetLauncherModEnabledResult> {
    log_launcher_trace("toggle.start", |event| {
        event.path("modPath", current_path).flag("enabled", enabled)
    });
    if !current_path.is_dir() {
        bail!(
            "Launcher mod path {} does not exist.",
            normalize_path(current_path)
        );
    }
    let current_name = current_path
        .file_name()
        .and_then(|value| value.to_str())
        .context("Unable to resolve launcher mod folder name.")?;
    let parent = current_path
        .parent()
        .context("Unable to resolve launcher mod parent folder.")?;
    let is_enabled = !current_name.starts_with('.');
    if is_enabled == enabled {
        log_launcher_trace("toggle.noop", |event| {
            event.path("modPath", current_path).flag("enabled", enabled)
        });
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
        bail!(
            "Cannot rename launcher mod to {} because that path already exists.",
            normalize_path(&next_path)
        );
    }

    fs::rename(current_path, &next_path).with_context(|| {
        format!(
            "Failed to toggle launcher mod {}",
            normalize_path(current_path)
        )
    })?;
    log_launcher_trace("toggle.complete", |event| {
        event
            .path("fromPath", current_path)
            .path("toPath", &next_path)
            .flag("enabled", enabled)
    });

    Ok(SetLauncherModEnabledResult {
        absolute_path: normalize_path(&next_path),
        enabled,
    })
}

pub fn load_launcher_library_state(_app: AppHandle) -> anyhow::Result<LauncherLibraryState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_library_state",
        (|| {
            let state_path = launcher_library_path()?;
            load_or_create_library_state_at_path(&state_path)
        })(),
    )
}

pub fn save_launcher_library_state(
    _app: AppHandle,
    request: LauncherLibraryState,
) -> anyhow::Result<LauncherLibraryState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_launcher_library_state",
        (|| {
            let state_path = launcher_library_path()?;
            let normalized = normalize_library_state(request);
            save_library_state_at_path(&state_path, &normalized)?;
            Ok(normalized)
        })(),
    )
}

pub fn load_launcher_library_covers(_app: AppHandle) -> anyhow::Result<LauncherLibraryCoversState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_library_covers",
        (|| {
            let covers_path = launcher_library_covers_path()?;
            load_or_create_library_covers_at_path(&covers_path)
        })(),
    )
}

pub fn set_launcher_library_cover(
    _app: AppHandle,
    request: SetLauncherLibraryCoverRequest,
) -> anyhow::Result<LauncherLibraryCoversState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "set_launcher_library_cover",
        (|| {
            let label_key = request.label_key.trim();
            if label_key.is_empty() {
                bail!("labelKey is required.");
            }

            let covers_path = launcher_library_covers_path()?;
            let _covers_file_guard = lock_launcher_library_covers_files();
            let current = load_or_create_library_covers_at_path_unlocked(&covers_path)?;
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
                    bail!(
                        "Launcher cover image {} does not exist.",
                        normalize_path(&image_path)
                    );
                }
                covers.push(LauncherLibraryCover {
                    label_key: label_key.to_string(),
                    image_path: normalize_path(&image_path),
                });
            }

            let normalized = normalize_library_covers(LauncherLibraryCoversState { covers });
            save_library_covers_at_path_unlocked(&covers_path, &normalized)?;
            Ok(normalized)
        })(),
    )
}

pub(crate) fn persist_launcher_library_remote_cover_blocking(
    app: &AppHandle,
    request: &PersistLauncherLibraryRemoteCoverRequest,
) -> anyhow::Result<LauncherLibraryCoversState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "persist_launcher_library_remote_cover",
        (|| {
            let label_key = request.label_key.trim();
            if label_key.is_empty() {
                bail!("labelKey is required.");
            }

            let image_url = request.image_url.trim();
            if image_url.is_empty() {
                bail!("imageUrl is required.");
            }

            let covers_path = launcher_library_covers_path()?;
            let current = load_or_create_library_covers_at_path(&covers_path)?;
            let normalized_key = normalize_unique_id(label_key);
            if current
                .covers
                .iter()
                .any(|cover| normalize_unique_id(&cover.label_key) == normalized_key)
            {
                return Ok(current);
            }

            let resolved = resolve_launcher_image_blocking(
                app,
                &ResolveLauncherImageRequest {
                    url: image_url.to_string(),
                    refresh: None,
                    mod_key: Some(label_key.to_string()),
                },
            )?;

            persist_auto_library_cover_at_path(
                &covers_path,
                label_key,
                &clean_input_path(&resolved.local_path),
            )
        })(),
    )
}

pub fn scan_launcher_library(
    _app: AppHandle,
    request: ScanLauncherLibraryRequest,
) -> anyhow::Result<LauncherLibraryScanResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_launcher_library",
        (|| {
            let mods_path = request.mods_path.trim();
            if mods_path.is_empty() {
                bail!("modsPath is required.");
            }

            let mut scan = scan_library_at_path(&clean_input_path(mods_path))?;
            let covers_path = launcher_library_covers_path()?;
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
                mod_summary.image_url = cover_lookup_keys(mod_summary)
                    .into_iter()
                    .find_map(|key| cover_map.get(&normalize_unique_id(&key)).cloned());
            }

            // Enrich summaries with the SMAPI requirement flag. Settings read is
            // best-effort: the scan itself must not fail when the launcher settings
            // file is temporarily unreadable, so an unresolved installed version
            // leaves every `requiresNewerSmapi` flag at its default `false`.
            let installed_smapi_version =
                match load_or_create_settings_at_path(&launcher_settings_path()?) {
                    Ok(settings) => {
                        Some(resolve_smapi_runtime_versions(&settings, mods_path).api_version)
                    }
                    Err(error) => {
                        log_launcher_trace("library.scan.smapiRequirementSkipped", |event| {
                            event.error(&error.to_string())
                        });
                        None
                    }
                };
            apply_smapi_requirement_flags(&mut scan.mods, installed_smapi_version.as_deref());

            Ok(scan)
        })(),
    )
}

pub(crate) fn set_launcher_mod_enabled_blocking(
    request: SetLauncherModEnabledRequest,
) -> anyhow::Result<SetLauncherModEnabledResult> {
    let mod_path = request.mod_path.trim();
    if mod_path.is_empty() {
        bail!("modPath is required.");
    }

    set_mod_enabled_at_path(&clean_input_path(mod_path), request.enabled)
}

pub fn set_launcher_mod_enabled(
    _app: AppHandle,
    request: SetLauncherModEnabledRequest,
) -> anyhow::Result<SetLauncherModEnabledResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "set_launcher_mod_enabled",
        (|| {
            let result = set_launcher_mod_enabled_blocking(request)?;
            if let Some(mods_path) = clean_input_path(&result.absolute_path)
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

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/library_tests.rs"]
mod library_tests;
