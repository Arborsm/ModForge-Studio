use crate::domain::manifest::{
    content_pack_for_unique_id, normalize_unique_id, project_name_from_manifest,
    required_dependency_ids, string_array_field, string_field,
};
use serde_json::json;
use std::path::Path;

#[test]
fn string_field_trims_and_ignores_blank_values() {
    let value = json!({
        "Name": "  Example Pack  ",
        "Blank": "   ",
        "Number": 42
    });

    assert_eq!(
        string_field(&value, "Name").as_deref(),
        Some("Example Pack")
    );
    assert_eq!(string_field(&value, "Blank"), None);
    assert_eq!(string_field(&value, "Number"), None);
}

#[test]
fn string_array_field_trims_and_skips_blank_entries() {
    let value = json!({
        "UpdateKeys": ["  Nexus:1  ", "", "   ", "GitHub:owner/repo", 42]
    });

    assert_eq!(
        string_array_field(&value, "UpdateKeys"),
        vec!["Nexus:1".to_string(), "GitHub:owner/repo".to_string()]
    );
}

#[test]
fn content_pack_for_unique_id_reads_nested_unique_id() {
    let manifest = json!({
        "ContentPackFor": {
            "UniqueID": "  Pathoschild.ContentPatcher  "
        }
    });

    assert_eq!(
        content_pack_for_unique_id(&manifest).as_deref(),
        Some("Pathoschild.ContentPatcher")
    );
}

#[test]
fn project_name_from_manifest_falls_back_to_folder_name() {
    let manifest = json!({});
    let project_path = Path::new("/tmp/Mods/FallbackName");

    assert_eq!(
        project_name_from_manifest(&manifest, project_path),
        "FallbackName".to_string()
    );
}

#[test]
fn project_name_from_manifest_defaults_when_folder_name_is_missing() {
    let manifest = json!({});

    assert_eq!(
        project_name_from_manifest(&manifest, Path::new("/")),
        "Unnamed Mod".to_string()
    );
}

#[test]
fn normalize_unique_id_trims_and_lowercases() {
    assert_eq!(
        normalize_unique_id("  ModForge.ExamplePack  "),
        "modforge.examplepack".to_string()
    );
}

#[test]
fn required_dependency_ids_keeps_required_unique_entries_only() {
    let manifest = json!({
        "Dependencies": [
            { "UniqueID": "  ModForge.Required  ", "IsRequired": true },
            { "UniqueID": "modforge.required", "IsRequired": true },
            { "UniqueID": "ModForge.Optional", "IsRequired": false },
            { "UniqueID": "   ", "IsRequired": true },
            { "UniqueID": 42, "IsRequired": true },
            "not-an-object"
        ]
    });

    assert_eq!(
        required_dependency_ids(&manifest),
        vec!["ModForge.Required".to_string()]
    );
}
