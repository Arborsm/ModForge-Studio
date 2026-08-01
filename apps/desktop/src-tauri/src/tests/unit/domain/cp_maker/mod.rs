mod export_tests;
mod map_asset_tests;
mod storage_tests;

use crate::domain::cp_maker::project_assets::{import_project_assets_at_dir, project_assets_dir};
use crate::domain::cp_maker::types::CpMakerSession;
use crate::domain::cp_maker::{
    load_cp_maker_project_map_asset_at_dir, load_cp_maker_session_at_path,
    save_cp_maker_session_at_path,
};
use crate::test_support::{create_temp_dir, write_file};
use std::fs;

#[test]
fn cp_maker_session_round_trips_and_normalizes_keys() {
    let root = create_temp_dir("cp-maker-session");
    let path = root.join("session.json");
    let saved = save_cp_maker_session_at_path(
        &path,
        CpMakerSession {
            active_draft_key: Some("  draft-1  ".to_string()),
            active_generated_draft_key: Some("   ".to_string()),
        },
    )
    .expect("save session");
    assert_eq!(saved.active_draft_key.as_deref(), Some("draft-1"));
    assert!(saved.active_generated_draft_key.is_none());
    assert_eq!(
        load_cp_maker_session_at_path(&path).expect("load session"),
        saved
    );
    assert!(!path.with_extension("tmp").exists());
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn loads_and_verifies_a_persisted_project_map_asset() {
    let root = create_temp_dir("cp-maker-load-project-map");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(
        &source.join("assets/maps/TestMap.tmx"),
        r#"<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.11.0" orientation="orthogonal" renderorder="right-down" width="2" height="1" tilewidth="16" tileheight="16">
  <layer id="1" name="Back" width="2" height="1"><data encoding="csv">0,0</data></layer>
</map>"#,
    );
    let assets = import_project_assets_at_dir(&source, &projects, "draft")
        .expect("import persisted project map");

    let loaded = load_cp_maker_project_map_asset_at_dir(
        &projects,
        "draft",
        "assets/maps/TestMap.tmx",
        &assets,
    )
    .expect("load persisted project map");
    let document: serde_json::Value =
        serde_json::from_str(&loaded.content).expect("decode returned map document");
    assert_eq!(loaded.name, "TestMap");
    assert_eq!(loaded.format, "tmx");
    assert_eq!(loaded.relative_path, "assets/maps/TestMap.tmx");
    assert_eq!(document["width"], 2);
    assert_eq!(document["height"], 1);
    assert_eq!(document["layers"][0]["name"], "Back");

    fs::write(
        project_assets_dir(&projects, "draft").join("assets/maps/TestMap.tmx"),
        "<map/>",
    )
    .expect("damage persisted map");
    let error = load_cp_maker_project_map_asset_at_dir(
        &projects,
        "draft",
        "assets/maps/TestMap.tmx",
        &assets,
    )
    .expect_err("reject a map whose bytes no longer match its persisted ref");
    assert!(
        error.to_string().contains("size differs") || error.to_string().contains("hash differs")
    );

    fs::remove_dir_all(root).expect("cleanup");
}
