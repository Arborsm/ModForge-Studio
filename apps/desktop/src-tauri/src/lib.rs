mod assets;
mod mime;
mod models;
mod content_patcher;
mod json_relaxed;
mod mods;
mod pathing;
mod saves;
mod tbin;
mod xact;
mod xnb;

use assets::{
    clear_file_cache, detect_default_game_directory, get_file_cache_stats, list_known_game_directories, load_audio_data_url,
    load_image_data_url, load_map_asset, load_text_asset, load_text_file, scan_audio_assets, scan_events, scan_maps,
    validate_game_directory,
};
use content_patcher::project::load_content_patcher_project;
use content_patcher::{export_content_patcher_asset, load_content_patcher_result_asset, simulate_content_patcher};
use mods::{load_mod_project, save_mod_project, scan_mod_asset_index, scan_mod_projects};
use saves::scan_default_save_slots;
use xact::load_xact_audio_data_url;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .invoke_handler(tauri::generate_handler![
            detect_default_game_directory,
            list_known_game_directories,
            get_file_cache_stats,
            clear_file_cache,
            validate_game_directory,
            scan_maps,
            scan_events,
            scan_mod_projects,
            scan_mod_asset_index,
            load_mod_project,
            save_mod_project,
            load_content_patcher_project,
            simulate_content_patcher,
            load_content_patcher_result_asset,
            export_content_patcher_asset,
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
