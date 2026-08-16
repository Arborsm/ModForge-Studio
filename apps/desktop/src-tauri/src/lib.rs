extern crate self as modforge_studio_desktop_lib;

mod domain;
mod host;
pub use host::host_commands;
pub use host::host_runtime;
mod infrastructure;
pub use host::sidecar;
mod support;

#[cfg(any(debug_assertions, feature = "dev-asset-bridge"))]
pub use host::dev_asset_bridge;

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

/// Read-only helpers for maintainer-owned, local map-pack acceptance reports.
#[cfg(feature = "installed-game-validation")]
pub mod map_validation {
    use anyhow::Context;
    use serde_json::Value;
    use std::path::Path;

    pub use crate::infrastructure::game_formats::map::MapDocument;

    pub fn read_relaxed_json(path: &Path) -> anyhow::Result<Value> {
        crate::infrastructure::game_formats::json_relaxed::read_json_file(
            path,
            &format!("map-pack audit JSON `{}`", path.display()),
        )
        .map(|(_, value)| value)
    }

    pub fn import_content_pack(path: &Path) -> anyhow::Result<Value> {
        let draft = crate::domain::cp_maker::builder::import_cp_maker_pack(
            path.to_string_lossy().as_ref(),
        )?;
        serde_json::to_value(draft).context("Failed to serialize imported content pack draft")
    }

    pub fn parse_map(path: &Path, relative_path: &str) -> anyhow::Result<MapDocument> {
        let bytes = std::fs::read(path)
            .with_context(|| format!("Failed to read map asset `{}`", path.display()))?;
        crate::infrastructure::game_formats::parse_map_asset(&bytes, path, relative_path)
    }

    pub fn is_tbin_xnb(path: &Path) -> anyhow::Result<bool> {
        let xnb = crate::infrastructure::game_formats::xnb::read_xnb_from_path(path)?;
        let has_tbin_reader = xnb.readers.iter().any(|reader| {
            matches!(
                reader.name.split(',').next().unwrap_or_default().trim(),
                "xTile.Pipeline.TideReader"
                    | "xTile.Pipeline.TbinReader"
                    | "xTile.Pipeline.TBinReader"
            )
        });
        Ok(has_tbin_reader && xnb.content.as_bytes().is_some())
    }

    pub fn serialize_map(document: &MapDocument) -> anyhow::Result<Option<Vec<u8>>> {
        match document.format {
            crate::infrastructure::game_formats::map::MapFormat::Tmx => {
                crate::infrastructure::game_formats::tmx::serialize_tmx_map(document).map(Some)
            }
            crate::infrastructure::game_formats::map::MapFormat::Tbin => {
                crate::infrastructure::game_formats::tbin::serialize_tbin_map(document).map(Some)
            }
            crate::infrastructure::game_formats::map::MapFormat::Xnb => Ok(None),
        }
    }

    pub fn parse_map_bytes(
        bytes: &[u8],
        source_path: &Path,
        relative_path: &str,
    ) -> anyhow::Result<MapDocument> {
        crate::infrastructure::game_formats::parse_map_asset(bytes, source_path, relative_path)
    }
}

use support::logging::{DebugLoggingState, init_host_logging};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{RunEvent, generate_context};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_logging_state = DebugLoggingState::new();
    init_host_logging(&debug_logging_state).expect("failed to initialize ModForge host logger");
    crate::support::cleanup::cleanup_tauri_shared_memory_leaks();

    tauri::Builder::<AppRuntime>::default()
        .manage(debug_logging_state.clone())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let host = AppHandle::from_tauri(app.handle().clone());
            let force_offline = crate::domain::app_ui::load_app_ui_state()
                .map(|state| state.launcher.force_offline)
                .unwrap_or(false);
            domain::nexusmods::diagnostics::prime_nexus_diagnostics_at_startup(&host, force_offline);

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
            // Generated by apps/desktop/scripts/generate-host-commands.mjs. Do not edit by hand.
            // domain::ai::commands
            domain::ai::commands::apply_ai_profiles_import,
            domain::ai::commands::cancel_ai_job,
            domain::ai::commands::clear_ai_translation_cache,
            domain::ai::commands::export_ai_profiles,
            domain::ai::commands::fetch_ai_models_dev_catalog,
            domain::ai::commands::get_ai_translation_cache_stats,
            domain::ai::commands::list_ai_models,
            domain::ai::commands::load_ai_settings,
            domain::ai::commands::preview_ai_profiles_import,
            domain::ai::commands::read_ai_translation_cache,
            domain::ai::commands::save_ai_settings,
            domain::ai::commands::test_ai_profile,
            domain::ai::commands::translate_ai_batch,
            domain::ai::commands::write_ai_translation_cache,
            // domain::app_ui::commands
            domain::app_ui::commands::load_app_ui_state,
            domain::app_ui::commands::patch_app_ui_state,
            // domain::assets::commands
            domain::assets::commands::clear_file_cache,
            domain::assets::commands::detect_default_game_directory,
            domain::assets::commands::export_file,
            domain::assets::commands::export_map_png,
            domain::assets::commands::get_file_cache_stats,
            domain::assets::commands::list_known_game_directories,
            domain::assets::commands::load_audio_data_url,
            domain::assets::commands::load_event_asset,
            domain::assets::commands::load_image_data_url,
            domain::assets::commands::load_map_asset,
            domain::assets::commands::load_text_asset,
            domain::assets::commands::load_text_file,
            domain::assets::commands::scan_audio_assets,
            domain::assets::commands::scan_data_assets,
            domain::assets::commands::scan_events,
            domain::assets::commands::scan_image_assets,
            domain::assets::commands::scan_maps,
            domain::assets::commands::validate_game_directory,
            // domain::content_patcher::commands
            domain::content_patcher::commands::load_content_patcher_result_asset,
            // domain::cp_maker::commands
            domain::cp_maker::commands::build_cp_maker_map_asset,
            domain::cp_maker::commands::copy_cp_maker_draft,
            domain::cp_maker::commands::delete_cp_maker_draft,
            domain::cp_maker::commands::delete_cp_maker_project_asset,
            domain::cp_maker::commands::export_cp_maker_pack,
            domain::cp_maker::commands::import_cp_maker_pack,
            domain::cp_maker::commands::import_cp_maker_project_assets,
            domain::cp_maker::commands::list_cp_maker_drafts,
            domain::cp_maker::commands::load_cp_maker_draft,
            domain::cp_maker::commands::load_cp_maker_project_map_asset,
            domain::cp_maker::commands::load_cp_maker_session,
            domain::cp_maker::commands::read_cp_maker_project_asset,
            domain::cp_maker::commands::rename_cp_maker_project_asset,
            domain::cp_maker::commands::save_cp_maker_draft,
            domain::cp_maker::commands::save_cp_maker_session,
            domain::cp_maker::commands::write_cp_maker_project_asset,
            domain::cp_maker::commands::write_cp_maker_project_assets,
            // domain::debug_bridge::commands
            domain::debug_bridge::commands::get_debug_bridge_mod_state,
            domain::debug_bridge::commands::get_debug_bridge_status,
            domain::debug_bridge::commands::install_debug_bridge_mod,
            domain::debug_bridge::commands::send_debug_bridge_command,
            // domain::launcher::commands
            domain::launcher::commands::cancel_launcher_download,
            domain::launcher::commands::cancel_nexus_sso,
            domain::launcher::commands::check_launcher_updates,
            domain::launcher::commands::check_smapi_update,
            domain::launcher::commands::clear_launcher_image_cache,
            domain::launcher::commands::download_launcher_mod,
            domain::launcher::commands::find_smapi_installer_downloads,
            domain::launcher::commands::get_launcher_backup_directory,
            domain::launcher::commands::get_nexus_sso_status,
            domain::launcher::commands::inspect_launcher_archive,
            domain::launcher::commands::install_launcher_archive,
            domain::launcher::commands::install_smapi_update,
            domain::launcher::commands::launch_launcher_game,
            domain::launcher::commands::list_launcher_install_backups,
            domain::launcher::commands::load_cached_launcher_updates,
            domain::launcher::commands::load_launcher_download_queue,
            domain::launcher::commands::load_launcher_gmcm_probe_diagnostics,
            domain::launcher::commands::load_launcher_image_failures,
            domain::launcher::commands::load_launcher_library_covers,
            domain::launcher::commands::load_launcher_library_state,
            domain::launcher::commands::load_launcher_mod_config,
            domain::launcher::commands::load_launcher_nexus_diagnostics,
            domain::launcher::commands::load_launcher_remote_mod_detail,
            domain::launcher::commands::load_launcher_runtime_info,
            domain::launcher::commands::load_launcher_settings,
            domain::launcher::commands::load_launcher_update_changelog,
            domain::launcher::commands::load_suppressed_launcher_update_mod_ids,
            domain::launcher::commands::open_launcher_path,
            domain::launcher::commands::open_launcher_url,
            domain::launcher::commands::persist_launcher_library_remote_cover,
            domain::launcher::commands::record_launcher_image_failure,
            domain::launcher::commands::resolve_cached_launcher_image,
            domain::launcher::commands::resolve_launcher_image,
            domain::launcher::commands::restart_launcher_nexus_diagnostics,
            domain::launcher::commands::restore_launcher_install_backup,
            domain::launcher::commands::retry_launcher_nexus_diagnostics_route,
            domain::launcher::commands::save_launcher_download_queue,
            domain::launcher::commands::save_launcher_library_state,
            domain::launcher::commands::save_launcher_mod_config,
            domain::launcher::commands::save_launcher_settings,
            domain::launcher::commands::scan_launcher_library,
            domain::launcher::commands::search_launcher_catalog,
            domain::launcher::commands::set_launcher_library_cover,
            domain::launcher::commands::set_launcher_mod_enabled,
            domain::launcher::commands::set_launcher_nexus_force_offline,
            domain::launcher::commands::start_nexus_sso,
            domain::launcher::commands::validate_nexus_api_key,
            // domain::localization::commands
            domain::localization::commands::acquire_localization_semantic_runtime,
            domain::localization::commands::cancel_localization_job,
            domain::localization::commands::clear_ai_usage,
            domain::localization::commands::copy_translation_memory_entries,
            domain::localization::commands::create_localization_profile,
            domain::localization::commands::delete_localization_glossary_entries,
            domain::localization::commands::delete_localization_profile,
            domain::localization::commands::delete_localization_semantic_model,
            domain::localization::commands::delete_translation_memory_entries,
            domain::localization::commands::download_localization_semantic_model,
            domain::localization::commands::export_ai_usage,
            domain::localization::commands::export_localization_knowledge,
            domain::localization::commands::import_localization_knowledge,
            domain::localization::commands::initialize_localization_plan,
            domain::localization::commands::inspect_localization_context,
            domain::localization::commands::inspect_localization_semantic_index,
            domain::localization::commands::inspect_localization_semantic_model,
            domain::localization::commands::inspect_official_localization_index,
            domain::localization::commands::list_localization_glossary_entries,
            domain::localization::commands::list_localization_review_runs,
            domain::localization::commands::list_localization_scopes,
            domain::localization::commands::load_localization_default_engine,
            domain::localization::commands::load_localization_review_run,
            domain::localization::commands::load_localization_scope,
            domain::localization::commands::load_localization_semantic_settings,
            domain::localization::commands::load_localization_style_guide,
            domain::localization::commands::open_localization_semantic_model_directory,
            domain::localization::commands::prewarm_localization_corpus,
            domain::localization::commands::probe_localization_semantic_search,
            domain::localization::commands::query_ai_usage_records,
            domain::localization::commands::query_ai_usage_summary,
            domain::localization::commands::rebuild_localization_semantic_index,
            domain::localization::commands::rebuild_official_localization_index,
            domain::localization::commands::record_confirmed_translations,
            domain::localization::commands::release_localization_semantic_runtime,
            domain::localization::commands::remove_localization_profile_binding,
            domain::localization::commands::rename_localization_profile,
            domain::localization::commands::resolve_localization_scope,
            domain::localization::commands::review_localization_batch,
            domain::localization::commands::save_localization_default_engine,
            domain::localization::commands::save_localization_scope_settings,
            domain::localization::commands::save_localization_semantic_settings,
            domain::localization::commands::save_localization_style_guide,
            domain::localization::commands::search_official_localization,
            domain::localization::commands::search_translation_memory,
            domain::localization::commands::set_localization_profile_binding,
            domain::localization::commands::sync_localization_semantic_index,
            domain::localization::commands::test_localization_semantic_remote_profile,
            domain::localization::commands::translate_localization_batch,
            domain::localization::commands::unload_localization_semantic_runtime,
            domain::localization::commands::update_localization_review_issues,
            domain::localization::commands::upsert_localization_glossary_entries,
            domain::localization::commands::verify_localization_semantic_model,
            // domain::localization::machine_translation::commands
            domain::localization::machine_translation::commands::list_machine_translation_languages,
            domain::localization::machine_translation::commands::load_machine_translation_settings,
            domain::localization::machine_translation::commands::save_machine_translation_settings,
            domain::localization::machine_translation::commands::test_machine_translation_profile,
            domain::localization::machine_translation::commands::translate_machine_translation_batch,
            // domain::mods::commands
            domain::mods::commands::inspect_mod_archive,
            domain::mods::commands::load_mod_project,
            domain::mods::commands::save_mod_i18n_files,
            domain::mods::commands::scan_mod_asset_index,
            domain::mods::commands::scan_mod_projects,
            // domain::resource_registry::commands
            domain::resource_registry::commands::load_resource_registry,
            // domain::saves::commands
            domain::saves::commands::scan_default_save_slots,
            // infrastructure::game_formats::xact::commands
            infrastructure::game_formats::xact::commands::load_xact_audio_data_url,
            // support::logging::commands
            support::logging::commands::print_host_runtime_diagnostics,
            support::logging::commands::set_debug_logging_enabled,
            support::logging::commands::write_frontend_log,
        ])
        .build(generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if matches!(event, RunEvent::Exit) {
                crate::host_runtime::print_host_runtime_diagnostics_summary("tauri exit");
            }
        });
}
