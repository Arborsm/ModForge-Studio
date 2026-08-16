use modforge_studio_desktop_lib::map_validation;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Samples `Data/Furniture` records and localized `Strings/Objects` names to
/// pin the object-catalog derivation contract, and dumps the tilesheet PNGs
/// used for curated structural/outdoor object authoring.
///
/// Run with the game directory in the environment:
/// `SDV_GAME_PATH=/path/to/Stardew Valley cargo run --features installed-game-validation --example furniture_objects_report`
fn main() {
    let game_root = resolve_game_root();
    let content = game_root.join("Content");

    let furniture = map_validation::read_data_asset_json(&content.join("Data/Furniture.xnb"))
        .expect("Data/Furniture.xnb must decode");
    let table = furniture
        .as_object()
        .expect("Data/Furniture must be a table");
    println!("furniture records: {}", table.len());

    let mut types: BTreeMap<String, u32> = BTreeMap::new();
    for value in table.values() {
        let raw = value.as_str().unwrap_or_default();
        let ty = raw.split('/').nth(1).unwrap_or("?").to_string();
        *types.entry(ty).or_default() += 1;
    }
    println!("furniture types: {types:?}");

    for key in ["0", "Birch Chair", "1373", "futon chair"] {
        if let Some(value) = table.get(key) {
            println!("record {key}: {}", value.as_str().unwrap_or_default());
        }
    }
    for (key, value) in table.iter().take(5) {
        println!("record {key}: {}", value.as_str().unwrap_or_default());
    }

    let zh = map_validation::read_data_asset_json(&content.join("Strings/Objects.zh-CN.xnb"))
        .expect("Strings/Objects.zh-CN.xnb must decode");
    let zh_table = zh.as_object().expect("Strings/Objects must be a table");
    println!("zh-CN strings: {}", zh_table.len());
    for name in [
        "Birch Chair",
        "Country Lamp",
        "Large Brown Rug",
        "futon chair",
    ] {
        println!("zh name {name}: {:?}", zh_table.get(name));
    }

    probe_strings_furniture(&content);

    let out_dir = std::env::var("SHEET_DUMP_DIR").unwrap_or_else(|_| "/tmp/sheets".to_string());
    let out = PathBuf::from(&out_dir);
    fs::create_dir_all(&out).expect("create sheet dump dir");
    for key in [
        "Maps/townInterior",
        "Maps/townInterior_2",
        "Maps/walls_and_floors",
        "Maps/farmhouse_tiles",
        "Maps/spring_outdoorsTileSheet",
        "Maps/summer_outdoorsTileSheet",
        "Maps/fall_outdoorsTileSheet",
        "Maps/winter_outdoorsTileSheet",
        "Maps/spring_outdoorsTileSheet2",
        "Maps/island_tilesheet_1",
        "Maps/island_tilesheet_2",
        "Maps/Festivals",
        "Maps/DesertTiles",
        "Maps/desert_festival_tilesheet",
        "Maps/night_market_tilesheet_objects",
        "Maps/MovieTheater_TileSheet",
        "Maps/JojaRuins_TileSheet",
        "Maps/bathhouse_tiles",
        "Maps/cave",
        "Maps/SewerTiles",
        "Maps/bugLandTiles",
        "Maps/witchSwampTiles",
        "Maps/WitchHutTiles",
        "Maps/darkroom_tiles",
        "Maps/qiNutRoom_tilesheet",
        "Maps/LeoTreeHouse_Tilesheet",
        "Maps/Island_FieldOffice_Tilesheet",
        "Maps/Island_Hut_tilesheet",
        "Maps/mermaid_house_tiles",
        "Maps/stadium_tiles",
        "Maps/coopTiles",
        "Maps/masteryCaveTilesheet",
        "Maps/pirates_tilesheet",
        "Maps/submarine_tilesheet",
        "TileSheets/furniture",
        "TileSheets/furniture_2",
        "TileSheets/furniture_3",
        "TileSheets/joja_furniture",
        "TileSheets/junimo_furniture",
        "TileSheets/retro_furniture",
        "TileSheets/wizard_furniture",
    ] {
        let path = content.join(format!("{key}.xnb"));
        match map_validation::read_texture_rgba(&path) {
            Ok((width, height, rgba)) => {
                let file = out.join(format!("{}.png", key.replace('/', "_")));
                write_png(&file, width, height, &rgba);
                println!("dumped {} ({}x{})", file.display(), width, height);
            }
            Err(error) => eprintln!("skip {key}: {error}"),
        }
    }
}

fn write_png(path: &Path, width: u32, height: u32, rgba: &[u8]) {
    let buffer = image::ImageBuffer::<image::Rgba<u8>, _>::from_raw(width, height, rgba.to_vec())
        .expect("rgba buffer must match dimensions");
    buffer.save(path).expect("write png");
}

fn resolve_game_root() -> PathBuf {
    let path = std::env::var_os("SDV_GAME_PATH")
        .expect("SDV_GAME_PATH must point at the installed Stardew Valley directory");
    PathBuf::from(path)
}

/// Appended probe: prints a few Strings/Furniture entries (en + zh-CN).
#[allow(dead_code)]
fn probe_strings_furniture(content: &Path) {
    for file in ["Strings/Furniture.xnb", "Strings/Furniture.zh-CN.xnb"] {
        let value = map_validation::read_data_asset_json(&content.join(file))
            .expect("Strings/Furniture must decode");
        let table = value.as_object().expect("table");
        println!("{file}: {} entries", table.len());
        for key in ["OakChair", "BirchChair", "CountryLamp", "LargeBrownRug"] {
            println!("  {key}: {:?}", table.get(key));
        }
    }
}
