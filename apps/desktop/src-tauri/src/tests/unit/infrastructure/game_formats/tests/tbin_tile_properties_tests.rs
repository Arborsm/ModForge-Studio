use crate::infrastructure::game_formats::map::{MapPropertyValue, MapTilesetAnimationFrame};
use crate::infrastructure::game_formats::tbin::{parse_tbin_map, serialize_tbin_map};
use std::path::Path;

fn push_u8(bytes: &mut Vec<u8>, value: u8) {
    bytes.push(value);
}

fn push_i32(bytes: &mut Vec<u8>, value: i32) {
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

enum PropertySeed<'a> {
    Bool(bool),
    Integer(i32),
    String(&'a str),
}

fn sample_tile_properties_tbin_bytes() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"tBIN10");

    push_string(&mut bytes, "Beach");
    push_string(&mut bytes, "");
    push_properties(&mut bytes, &[("Outdoors", PropertySeed::Bool(true))]);

    push_i32(&mut bytes, 1);
    push_string(&mut bytes, "untitled tile sheet");
    push_string(&mut bytes, "");
    push_string(&mut bytes, "");
    push_vector(&mut bytes, 32, 8);
    push_vector(&mut bytes, 16, 16);
    push_vector(&mut bytes, 0, 0);
    push_vector(&mut bytes, 0, 0);
    push_properties(
        &mut bytes,
        &[
            ("Season", PropertySeed::String("summer")),
            ("@TileIndex@249@Passable", PropertySeed::String("T")),
            ("@TileIndex@10@Water", PropertySeed::Bool(true)),
            ("@TileIndex@3@Height", PropertySeed::Integer(1)),
            ("@TileIndex@5@Type@extra", PropertySeed::String("Weird")),
            ("@TileIndex@-1@Diggable", PropertySeed::Bool(true)),
            ("@TileIndex@05@Spawnable", PropertySeed::Bool(true)),
        ],
    );

    push_i32(&mut bytes, 1);
    push_string(&mut bytes, "Back");
    push_u8(&mut bytes, 1);
    push_string(&mut bytes, "");
    push_vector(&mut bytes, 3, 1);
    push_vector(&mut bytes, 16, 16);
    push_properties(&mut bytes, &[]);

    push_u8(&mut bytes, b'T');
    push_string(&mut bytes, "untitled tile sheet");

    push_u8(&mut bytes, b'S');
    push_i32(&mut bytes, 249);
    push_u8(&mut bytes, 0);
    push_properties(&mut bytes, &[]);

    push_u8(&mut bytes, b'S');
    push_i32(&mut bytes, 10);
    push_u8(&mut bytes, 0);
    push_properties(&mut bytes, &[]);

    push_u8(&mut bytes, b'N');
    push_i32(&mut bytes, 1);

    bytes
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

#[test]
fn decodes_tilesheet_tile_properties_and_leaves_plain_and_malformed_keys() {
    let document = parse_tbin_map(
        &sample_tile_properties_tbin_bytes(),
        Path::new("Content/Maps/Beach.xnb"),
        "Content/Maps/Beach.xnb",
    )
    .expect("parse tbin");

    let tileset = &document.tilesets[0];
    assert_eq!(
        tileset.tile_properties[&249]["Passable"],
        MapPropertyValue::String("T".to_string())
    );
    assert_eq!(
        tileset.tile_properties[&10]["Water"],
        MapPropertyValue::Bool(true)
    );
    assert_eq!(
        tileset.tile_properties[&3]["Height"],
        MapPropertyValue::Number(1.0)
    );
    assert_eq!(tileset.tile_properties.len(), 3);

    assert_eq!(
        tileset.properties["Season"],
        MapPropertyValue::String("summer".to_string())
    );
    for malformed in [
        "@TileIndex@5@Type@extra",
        "@TileIndex@-1@Diggable",
        "@TileIndex@05@Spawnable",
    ] {
        assert!(
            tileset.properties.contains_key(malformed),
            "malformed key '{malformed}' must stay a plain tilesheet property"
        );
    }
    for decoded in [
        "@TileIndex@249@Passable",
        "@TileIndex@10@Water",
        "@TileIndex@3@Height",
    ] {
        assert!(
            !tileset.properties.contains_key(decoded),
            "decoded key '{decoded}' must be removed from plain tilesheet properties"
        );
    }
}

#[test]
fn round_trips_tilesheet_tile_properties_through_tbin() {
    let map_path = Path::new("Content/Maps/Beach.xnb");
    let relative_path = "Content/Maps/Beach.xnb";
    let original = parse_tbin_map(
        &sample_tile_properties_tbin_bytes(),
        map_path,
        relative_path,
    )
    .expect("parse original tbin");

    let serialized = serialize_tbin_map(&original).expect("serialize tbin");
    assert!(
        contains_bytes(&serialized, b"@TileIndex@249@Passable"),
        "encoded tbin must carry the @TileIndex@ key in the tilesheet properties"
    );

    let reparsed =
        parse_tbin_map(&serialized, map_path, relative_path).expect("parse serialized tbin");
    assert_eq!(
        reparsed.tilesets[0].tile_properties,
        original.tilesets[0].tile_properties
    );
    assert_eq!(
        reparsed.tilesets[0].properties,
        original.tilesets[0].properties
    );
    assert_eq!(
        reparsed.layers[0].cell_properties,
        original.layers[0].cell_properties
    );
    assert_eq!(reparsed.layers[0].gids, original.layers[0].gids);
}

#[test]
fn saves_tile_properties_but_rejects_tileset_animations() {
    let document = parse_tbin_map(
        &sample_tile_properties_tbin_bytes(),
        Path::new("Content/Maps/Beach.xnb"),
        "Content/Maps/Beach.xnb",
    )
    .expect("parse tbin");
    assert!(!document.tilesets[0].tile_properties.is_empty());

    serialize_tbin_map(&document).expect("definition-level tile properties must be saveable");

    let mut document = document;
    document.tilesets[0].animations.insert(
        3,
        vec![MapTilesetAnimationFrame {
            tile_id: 0,
            duration: 100,
        }],
    );
    let error = serialize_tbin_map(&document).expect_err("tileset animations must be rejected");
    assert!(error.to_string().contains("animation"), "{error:#}");
    assert!(error.to_string().contains("save as TMX"), "{error:#}");
}
