use crate::AppHandle;
use crate::domain;
use crate::host_runtime::{
    HostCommandCancelPolicy, HostCommandLane, HostCommandMutationPolicy, HostCommandResource,
    HostCommandResourceLocks, HostCommandResponse, HostCommandResponseWriter, HostCommandResult,
    HostCommandScheduler, HostCommandSchedulerConfig, ResolvedHostCommand,
};
use crate::support::logging::{self, DebugLoggingState};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
use std::sync::{Arc, Mutex};
use std::time::Instant;

type DispatchResult = HostCommandResult;
type SidecarLane = HostCommandLane;
type SidecarResource = HostCommandResource;
type SidecarResponse = HostCommandResponse;
type SidecarSchedulerConfig = HostCommandSchedulerConfig;
type SidecarScheduler = HostCommandScheduler;
type SidecarResourceLocks = HostCommandResourceLocks;
type ResolvedSidecarCommand = ResolvedHostCommand;
const NO_RESOURCES: &[HostCommandResource] = &[];

#[derive(Debug, Deserialize)]
pub(crate) struct RpcRequest {
    pub(crate) id: Value,
    pub(crate) command: String,
    #[serde(default)]
    pub(crate) args: Value,
}

type RpcResponse = SidecarResponse;

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

pub(crate) struct SidecarContext {
    app: AppHandle,
    debug_logging_state: DebugLoggingState,
}

impl Clone for SidecarContext {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            debug_logging_state: self.debug_logging_state.clone(),
        }
    }
}

impl SidecarContext {
    pub(crate) fn new(app: AppHandle, debug_logging_state: DebugLoggingState) -> Self {
        Self {
            app,
            debug_logging_state,
        }
    }
}

pub(crate) enum ResolvedSidecarCommandOrResponse {
    Command(ResolvedSidecarCommand),
    Response(RpcResponse),
}

fn sidecar_command<F>(
    id: Value,
    name: String,
    lane: SidecarLane,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    ResolvedSidecarCommandOrResponse::Command(ResolvedSidecarCommand {
        id,
        name,
        lane,
        resources,
        cancel_policy: HostCommandCancelPolicy::NotCancellable,
        mutation_policy: if resources.is_empty() {
            HostCommandMutationPolicy::Concurrent
        } else {
            HostCommandMutationPolicy::ExclusiveResources
        },
        submitted_at: Instant::now(),
        run: Box::new(move |_| run()),
    })
}

fn control<F>(id: Value, name: String, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Control, NO_RESOURCES, run)
}

fn network<F>(id: Value, name: String, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Network, NO_RESOURCES, run)
}

fn io_lane<F>(id: Value, name: String, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Io, NO_RESOURCES, run)
}

fn mutation<F>(id: Value, name: String, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Mutation, NO_RESOURCES, run)
}

fn control_with_resources<F>(
    id: Value,
    name: String,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Control, resources, run)
}

fn io_with_resources<F>(
    id: Value,
    name: String,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Io, resources, run)
}

fn mutation_with_resources<F>(
    id: Value,
    name: String,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Mutation, resources, run)
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

pub(crate) fn resolve_command(
    ctx: &SidecarContext,
    request: RpcRequest,
) -> ResolvedSidecarCommandOrResponse {
    let RpcRequest { id, command, args } = request;

    match command.as_str() {
        "detect_default_game_directory" => io_lane(id, command, || {
            ok(Ok::<_, String>(
                domain::assets::detect_default_game_directory(),
            ))
        }),
        "list_known_game_directories" => io_lane(id, command, || {
            ok(Ok::<_, String>(
                domain::assets::list_known_game_directories(),
            ))
        }),
        "get_file_cache_stats" => {
            io_lane(id, command, || ok(domain::assets::get_file_cache_stats()))
        }
        "clear_file_cache" => mutation(id, command, || ok(domain::assets::clear_file_cache())),
        "validate_game_directory" => io_lane(id, command, move || {
            ok(domain::assets::validate_game_directory(arg(&args, "path")?))
        }),
        "scan_maps" => io_lane(id, command, move || {
            ok(domain::assets::scan_maps(
                arg(&args, "path")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        "scan_events" => io_lane(id, command, move || {
            ok(domain::assets::scan_events(arg(&args, "path")?))
        }),
        "load_map_asset" => io_lane(id, command, move || {
            ok(domain::assets::load_map_asset(
                arg(&args, "rootPath")?,
                arg(&args, "mapPath")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        "load_text_asset" => io_lane(id, command, move || {
            ok(domain::assets::load_text_asset(
                arg(&args, "rootPath")?,
                arg(&args, "assetPath")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        "load_text_file" => io_lane(id, command, move || {
            ok(domain::assets::load_text_file(arg(&args, "path")?))
        }),
        "load_image_data_url" => io_lane(id, command, move || {
            ok(domain::assets::load_image_data_url(
                arg(&args, "path")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        "scan_audio_assets" => io_lane(id, command, move || {
            ok(domain::assets::scan_audio_assets(arg(&args, "path")?))
        }),
        "load_audio_data_url" => io_lane(id, command, move || {
            ok(domain::assets::load_audio_data_url(arg(&args, "path")?))
        }),
        "load_xact_audio_data_url" => io_lane(id, command, move || {
            let root_path: String = arg(&args, "rootPath")?;
            let cue: String = arg(&args, "cue")?;
            ok(
                crate::infrastructure::game_formats::xact::load_xact_audio_data_url_for_paths(
                    &root_path, &cue,
                ),
            )
        }),
        "load_resource_registry" => io_lane(id, command, move || {
            ok(domain::resource_registry::load_resource_registry(
                arg(&args, "rootPath")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        "scan_default_save_slots" => {
            io_lane(id, command, || ok(domain::saves::scan_default_save_slots()))
        }

        "scan_mod_projects" => io_lane(id, command, move || {
            ok(domain::mods::scan_mod_projects(arg(&args, "rootPath")?))
        }),
        "scan_mod_asset_index" => io_lane(id, command, move || {
            ok(domain::mods::scan_mod_asset_index(arg(&args, "rootPath")?))
        }),
        "load_mod_project" => io_lane(id, command, move || {
            ok(domain::mods::load_mod_project(arg(&args, "path")?))
        }),
        "save_mod_project" => mutation(id, command, move || {
            ok(domain::mods::save_mod_project(arg_or_whole(
                &args, "request",
            )?))
        }),

        "load_content_patcher_project" => io_lane(id, command, move || {
            ok(domain::content_patcher::project::load_content_patcher_project(arg(&args, "path")?))
        }),
        "simulate_content_patcher" => io_lane(id, command, move || {
            ok(domain::content_patcher::simulate_content_patcher(arg(
                &args, "request",
            )?))
        }),
        "load_content_patcher_result_asset" => io_lane(id, command, move || {
            ok(domain::content_patcher::load_content_patcher_result_asset(
                arg(&args, "request")?,
            ))
        }),
        "export_content_patcher_asset" => mutation(id, command, move || {
            ok(domain::content_patcher::export_content_patcher_asset(arg(
                &args, "request",
            )?))
        }),

        "list_cp_maker_drafts" => {
            io_lane(id, command, || ok(domain::cp_maker::list_cp_maker_drafts()))
        }
        "load_cp_maker_draft" => io_lane(id, command, move || {
            ok(domain::cp_maker::load_cp_maker_draft(arg(
                &args,
                "draftStorageKey",
            )?))
        }),
        "save_cp_maker_draft" => mutation(id, command, move || {
            ok(domain::cp_maker::save_cp_maker_draft(arg(&args, "draft")?))
        }),
        "delete_cp_maker_draft" => mutation(id, command, move || {
            ok(domain::cp_maker::delete_cp_maker_draft(arg(
                &args,
                "draftStorageKey",
            )?))
        }),
        "copy_cp_maker_draft" => mutation(id, command, move || {
            ok(domain::cp_maker::copy_cp_maker_draft(arg(
                &args, "request",
            )?))
        }),
        "export_cp_maker_pack" => mutation(id, command, move || {
            ok(domain::cp_maker::export_cp_maker_pack(arg(
                &args, "request",
            )?))
        }),
        "build_cp_maker_map_asset" => mutation(id, command, move || {
            ok(domain::cp_maker::build_cp_maker_map_asset(arg(
                &args, "request",
            )?))
        }),
        "import_cp_maker_pack" => mutation(id, command, move || {
            let mod_directory_path: String = arg(&args, "modDirectoryPath")?;
            ok(domain::cp_maker::import_cp_maker_pack(&mod_directory_path))
        }),

        "load_launcher_settings" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherSettings],
                move || ok(domain::launcher::settings::load_launcher_settings(app)),
            )
        }
        "save_launcher_settings" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherSettings],
                move || {
                    ok(domain::launcher::settings::save_launcher_settings(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "launch_launcher_game" => {
            let app = ctx.app.clone();
            control_with_resources(
                id,
                command,
                &[SidecarResource::LauncherSettings],
                move || ok_error_value(domain::launcher::runtime::launch_launcher_game(app)),
            )
        }
        "get_launcher_backup_directory" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::runtime::get_launcher_backup_directory(
                        app,
                    ))
                },
            )
        }
        "open_launcher_path" => control(id, command, move || {
            ok(domain::launcher::runtime::open_launcher_path(arg(
                &args, "request",
            )?))
        }),
        "open_launcher_url" => control(id, command, move || {
            ok(domain::launcher::runtime::open_launcher_url(arg(
                &args, "request",
            )?))
        }),
        "load_launcher_library_state" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherLibraryState],
                move || ok(domain::launcher::library::load_launcher_library_state(app)),
            )
        }
        "save_launcher_library_state" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherLibraryState],
                move || {
                    ok(domain::launcher::library::save_launcher_library_state(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "load_launcher_library_covers" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherLibraryCovers],
                move || ok(domain::launcher::library::load_launcher_library_covers(app)),
            )
        }
        "set_launcher_library_cover" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherLibraryCovers],
                move || {
                    ok(domain::launcher::library::set_launcher_library_cover(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "persist_launcher_library_remote_cover" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(
                    domain::launcher::library::persist_launcher_library_remote_cover(
                        app,
                        arg(&args, "request")?,
                    ),
                ))
            })
        }
        "scan_launcher_library" => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                command,
                &[SidecarResource::LauncherLibraryCovers],
                move || {
                    ok(domain::launcher::library::scan_launcher_library(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "load_launcher_runtime_info" => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                command,
                &[SidecarResource::LauncherSettings],
                move || ok(domain::launcher::runtime::load_launcher_runtime_info(app)),
            )
        }
        "set_launcher_mod_enabled" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::library::set_launcher_mod_enabled(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "load_launcher_download_queue" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherDownloadQueue],
                move || {
                    ok(domain::launcher::downloads::load_launcher_download_queue(
                        app,
                    ))
                },
            )
        }
        "save_launcher_download_queue" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherDownloadQueue],
                move || {
                    ok(domain::launcher::downloads::save_launcher_download_queue(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "download_launcher_mod" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(domain::launcher::downloads::download_launcher_mod(
                    app,
                    arg(&args, "request")?,
                ))
            })
        }
        "cancel_launcher_download" => control(id, command, move || {
            ok(domain::launcher::downloads::cancel_launcher_download(arg(
                &args,
                "downloadId",
            )?))
        }),
        "search_launcher_catalog" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(
                    domain::nexusmods::catalog::search_launcher_catalog(
                        app,
                        arg(&args, "request")?,
                    ),
                ))
            })
        }
        "load_launcher_remote_mod_detail" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(
                    domain::nexusmods::mod_detail::load_launcher_remote_mod_detail(
                        app,
                        arg(&args, "request")?,
                    ),
                ))
            })
        }
        "load_launcher_update_changelog" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(
                    domain::nexusmods::mod_detail::load_launcher_update_changelog(
                        app,
                        arg(&args, "request")?,
                    ),
                ))
            })
        }
        "resolve_launcher_image" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(
                    domain::launcher::image_cache::resolve_launcher_image(
                        app,
                        arg(&args, "request")?,
                    ),
                ))
            })
        }
        "clear_launcher_image_cache" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherImageCache],
                move || {
                    ok(domain::launcher::image_cache::clear_launcher_image_cache(
                        app,
                    ))
                },
            )
        }
        "load_launcher_nexus_diagnostics" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(domain::nexusmods::diagnostics::load_launcher_nexus_diagnostics(&app))
            })
        }
        "restart_launcher_nexus_diagnostics" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(
                    domain::nexusmods::diagnostics::restart_launcher_nexus_diagnostics_with_app(
                        &app,
                    ),
                )
            })
        }
        "retry_launcher_nexus_diagnostics_route" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(
                    domain::nexusmods::diagnostics::retry_launcher_nexus_diagnostics_route(
                        &app,
                        arg(&args, "routeId")?,
                    ),
                )
            })
        }
        "set_launcher_nexus_force_offline" => {
            let app = ctx.app.clone();
            mutation_with_resources(id, command, &[SidecarResource::AppUiState], move || {
                ok(
                    domain::nexusmods::diagnostics::set_launcher_nexus_force_offline(
                        &app,
                        arg(&args, "forceOffline")?,
                    ),
                )
            })
        }
        "load_cached_launcher_updates" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherUpdatesCache],
                move || {
                    ok(domain::launcher::updates::load_cached_launcher_updates(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "load_suppressed_launcher_update_mod_ids" => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                command,
                &[SidecarResource::LauncherUpdatesCache],
                move || {
                    ok(
                        domain::launcher::updates::load_suppressed_launcher_update_mod_ids(
                            app,
                            arg(&args, "request")?,
                        ),
                    )
                },
            )
        }
        "check_launcher_updates" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(block_on(domain::launcher::updates::check_launcher_updates(
                    app,
                    arg(&args, "request")?,
                )))
            })
        }
        "inspect_launcher_archive" => io_lane(id, command, move || {
            ok(domain::launcher::archive::inspect_launcher_archive(arg(
                &args, "request",
            )?))
        }),
        "install_launcher_archive" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[
                    SidecarResource::LauncherSettings,
                    SidecarResource::LauncherInstallTree,
                ],
                move || {
                    ok(domain::launcher::archive::install_launcher_archive(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "list_launcher_install_backups" => {
            let app = ctx.app.clone();
            io_lane(id, command, move || {
                ok(domain::launcher::archive::list_launcher_install_backups(
                    app,
                    arg(&args, "request")?,
                ))
            })
        }
        "restore_launcher_install_backup" => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                command,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::archive::restore_launcher_install_backup(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        "validate_nexus_api_key" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(domain::nexusmods::validate_nexus_api_key(app))
            })
        }
        "start_nexus_sso" => {
            let app = ctx.app.clone();
            network(id, command, move || {
                ok(domain::nexusmods::sso::start_sso_with_status(&app))
            })
        }
        "get_nexus_sso_status" => control(id, command, || {
            ok(Ok::<_, String>(domain::nexusmods::sso::get_sso_status()))
        }),
        "cancel_nexus_sso" => control(id, command, || {
            domain::nexusmods::sso::cancel_sso();
            Ok(Value::Null)
        }),

        "load_app_ui_state" => {
            mutation_with_resources(id, command, &[SidecarResource::AppUiState], || {
                ok(domain::app_ui::load_app_ui_state())
            })
        }
        "patch_app_ui_state" => {
            mutation_with_resources(id, command, &[SidecarResource::AppUiState], move || {
                ok(domain::app_ui::patch_app_ui_state(arg(&args, "request")?))
            })
        }
        "write_frontend_log" => control(id, command, move || {
            logging::write_frontend_log(arg(&args, "request")?);
            Ok(Value::Null)
        }),
        "set_debug_logging_enabled" => {
            let debug_logging_state = ctx.debug_logging_state.clone();
            control(id, command, move || {
                logging::set_debug_logging_enabled(&debug_logging_state, arg(&args, "enabled")?);
                Ok(Value::Null)
            })
        }
        _ => ResolvedSidecarCommandOrResponse::Response(RpcResponse {
            id,
            ok: false,
            result: None,
            error: Some(json!(format!("Unknown sidecar command: {command}"))),
        }),
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

struct StdoutResponseWriter {
    stdout: Arc<Mutex<io::Stdout>>,
}

impl HostCommandResponseWriter for StdoutResponseWriter {
    fn write_response(&self, response: &RpcResponse) -> Result<(), String> {
        write_json_line(&self.stdout, response)
    }
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
    if let Err(error) = logging::init_sidecar_logging(&debug_logging_state) {
        logging::write_sidecar_fallback_log(
            log::Level::Error,
            "Sidecar",
            format!("modforge sidecar logging init failed: {error}"),
        );
    }
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
        log::warn!(
            target: "Nexus",
            "Startup diagnostics probe could not start: error={error}"
        );
    }

    let ctx = SidecarContext {
        app,
        debug_logging_state,
    };
    let scheduler = SidecarScheduler::new(
        Arc::new(StdoutResponseWriter {
            stdout: Arc::clone(&stdout),
        }),
        Arc::new(SidecarResourceLocks::new()),
        SidecarSchedulerConfig::default(),
    );

    for line in io::stdin().lock().lines() {
        let line = line.map_err(|error| format!("Failed to read sidecar stdin: {error}"))?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<RpcRequest>(&line) {
            Ok(request) => match resolve_command(&ctx, request) {
                ResolvedSidecarCommandOrResponse::Command(command) => {
                    scheduler.submit(command);
                    continue;
                }
                ResolvedSidecarCommandOrResponse::Response(response) => response,
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

#[cfg(test)]
mod tests;
