use crate::infrastructure::game_formats::map::{
    MapFormat, MapLayerDataEncoding, MapLayerOrderEntry, MapPropertyValue,
    TMX_FLIPPED_HORIZONTALLY_FLAG,
};
use crate::infrastructure::game_formats::tmx::{
    parse_tmx_map, serialize_tmx_map, serialize_tsx_tileset,
};
use crate::test_support::create_temp_dir;
use base64::Engine;
use std::io::Write;
use std::path::Path;

fn base_map(layer_data: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" tiledversion="1.11.1" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="4" nextobjectid="2">
 <properties><property name="Outdoors" type="bool" value="true"/><property name="Number" type="int" value="7"/></properties>
 <tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16" tilecount="4" columns="2">
  <image source="sheet.png" width="32" height="32"/>
  <tile id="1"><properties><property name="Action" value="Test"/></properties><animation><frame tileid="1" duration="100"/><frame tileid="2" duration="100"/></animation></tile>
 </tileset>
 <objectgroup id="3" name="Paths"><object id="1" name="TileData" type="TileData" x="16" y="16" width="16" height="16"><properties><property name="TouchAction" value="Warp 1 2"/></properties></object></objectgroup>
 <layer id="2" name="Back" width="2" height="2">{layer_data}</layer>
</map>"#
    )
}

#[test]
fn preserves_exact_tmx_and_custom_property_types() {
    let xml = r##"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><properties><property name="Count" type="int" value="7"/><property name="Tint" type="color" value="#80ff0000"/><property name="Custom" type="class" propertytype="ModForge.LightData" value="serialized"/></properties><layer id="1" name="Back" width="1" height="1"><data encoding="csv">0</data></layer></map>"##;
    let parsed = parse_tmx_map(
        xml.as_bytes(),
        Path::new("Maps/Properties.tmx"),
        "Maps/Properties.tmx",
    )
    .expect("parse typed properties");
    assert!(matches!(
        parsed.properties.get("Count"),
        Some(MapPropertyValue::Typed { tmx_type, property_type: None, .. }) if tmx_type == "int"
    ));
    assert!(matches!(
        parsed.properties.get("Tint"),
        Some(MapPropertyValue::Typed { tmx_type, .. }) if tmx_type == "color"
    ));
    assert!(matches!(
        parsed.properties.get("Custom"),
        Some(MapPropertyValue::Typed { tmx_type, property_type: Some(property_type), .. })
            if tmx_type == "class" && property_type == "ModForge.LightData"
    ));

    let serialized = String::from_utf8(serialize_tmx_map(&parsed).unwrap()).unwrap();
    assert!(serialized.contains("name=\"Count\" value=\"7\" type=\"int\""));
    assert!(serialized.contains("name=\"Tint\" value=\"#80ff0000\" type=\"color\""));
    assert!(serialized.contains(
        "name=\"Custom\" value=\"serialized\" type=\"class\" propertytype=\"ModForge.LightData\""
    ));
    let reparsed = parse_tmx_map(
        serialized.as_bytes(),
        Path::new("Maps/Properties.tmx"),
        "Maps/Properties.tmx",
    )
    .unwrap();
    assert_eq!(reparsed.properties, parsed.properties);
}

#[test]
fn preserves_external_tsx_and_tile_extension_attributes_and_nodes() {
    let root = create_temp_dir("tmx-external-tsx-extensions");
    let map_path = root.join("map.tmx");
    let tsx_path = root.join("sheet.tsx");
    std::fs::write(
        &tsx_path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.11.2" class="FarmTiles" name="sheet" tilewidth="16" tileheight="16" tilecount="4" columns="2">
 <image source="sheet.png" width="32" height="32"/>
 <terraintypes><terrain name="Grass" tile="0"/></terraintypes>
 <tile id="1" terrain="0,0,0,0" probability="0.75" class="AnimatedGrass"><animation><frame tileid="1" duration="100"/></animation><objectgroup id="9"><object id="10" x="0" y="0" width="16" height="16"/></objectgroup></tile>
 <wangsets><wangset name="Paths" tile="-1"/></wangsets>
</tileset>"#,
    )
    .unwrap();
    let map_xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><tileset firstgid="1" source="sheet.tsx"/><layer id="1" name="Back" width="1" height="1"><data encoding="csv">1</data></layer></map>"#;
    std::fs::write(&map_path, map_xml).unwrap();

    let parsed = parse_tmx_map(map_xml.as_bytes(), &map_path, "map.tmx").unwrap();
    let tileset = &parsed.tilesets[0];
    assert_eq!(tileset.preserved_attributes["version"], "1.10");
    assert_eq!(tileset.preserved_attributes["class"], "FarmTiles");
    assert_eq!(tileset.tile_preserved_attributes[&1]["terrain"], "0,0,0,0");
    assert_eq!(tileset.tile_preserved_attributes[&1]["probability"], "0.75");
    assert!(
        tileset
            .preserved_xml
            .iter()
            .any(|node| node.xml.contains("terraintypes"))
    );
    assert!(
        tileset
            .preserved_xml
            .iter()
            .any(|node| node.xml.contains("wangsets"))
    );
    assert!(
        tileset.tile_preserved_xml[&1]
            .iter()
            .any(|node| node.xml.contains("objectgroup"))
    );

    let serialized = String::from_utf8(serialize_tsx_tileset(tileset).unwrap()).unwrap();
    assert!(serialized.contains("version=\"1.10\""));
    assert!(serialized.contains("class=\"FarmTiles\""));
    assert!(serialized.contains("terrain=\"0,0,0,0\""));
    assert!(serialized.contains("<terraintypes>"));
    assert!(serialized.contains("<wangsets>"));
    assert!(serialized.contains("<objectgroup id=\"9\">"));

    std::fs::write(&tsx_path, serialized).unwrap();
    let reparsed = parse_tmx_map(map_xml.as_bytes(), &map_path, "map.tmx").unwrap();
    assert_eq!(reparsed.tilesets[0], parsed.tilesets[0]);
    std::fs::remove_dir_all(root).unwrap();
}

fn encode_gids(gids: &[u32], compression: Option<&str>) -> String {
    let mut bytes = Vec::new();
    for gid in gids {
        bytes.extend_from_slice(&gid.to_le_bytes());
    }
    let bytes = match compression {
        None => bytes,
        Some("zlib") => {
            let mut encoder =
                flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&bytes).unwrap();
            encoder.finish().unwrap()
        }
        Some("gzip") => {
            let mut encoder =
                flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&bytes).unwrap();
            encoder.finish().unwrap()
        }
        Some("zstd") => zstd::stream::encode_all(bytes.as_slice(), 0).unwrap(),
        Some(other) => panic!("unsupported test compression {other}"),
    };
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

#[test]
fn parses_and_round_trips_all_supported_layer_encodings() {
    let gids = [1, TMX_FLIPPED_HORIZONTALLY_FLAG | 2, 0, 4];
    let mut cases = vec![
        (
            MapLayerDataEncoding::Csv,
            None,
            format!(r#"<data encoding="csv">1,{},0,4</data>"#, gids[1]),
        ),
        (
            MapLayerDataEncoding::Xml,
            None,
            format!(
                r#"<data><tile gid="1"/><tile gid="{}"/><tile gid="0"/><tile gid="4"/></data>"#,
                gids[1]
            ),
        ),
    ];
    for compression in [None, Some("zlib"), Some("gzip"), Some("zstd")] {
        let compression_attribute = compression
            .map(|value| format!(r#" compression="{value}""#))
            .unwrap_or_default();
        cases.push((
            MapLayerDataEncoding::Base64,
            compression,
            format!(
                r#"<data encoding="base64"{compression_attribute}>{}</data>"#,
                encode_gids(&gids, compression)
            ),
        ));
    }

    for (encoding, compression, data) in cases {
        let xml = base_map(&data);
        let parsed = parse_tmx_map(xml.as_bytes(), Path::new("Maps/Test.tmx"), "Maps/Test.tmx")
            .expect("parse TMX fixture");
        assert_eq!(parsed.format, MapFormat::Tmx);
        assert_eq!(parsed.layers[0].gids, gids);
        assert_eq!(parsed.layers[0].data_encoding, encoding);
        assert_eq!(parsed.layers[0].data_compression.as_deref(), compression);
        assert_eq!(
            parsed.layer_order,
            vec![
                MapLayerOrderEntry::ObjectGroup(3),
                MapLayerOrderEntry::TileLayer(2)
            ]
        );
        assert_eq!(parsed.object_groups[0].objects[0].properties.len(), 1);
        assert_eq!(parsed.tilesets[0].animations[&1].len(), 2);

        let serialized = serialize_tmx_map(&parsed).expect("serialize TMX fixture");
        let reparsed = parse_tmx_map(&serialized, Path::new("Maps/Test.tmx"), "Maps/Test.tmx")
            .expect("reparse serialized TMX");
        assert_eq!(reparsed.layers[0].gids, gids);
        assert_eq!(reparsed.layer_order, parsed.layer_order);
        assert_eq!(reparsed.properties, parsed.properties);
        assert_eq!(
            reparsed.tilesets[0].animations,
            parsed.tilesets[0].animations
        );
    }
}

#[test]
fn resolves_external_tsx_relative_to_the_tmx_file() {
    let root = std::env::temp_dir().join(format!("modforge-tmx-tsx-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(root.join("tiles")).unwrap();
    std::fs::write(
        root.join("tiles/sheet.tsx"),
        r#"<?xml version="1.0" encoding="UTF-8"?><tileset version="1.10" tiledversion="1.11.1" name="external" tilewidth="16" tileheight="16" tilecount="4" columns="2"><image source="sheet.png" width="32" height="32"/></tileset>"#,
    )
    .unwrap();
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><tileset firstgid="1" source="tiles/sheet.tsx"/><layer id="1" name="Back" width="1" height="1"><data encoding="csv">1</data></layer></map>"#;
    let map_path = root.join("map.tmx");
    std::fs::write(&map_path, xml).unwrap();

    let parsed = parse_tmx_map(xml.as_bytes(), &map_path, "map.tmx").expect("parse external TSX");
    assert_eq!(parsed.tilesets[0].name, "external");
    assert_eq!(
        parsed.tilesets[0].source.as_deref(),
        Some("tiles/sheet.tsx")
    );
    assert!(
        parsed.tilesets[0]
            .image_path
            .as_deref()
            .unwrap()
            .ends_with("tiles\\sheet.png")
    );

    std::fs::remove_dir_all(&root).unwrap();
}

#[test]
fn reports_tmx_and_tsx_locations_with_dependency_chains() {
    let malformed_tmx = "<map>\n  <layer>\n</map>";
    let tmx_error = parse_tmx_map(
        malformed_tmx.as_bytes(),
        Path::new("Maps/Broken.tmx"),
        "Maps/Broken.tmx",
    )
    .expect_err("reject malformed TMX");
    let tmx_message = format!("{tmx_error:#}");
    assert!(
        tmx_message.contains("[path=Maps/Broken.tmx]"),
        "{tmx_message}"
    );
    assert!(tmx_message.contains("[line=3]"), "{tmx_message}");
    assert!(tmx_message.contains("[column="), "{tmx_message}");
    assert!(
        tmx_message.contains("[referenceChain=Maps/Broken.tmx]"),
        "{tmx_message}"
    );

    let root = create_temp_dir("tmx-tsx-diagnostics");
    let map_path = root.join("map.tmx");
    let tsx_path = root.join("tiles/broken.tsx");
    std::fs::create_dir_all(tsx_path.parent().unwrap()).unwrap();
    std::fs::write(
        &tsx_path,
        "<tileset name=\"broken\" tilewidth=\"16\" tileheight=\"16\">\n  <image source=\"sheet.png\"/>\n</wrong>",
    )
    .unwrap();
    let xml = r#"<map orientation="orthogonal" width="1" height="1" tilewidth="16" tileheight="16"><tileset firstgid="1" source="tiles/broken.tsx"/><layer id="1" name="Back" width="1" height="1"><data encoding="csv">0</data></layer></map>"#;
    std::fs::write(&map_path, xml).unwrap();

    let tsx_error = parse_tmx_map(xml.as_bytes(), &map_path, "map.tmx")
        .expect_err("reject malformed external TSX");
    let tsx_message = format!("{tsx_error:#}");
    assert!(tsx_message.contains("external TSX"), "{tsx_message}");
    assert!(tsx_message.contains("[line=3]"), "{tsx_message}");
    assert!(tsx_message.contains("[column="), "{tsx_message}");
    assert!(tsx_message.contains("[referenceChain="), "{tsx_message}");
    assert!(tsx_message.contains("tiles/broken.tsx"), "{tsx_message}");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn preserves_unsupported_group_and_image_layers_in_place() {
    let xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><group id="5" name="ReadOnly"><layer id="6" name="Nested" width="1" height="1"><data encoding="csv">0</data></layer></group><imagelayer id="7" name="Backdrop"><image source="backdrop.png"/></imagelayer><group id="8" name="Second"><layer id="9" name="NestedAgain" width="1" height="1"><data encoding="csv">0</data></layer></group><layer id="1" name="Back" width="1" height="1"><data encoding="csv">0</data></layer></map>"#;
    let parsed = parse_tmx_map(
        xml.as_bytes(),
        Path::new("Maps/Extended.tmx"),
        "Maps/Extended.tmx",
    )
    .expect("parse extensions");

    assert_eq!(parsed.preserved_xml.len(), 3);
    assert_eq!(
        parsed.layer_order,
        vec![
            MapLayerOrderEntry::Preserved(0),
            MapLayerOrderEntry::Preserved(1),
            MapLayerOrderEntry::Preserved(2),
            MapLayerOrderEntry::TileLayer(1),
        ]
    );
    let serialized = serialize_tmx_map(&parsed).expect("serialize extensions");
    let serialized = String::from_utf8(serialized).unwrap();
    assert!(serialized.contains("<group id=\"5\" name=\"ReadOnly\">"));
    assert!(serialized.contains("<group id=\"8\" name=\"Second\">"));
    assert!(serialized.contains("<imagelayer id=\"7\" name=\"Backdrop\">"));
    assert!(serialized.find("<group").unwrap() < serialized.find("<layer id=\"1\"").unwrap());

    let reparsed = parse_tmx_map(
        serialized.as_bytes(),
        Path::new("Maps/Extended.tmx"),
        "Maps/Extended.tmx",
    )
    .expect("reparse extensions");
    assert_eq!(reparsed.preserved_xml, parsed.preserved_xml);
}
