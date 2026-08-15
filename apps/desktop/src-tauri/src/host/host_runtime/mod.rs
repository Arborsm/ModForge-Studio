use crate::AppHandle;
use crate::support::logging::{DebugLoggingState, LogEvent, targets};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::time::Instant;
use tauri::Manager;
use tauri::async_runtime::{
    Receiver as AsyncReceiver, Sender as AsyncSender, channel as async_channel,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};

mod response;
mod telemetry;

pub use response::{
    HostCommandResponse, HostCommandResponseWriter, HostCommandResult, panic_safe_dispatch_response,
};
pub(crate) use response::{panic_safe_dispatch_outcome, response_to_result};
pub use telemetry::HostRuntimeTelemetrySnapshot;
pub(crate) use telemetry::{HostRuntimePoolTelemetry, HostRuntimeTelemetry};

pub type HostCommandRunner =
    Box<dyn FnOnce(HostCommandContext) -> HostCommandResult + Send + 'static>;
pub type HostCommandResourceResolver =
    Box<dyn FnOnce() -> Result<Vec<HostCommandResource>, Value> + Send + 'static>;

#[derive(Clone)]
pub struct HostCommandContext {
    telemetry: HostRuntimeTelemetry,
}

impl HostCommandContext {
    pub fn print_diagnostics_summary(&self, reason: &str) {
        self.telemetry.print_summary_now(reason);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostCommandLane {
    Control,
    Network,
    Io,
    Mutation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostCommandExecutionPool {
    Lane,
    LauncherImageCdn,
    Ai,
    AiOfficialIndexing,
    AiSemanticIndexing,
    AiSemanticSearch,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum HostCommandResource {
    AppUiState,
    AiSettings,
    LocalizationSettings,
    MachineTranslationSettings,
    AiTranslationCache,
    AiUsageLedger,
    AiOfficialLocalizationIndex,
    AiLocalizationKnowledge,
    AiSemanticSettings,
    AiSemanticModel,
    AiSemanticIndex,
    LauncherSettings,
    LauncherLibraryState,
    LauncherLibraryCovers,
    LauncherDownloadQueue,
    LauncherImageCache,
    LauncherUpdatesCache,
    LauncherInstallTree,
    LauncherModConfig,
    GameAssetCache,
    ModProject,
    ModProjectRoot(Arc<str>),
    CpMakerDrafts,
    MapPngExport,
    FileExport,
    DebugBridgeInstall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostCommandMutationPolicy {
    Concurrent,
    ExclusiveResources,
    SerialLane,
}

#[derive(Debug, Clone, Copy)]
pub struct HostCommandSchedulerConfig {
    pub control_max_concurrency: usize,
    pub network_max_concurrency: usize,
    pub io_max_concurrency: usize,
    pub mutation_max_concurrency: usize,
    pub launcher_image_cdn_max_concurrency: usize,
    pub ai_max_concurrency: usize,
    pub ai_queue_capacity: usize,
    pub ai_official_indexing_queue_capacity: usize,
    pub pool_queue_capacity: usize,
}

impl Default for HostCommandSchedulerConfig {
    fn default() -> Self {
        Self {
            control_max_concurrency: 16,
            network_max_concurrency: 32,
            io_max_concurrency: 16,
            // Mutation commands stay serial by default. Raising this requires re-auditing every
            // mutation binding's resource declarations.
            mutation_max_concurrency: 1,
            launcher_image_cdn_max_concurrency:
                crate::domain::nexusmods::endpoints::IMAGE_CDN_DEFAULT_CONCURRENCY,
            ai_max_concurrency: 2,
            ai_queue_capacity: 64,
            ai_official_indexing_queue_capacity: 8,
            pool_queue_capacity: 256,
        }
    }
}

impl HostCommandSchedulerConfig {
    pub fn normalized(self) -> Self {
        Self {
            control_max_concurrency: self.control_max_concurrency.max(1),
            network_max_concurrency: self.network_max_concurrency.max(1),
            io_max_concurrency: self.io_max_concurrency.max(1),
            mutation_max_concurrency: self.mutation_max_concurrency.max(1),
            launcher_image_cdn_max_concurrency: self.launcher_image_cdn_max_concurrency.max(1),
            ai_max_concurrency: self.ai_max_concurrency.max(1),
            ai_queue_capacity: self.ai_queue_capacity.max(1),
            ai_official_indexing_queue_capacity: self.ai_official_indexing_queue_capacity.max(1),
            pool_queue_capacity: self.pool_queue_capacity.max(1),
        }
    }
}

pub struct ResolvedHostCommand {
    pub id: Value,
    pub name: String,
    pub lane: HostCommandLane,
    pub execution_pool: HostCommandExecutionPool,
    pub resources: Vec<HostCommandResource>,
    pub resource_resolver: Option<HostCommandResourceResolver>,
    pub mutation_policy: HostCommandMutationPolicy,
    pub submitted_at: Instant,
    pub(crate) record_telemetry: bool,
    pub run: HostCommandRunner,
}

// --- typed command binding -------------------------------------------------
//
// The single place where a command's lane, execution pool, resource locks,
// cancel/mutation policy, wire parameters and execution closure are declared.
// Both host entries resolve through HostCommand::resolve: the Tauri wrapper
// calls it in-process via host_runtime::execute, the Electron sidecar
// via sidecar::resolve_typed. The sidecar match arm is a policy-free type
// pointer verified by the host command generator, so policy is declared
// exactly once per command, here.

pub(crate) const NO_RESOURCES: &[HostCommandResource] = &[];

/// In-process context handed to every binding resolution. Both the Tauri
/// runtime and the sidecar build one before calling HostCommand::resolve.
#[derive(Clone)]
pub(crate) struct DispatchContext {
    pub(crate) app: AppHandle,
    pub(crate) debug_logging_state: DebugLoggingState,
}

impl DispatchContext {
    pub(crate) fn new(app: AppHandle, debug_logging_state: DebugLoggingState) -> Self {
        Self {
            app,
            debug_logging_state,
        }
    }
}

/// The product of resolving a command: either a scheduler-ready command or an
/// immediate wire response (e.g. an argument deserialization failure).
pub(crate) enum ResolvedCommandOrResponse {
    Command(ResolvedHostCommand),
    Response(HostCommandResponse),
}

/// The single binding of one host command.
///
/// NAME is the protocol name and must equal the Tauri wrapper function
/// name (enforced by the host command generator). resolve builds the
/// ResolvedHostCommand (lane, pool, resources, cancel/mutation policy,
/// execution closure) that the shared scheduler runs.
pub(crate) trait HostCommand: DeserializeOwned + Send + 'static {
    const NAME: &'static str;

    fn resolve(ctx: &DispatchContext, id: Value, params: Self) -> ResolvedCommandOrResponse;

    fn io(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Io,
            NO_RESOURCES,
            move |_| run(),
        ))
    }

    fn network(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Network,
            NO_RESOURCES,
            move |_| run(),
        ))
    }

    fn control(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Control,
            NO_RESOURCES,
            move |_| run(),
        ))
    }

    fn control_with_context(
        id: Value,
        run: impl FnOnce(HostCommandContext) -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Control,
            NO_RESOURCES,
            run,
        ))
    }

    /// Plain mutation builder. The `#[host_command]` macro rejects mutation
    /// commands without `resources(...)`, so no live binding calls this; it is
    /// kept so the macro's error-resilient fallback expansion stays
    /// structurally valid while the spanned diagnostic is reported.
    #[allow(dead_code)]
    fn mutation(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Mutation,
            NO_RESOURCES,
            move |_| run(),
        ))
    }

    fn mutation_with_resources(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Mutation,
            resources,
            move |_| run(),
        ))
    }

    fn mutation_with_resource_resolver<R>(
        id: Value,
        resolve_resources: R,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse
    where
        R: FnOnce() -> Result<Vec<HostCommandResource>, Value> + Send + 'static,
    {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Mutation,
            NO_RESOURCES,
            move |_| run(),
        );
        resolved.resource_resolver =
            Some(Box::new(resolve_resources) as HostCommandResourceResolver);
        resolved.mutation_policy = HostCommandMutationPolicy::ExclusiveResources;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn io_with_resources(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Io,
            resources,
            move |_| run(),
        ))
    }

    fn io_on_semantic_search_pool(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(id, Self::NAME, HostCommandLane::Io, resources, move |_| {
            run()
        });
        resolved.execution_pool = HostCommandExecutionPool::AiSemanticSearch;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn network_on_semantic_search_pool(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Network,
            resources,
            move |_| run(),
        );
        resolved.execution_pool = HostCommandExecutionPool::AiSemanticSearch;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn mutation_on_semantic_indexing_pool(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Mutation,
            resources,
            move |_| run(),
        );
        resolved.execution_pool = HostCommandExecutionPool::AiSemanticIndexing;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn mutation_on_official_indexing_pool(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Mutation,
            resources,
            move |_| run(),
        );
        resolved.execution_pool = HostCommandExecutionPool::AiOfficialIndexing;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn network_on_image_cdn_pool(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Network,
            NO_RESOURCES,
            move |_| run(),
        );
        resolved.execution_pool = HostCommandExecutionPool::LauncherImageCdn;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn network_with_resources(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Network,
            resources,
            move |_| run(),
        ))
    }

    fn ai_network(
        id: Value,
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        let mut resolved = command(
            id,
            Self::NAME,
            HostCommandLane::Network,
            NO_RESOURCES,
            move |_| run(),
        );
        resolved.execution_pool = HostCommandExecutionPool::Ai;
        ResolvedCommandOrResponse::Command(resolved)
    }

    fn control_with_resources(
        id: Value,
        resources: &'static [HostCommandResource],
        run: impl FnOnce() -> HostCommandResult + Send + 'static,
    ) -> ResolvedCommandOrResponse {
        resolved(command(
            id,
            Self::NAME,
            HostCommandLane::Control,
            resources,
            move |_| run(),
        ))
    }
}

fn command<F>(
    id: Value,
    name: &str,
    lane: HostCommandLane,
    resources: &'static [HostCommandResource],
    run: F,
) -> ResolvedHostCommand
where
    F: FnOnce(HostCommandContext) -> HostCommandResult + Send + 'static,
{
    ResolvedHostCommand {
        id,
        name: name.to_string(),
        lane,
        execution_pool: HostCommandExecutionPool::Lane,
        resources: resources.to_vec(),
        resource_resolver: None,
        mutation_policy: if resources.is_empty() {
            HostCommandMutationPolicy::Concurrent
        } else {
            HostCommandMutationPolicy::ExclusiveResources
        },
        submitted_at: Instant::now(),
        record_telemetry: false,
        run: Box::new(run),
    }
}

fn resolved(command: ResolvedHostCommand) -> ResolvedCommandOrResponse {
    ResolvedCommandOrResponse::Command(command)
}

pub(crate) fn ok<T, E>(result: Result<T, E>) -> HostCommandResult
where
    T: Serialize,
    E: ToString,
{
    result
        .map(|value| serde_json::to_value(value).unwrap_or(Value::Null))
        .map_err(|error| json!(error.to_string()))
}

pub struct HostCommandResourceLocks {
    app_ui_state: Mutex<()>,
    ai_settings: Mutex<()>,
    localization_settings: Mutex<()>,
    machine_translation_settings: Mutex<()>,
    ai_translation_cache: Mutex<()>,
    ai_usage_ledger: Mutex<()>,
    ai_official_localization_index: Mutex<()>,
    ai_localization_knowledge: Mutex<()>,
    ai_semantic_settings: Mutex<()>,
    ai_semantic_model: Mutex<()>,
    ai_semantic_index: Mutex<()>,
    launcher_settings: Mutex<()>,
    launcher_library_state: Mutex<()>,
    launcher_library_covers: Mutex<()>,
    launcher_download_queue: Mutex<()>,
    launcher_image_cache: Mutex<()>,
    launcher_updates_cache: Mutex<()>,
    launcher_install_tree: Mutex<()>,
    launcher_mod_config: Mutex<()>,
    game_asset_cache: Mutex<()>,
    mod_project: Mutex<()>,
    cp_maker_drafts: Mutex<()>,
    map_png_export: Mutex<()>,
    file_export: Mutex<()>,
    debug_bridge_install: Mutex<()>,
    dynamic: Mutex<BTreeMap<HostCommandResource, &'static Mutex<()>>>,
}

impl HostCommandResourceLocks {
    pub fn new() -> Self {
        Self {
            app_ui_state: Mutex::new(()),
            ai_settings: Mutex::new(()),
            localization_settings: Mutex::new(()),
            machine_translation_settings: Mutex::new(()),
            ai_translation_cache: Mutex::new(()),
            ai_usage_ledger: Mutex::new(()),
            ai_official_localization_index: Mutex::new(()),
            ai_localization_knowledge: Mutex::new(()),
            ai_semantic_settings: Mutex::new(()),
            ai_semantic_model: Mutex::new(()),
            ai_semantic_index: Mutex::new(()),
            launcher_settings: Mutex::new(()),
            launcher_library_state: Mutex::new(()),
            launcher_library_covers: Mutex::new(()),
            launcher_download_queue: Mutex::new(()),
            launcher_image_cache: Mutex::new(()),
            launcher_updates_cache: Mutex::new(()),
            launcher_install_tree: Mutex::new(()),
            launcher_mod_config: Mutex::new(()),
            game_asset_cache: Mutex::new(()),
            mod_project: Mutex::new(()),
            cp_maker_drafts: Mutex::new(()),
            map_png_export: Mutex::new(()),
            file_export: Mutex::new(()),
            debug_bridge_install: Mutex::new(()),
            dynamic: Mutex::new(BTreeMap::new()),
        }
    }

    fn lock_many(&self, resources: &[HostCommandResource]) -> Vec<MutexGuard<'_, ()>> {
        let mut resources = resources.to_vec();
        resources.sort();
        resources.dedup();

        let mut guards = Vec::with_capacity(resources.len());
        for resource in &resources {
            guards.push(self.lock_one(resource));
        }
        guards
    }

    fn lock_one(&self, resource: &HostCommandResource) -> MutexGuard<'_, ()> {
        let lock = match resource {
            HostCommandResource::AppUiState => &self.app_ui_state,
            HostCommandResource::AiSettings => &self.ai_settings,
            HostCommandResource::LocalizationSettings => &self.localization_settings,
            HostCommandResource::MachineTranslationSettings => &self.machine_translation_settings,
            HostCommandResource::AiTranslationCache => &self.ai_translation_cache,
            HostCommandResource::AiUsageLedger => &self.ai_usage_ledger,
            HostCommandResource::AiOfficialLocalizationIndex => {
                &self.ai_official_localization_index
            }
            HostCommandResource::AiLocalizationKnowledge => &self.ai_localization_knowledge,
            HostCommandResource::AiSemanticSettings => &self.ai_semantic_settings,
            HostCommandResource::AiSemanticModel => &self.ai_semantic_model,
            HostCommandResource::AiSemanticIndex => &self.ai_semantic_index,
            HostCommandResource::LauncherSettings => &self.launcher_settings,
            HostCommandResource::LauncherLibraryState => &self.launcher_library_state,
            HostCommandResource::LauncherLibraryCovers => &self.launcher_library_covers,
            HostCommandResource::LauncherDownloadQueue => &self.launcher_download_queue,
            HostCommandResource::LauncherImageCache => &self.launcher_image_cache,
            HostCommandResource::LauncherUpdatesCache => &self.launcher_updates_cache,
            HostCommandResource::LauncherInstallTree => &self.launcher_install_tree,
            HostCommandResource::LauncherModConfig => &self.launcher_mod_config,
            HostCommandResource::GameAssetCache => &self.game_asset_cache,
            HostCommandResource::ModProject => &self.mod_project,
            HostCommandResource::ModProjectRoot(_) => {
                let mut dynamic = match self.dynamic.lock() {
                    Ok(dynamic) => dynamic,
                    Err(poisoned) => {
                        LogEvent::new("hostRuntime.lock.poisoned")
                            .field("resource", "dynamic-resource-registry")
                            .emit_error(targets::HOST_RUNTIME);
                        poisoned.into_inner()
                    }
                };
                *dynamic
                    .entry(resource.clone())
                    .or_insert_with(|| Box::leak(Box::new(Mutex::new(()))))
            }
            HostCommandResource::CpMakerDrafts => &self.cp_maker_drafts,
            HostCommandResource::MapPngExport => &self.map_png_export,
            HostCommandResource::FileExport => &self.file_export,
            HostCommandResource::DebugBridgeInstall => &self.debug_bridge_install,
        };
        match lock.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                LogEvent::new("hostRuntime.lock.poisoned")
                    .debug("resource", resource)
                    .emit_error(targets::HOST_RUNTIME);
                poisoned.into_inner()
            }
        }
    }
}

impl Default for HostCommandResourceLocks {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone)]
struct HostCommandLaneSender {
    lane: HostCommandLane,
    execution_pool: HostCommandExecutionPool,
    sender: mpsc::Sender<ResolvedHostCommand>,
    telemetry: HostRuntimePoolTelemetry,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct HostRuntimePoolDescriptor {
    lane: HostCommandLane,
    execution_pool: HostCommandExecutionPool,
    max_concurrency: usize,
    queue_capacity: usize,
}

pub struct HostCommandScheduler {
    control: HostCommandLaneSender,
    network: HostCommandLaneSender,
    io: HostCommandLaneSender,
    mutation: HostCommandLaneSender,
    launcher_image_cdn: HostCommandLaneSender,
    ai: HostCommandLaneSender,
    ai_official_indexing: HostCommandLaneSender,
    ai_semantic_indexing: HostCommandLaneSender,
    ai_semantic_search: HostCommandLaneSender,
    writer: Arc<dyn HostCommandResponseWriter>,
    telemetry: HostRuntimeTelemetry,
}

impl HostCommandScheduler {
    pub fn new(
        writer: Arc<dyn HostCommandResponseWriter>,
        resources: Arc<HostCommandResourceLocks>,
        config: HostCommandSchedulerConfig,
        debug_logging_state: DebugLoggingState,
    ) -> Self {
        let config = config.normalized();
        let pool_descriptors = [
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Control,
                execution_pool: HostCommandExecutionPool::Lane,
                max_concurrency: config.control_max_concurrency,
                queue_capacity: config.pool_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Network,
                execution_pool: HostCommandExecutionPool::Lane,
                max_concurrency: config.network_max_concurrency,
                queue_capacity: config.pool_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Io,
                execution_pool: HostCommandExecutionPool::Lane,
                max_concurrency: config.io_max_concurrency,
                queue_capacity: config.pool_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Mutation,
                execution_pool: HostCommandExecutionPool::Lane,
                max_concurrency: config.mutation_max_concurrency,
                queue_capacity: config.pool_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Network,
                execution_pool: HostCommandExecutionPool::LauncherImageCdn,
                max_concurrency: config.launcher_image_cdn_max_concurrency,
                queue_capacity: config.pool_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Network,
                execution_pool: HostCommandExecutionPool::Ai,
                max_concurrency: config.ai_max_concurrency,
                queue_capacity: config.ai_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Mutation,
                execution_pool: HostCommandExecutionPool::AiOfficialIndexing,
                max_concurrency: 1,
                queue_capacity: config.ai_official_indexing_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Mutation,
                execution_pool: HostCommandExecutionPool::AiSemanticIndexing,
                max_concurrency: 1,
                queue_capacity: config.ai_official_indexing_queue_capacity,
            },
            HostRuntimePoolDescriptor {
                lane: HostCommandLane::Network,
                execution_pool: HostCommandExecutionPool::AiSemanticSearch,
                max_concurrency: 1,
                queue_capacity: config.ai_queue_capacity,
            },
        ];
        let telemetry = HostRuntimeTelemetry::new(debug_logging_state, &pool_descriptors);
        Self {
            control: spawn_pool(
                pool_descriptors[0],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[0].lane, pool_descriptors[0].execution_pool),
                telemetry.clone(),
            ),
            network: spawn_pool(
                pool_descriptors[1],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[1].lane, pool_descriptors[1].execution_pool),
                telemetry.clone(),
            ),
            io: spawn_pool(
                pool_descriptors[2],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[2].lane, pool_descriptors[2].execution_pool),
                telemetry.clone(),
            ),
            mutation: spawn_pool(
                pool_descriptors[3],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[3].lane, pool_descriptors[3].execution_pool),
                telemetry.clone(),
            ),
            launcher_image_cdn: spawn_pool(
                pool_descriptors[4],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[4].lane, pool_descriptors[4].execution_pool),
                telemetry.clone(),
            ),
            ai: spawn_pool(
                pool_descriptors[5],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[5].lane, pool_descriptors[5].execution_pool),
                telemetry.clone(),
            ),
            ai_official_indexing: spawn_pool(
                pool_descriptors[6],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[6].lane, pool_descriptors[6].execution_pool),
                telemetry.clone(),
            ),
            ai_semantic_indexing: spawn_pool(
                pool_descriptors[7],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[7].lane, pool_descriptors[7].execution_pool),
                telemetry.clone(),
            ),
            ai_semantic_search: spawn_pool(
                pool_descriptors[8],
                Arc::clone(&writer),
                Arc::clone(&resources),
                telemetry.pool(pool_descriptors[8].lane, pool_descriptors[8].execution_pool),
                telemetry.clone(),
            ),
            writer,
            telemetry,
        }
    }

    pub fn submit(&self, mut command: ResolvedHostCommand) {
        let sender = match command.execution_pool {
            HostCommandExecutionPool::LauncherImageCdn => &self.launcher_image_cdn,
            HostCommandExecutionPool::Ai => &self.ai,
            HostCommandExecutionPool::AiOfficialIndexing => &self.ai_official_indexing,
            HostCommandExecutionPool::AiSemanticIndexing => &self.ai_semantic_indexing,
            HostCommandExecutionPool::AiSemanticSearch => &self.ai_semantic_search,
            HostCommandExecutionPool::Lane => match command.lane {
                HostCommandLane::Control => &self.control,
                HostCommandLane::Network => &self.network,
                HostCommandLane::Io => &self.io,
                HostCommandLane::Mutation => &self.mutation,
            },
        };
        command.record_telemetry = self.telemetry.should_record();
        let record_telemetry = command.record_telemetry;
        match sender.sender.try_reserve() {
            Ok(permit) => {
                sender.telemetry.record_submitted(record_telemetry);
                permit.send(command);
            }
            Err(error) => {
                let reason = match error {
                    mpsc::error::TrySendError::Full(()) => "pool queue is full",
                    mpsc::error::TrySendError::Closed(()) => "pool dispatcher is not available",
                };
                sender
                    .telemetry
                    .record_rejected(record_telemetry, &command.name);
                let response = HostCommandResponse {
                    id: command.id.clone(),
                    ok: false,
                    result: None,
                    error: Some(json!(format!(
                        "Host command {} could not be scheduled: {reason}.",
                        command.name
                    ))),
                };
                LogEvent::new("hostRuntime.command.enqueueFailed")
                    .field("id", &response.id)
                    .field("command", &command.name)
                    .debug("lane", sender.lane)
                    .debug("pool", sender.execution_pool)
                    .field("reason", reason)
                    .emit_error(targets::HOST_RUNTIME);
                if let Err(error) = self.writer.write_response(&response) {
                    sender
                        .telemetry
                        .record_writer_failed(record_telemetry, &command.name);
                    LogEvent::new("hostRuntime.response.writeFailed")
                        .field("phase", "enqueue-error")
                        .field("id", &response.id)
                        .field("command", &command.name)
                        .debug("lane", sender.lane)
                        .debug("pool", sender.execution_pool)
                        .error(error)
                        .emit_error(targets::HOST_RUNTIME);
                }
            }
        }
    }

    pub fn diagnostics_summary(&self, reason: &str) -> Option<HostRuntimeTelemetrySnapshot> {
        self.telemetry.summary(reason)
    }

    pub fn print_diagnostics_summary(&self, reason: &str) {
        self.telemetry.print_summary(reason);
    }
}

fn spawn_pool(
    descriptor: HostRuntimePoolDescriptor,
    writer: Arc<dyn HostCommandResponseWriter>,
    resources: Arc<HostCommandResourceLocks>,
    pool_telemetry: HostRuntimePoolTelemetry,
    telemetry: HostRuntimeTelemetry,
) -> HostCommandLaneSender {
    let (sender, receiver) = mpsc::channel::<ResolvedHostCommand>(descriptor.queue_capacity);
    let semaphore = Arc::new(Semaphore::new(descriptor.max_concurrency));
    tauri::async_runtime::spawn(run_pool_dispatcher(
        descriptor,
        receiver,
        semaphore,
        writer,
        resources,
        pool_telemetry.clone(),
        telemetry,
    ));
    HostCommandLaneSender {
        lane: descriptor.lane,
        execution_pool: descriptor.execution_pool,
        sender,
        telemetry: pool_telemetry,
    }
}

async fn run_pool_dispatcher(
    descriptor: HostRuntimePoolDescriptor,
    mut receiver: mpsc::Receiver<ResolvedHostCommand>,
    semaphore: Arc<Semaphore>,
    writer: Arc<dyn HostCommandResponseWriter>,
    resources: Arc<HostCommandResourceLocks>,
    pool_telemetry: HostRuntimePoolTelemetry,
    telemetry: HostRuntimeTelemetry,
) {
    loop {
        let permit = match Arc::clone(&semaphore).acquire_owned().await {
            Ok(permit) => permit,
            Err(error) => {
                LogEvent::new("hostRuntime.pool.semaphoreClosed")
                    .debug("lane", descriptor.lane)
                    .debug("pool", descriptor.execution_pool)
                    .error(error)
                    .emit_error(targets::HOST_RUNTIME);
                break;
            }
        };
        let Some(command) = receiver.recv().await else {
            break;
        };

        let command_id = command.id.clone();
        let command_name = command.name.clone();
        let record_telemetry = command.record_telemetry;
        let blocking_writer = Arc::clone(&writer);
        let failure_writer = Arc::clone(&writer);
        let blocking_resources = Arc::clone(&resources);
        let blocking_pool_telemetry = pool_telemetry.clone();
        let blocking_telemetry = telemetry.clone();
        let failure_pool_telemetry = pool_telemetry.clone();
        tauri::async_runtime::spawn(async move {
            let join = tauri::async_runtime::spawn_blocking(move || {
                run_resolved_command(
                    descriptor,
                    &blocking_writer,
                    &blocking_resources,
                    command,
                    &blocking_telemetry,
                    &blocking_pool_telemetry,
                    permit,
                );
            })
            .await;
            if let Err(error) = join {
                failure_pool_telemetry.record_join_failed(record_telemetry, &command_name);
                let response = HostCommandResponse {
                    id: command_id,
                    ok: false,
                    result: None,
                    error: Some(json!(format!(
                        "Host command {command_name} failed to join its blocking task: {error}."
                    ))),
                };
                LogEvent::new("hostRuntime.command.joinFailed")
                    .field("id", &response.id)
                    .field("command", &command_name)
                    .debug("lane", descriptor.lane)
                    .debug("pool", descriptor.execution_pool)
                    .error(error)
                    .emit_error(targets::HOST_RUNTIME);
                let write_pool_telemetry = failure_pool_telemetry.clone();
                let write_command_name = command_name.clone();
                let write_descriptor = descriptor;
                let write_join = tauri::async_runtime::spawn_blocking(move || {
                    if let Err(write_error) = failure_writer.write_response(&response) {
                        write_pool_telemetry
                            .record_writer_failed(record_telemetry, &write_command_name);
                        LogEvent::new("hostRuntime.response.writeFailed")
                            .field("phase", "join-failure")
                            .field("id", &response.id)
                            .field("command", &write_command_name)
                            .debug("lane", write_descriptor.lane)
                            .debug("pool", write_descriptor.execution_pool)
                            .error(write_error)
                            .emit_error(targets::HOST_RUNTIME);
                    }
                })
                .await;
                if let Err(write_join_error) = write_join {
                    failure_pool_telemetry.record_writer_failed(record_telemetry, &command_name);
                    LogEvent::new("hostRuntime.response.writerTaskFailed")
                        .field("phase", "join-failure")
                        .field("command", &command_name)
                        .debug("lane", descriptor.lane)
                        .debug("pool", descriptor.execution_pool)
                        .error(write_join_error)
                        .emit_error(targets::HOST_RUNTIME);
                }
            }
        });
    }
}

fn run_resolved_command(
    descriptor: HostRuntimePoolDescriptor,
    writer: &Arc<dyn HostCommandResponseWriter>,
    resources: &HostCommandResourceLocks,
    command: ResolvedHostCommand,
    telemetry: &HostRuntimeTelemetry,
    pool_telemetry: &HostRuntimePoolTelemetry,
    _permit: OwnedSemaphorePermit,
) {
    let id = command.id;
    let name = command.name;
    let resource_resolution = match command.resource_resolver {
        Some(resolve) => resolve().map(|mut resolved| {
            resolved.extend(command.resources);
            resolved
        }),
        None => Ok(command.resources),
    };
    let command_resources = resource_resolution.as_deref().unwrap_or_default();
    let mutation_policy = command.mutation_policy;
    let record_telemetry = command.record_telemetry;
    let queued_ms = command.submitted_at.elapsed().as_millis();
    let started_at = Instant::now();
    let active = pool_telemetry.record_started(record_telemetry, queued_ms);
    LogEvent::new("hostRuntime.command.started")
        .field("id", &id)
        .field("command", &name)
        .debug("lane", descriptor.lane)
        .debug("pool", descriptor.execution_pool)
        .count("active", active)
        .count("maxConcurrency", descriptor.max_concurrency)
        .debug("resources", command_resources)
        .debug("mutationPolicy", mutation_policy)
        .field("queuedMs", queued_ms)
        .emit_debug(targets::HOST_RUNTIME);
    let (response, panicked, resource_wait_ms) = match resource_resolution {
        Ok(command_resources) => {
            let resource_wait_started_at = Instant::now();
            let _resource_guards = resources.lock_many(&command_resources);
            let resource_wait_ms = resource_wait_started_at.elapsed().as_millis();
            let context = HostCommandContext {
                telemetry: telemetry.clone(),
            };
            let (response, panicked) =
                panic_safe_dispatch_outcome(id.clone(), &name, || (command.run)(context));
            (response, panicked, resource_wait_ms)
        }
        Err(error) => (
            HostCommandResponse {
                id: id.clone(),
                ok: false,
                result: None,
                error: Some(error),
            },
            false,
            0,
        ),
    };
    if panicked {
        pool_telemetry.record_panicked(record_telemetry);
    }
    if let Err(error) = writer.write_response(&response) {
        pool_telemetry.record_writer_failed(record_telemetry, &name);
        LogEvent::new("hostRuntime.response.writeFailed")
            .field("phase", "dispatch")
            .field("id", &id)
            .field("command", &name)
            .debug("lane", descriptor.lane)
            .debug("pool", descriptor.execution_pool)
            .error(error)
            .emit_error(targets::HOST_RUNTIME);
    }
    let elapsed_ms = started_at.elapsed().as_millis();
    log_host_command_finished(
        &id,
        &name,
        descriptor.lane,
        descriptor.execution_pool,
        pool_telemetry.active.load(Ordering::Relaxed),
        descriptor.max_concurrency,
        queued_ms,
        elapsed_ms,
        &response,
    );
    pool_telemetry.record_finished(
        record_telemetry,
        &name,
        &response,
        queued_ms,
        elapsed_ms,
        resource_wait_ms,
    );
}

fn log_host_command_finished(
    id: &Value,
    command: &str,
    lane: HostCommandLane,
    execution_pool: HostCommandExecutionPool,
    active: usize,
    max_concurrency: usize,
    queued_ms: u128,
    elapsed_ms: u128,
    response: &HostCommandResponse,
) {
    let event = LogEvent::new(if response.ok {
        "hostRuntime.command.finished"
    } else {
        "hostRuntime.command.failed"
    })
    .field("id", id)
    .field("command", command)
    .debug("lane", lane)
    .debug("pool", execution_pool)
    .count("active", active)
    .count("maxConcurrency", max_concurrency)
    .field("queuedMs", queued_ms)
    .field("elapsedMs", elapsed_ms);
    if response.ok {
        event.emit_debug(targets::HOST_RUNTIME);
    } else {
        event
            .optional("error", response.error.as_ref().map(Value::to_string))
            .emit_warn(targets::HOST_RUNTIME);
    }
}

// --- Tauri in-process entry ------------------------------------------------
//
// The Tauri-side counterpart of sidecar::run_stdio: resolves a typed binding
// in-process and submits it to the same HostCommandScheduler the sidecar
// uses. No JSON round trip happens on this path.

struct TauriCommandResponseWriter {
    pending: Mutex<HashMap<String, AsyncSender<HostCommandResponse>>>,
}

impl TauriCommandResponseWriter {
    fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    fn register(&self, id: String) -> Result<AsyncReceiver<HostCommandResponse>, String> {
        let (sender, receiver) = async_channel(1);
        let mut pending = self
            .pending
            .lock()
            .map_err(|_| "Tauri host command pending map lock was poisoned.".to_string())?;
        pending.insert(id, sender);
        Ok(receiver)
    }
}

impl HostCommandResponseWriter for TauriCommandResponseWriter {
    fn write_response(&self, response: &HostCommandResponse) -> Result<(), String> {
        let Some(id) = response.id.as_str() else {
            return Err(format!(
                "Tauri host command response id must be a string: {}",
                response.id
            ));
        };
        let sender = self
            .pending
            .lock()
            .map_err(|_| "Tauri host command pending map lock was poisoned.".to_string())?
            .remove(id)
            .ok_or_else(|| format!("No pending Tauri host command for response id {id}."))?;
        sender
            .try_send(response.clone())
            .map_err(|error| format!("Failed to deliver Tauri host command response: {error}"))
    }
}

struct TauriCommandRuntime {
    scheduler: HostCommandScheduler,
    writer: Arc<TauriCommandResponseWriter>,
    next_id: AtomicU64,
}

impl TauriCommandRuntime {
    fn new(debug_logging_state: DebugLoggingState) -> Self {
        let writer = Arc::new(TauriCommandResponseWriter::new());
        let scheduler = HostCommandScheduler::new(
            writer.clone(),
            Arc::new(HostCommandResourceLocks::new()),
            HostCommandSchedulerConfig::default(),
            debug_logging_state,
        );
        Self {
            scheduler,
            writer,
            next_id: AtomicU64::new(1),
        }
    }

    fn next_request_id(&self) -> String {
        format!("tauri:{}", self.next_id.fetch_add(1, Ordering::Relaxed))
    }
}

static TAURI_COMMAND_RUNTIME: OnceLock<TauriCommandRuntime> = OnceLock::new();

fn tauri_runtime(debug_logging_state: DebugLoggingState) -> &'static TauriCommandRuntime {
    TAURI_COMMAND_RUNTIME.get_or_init(|| TauriCommandRuntime::new(debug_logging_state))
}

pub(crate) fn print_host_runtime_diagnostics_summary(reason: &str) {
    if let Some(runtime) = TAURI_COMMAND_RUNTIME.get() {
        runtime.scheduler.print_diagnostics_summary(reason);
    }
}

/// Executes a typed host command through the shared runtime scheduler.
///
/// The wrapper's already-deserialized arguments are moved into the command's
/// wire envelope `P`; `HostCommand::resolve` declares lane/resources/
/// cancel/mutation policy and the execution closure, so both the Tauri and
/// Electron entries run the exact same binding without a JSON round trip.
pub(crate) async fn execute<P, T>(app: AppHandle, params: P) -> Result<T, String>
where
    P: HostCommand,
    T: DeserializeOwned,
{
    let debug_logging_state = app
        .as_tauri()
        .ok_or_else(|| "Host command executed without a Tauri app handle.".to_string())?
        .state::<DebugLoggingState>()
        .inner()
        .clone();
    let runtime = tauri_runtime(debug_logging_state.clone());
    let ctx = DispatchContext::new(app.clone(), debug_logging_state);
    let request_id = runtime.next_request_id();
    match P::resolve(&ctx, json!(request_id.clone()), params) {
        ResolvedCommandOrResponse::Command(command) => {
            let resolved_name = command.name.clone();
            let mut receiver = runtime.writer.register(request_id)?;
            runtime.scheduler.submit(command);
            let response = receiver
                .recv()
                .await
                .ok_or_else(|| format!("Host command {resolved_name} response channel closed."))?;
            response_to_result(P::NAME, response)
        }
        ResolvedCommandOrResponse::Response(response) => response_to_result(P::NAME, response),
    }
}
