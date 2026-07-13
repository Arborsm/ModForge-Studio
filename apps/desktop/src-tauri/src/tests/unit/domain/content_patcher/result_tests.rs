use super::load_content_patcher_result_asset;
use crate::domain::content_patcher::context::SimulationContext;
use crate::domain::content_patcher::types::LoadContentPatcherResultAssetRequest;
use image::RgbaImage;
use std::path::PathBuf;

fn test_pack(name: &str, manifest: &str, content: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("modforge-{name}-{}", std::process::id()));
    if root.exists() {
        std::fs::remove_dir_all(&root).expect("remove previous test pack");
    }
    std::fs::create_dir_all(&root).expect("create test pack");
    std::fs::write(root.join("manifest.json"), manifest).expect("write manifest");
    std::fs::write(root.join("content.json"), content).expect("write content");
    root
}

fn load_request(path: &PathBuf, target: &str) -> LoadContentPatcherResultAssetRequest {
    LoadContentPatcherResultAssetRequest {
        path: Some(path.to_string_lossy().into_owned()),
        context: Some(SimulationContext::default()),
        target: target.to_string(),
        ..Default::default()
    }
}

const MANIFEST: &str = r#"{
  "Name": "Result Test Pack",
  "UniqueID": "ModForge.ResultTest",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#;

#[test]
fn result_loader_applies_json_entries() {
    let root = test_pack(
        "cp-json-result",
        MANIFEST,
        r#"{
  "Format": "2.0.0",
  "Changes": [{
    "Action": "EditData",
    "Target": "Data/Objects",
    "Entries": { "24": { "Name": "Parsnip", "Price": 35 } }
  }]
}"#,
    );

    let result = load_content_patcher_result_asset(load_request(&root, "Data/Objects"))
        .expect("resolve JSON target");
    assert_eq!(result.result.kind, "json");
    assert_eq!(
        result
            .result
            .json
            .and_then(|value| value.get("24").cloned())
            .and_then(|value| value.get("Price").cloned())
            .and_then(|value| value.as_i64()),
        Some(35)
    );
    assert!(result.trace.iter().any(|entry| entry.status == "applied"));
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn result_loader_materializes_image_data_url() {
    let root = test_pack(
        "cp-image-result",
        MANIFEST,
        r#"{
  "Format": "2.0.0",
  "Changes": [{
    "Action": "EditImage",
    "Target": "TileSheets/crops",
    "FromFile": "assets/crops.png"
  }]
}"#,
    );
    std::fs::create_dir_all(root.join("assets")).expect("create assets");
    RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
        .save(root.join("assets/crops.png"))
        .expect("write PNG");

    let result = load_content_patcher_result_asset(load_request(&root, "TileSheets/crops"))
        .expect("resolve image target");
    assert_eq!(result.result.kind, "image");
    assert!(
        result
            .result
            .image_data_url
            .as_deref()
            .is_some_and(|value| value.starts_with("data:image/png;base64,"))
    );
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn result_loader_returns_map_debug_summary() {
    let root = test_pack(
        "cp-map-result",
        MANIFEST,
        r#"{
  "Format": "2.0.0",
  "Changes": [{
    "Action": "EditMap",
    "Target": "Maps/Town",
    "MapProperties": { "Music": "spring" }
  }]
}"#,
    );

    let result = load_content_patcher_result_asset(load_request(&root, "Maps/Town"))
        .expect("resolve map target");
    assert_eq!(result.result.kind, "map");
    let debug = result.result.map_debug.expect("map debug");
    assert!(debug.get("layers").is_some());
    assert!(debug.get("warps").is_some());
    std::fs::remove_dir_all(root).expect("cleanup");
}
