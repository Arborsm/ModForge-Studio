mod assets;
mod mime;
mod models;
mod pathing;
mod saves;
mod tbin;
mod xact;
mod xnb;

use assets::{
    detect_default_game_directory, load_audio_data_url, load_image_data_url, load_map_asset, load_text_asset, load_text_file, scan_audio_assets,
    scan_events, scan_maps, validate_game_directory,
};
use saves::scan_default_save_slots;
use xact::load_xact_audio_data_url;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .invoke_handler(tauri::generate_handler![
            detect_default_game_directory,
            validate_game_directory,
            scan_maps,
            scan_events,
            load_map_asset,
            load_text_asset,
            load_text_file,
            load_image_data_url,
            scan_audio_assets,
            load_audio_data_url,
            load_xact_audio_data_url,
            scan_default_save_slots
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
