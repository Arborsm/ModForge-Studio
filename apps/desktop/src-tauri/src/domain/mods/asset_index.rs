//! Content Patcher asset index building: flattens `Changes` (including
//! `Include` files) and accumulates maps/events/characters/buildings/items
//! asset references per mod project.
//!
//! Split out of `mods/mod.rs` (god file) — keep call sites unchanged via the
//! `pub(crate) use` re-exports in `mod.rs`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::discovery::{
    ProjectCompatibility, array_field, log_scan_skip, object_field, read_json_file,
};
use crate::domain::manifest::{project_name_from_manifest, string_field};
use crate::infrastructure::fs::pathing::{
    game_path_to_pathbuf, normalize_path, normalize_separators,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetReference {
    pub key: String,
    pub label: String,
    pub targets: Vec<String>,
    pub patch_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetIndexGroup {
    pub mod_id: String,
    pub mod_name: String,
    pub mod_path: String,
    pub plugin_kind: String,
    pub maps: Vec<ModAssetReference>,
    pub events: Vec<ModAssetReference>,
    pub characters: Vec<ModAssetReference>,
    pub buildings: Vec<ModAssetReference>,
    pub items: Vec<ModAssetReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetIndex {
    pub mods: Vec<ModAssetIndexGroup>,
}

#[derive(Debug, Default)]
struct ModAssetReferenceAccumulator {
    label: String,
    targets: BTreeSet<String>,
    patch_ids: BTreeSet<String>,
}

#[derive(Debug, Default)]
struct ModAssetGroupAccumulator {
    maps: BTreeMap<String, ModAssetReferenceAccumulator>,
    events: BTreeMap<String, ModAssetReferenceAccumulator>,
    characters: BTreeMap<String, ModAssetReferenceAccumulator>,
    buildings: BTreeMap<String, ModAssetReferenceAccumulator>,
    items: BTreeMap<String, ModAssetReferenceAccumulator>,
}

fn target_values(patch: &Map<String, Value>) -> Vec<String> {
    match patch.get("Target") {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_target_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    normalized
        .strip_prefix("Content/")
        .unwrap_or(&normalized)
        .to_string()
}

fn build_content_asset_key(target: &str) -> String {
    format!("Content/{}.xnb", normalize_target_path(target))
}

fn target_leaf_name(target: &str) -> String {
    let normalized = normalize_target_path(target);
    normalized
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(&normalized)
        .to_string()
}

fn normalize_item_reference_key(raw_key: &str, prefix: &str) -> String {
    let trimmed = raw_key.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with('(') {
        trimmed.to_string()
    } else {
        format!("{prefix}{trimmed}")
    }
}

fn add_mod_asset_reference(
    collection: &mut BTreeMap<String, ModAssetReferenceAccumulator>,
    key: String,
    label: String,
    target: &str,
    patch_id: &str,
) {
    if key.trim().is_empty() {
        return;
    }

    let entry = collection
        .entry(key)
        .or_insert_with(|| ModAssetReferenceAccumulator {
            label: label.clone(),
            ..ModAssetReferenceAccumulator::default()
        });
    if entry.label.trim().is_empty() {
        entry.label = label;
    }
    entry.targets.insert(normalize_target_path(target));
    entry.patch_ids.insert(patch_id.to_string());
}

fn content_patcher_item_prefix(target: &str) -> Option<&'static str> {
    let normalized = normalize_target_path(target).to_ascii_lowercase();
    match normalized.as_str() {
        "data/objects" | "data/crops" | "data/fish" => Some("(O)"),
        "data/bigcraftables" => Some("(BC)"),
        "data/weapons" => Some("(W)"),
        "data/tools" => Some("(T)"),
        "data/shirts" => Some("(S)"),
        "data/pants" => Some("(P)"),
        "data/trinkets" => Some("(TR)"),
        "data/hats" => Some("(H)"),
        "data/boots" => Some("(B)"),
        "data/furniture" => Some("(F)"),
        _ => None,
    }
}

fn content_patcher_target_field_first_key(patch: &Map<String, Value>) -> Option<String> {
    match patch.get("TargetField") {
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Some(Value::Array(segments)) => segments
            .first()
            .and_then(Value::as_str)
            .map(str::trim)
            .and_then(|value| {
                if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                }
            }),
        _ => None,
    }
}

fn strip_xnb_extension(value: &str) -> &str {
    value
        .strip_suffix(".xnb")
        .or_else(|| value.strip_suffix(".XNB"))
        .unwrap_or(value)
}

fn collect_known_character_keys(patches: &[FlattenedContentPatcherPatch]) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();

    for flattened_patch in patches {
        for target in target_values(&flattened_patch.patch) {
            let normalized_target = normalize_target_path(&target);
            if !normalized_target.eq_ignore_ascii_case("Data/Characters") {
                continue;
            }

            if let Some(character_key) =
                content_patcher_target_field_first_key(&flattened_patch.patch)
            {
                keys.insert(character_key);
                continue;
            }

            if let Some(entries) =
                object_field(&Value::Object(flattened_patch.patch.clone()), "Entries")
            {
                for key in entries.keys() {
                    let trimmed = key.trim();
                    if !trimmed.is_empty() {
                        keys.insert(trimmed.to_string());
                    }
                }
            }
        }
    }

    keys
}

fn resolve_character_reference_key(
    target: &str,
    known_character_keys: &BTreeSet<String>,
) -> String {
    let leaf = target_leaf_name(target);
    let normalized_leaf = strip_xnb_extension(leaf.trim());
    if normalized_leaf.is_empty() {
        return String::new();
    }

    let normalized_leaf_lower = normalized_leaf.to_ascii_lowercase();
    let mut best_match: Option<(usize, &String)> = None;
    for key in known_character_keys {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }

        let normalized_key_lower = trimmed.to_ascii_lowercase();
        if normalized_leaf_lower == normalized_key_lower
            || normalized_leaf_lower.starts_with(&format!("{normalized_key_lower}_"))
        {
            let candidate = (trimmed.len(), key);
            if best_match.is_none_or(|current| candidate.0 > current.0) {
                best_match = Some(candidate);
            }
        }
    }

    best_match
        .map(|(_, key)| key.clone())
        .unwrap_or_else(|| normalized_leaf.to_string())
}

fn collect_content_patcher_target_references(
    target: &str,
    patch: &Map<String, Value>,
    patch_id: &str,
    known_character_keys: &BTreeSet<String>,
    accumulator: &mut ModAssetGroupAccumulator,
) {
    let normalized_target = normalize_target_path(target);
    let normalized_target_lower = normalized_target.to_ascii_lowercase();

    if normalized_target_lower.starts_with("maps/") {
        let label = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.maps,
            build_content_asset_key(&normalized_target),
            label,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower.starts_with("data/events/") {
        let label = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.events,
            build_content_asset_key(&normalized_target),
            label,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower == "data/characters" {
        if let Some(character_key) = content_patcher_target_field_first_key(patch) {
            add_mod_asset_reference(
                &mut accumulator.characters,
                character_key.clone(),
                character_key,
                &normalized_target,
                patch_id,
            );
            return;
        }

        if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
            for key in entries.keys() {
                let key = key.trim();
                add_mod_asset_reference(
                    &mut accumulator.characters,
                    key.to_string(),
                    key.to_string(),
                    &normalized_target,
                    patch_id,
                );
            }
        }
        return;
    }

    if normalized_target_lower.starts_with("characters/")
        || normalized_target_lower.starts_with("portraits/")
    {
        let key = resolve_character_reference_key(&normalized_target, known_character_keys);
        add_mod_asset_reference(
            &mut accumulator.characters,
            key.clone(),
            key,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower == "data/buildings" {
        if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
            for key in entries.keys() {
                let key = key.trim();
                add_mod_asset_reference(
                    &mut accumulator.buildings,
                    key.to_string(),
                    key.to_string(),
                    &normalized_target,
                    patch_id,
                );
            }
        }
        return;
    }

    if normalized_target_lower.starts_with("buildings/") {
        let key = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.buildings,
            key.clone(),
            key,
            &normalized_target,
            patch_id,
        );
        return;
    }

    let Some(item_prefix) = content_patcher_item_prefix(&normalized_target) else {
        return;
    };

    if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
        for key in entries.keys() {
            let normalized_key = normalize_item_reference_key(key, item_prefix);
            if normalized_key.is_empty() {
                continue;
            }

            add_mod_asset_reference(
                &mut accumulator.items,
                normalized_key.clone(),
                normalized_key,
                &normalized_target,
                patch_id,
            );
        }
    }
}

#[derive(Debug, Clone)]
struct FlattenedContentPatcherPatch {
    id: String,
    patch: Map<String, Value>,
}

fn merge_when_conditions(parent_when: Option<&Map<String, Value>>, patch: &mut Map<String, Value>) {
    let Some(parent_when) = parent_when else {
        return;
    };
    if parent_when.is_empty() {
        return;
    }

    let mut merged_when = parent_when.clone();
    if let Some(existing_when) = patch.get("When").and_then(Value::as_object) {
        for (key, value) in existing_when {
            merged_when.insert(key.clone(), value.clone());
        }
    }

    patch.insert("When".to_string(), Value::Object(merged_when));
}

fn combine_when_conditions(
    parent_when: Option<&Map<String, Value>>,
    current_when: Option<&Map<String, Value>>,
) -> Option<Map<String, Value>> {
    match (parent_when, current_when) {
        (None, None) => None,
        (Some(parent), None) => Some(parent.clone()),
        (None, Some(current)) => Some(current.clone()),
        (Some(parent), Some(current)) => {
            let mut combined = parent.clone();
            for (key, value) in current {
                combined.insert(key.clone(), value.clone());
            }
            Some(combined)
        }
    }
}

fn collect_flattened_content_patcher_patches(
    content: &Value,
    base_dir: &Path,
    source_label: &str,
    inherited_when: Option<Map<String, Value>>,
    include_stack: &mut Vec<String>,
) -> Vec<FlattenedContentPatcherPatch> {
    let mut patches = Vec::new();

    for (index, change) in array_field(content, "Changes")
        .into_iter()
        .flat_map(|changes| changes.iter().enumerate())
    {
        let Some(patch_object) = change.as_object() else {
            continue;
        };

        let action = patch_object
            .get("Action")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();

        if action.eq_ignore_ascii_case("Include") {
            let Some(from_file) = patch_object
                .get("FromFile")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };

            if from_file.contains("{{") {
                continue;
            }

            let include_path = base_dir.join(game_path_to_pathbuf(from_file));
            let include_key = normalize_path(&include_path).to_ascii_lowercase();
            if include_stack.contains(&include_key) {
                continue;
            }

            let included_content = match read_json_file(&include_path) {
                Ok((_, included_content)) => included_content,
                Err(error) => {
                    log_scan_skip(&include_path, &error);
                    continue;
                }
            };

            let inherited = combine_when_conditions(
                inherited_when.as_ref(),
                patch_object.get("When").and_then(Value::as_object),
            );
            let next_source_label = format!("{source_label}->{from_file}");
            include_stack.push(include_key);
            patches.extend(collect_flattened_content_patcher_patches(
                &included_content,
                include_path.parent().unwrap_or(base_dir),
                &next_source_label,
                inherited,
                include_stack,
            ));
            include_stack.pop();
            continue;
        }

        let mut patch = patch_object.clone();
        merge_when_conditions(inherited_when.as_ref(), &mut patch);
        patches.push(FlattenedContentPatcherPatch {
            id: format!("{source_label}:{index}"),
            patch,
        });
    }

    patches
}

fn finalize_mod_asset_references(
    collection: BTreeMap<String, ModAssetReferenceAccumulator>,
) -> Vec<ModAssetReference> {
    collection
        .into_iter()
        .map(|(key, entry)| ModAssetReference {
            key,
            label: if entry.label.trim().is_empty() {
                String::new()
            } else {
                entry.label
            },
            targets: entry.targets.into_iter().collect(),
            patch_ids: entry.patch_ids.into_iter().collect(),
        })
        .collect()
}

pub(crate) fn build_mod_asset_index_group(
    project_path: &Path,
    manifest: &Value,
    content: &Value,
    compatibility: &ProjectCompatibility,
) -> Option<ModAssetIndexGroup> {
    if !compatibility.is_content_patcher || compatibility.status != "ready" {
        return None;
    }

    let mut accumulator = ModAssetGroupAccumulator::default();
    let mut include_stack = Vec::new();
    let flattened_patches = collect_flattened_content_patcher_patches(
        content,
        project_path,
        "content.json",
        None,
        &mut include_stack,
    );
    let known_character_keys = collect_known_character_keys(&flattened_patches);
    for flattened_patch in flattened_patches {
        for target in target_values(&flattened_patch.patch) {
            collect_content_patcher_target_references(
                &target,
                &flattened_patch.patch,
                &flattened_patch.id,
                &known_character_keys,
                &mut accumulator,
            );
        }
    }

    Some(ModAssetIndexGroup {
        mod_id: string_field(manifest, "UniqueID")
            .unwrap_or_else(|| normalize_separators(&normalize_path(project_path))),
        mod_name: project_name_from_manifest(manifest, project_path),
        mod_path: normalize_path(project_path),
        plugin_kind: "content-patcher".to_string(),
        maps: finalize_mod_asset_references(accumulator.maps),
        events: finalize_mod_asset_references(accumulator.events),
        characters: finalize_mod_asset_references(accumulator.characters),
        buildings: finalize_mod_asset_references(accumulator.buildings),
        items: finalize_mod_asset_references(accumulator.items),
    })
}
