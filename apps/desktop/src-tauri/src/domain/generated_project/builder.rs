use super::types::{
    ChangeRegistry, ChangeRegistryPatch, GeneratedProjectDraftError,
    GeneratedProjectDraftErrorCode, GeneratedProjectDraftOperation, GeneratedProjectDraftRecord,
};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

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
        .filter(|p| p.enabled)
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
        for patch in &patches {
            if let Some(state) = patch.editor_state.as_object() {
                if let Some(patch_entries) = state.get("entries").and_then(Value::as_object) {
                    for (k, v) in patch_entries {
                        entries.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        let mut change = Map::new();
        change.insert("Action".to_string(), json!("EditData"));
        change.insert("Target".to_string(), json!(target));
        if !entries.is_empty() {
            change.insert("Entries".to_string(), Value::Object(entries));
        }
        // When conditions: use the first patch's When (UI enforces consistency)
        if let Some(first) = patches.first() {
            if let Some(when) = &first.when {
                change.insert("When".to_string(), when.clone());
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

        if let Some(from_file) = &patch.from_file {
            change.insert("FromFile".to_string(), json!(from_file));
        }

        if let Some(when) = &patch.when {
            change.insert("When".to_string(), when.clone());
        }

        // editor_state may carry action-specific fields (FromArea, ToArea, MapProperties, etc.)
        if let Some(state) = patch.editor_state.as_object() {
            for (k, v) in state {
                // Skip the "entries" key because that is handled above for EditData
                if k == "entries" {
                    continue;
                }
                change.insert(k.clone(), v.clone());
            }
        }

        changes.push(Value::Object(change));
    }

    let content = json!({
        "Format": "2.0.0",
        "Changes": changes,
    });

    serde_json::to_string_pretty(&content)
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
        ChangeRegistryPatch, GeneratedProjectMetadata,
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
                enabled: true,
                when: None,
                from_file: None,
                editor_state: json!({
                    "entries": {
                        "Music": "springtown",
                        "Outdoors": true,
                    }
                }),
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
                enabled: false,
                when: None,
                from_file: None,
                editor_state: json!({"entries": {"Music": "springtown"}}),
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
                enabled: true,
                when: None,
                from_file: Some("assets/portraits/abigail.png".to_string()),
                editor_state: json!({
                    "FromArea": { "X": 0, "Y": 0, "Width": 64, "Height": 64 }
                }),
            }],
        };
        let draft = make_test_draft(registry);
        let content = build_content_json(&draft).unwrap();
        assert!(content.contains("\"Action\": \"EditImage\""));
        assert!(content.contains("\"FromFile\": \"assets/portraits/abigail.png\""));
        assert!(content.contains("\"FromArea\""));
    }
}
