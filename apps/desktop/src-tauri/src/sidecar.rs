use crate::AppHandle;
use crate::domain;
use crate::host_commands::HostCommandName;
use crate::host_runtime::{
    HostCommandCancelPolicy, HostCommandContext, HostCommandExecutionPool, HostCommandLane,
    HostCommandMutationPolicy, HostCommandResource, HostCommandResourceLocks, HostCommandResponse,
    HostCommandResponseWriter, HostCommandResult, HostCommandScheduler, HostCommandSchedulerConfig,
    ResolvedHostCommand,
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
type SidecarCommandName = HostCommandName;
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
    name: &SidecarCommandName,
    lane: SidecarLane,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce(HostCommandContext) -> DispatchResult + Send + 'static,
{
    ResolvedSidecarCommandOrResponse::Command(ResolvedSidecarCommand {
        id,
        name: name.as_str().to_string(),
        lane,
        execution_pool: HostCommandExecutionPool::Lane,
        resources,
        cancel_policy: HostCommandCancelPolicy::NotCancellable,
        mutation_policy: if resources.is_empty() {
            HostCommandMutationPolicy::Concurrent
        } else {
            HostCommandMutationPolicy::ExclusiveResources
        },
        submitted_at: Instant::now(),
        record_telemetry: false,
        run: Box::new(run),
    })
}

fn network_on_pool<F>(
    id: Value,
    name: &SidecarCommandName,
    execution_pool: HostCommandExecutionPool,
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    match sidecar_command(id, name, SidecarLane::Network, NO_RESOURCES, move |_| run()) {
        ResolvedSidecarCommandOrResponse::Command(mut command) => {
            command.execution_pool = execution_pool;
            ResolvedSidecarCommandOrResponse::Command(command)
        }
        response => response,
    }
}

fn control<F>(id: Value, name: &SidecarCommandName, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Control, NO_RESOURCES, move |_| run())
}

fn control_with_context<F>(
    id: Value,
    name: &SidecarCommandName,
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce(HostCommandContext) -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Control, NO_RESOURCES, run)
}

fn network<F>(id: Value, name: &SidecarCommandName, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Network, NO_RESOURCES, move |_| run())
}

fn io_lane<F>(id: Value, name: &SidecarCommandName, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Io, NO_RESOURCES, move |_| run())
}

fn mutation<F>(id: Value, name: &SidecarCommandName, run: F) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Mutation, NO_RESOURCES, move |_| {
        run()
    })
}

fn control_with_resources<F>(
    id: Value,
    name: &SidecarCommandName,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Control, resources, move |_| run())
}

fn io_with_resources<F>(
    id: Value,
    name: &SidecarCommandName,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Io, resources, move |_| run())
}

fn mutation_with_resources<F>(
    id: Value,
    name: &SidecarCommandName,
    resources: &'static [SidecarResource],
    run: F,
) -> ResolvedSidecarCommandOrResponse
where
    F: FnOnce() -> DispatchResult + Send + 'static,
{
    sidecar_command(id, name, SidecarLane::Mutation, resources, move |_| run())
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

pub(crate) fn resolve_command(
    ctx: &SidecarContext,
    request: RpcRequest,
) -> ResolvedSidecarCommandOrResponse {
    let RpcRequest { id, command, args } = request;
    let command_name = SidecarCommandName::from_protocol(command.clone());

    match command.as_str() {
        crate::host_command_wire!(detect_default_game_directory) => {
            io_lane(id, &command_name, || {
                ok(Ok::<_, String>(
                    domain::assets::detect_default_game_directory(),
                ))
            })
        }
        crate::host_command_wire!(list_known_game_directories) => {
            io_lane(id, &command_name, || {
                ok(Ok::<_, String>(
                    domain::assets::list_known_game_directories(),
                ))
            })
        }
        crate::host_command_wire!(get_file_cache_stats) => io_lane(id, &command_name, || {
            ok(domain::assets::get_file_cache_stats())
        }),
        crate::host_command_wire!(clear_file_cache) => {
            mutation(id, &command_name, || ok(domain::assets::clear_file_cache()))
        }
        crate::host_command_wire!(validate_game_directory) => {
            io_lane(id, &command_name, move || {
                ok(domain::assets::validate_game_directory(arg(&args, "path")?))
            })
        }
        crate::host_command_wire!(scan_maps) => io_lane(id, &command_name, move || {
            ok(domain::assets::scan_maps(
                arg(&args, "path")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        crate::host_command_wire!(scan_events) => io_lane(id, &command_name, move || {
            ok(domain::assets::scan_events(arg(&args, "path")?))
        }),
        crate::host_command_wire!(load_map_asset) => io_lane(id, &command_name, move || {
            ok(domain::assets::load_map_asset(
                arg(&args, "rootPath")?,
                arg(&args, "mapPath")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        crate::host_command_wire!(export_map_png) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::MapPngExport],
            move || {
                ok(domain::assets::export_map_png(
                    arg(&args, "outputPath")?,
                    arg(&args, "pngBase64")?,
                ))
            },
        ),
        crate::host_command_wire!(export_file) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::FileExport],
            move || {
                ok(domain::assets::export_file(
                    arg(&args, "outputPath")?,
                    arg(&args, "contentBase64")?,
                ))
            },
        ),
        crate::host_command_wire!(load_text_asset) => io_lane(id, &command_name, move || {
            ok(domain::assets::load_text_asset(
                arg(&args, "rootPath")?,
                arg(&args, "assetPath")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        crate::host_command_wire!(load_text_file) => io_lane(id, &command_name, move || {
            ok(domain::assets::load_text_file(arg(&args, "path")?))
        }),
        crate::host_command_wire!(load_image_data_url) => io_lane(id, &command_name, move || {
            ok(domain::assets::load_image_data_url(
                arg(&args, "path")?,
                optional_arg(&args, "locale")?,
            ))
        }),
        crate::host_command_wire!(scan_audio_assets) => io_lane(id, &command_name, move || {
            ok(domain::assets::scan_audio_assets(arg(&args, "path")?))
        }),
        crate::host_command_wire!(load_audio_data_url) => io_lane(id, &command_name, move || {
            ok(domain::assets::load_audio_data_url(arg(&args, "path")?))
        }),
        crate::host_command_wire!(load_xact_audio_data_url) => {
            io_lane(id, &command_name, move || {
                let root_path: String = arg(&args, "rootPath")?;
                let cue: String = arg(&args, "cue")?;
                ok(
                    crate::infrastructure::game_formats::xact::load_xact_audio_data_url_for_paths(
                        &root_path, &cue,
                    ),
                )
            })
        }
        crate::host_command_wire!(load_resource_registry) => {
            io_lane(id, &command_name, move || {
                ok(domain::resource_registry::load_resource_registry(
                    arg(&args, "rootPath")?,
                    optional_arg(&args, "locale")?,
                ))
            })
        }
        crate::host_command_wire!(scan_default_save_slots) => io_lane(id, &command_name, || {
            ok(domain::saves::scan_default_save_slots())
        }),

        crate::host_command_wire!(scan_mod_projects) => io_lane(id, &command_name, move || {
            ok(domain::mods::scan_mod_projects(arg(&args, "rootPath")?))
        }),
        crate::host_command_wire!(scan_mod_asset_index) => io_lane(id, &command_name, move || {
            ok(domain::mods::scan_mod_asset_index(arg(&args, "rootPath")?))
        }),
        crate::host_command_wire!(load_mod_project) => io_lane(id, &command_name, move || {
            ok(domain::mods::load_mod_project(arg(&args, "path")?))
        }),
        crate::host_command_wire!(save_mod_project) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::ModProject],
            move || {
                ok(domain::mods::save_mod_project(arg_or_whole(
                    &args, "request",
                )?))
            },
        ),

        crate::host_command_wire!(load_content_patcher_project) => {
            io_lane(id, &command_name, move || {
                ok(
                    domain::content_patcher::project::load_content_patcher_project(arg(
                        &args, "path",
                    )?),
                )
            })
        }
        crate::host_command_wire!(simulate_content_patcher) => {
            io_lane(id, &command_name, move || {
                ok(domain::content_patcher::simulate_content_patcher(arg(
                    &args, "request",
                )?))
            })
        }
        crate::host_command_wire!(load_content_patcher_result_asset) => {
            io_lane(id, &command_name, move || {
                ok(domain::content_patcher::load_content_patcher_result_asset(
                    arg(&args, "request")?,
                ))
            })
        }
        crate::host_command_wire!(export_content_patcher_asset) => {
            mutation(id, &command_name, move || {
                ok(domain::content_patcher::export_content_patcher_asset(arg(
                    &args, "request",
                )?))
            })
        }

        crate::host_command_wire!(list_cp_maker_drafts) => io_lane(id, &command_name, || {
            ok(domain::cp_maker::list_cp_maker_drafts())
        }),
        crate::host_command_wire!(load_cp_maker_draft) => io_lane(id, &command_name, move || {
            ok(domain::cp_maker::load_cp_maker_draft(arg(
                &args,
                "draftStorageKey",
            )?))
        }),
        crate::host_command_wire!(save_cp_maker_draft) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::CpMakerDrafts],
            move || ok(domain::cp_maker::save_cp_maker_draft(arg(&args, "draft")?)),
        ),
        crate::host_command_wire!(delete_cp_maker_draft) => {
            mutation(id, &command_name, move || {
                ok(domain::cp_maker::delete_cp_maker_draft(arg(
                    &args,
                    "draftStorageKey",
                )?))
            })
        }
        crate::host_command_wire!(copy_cp_maker_draft) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::CpMakerDrafts],
            move || {
                ok(domain::cp_maker::copy_cp_maker_draft(arg(
                    &args, "request",
                )?))
            },
        ),
        crate::host_command_wire!(export_cp_maker_pack) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::ModProject],
            move || {
                ok(domain::cp_maker::export_cp_maker_pack(arg(
                    &args, "request",
                )?))
            },
        ),
        crate::host_command_wire!(build_cp_maker_map_asset) => {
            mutation(id, &command_name, move || {
                ok(domain::cp_maker::build_cp_maker_map_asset(arg(
                    &args, "request",
                )?))
            })
        }
        crate::host_command_wire!(import_cp_maker_pack) => mutation(id, &command_name, move || {
            // Import reads a caller-selected content pack and returns an in-memory draft record;
            // it does not write draft storage or the source mod directory.
            let mod_directory_path: String = arg(&args, "modDirectoryPath")?;
            ok(domain::cp_maker::import_cp_maker_pack(&mod_directory_path))
        }),

        crate::host_command_wire!(load_launcher_settings) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherSettings],
                move || ok(domain::launcher::settings::load_launcher_settings(app)),
            )
        }
        crate::host_command_wire!(save_launcher_settings) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherSettings],
                move || {
                    ok(domain::launcher::settings::save_launcher_settings(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(launch_launcher_game) => {
            let app = ctx.app.clone();
            control_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherSettings],
                move || ok(domain::launcher::runtime::launch_launcher_game(app)),
            )
        }
        crate::host_command_wire!(get_launcher_backup_directory) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::runtime::get_launcher_backup_directory(
                        app,
                    ))
                },
            )
        }
        crate::host_command_wire!(open_launcher_path) => control(id, &command_name, move || {
            ok(domain::launcher::runtime::open_launcher_path(arg(
                &args, "request",
            )?))
        }),
        crate::host_command_wire!(open_launcher_url) => control(id, &command_name, move || {
            ok(domain::launcher::runtime::open_launcher_url(arg(
                &args, "request",
            )?))
        }),
        crate::host_command_wire!(load_launcher_library_state) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherLibraryState],
                move || ok(domain::launcher::library::load_launcher_library_state(app)),
            )
        }
        crate::host_command_wire!(save_launcher_library_state) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherLibraryState],
                move || {
                    ok(domain::launcher::library::save_launcher_library_state(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(load_launcher_library_covers) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherLibraryCovers],
                move || ok(domain::launcher::library::load_launcher_library_covers(app)),
            )
        }
        crate::host_command_wire!(load_launcher_image_failures) => {
            let app = ctx.app.clone();
            io_lane(id, &command_name, move || {
                ok(domain::launcher::image_failures::load_launcher_image_failures(app))
            })
        }
        crate::host_command_wire!(record_launcher_image_failure) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherImageCache],
                move || {
                    ok(
                        domain::launcher::image_failures::record_launcher_image_failure_command(
                            app,
                            arg(&args, "request")?,
                        ),
                    )
                },
            )
        }
        crate::host_command_wire!(set_launcher_library_cover) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherLibraryCovers],
                move || {
                    ok(domain::launcher::library::set_launcher_library_cover(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(persist_launcher_library_remote_cover) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(
                    domain::launcher::library::persist_launcher_library_remote_cover_blocking(
                        &app, &request,
                    ),
                )
            })
        }
        crate::host_command_wire!(scan_launcher_library) => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherLibraryCovers],
                move || {
                    ok(domain::launcher::library::scan_launcher_library(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(load_launcher_runtime_info) => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherSettings],
                move || ok(domain::launcher::runtime::load_launcher_runtime_info(app)),
            )
        }
        crate::host_command_wire!(set_launcher_mod_enabled) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::library::set_launcher_mod_enabled(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(load_launcher_mod_config) => {
            io_lane(id, &command_name, move || {
                ok(domain::launcher::mod_config::load_launcher_mod_config(arg(
                    &args, "request",
                )?))
            })
        }
        crate::host_command_wire!(load_launcher_gmcm_probe_diagnostics) => {
            io_lane(id, &command_name, || {
                ok(Ok::<_, String>(
                    domain::launcher::mod_config::load_launcher_gmcm_probe_diagnostics(),
                ))
            })
        }
        crate::host_command_wire!(save_launcher_mod_config) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::LauncherModConfig],
            move || {
                ok(domain::launcher::mod_config::save_launcher_mod_config(arg(
                    &args, "request",
                )?))
            },
        ),
        crate::host_command_wire!(load_launcher_download_queue) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherDownloadQueue],
                move || {
                    ok(domain::launcher::downloads::load_launcher_download_queue(
                        app,
                    ))
                },
            )
        }
        crate::host_command_wire!(save_launcher_download_queue) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherDownloadQueue],
                move || {
                    ok(domain::launcher::downloads::save_launcher_download_queue(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(download_launcher_mod) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(domain::launcher::downloads::download_launcher_mod(
                    app,
                    arg(&args, "request")?,
                ))
            })
        }
        crate::host_command_wire!(cancel_launcher_download) => {
            control(id, &command_name, move || {
                ok(domain::launcher::downloads::cancel_launcher_download(arg(
                    &args,
                    "downloadId",
                )?))
            })
        }
        crate::host_command_wire!(search_launcher_catalog) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(domain::nexusmods::catalog::search_launcher_catalog_blocking(&app, &request))
            })
        }
        crate::host_command_wire!(load_launcher_remote_mod_detail) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(
                    domain::nexusmods::mod_detail::load_launcher_remote_mod_detail_blocking(
                        &app, &request,
                    ),
                )
            })
        }
        crate::host_command_wire!(load_launcher_update_changelog) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(
                    domain::nexusmods::mod_detail::load_launcher_update_changelog_blocking(
                        &app, &request,
                    ),
                )
            })
        }
        crate::host_command_wire!(resolve_launcher_image) => {
            let app = ctx.app.clone();
            network_on_pool(
                id,
                &command_name,
                HostCommandExecutionPool::LauncherImageCdn,
                move || {
                    let request = arg(&args, "request")?;
                    ok(
                        modforge_studio_desktop_lib::logging::log_tauri_command_error(
                            "resolve_launcher_image",
                            domain::launcher::image_cache::resolve_launcher_image_blocking(
                                &app, &request,
                            ),
                        ),
                    )
                },
            )
        }
        crate::host_command_wire!(resolve_cached_launcher_image) => {
            let app = ctx.app.clone();
            io_lane(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(
                    domain::launcher::image_cache::resolve_cached_launcher_image_blocking(
                        &app, &request,
                    ),
                )
            })
        }
        crate::host_command_wire!(clear_launcher_image_cache) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherImageCache],
                move || {
                    ok(domain::launcher::image_cache::clear_launcher_image_cache(
                        app,
                    ))
                },
            )
        }
        crate::host_command_wire!(load_launcher_nexus_diagnostics) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(domain::nexusmods::diagnostics::load_launcher_nexus_diagnostics(&app))
            })
        }
        crate::host_command_wire!(restart_launcher_nexus_diagnostics) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(
                    domain::nexusmods::diagnostics::restart_launcher_nexus_diagnostics_with_app(
                        &app,
                    ),
                )
            })
        }
        crate::host_command_wire!(retry_launcher_nexus_diagnostics_route) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(
                    domain::nexusmods::diagnostics::retry_launcher_nexus_diagnostics_route(
                        &app,
                        arg(&args, "routeId")?,
                    ),
                )
            })
        }
        crate::host_command_wire!(set_launcher_nexus_force_offline) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::AppUiState],
                move || {
                    ok(
                        domain::nexusmods::diagnostics::set_launcher_nexus_force_offline(
                            &app,
                            arg(&args, "forceOffline")?,
                        ),
                    )
                },
            )
        }
        crate::host_command_wire!(load_cached_launcher_updates) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherUpdatesCache],
                move || {
                    ok(domain::launcher::updates::load_cached_launcher_updates(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(load_suppressed_launcher_update_mod_ids) => {
            let app = ctx.app.clone();
            io_with_resources(
                id,
                &command_name,
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
        crate::host_command_wire!(check_launcher_updates) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                let request = arg(&args, "request")?;
                ok(domain::launcher::updates::check_launcher_updates_blocking(
                    &app, &request,
                ))
            })
        }
        crate::host_command_wire!(inspect_launcher_archive) => {
            io_lane(id, &command_name, move || {
                ok(domain::launcher::archive::inspect_launcher_archive(arg(
                    &args, "request",
                )?))
            })
        }
        crate::host_command_wire!(install_launcher_archive) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
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
        crate::host_command_wire!(list_launcher_install_backups) => {
            let app = ctx.app.clone();
            io_lane(id, &command_name, move || {
                ok(domain::launcher::archive::list_launcher_install_backups(
                    app,
                    arg(&args, "request")?,
                ))
            })
        }
        crate::host_command_wire!(restore_launcher_install_backup) => {
            let app = ctx.app.clone();
            mutation_with_resources(
                id,
                &command_name,
                &[SidecarResource::LauncherInstallTree],
                move || {
                    ok(domain::launcher::archive::restore_launcher_install_backup(
                        app,
                        arg(&args, "request")?,
                    ))
                },
            )
        }
        crate::host_command_wire!(validate_nexus_api_key) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(domain::nexusmods::validate_nexus_api_key(app))
            })
        }
        crate::host_command_wire!(start_nexus_sso) => {
            let app = ctx.app.clone();
            network(id, &command_name, move || {
                ok(domain::nexusmods::sso::start_sso_with_status(&app))
            })
        }
        crate::host_command_wire!(get_nexus_sso_status) => control(id, &command_name, || {
            ok(Ok::<_, String>(domain::nexusmods::sso::get_sso_status()))
        }),
        crate::host_command_wire!(cancel_nexus_sso) => control(id, &command_name, || {
            domain::nexusmods::sso::cancel_sso();
            Ok(Value::Null)
        }),

        crate::host_command_wire!(load_app_ui_state) => {
            mutation_with_resources(id, &command_name, &[SidecarResource::AppUiState], || {
                ok(domain::app_ui::load_app_ui_state())
            })
        }
        crate::host_command_wire!(patch_app_ui_state) => mutation_with_resources(
            id,
            &command_name,
            &[SidecarResource::AppUiState],
            move || ok(domain::app_ui::patch_app_ui_state(arg(&args, "request")?)),
        ),
        crate::host_command_wire!(write_frontend_log) => control(id, &command_name, move || {
            logging::write_frontend_log(arg(&args, "request")?);
            Ok(Value::Null)
        }),
        crate::host_command_wire!(set_debug_logging_enabled) => {
            let debug_logging_state = ctx.debug_logging_state.clone();
            control(id, &command_name, move || {
                logging::set_debug_logging_enabled(&debug_logging_state, arg(&args, "enabled")?);
                Ok(Value::Null)
            })
        }
        crate::host_command_wire!(print_host_runtime_diagnostics) => {
            control_with_context(id, &command_name, move |command_context| {
                command_context.print_diagnostics_summary("manual snapshot");
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
        debug_logging_state: debug_logging_state.clone(),
    };
    let scheduler = SidecarScheduler::new(
        Arc::new(StdoutResponseWriter {
            stdout: Arc::clone(&stdout),
        }),
        Arc::new(SidecarResourceLocks::new()),
        SidecarSchedulerConfig::default(),
        debug_logging_state,
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

    scheduler.print_diagnostics_summary("sidecar shutdown");
    Ok(())
}

#[cfg(test)]
#[cfg(test)]
#[path = "tests/unit/sidecar/tests.rs"]
mod tests;
