//! Regression: TBin tilesheet image sources written with Windows-style `\`
//! separators must resolve to nested relative paths on Linux/macOS (where `\`
//! is a plain file-name character, not a separator), including the
//! extension-probing behavior for extension-less game sources.

use crate::infrastructure::game_formats::tbin::parse_tbin_map;
use crate::test_support::{create_temp_dir, write_bytes_file};
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

fn push_vector(bytes: &mut Vec<u8>, x: i32, y: i32) {
    push_i32(bytes, x);
    push_i32(bytes, y);
}

/// A minimal valid `tBIN10` buffer with one tilesheet and one empty 2x2 layer.
fn map_with_tilesheet_source(source: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"tBIN10");

    push_string(&mut bytes, "Town");
    push_string(&mut bytes, "");
    push_i32(&mut bytes, 0); // map properties

    push_i32(&mut bytes, 1); // tilesheet count
    push_string(&mut bytes, "spring_outdoorsTileSheet");
    push_string(&mut bytes, "");
    push_string(&mut bytes, source);
    push_vector(&mut bytes, 4, 2);
    push_vector(&mut bytes, 16, 16);
    push_vector(&mut bytes, 0, 0);
    push_vector(&mut bytes, 0, 0);
    push_i32(&mut bytes, 0); // tilesheet properties

    push_i32(&mut bytes, 1); // layer count
    push_string(&mut bytes, "Back");
    push_u8(&mut bytes, 1);
    push_string(&mut bytes, "");
    push_vector(&mut bytes, 2, 2);
    push_vector(&mut bytes, 16, 16);
    push_i32(&mut bytes, 0); // layer properties
    // 2x2 图层：每行一个空 tile 游程（N 记录按行消费）
    push_u8(&mut bytes, b'N');
    push_i32(&mut bytes, 4);
    push_u8(&mut bytes, b'N');
    push_i32(&mut bytes, 4);

    bytes
}

#[test]
fn resolves_backslash_tilesheet_source_to_nested_image_with_probed_extension() {
    let root = create_temp_dir("tbin-backslash-source");
    let map_path = root.join("Content").join("Maps").join("Town.xnb");
    let image_path = root
        .join("Content")
        .join("Maps")
        .join("sub")
        .join("spring_outdoorsTileSheet.png");
    write_bytes_file(&image_path, b"png");

    // 无扩展名 + 反斜杠嵌套：必须命中 content-root 相对的真实 png 文件
    let bytes = map_with_tilesheet_source(r"Maps\sub\spring_outdoorsTileSheet");
    let parsed = parse_tbin_map(&bytes, &map_path, "Content/Maps/Town.xnb").unwrap();

    let tileset = &parsed.tilesets[0];
    assert_eq!(
        tileset.image_source.as_deref(),
        Some(r"Maps\sub\spring_outdoorsTileSheet")
    );

    let resolved = Path::new(tileset.image_path.as_deref().unwrap());
    assert!(
        resolved.exists(),
        "expected image at {} to exist",
        resolved.display()
    );
    assert!(
        resolved.ends_with(
            Path::new("Content")
                .join("Maps")
                .join("sub")
                .join("spring_outdoorsTileSheet.png")
        ),
        "unexpected resolved image path: {}",
        resolved.display()
    );
}

#[test]
fn resolves_backslash_tilesheet_source_relative_to_map_directory() {
    let root = create_temp_dir("tbin-backslash-map-dir");
    let map_path = root.join("Content").join("Maps").join("Town.xnb");
    let image_path = root
        .join("Content")
        .join("Maps")
        .join("spring_outdoorsTileSheet.png");
    write_bytes_file(&image_path, b"png");

    // source 相对 map 目录（candidate 1 命中 map_directory.join）
    let bytes = map_with_tilesheet_source(r"spring_outdoorsTileSheet.png");
    let parsed = parse_tbin_map(&bytes, &map_path, "Content/Maps/Town.xnb").unwrap();

    let tileset = &parsed.tilesets[0];
    let resolved = Path::new(tileset.image_path.as_deref().unwrap());
    assert!(
        resolved.exists(),
        "expected image at {} to exist",
        resolved.display()
    );
    assert!(
        resolved.ends_with(
            Path::new("Content")
                .join("Maps")
                .join("spring_outdoorsTileSheet.png")
        ),
        "unexpected resolved image path: {}",
        resolved.display()
    );
}
