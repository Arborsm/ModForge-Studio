extern crate self as modforge_studio_desktop_lib;

mod commands;
mod domain;
mod host;
pub mod host_commands;
pub mod host_runtime;
mod infrastructure;
pub mod sidecar;
mod support;

#[cfg(any(debug_assertions, feature = "dev-asset-bridge"))]
pub mod dev_asset_bridge;

#[cfg(test)]
#[path = "../tests/support.rs"]
pub mod test_support;
pub use support::logging;

pub type AppRuntime = tauri::Wry;
pub type AppHandle = host::HostHandle;

use commands::app_ui::{load_app_ui_state, patch_app_ui_state};
use commands::assets::{
    clear_file_cache, detect_default_game_directory, get_file_cache_stats,
    list_known_game_directories, load_audio_data_url, load_image_data_url, load_map_asset,
    load_text_asset, load_text_file, scan_audio_assets, scan_events, scan_maps,
    validate_game_directory,
};
use commands::audio::load_xact_audio_data_url;
use commands::content_patcher::{
    export_content_patcher_asset, load_content_patcher_project, load_content_patcher_result_asset,
    simulate_content_patcher,
};
use commands::cp_maker::{
    build_cp_maker_map_asset, copy_cp_maker_draft, delete_cp_maker_draft, export_cp_maker_pack,
    import_cp_maker_pack, list_cp_maker_drafts, load_cp_maker_draft, save_cp_maker_draft,
};
use commands::launcher::{
    cancel_launcher_download, cancel_nexus_sso, check_launcher_updates, clear_launcher_image_cache,
    download_launcher_mod, get_launcher_backup_directory, get_nexus_sso_status,
    inspect_launcher_archive, install_launcher_archive, launch_launcher_game,
    list_launcher_install_backups, load_cached_launcher_updates, load_launcher_download_queue,
    load_launcher_library_covers, load_launcher_library_state, load_launcher_nexus_diagnostics,
    load_launcher_remote_mod_detail, load_launcher_runtime_info, load_launcher_settings,
    load_launcher_update_changelog, load_suppressed_launcher_update_mod_ids, open_launcher_path,
    open_launcher_url, persist_launcher_library_remote_cover, resolve_launcher_image,
    restart_launcher_nexus_diagnostics, restore_launcher_install_backup,
    retry_launcher_nexus_diagnostics_route, save_launcher_download_queue,
    save_launcher_library_state, save_launcher_settings, scan_launcher_library,
    search_launcher_catalog, set_launcher_library_cover, set_launcher_mod_enabled,
    set_launcher_nexus_force_offline, start_nexus_sso, validate_nexus_api_key,
};
use commands::logging::{set_debug_logging_enabled, write_frontend_log};
use commands::mods::{load_mod_project, save_mod_project, scan_mod_asset_index, scan_mod_projects};
use commands::resource_registry::load_resource_registry;
use commands::saves::scan_default_save_slots;
use support::logging::{DebugLoggingState, init_host_logging};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_logging_state = DebugLoggingState::new();
    init_host_logging(&debug_logging_state).expect("failed to initialize ModForge host logger");

    tauri::Builder::<AppRuntime>::default()
        .manage(debug_logging_state.clone())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let diagnostics_start_result = domain::app_ui::load_app_ui_state()
                .map(|state| state.launcher.force_offline)
                .and_then(|force_offline| {
                    let host = AppHandle::from_tauri(app.handle().clone());
                    if force_offline {
                        domain::nexusmods::diagnostics::set_launcher_nexus_force_offline(
                            &host, true,
                        )
                        .map(|_| ())
                    } else {
                        domain::nexusmods::diagnostics::prime_launcher_nexus_diagnostics(&host)
                    }
                });
            if let Err(error) = diagnostics_start_result {
                log::warn!(
                    target: "Nexus",
                    "Startup diagnostics probe could not start: error={error}"
                );
            }
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
            list_cp_maker_drafts,
            load_cp_maker_draft,
            save_cp_maker_draft,
            delete_cp_maker_draft,
            copy_cp_maker_draft,
            build_cp_maker_map_asset,
            export_cp_maker_pack,
            import_cp_maker_pack,
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
            load_resource_registry,
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
            load_launcher_runtime_info,
            set_launcher_mod_enabled,
            search_launcher_catalog,
            load_launcher_remote_mod_detail,
            load_launcher_update_changelog,
            clear_launcher_image_cache,
            load_launcher_nexus_diagnostics,
            restart_launcher_nexus_diagnostics,
            retry_launcher_nexus_diagnostics_route,
            set_launcher_nexus_force_offline,
            resolve_launcher_image,
            load_cached_launcher_updates,
            load_suppressed_launcher_update_mod_ids,
            check_launcher_updates,
            download_launcher_mod,
            cancel_launcher_download,
            inspect_launcher_archive,
            install_launcher_archive,
            list_launcher_install_backups,
            restore_launcher_install_backup,
            load_app_ui_state,
            patch_app_ui_state,
            set_debug_logging_enabled,
            write_frontend_log,
            validate_nexus_api_key,
            start_nexus_sso,
            get_nexus_sso_status,
            cancel_nexus_sso,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
