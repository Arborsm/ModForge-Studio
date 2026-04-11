extern crate self as modforge_studio_desktop_lib;

mod assets;
mod attached_api;
mod content_patcher;
mod json_relaxed;
mod launcher;
pub mod logging;
mod mime;
mod models;
mod mods;
mod pathing;
mod saves;
mod tbin;
#[cfg(test)]
mod test_support;
mod xact;
mod xnb;

use assets::{
    clear_file_cache, detect_default_game_directory, get_file_cache_stats,
    list_known_game_directories, load_audio_data_url, load_image_data_url, load_map_asset,
    load_text_asset, load_text_file, scan_audio_assets, scan_events, scan_maps,
    validate_game_directory,
};
use content_patcher::project::load_content_patcher_project;
use content_patcher::{
    export_content_patcher_asset, load_content_patcher_result_asset, simulate_content_patcher,
};
use launcher::{
    clear_launcher_image_cache,
    check_launcher_updates, download_launcher_mod, get_launcher_backup_directory,
    inspect_launcher_archive, install_launcher_archive, load_launcher_download_queue,
    load_cached_launcher_updates,
    load_launcher_library_covers, load_launcher_library_state, load_launcher_remote_mod_detail,
    load_launcher_settings, load_launcher_update_changelog, launch_launcher_game,
    open_launcher_path, open_launcher_url, persist_launcher_library_remote_cover,
    resolve_launcher_image, save_launcher_download_queue, save_launcher_library_state,
    save_launcher_settings, scan_launcher_library, search_launcher_catalog,
    set_launcher_library_cover, set_launcher_mod_enabled,
};
use logging::{
    build_logging_plugin, set_debug_logging_enabled, write_frontend_log, DebugLoggingState,
};
use mods::{load_mod_project, save_mod_project, scan_mod_asset_index, scan_mod_projects};
use saves::scan_default_save_slots;
use xact::load_xact_audio_data_url;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_logging_state = DebugLoggingState::new();
    debug_logging_state.set_enabled(false);

    tauri::Builder::default()
        .manage(debug_logging_state.clone())
        .plugin(tauri_plugin_dialog::init())
        .plugin(build_logging_plugin(debug_logging_state))
        .setup(|app| {
            app.state::<DebugLoggingState>().set_enabled(false);
            Ok(())
        })
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
            scan_default_save_slots,
            load_launcher_settings,
            save_launcher_settings,
            launch_launcher_game,
            load_launcher_library_state,
            load_launcher_library_covers,
            save_launcher_library_state,
            set_launcher_library_cover,
            persist_launcher_library_remote_cover,
            load_launcher_download_queue,
            save_launcher_download_queue,
            get_launcher_backup_directory,
            open_launcher_path,
            open_launcher_url,
            scan_launcher_library,
            set_launcher_mod_enabled,
            search_launcher_catalog,
            load_launcher_remote_mod_detail,
            load_launcher_update_changelog,
            clear_launcher_image_cache,
            resolve_launcher_image,
            load_cached_launcher_updates,
            check_launcher_updates,
            download_launcher_mod,
            inspect_launcher_archive,
            install_launcher_archive,
            set_debug_logging_enabled,
            write_frontend_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
