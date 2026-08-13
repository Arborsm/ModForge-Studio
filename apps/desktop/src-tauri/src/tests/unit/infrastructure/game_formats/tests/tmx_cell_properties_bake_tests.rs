use crate::infrastructure::game_formats::map::{
    MapDocument, MapFormat, MapLayer, MapLayerDataEncoding, MapLayerOrderEntry, MapObject,
    MapObjectGroup, MapPropertyValue, TMX_FLIPPED_HORIZONTALLY_FLAG,
};
use crate::infrastructure::game_formats::tmx::{parse_tmx_map, serialize_tmx_map};
use std::collections::HashMap;
use std::path::Path;

fn layer(name: &str, id: u32, width: u32, height: u32, gids: Vec<u32>) -> MapLayer {
    MapLayer {
        id,
        name: name.to_string(),
        kind: "tile".to_string(),
        width,
        height,
        visible: true,
        opacity: 1.0,
        offset_x: 0.0,
        offset_y: 0.0,
        properties: HashMap::new(),
        gids,
        non_empty_tiles: 0,
        data_encoding: MapLayerDataEncoding::Csv,
        data_compression: None,
        cell_properties: HashMap::new(),
        cell_animations: HashMap::new(),
        preserved_xml: Vec::new(),
    }
}

fn document(layers: Vec<MapLayer>) -> MapDocument {
    MapDocument {
        name: "Test".to_string(),
        format: MapFormat::Tmx,
        source_path: "Maps/Test.tmx".to_string(),
        relative_path: "Maps/Test.tmx".to_string(),
        width: layers.first().map(|item| item.width).unwrap_or(0),
        height: layers.first().map(|item| item.height).unwrap_or(0),
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        tmx_version: Some("1.10".to_string()),
        tiled_version: None,
        next_layer_id: Some(2),
        next_object_id: Some(1),
        infinite: false,
        properties: HashMap::new(),
        tilesets: Vec::new(),
        layer_order: layers
            .iter()
            .map(|item| MapLayerOrderEntry::TileLayer(item.id))
            .collect(),
        layers,
        object_groups: Vec::new(),
        preserved_xml: Vec::new(),
    }
}

fn property(name: &str, value: MapPropertyValue) -> HashMap<String, MapPropertyValue> {
    HashMap::from([(name.to_string(), value)])
}

#[test]
fn bakes_cell_properties_into_tile_data_objects_after_their_layer() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 0, 2, 3]);
    back.cell_properties
        .insert(0, property("Diggable", MapPropertyValue::Bool(true)));
    back.cell_properties.insert(
        3,
        property(
            "TouchAction",
            MapPropertyValue::String("Warp 1 2".to_string()),
        ),
    );
    let document = document(vec![back]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    assert!(serialized.contains(
        r#"<objectgroup id="3" name="Back" visible="1" opacity="1" draworder="topdown">"#
    ));
    assert!(serialized.contains(
        r#"<object id="2" name="TileData" type="TileData" x="0" y="0" width="16" height="16" rotation="0" visible="1">"#
    ));
    assert!(serialized.contains(r#"<property name="Diggable" value="true" type="bool"/>"#));
    assert!(serialized.contains(
        r#"<object id="3" name="TileData" type="TileData" x="16" y="16" width="16" height="16" rotation="0" visible="1">"#
    ));
    assert!(serialized.contains(r#"<property name="TouchAction" value="Warp 1 2"/>"#));
    // The baked object group follows its tile layer in the output.
    let layer_end = serialized.find("</layer>").expect("layer element");
    let group_start = serialized
        .find(r#"<objectgroup id="3" name="Back""#)
        .expect("baked object group");
    assert!(layer_end < group_start, "{serialized}");
    // Serialization is a temporary view: the document keeps its cell properties.
    assert!(document.layers[0].cell_properties.contains_key(&0));
    assert!(document.object_groups.is_empty());
}

#[test]
fn skips_empty_cells_and_cells_whose_gid_is_only_flags() {
    let mut back = layer(
        "Back",
        1,
        2,
        2,
        vec![
            1,
            TMX_FLIPPED_HORIZONTALLY_FLAG,
            0,
            TMX_FLIPPED_HORIZONTALLY_FLAG | 4,
        ],
    );
    for index in 0..4 {
        back.cell_properties.insert(
            index,
            property("Frame", MapPropertyValue::Number(index as f64)),
        );
    }
    let document = document(vec![back]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // Cell 1 carries only the flip flag (base gid 0) and cell 2 is empty: both are skipped.
    assert_eq!(serialized.matches(r#"name="TileData""#).count(), 2);
    assert!(
        serialized.contains(r#"x="0" y="0" width="16" height="16""#),
        "{serialized}"
    );
    assert!(
        serialized.contains(r#"x="16" y="16" width="16" height="16""#),
        "{serialized}"
    );
}

#[test]
fn reuses_existing_group_and_skips_cells_already_covered() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 2, 0, 0]);
    back.cell_properties
        .insert(0, property("Diggable", MapPropertyValue::Bool(true)));
    back.cell_properties
        .insert(1, property("Frame", MapPropertyValue::Number(7.0)));
    let existing = MapObject {
        id: 4,
        name: "TileData".to_string(),
        r#type: "TileData".to_string(),
        x: 0.0,
        y: 0.0,
        width: 16.0,
        height: 16.0,
        rotation: 0.0,
        visible: true,
        gid: None,
        template: None,
        class: None,
        shape: "rectangle".to_string(),
        properties: property("Existing", MapPropertyValue::String("kept".to_string())),
        preserved_xml: Vec::new(),
    };
    let mut document = document(vec![back]);
    document.object_groups.push(MapObjectGroup {
        id: 3,
        name: "Back".to_string(),
        kind: "object".to_string(),
        visible: true,
        opacity: 1.0,
        draw_order: "topdown".to_string(),
        properties: HashMap::new(),
        objects: vec![existing],
        preserved_xml: Vec::new(),
    });

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // Cell 0 is covered by the existing object; only cell 1 bakes a new one.
    assert_eq!(serialized.matches(r#"name="TileData""#).count(), 2);
    assert!(!serialized.contains(r#"name="Diggable""#), "{serialized}");
    assert!(
        serialized.contains(r#"name="Existing" value="kept""#),
        "{serialized}"
    );
    // The group keeps its id and the new object avoids existing ids (max 4 + 1).
    assert!(
        serialized.contains(r#"<objectgroup id="3" name="Back""#),
        "{serialized}"
    );
    assert!(
        serialized.contains(r#"<object id="5" name="TileData" type="TileData" x="16" y="0""#),
        "{serialized}"
    );
}

#[test]
fn allocates_group_and_object_ids_above_all_existing_ids() {
    let mut back = layer("Back", 1, 2, 1, vec![1, 2]);
    back.cell_properties
        .insert(0, property("Frame", MapPropertyValue::Number(1.0)));
    let other = layer("Other", 7, 2, 1, vec![0, 0]);
    let mut document = document(vec![back, other]);
    document.next_layer_id = Some(2);
    document.object_groups.push(MapObjectGroup {
        id: 100,
        name: "OtherGroup".to_string(),
        kind: "object".to_string(),
        visible: true,
        opacity: 1.0,
        draw_order: "topdown".to_string(),
        properties: HashMap::new(),
        objects: vec![MapObject {
            id: 50,
            name: "Path".to_string(),
            r#type: String::new(),
            x: 0.0,
            y: 0.0,
            width: 16.0,
            height: 16.0,
            rotation: 0.0,
            visible: true,
            gid: None,
            template: None,
            class: None,
            shape: "rectangle".to_string(),
            properties: HashMap::new(),
            preserved_xml: Vec::new(),
        }],
        preserved_xml: Vec::new(),
    });

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // New group id clears layer ids (max 7) and existing group ids (100): 101.
    assert!(
        serialized.contains(r#"<objectgroup id="101" name="Back""#),
        "{serialized}"
    );
    // New object id clears next_object_id (2) and existing object ids (50): 51.
    assert!(
        serialized.contains(r#"<object id="51" name="TileData""#),
        "{serialized}"
    );
    // No new group collides with a layer id.
    assert!(
        !serialized.contains(r#"<objectgroup id="7""#),
        "{serialized}"
    );
}

#[test]
fn documents_without_cell_properties_serialize_unchanged() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="4" nextobjectid="2"><objectgroup id="3" name="Paths"><object id="1" name="TileData" type="TileData" x="16" y="16" width="16" height="16"><properties><property name="TouchAction" value="Warp 1 2"/></properties></object></objectgroup><layer id="2" name="Back" width="2" height="2"><data encoding="csv">1,0,0,0</data></layer></map>"#;
    let parsed = parse_tmx_map(xml.as_bytes(), Path::new("Maps/Test.tmx"), "Maps/Test.tmx")
        .expect("parse fixture");
    assert!(parsed.layers[0].cell_properties.is_empty());

    let serialized = String::from_utf8(serialize_tmx_map(&parsed).unwrap()).unwrap();
    // The pre-existing object group keeps its original position before the layer.
    let group_start = serialized
        .find(r#"<objectgroup id="3" name="Paths""#)
        .expect("original object group");
    let layer_start = serialized
        .find(r#"<layer id="2" name="Back""#)
        .expect("original layer");
    assert!(group_start < layer_start, "{serialized}");
    // No TileData objects are invented and the existing one is preserved verbatim.
    assert_eq!(serialized.matches(r#"name="TileData""#).count(), 1);
    assert!(serialized.contains(
        r#"<object id="1" name="TileData" type="TileData" x="16" y="16" width="16" height="16""#
    ));
    assert!(serialized.contains(r#"name="TouchAction" value="Warp 1 2""#));
}

#[test]
fn repeated_serialization_is_stable_and_does_not_mutate_the_document() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 2, 3, 4]);
    back.cell_properties
        .insert(0, property("Diggable", MapPropertyValue::Bool(true)));
    back.cell_properties
        .insert(3, property("Frame", MapPropertyValue::Number(2.0)));
    let document = document(vec![back]);

    let first = serialize_tmx_map(&document).unwrap();
    let second = serialize_tmx_map(&document).unwrap();
    assert_eq!(first, second);
    assert!(document.object_groups.is_empty());
    assert_eq!(document.layers[0].cell_properties.len(), 2);
}
