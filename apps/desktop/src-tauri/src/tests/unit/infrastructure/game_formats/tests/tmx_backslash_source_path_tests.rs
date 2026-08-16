//! Regression: TMX `tileset source` and `image source` attributes written with
//! Windows-style `\` separators must resolve to nested relative paths on
//! Linux/macOS (where `\` is a plain file-name character, not a separator).
//!
//! These exercise [`parse_tmx_map`](crate::infrastructure::game_formats::tmx::parse_tmx_map)
//! end to end against real files so the resolved dependency/image path points
//! at an existing nested file instead of a single backslash-named file.

use crate::infrastructure::game_formats::tmx::parse_tmx_map;
use crate::test_support::{create_temp_dir, write_file};
use std::path::Path;

#[test]
fn resolves_external_tsx_and_image_sources_with_backslash_separators() {
    let root = create_temp_dir("tmx-backslash-external-tsx");
    let map_path = root.join("map.tmx");
    let tsx_path = root.join("tileset").join("sub").join("sheet.tsx");
    let image_path = root
        .join("tileset")
        .join("sub")
        .join("images")
        .join("sheet.png");

    write_file(
        &tsx_path,
        r#"<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" name="sheet" tilewidth="16" tileheight="16" tilecount="4" columns="2">
 <image source="images\sheet.png" width="32" height="32"/>
</tileset>"#,
    );
    write_file(&image_path, "png");

    let map_xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><tileset firstgid="1" source="tileset\sub\sheet.tsx"/><layer id="1" name="Back" width="1" height="1"><data encoding="csv">1</data></layer></map>"#;
    write_file(&map_path, map_xml);

    let parsed = parse_tmx_map(map_xml.as_bytes(), &map_path, "map.tmx").unwrap();
    let tileset = &parsed.tilesets[0];

    // 原始 source 字符串原样保留（round-trip 语义不变）
    assert_eq!(tileset.source.as_deref(), Some(r"tileset\sub\sheet.tsx"));

    // 反斜杠分隔的 image source 必须 join 出嵌套路径并定位到真实文件
    let resolved_image = Path::new(tileset.image_path.as_deref().unwrap());
    assert!(
        resolved_image.exists(),
        "expected image at {} to exist",
        resolved_image.display()
    );
    assert!(
        resolved_image.ends_with(
            Path::new("tileset")
                .join("sub")
                .join("images")
                .join("sheet.png")
        ),
        "unexpected resolved image path: {}",
        resolved_image.display()
    );
}

#[test]
fn resolves_inline_image_source_with_backslash_separators() {
    let root = create_temp_dir("tmx-backslash-inline-image");
    let map_path = root.join("map.tmx");
    let image_path = root.join("assets").join("maps").join("sheet.png");
    write_file(&image_path, "png");

    let map_xml = r#"<?xml version="1.0" encoding="UTF-8"?><map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><tileset firstgid="1" name="sheet" tilewidth="16" tileheight="16" tilecount="4" columns="2"><image source="assets\maps\sheet.png" width="32" height="32"/></tileset><layer id="1" name="Back" width="1" height="1"><data encoding="csv">1</data></layer></map>"#;
    write_file(&map_path, map_xml);

    let parsed = parse_tmx_map(map_xml.as_bytes(), &map_path, "map.tmx").unwrap();
    let tileset = &parsed.tilesets[0];

    assert_eq!(
        tileset.image_source.as_deref(),
        Some(r"assets\maps\sheet.png")
    );

    let resolved_image = Path::new(tileset.image_path.as_deref().unwrap());
    assert!(
        resolved_image.exists(),
        "expected image at {} to exist",
        resolved_image.display()
    );
    assert!(
        resolved_image.ends_with(Path::new("assets").join("maps").join("sheet.png")),
        "unexpected resolved image path: {}",
        resolved_image.display()
    );
}
