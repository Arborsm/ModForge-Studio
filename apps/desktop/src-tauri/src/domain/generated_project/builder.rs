use super::types::{
    ChangeRegistry, ChangeRegistryPatch, CustomLocation, DynamicToken,
    GeneratedProjectDraftError, GeneratedProjectDraftErrorCode, GeneratedProjectDraftOperation,
    GeneratedProjectDraftRecord, GeneratedProjectMetadata,
};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// Import a CP mod directory into a draft record.
///
/// Reads `manifest.json` and `content.json`, recursively resolves all
/// `Action: "Include"` entries, then groups changes into patches.
///
/// * Include files under `changes/{workspace}.json` assign `{workspace}`
///   as the patch workspace.
/// * Inline changes (not from an include) get workspace `"mods"`.
/// * `EditData` changes targeting the same asset are merged into one patch.
/// * `EditImage` / `EditMap` / `Load` stay as standalone patches.
pub fn import_generated_project_pack(
    mod_directory_path: &str,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let dir = Path::new(mod_directory_path);

    let manifest_path = dir.join("manifest.json");
    let manifest_json = std::fs::read_to_string(&manifest_path).map_err(|error| {
        read_failed(
            &manifest_path,
            format!("Failed to read manifest.json: {error}"),
        )
    })?;
    let (metadata, config_schema_from_manifest) = parse_manifest_json(&manifest_json)?;

    let content_path = dir.join("content.json");
    let content_json = std::fs::read_to_string(&content_path).map_err(|error| {
        read_failed(
            &content_path,
            format!("Failed to read content.json: {error}"),
        )
    })?;
    let (registry, dynamic_tokens, custom_locations, alias_token_names, config_schema_from_content) =
        parse_content_json(&content_json, dir)?;

    // Prefer ConfigSchema from manifest (CP canonical location), fallback to content.json
    let config_schema_draft = if config_schema_from_manifest.is_object()
        && !config_schema_from_manifest.as_object().unwrap().is_empty()
    {
        config_schema_from_manifest
    } else {
        config_schema_from_content
    };

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let draft_storage_key = format!("imported-{}", timestamp);

    Ok(GeneratedProjectDraftRecord {
        draft_storage_key,
        project_metadata: metadata,
        overlay_targets: Vec::new(),
        config_schema_draft,
        serialized_change_registry: serde_json::to_value(registry).map_err(|error| {
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                GeneratedProjectDraftOperation::Import,
                format!("Failed to serialize change registry: {error}"),
            )
        })?,
        dynamic_tokens,
        custom_locations,
        alias_token_names,
        event_source_snapshots_by_target: BTreeMap::new(),
        last_draft_saved_at: None,
        last_exported_at: None,
        last_export_path: None,
        last_export_fingerprint: None,
    })
}

// ─── manifest.json ────────────────────────────────────────────────────

fn parse_manifest_json(
    manifest_json: &str,
) -> Result<(GeneratedProjectMetadata, Value), GeneratedProjectDraftError> {
    let value: Value = serde_json::from_str(manifest_json).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidDraft,
            GeneratedProjectDraftOperation::Import,
            format!("manifest.json is not valid JSON: {error}"),
        )
    })?;

    let obj = value.as_object().ok_or_else(|| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidDraft,
            GeneratedProjectDraftOperation::Import,
            "manifest.json must be a JSON object.",
        )
    })?;

    let get_string = |key: &str| -> Result<String, GeneratedProjectDraftError> {
        obj.get(key)
            .and_then(Value::as_str)
            .map(|s| s.to_string())
            .ok_or_else(|| {
                GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::InvalidDraft,
                    GeneratedProjectDraftOperation::Import,
                    format!("manifest.json missing required field: {key}"),
                )
            })
    };

    let name = get_string("Name")?;
    let author = get_string("Author")?;
    let version = get_string("Version")?;
    let description = obj
        .get("Description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let unique_id = get_string("UniqueID")?;

    let content_pack_for = obj
        .get("ContentPackFor")
        .and_then(|v| v.as_object())
        .and_then(|o| o.get("UniqueID"))
        .and_then(Value::as_str)
        .unwrap_or("Pathoschild.ContentPatcher")
        .to_string();

    let minimum_api_version = obj
        .get("MinimumApiVersion")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update_keys = obj
        .get("UpdateKeys")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    let config_schema = obj.get("ConfigSchema").cloned().unwrap_or_else(|| Value::Object(Map::new()));

    Ok((
        GeneratedProjectMetadata {
            project_name: name,
            project_description: description,
            project_author: author,
            project_version: version,
            project_unique_id: unique_id,
            game_root_path: None,
            content_pack_for_unique_id: content_pack_for,
            minimum_api_version,
            update_keys,
        },
        config_schema,
    ))
}

// ─── content.json ─────────────────────────────────────────────────────

fn parse_content_json(
    content_json: &str,
    mod_dir: &Path,
) -> Result<
    (
        ChangeRegistry,
        Vec<DynamicToken>,
        Vec<CustomLocation>,
        BTreeMap<String, String>,
        Value,
    ),
    GeneratedProjectDraftError,
> {
    let value: Value = serde_json::from_str(content_json).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidDraft,
            GeneratedProjectDraftOperation::Import,
            format!("content.json is not valid JSON: {error}"),
        )
    })?;

    let obj = value.as_object().ok_or_else(|| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidDraft,
            GeneratedProjectDraftOperation::Import,
            "content.json must be a JSON object.",
        )
    })?;

    let mut visited = HashSet::new();
    let changes = resolve_changes(obj, mod_dir, &mut visited)?;

    let dynamic_tokens = parse_dynamic_tokens(obj.get("DynamicTokens"))?;
    let custom_locations = parse_custom_locations(obj.get("CustomLocations"))?;
    let alias_token_names = parse_alias_token_names(obj.get("AliasTokenNames"))?;
    let config_schema = obj
        .get("ConfigSchema")
        .cloned()
        .unwrap_or_else(|| Value::Object(Map::new()));

    let patches = changes_to_patches(changes)?;
    let registry = ChangeRegistry { patches };

    Ok((
        registry,
        dynamic_tokens,
        custom_locations,
        alias_token_names,
        config_schema,
    ))
}

// ─── Include resolution ───────────────────────────────────────────────

/// Resolve Changes from a content object, recursively following Include actions.
///
/// Returns a list of `(workspace, change_value)`.  Workspace is inferred from
/// the include file path (`changes/{ws}.json`) or `"mods"` for inline changes.
fn resolve_changes(
    content_obj: &Map<String, Value>,
    mod_dir: &Path,
    visited: &mut HashSet<String>,
) -> Result<Vec<(String, Value)>, GeneratedProjectDraftError> {
    let mut result = Vec::new();

    let changes = content_obj
        .get("Changes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for change in changes {
        let change_obj = change.as_object().ok_or_else(|| {
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                GeneratedProjectDraftOperation::Import,
                "Each change must be a JSON object.",
            )
        })?;

        let action = change_obj
            .get("Action")
            .and_then(Value::as_str)
            .unwrap_or("");

        if action == "Include" {
            let from_file = change_obj.get("FromFile").and_then(Value::as_str).ok_or_else(
                || {
                    GeneratedProjectDraftError::new(
                        GeneratedProjectDraftErrorCode::InvalidDraft,
                        GeneratedProjectDraftOperation::Import,
                        "Include action must have FromFile.",
                    )
                },
            )?;

            if !visited.insert(from_file.to_string()) {
                return Err(GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::InvalidDraft,
                    GeneratedProjectDraftOperation::Import,
                    format!("Cyclic or duplicate include detected: {from_file}"),
                ));
            }

            let include_path = mod_dir.join(from_file);
            let include_json = std::fs::read_to_string(&include_path).map_err(|error| {
                read_failed(
                    &include_path,
                    format!("Failed to read include file {from_file}: {error}"),
                )
            })?;

            let include_value: Value = serde_json::from_str(&include_json).map_err(|error| {
                GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::InvalidDraft,
                    GeneratedProjectDraftOperation::Import,
                    format!("Include file {from_file} is not valid JSON: {error}"),
                )
            })?;

            let include_obj = include_value.as_object().ok_or_else(|| {
                GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::InvalidDraft,
                    GeneratedProjectDraftOperation::Import,
                    format!("Include file {from_file} must be a JSON object."),
                )
            })?;

            // Infer workspace from include file path, e.g. "changes/mods.json" -> "mods"
            let workspace = extract_workspace_from_include_path(from_file);

            // Recursively resolve (supports nested includes)
            let nested = resolve_changes(include_obj, mod_dir, visited)?;
            for (nested_ws, ch) in nested {
                // Inner include wins if it already has a workspace, otherwise use outer
                let effective = if nested_ws == "mods" {
                    workspace.clone()
                } else {
                    nested_ws
                };
                result.push((effective, ch));
            }
        } else {
            result.push(("mods".to_string(), change.clone()));
        }
    }

    Ok(result)
}

fn extract_workspace_from_include_path(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("mods")
        .to_string()
}

// ─── Changes → Patches ────────────────────────────────────────────────

fn changes_to_patches(
    changes: Vec<(String, Value)>,
) -> Result<Vec<ChangeRegistryPatch>, GeneratedProjectDraftError> {
    // Group EditData by (workspace, target)
    let mut edit_data_groups: BTreeMap<(String, String), Vec<Value>> = BTreeMap::new();
    let mut standalone: Vec<(String, Value)> = Vec::new();

    for (workspace, change) in changes {
        let action = change
            .as_object()
            .and_then(|o| o.get("Action"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_lowercase();
        let target = change
            .as_object()
            .and_then(|o| o.get("Target"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();

        if action == "editdata" {
            edit_data_groups
                .entry((workspace, target))
                .or_default()
                .push(change);
        } else {
            standalone.push((workspace, change));
        }
    }

    let mut patches = Vec::new();
    let mut patch_id: u64 = 0;

    for ((workspace, target), changes) in edit_data_groups {
        patch_id += 1;
        patches.push(edit_data_changes_to_patch(&workspace, &target, &changes, patch_id)?);
    }

    for (workspace, change) in standalone {
        patch_id += 1;
        patches.push(standalone_change_to_patch(&workspace, &change, patch_id)?);
    }

    Ok(patches)
}

fn edit_data_changes_to_patch(
    workspace: &str,
    target: &str,
    changes: &[Value],
    patch_id: u64,
) -> Result<ChangeRegistryPatch, GeneratedProjectDraftError> {
    let first = changes.first().and_then(|c| c.as_object());

    let log_name = first
        .and_then(|o| o.get("LogName"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let enabled = first
        .and_then(|o| o.get("Enabled"))
        .cloned()
        .unwrap_or(json!(true));
    let when = first.and_then(|o| o.get("When")).cloned();
    let target_locale = first
        .and_then(|o| o.get("TargetLocale"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update = first
        .and_then(|o| o.get("Update"))
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let priority = first.and_then(|o| o.get("Priority")).cloned();
    let local_tokens = first.and_then(|o| o.get("LocalTokens")).cloned();
    let target_field = first
        .and_then(|o| o.get("TargetField"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        });

    let mut entries = Map::new();
    let mut fields = Map::new();
    let mut text_operations = Vec::new();
    let mut move_entries = Vec::new();

    for change in changes {
        if let Some(obj) = change.as_object() {
            if let Some(e) = obj.get("Entries").and_then(Value::as_object) {
                for (k, v) in e {
                    entries.insert(k.clone(), v.clone());
                }
            }
            if let Some(f) = obj.get("Fields").and_then(Value::as_object) {
                for (entry_key, field_map) in f {
                    if let Some(field_obj) = field_map.as_object() {
                        let existing = fields
                            .entry(entry_key.clone())
                            .or_insert_with(|| Value::Object(Map::new()))
                            .as_object_mut();
                        if let Some(existing_map) = existing {
                            for (field_name, field_value) in field_obj {
                                existing_map.insert(field_name.clone(), field_value.clone());
                            }
                        }
                    }
                }
            }
            if let Some(ops) = obj.get("TextOperations").and_then(Value::as_array) {
                text_operations.extend(ops.iter().cloned());
            }
            if let Some(moves) = obj.get("MoveEntries").and_then(Value::as_array) {
                move_entries.extend(moves.iter().cloned());
            }
        }
    }

    let mut editor_state = Map::new();
    if !entries.is_empty() {
        editor_state.insert("entries".to_string(), Value::Object(entries));
    }
    if !fields.is_empty() {
        editor_state.insert("fields".to_string(), Value::Object(fields));
    }
    if !text_operations.is_empty() {
        editor_state.insert(
            "textOperations".to_string(),
            Value::Array(text_operations),
        );
    }
    if !move_entries.is_empty() {
        editor_state.insert("moveEntries".to_string(), Value::Array(move_entries));
    }

    Ok(ChangeRegistryPatch {
        id: format!("patch-{patch_id}"),
        workspace: workspace.to_string(),
        target: target.to_string(),
        action: "EditData".to_string(),
        log_name,
        enabled,
        when,
        from_file: None,
        editor_state: Value::Object(editor_state),
        target_locale,
        update,
        priority,
        local_tokens,
        target_field,
    })
}

fn standalone_change_to_patch(
    workspace: &str,
    change: &Value,
    patch_id: u64,
) -> Result<ChangeRegistryPatch, GeneratedProjectDraftError> {
    let obj = change.as_object().ok_or_else(|| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidDraft,
            GeneratedProjectDraftOperation::Import,
            "Change must be a JSON object.",
        )
    })?;

    let action = obj.get("Action").and_then(Value::as_str).unwrap_or("").to_string();
    let target = obj.get("Target").and_then(Value::as_str).unwrap_or("").to_string();
    let log_name = obj
        .get("LogName")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let enabled = obj.get("Enabled").cloned().unwrap_or(json!(true));
    let when = obj.get("When").cloned();
    let from_file = obj.get("FromFile").and_then(Value::as_str).map(|s| s.to_string());
    let target_locale = obj
        .get("TargetLocale")
        .and_then(Value::as_str)
        .map(|s| s.to_string());
    let update = obj.get("Update").and_then(Value::as_str).map(|s| s.to_string());
    let priority = obj.get("Priority").cloned();
    let local_tokens = obj.get("LocalTokens").cloned();
    let target_field = obj
        .get("TargetField")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.to_string())
                .collect()
        });

    let mut editor_state = Map::new();

    // Common CP field names that should NOT go into editor_state (they are PatchConfig)
    let common_keys: [&str; 11] = [
        "Action", "Target", "LogName", "Enabled", "When", "FromFile",
        "TargetLocale", "Update", "Priority", "LocalTokens", "TargetField",
    ];

    for (k, v) in obj {
        if common_keys.contains(&k.as_str()) {
            continue;
        }

        let internal_key = match k.as_str() {
            "MapProperties" => "properties",
            "AddWarps" => "warps",
            "AddNpcWarps" => "npcWarps",
            "MapTiles" => "mapTiles",
            "FromArea" => "fromArea",
            "ToArea" => "toArea",
            "PatchMode" => "patchMode",
            "TextOperations" => "textOperations",
            "MoveEntries" => "moveEntries",
            _ => k,
        };

        let mapped = if internal_key == "warps" || internal_key == "npcWarps" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|s| {
                                let parts: Vec<&str> = s.as_str()?.split_whitespace().collect();
                                if parts.len() >= 5 {
                                    let mut warp = Map::new();
                                    warp.insert("fromX".to_string(), json!(parts[0]));
                                    warp.insert("fromY".to_string(), json!(parts[1]));
                                    warp.insert("toMap".to_string(), json!(parts[2]));
                                    warp.insert("toX".to_string(), json!(parts[3]));
                                    warp.insert("toY".to_string(), json!(parts[4]));
                                    Some(Value::Object(warp))
                                } else {
                                    None
                                }
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "mapTiles" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|t| {
                                let t_obj = t.as_object()?;
                                let mut tile = Map::new();
                                tile.insert("layer".to_string(), t_obj.get("Layer")?.clone());
                                if let Some(pos) = t_obj.get("Position").and_then(Value::as_object) {
                                    tile.insert("x".to_string(), pos.get("X")?.clone());
                                    tile.insert("y".to_string(), pos.get("Y")?.clone());
                                }
                                if let Some(ts) = t_obj.get("SetTilesheet") {
                                    tile.insert("setTilesheet".to_string(), ts.clone());
                                }
                                if let Some(si) = t_obj.get("SetIndex") {
                                    tile.insert("setIndex".to_string(), si.clone());
                                }
                                if let Some(r) = t_obj.get("Remove") {
                                    tile.insert("remove".to_string(), json!(r == "true"));
                                }
                                if let Some(sp) = t_obj.get("SetProperties") {
                                    tile.insert("setProperties".to_string(), sp.clone());
                                }
                                Some(Value::Object(tile))
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "fromArea" || internal_key == "toArea" {
            v.as_object()
                .map(|area_obj| {
                    let mut area = Map::new();
                    area.insert(
                        "x".to_string(),
                        area_obj.get("X").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "y".to_string(),
                        area_obj.get("Y").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "width".to_string(),
                        area_obj.get("Width").cloned().unwrap_or(json!(0)),
                    );
                    area.insert(
                        "height".to_string(),
                        area_obj.get("Height").cloned().unwrap_or(json!(0)),
                    );
                    Value::Object(area)
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "textOperations" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|op| {
                                let op_obj = op.as_object()?;
                                let mut result = Map::new();
                                for (k2, v2) in op_obj {
                                    let camel = match k2.as_str() {
                                        "Operation" => "operation",
                                        "Target" => "target",
                                        "Value" => "value",
                                        "Delimiter" => "delimiter",
                                        "Search" => "search",
                                        "ReplaceMode" => "replaceMode",
                                        _ => k2,
                                    };
                                    result.insert(camel.to_string(), v2.clone());
                                }
                                Some(Value::Object(result))
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else if internal_key == "moveEntries" {
            v.as_array()
                .map(|arr| {
                    Value::Array(
                        arr.iter()
                            .filter_map(|entry| {
                                let entry_obj = entry.as_object()?;
                                let mut result = Map::new();
                                for (k2, v2) in entry_obj {
                                    let camel = match k2.as_str() {
                                        "ID" => "id",
                                        "BeforeId" => "beforeId",
                                        "AfterId" => "afterId",
                                        "ToPosition" => "toPosition",
                                        _ => k2,
                                    };
                                    result.insert(camel.to_string(), v2.clone());
                                }
                                Some(Value::Object(result))
                            })
                            .collect(),
                    )
                })
                .unwrap_or_else(|| v.clone())
        } else {
            v.clone()
        };

        editor_state.insert(internal_key.to_string(), mapped);
    }

    Ok(ChangeRegistryPatch {
        id: format!("patch-{patch_id}"),
        workspace: workspace.to_string(),
        target,
        action,
        log_name,
        enabled,
        when,
        from_file,
        editor_state: Value::Object(editor_state),
        target_locale,
        update,
        priority,
        local_tokens,
        target_field,
    })
}

// ─── Root-level parsers ───────────────────────────────────────────────

fn parse_dynamic_tokens(value: Option<&Value>) -> Result<Vec<DynamicToken>, GeneratedProjectDraftError> {
    let mut result = Vec::new();
    if let Some(arr) = value.and_then(Value::as_array) {
        for token in arr {
            if let Some(obj) = token.as_object() {
                result.push(DynamicToken {
                    name: obj.get("Name").and_then(Value::as_str).unwrap_or("").to_string(),
                    value: obj.get("Value").and_then(Value::as_str).unwrap_or("").to_string(),
                    when: obj.get("When").and_then(Value::as_object).cloned(),
                });
            }
        }
    }
    Ok(result)
}

fn parse_custom_locations(
    value: Option<&Value>,
) -> Result<Vec<CustomLocation>, GeneratedProjectDraftError> {
    let mut result = Vec::new();
    if let Some(arr) = value.and_then(Value::as_array) {
        for loc in arr {
            if let Some(obj) = loc.as_object() {
                result.push(CustomLocation {
                    name: obj.get("Name").and_then(Value::as_str).unwrap_or("").to_string(),
                    from_map_file: obj
                        .get("FromMapFile")
                        .and_then(Value::as_str)
                        .map(|s| s.to_string()),
                    migrate_legacy_names: obj
                        .get("MigrateLegacyNames")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .filter_map(Value::as_str)
                                .map(|s| s.to_string())
                                .collect()
                        })
                        .unwrap_or_default(),
                });
            }
        }
    }
    Ok(result)
}

fn parse_alias_token_names(
    value: Option<&Value>,
) -> Result<BTreeMap<String, String>, GeneratedProjectDraftError> {
    let mut result = BTreeMap::new();
    if let Some(obj) = value.and_then(Value::as_object) {
        for (k, v) in obj {
            if let Some(s) = v.as_str() {
                result.insert(k.clone(), s.to_string());
            }
        }
    }
    Ok(result)
}

fn read_failed(path: &Path, message: impl Into<String>) -> GeneratedProjectDraftError {
    GeneratedProjectDraftError::new(
        GeneratedProjectDraftErrorCode::ReadFailed,
        GeneratedProjectDraftOperation::Import,
        message,
    )
    .with_path(path.to_string_lossy().to_string())
}

// ─── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{create_temp_dir, write_file};
    use std::fs;

    #[test]
    fn imports_manifest_metadata() {
        let root = create_temp_dir("import-manifest");
        write_file(
            &root.join("manifest.json"),
            r#"{
  "Name": "TestMod",
  "Author": "Author",
  "Version": "1.0.0",
  "Description": "A test mod",
  "UniqueID": "Author.TestMod",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" },
  "MinimumApiVersion": "3.0.0",
  "UpdateKeys": ["Nexus:1915"]
}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{"Format": "2.0.0", "Changes": []}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        assert_eq!(draft.project_metadata.project_name, "TestMod");
        assert_eq!(draft.project_metadata.project_author, "Author");
        assert_eq!(draft.project_metadata.project_version, "1.0.0");
        assert_eq!(draft.project_metadata.project_description, "A test mod");
        assert_eq!(draft.project_metadata.project_unique_id, "Author.TestMod");
        assert_eq!(
            draft.project_metadata.content_pack_for_unique_id,
            "Pathoschild.ContentPatcher"
        );
        assert_eq!(
            draft.project_metadata.minimum_api_version,
            Some("3.0.0".to_string())
        );
        assert_eq!(draft.project_metadata.update_keys, vec!["Nexus:1915"]);

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn imports_content_changes_as_patches() {
        let root = create_temp_dir("import-changes");
        write_file(
            &root.join("manifest.json"),
            r#"{"Name":"T","Author":"A","Version":"1.0.0","UniqueID":"A.T","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditData", "Target": "Data/Objects", "Entries": { "74": "Diamond" } },
    { "Action": "EditImage", "Target": "Portraits/Abigail", "FromFile": "assets/abby.png" }
  ]
}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        let registry: ChangeRegistry =
            serde_json::from_value(draft.serialized_change_registry).unwrap();
        assert_eq!(registry.patches.len(), 2);

        let edit_data = registry
            .patches
            .iter()
            .find(|p| p.action == "EditData")
            .expect("EditData patch");
        assert_eq!(edit_data.target, "Data/Objects");
        let state = edit_data.editor_state.as_object().unwrap();
        assert!(state.contains_key("entries"));

        let edit_image = registry
            .patches
            .iter()
            .find(|p| p.action == "EditImage")
            .expect("EditImage patch");
        assert_eq!(edit_image.target, "Portraits/Abigail");
        assert_eq!(edit_image.from_file, Some("assets/abby.png".to_string()));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn merges_edit_data_by_target() {
        let root = create_temp_dir("import-merge");
        write_file(
            &root.join("manifest.json"),
            r#"{"Name":"T","Author":"A","Version":"1.0.0","UniqueID":"A.T","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditData", "Target": "Data/Objects", "Entries": { "74": "Diamond" } },
    { "Action": "EditData", "Target": "Data/Objects", "Fields": { "74": { "Price": "500" } } }
  ]
}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        let registry: ChangeRegistry =
            serde_json::from_value(draft.serialized_change_registry).unwrap();
        assert_eq!(registry.patches.len(), 1);

        let patch = &registry.patches[0];
        assert_eq!(patch.action, "EditData");
        assert_eq!(patch.target, "Data/Objects");
        let state = patch.editor_state.as_object().unwrap();
        assert!(state.contains_key("entries"));
        assert!(state.contains_key("fields"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn resolves_include_files() {
        let root = create_temp_dir("import-include");
        write_file(
            &root.join("manifest.json"),
            r#"{"Name":"T","Author":"A","Version":"1.0.0","UniqueID":"A.T","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "changes/mods.json" }
  ]
}"#,
        );
        fs::create_dir_all(root.join("changes")).unwrap();
        write_file(
            &root.join("changes/mods.json"),
            r#"{
  "Changes": [
    { "Action": "EditData", "Target": "Data/mail", "Entries": { "Hello": "World" } }
  ]
}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        let registry: ChangeRegistry =
            serde_json::from_value(draft.serialized_change_registry).unwrap();
        assert_eq!(registry.patches.len(), 1);
        assert_eq!(registry.patches[0].workspace, "mods");
        assert_eq!(registry.patches[0].target, "Data/mail");

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn imports_dynamic_tokens_and_custom_locations() {
        let root = create_temp_dir("import-tokens");
        write_file(
            &root.join("manifest.json"),
            r#"{"Name":"T","Author":"A","Version":"1.0.0","UniqueID":"A.T","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "DynamicTokens": [
    { "Name": "SeasonUpper", "Value": "{{uppercase {{Season}}}}" }
  ],
  "CustomLocations": [
    { "Name": "MyCloset", "FromMapFile": "assets/closet.tmx" }
  ],
  "AliasTokenNames": { "OldToken": "NewToken" },
  "Changes": []
}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        assert_eq!(draft.dynamic_tokens.len(), 1);
        assert_eq!(draft.dynamic_tokens[0].name, "SeasonUpper");
        assert_eq!(draft.custom_locations.len(), 1);
        assert_eq!(draft.custom_locations[0].name, "MyCloset");
        assert_eq!(
            draft.alias_token_names.get("OldToken"),
            Some(&"NewToken".to_string())
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn maps_cp_fields_back_to_internal_names() {
        let root = create_temp_dir("import-fields");
        write_file(
            &root.join("manifest.json"),
            r#"{"Name":"T","Author":"A","Version":"1.0.0","UniqueID":"A.T","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditMap",
      "Target": "Maps/Town",
      "MapProperties": { "Music": "springtown" },
      "AddWarps": ["5 10 Farm 15 20"],
      "MapTiles": [
        { "Layer": "Back", "Position": { "X": 1, "Y": 2 }, "SetIndex": 42 }
      ]
    }
  ]
}"#,
        );

        let draft = import_generated_project_pack(root.to_str().unwrap()).unwrap();
        let registry: ChangeRegistry =
            serde_json::from_value(draft.serialized_change_registry).unwrap();
        let patch = &registry.patches[0];
        let state = patch.editor_state.as_object().unwrap();

        assert!(state.contains_key("properties"));
        assert!(state.contains_key("warps"));
        assert!(state.contains_key("mapTiles"));

        let warps = state.get("warps").unwrap().as_array().unwrap();
        assert_eq!(warps.len(), 1);
        let warp = warps[0].as_object().unwrap();
        assert_eq!(warp.get("fromX").unwrap().as_str().unwrap(), "5");

        let tiles = state.get("mapTiles").unwrap().as_array().unwrap();
        assert_eq!(tiles.len(), 1);
        let tile = tiles[0].as_object().unwrap();
        assert_eq!(tile.get("layer").unwrap().as_str().unwrap(), "Back");
        assert_eq!(tile.get("x").unwrap().as_i64().unwrap(), 1);
        assert_eq!(tile.get("y").unwrap().as_i64().unwrap(), 2);
        assert_eq!(tile.get("setIndex").unwrap().as_i64().unwrap(), 42);

        fs::remove_dir_all(root).expect("cleanup");
    }
}
