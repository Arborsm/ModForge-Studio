use super::{extract_xml_tag_value, parse_vdf, VdfValue};

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
