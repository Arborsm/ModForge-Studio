use super::{
    VdfValue, clean_input_path, extract_xml_tag_value, parse_vdf, smapi_launch_candidates,
    stardew_game_launch_candidates, stardew_game_validation_candidates,
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
