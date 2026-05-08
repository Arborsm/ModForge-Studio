use crate::domain::cp_maker::build_cp_maker_map_asset;
use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, CpMakerDraftErrorCode,
    CpMakerDraftOperation,
};
use crate::infrastructure::game_formats::tbin::{
    parse_tbin_map, MapDocument, MapLayer, MapPropertyValue,
};
use base64::Engine;
use std::collections::HashMap;
use std::path::Path;

fn sample_map_document() -> MapDocument {
    MapDocument {
        name: "PreviewTown".to_string(),
        format: "xnb".to_string(),
        source_path: "Content/Maps/PreviewTown.xnb".to_string(),
        relative_path: "Content/Maps/PreviewTown.xnb".to_string(),
        width: 2,
        height: 1,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        properties: HashMap::from([
            (
                "Music".to_string(),
                MapPropertyValue::String("spring_day_ambient".to_string()),
            ),
            ("Outdoors".to_string(), MapPropertyValue::Bool(true)),
        ]),
        tilesets: Vec::new(),
        layers: vec![MapLayer {
            id: 1,
            name: "Back".to_string(),
            kind: "tile".to_string(),
            width: 2,
            height: 1,
            visible: true,
            opacity: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            properties: HashMap::new(),
            gids: vec![0, 0],
            non_empty_tiles: 0,
        }],
        object_groups: Vec::new(),
    }
}

#[test]
fn build_cp_maker_map_asset_serializes_map_document_as_tbin_preview_asset() {
    let request = BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tbin".to_string(),
        map_document: sample_map_document(),
    };

    let asset = build_cp_maker_map_asset(request).expect("build map preview asset");

    assert_eq!(asset.relative_path, "assets/maps/preview-town.tbin");
    assert_eq!(asset.media_type, "application/x-tbin");

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(asset.bytes_base64)
        .expect("decode tbin bytes");
    assert!(bytes.starts_with(b"tBIN10"));

    let parsed = parse_tbin_map(
        &bytes,
        Path::new("assets/maps/preview-town.tbin"),
        "assets/maps/preview-town.tbin",
    )
    .expect("parse serialized map");

    assert_eq!(parsed.name, "PreviewTown");
    assert_eq!(parsed.width, 2);
    assert_eq!(parsed.height, 1);
    assert_eq!(parsed.tile_width, 16);
    assert_eq!(parsed.tile_height, 16);
    assert_eq!(parsed.layers.len(), 1);
    assert_eq!(parsed.layers[0].name, "Back");
    assert_eq!(
        serde_json::to_value(parsed.properties.get("Music")).expect("serialize music"),
        serde_json::json!("spring_day_ambient")
    );
    assert_eq!(
        serde_json::to_value(parsed.properties.get("Outdoors")).expect("serialize outdoors"),
        serde_json::json!(true)
    );
}

#[test]
fn build_cp_maker_map_asset_rejects_non_relative_asset_paths() {
    let error = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "../assets/maps/preview-town.tbin".to_string(),
        map_document: sample_map_document(),
    })
    .expect_err("expected relative path validation");

    assert_eq!(error.code, CpMakerDraftErrorCode::InvalidExport);
    assert_eq!(error.operation, CpMakerDraftOperation::BuildMapAsset);
    assert!(error.message.contains("must stay relative"));
}
