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
#[path = "../tests/support/mod.rs"]
pub mod test_support;
pub use support::logging;

pub type AppRuntime = tauri::Wry;
pub type AppHandle = host::HostHandle;

/// Read-only diagnostics exposed to local performance examples.
pub mod diagnostics {
    pub use crate::domain::localization::semantic::{SemanticBenchmarkSample, benchmark_query};
}

use commands::ai::{
    apply_ai_profiles_import, cancel_ai_job, clear_ai_translation_cache, export_ai_profiles,
    get_ai_translation_cache_stats, list_ai_models, load_ai_settings, preview_ai_profiles_import,
    read_ai_translation_cache, save_ai_settings, test_ai_profile, translate_ai_batch,
    write_ai_translation_cache,
};
use commands::ai_usage::{
    clear_ai_usage, export_ai_usage, query_ai_usage_records, query_ai_usage_summary,
};
use commands::app_ui::{load_app_ui_state, patch_app_ui_state};
use commands::assets::{
    clear_file_cache, detect_default_game_directory, export_file, export_map_png,
    get_file_cache_stats, list_known_game_directories, load_audio_data_url, load_event_asset,
    load_image_data_url, load_map_asset, load_text_asset, load_text_file, scan_audio_assets,
    scan_events, scan_maps, validate_game_directory,
};
use commands::audio::load_xact_audio_data_url;
use commands::content_patcher::load_content_patcher_result_asset;
use commands::cp_maker::{
    build_cp_maker_map_asset, copy_cp_maker_draft, delete_cp_maker_draft, export_cp_maker_pack,
    import_cp_maker_pack, list_cp_maker_drafts, load_cp_maker_draft, load_cp_maker_session,
    save_cp_maker_draft, save_cp_maker_session,
};
use commands::launcher::{
    cancel_launcher_download, cancel_nexus_sso, check_launcher_updates, clear_launcher_image_cache,
    download_launcher_mod, get_launcher_backup_directory, get_nexus_sso_status,
    inspect_launcher_archive, install_launcher_archive, launch_launcher_game,
    list_launcher_install_backups, load_cached_launcher_updates, load_launcher_download_queue,
    load_launcher_gmcm_probe_diagnostics, load_launcher_image_failures,
    load_launcher_library_covers, load_launcher_library_state, load_launcher_mod_config,
    load_launcher_nexus_diagnostics, load_launcher_remote_mod_detail, load_launcher_runtime_info,
    load_launcher_settings, load_launcher_update_changelog,
    load_suppressed_launcher_update_mod_ids, open_launcher_path, open_launcher_url,
    persist_launcher_library_remote_cover, record_launcher_image_failure,
    resolve_cached_launcher_image, resolve_launcher_image, restart_launcher_nexus_diagnostics,
    restore_launcher_install_backup, retry_launcher_nexus_diagnostics_route,
    save_launcher_download_queue, save_launcher_library_state, save_launcher_mod_config,
    save_launcher_settings, scan_launcher_library, search_launcher_catalog,
    set_launcher_library_cover, set_launcher_mod_enabled, set_launcher_nexus_force_offline,
    start_nexus_sso, validate_nexus_api_key,
};
use commands::localization::{
    acquire_localization_semantic_runtime, cancel_localization_job,
    copy_translation_memory_entries, create_localization_profile,
    delete_localization_glossary_entries, delete_localization_profile,
    delete_localization_semantic_model, delete_translation_memory_entries,
    download_localization_semantic_model, export_localization_knowledge,
    import_localization_knowledge, initialize_localization_plan, inspect_localization_context,
    inspect_localization_semantic_index, inspect_localization_semantic_model,
    inspect_official_localization_index, list_localization_glossary_entries,
    list_localization_review_runs, list_localization_scopes, load_localization_default_engine,
    load_localization_review_run, load_localization_scope, load_localization_semantic_settings,
    load_localization_style_guide, open_localization_semantic_model_directory,
    probe_localization_semantic_search, rebuild_localization_semantic_index,
    rebuild_official_localization_index, record_confirmed_translations,
    release_localization_semantic_runtime, remove_localization_profile_binding,
    rename_localization_profile, resolve_localization_scope, review_localization_batch,
    save_localization_default_engine, save_localization_scope_settings,
    save_localization_semantic_settings, save_localization_style_guide,
    search_official_localization, search_translation_memory, set_localization_profile_binding,
    sync_localization_semantic_index, test_localization_semantic_remote_profile,
    translate_localization_batch, unload_localization_semantic_runtime,
    update_localization_review_issues, upsert_localization_glossary_entries,
    verify_localization_semantic_model,
};
use commands::logging::{
    print_host_runtime_diagnostics, set_debug_logging_enabled, write_frontend_log,
};
use commands::machine_translation::{
    list_machine_translation_languages, load_machine_translation_settings,
    save_machine_translation_settings, test_machine_translation_profile,
    translate_machine_translation_batch,
};
use commands::mods::{
    inspect_mod_archive, load_mod_project, save_mod_i18n_files, scan_mod_asset_index,
    scan_mod_projects,
};
use commands::resource_registry::load_resource_registry;
use commands::saves::scan_default_save_slots;
use support::logging::{DebugLoggingState, init_host_logging};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{RunEvent, generate_context};

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

            let tray_menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Show ModForge Studio", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("default window icon is not set"),
                )
                .tooltip("ModForge Studio")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            match window.is_visible() {
                                Ok(true) => {
                                    let _ = window.hide();
                                }
                                _ => {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

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
            inspect_mod_archive,
            save_mod_i18n_files,
            list_cp_maker_drafts,
            load_cp_maker_draft,
            load_cp_maker_session,
            save_cp_maker_draft,
            save_cp_maker_session,
            delete_cp_maker_draft,
            copy_cp_maker_draft,
            build_cp_maker_map_asset,
            export_cp_maker_pack,
            import_cp_maker_pack,
            load_content_patcher_result_asset,
            load_map_asset,
            export_map_png,
            export_file,
            load_text_asset,
            load_event_asset,
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
            load_launcher_image_failures,
            record_launcher_image_failure,
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
            load_launcher_mod_config,
            load_launcher_gmcm_probe_diagnostics,
            save_launcher_mod_config,
            search_launcher_catalog,
            load_launcher_remote_mod_detail,
            load_launcher_update_changelog,
            clear_launcher_image_cache,
            load_launcher_nexus_diagnostics,
            restart_launcher_nexus_diagnostics,
            retry_launcher_nexus_diagnostics_route,
            set_launcher_nexus_force_offline,
            resolve_cached_launcher_image,
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
            print_host_runtime_diagnostics,
            set_debug_logging_enabled,
            write_frontend_log,
            validate_nexus_api_key,
            start_nexus_sso,
            get_nexus_sso_status,
            cancel_nexus_sso,
            load_ai_settings,
            save_ai_settings,
            export_ai_profiles,
            preview_ai_profiles_import,
            apply_ai_profiles_import,
            list_ai_models,
            test_ai_profile,
            translate_ai_batch,
            cancel_ai_job,
            read_ai_translation_cache,
            write_ai_translation_cache,
            get_ai_translation_cache_stats,
            clear_ai_translation_cache,
            query_ai_usage_summary,
            query_ai_usage_records,
            export_ai_usage,
            clear_ai_usage,
            load_localization_default_engine,
            save_localization_default_engine,
            load_machine_translation_settings,
            save_machine_translation_settings,
            list_machine_translation_languages,
            test_machine_translation_profile,
            translate_machine_translation_batch,
            translate_localization_batch,
            load_localization_semantic_settings,
            save_localization_semantic_settings,
            inspect_localization_semantic_model,
            verify_localization_semantic_model,
            probe_localization_semantic_search,
            download_localization_semantic_model,
            delete_localization_semantic_model,
            open_localization_semantic_model_directory,
            inspect_localization_semantic_index,
            rebuild_localization_semantic_index,
            sync_localization_semantic_index,
            test_localization_semantic_remote_profile,
            inspect_official_localization_index,
            rebuild_official_localization_index,
            search_official_localization,
            initialize_localization_plan,
            inspect_localization_context,
            acquire_localization_semantic_runtime,
            release_localization_semantic_runtime,
            unload_localization_semantic_runtime,
            cancel_localization_job,
            resolve_localization_scope,
            list_localization_scopes,
            load_localization_scope,
            save_localization_scope_settings,
            create_localization_profile,
            rename_localization_profile,
            delete_localization_profile,
            set_localization_profile_binding,
            remove_localization_profile_binding,
            list_localization_glossary_entries,
            upsert_localization_glossary_entries,
            delete_localization_glossary_entries,
            load_localization_style_guide,
            save_localization_style_guide,
            search_translation_memory,
            record_confirmed_translations,
            delete_translation_memory_entries,
            copy_translation_memory_entries,
            import_localization_knowledge,
            export_localization_knowledge,
            review_localization_batch,
            list_localization_review_runs,
            load_localization_review_run,
            update_localization_review_issues,
        ])
        .build(generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if matches!(event, RunEvent::Exit) {
                commands::runtime::print_host_runtime_diagnostics_summary("tauri exit");
            }
        });
}
