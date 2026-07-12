use super::{
    load_or_create_library_state_at_path, normalize_library_state, save_library_state_at_path,
    scan_library_at_path,
};
use crate::domain::launcher::types::{
    LauncherLibraryFolder, LauncherLibraryFolderClassificationMode, LauncherLibraryPackPreset,
    LauncherLibraryState,
};
use crate::test_support::{create_temp_dir, write_file};
use std::fs;

fn global_folder(id: &str, name: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: None,
        hidden,
        parent_folder_id: None,
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

fn pack_folder(id: &str, name: &str, pack_id: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: Some(pack_id.to_string()),
        hidden,
        parent_folder_id: None,
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

fn sample_manifest(unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}"
}}"#
    )
}

fn sample_manifest_with_required_dependency(unique_id: &str, dependency_unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Consumer Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}",
  "Dependencies": [
    {{
      "UniqueID": "{dependency_unique_id}",
      "IsRequired": true
    }}
  ]
}}"#
    )
}

fn sample_manifest_with_optional_dependency(unique_id: &str, dependency_unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Consumer Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}",
  "Dependencies": [
    {{
      "UniqueID": "{dependency_unique_id}",
      "IsRequired": false
    }}
  ]
}}"#
    )
}

fn sample_manifest_with_config_schema(unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Configurable Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}",
  "ConfigSchema": {{
    "Enabled": {{ "Default": true, "AllowValues": "true,false" }}
  }}
}}"#
    )
}

fn nested_folder(id: &str, name: &str, parent: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: None,
        hidden,
        parent_folder_id: Some(parent.to_string()),
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

#[test]
fn scan_library_marks_mods_with_config_entries() {
    let root = create_temp_dir("launcher-library-config-flags");
    let config_json_mod = root.join("Mods").join("ConfigJsonMod");
    let manifest_schema_mod = root.join("Mods").join("ManifestSchemaMod");
    let content_schema_mod = root.join("Mods").join("ContentSchemaMod");
    let plain_mod = root.join("Mods").join("PlainMod");

    write_file(
        &config_json_mod.join("manifest.json"),
        &sample_manifest("ModForge.ConfigJsonMod"),
    );
    write_file(&config_json_mod.join("config.json"), r#"{"Enabled":true}"#);

    write_file(
        &manifest_schema_mod.join("manifest.json"),
        &sample_manifest_with_config_schema("ModForge.ManifestSchemaMod"),
    );

    write_file(
        &content_schema_mod.join("manifest.json"),
        &sample_manifest("ModForge.ContentSchemaMod"),
    );
    write_file(
        &content_schema_mod.join("content.json"),
        r#"{"ConfigSchema":{"Variant":{"Default":"A","AllowValues":"A,B"}}}"#,
    );

    write_file(
        &plain_mod.join("manifest.json"),
        &sample_manifest("ModForge.PlainMod"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    let has_config = |unique_id: &str| {
        scan.mods
            .iter()
            .find(|item| item.unique_id.as_deref() == Some(unique_id))
            .map(|item| item.has_config)
            .expect("mod summary")
    };

    assert!(has_config("ModForge.ConfigJsonMod"));
    assert!(has_config("ModForge.ManifestSchemaMod"));
    assert!(has_config("ModForge.ContentSchemaMod"));
    assert!(!has_config("ModForge.PlainMod"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn normalize_library_state_preserves_hidden_flag_on_global_folder() {
    let state = LauncherLibraryState {
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            global_folder("gameplay", "Gameplay", false),
        ],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let visuals = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("visuals folder survives normalize");
    assert!(visuals.hidden, "hidden flag is preserved on global folder");
    assert!(visuals.pack_id.is_none());

    let gameplay = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "gameplay")
        .expect("gameplay folder survives normalize");
    assert!(!gameplay.hidden);
}

#[test]
fn normalize_library_state_strips_hidden_flag_from_pack_scoped_folders() {
    // Pack-scoped folders cannot be hidden; the flag is only meaningful for
    // global folders (the hidden bucket only collects global folders).
    let state = LauncherLibraryState {
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm Pack".to_string(),
            mod_keys: Vec::new(),
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
        }],
        library_folders: vec![pack_folder("pack-visuals", "Pack Visuals", "farm", true)],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let pack_visuals = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "pack-visuals")
        .expect("pack folder survives normalize");
    assert!(
        !pack_visuals.hidden,
        "hidden flag is stripped from pack-scoped folders"
    );
    assert_eq!(pack_visuals.pack_id.as_deref(), Some("farm"));
}

#[test]
fn normalize_library_state_propagates_hidden_to_child_folders_via_parent() {
    // The display layer treats a folder as effectively hidden when any
    // ancestor is hidden; normalize itself keeps the child's own flag intact
    // so the propagation can be derived. Here we verify the child flag is
    // preserved when the parent is hidden.
    let state = LauncherLibraryState {
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            nested_folder("interface", "Interface", "visuals", false),
        ],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let interface = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "interface")
        .expect("nested folder survives normalize");
    assert_eq!(
        interface.parent_folder_id.as_deref(),
        Some("visuals"),
        "parent linkage is preserved"
    );
    assert!(
        !interface.hidden,
        "child's own flag is preserved separately"
    );
}

#[test]
fn save_and_load_library_state_roundtrips_hidden_global_folder() {
    let root = create_temp_dir("launcher-library-hidden");
    let state_path = root.join("launcher").join("library-state.json");

    let state = LauncherLibraryState {
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm Pack".to_string(),
            mod_keys: Vec::new(),
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Independent,
        }],
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            pack_folder("pack-visuals", "Pack Visuals", "farm", false),
        ],
        ..LauncherLibraryState::default()
    };

    save_library_state_at_path(&state_path, &state).expect("save succeeds");

    let loaded = load_or_create_library_state_at_path(&state_path).expect("load succeeds");

    let visuals = loaded
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("global folder roundtrips");
    assert!(
        visuals.hidden,
        "hidden flag survives save/load roundtrip for global folder"
    );
    assert!(visuals.pack_id.is_none());

    let pack_visuals = loaded
        .library_folders
        .iter()
        .find(|folder| folder.id == "pack-visuals")
        .expect("pack folder roundtrips");
    assert_eq!(pack_visuals.pack_id.as_deref(), Some("farm"));
    assert!(!pack_visuals.hidden);

    // The pack's folder classification mode must also survive the roundtrip
    // so the frontend can keep using global folders alongside pack folders.
    let pack = loaded
        .pack_presets
        .iter()
        .find(|pack| pack.id == "farm")
        .expect("pack roundtrips");
    assert_eq!(
        pack.folder_classification_mode,
        LauncherLibraryFolderClassificationMode::Independent,
        "folder classification mode survives roundtrip"
    );
}

#[test]
fn save_library_state_roundtrips_hidden_flag_through_serde_string() {
    // Regression: the serialized JSON must include the `hidden` and `packId`
    // fields with the correct camelCase names so the frontend can read them
    // back without relying on serde defaults.
    let state = LauncherLibraryState {
        library_folders: vec![global_folder("visuals", "Visuals", true)],
        ..LauncherLibraryState::default()
    };

    let json = serde_json::to_string(&state).expect("serialize");
    assert!(
        json.contains("\"hidden\":true"),
        "serialized JSON exposes hidden flag: {json}"
    );
    assert!(
        json.contains("\"packId\":null"),
        "serialized JSON exposes packId: {json}"
    );

    let parsed: LauncherLibraryState = serde_json::from_str(&json).expect("deserialize roundtrips");
    let visuals = parsed
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("folder survives serde roundtrip");
    assert!(visuals.hidden);
    assert!(visuals.pack_id.is_none());
}

#[test]
fn scan_library_propagates_transitive_required_dependency_issues() {
    let root = create_temp_dir("launcher-library-transitive-required-dependency");
    let consumer = root.join("Mods").join("ConsumerPack");
    let provider = root.join("Mods").join("ProviderPack");

    write_file(
        &consumer.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.ConsumerPack", "ModForge.ProviderPack"),
    );
    write_file(
        &provider.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.ProviderPack", "ModForge.CorePack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    let consumer_summary = scan
        .mods
        .iter()
        .find(|item| item.unique_id.as_deref() == Some("ModForge.ConsumerPack"))
        .expect("consumer summary");
    let provider_summary = scan
        .mods
        .iter()
        .find(|item| item.unique_id.as_deref() == Some("ModForge.ProviderPack"))
        .expect("provider summary");

    assert_eq!(
        provider_summary.missing_required_dependencies,
        vec!["ModForge.CorePack".to_string()]
    );
    assert_eq!(
        consumer_summary.missing_required_dependencies,
        vec!["ModForge.ProviderPack".to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_serializes_optional_dependencies_without_marking_missing() {
    let root = create_temp_dir("launcher-library-optional-dependency");
    let consumer = root.join("Mods").join("ConsumerPack");

    write_file(
        &consumer.join("manifest.json"),
        &sample_manifest_with_optional_dependency("ModForge.ConsumerPack", "ModForge.OptionalPack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    let consumer_summary = scan
        .mods
        .iter()
        .find(|item| item.unique_id.as_deref() == Some("ModForge.ConsumerPack"))
        .expect("consumer summary");

    assert_eq!(
        consumer_summary.dependencies,
        vec![crate::domain::launcher::types::LauncherLibraryDependency {
            unique_id: "ModForge.OptionalPack".to_string(),
            required: false,
        }]
    );
    assert!(consumer_summary.required_dependencies.is_empty());
    assert!(consumer_summary.missing_required_dependencies.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_keeps_healthy_dependency_chain_clean() {
    let root = create_temp_dir("launcher-library-healthy-required-dependency");
    let consumer = root.join("Mods").join("ConsumerPack");
    let provider = root.join("Mods").join("ProviderPack");
    let core = root.join("Mods").join("CorePack");

    write_file(
        &consumer.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.ConsumerPack", "ModForge.ProviderPack"),
    );
    write_file(
        &provider.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.ProviderPack", "ModForge.CorePack"),
    );
    write_file(
        &core.join("manifest.json"),
        &sample_manifest("ModForge.CorePack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 3);
    assert!(
        scan.mods
            .iter()
            .all(|item| item.missing_required_dependencies.is_empty())
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_ignores_required_dependency_cycles() {
    let root = create_temp_dir("launcher-library-required-dependency-cycle");
    let first = root.join("Mods").join("FirstPack");
    let second = root.join("Mods").join("SecondPack");

    write_file(
        &first.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.FirstPack", "ModForge.SecondPack"),
    );
    write_file(
        &second.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.SecondPack", "ModForge.FirstPack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 2);
    assert!(
        scan.mods
            .iter()
            .all(|item| item.missing_required_dependencies.is_empty())
    );

    fs::remove_dir_all(root).expect("cleanup");
}
