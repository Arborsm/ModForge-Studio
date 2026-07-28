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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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
fn imports_dependencies_and_the_content_pack_minimum_version() {
    let root = create_temp_dir("import-dependencies");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "TestMod",
  "Author": "Author",
  "Version": "1.0.0",
  "UniqueID": "Author.TestMod",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher", "MinimumVersion": "2.5.0" },
  "Dependencies": [
    { "UniqueID": "Author.Required", "MinimumVersion": "1.2.0" },
    { "UniqueID": "Author.Optional", "IsRequired": false },
    { "MinimumVersion": "9.9.9" }
  ]
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{"Format": "2.0.0", "Changes": []}"#,
    );

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
    assert_eq!(
        draft.project_metadata.content_pack_for_minimum_version,
        Some("2.5.0".to_string())
    );
    // The third entry has no `UniqueID`, so SMAPI could not resolve it either.
    assert_eq!(draft.project_metadata.dependencies.len(), 2);

    let required = &draft.project_metadata.dependencies[0];
    assert_eq!(required.unique_id, "Author.Required");
    assert_eq!(required.minimum_version, Some("1.2.0".to_string()));
    assert!(required.is_required, "absent IsRequired means required");

    let optional = &draft.project_metadata.dependencies[1];
    assert_eq!(optional.unique_id, "Author.Optional");
    assert_eq!(optional.minimum_version, None);
    assert!(!optional.is_required);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn imports_i18n_files_into_the_managed_draft() {
    let root = create_temp_dir("import-i18n");
    write_file(
        &root.join("manifest.json"),
        r#"{"Name":"Test","Author":"Author","Version":"1.0.0","UniqueID":"Author.Test","ContentPackFor":{"UniqueID":"Pathoschild.ContentPatcher"}}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );
    write_file(&root.join("i18n/default.json"), r#"{"ui.save":"Save"}"#);
    write_file(&root.join("i18n/zh-CN.json"), r#"{"ui.save":"保存"}"#);

    let draft = import_cp_maker_pack(root.to_str().expect("root path")).expect("import pack");
    assert_eq!(draft.i18n_files.len(), 2);
    assert_eq!(draft.i18n_files[0].locale, "default");
    assert_eq!(draft.i18n_files[1].locale, "zh-CN");
    assert!(draft.i18n_files[1].raw_json.contains("保存"));
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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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

    let draft = import_cp_maker_pack(root.to_str().unwrap()).unwrap();
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
