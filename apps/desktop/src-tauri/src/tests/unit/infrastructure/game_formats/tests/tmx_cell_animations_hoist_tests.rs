use crate::infrastructure::game_formats::map::{
    MapDocument, MapFormat, MapLayer, MapLayerDataEncoding, MapLayerOrderEntry, MapPropertyValue,
    MapTileset, MapTilesetAnimationFrame, TMX_FLIPPED_HORIZONTALLY_FLAG,
};
use crate::infrastructure::game_formats::tmx::serialize_tmx_map;
use std::collections::HashMap;

fn tileset(first_gid: u32) -> MapTileset {
    MapTileset {
        first_gid,
        name: format!("Tiles{first_gid}"),
        tile_width: 16,
        tile_height: 16,
        tile_count: 16,
        columns: 4,
        source: None,
        margin: 0,
        spacing: 0,
        tile_offset_x: 0,
        tile_offset_y: 0,
        image_source: Some("tiles.png".to_string()),
        image_path: None,
        image_width: Some(64),
        image_height: Some(64),
        image_trans: None,
        properties: HashMap::new(),
        tile_properties: HashMap::new(),
        animations: HashMap::new(),
        preserved_attributes: HashMap::new(),
        tile_preserved_attributes: HashMap::new(),
        tile_preserved_xml: HashMap::new(),
        preserved_xml: Vec::new(),
    }
}

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

fn frames(entries: &[(u32, u32)]) -> Vec<MapTilesetAnimationFrame> {
    entries
        .iter()
        .map(|(tile_id, duration)| MapTilesetAnimationFrame {
            tile_id: *tile_id,
            duration: *duration,
        })
        .collect()
}

fn document(layers: Vec<MapLayer>, tilesets: Vec<MapTileset>) -> MapDocument {
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
        tilesets,
        layer_order: layers
            .iter()
            .map(|item| MapLayerOrderEntry::TileLayer(item.id))
            .collect(),
        layers,
        object_groups: Vec::new(),
        preserved_xml: Vec::new(),
    }
}

#[test]
fn hoists_cell_animations_into_tileset_definitions_and_keeps_gids() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 17, 0, 1]);
    back.cell_animations
        .insert(0, frames(&[(2, 100), (3, 200)]));
    // Cell 3 shares base id 1 with cell 0: the sorted pass writes cell 0 first.
    back.cell_animations.insert(3, frames(&[(5, 50)]));
    let document = document(vec![back], vec![tileset(1), tileset(17)]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // The animation lands on tileset Tiles1 (firstgid 1) as tile id 0.
    assert!(
        serialized.contains(r#"<tileset firstgid="1" name="Tiles1" tilewidth="16" tileheight="16" tilecount="16" columns="4" margin="0" spacing="0">"#),
        "{serialized}"
    );
    assert!(serialized.contains(r#"<tile id="0">"#), "{serialized}");
    assert!(
        serialized.contains(r#"<frame tileid="2" duration="100"/>"#),
        "{serialized}"
    );
    assert!(
        serialized.contains(r#"<frame tileid="3" duration="200"/>"#),
        "{serialized}"
    );
    // The later cell (same base id) does not overwrite the first writer.
    assert!(!serialized.contains(r#"tileid="5""#), "{serialized}");
    // Cell gids stay unmapped in the layer data.
    assert!(
        serialized.contains("<data encoding=\"csv\">1,17,"),
        "{serialized}"
    );
    // No animation is invented for tileset Tiles17 (firstgid 17).
    let t17_start = serialized
        .find(r#"<tileset firstgid="17""#)
        .unwrap_or(serialized.len());
    assert!(
        !serialized[t17_start..].contains("<tile id="),
        "{serialized}"
    );
    // Serialization is a temporary view: the document keeps its per-cell data.
    assert!(document.layers[0].cell_animations.contains_key(&0));
    assert!(document.tilesets[0].animations.is_empty());
}

#[test]
fn first_writer_wins_over_existing_definition_level_animations() {
    let mut ground = tileset(1);
    ground.animations.insert(1, frames(&[(0, 50)])); // local id 1 = base gid 2
    let mut back = layer("Back", 1, 2, 2, vec![2, 2, 0, 0]);
    back.cell_animations.insert(0, frames(&[(4, 120)]));
    back.cell_animations.insert(1, frames(&[(5, 140)]));
    let document = document(vec![back], vec![ground]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // The definition-level animation wins; neither cell overwrites it.
    assert!(serialized.contains(r#"<tile id="1">"#), "{serialized}");
    assert!(
        serialized.contains(r#"<frame tileid="0" duration="50"/>"#),
        "{serialized}"
    );
    assert!(!serialized.contains(r#"tileid="4""#), "{serialized}");
    assert!(!serialized.contains(r#"tileid="5""#), "{serialized}");
}

#[test]
fn skips_empty_and_flag_only_gids() {
    let mut back = layer("Back", 1, 1, 3, vec![0, TMX_FLIPPED_HORIZONTALLY_FLAG, 1]);
    for index in 0..3 {
        back.cell_animations.insert(index, frames(&[(1, 100)]));
    }
    let document = document(vec![back], vec![tileset(1)]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    // Only the cell with a real base gid (index 2) hoists an animation.
    assert!(serialized.contains(r#"<tile id="0">"#), "{serialized}");
    assert!(
        serialized.contains(r#"<frame tileid="1" duration="100"/>"#),
        "{serialized}"
    );
    assert_eq!(serialized.matches("<animation>").count(), 1, "{serialized}");
}

#[test]
fn repeated_serialization_is_stable_and_does_not_mutate_the_document() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 2, 3, 4]);
    back.cell_animations
        .insert(0, frames(&[(2, 100), (3, 200)]));
    back.cell_animations.insert(2, frames(&[(7, 90)]));
    let document = document(vec![back], vec![tileset(1)]);

    let first = serialize_tmx_map(&document).unwrap();
    let second = serialize_tmx_map(&document).unwrap();
    assert_eq!(first, second);
    assert_eq!(document.layers[0].cell_animations.len(), 2);
    assert!(document.tilesets[0].animations.is_empty());
}

#[test]
fn documents_without_cell_animations_serialize_unchanged() {
    let mut back = layer("Back", 1, 2, 2, vec![1, 2, 0, 0]);
    back.cell_properties.insert(
        0,
        HashMap::from([("Diggable".to_string(), MapPropertyValue::Bool(true))]),
    );
    let document = document(vec![back], vec![tileset(1)]);

    let serialized = String::from_utf8(serialize_tmx_map(&document).unwrap()).unwrap();
    assert!(!serialized.contains("<animation>"), "{serialized}");
    // The cell-property bake still runs (tileset serialization is untouched).
    assert!(
        serialized.contains(r#"<property name="Diggable" value="true" type="bool"/>"#),
        "{serialized}"
    );
}
