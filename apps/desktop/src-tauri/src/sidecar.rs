use crate::AppHandle;
use crate::commands;
use crate::domain;
use crate::support::logging::{self, DebugLoggingState};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};

type DispatchResult = Result<Value, Value>;

#[derive(Debug, Deserialize)]
struct RpcRequest {
    id: Value,
    command: String,
    #[serde(default)]
    args: Value,
}

#[derive(Debug, Serialize)]
struct RpcResponse {
    id: Value,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HostEventFrame<'a> {
    event: &'a str,
    payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RpcEventFrame<'a> {
    event: HostEventFrame<'a>,
}

struct SidecarContext {
    app: AppHandle,
    debug_logging_state: DebugLoggingState,
}

fn arg<T>(args: &Value, key: &str) -> Result<T, Value>
where
    T: DeserializeOwned,
{
    let value = args
        .get(key)
        .ok_or_else(|| json!(format!("Missing required command argument: {key}")))?;
    serde_json::from_value(value.clone())
        .map_err(|error| json!(format!("Invalid command argument {key}: {error}")))
}

fn arg_or_whole<T>(args: &Value, key: &str) -> Result<T, Value>
where
    T: DeserializeOwned,
{
    let value = args.get(key).unwrap_or(args);
    serde_json::from_value(value.clone())
        .map_err(|error| json!(format!("Invalid command arguments for {key}: {error}")))
}

fn optional_arg<T>(args: &Value, key: &str) -> Result<Option<T>, Value>
where
    T: DeserializeOwned,
{
    match args.get(key) {
        Some(Value::Null) | None => Ok(None),
        Some(value) => serde_json::from_value(value.clone())
            .map(Some)
            .map_err(|error| json!(format!("Invalid command argument {key}: {error}"))),
    }
}

fn ok<T, E>(result: Result<T, E>) -> DispatchResult
where
    T: Serialize,
    E: ToString,
{
    result
        .map(|value| serde_json::to_value(value).unwrap_or(Value::Null))
        .map_err(|error| json!(error.to_string()))
}

fn ok_error_value<T, E>(result: Result<T, E>) -> DispatchResult
where
    T: Serialize,
    E: Serialize,
{
    match result {
        Ok(value) => Ok(serde_json::to_value(value).unwrap_or(Value::Null)),
        Err(error) => Err(serde_json::to_value(error).unwrap_or_else(|_| json!("Command failed."))),
    }
}

fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
    tauri::async_runtime::block_on(future)
}

fn dispatch(ctx: &SidecarContext, command: &str, args: &Value) -> DispatchResult {
    match command {
        "detect_default_game_directory" => ok(Ok::<_, String>(
            commands::assets::detect_default_game_directory(),
        )),
        "list_known_game_directories" => ok(Ok::<_, String>(
            commands::assets::list_known_game_directories(),
        )),
        "get_file_cache_stats" => ok(commands::assets::get_file_cache_stats()),
        "clear_file_cache" => ok(commands::assets::clear_file_cache()),
        "validate_game_directory" => ok(commands::assets::validate_game_directory(arg(
            args, "path",
        )?)),
        "scan_maps" => ok(commands::assets::scan_maps(
            arg(args, "path")?,
            optional_arg(args, "locale")?,
        )),
        "scan_events" => ok(commands::assets::scan_events(arg(args, "path")?)),
        "load_map_asset" => ok(commands::assets::load_map_asset(
            arg(args, "rootPath")?,
            arg(args, "mapPath")?,
            optional_arg(args, "locale")?,
        )),
        "load_text_asset" => ok(commands::assets::load_text_asset(
            arg(args, "rootPath")?,
            arg(args, "assetPath")?,
            optional_arg(args, "locale")?,
        )),
        "load_text_file" => ok(commands::assets::load_text_file(arg(args, "path")?)),
        "load_image_data_url" => ok(commands::assets::load_image_data_url(
            arg(args, "path")?,
            optional_arg(args, "locale")?,
        )),
        "scan_audio_assets" => ok(commands::assets::scan_audio_assets(arg(args, "path")?)),
        "load_audio_data_url" => ok(commands::assets::load_audio_data_url(arg(args, "path")?)),
        "load_xact_audio_data_url" => ok(commands::audio::load_xact_audio_data_url(
            arg(args, "rootPath")?,
            arg(args, "cue")?,
        )),
        "load_resource_registry" => ok(commands::resource_registry::load_resource_registry(
            arg(args, "rootPath")?,
            optional_arg(args, "locale")?,
        )),
        "scan_default_save_slots" => ok(commands::saves::scan_default_save_slots()),

        "scan_mod_projects" => ok(commands::mods::scan_mod_projects(arg(args, "rootPath")?)),
        "scan_mod_asset_index" => ok(commands::mods::scan_mod_asset_index(arg(args, "rootPath")?)),
        "load_mod_project" => ok(commands::mods::load_mod_project(arg(args, "path")?)),
        "save_mod_project" => ok(commands::mods::save_mod_project(arg_or_whole(
            args, "request",
        )?)),

        "load_content_patcher_project" => ok(
            commands::content_patcher::load_content_patcher_project(arg(args, "path")?),
        ),
        "simulate_content_patcher" => ok(commands::content_patcher::simulate_content_patcher(arg(
            args, "request",
        )?)),
        "load_content_patcher_result_asset" => {
            ok(commands::content_patcher::load_content_patcher_result_asset(arg(args, "request")?))
        }
        "export_content_patcher_asset" => ok(
            commands::content_patcher::export_content_patcher_asset(arg(args, "request")?),
        ),

        "list_cp_maker_drafts" => ok(commands::cp_maker::list_cp_maker_drafts()),
        "load_cp_maker_draft" => ok(commands::cp_maker::load_cp_maker_draft(arg(
            args,
            "draftStorageKey",
        )?)),
        "save_cp_maker_draft" => ok(commands::cp_maker::save_cp_maker_draft(arg(args, "draft")?)),
        "delete_cp_maker_draft" => ok(commands::cp_maker::delete_cp_maker_draft(arg(
            args,
            "draftStorageKey",
        )?)),
        "copy_cp_maker_draft" => ok(commands::cp_maker::copy_cp_maker_draft(arg(
            args, "request",
        )?)),
        "export_cp_maker_pack" => ok(commands::cp_maker::export_cp_maker_pack(arg(
            args, "request",
        )?)),
        "build_cp_maker_map_asset" => ok(commands::cp_maker::build_cp_maker_map_asset(arg(
            args, "request",
        )?)),
        "import_cp_maker_pack" => ok(commands::cp_maker::import_cp_maker_pack(arg(
            args,
            "modDirectoryPath",
        )?)),

        "load_launcher_settings" => ok(commands::launcher::load_launcher_settings(ctx.app.clone())),
        "save_launcher_settings" => ok(commands::launcher::save_launcher_settings(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "launch_launcher_game" => {
            ok_error_value(commands::launcher::launch_launcher_game(ctx.app.clone()))
        }
        "get_launcher_backup_directory" => ok(commands::launcher::get_launcher_backup_directory(
            ctx.app.clone(),
        )),
        "open_launcher_path" => ok(commands::launcher::open_launcher_path(arg(
            args, "request",
        )?)),
        "open_launcher_url" => ok(commands::launcher::open_launcher_url(arg(args, "request")?)),
        "load_launcher_library_state" => ok(commands::launcher::load_launcher_library_state(
            ctx.app.clone(),
        )),
        "save_launcher_library_state" => ok(commands::launcher::save_launcher_library_state(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "load_launcher_library_covers" => ok(commands::launcher::load_launcher_library_covers(
            ctx.app.clone(),
        )),
        "set_launcher_library_cover" => ok(commands::launcher::set_launcher_library_cover(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "persist_launcher_library_remote_cover" => ok(block_on(
            commands::launcher::persist_launcher_library_remote_cover(
                ctx.app.clone(),
                arg(args, "request")?,
            ),
        )),
        "scan_launcher_library" => ok(commands::launcher::scan_launcher_library(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "load_launcher_runtime_info" => ok(commands::launcher::load_launcher_runtime_info(
            ctx.app.clone(),
        )),
        "set_launcher_mod_enabled" => ok(commands::launcher::set_launcher_mod_enabled(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "load_launcher_download_queue" => ok(commands::launcher::load_launcher_download_queue(
            ctx.app.clone(),
        )),
        "save_launcher_download_queue" => ok(commands::launcher::save_launcher_download_queue(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "download_launcher_mod" => ok(block_on(commands::launcher::download_launcher_mod(
            ctx.app.clone(),
            arg(args, "request")?,
        ))),
        "search_launcher_catalog" => ok(block_on(commands::launcher::search_launcher_catalog(
            ctx.app.clone(),
            arg(args, "request")?,
        ))),
        "load_launcher_remote_mod_detail" => ok(block_on(
            commands::launcher::load_launcher_remote_mod_detail(
                ctx.app.clone(),
                arg(args, "request")?,
            ),
        )),
        "load_launcher_update_changelog" => ok(block_on(
            commands::launcher::load_launcher_update_changelog(
                ctx.app.clone(),
                arg(args, "request")?,
            ),
        )),
        "resolve_launcher_image" => ok(block_on(commands::launcher::resolve_launcher_image(
            ctx.app.clone(),
            arg(args, "request")?,
        ))),
        "clear_launcher_image_cache" => ok(commands::launcher::clear_launcher_image_cache(
            ctx.app.clone(),
        )),
        "load_launcher_nexus_diagnostics" => ok(block_on(
            commands::launcher::load_launcher_nexus_diagnostics(ctx.app.clone()),
        )),
        "restart_launcher_nexus_diagnostics" => ok(block_on(
            commands::launcher::restart_launcher_nexus_diagnostics(ctx.app.clone()),
        )),
        "retry_launcher_nexus_diagnostics_route" => ok(block_on(
            commands::launcher::retry_launcher_nexus_diagnostics_route(
                ctx.app.clone(),
                arg(args, "routeId")?,
            ),
        )),
        "set_launcher_nexus_force_offline" => ok(block_on(
            commands::launcher::set_launcher_nexus_force_offline(
                ctx.app.clone(),
                arg(args, "forceOffline")?,
            ),
        )),
        "load_cached_launcher_updates" => ok(commands::launcher::load_cached_launcher_updates(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "load_suppressed_launcher_update_mod_ids" => {
            ok(commands::launcher::load_suppressed_launcher_update_mod_ids(
                ctx.app.clone(),
                arg(args, "request")?,
            ))
        }
        "check_launcher_updates" => ok(block_on(commands::launcher::check_launcher_updates(
            ctx.app.clone(),
            arg(args, "request")?,
        ))),
        "inspect_launcher_archive" => ok(block_on(commands::launcher::inspect_launcher_archive(
            arg(args, "request")?,
        ))),
        "install_launcher_archive" => ok(block_on(commands::launcher::install_launcher_archive(
            ctx.app.clone(),
            arg(args, "request")?,
        ))),
        "list_launcher_install_backups" => ok(commands::launcher::list_launcher_install_backups(
            ctx.app.clone(),
            arg(args, "request")?,
        )),
        "restore_launcher_install_backup" => {
            ok(commands::launcher::restore_launcher_install_backup(
                ctx.app.clone(),
                arg(args, "request")?,
            ))
        }
        "validate_nexus_api_key" => ok(block_on(commands::launcher::validate_nexus_api_key(
            ctx.app.clone(),
        ))),
        "start_nexus_sso" => ok(commands::launcher::start_nexus_sso(ctx.app.clone())),
        "get_nexus_sso_status" => ok(commands::launcher::get_nexus_sso_status()),
        "cancel_nexus_sso" => ok(commands::launcher::cancel_nexus_sso()),

        "load_app_ui_state" => ok(commands::app_ui::load_app_ui_state()),
        "patch_app_ui_state" => ok(commands::app_ui::patch_app_ui_state(arg(args, "request")?)),
        "write_frontend_log" => {
            logging::write_frontend_log(arg(args, "request")?);
            Ok(Value::Null)
        }
        "set_debug_logging_enabled" => {
            logging::set_debug_logging_enabled(&ctx.debug_logging_state, arg(args, "enabled")?);
            Ok(Value::Null)
        }
        _ => Err(json!(format!("Unknown sidecar command: {command}"))),
    }
}

fn write_json_line<T: Serialize>(stdout: &Arc<Mutex<io::Stdout>>, value: &T) -> Result<(), String> {
    let mut stdout = stdout
        .lock()
        .map_err(|_| "Failed to lock sidecar stdout.".to_string())?;
    serde_json::to_writer(&mut *stdout, value)
        .map_err(|error| format!("Failed to serialize sidecar frame: {error}"))?;
    stdout
        .write_all(b"\n")
        .map_err(|error| format!("Failed to write sidecar frame: {error}"))?;
    stdout
        .flush()
        .map_err(|error| format!("Failed to flush sidecar frame: {error}"))
}

pub fn run_stdio() -> Result<(), String> {
    let stdout = Arc::new(Mutex::new(io::stdout()));
    let event_stdout = Arc::clone(&stdout);
    let app = AppHandle::sidecar(move |event, payload| {
        write_json_line(
            &event_stdout,
            &RpcEventFrame {
                event: HostEventFrame { event, payload },
            },
        )
    });
    let debug_logging_state = DebugLoggingState::new();
    debug_logging_state.set_enabled(false);

    let diagnostics_start_result = domain::app_ui::load_app_ui_state()
        .map(|state| state.launcher.force_offline)
        .and_then(|force_offline| {
            if force_offline {
                domain::nexusmods::diagnostics::set_launcher_nexus_force_offline(&app, true)
                    .map(|_| ())
            } else {
                domain::nexusmods::diagnostics::prime_launcher_nexus_diagnostics(&app)
            }
        });
    if let Err(error) = diagnostics_start_result {
        eprintln!("launcher nexus diagnostics startup probe could not start: {error}");
    }

    let ctx = SidecarContext {
        app,
        debug_logging_state,
    };

    for line in io::stdin().lock().lines() {
        let line = line.map_err(|error| format!("Failed to read sidecar stdin: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<RpcRequest>(&line) {
            Ok(request) => match dispatch(&ctx, &request.command, &request.args) {
                Ok(result) => RpcResponse {
                    id: request.id,
                    ok: true,
                    result: Some(result),
                    error: None,
                },
                Err(error) => RpcResponse {
                    id: request.id,
                    ok: false,
                    result: None,
                    error: Some(error),
                },
            },
            Err(error) => RpcResponse {
                id: Value::Null,
                ok: false,
                result: None,
                error: Some(json!(format!("Invalid sidecar JSON-RPC request: {error}"))),
            },
        };

        write_json_line(&stdout, &response)?;
    }

    Ok(())
}
