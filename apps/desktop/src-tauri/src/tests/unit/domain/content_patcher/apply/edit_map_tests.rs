use super::super::super::assets::LoadedMapAsset;
use super::super::super::types::{ContentPatcherMapDebugSummary, ContentPatcherProjectSnapshot};
use super::{apply_edit_map_patch, apply_map_patch};
use crate::infrastructure::game_formats::map::{
    MapFormat, MapLayerDataEncoding, TMX_FLIPPED_HORIZONTALLY_FLAG,
};
use crate::infrastructure::game_formats::tbin::{
    MapDocument, MapLayer, MapPropertyValue, serialize_tbin_map,
};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

fn empty_map_document() -> MapDocument {
    MapDocument {
        name: "Test".to_string(),
        format: MapFormat::Xnb,
        source_path: "Content/Maps/Test.xnb".to_string(),
        relative_path: "Content/Maps/Test.xnb".to_string(),
        width: 4,
        height: 4,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        tmx_version: None,
        tiled_version: None,
        next_layer_id: Some(2),
        next_object_id: Some(1),
        infinite: false,
        properties: HashMap::new(),
        tilesets: vec![crate::infrastructure::game_formats::tbin::MapTileset {
            first_gid: 1,
            name: "spring_outdoorsTileSheet".to_string(),
            tile_width: 16,
            tile_height: 16,
            tile_count: 100,
            columns: 10,
            source: None,
            margin: 0,
            spacing: 0,
            tile_offset_x: 0,
            tile_offset_y: 0,
            image_source: None,
            image_path: None,
            image_width: None,
            image_height: None,
            image_trans: None,
            properties: HashMap::new(),
            tile_properties: HashMap::new(),
            animations: HashMap::new(),
            preserved_attributes: HashMap::new(),
            tile_preserved_attributes: HashMap::new(),
            tile_preserved_xml: HashMap::new(),
            preserved_xml: Vec::new(),
        }],
        layers: vec![MapLayer {
            id: 1,
            name: "Back".to_string(),
            kind: "TileLayer".to_string(),
            width: 4,
            height: 4,
            visible: true,
            opacity: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            properties: HashMap::new(),
            gids: vec![0; 16],
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

fn empty_snapshot() -> ContentPatcherProjectSnapshot {
    ContentPatcherProjectSnapshot {
        summary: Default::default(),
        sources: Vec::new(),
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    }
}

fn loaded_map() -> LoadedMapAsset {
    LoadedMapAsset {
        document: empty_map_document(),
        debug: ContentPatcherMapDebugSummary::default(),
    }
}

fn patch_from(obj: Value) -> Map<String, Value> {
    obj.as_object().unwrap().clone()
}

#[test]
fn apply_map_properties_adds_and_updates() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "MapProperties": {
            "Music": "spring1",
            "Outdoors": true
        }
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    let props = &map.document.properties;
    assert_eq!(
        props.get("Music"),
        Some(&MapPropertyValue::String("spring1".to_string()))
    );
    assert_eq!(props.get("Outdoors"), Some(&MapPropertyValue::Bool(true)));
}

#[test]
fn apply_warps_adds_warp_entries() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "AddWarps": [
            "5 10 Farm 20 25",
            "6 11 Town 30 35"
        ]
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    // Warps are stored as a MapProperty, not as object groups
    let warp_prop = map.document.properties.get("Warp");
    assert!(warp_prop.is_some(), "Warp property should exist");
    let warp_str = match warp_prop.unwrap() {
        MapPropertyValue::String(s) => s.as_str(),
        other => panic!("Expected string warp property, got {:?}", other),
    };
    assert_eq!(warp_str, "6 11 Town 30 35 5 10 Farm 20 25");
}

#[test]
fn apply_map_tiles_sets_tile_index() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    // SetIndex must be a string; SetTilesheet is required when no tile exists
    let patch = patch_from(json!({
        "MapTiles": [
            {
                "Layer": "Back",
                "Position": { "X": 1, "Y": 2 },
                "SetTilesheet": "spring_outdoorsTileSheet",
                "SetIndex": "42"
            }
        ]
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    let layer = map
        .document
        .layers
        .iter()
        .find(|l| l.name == "Back")
        .unwrap();
    // width=4, so (1,2) is index 1 + 2*4 = 9
    // tileset first_gid=1 + SetIndex 42 = 43
    assert_eq!(layer.gids[9], 43);
}

#[test]
fn apply_map_tiles_accepts_numeric_index_and_boolean_remove_then_replace() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    map.document.layers[0].gids[0] = 8;
    map.document.layers[0].cell_properties.insert(
        0,
        HashMap::from([(
            "Old".to_string(),
            MapPropertyValue::String("value".to_string()),
        )]),
    );
    let patch = patch_from(json!({
        "MapTiles": [{
            "Layer": "Back",
            "Position": { "X": 0, "Y": 0 },
            "Remove": true,
            "SetTilesheet": "spring_outdoorsTileSheet",
            "SetIndex": 12,
            "SetProperties": { "TouchAction": "MagicWarp Test 1 2" }
        }]
    }));

    apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json")
        .expect("apply remove and replacement");

    let layer = &map.document.layers[0];
    assert_eq!(layer.gids[0], 13);
    assert_eq!(
        layer.cell_properties[&0].get("TouchAction"),
        Some(&MapPropertyValue::String("MagicWarp Test 1 2".to_string()))
    );
    assert!(!layer.cell_properties[&0].contains_key("Old"));
    assert!(map.document.tilesets[0].tile_properties.is_empty());
}

#[test]
fn apply_map_tiles_removes_tile() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    // Pre-set a tile
    {
        let layer = map
            .document
            .layers
            .iter_mut()
            .find(|l| l.name == "Back")
            .unwrap();
        layer.gids[5] = 100;
    }
    let patch = patch_from(json!({
        "MapTiles": [
            {
                "Layer": "Back",
                "Position": { "X": 1, "Y": 1 },
                "Remove": "true"
            }
        ]
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    let layer = map
        .document
        .layers
        .iter()
        .find(|l| l.name == "Back")
        .unwrap();
    // width=4, so (1,1) is index 1 + 1*4 = 5
    assert_eq!(layer.gids[5], 0);
}

#[test]
fn apply_combined_map_properties_and_tiles() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "MapProperties": {
            "Music": "summer1"
        },
        "MapTiles": [
            {
                "Layer": "Back",
                "Position": { "X": 0, "Y": 0 },
                "SetTilesheet": "spring_outdoorsTileSheet",
                "SetIndex": "1"
            }
        ]
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(
        map.document.properties.get("Music"),
        Some(&MapPropertyValue::String("summer1".to_string()))
    );
    let layer = map
        .document
        .layers
        .iter()
        .find(|l| l.name == "Back")
        .unwrap();
    // tileset first_gid=1 + SetIndex 1 = 2
    assert_eq!(layer.gids[0], 2);
}

#[test]
fn apply_remove_layer_removes_existing_layer() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    // Add a second layer so we can remove one
    map.document.layers.push(MapLayer {
        id: 2,
        name: "Front".to_string(),
        kind: "TileLayer".to_string(),
        width: 4,
        height: 4,
        visible: true,
        opacity: 1.0,
        offset_x: 0.0,
        offset_y: 0.0,
        properties: HashMap::new(),
        gids: vec![0; 16],
        non_empty_tiles: 0,
        data_encoding: MapLayerDataEncoding::Csv,
        data_compression: None,
        cell_properties: HashMap::new(),
        cell_animations: HashMap::new(),
        preserved_xml: Vec::new(),
    });
    let patch = patch_from(json!({
        "RemoveLayer": "Back"
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    assert!(
        map.document
            .layers
            .iter()
            .find(|l| l.name == "Back")
            .is_none()
    );
    assert!(
        map.document
            .layers
            .iter()
            .find(|l| l.name == "Front")
            .is_some()
    );
}

#[test]
fn apply_add_layer_creates_empty_layer() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "AddLayer": "Buildings"
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    let buildings = map.document.layers.iter().find(|l| l.name == "Buildings");
    assert!(buildings.is_some());
    assert_eq!(buildings.unwrap().gids.len(), 16);
}

#[test]
fn apply_remove_layer_and_add_layer_combined() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "RemoveLayer": ["Back"],
        "AddLayer": "Buildings"
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    assert!(
        map.document
            .layers
            .iter()
            .find(|l| l.name == "Back")
            .is_none()
    );
    assert!(
        map.document
            .layers
            .iter()
            .find(|l| l.name == "Buildings")
            .is_some()
    );
}

#[test]
fn apply_replace_by_layer_adds_source_only_layer() {
    let temp_dir = std::env::temp_dir().join("modforge-edit-map-replace-by-layer");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(temp_dir.join("assets")).expect("assets dir");

    let mut source_document = empty_map_document();
    source_document.layers = vec![MapLayer {
        id: 1,
        name: "Buildings".to_string(),
        kind: "tile".to_string(),
        width: 4,
        height: 4,
        visible: true,
        opacity: 1.0,
        offset_x: 0.0,
        offset_y: 0.0,
        properties: HashMap::new(),
        gids: vec![7; 16],
        non_empty_tiles: 16,
        data_encoding: MapLayerDataEncoding::Csv,
        data_compression: None,
        cell_properties: HashMap::new(),
        cell_animations: HashMap::new(),
        preserved_xml: Vec::new(),
    }];
    let source_bytes = serialize_tbin_map(&source_document).expect("serialize source map");
    std::fs::write(temp_dir.join("assets").join("source.tbin"), source_bytes)
        .expect("write source map");

    let snapshot = ContentPatcherProjectSnapshot {
        summary: crate::domain::content_patcher::types::ContentPatcherProjectSummary {
            absolute_path: Some(temp_dir.to_string_lossy().into_owned()),
            ..Default::default()
        },
        ..empty_snapshot()
    };
    let mut map = loaded_map();
    let patch = patch_from(json!({
        "FromFile": "assets/source.tbin"
    }));

    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    let buildings = map
        .document
        .layers
        .iter()
        .find(|layer| layer.name == "Buildings")
        .expect("source-only layer");
    assert_eq!(buildings.kind, "tile");
    assert_eq!(buildings.non_empty_tiles, 16);
    assert_eq!(buildings.gids[0], 7);

    std::fs::remove_dir_all(temp_dir).expect("cleanup");
}

#[test]
fn overlay_copies_source_only_layers_metadata_cells_and_renames_tileset_conflicts() {
    let mut target = empty_map_document();
    target.tilesets[0].name = "shared".to_string();
    target.tilesets[0].image_source = Some("tiles/old.png".to_string());
    let mut source = empty_map_document();
    source.tilesets[0].name = "shared".to_string();
    source.tilesets[0].image_source = Some("tiles/new.png".to_string());
    source.layers[0].properties.insert(
        "LayerFlag".to_string(),
        MapPropertyValue::String("source".to_string()),
    );
    source.layers[0].gids[0] = TMX_FLIPPED_HORIZONTALLY_FLAG | 1;
    source.layers[0].cell_properties.insert(
        0,
        HashMap::from([(
            "TouchAction".to_string(),
            MapPropertyValue::String("Warp 1 2".to_string()),
        )]),
    );
    let mut source_only = source.layers[0].clone();
    source_only.id = 2;
    source_only.name = "Buildings".to_string();
    source_only.gids[1] = 1;
    source.layers.push(source_only);

    let mut debug = ContentPatcherMapDebugSummary::default();
    apply_map_patch(&mut target, &mut debug, &source, None, None, "Overlay")
        .expect("apply overlay");

    assert_eq!(target.tilesets.len(), 2);
    assert_eq!(target.tilesets[1].name, "z_shared");
    let back = target
        .layers
        .iter()
        .find(|layer| layer.name == "Back")
        .unwrap();
    assert_eq!(
        back.properties.get("LayerFlag"),
        Some(&MapPropertyValue::String("source".to_string()))
    );
    assert_eq!(back.gids[0], TMX_FLIPPED_HORIZONTALLY_FLAG | 101);
    assert!(back.cell_properties.contains_key(&0));
    let buildings = target
        .layers
        .iter()
        .find(|layer| layer.name == "Buildings")
        .expect("overlay source-only layer");
    assert_eq!(buildings.gids[1], 101);
    assert!(target.layer_order.iter().any(|entry| {
        matches!(entry, crate::infrastructure::game_formats::map::MapLayerOrderEntry::TileLayer(id) if *id == buildings.id)
    }));
}
