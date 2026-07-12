use super::{
    cache_file_path, encode_hex, export_file, export_map_png, localized_variant_path,
    logicalized_asset_path, preferred_existing_xnb_path, read_directory_info, split_localized_stem,
};
use crate::test_support::{create_temp_dir, write_file};
use base64::Engine;
use std::fs;
use std::path::Path;

#[test]
fn strips_locale_suffix_from_asset_stems() {
    assert_eq!(split_localized_stem("Town"), ("Town", None));
    assert_eq!(split_localized_stem("Town.zh-CN"), ("Town", Some("zh-CN")));
    assert_eq!(
        split_localized_stem("Strings.es-ES"),
        ("Strings", Some("es-ES"))
    );
}

#[test]
fn builds_logical_asset_path_without_locale_suffix() {
    let logical = logicalized_asset_path(Path::new(r"Content\Maps\Town.zh-CN.xnb"));
    assert_eq!(logical, Path::new(r"Content\Maps\Town.xnb"));
}

#[test]
fn builds_localized_variant_path_from_base_asset() {
    let localized = localized_variant_path(Path::new(r"Content\Maps\Town.xnb"), "zh-CN").unwrap();
    assert_eq!(localized, Path::new(r"Content\Maps\Town.zh-CN.xnb"));
}

#[test]
fn prefers_localized_existing_xnb_variant() {
    let root = create_temp_dir("assets-localized-xnb");
    let base = root.join("bathhouse_tiles.xnb");
    let localized = root.join("bathhouse_tiles.zh-CN.xnb");
    fs::write(&base, b"base").expect("write base xnb");
    fs::write(&localized, b"localized").expect("write localized xnb");

    let resolved = preferred_existing_xnb_path(&base, Some("zh-CN"));
    assert_eq!(resolved, localized);

    fs::remove_dir_all(root).expect("cleanup test directory");
}

#[test]
fn encodes_bytes_as_lower_hex() {
    assert_eq!(encode_hex(&[0x00, 0x0f, 0xa4, 0xff]), "000fa4ff");
}

#[test]
fn cache_file_path_uses_lower_hex_sha256_file_names() {
    let cache_path = cache_file_path(
        "image",
        Path::new(r"C:\Game\Content\Maps\Town.xnb"),
        Some("zh-CN"),
    )
    .expect("cache path");
    let file_name = cache_path
        .file_name()
        .and_then(|value| value.to_str())
        .expect("cache file name");
    let hash = file_name.strip_suffix(".json").expect("json cache file");

    assert_eq!(hash.len(), 64);
    assert!(
        hash.chars()
            .all(|value| value.is_ascii_hexdigit() && !value.is_ascii_uppercase())
    );
}

#[test]
fn read_directory_info_accepts_unix_stardew_executable_names() {
    for executable_name in ["Stardew Valley", "StardewValley", "Stardew Valley.dll"] {
        let root = create_temp_dir("assets-unix-game-directory");
        write_file(&root.join(executable_name), "game");
        let maps = root.join("Content").join("Maps");
        fs::create_dir_all(&maps).expect("create maps directory");
        write_file(&maps.join("Town.xnb"), "map");

        let info = read_directory_info(&root).expect("read game directory info");

        assert_eq!(info.root_path, root.to_string_lossy());
        assert_eq!(info.map_count, 1);

        fs::remove_dir_all(root).expect("cleanup test directory");
    }
}

#[test]
fn exports_a_valid_png_to_the_selected_path() {
    let root = create_temp_dir("map-png-export");
    let output = root.join("Town.png");
    let png = base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\nexported-map");
    fs::write(&output, b"previous-export").expect("write previous export");

    export_map_png(output.to_string_lossy().into_owned(), png).expect("export map png");

    assert_eq!(
        fs::read(&output).expect("read exported png"),
        b"\x89PNG\r\n\x1a\nexported-map"
    );
    fs::remove_dir_all(root).expect("cleanup test directory");
}

#[test]
fn rejects_map_png_exports_with_invalid_path_or_payload() {
    let root = create_temp_dir("map-png-export-invalid");
    let invalid_extension = root.join("Town.jpg");
    let png = base64::engine::general_purpose::STANDARD.encode(b"\x89PNG\r\n\x1a\nexported-map");

    assert!(export_map_png(invalid_extension.to_string_lossy().into_owned(), png).is_err());
    assert!(
        export_map_png(
            root.join("Town.png").to_string_lossy().into_owned(),
            "not-a-png".to_string()
        )
        .is_err()
    );
    fs::remove_dir_all(root).expect("cleanup test directory");
}

#[test]
fn exports_generated_files_to_the_selected_path() {
    let root = create_temp_dir("generated-file-export");
    let output = root.join("default.json");
    fs::write(&output, b"previous-export").expect("write previous export");
    let content = base64::engine::general_purpose::STANDARD
        .encode("{\n  \"Greeting\": \"\u{4f60}\u{597d}\"\n}\n");

    export_file(output.to_string_lossy().into_owned(), content).expect("export generated file");

    assert_eq!(
        fs::read_to_string(&output).expect("read generated file"),
        "{\n  \"Greeting\": \"\u{4f60}\u{597d}\"\n}\n"
    );
    fs::remove_dir_all(root).expect("cleanup test directory");
}

#[test]
fn rejects_generated_file_exports_with_invalid_paths_or_payloads() {
    let root = create_temp_dir("generated-file-export-invalid");

    assert!(export_file(String::new(), String::new()).is_err());
    assert!(
        export_file(
            root.join("default.json").to_string_lossy().into_owned(),
            "not-base64".to_string()
        )
        .is_err()
    );
    assert!(
        export_file(
            root.join("missing")
                .join("default.json")
                .to_string_lossy()
                .into_owned(),
            base64::engine::general_purpose::STANDARD.encode("{}")
        )
        .is_err()
    );
    fs::remove_dir_all(root).expect("cleanup test directory");
}
