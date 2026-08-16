use super::{
    VdfValue, clean_input_path, extract_xml_tag_value, game_path_to_pathbuf, logical_path_key,
    normalize_separators, parse_vdf, smapi_launch_candidates, stardew_game_launch_candidates,
    stardew_game_validation_candidates, validated_game_relative_path,
};
use std::path::Path;

#[test]
fn extracts_game_path_from_targets_xml() {
    let content = r#"<Project><PropertyGroup><GamePath>E:\SteamLibrary\steamapps\common\Stardew Valley</GamePath></PropertyGroup></Project>"#;
    let value = extract_xml_tag_value(content, "GamePath");
    assert_eq!(
        value.as_deref(),
        Some(r"E:\SteamLibrary\steamapps\common\Stardew Valley")
    );
}

#[test]
fn parses_steam_libraryfolders_vdf() {
    let content = r#"
            "libraryfolders"
            {
                "0"
                {
                    "path"        "C:\\Program Files (x86)\\Steam"
                    "apps"
                    {
                        "413150"        "123"
                    }
                }
            }
        "#;

    let parsed = parse_vdf(content).expect("parsed vdf");
    let VdfValue::Object(root) = parsed else {
        panic!("expected object root");
    };
    let VdfValue::Object(libraries) = root.get("libraryfolders").expect("libraryfolders") else {
        panic!("expected libraryfolders object");
    };
    let VdfValue::Object(primary) = libraries.get("0").expect("primary library") else {
        panic!("expected primary object");
    };

    assert_eq!(
        primary.get("path").and_then(VdfValue::as_str),
        Some(r"C:\Program Files (x86)\Steam")
    );
    assert!(matches!(primary.get("apps"), Some(VdfValue::Object(_))));
}

#[test]
fn clean_input_path_normalizes_windows_relative_separators() {
    let cleaned = clean_input_path(r".\tmp-cp-relative");

    assert_eq!(cleaned, Path::new("./tmp-cp-relative"));
}

#[test]
fn parse_vdf_preserves_chinese_path() {
    let content = r#"
            "libraryfolders"
            {
                "0"
                {
                    "path"        "E:\\中文游戏库\\Steam"
                    "apps"
                    {
                        "413150"        "123"
                    }
                }
            }
        "#;

    let parsed = parse_vdf(content).expect("parsed vdf with chinese path");
    let VdfValue::Object(root) = parsed else {
        panic!("expected object root");
    };
    let VdfValue::Object(libraries) = root.get("libraryfolders").expect("libraryfolders") else {
        panic!("expected libraryfolders object");
    };
    let VdfValue::Object(primary) = libraries.get("0").expect("primary library") else {
        panic!("expected primary object");
    };

    assert_eq!(
        primary.get("path").and_then(VdfValue::as_str),
        Some(r"E:\中文游戏库\Steam")
    );
}

#[cfg(not(windows))]
#[test]
fn clean_input_path_maps_windows_drive_paths_to_wsl_mounts() {
    let cleaned = clean_input_path(r"E:\SteamLibrary\steamapps\common\Stardew Valley");

    assert_eq!(
        cleaned,
        Path::new("/mnt/e/SteamLibrary/steamapps/common/Stardew Valley")
    );
}

#[test]
fn stardew_game_candidates_include_windows_linux_and_macos_names() {
    let root = Path::new("/games/Stardew Valley");

    let launch_names = stardew_game_launch_candidates(root)
        .into_iter()
        .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert_eq!(
        launch_names,
        vec![
            "Stardew Valley.exe",
            "Stardew Valley",
            "StardewValley",
            "Stardew Valley.bin.x86_64",
        ]
    );

    let validation_names = stardew_game_validation_candidates(root)
        .into_iter()
        .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    assert!(validation_names.contains(&"Stardew Valley.dll".to_string()));
}

#[test]
fn smapi_launch_candidates_include_unix_names() {
    let root = Path::new("/games/Stardew Valley");

    let names = smapi_launch_candidates(root)
        .into_iter()
        .map(|path| path.file_name().unwrap().to_string_lossy().to_string())
        .collect::<Vec<_>>();

    assert_eq!(
        names,
        vec![
            "StardewModdingAPI.exe",
            "StardewModdingAPI",
            "StardewModdingAPI.bin.x86_64",
        ]
    );
}

#[test]
fn game_path_to_pathbuf_parses_backslash_separators() {
    assert_eq!(
        game_path_to_pathbuf(r"assets\maps\foo.png"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_parses_forward_slash_separators() {
    assert_eq!(
        game_path_to_pathbuf("assets/maps/foo.png"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_parses_mixed_separators() {
    assert_eq!(
        game_path_to_pathbuf(r"assets/maps\foo.png"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_skips_leading_and_trailing_separators() {
    assert_eq!(
        game_path_to_pathbuf(r"/assets\maps/foo.png\"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_skips_empty_segments() {
    assert_eq!(
        game_path_to_pathbuf("assets//maps///foo.png"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_skips_dot_segments() {
    assert_eq!(
        game_path_to_pathbuf("./assets/./maps/foo.png"),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_preserves_parent_dir_segments() {
    assert_eq!(
        game_path_to_pathbuf("assets/../foo.png"),
        Path::new("assets").join("..").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_trims_surrounding_whitespace() {
    assert_eq!(
        game_path_to_pathbuf("  assets/maps/foo.png  "),
        Path::new("assets").join("maps").join("foo.png")
    );
}

#[test]
fn game_path_to_pathbuf_empty_input_yields_empty_path() {
    assert!(game_path_to_pathbuf("").as_os_str().is_empty());
    assert!(game_path_to_pathbuf("   ").as_os_str().is_empty());
}

#[test]
fn validated_game_relative_path_accepts_nested_relative_path() {
    let path = validated_game_relative_path(r"assets/maps\foo.png").expect("valid path");
    assert_eq!(path, Path::new("assets").join("maps").join("foo.png"));
}

#[test]
fn validated_game_relative_path_accepts_dot_and_empty_segments() {
    let path = validated_game_relative_path("./assets//foo.png").expect("valid path");
    assert_eq!(path, Path::new("assets").join("foo.png"));
}

#[test]
fn validated_game_relative_path_rejects_parent_dir_components() {
    assert!(validated_game_relative_path("assets/../foo.png").is_err());
    assert!(validated_game_relative_path("..").is_err());
}

#[test]
fn validated_game_relative_path_rejects_absolute_paths() {
    assert!(validated_game_relative_path("/assets/foo.png").is_err());
    assert!(validated_game_relative_path(r"\assets\foo.png").is_err());
}

#[test]
fn validated_game_relative_path_rejects_drive_prefixed_paths() {
    assert!(validated_game_relative_path(r"C:\assets\foo.png").is_err());
}

#[test]
fn validated_game_relative_path_rejects_empty_or_meaningless_input() {
    assert!(validated_game_relative_path("").is_err());
    assert!(validated_game_relative_path("   ").is_err());
    assert!(validated_game_relative_path("./").is_err());
}

#[test]
fn validated_game_relative_path_error_includes_original_input() {
    let err = validated_game_relative_path(r"C:\assets\foo.png").unwrap_err();
    assert!(err.to_string().contains(r"C:\assets\foo.png"));
}

#[test]
fn normalize_separators_replaces_backslashes_only() {
    assert_eq!(normalize_separators(r"a\b\c"), "a/b/c");
    assert_eq!(normalize_separators("a/b/c"), "a/b/c");
    assert_eq!(normalize_separators(r" a\b "), " a/b ");
}

#[test]
fn logical_path_key_normalizes_case_and_separators() {
    assert_eq!(
        logical_path_key(r" Assets\Maps\foo.png "),
        "assets/maps/foo.png"
    );
}

#[test]
fn logical_path_key_strips_trailing_slashes() {
    assert_eq!(logical_path_key("Assets/Maps/"), "assets/maps");
    assert_eq!(logical_path_key(r"Assets\Maps\"), "assets/maps");
    assert_eq!(logical_path_key(r"Assets\Maps\\"), "assets/maps");
}

#[test]
fn logical_path_key_lowercases_mixed_case() {
    assert_eq!(
        logical_path_key("ASSETS/maps/FOO.PNG"),
        "assets/maps/foo.png"
    );
}
