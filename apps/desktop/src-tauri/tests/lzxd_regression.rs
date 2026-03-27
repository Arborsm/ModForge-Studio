#[path = "../src/xnb/mod.rs"]
mod xnb;

use std::path::Path;

#[test]
fn parses_installed_reference_xnbs() {
    for file in [
        r"E:\SteamLibrary\steamapps\common\Stardew Valley\Content\Maps\Town.xnb",
        r"E:\SteamLibrary\steamapps\common\Stardew Valley\Content\Data\HairData.xnb",
        r"E:\SteamLibrary\steamapps\common\Stardew Valley\Content\Data\hats.xnb",
    ] {
        xnb::read_xnb_from_path(Path::new(file)).unwrap_or_else(|error| panic!("{file}: {error}"));
    }
}
