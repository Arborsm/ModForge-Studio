#[path = "support/infrastructure.rs"]
mod infrastructure;
#[path = "support.rs"]
mod test_support;

use infrastructure::game_formats::xnb;

#[test]
fn parses_installed_reference_xnbs() {
    let game_root = test_support::resolve_game_root();

    for relative_path in [
        "Content/Maps/Town.xnb",
        "Content/Data/HairData.xnb",
        "Content/Data/hats.xnb",
    ] {
        let file = game_root.join(relative_path);
        xnb::read_xnb_from_path(&file)
            .unwrap_or_else(|error| panic!("{}: {error}", file.display()));
    }
}
