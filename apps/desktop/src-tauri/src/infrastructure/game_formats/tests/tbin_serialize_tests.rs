use crate::infrastructure::game_formats::tbin::{parse_tbin_map, serialize_tbin_map};
use std::path::Path;

fn push_u8(bytes: &mut Vec<u8>, value: u8) {
    bytes.push(value);
}

fn push_i32(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_f32(bytes: &mut Vec<u8>, value: f32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_string(bytes: &mut Vec<u8>, value: &str) {
    push_i32(bytes, value.len() as i32);
    bytes.extend_from_slice(value.as_bytes());
}

fn push_properties(bytes: &mut Vec<u8>, properties: &[(&str, PropertySeed)]) {
    push_i32(bytes, properties.len() as i32);
    for (key, value) in properties {
        push_string(bytes, key);
        match value {
            PropertySeed::Bool(value) => {
                push_u8(bytes, 0);
                push_u8(bytes, u8::from(*value));
            }
            PropertySeed::Integer(value) => {
                push_u8(bytes, 1);
                push_i32(bytes, *value);
            }
            PropertySeed::Float(value) => {
                push_u8(bytes, 2);
                push_f32(bytes, *value);
            }
            PropertySeed::String(value) => {
                push_u8(bytes, 3);
                push_string(bytes, value);
            }
        }
    }
}

fn push_vector(bytes: &mut Vec<u8>, x: i32, y: i32) {
    push_i32(bytes, x);
    push_i32(bytes, y);
}

fn sample_tbin_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"tBIN10");

    push_string(&mut bytes, "Town");
    push_string(&mut bytes, "");
    push_properties(
        &mut bytes,
        &[
            ("Music", PropertySeed::String("spring_day_ambient")),
            ("Outdoors", PropertySeed::Bool(true)),
        ],
    );

    push_i32(&mut bytes, 1);
    push_string(&mut bytes, "spring_outdoorsTileSheet");
    push_string(&mut bytes, "");
    push_string(&mut bytes, "TileSheets\\spring_outdoorsTileSheet");
    push_vector(&mut bytes, 4, 2);
    push_vector(&mut bytes, 16, 16);
    push_vector(&mut bytes, 0, 0);
    push_vector(&mut bytes, 0, 0);
    push_properties(
        &mut bytes,
        &[("Season", PropertySeed::String("spring"))],
    );

    push_i32(&mut bytes, 1);
    push_string(&mut bytes, "Back");
    push_u8(&mut bytes, 1);
    push_string(&mut bytes, "");
    push_vector(&mut bytes, 3, 1);
    push_vector(&mut bytes, 16, 16);
    push_properties(&mut bytes, &[("Draw", PropertySeed::String("Ground"))]);

    push_u8(&mut bytes, b'T');
    push_string(&mut bytes, "spring_outdoorsTileSheet");

    push_u8(&mut bytes, b'S');
    push_i32(&mut bytes, 2);
    push_u8(&mut bytes, 0);
    push_properties(
        &mut bytes,
        &[("Diggable", PropertySeed::Bool(true))],
    );

    push_u8(&mut bytes, b'A');
    push_i32(&mut bytes, 90);
    push_i32(&mut bytes, 2);
    push_u8(&mut bytes, b'T');
    push_string(&mut bytes, "spring_outdoorsTileSheet");
    push_u8(&mut bytes, b'S');
    push_i32(&mut bytes, 3);
    push_u8(&mut bytes, 0);
    push_properties(
        &mut bytes,
        &[("Frame", PropertySeed::Integer(0))],
    );
    push_u8(&mut bytes, b'S');
    push_i32(&mut bytes, 4);
    push_u8(&mut bytes, 0);
    push_properties(
        &mut bytes,
        &[("Frame", PropertySeed::Integer(1))],
    );
    push_properties(
        &mut bytes,
        &[("Animated", PropertySeed::Bool(true))],
    );

    push_u8(&mut bytes, b'N');
    push_i32(&mut bytes, 1);

    bytes
}

fn assert_documents_match(
    actual: &crate::infrastructure::game_formats::tbin::MapDocument,
    expected: &crate::infrastructure::game_formats::tbin::MapDocument,
) {
    assert_eq!(actual.name, expected.name);
    assert_eq!(actual.format, expected.format);
    assert_eq!(actual.width, expected.width);
    assert_eq!(actual.height, expected.height);
    assert_eq!(actual.tile_width, expected.tile_width);
    assert_eq!(actual.tile_height, expected.tile_height);
    assert_eq!(actual.properties.len(), expected.properties.len());
    assert_eq!(actual.tilesets.len(), expected.tilesets.len());
    assert_eq!(actual.layers.len(), expected.layers.len());

    let actual_music = actual.properties.get("Music").expect("actual music property");
    let expected_music = expected.properties.get("Music").expect("expected music property");
    assert_eq!(serde_json::to_value(actual_music).unwrap(), serde_json::to_value(expected_music).unwrap());

    let actual_tileset = &actual.tilesets[0];
    let expected_tileset = &expected.tilesets[0];
    assert_eq!(actual_tileset.name, expected_tileset.name);
    assert_eq!(actual_tileset.image_source, expected_tileset.image_source);
    assert_eq!(actual_tileset.tile_width, expected_tileset.tile_width);
    assert_eq!(actual_tileset.tile_height, expected_tileset.tile_height);
    assert_eq!(actual_tileset.tile_count, expected_tileset.tile_count);
    assert_eq!(actual_tileset.columns, expected_tileset.columns);
    assert_eq!(actual_tileset.tile_properties.len(), expected_tileset.tile_properties.len());
    assert_eq!(actual_tileset.animations.len(), expected_tileset.animations.len());
    assert_eq!(
        serde_json::to_value(&actual_tileset.tile_properties).unwrap(),
        serde_json::to_value(&expected_tileset.tile_properties).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&actual_tileset.animations).unwrap(),
        serde_json::to_value(&expected_tileset.animations).unwrap()
    );

    let actual_layer = &actual.layers[0];
    let expected_layer = &expected.layers[0];
    assert_eq!(actual_layer.name, expected_layer.name);
    assert_eq!(actual_layer.width, expected_layer.width);
    assert_eq!(actual_layer.height, expected_layer.height);
    assert_eq!(actual_layer.visible, expected_layer.visible);
    assert_eq!(actual_layer.non_empty_tiles, expected_layer.non_empty_tiles);
    assert_eq!(actual_layer.gids, expected_layer.gids);
    assert_eq!(
        serde_json::to_value(&actual_layer.properties).unwrap(),
        serde_json::to_value(&expected_layer.properties).unwrap()
    );
}

enum PropertySeed<'a> {
    Bool(bool),
    Integer(i32),
    Float(f32),
    String(&'a str),
}

#[test]
fn serializes_parsed_map_document_back_to_tbin_without_losing_structure() {
    let map_path = Path::new("Content/Maps/Town.xnb");
    let relative_path = "Content/Maps/Town.xnb";
    let original = parse_tbin_map(&sample_tbin_bytes(), map_path, relative_path)
        .expect("parse original tbin");

    let serialized = serialize_tbin_map(&original).expect("serialize tbin");
    let reparsed =
        parse_tbin_map(&serialized, map_path, relative_path).expect("parse serialized tbin");

    assert_documents_match(&reparsed, &original);
}
