use serde::Serialize;
use serde_json::{Value, json};
use std::panic::{self, AssertUnwindSafe};
use std::sync::{Arc, Mutex, MutexGuard, mpsc};
use std::thread;
use std::time::Instant;

pub type HostCommandResult = Result<Value, Value>;
pub type HostCommandRunner =
    Box<dyn FnOnce(HostCommandContext) -> HostCommandResult + Send + 'static>;

#[derive(Debug, Clone)]
pub struct HostCommandContext;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HostCommandLane {
    Control,
    Network,
    Io,
    Mutation,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum HostCommandResource {
    AppUiState,
    LauncherSettings,
    LauncherLibraryState,
    LauncherLibraryCovers,
    LauncherDownloadQueue,
    LauncherImageCache,
    LauncherUpdatesCache,
    LauncherInstallTree,
    GameAssetCache,
    ModProject,
    CpMakerDrafts,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostCommandCancelPolicy {
    NotCancellable,
    Cooperative,
    SupersedeByKey,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostCommandMutationPolicy {
    Concurrent,
    ExclusiveResources,
    SerialLane,
}

#[derive(Debug)]
pub struct HostCommandEnvelope {
    pub id: Value,
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Copy)]
pub struct HostCommandSchedulerConfig {
    pub control_workers: usize,
    pub network_workers: usize,
    pub io_workers: usize,
    pub mutation_workers: usize,
    pub lane_queue_capacity: usize,
}

impl Default for HostCommandSchedulerConfig {
    fn default() -> Self {
        Self {
            control_workers: 2,
            network_workers: 3,
            io_workers: 2,
            mutation_workers: 1,
            lane_queue_capacity: 256,
        }
    }
}

impl HostCommandSchedulerConfig {
    pub fn normalized(self) -> Self {
        Self {
            control_workers: self.control_workers.max(1),
            network_workers: self.network_workers.max(1),
            io_workers: self.io_workers.max(1),
            mutation_workers: self.mutation_workers.max(1),
            lane_queue_capacity: self.lane_queue_capacity.max(1),
        }
    }
}

pub struct ResolvedHostCommand {
    pub id: Value,
    pub name: String,
    pub lane: HostCommandLane,
    pub resources: &'static [HostCommandResource],
    pub cancel_policy: HostCommandCancelPolicy,
    pub mutation_policy: HostCommandMutationPolicy,
    pub submitted_at: Instant,
    pub run: HostCommandRunner,
}

#[derive(Debug, Clone, Serialize)]
pub struct HostCommandResponse {
    pub id: Value,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
}

pub trait HostCommandResponseWriter: Send + Sync {
    fn write_response(&self, response: &HostCommandResponse) -> Result<(), String>;
}

pub struct HostCommandResourceLocks {
    app_ui_state: Mutex<()>,
    launcher_settings: Mutex<()>,
    launcher_library_state: Mutex<()>,
    launcher_library_covers: Mutex<()>,
    launcher_download_queue: Mutex<()>,
    launcher_image_cache: Mutex<()>,
    launcher_updates_cache: Mutex<()>,
    launcher_install_tree: Mutex<()>,
    game_asset_cache: Mutex<()>,
    mod_project: Mutex<()>,
    cp_maker_drafts: Mutex<()>,
}

impl HostCommandResourceLocks {
    pub fn new() -> Self {
        Self {
            app_ui_state: Mutex::new(()),
            launcher_settings: Mutex::new(()),
            launcher_library_state: Mutex::new(()),
            launcher_library_covers: Mutex::new(()),
            launcher_download_queue: Mutex::new(()),
            launcher_image_cache: Mutex::new(()),
            launcher_updates_cache: Mutex::new(()),
            launcher_install_tree: Mutex::new(()),
            game_asset_cache: Mutex::new(()),
            mod_project: Mutex::new(()),
            cp_maker_drafts: Mutex::new(()),
        }
    }

    fn lock_many(&self, resources: &[HostCommandResource]) -> Vec<MutexGuard<'_, ()>> {
        let mut resources = resources.to_vec();
        resources.sort();
        resources.dedup();

        let mut guards = Vec::with_capacity(resources.len());
        for resource in resources {
            guards.push(self.lock_one(resource));
        }
        guards
    }

    fn lock_one(&self, resource: HostCommandResource) -> MutexGuard<'_, ()> {
        let lock = match resource {
            HostCommandResource::AppUiState => &self.app_ui_state,
            HostCommandResource::LauncherSettings => &self.launcher_settings,
            HostCommandResource::LauncherLibraryState => &self.launcher_library_state,
            HostCommandResource::LauncherLibraryCovers => &self.launcher_library_covers,
            HostCommandResource::LauncherDownloadQueue => &self.launcher_download_queue,
            HostCommandResource::LauncherImageCache => &self.launcher_image_cache,
            HostCommandResource::LauncherUpdatesCache => &self.launcher_updates_cache,
            HostCommandResource::LauncherInstallTree => &self.launcher_install_tree,
            HostCommandResource::GameAssetCache => &self.game_asset_cache,
            HostCommandResource::ModProject => &self.mod_project,
            HostCommandResource::CpMakerDrafts => &self.cp_maker_drafts,
        };
        match lock.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::error!(
                    target: "HostRuntime",
                    "Host command resource lock was poisoned: resource={:?}",
                    resource
                );
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
    sender: mpsc::SyncSender<ResolvedHostCommand>,
}

pub struct HostCommandScheduler {
    control: HostCommandLaneSender,
    network: HostCommandLaneSender,
    io: HostCommandLaneSender,
    mutation: HostCommandLaneSender,
    writer: Arc<dyn HostCommandResponseWriter>,
}

impl HostCommandScheduler {
    pub fn new(
        writer: Arc<dyn HostCommandResponseWriter>,
        resources: Arc<HostCommandResourceLocks>,
        config: HostCommandSchedulerConfig,
    ) -> Self {
        let config = config.normalized();
        Self {
            control: spawn_lane(
                HostCommandLane::Control,
                config.control_workers,
                config.lane_queue_capacity,
                Arc::clone(&writer),
                Arc::clone(&resources),
            ),
            network: spawn_lane(
                HostCommandLane::Network,
                config.network_workers,
                config.lane_queue_capacity,
                Arc::clone(&writer),
                Arc::clone(&resources),
            ),
            io: spawn_lane(
                HostCommandLane::Io,
                config.io_workers,
                config.lane_queue_capacity,
                Arc::clone(&writer),
                Arc::clone(&resources),
            ),
            mutation: spawn_lane(
                HostCommandLane::Mutation,
                config.mutation_workers,
                config.lane_queue_capacity,
                Arc::clone(&writer),
                resources,
            ),
            writer,
        }
    }

    pub fn submit(&self, command: ResolvedHostCommand) {
        let sender = match command.lane {
            HostCommandLane::Control => &self.control,
            HostCommandLane::Network => &self.network,
            HostCommandLane::Io => &self.io,
            HostCommandLane::Mutation => &self.mutation,
        };
        if let Err(error) = sender.sender.try_send(command) {
            let (command, reason) = match error {
                mpsc::TrySendError::Full(command) => (command, "lane queue is full"),
                mpsc::TrySendError::Disconnected(command) => {
                    (command, "lane workers are not available")
                }
            };
            let response = HostCommandResponse {
                id: command.id,
                ok: false,
                result: None,
                error: Some(json!(format!(
                    "Host command {} could not be scheduled: {reason}.",
                    command.name
                ))),
            };
            log::error!(
                target: "HostRuntime",
                "Failed to enqueue host command: id={} command={} lane={:?} reason={}",
                response.id,
                command.name,
                sender.lane,
                reason
            );
            if let Err(error) = self.writer.write_response(&response) {
                log::error!(
                    target: "HostRuntime",
                    "Failed to write host command enqueue error response: id={} command={} lane={:?} error={}",
                    response.id,
                    command.name,
                    sender.lane,
                    error
                );
            }
        }
    }
}

fn spawn_lane(
    lane: HostCommandLane,
    worker_count: usize,
    queue_capacity: usize,
    writer: Arc<dyn HostCommandResponseWriter>,
    resources: Arc<HostCommandResourceLocks>,
) -> HostCommandLaneSender {
    let (sender, receiver) = mpsc::sync_channel::<ResolvedHostCommand>(queue_capacity);
    let receiver = Arc::new(Mutex::new(receiver));
    for worker_id in 0..worker_count {
        let worker_receiver = Arc::clone(&receiver);
        let worker_writer = Arc::clone(&writer);
        let worker_resources = Arc::clone(&resources);
        thread::spawn(move || {
            run_lane_worker(
                lane,
                worker_id,
                worker_receiver,
                worker_writer,
                worker_resources,
            )
        });
    }
    HostCommandLaneSender { lane, sender }
}

fn next_lane_command(
    lane: HostCommandLane,
    receiver: &Mutex<mpsc::Receiver<ResolvedHostCommand>>,
) -> Option<ResolvedHostCommand> {
    match receiver.lock() {
        Ok(receiver) => receiver.recv().ok(),
        Err(poisoned) => {
            log::error!(
                target: "HostRuntime",
                "Host command lane receiver lock was poisoned: lane={:?}",
                lane
            );
            poisoned.into_inner().recv().ok()
        }
    }
}

fn run_lane_worker(
    lane: HostCommandLane,
    worker_id: usize,
    receiver: Arc<Mutex<mpsc::Receiver<ResolvedHostCommand>>>,
    writer: Arc<dyn HostCommandResponseWriter>,
    resources: Arc<HostCommandResourceLocks>,
) {
    while let Some(command) = next_lane_command(lane, &receiver) {
        run_resolved_command(lane, worker_id, &writer, &resources, command);
    }
}

pub fn run_resolved_command(
    lane: HostCommandLane,
    worker_id: usize,
    writer: &Arc<dyn HostCommandResponseWriter>,
    resources: &HostCommandResourceLocks,
    command: ResolvedHostCommand,
) {
    let id = command.id;
    let name = command.name;
    let command_resources = command.resources;
    let cancel_policy = command.cancel_policy;
    let mutation_policy = command.mutation_policy;
    let queued_ms = command.submitted_at.elapsed().as_millis();
    let started_at = Instant::now();
    log::debug!(
        target: "HostRuntime",
        "Host command started: id={} command={} lane={:?} worker={} resources={:?} cancelPolicy={:?} mutationPolicy={:?} queuedMs={}",
        id,
        name,
        lane,
        worker_id,
        command_resources,
        cancel_policy,
        mutation_policy,
        queued_ms
    );
    let _resource_guards = resources.lock_many(command_resources);
    let response =
        panic_safe_dispatch_response(id.clone(), &name, || (command.run)(HostCommandContext));
    log_host_command_finished(
        &id,
        &name,
        lane,
        worker_id,
        queued_ms,
        started_at.elapsed().as_millis(),
        &response,
    );
    if let Err(error) = writer.write_response(&response) {
        log::error!(
            target: "HostRuntime",
            "Failed to write host command response: id={} command={} lane={:?} worker={} error={}",
            id,
            name,
            lane,
            worker_id,
            error
        );
    }
}

pub fn execute_resolved_blocking(
    resources: &HostCommandResourceLocks,
    command: ResolvedHostCommand,
) -> HostCommandResponse {
    let id = command.id;
    let name = command.name;
    let lane = command.lane;
    let command_resources = command.resources;
    let cancel_policy = command.cancel_policy;
    let mutation_policy = command.mutation_policy;
    let queued_ms = command.submitted_at.elapsed().as_millis();
    let started_at = Instant::now();
    log::debug!(
        target: "HostRuntime",
        "Host command executing inline: id={} command={} lane={:?} resources={:?} cancelPolicy={:?} mutationPolicy={:?} queuedMs={}",
        id,
        name,
        lane,
        command_resources,
        cancel_policy,
        mutation_policy,
        queued_ms
    );
    let _resource_guards = resources.lock_many(command_resources);
    let response =
        panic_safe_dispatch_response(id.clone(), &name, || (command.run)(HostCommandContext));
    log_host_command_finished(
        &id,
        &name,
        lane,
        0,
        queued_ms,
        started_at.elapsed().as_millis(),
        &response,
    );
    response
}

fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        return (*message).to_string();
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.clone();
    }
    "unknown panic payload".to_string()
}

fn dispatch_result_to_response(id: Value, result: HostCommandResult) -> HostCommandResponse {
    match result {
        Ok(result) => HostCommandResponse {
            id,
            ok: true,
            result: Some(result),
            error: None,
        },
        Err(error) => HostCommandResponse {
            id,
            ok: false,
            result: None,
            error: Some(error),
        },
    }
}

pub fn panic_safe_dispatch_response<F>(id: Value, command: &str, dispatch: F) -> HostCommandResponse
where
    F: FnOnce() -> HostCommandResult,
{
    match panic::catch_unwind(AssertUnwindSafe(dispatch)) {
        Ok(result) => dispatch_result_to_response(id, result),
        Err(payload) => {
            let message = panic_message(payload.as_ref());
            log::error!(
                target: "HostRuntime",
                "Host command panicked: id={} command={} panic={}",
                id,
                command,
                message
            );
            HostCommandResponse {
                id,
                ok: false,
                result: None,
                error: Some(json!(format!(
                    "Host command {command} panicked before returning a response."
                ))),
            }
        }
    }
}

fn log_host_command_finished(
    id: &Value,
    command: &str,
    lane: HostCommandLane,
    worker_id: usize,
    queued_ms: u128,
    elapsed_ms: u128,
    response: &HostCommandResponse,
) {
    if response.ok {
        log::debug!(
            target: "HostRuntime",
            "Host command finished: id={} command={} lane={:?} worker={} queuedMs={} elapsedMs={}",
            id,
            command,
            lane,
            worker_id,
            queued_ms,
            elapsed_ms
        );
    } else {
        log::warn!(
            target: "HostRuntime",
            "Host command failed: id={} command={} lane={:?} worker={} queuedMs={} elapsedMs={} error={}",
            id,
            command,
            lane,
            worker_id,
            queued_ms,
            elapsed_ms,
            response
                .error
                .as_ref()
                .map(Value::to_string)
                .unwrap_or_else(|| "null".to_string())
        );
    }
}
