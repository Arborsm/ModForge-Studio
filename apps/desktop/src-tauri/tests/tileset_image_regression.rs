#[allow(dead_code, unused_imports)]
#[path = "../src/domain/assets/mod.rs"]
mod assets;
#[allow(dead_code)]
#[path = "../src/domain/app_paths.rs"]
mod app_paths;
mod domain {
    pub(crate) use crate::app_paths;
}
#[path = "support/infrastructure.rs"]
mod infrastructure;
#[allow(dead_code, unused_imports)]
#[path = "support/mod.rs"]
mod test_support;

use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

#[test]
fn loads_farm_tileset_images_as_data_urls() {
    let game_root = test_support::resolve_game_root();
    let map_path = game_root.join("Content/Maps/Farm.xnb");
    assert!(map_path.exists(), "expected map at {}", map_path.display());

    let map_started = Instant::now();
    let map_asset = assets::load_map_asset(
        game_root.display().to_string(),
        map_path.display().to_string(),
        None,
    )
    .unwrap_or_else(|error| panic!("failed to load map asset: {error}"));
    let map_load_ms = map_started.elapsed().as_secs_f64() * 1000.0;

    let document: Value = serde_json::from_str(&map_asset.content)
        .unwrap_or_else(|error| panic!("failed to parse map json: {error}"));
    let tilesets = document["tilesets"]
        .as_array()
        .unwrap_or_else(|| panic!("map json did not contain a tilesets array"));

    assert!(
        !tilesets.is_empty(),
        "expected Farm.xnb to contain tilesets"
    );

    let mut lines = Vec::new();
    let mut total_image_ms = 0.0f64;

    for tileset in tilesets {
        let tileset_name = tileset["name"].as_str().unwrap_or("<unnamed>");
        let image_path = tileset["imagePath"]
            .as_str()
            .or_else(|| tileset["imageSource"].as_str())
            .unwrap_or_else(|| panic!("tileset was missing imagePath/imageSource: {tileset}"));

        let started = Instant::now();
        let url = assets::load_image_data_url(image_path.to_string(), None)
            .unwrap_or_else(|error| panic!("failed to load tileset image {image_path}: {error}"));
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        total_image_ms += elapsed_ms;
        assert!(
            url.starts_with("data:image/"),
            "expected image data url for {image_path}, got {url}"
        );

        lines.push(format!("{tileset_name}\t{image_path}\t{elapsed_ms:.3} ms"));
    }

    let report = format!(
        "Tileset image load performance\nMap: {}\nMap load: {:.3} ms\nTilesets: {}\nTileset image total: {:.3} ms\nTileset image avg: {:.3} ms\n\nPer tileset:\n{}\n",
        map_path.display(),
        map_load_ms,
        lines.len(),
        total_image_ms,
        if lines.is_empty() { 0.0 } else { total_image_ms / lines.len() as f64 },
        lines.join("\n")
    );

    let report_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("tileset-image-performance-report.txt");
    fs::write(&report_path, &report)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", report_path.display()));
    eprintln!("{report}");
}
