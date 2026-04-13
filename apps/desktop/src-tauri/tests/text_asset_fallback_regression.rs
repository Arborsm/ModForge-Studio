#[allow(dead_code, unused_imports)]
#[path = "../src/domain/assets/mod.rs"]
mod assets;
#[path = "support/infrastructure.rs"]
mod infrastructure;
#[allow(dead_code, unused_imports)]
#[path = "support/mod.rs"]
mod test_support;

#[test]
fn loads_structured_text_assets_via_unpacked_json_fallback() {
    let game_root = test_support::resolve_game_root();
    assert!(
        game_root.join("Content (unpacked)/Data/Characters.json").exists(),
        "expected unpacked Stardew JSON fallback files under {}",
        game_root.display()
    );

    for asset_path in [
        "Content/Data/Characters.xnb",
        "Content/Data/Objects.xnb",
        "Content/Data/WorldMap.xnb",
    ] {
        let loaded = assets::load_text_asset(
            game_root.display().to_string(),
            asset_path.to_string(),
            None,
        )
        .unwrap_or_else(|error| panic!("{asset_path}: {error}"));
        let json: serde_json::Value = serde_json::from_str(&loaded.content)
            .unwrap_or_else(|error| panic!("{asset_path}: {error}"));
        assert!(json.is_object(), "{asset_path}: expected JSON object");
    }
}
