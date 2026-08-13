use crate::domain::cp_maker::build_cp_maker_map_asset;
use crate::domain::cp_maker::types::BuildCpMakerMapAssetRequest;
use crate::infrastructure::game_formats::map::{
    MapFormat, MapLayerDataEncoding, MapTileset, MapTilesetAnimationFrame,
};
use crate::infrastructure::game_formats::tbin::{
    MapDocument, MapLayer, MapPropertyValue, parse_tbin_map,
};
use crate::infrastructure::game_formats::tmx::parse_tmx_map;
use base64::Engine;
use std::collections::HashMap;
use std::path::Path;

fn sample_map_document() -> MapDocument {
    MapDocument {
        name: "PreviewTown".to_string(),
        format: MapFormat::Xnb,
        source_path: "Content/Maps/PreviewTown.xnb".to_string(),
        relative_path: "Content/Maps/PreviewTown.xnb".to_string(),
        width: 2,
        height: 1,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        tmx_version: None,
        tiled_version: None,
        next_layer_id: Some(2),
        next_object_id: Some(1),
        infinite: false,
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
            data_encoding: MapLayerDataEncoding::Csv,
            data_compression: None,
            cell_properties: HashMap::new(),
            cell_animations: HashMap::new(),
            preserved_xml: Vec::new(),
        }],
        object_groups: Vec::new(),
        layer_order: Vec::new(),
        preserved_xml: Vec::new(),
    }
}

fn sample_external_tileset(source: &str, name: &str) -> MapTileset {
    MapTileset {
        first_gid: 1,
        name: name.to_string(),
        tile_width: 16,
        tile_height: 16,
        tile_count: 4,
        columns: 2,
        source: Some(source.to_string()),
        margin: 0,
        spacing: 0,
        tile_offset_x: 0,
        tile_offset_y: 0,
        image_source: Some("shared-town.png".to_string()),
        image_path: None,
        image_width: Some(32),
        image_height: Some(32),
        image_trans: None,
        properties: HashMap::from([(
            "Season".to_string(),
            MapPropertyValue::String("spring".to_string()),
        )]),
        tile_properties: HashMap::from([(
            1,
            HashMap::from([(
                "Action".to_string(),
                MapPropertyValue::String("Message Hello".to_string()),
            )]),
        )]),
        animations: HashMap::from([(
            2,
            vec![MapTilesetAnimationFrame {
                tile_id: 3,
                duration: 120,
            }],
        )]),
        preserved_attributes: HashMap::new(),
        tile_preserved_attributes: HashMap::new(),
        tile_preserved_xml: HashMap::new(),
        preserved_xml: Vec::new(),
    }
}

#[test]
fn build_cp_maker_map_asset_serializes_map_document_as_tbin_preview_asset() {
    let request = BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tbin".to_string(),
        map_document: sample_map_document(),
    };

    let result = build_cp_maker_map_asset(request).expect("build map preview asset");
    let asset = result.asset;

    assert_eq!(asset.relative_path, "assets/maps/preview-town.tbin");
    assert!(result.companion_assets.is_empty());
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
fn build_cp_maker_map_asset_serializes_map_document_as_tmx() {
    let result = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tmx".to_string(),
        map_document: sample_map_document(),
    })
    .expect("build TMX map asset");
    let asset = result.asset;

    assert_eq!(asset.media_type, "application/xml");
    assert!(result.companion_assets.is_empty());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(asset.bytes_base64)
        .expect("decode TMX bytes");
    let parsed = parse_tmx_map(
        &bytes,
        Path::new("assets/maps/preview-town.tmx"),
        "assets/maps/preview-town.tmx",
    )
    .expect("parse generated TMX");
    assert_eq!(parsed.width, 2);
    assert_eq!(parsed.layers[0].name, "Back");
}

#[test]
fn build_cp_maker_map_asset_writes_external_tsx_companions() {
    let mut document = sample_map_document();
    document.tilesets.push(sample_external_tileset(
        "../tiles/shared-town.tsx",
        "SharedTown",
    ));

    let result = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tmx".to_string(),
        map_document: document,
    })
    .expect("build TMX and TSX assets");

    assert_eq!(result.companion_assets.len(), 1);
    let tsx = &result.companion_assets[0];
    assert_eq!(tsx.relative_path, "assets/tiles/shared-town.tsx");
    let tsx_xml = String::from_utf8(
        base64::engine::general_purpose::STANDARD
            .decode(&tsx.bytes_base64)
            .expect("decode TSX"),
    )
    .expect("TSX utf8");
    assert!(
        tsx_xml.contains("<tileset name=\"SharedTown\""),
        "{tsx_xml}"
    );
    assert!(!tsx_xml.contains("firstgid"), "{tsx_xml}");
    assert!(tsx_xml.contains("<animation>"), "{tsx_xml}");
    assert!(tsx_xml.contains("Message Hello"), "{tsx_xml}");

    let tmx_xml = String::from_utf8(
        base64::engine::general_purpose::STANDARD
            .decode(&result.asset.bytes_base64)
            .expect("decode TMX"),
    )
    .expect("TMX utf8");
    assert!(
        tmx_xml.contains("source=\"../tiles/shared-town.tsx\""),
        "{tmx_xml}"
    );
}

#[test]
fn build_cp_maker_map_asset_rejects_unsafe_or_conflicting_external_tsx() {
    let mut escaping = sample_map_document();
    escaping
        .tilesets
        .push(sample_external_tileset("../../../outside.tsx", "Outside"));
    let error = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tmx".to_string(),
        map_document: escaping,
    })
    .expect_err("reject dependency traversal");
    let message = format!("{error:#}");
    assert!(message.contains("escapes the content pack"), "{message}");

    let mut conflicting = sample_map_document();
    conflicting
        .tilesets
        .push(sample_external_tileset("shared.tsx", "First"));
    conflicting
        .tilesets
        .push(sample_external_tileset("./shared.tsx", "Second"));
    let error = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "assets/maps/preview-town.tmx".to_string(),
        map_document: conflicting,
    })
    .expect_err("reject conflicting shared TSX definitions");
    let message = format!("{error:#}");
    assert!(message.contains("conflicting definitions"), "{message}");
}

#[test]
fn build_cp_maker_map_asset_rejects_non_relative_asset_paths() {
    let error = build_cp_maker_map_asset(BuildCpMakerMapAssetRequest {
        relative_path: "../assets/maps/preview-town.tbin".to_string(),
        map_document: sample_map_document(),
    })
    .expect_err("expected relative path validation");

    let message = error.to_string();
    assert!(message.contains("must stay relative"), "{message}");
    assert!(
        message.contains("[path=../assets/maps/preview-town.tbin]"),
        "{message}"
    );
}
