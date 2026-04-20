use super::types::{
    ChangeRegistry, ChangeRegistryPatch, GeneratedProjectDraftError,
    GeneratedProjectDraftErrorCode, GeneratedProjectDraftOperation, GeneratedProjectDraftRecord,
};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

/// Convert a When condition object so all values are strings.
/// CP expects `When` values as strings (`InvariantDictionary<string?>`).
fn stringify_when_values(when: &Value) -> Value {
    let mut result = Map::new();
    if let Some(obj) = when.as_object() {
        for (k, v) in obj {
            let s = match v {
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            result.insert(k.clone(), json!(s));
        }
    }
    Value::Object(result)
}

/// Build a `manifest.json` string from the draft metadata.
pub fn build_manifest_json(
    draft: &GeneratedProjectDraftRecord,
) -> Result<String, GeneratedProjectDraftError> {
    let meta = &draft.project_metadata;

    let mut manifest = Map::new();
    manifest.insert("Name".to_string(), json!(meta.project_name));
    manifest.insert("Author".to_string(), json!(meta.project_author));
    manifest.insert("Version".to_string(), json!(meta.project_version));
    manifest.insert("Description".to_string(), json!(meta.project_description));
    manifest.insert(
        "UniqueID".to_string(),
        json!(meta.project_unique_id),
    );
    manifest.insert(
        "ContentPackFor".to_string(),
        json!({ "UniqueID": meta.content_pack_for_unique_id }),
    );

    // ConfigSchema
    if draft.config_schema_draft.is_object() {
        let schema = draft.config_schema_draft.as_object().unwrap();
        if !schema.is_empty() {
            manifest.insert("ConfigSchema".to_string(), json!(schema));
        }
    }

    serde_json::to_string_pretty(&Value::Object(manifest)
    )
    .map(|s| format!("{s}\n"))
    .map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::InvalidExport,
            GeneratedProjectDraftOperation::Export,
            format!("Failed to serialize manifest.json: {error}"),
        )
    })
}

/// Build a `content.json` string from the draft's change registry.
///
/// Strategy:
/// * `EditData` patches that share the same `Target` are merged into a single
///   `Change` entry whose `Entries` map contains every key/value from all
///   patches.
/// * `EditImage`, `EditMap`, and `Load` stay as individual `Change` entries.
/// * Patches from the same workspace are written to a per-workspace include
///   file reference so that the generated `content.json` stays readable.
pub fn build_content_json(
    draft: &GeneratedProjectDraftRecord,
) -> Result<String, GeneratedProjectDraftError> {
    let registry: ChangeRegistry =
        serde_json::from_value(draft.serialized_change_registry.clone()).map_err(|error| {
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                GeneratedProjectDraftOperation::Export,
                format!("serializedChangeRegistry is not valid ChangeRegistry: {error}"),
            )
            .with_draft_storage_key(draft.draft_storage_key.clone())
        })?;

    let active_patches: Vec<_> = registry
        .patches
        .into_iter()
        .filter(|p| {
            p.enabled != Value::Bool(false)
                && p.enabled != Value::String("false".to_string())
        })
        .collect();

    // ── 1. Merge EditData patches by target ─────────────────────────────
    let mut edit_data_groups: BTreeMap<String, Vec<&ChangeRegistryPatch>> = BTreeMap::new();
    let mut standalone_patches = Vec::new();

    for patch in &active_patches {
        let action = patch.action.trim().to_lowercase();
        if action == "editdata" {
            edit_data_groups
                .entry(patch.target.clone())
                .or_default()
                .push(patch);
        } else {
            standalone_patches.push(patch);
        }
    }

    let mut changes: Vec<Value> = Vec::new();

    // ── 2. Build merged EditData changes ────────────────────────────────
    for (target, patches) in edit_data_groups {
        let mut entries = Map::new();
        let mut fields: Map<String, Value> = Map::new();
        let mut text_operations: Vec<Value> = Vec::new();
        let mut move_entries: Vec<Value> = Vec::new();
        for patch in &patches {
            if let Some(state) = patch.editor_state.as_object() {
                if let Some(patch_entries) = state.get("entries").and_then(Value::as_object) {
                    for (k, v) in patch_entries {
                        entries.insert(k.clone(), v.clone());
                    }
                }
                // Merge Fields (EntryKey -> { FieldName -> Value })
                if let Some(patch_fields) = state.get("fields").and_then(Value::as_object) {
                    for (entry_key, field_map) in patch_fields {
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
                // Collect TextOperations
                if let Some(patch_ops) = state.get("textOperations").and_then(Value::as_array) {
                    text_operations.extend(patch_ops.iter().cloned());
                }
                // Collect MoveEntries
                if let Some(patch_moves) = state.get("moveEntries").and_then(Value::as_array) {
                    move_entries.extend(patch_moves.iter().cloned());
                }
            }
        }

        let mut change = Map::new();
        change.insert("Action".to_string(), json!("EditData"));
        change.insert("Target".to_string(), json!(target));
        if !entries.is_empty() {
            change.insert("Entries".to_string(), Value::Object(entries));
        }
        if !fields.is_empty() {
            change.insert("Fields".to_string(), Value::Object(fields));
        }
        if !text_operations.is_empty() {
            change.insert("TextOperations".to_string(), Value::Array(text_operations));
        }
        if !move_entries.is_empty() {
            change.insert("MoveEntries".to_string(), Value::Array(move_entries));
        }
        // CP PatchConfig common fields from first patch
        if let Some(first) = patches.first() {
            if !first.log_name.is_empty() {
                change.insert("LogName".to_string(), json!(first.log_name.clone()));
            }
            if let Some(token) = first.enabled.as_str() {
                change.insert("Enabled".to_string(), json!(token));
            }
            if let Some(from_file) = &first.from_file {
                change.insert("FromFile".to_string(), json!(from_file));
            }
            if let Some(when) = &first.when {
                change.insert("When".to_string(), stringify_when_values(when));
            }
            if let Some(target_locale) = &first.target_locale {
                change.insert("TargetLocale".to_string(), json!(target_locale));
            }
            if let Some(update) = &first.update {
                change.insert("Update".to_string(), json!(update));
            }
            if let Some(priority) = &first.priority {
                change.insert("Priority".to_string(), priority.clone());
            }
            if let Some(local_tokens) = &first.local_tokens {
                change.insert("LocalTokens".to_string(), local_tokens.clone());
            }
            if let Some(target_field) = &first.target_field {
                if !target_field.is_empty() {
                    change.insert("TargetField".to_string(), json!(target_field));
                }
            }
        }
        changes.push(Value::Object(change));
    }

    // ── 3. Build standalone changes (EditImage / EditMap / Load) ────────
    for patch in standalone_patches {
        let mut change = Map::new();
        change.insert("Action".to_string(), json!(patch.action.clone()));
        change.insert("Target".to_string(), json!(patch.target.clone()));
        change.insert("LogName".to_string(), json!(patch.log_name.clone()));

        // enabled can be bool or string token
        if let Some(token) = patch.enabled.as_str() {
            change.insert("Enabled".to_string(), json!(token));
        }

        if let Some(from_file) = &patch.from_file {
            change.insert("FromFile".to_string(), json!(from_file));
        }

        if let Some(when) = &patch.when {
            change.insert("When".to_string(), stringify_when_values(when));
        }

        // CP PatchConfig advanced fields
        if let Some(target_locale) = &patch.target_locale {
            change.insert("TargetLocale".to_string(), json!(target_locale));
        }
        if let Some(update) = &patch.update {
            change.insert("Update".to_string(), json!(update));
        }
        if let Some(priority) = &patch.priority {
            change.insert("Priority".to_string(), priority.clone());
        }
        if let Some(local_tokens) = &patch.local_tokens {
            change.insert("LocalTokens".to_string(), local_tokens.clone());
        }
        if let Some(target_field) = &patch.target_field {
            if !target_field.is_empty() {
                change.insert("TargetField".to_string(), json!(target_field));
            }
        }

        // editor_state may carry action-specific fields (FromArea, ToArea, MapProperties, etc.)
        if let Some(state) = patch.editor_state.as_object() {
            for (k, v) in state {
                // Skip the "entries" key because that is handled above for EditData
                if k == "entries" {
                    continue;
                }
                // Map internal field names to CP field names
                let cp_key = if patch.action.to_lowercase() == "editmap" {
                    match k.as_str() {
                        "properties" => "MapProperties",
                        "warps" => "AddWarps",
                        "npcWarps" => "AddNpcWarps",
                        "mapTiles" => "MapTiles",
                        _ => k,
                    }
                } else if k == "patchMode" {
                    "PatchMode"
                } else {
                    k
                };
                // Convert warps array to CP's AddWarps / AddNpcWarps string format
                if (cp_key == "AddWarps" || cp_key == "AddNpcWarps") && v.is_array() {
                    let warps: Vec<String> = v.as_array().unwrap_or(&vec![])
                        .iter()
                        .filter_map(|w| w.as_object())
                        .map(|w| {
                            let from_x = w.get("fromX").and_then(Value::as_i64).unwrap_or(0);
                            let from_y = w.get("fromY").and_then(Value::as_i64).unwrap_or(0);
                            let to_map = w.get("toMap").and_then(Value::as_str).unwrap_or("");
                            let to_x = w.get("toX").and_then(Value::as_i64).unwrap_or(0);
                            let to_y = w.get("toY").and_then(Value::as_i64).unwrap_or(0);
                            format!("{} {} {} {} {}", from_x, from_y, to_map, to_x, to_y)
                        })
                        .collect();
                    change.insert(cp_key.to_string(), json!(warps));
                } else if cp_key == "MapTiles" && v.is_array() {
                    let tiles: Vec<Value> = v.as_array().unwrap_or(&vec![])
                        .iter()
                        .filter_map(|t| t.as_object())
                        .map(|t| {
                            let mut tile = Map::new();
                            tile.insert("Layer".to_string(), json!(t.get("layer").and_then(Value::as_str).unwrap_or("Back")));
                            tile.insert("Position".to_string(), json!({
                                "X": t.get("x").and_then(Value::as_i64).unwrap_or(0),
                                "Y": t.get("y").and_then(Value::as_i64).unwrap_or(0),
                            }));
                            if let Some(tile_index) = t.get("tileIndex").and_then(Value::as_i64) {
                                tile.insert("TileIndex".to_string(), json!(tile_index));
                            }
                            if let Some(props) = t.get("setProperties").and_then(Value::as_object) {
                                tile.insert("SetProperties".to_string(), Value::Object(props.clone()));
                            }
                            Value::Object(tile)
                        })
                        .collect();
                    change.insert("MapTiles".to_string(), json!(tiles));
                } else if (k == "fromArea" || k == "toArea") && v.is_object() {
                    // Convert x/y/width/height to CP's X/Y/Width/Height
                    if let Some(obj) = v.as_object() {
                        let mapped = json!({
                            "X": obj.get("x").and_then(Value::as_i64).unwrap_or(0),
                            "Y": obj.get("y").and_then(Value::as_i64).unwrap_or(0),
                            "Width": obj.get("width").and_then(Value::as_i64).unwrap_or(0),
                            "Height": obj.get("height").and_then(Value::as_i64).unwrap_or(0),
                        });
                        let cp_area_key = if k == "fromArea" { "FromArea" } else { "ToArea" };
                        change.insert(cp_area_key.to_string(), mapped);
                    }
                } else {
                    change.insert(cp_key.to_string(), v.clone());
                }
            }
        }

        changes.push(Value::Object(change));
    }

    let mut content = Map::new();
    content.insert("Format".to_string(), json!("2.0.0"));
    content.insert("Changes".to_string(), Value::Array(changes));
    if !draft.dynamic_tokens.is_empty() {
        let tokens: Vec<Value> = draft.dynamic_tokens.iter().map(|t| {
            let mut token = Map::new();
            token.insert("Name".to_string(), json!(t.name));
            token.insert("Value".to_string(), json!(t.value));
            Value::Object(token)
        }).collect();
        content.insert("DynamicTokens".to_string(), Value::Array(tokens));
    }
    if !draft.custom_locations.is_empty() {
        let locations: Vec<Value> = draft.custom_locations.iter().map(|loc| {
            let mut location = Map::new();
            location.insert("Name".to_string(), json!(loc.name));
            location.insert("FromMapFile".to_string(), json!(loc.from_map_file));
            if !loc.migrate_legacy_names.is_empty() {
                location.insert("MigrateLegacyNames".to_string(), json!(loc.migrate_legacy_names));
            }
            Value::Object(location)
        }).collect();
        content.insert("CustomLocations".to_string(), Value::Array(locations));
    }
    if !draft.alias_token_names.is_empty() {
        let alias_map = Map::from_iter(
            draft.alias_token_names.iter().map(|(k, v)| (k.clone(), json!(v)))
        );
        content.insert("AliasTokenNames".to_string(), Value::Object(alias_map));
    }

    serde_json::to_string_pretty(&Value::Object(content))
        .map(|s| format!("{s}\n"))
        .map_err(|error| {
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidExport,
                GeneratedProjectDraftOperation::Export,
                format!("Failed to serialize content.json: {error}"),
            )
            .with_draft_storage_key(draft.draft_storage_key.clone())
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::generated_project::types::{
        ChangeRegistryPatch, CustomLocation, DynamicToken, GeneratedProjectMetadata,
    };

    fn make_test_draft(registry: ChangeRegistry) -> GeneratedProjectDraftRecord {
        GeneratedProjectDraftRecord {
            draft_storage_key: "test".to_string(),
            project_metadata: GeneratedProjectMetadata {
                project_name: "TestMod".to_string(),
                project_description: "".to_string(),
                project_author: "Author".to_string(),
                project_version: "1.0.0".to_string(),
                project_unique_id: "Author.TestMod".to_string(),
                game_root_path: None,
                content_pack_for_unique_id: "Pathoschild.ContentPatcher".to_string(),
            },
            overlay_targets: Vec::new(),
            config_schema_draft: json!({}),
            serialized_change_registry: serde_json::to_value(registry).unwrap(),
            dynamic_tokens: Vec::new(),
            custom_locations: Vec::new(),
            alias_token_names: BTreeMap::new(),
            event_source_snapshots_by_target: BTreeMap::new(),
            last_draft_saved_at: None,
            last_exported_at: None,
            last_export_path: None,
            last_export_fingerprint: None,
        }
    }

    #[test]
    fn manifest_contains_name_and_unique_id() {
        let draft = make_test_draft(ChangeRegistry::default());
        let manifest = build_manifest_json(&draft).unwrap();
        assert!(manifest.contains("\"Name\": \"TestMod\""));
        assert!(manifest.contains("\"UniqueID\": \"Author.TestMod\""));
        assert!(manifest.contains("\"ContentPackFor\""));
    }

    #[test]
    fn content_json_with_single_edit_data_patch() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditData".to_string(),
                log_name: "Town props".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({
                    "entries": {
                        "Music": "springtown",
                        "Outdoors": true,
                    }
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Format\": \"2.0.0\""));
        assert!(content.contains("\"Action\": \"EditData\""));
        assert!(content.contains("\"Target\": \"Maps/Town\""));
        assert!(content.contains("\"Music\""));
        assert!(content.contains("\"Outdoors\""));
    }

    #[test]
    fn disabled_patches_are_omitted() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditData".to_string(),
                log_name: "Town props".to_string(),
                enabled: json!(false),
                when: None,
                from_file: None,
                editor_state: json!({"entries": {"Music": "springtown"}}),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(!content.contains("Maps/Town"));
        assert!(content.contains("\"Changes\": []"));
    }

    #[test]
    fn edit_image_patch_keeps_standalone() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "characters".to_string(),
                target: "Portraits/Abigail".to_string(),
                action: "EditImage".to_string(),
                log_name: "Abigail portrait".to_string(),
                enabled: json!(true),
                when: None,
                from_file: Some("assets/portraits/abigail.png".to_string()),
                editor_state: json!({
                    "FromArea": { "X": 0, "Y": 0, "Width": 64, "Height": 64 }
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditImage\""));
        assert!(content.contains("\"FromFile\": \"assets/portraits/abigail.png\""));
        assert!(content.contains("\"FromArea\""));
    }

    #[test]
    fn edit_data_fields_are_merged() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "events".to_string(),
                target: "Data/Objects".to_string(),
                action: "EditData".to_string(),
                log_name: "Edit objects".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({
                    "entries": { "74": "Diamond/250/-300/Mining/1/Diamond/..." },
                    "fields": {
                        "74": { "Price": "500" },
                        "60": { "DisplayName": "Ruby Gem" }
                    }
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditData\""));
        assert!(content.contains("\"Target\": \"Data/Objects\""));
        assert!(content.contains("\"Entries\""));
        assert!(content.contains("\"Fields\""));
        assert!(content.contains("\"Price\": \"500\""));
        assert!(content.contains("\"DisplayName\": \"Ruby Gem\""));
    }

    #[test]
    fn edit_data_fields_merge_across_patches() {
        let registry = ChangeRegistry {
            patches: vec![
                ChangeRegistryPatch {
                    id: "p1".to_string(),
                    workspace: "events".to_string(),
                    target: "Data/Objects".to_string(),
                    action: "EditData".to_string(),
                    log_name: "Edit price".to_string(),
                    enabled: json!(true),
                    when: None,
                    from_file: None,
                    editor_state: json!({
                        "fields": { "74": { "Price": "500" } }
                    }),
                    ..Default::default()
                },
                ChangeRegistryPatch {
                    id: "p2".to_string(),
                    workspace: "events".to_string(),
                    target: "Data/Objects".to_string(),
                    action: "EditData".to_string(),
                    log_name: "Edit name".to_string(),
                    enabled: json!(true),
                    when: None,
                    from_file: None,
                    editor_state: json!({
                        "fields": { "74": { "DisplayName": "Sparkly Diamond" } }
                    }),
                    ..Default::default()
                },
            ],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        // Same target should be merged into a single change
        let changes_count = content.matches("\"Action\": \"EditData\"").count();
        assert_eq!(changes_count, 1, "should merge same-target EditData patches");
        assert!(content.contains("\"Price\": \"500\""));
        assert!(content.contains("\"DisplayName\": \"Sparkly Diamond\""));
    }

    #[test]
    fn edit_data_text_operations_are_collected() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "events".to_string(),
                target: "Data/NPCGiftTastes".to_string(),
                action: "EditData".to_string(),
                log_name: "Add to universal love".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({
                    "textOperations": [
                        { "Operation": "Append", "Target": ["Entries", "Universal_Love"], "Value": "74", "Delimiter": " " }
                    ]
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditData\""));
        assert!(content.contains("\"TextOperations\""));
        assert!(content.contains("\"Operation\": \"Append\""));
        assert!(content.contains("\"Value\": \"74\""));
        assert!(content.contains("\"Entries\"") && content.contains("\"Universal_Love\""));
    }

    #[test]
    fn enabled_string_token_is_serialized() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditMap".to_string(),
                log_name: "Town edit".to_string(),
                enabled: json!("{{EnableMapEdit}}"),
                when: None,
                from_file: None,
                editor_state: json!({"properties": {"Music": "springtown"}}),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Enabled\": \"{{EnableMapEdit}}\""));
        assert!(content.contains("\"Action\": \"EditMap\""));
    }

    #[test]
    fn disabled_patch_with_string_false_is_omitted() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditData".to_string(),
                log_name: "Town props".to_string(),
                enabled: json!("false"),
                when: None,
                from_file: None,
                editor_state: json!({"entries": {"Music": "springtown"}}),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(!content.contains("Maps/Town"));
    }

    #[test]
    fn edit_map_map_tiles_are_serialized() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditMap".to_string(),
                log_name: "Town tiles".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({
                    "mapTiles": [
                        {
                            "layer": "Back",
                            "x": 5,
                            "y": 10,
                            "tileIndex": 42,
                            "setProperties": {"Passable": "T"}
                        }
                    ]
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditMap\""));
        assert!(content.contains("\"MapTiles\""));
        assert!(content.contains("\"Layer\": \"Back\""));
        assert!(content.contains("\"Position\""));
        assert!(content.contains("\"X\": 5"));
        assert!(content.contains("\"Y\": 10"));
        assert!(content.contains("\"TileIndex\": 42"));
        assert!(content.contains("\"SetProperties\""));
        assert!(content.contains("\"Passable\""));
    }

    #[test]
    fn patch_config_advanced_fields_are_serialized() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditMap".to_string(),
                log_name: "Town edit".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({"properties": {"Music": "springtown"}}),
                target_locale: Some("zh-CN".to_string()),
                update: Some("OnDayStart".to_string()),
                priority: Some(json!("Early")),
                local_tokens: Some(json!({"SeasonUpper": "{{Season}}".to_string()})),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"TargetLocale\": \"zh-CN\""));
        assert!(content.contains("\"Update\": \"OnDayStart\""));
        assert!(content.contains("\"Priority\": \"Early\""));
        assert!(content.contains("\"LocalTokens\""));
        assert!(content.contains("\"SeasonUpper\""));
    }

    #[test]
    fn edit_data_move_entries_are_merged() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "events".to_string(),
                target: "Data/MoviesReactions".to_string(),
                action: "EditData".to_string(),
                log_name: "Reorder reactions".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({
                    "moveEntries": [
                        { "ID": "abigail", "BeforeId": "alex" },
                        { "ID": "alex", "AfterId": "abigail" }
                    ]
                }),
                ..Default::default()
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditData\""));
        assert!(content.contains("\"MoveEntries\""));
        assert!(content.contains("\"abigail\""));
        assert!(content.contains("\"alex\""));
    }

    #[test]
    fn dynamic_tokens_are_serialized_at_root() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditMap".to_string(),
                log_name: "Town edit".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({"properties": {"Music": "springtown"}}),
                ..Default::default()
            }],
        };
        let mut draft = make_test_draft(registry);
        draft.dynamic_tokens = vec![
            DynamicToken {
                name: "SeasonUpper".to_string(),
                value: "{{uppercase {{Season}}}}".to_string(),
            },
            DynamicToken {
                name: "PlayerName".to_string(),
                value: "{{PlayerName}}".to_string(),
            },
        ];
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"DynamicTokens\""));
        assert!(content.contains("\"Name\": \"SeasonUpper\""));
        assert!(content.contains("\"Value\": \"{{uppercase {{Season}}}}\""));
        assert!(content.contains("\"Name\": \"PlayerName\""));
        assert!(content.contains("\"Format\": \"2.0.0\""));
    }

    #[test]
    fn custom_locations_are_serialized_at_root() {
        let registry = ChangeRegistry {
            patches: vec![ChangeRegistryPatch {
                id: "p1".to_string(),
                workspace: "map".to_string(),
                target: "Maps/Town".to_string(),
                action: "EditMap".to_string(),
                log_name: "Town edit".to_string(),
                enabled: json!(true),
                when: None,
                from_file: None,
                editor_state: json!({"properties": {"Music": "springtown"}}),
                ..Default::default()
            }],
        };
        let mut draft = make_test_draft(registry);
        draft.custom_locations = vec![
            CustomLocation {
                name: "MyMod_AbigailCloset".to_string(),
                from_map_file: "assets/abigail-closet.tmx".to_string(),
                migrate_legacy_names: vec!["Custom_AbbyRoom".to_string()],
            },
        ];
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"CustomLocations\""));
        assert!(content.contains("\"Name\": \"MyMod_AbigailCloset\""));
        assert!(content.contains("\"FromMapFile\": \"assets/abigail-closet.tmx\""));
        assert!(content.contains("\"MigrateLegacyNames\""));
        assert!(content.contains("\"Custom_AbbyRoom\""));
    }
}
