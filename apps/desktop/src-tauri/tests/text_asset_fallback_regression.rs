#[path = "../src/mime.rs"]
mod mime;
#[path = "../src/models.rs"]
mod models;
#[path = "../src/pathing.rs"]
mod pathing;
#[path = "../src/test_support.rs"]
mod test_support;
#[path = "../src/tbin.rs"]
mod tbin;
#[path = "../src/xnb/mod.rs"]
mod xnb;
#[path = "../src/assets.rs"]
mod assets;

use std::path::Path;

#[test]
fn loads_structured_text_assets_via_unpacked_json_fallback() {
    let game_root = Path::new(r"E:\SteamLibrary\steamapps\common\Stardew Valley");
    assert!(
        game_root.join(r"Content (unpacked)\Data\Characters.json").exists(),
        "expected unpacked Stardew JSON fallback files under {}",
        game_root.display()
    );

    for asset_path in [
        r"Content\Data\Characters.xnb",
        r"Content\Data\Objects.xnb",
        r"Content\Data\WorldMap.xnb",
    ] {
        let loaded = assets::load_text_asset(game_root.display().to_string(), asset_path.to_string(), None)
            .unwrap_or_else(|error| panic!("{asset_path}: {error}"));
        let json: serde_json::Value = serde_json::from_str(&loaded.content)
            .unwrap_or_else(|error| panic!("{asset_path}: {error}"));
        assert!(json.is_object(), "{asset_path}: expected JSON object");
    }
}
