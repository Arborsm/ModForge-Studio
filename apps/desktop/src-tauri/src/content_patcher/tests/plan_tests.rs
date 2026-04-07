use super::{build_patch_plan, build_patch_plan_with_context};
use crate::content_patcher::context::SimulationContext;
use crate::content_patcher::project::load_content_patcher_project;
use crate::content_patcher::test_support::{create_temp_dir, write_file};
use serde_json::json;
use std::collections::BTreeSet;
use std::fs;

#[test]
fn build_patch_plan_flattens_includes_merges_when_and_splits_targets() {
    let root = create_temp_dir("cp-plan");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "patches/spring.json",
      "When": { "Season": "spring" }
    }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("spring.json"),
        r#"{
  "Changes": [
    {
      "Action": "Load",
      "Target": [ "Maps/Town", "Maps/BusStop" ],
      "FromFile": "assets/spring.png"
    }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    let plan = build_patch_plan(&snapshot).expect("plan");

    assert_eq!(plan.patches.len(), 2);
    assert_eq!(plan.patches[0].target, "Maps/Town");
    assert_eq!(plan.patches[1].target, "Maps/BusStop");
    assert_eq!(plan.patches[0].log_name, "Load -> Maps/Town");
    assert_eq!(plan.patches[1].log_name, "Load -> Maps/BusStop");
    assert_eq!(plan.patches[0].when.get("Season").and_then(|value| value.as_str()), Some("spring"));
    assert_eq!(
        plan.patches[0].id,
        "content.json->patches/spring.json#include:0:0#target:0#from:0"
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_patch_plan_uses_snapshot_raw_json_without_rereading_source_files() {
    let root = create_temp_dir("cp-plan-raw-json");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "patches/spring.json",
      "When": { "Season": "spring" }
    }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("spring.json"),
        r#"{
  "Changes": [
    {
      "Action": "Load",
      "Target": [ "Maps/Town", "Maps/BusStop" ],
      "FromFile": "assets/spring.png"
    }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    fs::remove_dir_all(&root).expect("remove source files");

    let plan = build_patch_plan(&snapshot).expect("plan");
    assert_eq!(plan.patches.len(), 2);
}

#[test]
fn build_patch_plan_distinguishes_ids_for_duplicate_include_sites() {
    let root = create_temp_dir("cp-plan-duplicate-include-sites");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "patches/shared.json", "When": { "Season": "spring" } },
    { "Action": "Include", "FromFile": "patches/shared.json", "When": { "Season": "summer" } }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("shared.json"),
        r#"{
  "Changes": [
    { "Action": "Load", "Target": "Maps/Town", "FromFile": "assets/town.png" }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    let plan = build_patch_plan(&snapshot).expect("plan");

    assert_eq!(plan.patches.len(), 2);
    let ids = plan.patches.iter().map(|patch| patch.id.clone()).collect::<BTreeSet<_>>();
    assert_eq!(ids.len(), 2, "expected distinct ids per include site");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_patch_plan_merges_parent_and_child_when_with_child_precedence() {
    let root = create_temp_dir("cp-plan-when-merge");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "patches/shared.json",
      "When": { "Weather": "rain", "Season": "spring", "LocationName": "Town" }
    }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("shared.json"),
        r#"{
  "Changes": [
    {
      "Action": "Load",
      "Target": "Maps/Town",
      "FromFile": "assets/town.png",
      "When": { "Season": "summer", "Day": "15" }
    }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    let plan = build_patch_plan(&snapshot).expect("plan");
    let patch = plan.patches.first().expect("patch");

    assert_eq!(patch.when.get("Weather").and_then(|value| value.as_str()), Some("rain"));
    assert_eq!(patch.when.get("LocationName").and_then(|value| value.as_str()), Some("Town"));
    assert_eq!(patch.when.get("Day").and_then(|value| value.as_str()), Some("15"));
    assert_eq!(patch.when.get("Season").and_then(|value| value.as_str()), Some("summer"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_patch_plan_uses_config_schema_defaults_in_tokenized_targets() {
    let root = create_temp_dir("cp-plan-config-default-target");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "ConfigSchema": {
    "Variant": {
      "AllowValues": "base, festive",
      "Default": "festive"
    }
  },
  "Changes": [
    {
      "Action": "Load",
      "Target": "TileSheets/{{Variant}}_crops",
      "FromFile": "assets/crops.png"
    }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    let plan = build_patch_plan_with_context(&snapshot, &SimulationContext::default()).expect("plan");

    assert_eq!(plan.patches[0].target, "TileSheets/festive_crops");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_patch_plan_prefers_explicit_config_values_over_schema_defaults() {
    let root = create_temp_dir("cp-plan-config-override-target");
    write_file(
        &root.join("manifest.json"),
        r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    );
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "ConfigSchema": {
    "Variant": {
      "AllowValues": "base, festive",
      "Default": "festive"
    }
  },
  "Changes": [
    {
      "Action": "Load",
      "Target": "TileSheets/{{Variant}}_crops",
      "FromFile": "assets/crops.png"
    }
  ]
}"#,
    );

    let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    let plan = build_patch_plan_with_context(
        &snapshot,
        &SimulationContext {
            config: [("Variant".to_string(), json!("base"))].into_iter().collect(),
            ..SimulationContext::default()
        },
    )
    .expect("plan");

    assert_eq!(plan.patches[0].target, "TileSheets/base_crops");

    fs::remove_dir_all(root).expect("cleanup");
}
