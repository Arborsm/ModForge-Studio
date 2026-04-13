#[path = "support/infrastructure.rs"]
mod infrastructure;
#[path = "support/mod.rs"]
mod test_support;

use infrastructure::game_formats::xnb;
use serde_json::json;

#[test]
fn parses_character_list_of_int_arrays_without_stream_desync() {
    let file = test_support::resolve_game_root().join("Content/Data/Characters.xnb");
    let parsed =
        xnb::read_xnb_from_path(&file).unwrap_or_else(|error| panic!("{}: {error}", file.display()));
    let json = parsed.content.to_json();

    let abigail = json
        .get("Abigail")
        .and_then(|value| value.as_object())
        .unwrap_or_else(|| panic!("missing Abigail in {}", file.display()));

    assert_eq!(
        abigail.get("SpousePatio").cloned(),
        Some(json!({
            "MapAsset": null,
            "MapSourceRect": { "X": 0, "Y": 0, "Width": 4, "Height": 4 },
            "SpriteAnimationFrames": [[16, 500], [17, 500], [18, 500], [19, 500]],
            "SpriteAnimationPixelOffset": { "X": 0, "Y": 0 }
        }))
    );
    assert_eq!(
        abigail.get("Size").cloned(),
        Some(json!({ "X": 16, "Y": 32 }))
    );
    assert_eq!(abigail.get("ShakePortraits").cloned(), Some(json!([7])));
}
