use super::apply_edit_map_patch;
use super::super::super::assets::LoadedMapAsset;
use super::super::super::types::{ContentPatcherMapDebugSummary, ContentPatcherProjectSnapshot};
use crate::infrastructure::game_formats::tbin::{MapDocument, MapLayer, MapPropertyValue};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

fn empty_map_document() -> MapDocument {
    MapDocument {
        name: "Test".to_string(),
        format: "xnb".to_string(),
        source_path: "Content/Maps/Test.xnb".to_string(),
        relative_path: "Content/Maps/Test.xnb".to_string(),
        width: 4,
        height: 4,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        properties: HashMap::new(),
        tilesets: vec![
            crate::infrastructure::game_formats::tbin::MapTileset {
                first_gid: 1,
                name: "spring_outdoorsTileSheet".to_string(),
                tile_width: 16,
                tile_height: 16,
                tile_count: 100,
                columns: 10,
                image_source: None,
                image_path: None,
                image_width: None,
                image_height: None,
                properties: HashMap::new(),
                tile_properties: HashMap::new(),
                animations: HashMap::new(),
            },
        ],
        layers: vec![
            MapLayer {
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
            },
        ],
        object_groups: Vec::new(),
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
    assert_eq!(
        props.get("Outdoors"),
        Some(&MapPropertyValue::Bool(true))
    );
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
    assert!(warp_str.contains("5 10 Farm 20 25"), "first warp missing: {warp_str}");
    assert!(warp_str.contains("6 11 Town 30 35"), "second warp missing: {warp_str}");
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
    let layer = map.document.layers.iter()
        .find(|l| l.name == "Back")
        .unwrap();
    // width=4, so (1,2) is index 1 + 2*4 = 9
    // tileset first_gid=1 + SetIndex 42 = 43
    assert_eq!(layer.gids[9], 43);
}

#[test]
fn apply_map_tiles_removes_tile() {
    let snapshot = empty_snapshot();
    let mut map = loaded_map();
    // Pre-set a tile
    {
        let layer = map.document.layers.iter_mut()
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
    let layer = map.document.layers.iter()
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
    let layer = map.document.layers.iter()
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
    });
    let patch = patch_from(json!({
        "RemoveLayer": "Back"
    }));
    let result = apply_edit_map_patch(&snapshot, &mut map, &patch, "content.json");
    assert!(result.is_ok(), "{result:?}");
    assert!(map.document.layers.iter().find(|l| l.name == "Back").is_none());
    assert!(map.document.layers.iter().find(|l| l.name == "Front").is_some());
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
    assert!(map.document.layers.iter().find(|l| l.name == "Back").is_none());
    assert!(map.document.layers.iter().find(|l| l.name == "Buildings").is_some());
}
