use modforge_studio_desktop_lib::map_validation;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

/// Dumps the vanilla tilesheet catalog (`Content/TileSheets` + map-bound
/// sheets under `Content/Maps`) with decoded texture dimensions, plus the
/// tilesheet reference strings used by a sample of shipped maps. The output
/// drives the frontend `vanillaTilesheets.ts` predefined catalog.
///
/// Run with the game directory in the environment:
/// `SDV_GAME_PATH=/path/to/Stardew Valley cargo run --features installed-game-validation --example tilesheet_catalog_report`
fn main() {
    let game_root = resolve_game_root();
    let content = game_root.join("Content");

    let mut entries = Vec::new();
    collect_sheet_dir(&content, "TileSheets", &mut entries);
    collect_maps_sheets(&content, &mut entries);
    entries.sort_by(|a, b| a["key"].as_str().cmp(&b["key"].as_str()));
    for entry in &entries {
        println!("{entry}");
    }
    println!("total sheets: {}", entries.len());

    for map_name in [
        "Town",
        "Farm",
        "FarmHouse",
        "AbandonedJojaMart",
        "Greenhouse",
        "Island_S",
        "Desert",
        "MovieTheater",
    ] {
        dump_map_tileset_refs(&content, map_name);
    }
}

fn resolve_game_root() -> PathBuf {
    let path = std::env::var_os("SDV_GAME_PATH")
        .expect("SDV_GAME_PATH must point at the installed Stardew Valley directory");
    PathBuf::from(path)
}

fn collect_sheet_dir(content: &Path, folder: &str, entries: &mut Vec<serde_json::Value>) {
    let dir = content.join(folder);
    let Ok(read_dir) = fs::read_dir(&dir) else {
        eprintln!("missing dir {}", dir.display());
        return;
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("xnb") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        if is_localized_variant(stem) {
            continue;
        }
        let Ok((width, height)) = map_validation::read_texture_size(&path) else {
            continue;
        };
        entries.push(json!({
            "key": format!("{folder}/{stem}"),
            "name": stem,
            "imageWidth": width,
            "imageHeight": height,
        }));
    }
}

fn collect_maps_sheets(content: &Path, entries: &mut Vec<serde_json::Value>) {
    let dir = content.join("Maps");
    let Ok(read_dir) = fs::read_dir(&dir) else {
        eprintln!("missing dir {}", dir.display());
        return;
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("xnb") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        // Localized variants (for example `spring_outdoorsTileSheet.zh-CN`)
        // resolve through the locale-aware loader; the catalog keeps base keys.
        if is_localized_variant(stem) {
            continue;
        }
        // Only Texture2D assets qualify: map `.xnb` files contain tBIN maps.
        let Ok((width, height)) = map_validation::read_texture_size(&path) else {
            continue;
        };
        entries.push(json!({
            "key": format!("Maps/{stem}"),
            "name": stem,
            "imageWidth": width,
            "imageHeight": height,
        }));
    }
}

fn is_localized_variant(stem: &str) -> bool {
    let Some((_, suffix)) = stem.rsplit_once('.') else {
        return false;
    };
    let bytes = suffix.as_bytes();
    bytes.len() == 5
        && bytes[2] == b'-'
        && bytes[0].is_ascii_alphabetic()
        && bytes[1].is_ascii_alphabetic()
        && bytes[3].is_ascii_alphabetic()
        && bytes[4].is_ascii_alphabetic()
}

fn dump_map_tileset_refs(content: &Path, map_name: &str) {
    let map_path = content.join("Maps").join(format!("{map_name}.xnb"));
    if !map_path.exists() {
        eprintln!("missing map {}", map_path.display());
        return;
    }
    let relative = format!("Content/Maps/{map_name}.xnb");
    match map_validation::parse_map(&map_path, &relative) {
        Ok(document) => {
            println!("== map {map_name}");
            for tileset in &document.tilesets {
                println!(
                    "   name={:?} imageSource={:?} imagePath={:?} tile={}x{} columns={} tileCount={}",
                    tileset.name,
                    tileset.image_source,
                    tileset.image_path,
                    tileset.tile_width,
                    tileset.tile_height,
                    tileset.columns,
                    tileset.tile_count,
                );
            }
        }
        Err(error) => eprintln!("failed to parse {map_name}: {error}"),
    }
}
