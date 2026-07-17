use crate::host_commands::HostCommandName;
use crate::support::logging::DebugLoggingState;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::{BTreeMap, VecDeque};
use std::fmt::Write as _;
use std::panic::{self, AssertUnwindSafe};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use tokio::sync::{OwnedSemaphorePermit, Semaphore, mpsc};

const HOST_RUNTIME_LOG_TARGET: &str = "HostRuntime";
const HOST_RUNTIME_STATS_ENV: &str = "MODFORGE_HOST_RUNTIME_STATS";
const HOST_RUNTIME_RECENT_EVENTS_LIMIT: usize = 128;
const HOST_RUNTIME_SLOW_SAMPLE_LIMIT: usize = 5;
const HOST_RUNTIME_SLOW_SAMPLE_MIN_MS: u128 = 250;

pub type HostCommandResult = Result<Value, Value>;
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
    pub name: HostCommandName,
    pub args: Value,
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
    pub cancel_policy: HostCommandCancelPolicy,
    pub mutation_policy: HostCommandMutationPolicy,
    pub submitted_at: Instant,
    pub(crate) record_telemetry: bool,
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

#[derive(Debug, Clone)]
pub struct HostRuntimeTelemetrySnapshot {
    pub summary: String,
}

#[derive(Clone)]
struct HostRuntimeTelemetry {
    started_at: Instant,
    debug_logging_state: DebugLoggingState,
    pools: Arc<[HostRuntimePoolTelemetry]>,
}

#[derive(Clone)]
struct HostRuntimePoolTelemetry {
    lane: HostCommandLane,
    execution_pool: HostCommandExecutionPool,
    max_concurrency: usize,
    queue_capacity: usize,
    submitted: Arc<AtomicU64>,
    rejected: Arc<AtomicU64>,
    started: Arc<AtomicU64>,
    succeeded: Arc<AtomicU64>,
    failed: Arc<AtomicU64>,
    panicked: Arc<AtomicU64>,
    join_failed: Arc<AtomicU64>,
    writer_failed: Arc<AtomicU64>,
    active: Arc<AtomicUsize>,
    peak_active: Arc<AtomicUsize>,
    queued: Arc<AtomicUsize>,
    peak_queue: Arc<AtomicUsize>,
    queued_ms: Arc<AtomicU64>,
    elapsed_ms: Arc<AtomicU64>,
    resource_wait_ms: Arc<AtomicU64>,
    busy_slot_ms: Arc<AtomicU64>,
    recent_events: Arc<Mutex<VecDeque<HostRuntimeRecentEvent>>>,
}

#[derive(Debug, Clone)]
struct HostRuntimeRecentEvent {
    pool: String,
    command: String,
    outcome: &'static str,
    queued_ms: u128,
    elapsed_ms: u128,
}

#[derive(Debug)]
struct HostRuntimePoolSnapshot {
    lane: HostCommandLane,
    execution_pool: HostCommandExecutionPool,
    max_concurrency: usize,
    queue_capacity: usize,
    submitted: u64,
    rejected: u64,
    started: u64,
    succeeded: u64,
    failed: u64,
    panicked: u64,
    join_failed: u64,
    writer_failed: u64,
    active: usize,
    peak_active: usize,
    queued: usize,
    peak_queue: usize,
    queued_ms: u64,
    elapsed_ms: u64,
    resource_wait_ms: u64,
    busy_slot_ms: u64,
}

struct HostRuntimeAnomalySnapshot {
    pool: String,
    failed: u64,
    rejected: u64,
    writer_failed: u64,
    panicked: u64,
    join_failed: u64,
}

impl HostRuntimeAnomalySnapshot {
    fn format(&self) -> String {
        format!(
            "{} fail={} rej={} writerFailed={} panicked={} joinFailed={}",
            self.pool,
            self.failed,
            self.rejected,
            self.writer_failed,
            self.panicked,
            self.join_failed
        )
    }
}

impl HostRuntimeTelemetry {
    fn new(debug_logging_state: DebugLoggingState, pools: &[HostRuntimePoolDescriptor]) -> Self {
        Self {
            started_at: Instant::now(),
            debug_logging_state,
            pools: pools
                .iter()
                .map(HostRuntimePoolTelemetry::new)
                .collect::<Vec<_>>()
                .into(),
        }
    }

    fn pool(
        &self,
        lane: HostCommandLane,
        execution_pool: HostCommandExecutionPool,
    ) -> HostRuntimePoolTelemetry {
        self.pools
            .iter()
            .find(|pool| pool.lane == lane && pool.execution_pool == execution_pool)
            .cloned()
            .expect("host runtime telemetry pool should exist")
    }

    fn summary(&self, reason: &str) -> Option<HostRuntimeTelemetrySnapshot> {
        if !self.should_print_summary() {
            return None;
        }
        Some(self.build_summary(reason))
    }

    fn build_summary(&self, reason: &str) -> HostRuntimeTelemetrySnapshot {
        let elapsed_ms = self.started_at.elapsed().as_millis().max(1);
        let snapshots = self
            .pools
            .iter()
            .map(HostRuntimePoolTelemetry::snapshot)
            .collect::<Vec<_>>();
        let mut summary = String::new();
        let _ = writeln!(
            summary,
            "HostRuntime stats summary reason={reason} uptime={}",
            format_duration_ms(elapsed_ms)
        );
        let _ = writeln!(summary, "Pools");
        let mut recent_events = Vec::new();
        let mut anomaly_rows = Vec::new();
        for snapshot in &snapshots {
            // usagePercent measures slot occupancy across the scheduler lifetime:
            // busy_slot_ms / (max_concurrency * scheduler_wall_ms) * 100.
            let usage_percent = percentage(
                snapshot.busy_slot_ms as u128,
                snapshot.max_concurrency as u128 * elapsed_ms,
            );
            let peak_active_percent = percentage(
                snapshot.peak_active as u128,
                snapshot.max_concurrency as u128,
            );
            let peak_queue_percent =
                percentage(snapshot.peak_queue as u128, snapshot.queue_capacity as u128);
            let avg_queue_ms = average_ms(snapshot.queued_ms, snapshot.started);
            let avg_elapsed_ms = average_ms(snapshot.elapsed_ms, snapshot.started);
            let avg_resource_wait_ms = average_ms(snapshot.resource_wait_ms, snapshot.started);
            let pool_name = pool_label(snapshot.lane, snapshot.execution_pool);
            let _ = writeln!(summary, "  {pool_name}");
            let _ = writeln!(
                summary,
                "    load active={}/{} peak={}/{} {:.1}% {} usage={:.1}% {}",
                snapshot.active,
                snapshot.max_concurrency,
                snapshot.peak_active,
                snapshot.max_concurrency,
                peak_active_percent,
                progress_bar(peak_active_percent),
                usage_percent,
                progress_bar(usage_percent)
            );
            let _ = writeln!(
                summary,
                "    work jobs={} ok={} fail={} rej={} queue={}/{} peakQ={}/{} {:.1}%",
                snapshot.submitted,
                snapshot.succeeded,
                snapshot.failed,
                snapshot.rejected,
                snapshot.queued,
                snapshot.queue_capacity,
                snapshot.peak_queue,
                snapshot.queue_capacity,
                peak_queue_percent
            );
            let _ = writeln!(
                summary,
                "    time avgQ={} avgRun={} avgLock={}",
                format_ms(avg_queue_ms),
                format_ms(avg_elapsed_ms),
                format_ms(avg_resource_wait_ms)
            );
            if snapshot.failed > 0
                || snapshot.rejected > 0
                || snapshot.writer_failed > 0
                || snapshot.panicked > 0
                || snapshot.join_failed > 0
            {
                anomaly_rows.push(HostRuntimeAnomalySnapshot {
                    pool: pool_name.clone(),
                    failed: snapshot.failed,
                    rejected: snapshot.rejected,
                    writer_failed: snapshot.writer_failed,
                    panicked: snapshot.panicked,
                    join_failed: snapshot.join_failed,
                });
            }
            if let Some(pool) = self.pools.iter().find(|pool| {
                pool.lane == snapshot.lane && pool.execution_pool == snapshot.execution_pool
            }) {
                recent_events.extend(pool.recent_events());
            }
        }
        if !anomaly_rows.is_empty() {
            let _ = writeln!(summary, "\nAnomalies");
            for anomaly in anomaly_rows {
                let _ = writeln!(summary, "  {}", anomaly.format());
            }
        }
        let mut slow_events = recent_events
            .into_iter()
            .filter(|event| {
                event.outcome != "ok" || event.elapsed_ms >= HOST_RUNTIME_SLOW_SAMPLE_MIN_MS
            })
            .collect::<Vec<_>>();
        slow_events.sort_by(|left, right| {
            right
                .elapsed_ms
                .cmp(&left.elapsed_ms)
                .then_with(|| right.queued_ms.cmp(&left.queued_ms))
        });
        if !slow_events.is_empty() {
            let _ = writeln!(summary, "\nRecent slow/failure samples");
            for event in slow_events.into_iter().take(HOST_RUNTIME_SLOW_SAMPLE_LIMIT) {
                let _ = writeln!(
                    summary,
                    "  {:>7} {:<10} {:<26} {} q={}",
                    format_duration_ms(event.elapsed_ms),
                    event.outcome,
                    event.pool,
                    event.command,
                    format_duration_ms(event.queued_ms)
                );
            }
        }
        HostRuntimeTelemetrySnapshot { summary }
    }

    fn print_summary(&self, reason: &str) {
        let Some(snapshot) = self.summary(reason) else {
            return;
        };
        self.print_snapshot(snapshot);
    }

    fn print_summary_now(&self, reason: &str) {
        self.print_snapshot(self.build_summary(reason));
    }

    fn print_snapshot(&self, snapshot: HostRuntimeTelemetrySnapshot) {
        if self.has_failures() {
            log_summary_lines(log::Level::Warn, &snapshot.summary);
        } else {
            log_summary_lines(log::Level::Info, &snapshot.summary);
        }
    }

    fn should_record(&self) -> bool {
        self.debug_logging_state.is_enabled() || env_flag_is_enabled(HOST_RUNTIME_STATS_ENV)
    }

    fn should_print_summary(&self) -> bool {
        match std::env::var(HOST_RUNTIME_STATS_ENV) {
            Ok(value) => env_flag_is_enabled_value(&value),
            Err(_) => self.debug_logging_state.is_enabled(),
        }
    }

    fn has_failures(&self) -> bool {
        self.pools.iter().any(|pool| {
            let snapshot = pool.snapshot();
            snapshot.rejected > 0
                || snapshot.failed > 0
                || snapshot.panicked > 0
                || snapshot.join_failed > 0
                || snapshot.writer_failed > 0
        })
    }
}

impl HostRuntimePoolTelemetry {
    fn new(descriptor: &HostRuntimePoolDescriptor) -> Self {
        Self {
            lane: descriptor.lane,
            execution_pool: descriptor.execution_pool,
            max_concurrency: descriptor.max_concurrency,
            queue_capacity: descriptor.queue_capacity,
            submitted: Arc::new(AtomicU64::new(0)),
            rejected: Arc::new(AtomicU64::new(0)),
            started: Arc::new(AtomicU64::new(0)),
            succeeded: Arc::new(AtomicU64::new(0)),
            failed: Arc::new(AtomicU64::new(0)),
            panicked: Arc::new(AtomicU64::new(0)),
            join_failed: Arc::new(AtomicU64::new(0)),
            writer_failed: Arc::new(AtomicU64::new(0)),
            active: Arc::new(AtomicUsize::new(0)),
            peak_active: Arc::new(AtomicUsize::new(0)),
            queued: Arc::new(AtomicUsize::new(0)),
            peak_queue: Arc::new(AtomicUsize::new(0)),
            queued_ms: Arc::new(AtomicU64::new(0)),
            elapsed_ms: Arc::new(AtomicU64::new(0)),
            resource_wait_ms: Arc::new(AtomicU64::new(0)),
            busy_slot_ms: Arc::new(AtomicU64::new(0)),
            recent_events: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    fn record_submitted(&self, record_telemetry: bool) {
        if !record_telemetry {
            return;
        }
        self.submitted.fetch_add(1, Ordering::Relaxed);
        let queued = self.queued.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak_queue.fetch_max(queued, Ordering::SeqCst);
    }

    fn record_rejected(&self, record_telemetry: bool, command: &str) {
        if !record_telemetry {
            return;
        }
        self.submitted.fetch_add(1, Ordering::Relaxed);
        self.rejected.fetch_add(1, Ordering::Relaxed);
        self.push_recent(command, "rejected", 0, 0, true);
    }

    fn record_started(&self, record_telemetry: bool, queued_ms: u128) -> usize {
        let active = self.active.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak_active.fetch_max(active, Ordering::SeqCst);
        if record_telemetry {
            self.started.fetch_add(1, Ordering::Relaxed);
            self.queued_ms
                .fetch_add(saturating_u128_to_u64(queued_ms), Ordering::Relaxed);
            self.decrement_queue();
        }
        active
    }

    fn record_finished(
        &self,
        record_telemetry: bool,
        command: &str,
        response: &HostCommandResponse,
        queued_ms: u128,
        elapsed_ms: u128,
        resource_wait_ms: u128,
    ) {
        self.decrement_active();
        if !record_telemetry {
            return;
        }
        if response.ok {
            self.succeeded.fetch_add(1, Ordering::Relaxed);
        } else {
            self.failed.fetch_add(1, Ordering::Relaxed);
        }
        self.elapsed_ms
            .fetch_add(saturating_u128_to_u64(elapsed_ms), Ordering::Relaxed);
        self.resource_wait_ms
            .fetch_add(saturating_u128_to_u64(resource_wait_ms), Ordering::Relaxed);
        self.busy_slot_ms
            .fetch_add(saturating_u128_to_u64(elapsed_ms), Ordering::Relaxed);
        self.push_recent(
            command,
            if response.ok { "ok" } else { "failed" },
            queued_ms,
            elapsed_ms,
            false,
        );
    }

    fn record_panicked(&self, record_telemetry: bool) {
        if record_telemetry {
            self.panicked.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn record_join_failed(&self, record_telemetry: bool, command: &str) {
        self.decrement_active();
        if record_telemetry {
            self.join_failed.fetch_add(1, Ordering::Relaxed);
            self.failed.fetch_add(1, Ordering::Relaxed);
            self.push_recent(command, "joinFailed", 0, 0, true);
        }
    }

    fn record_writer_failed(&self, record_telemetry: bool, command: &str) {
        if record_telemetry {
            self.writer_failed.fetch_add(1, Ordering::Relaxed);
            self.push_recent(command, "writerFailed", 0, 0, true);
        }
    }

    fn snapshot(&self) -> HostRuntimePoolSnapshot {
        HostRuntimePoolSnapshot {
            lane: self.lane,
            execution_pool: self.execution_pool,
            max_concurrency: self.max_concurrency,
            queue_capacity: self.queue_capacity,
            submitted: self.submitted.load(Ordering::Relaxed),
            rejected: self.rejected.load(Ordering::Relaxed),
            started: self.started.load(Ordering::Relaxed),
            succeeded: self.succeeded.load(Ordering::Relaxed),
            failed: self.failed.load(Ordering::Relaxed),
            panicked: self.panicked.load(Ordering::Relaxed),
            join_failed: self.join_failed.load(Ordering::Relaxed),
            writer_failed: self.writer_failed.load(Ordering::Relaxed),
            active: self.active.load(Ordering::Relaxed),
            peak_active: self.peak_active.load(Ordering::Relaxed),
            queued: self.queued.load(Ordering::Relaxed),
            peak_queue: self.peak_queue.load(Ordering::Relaxed),
            queued_ms: self.queued_ms.load(Ordering::Relaxed),
            elapsed_ms: self.elapsed_ms.load(Ordering::Relaxed),
            resource_wait_ms: self.resource_wait_ms.load(Ordering::Relaxed),
            busy_slot_ms: self.busy_slot_ms.load(Ordering::Relaxed),
        }
    }

    fn decrement_queue(&self) {
        let mut current = self.queued.load(Ordering::SeqCst);
        while current > 0 {
            match self.queued.compare_exchange(
                current,
                current - 1,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => break,
                Err(next) => current = next,
            }
        }
    }

    fn decrement_active(&self) {
        let mut current = self.active.load(Ordering::SeqCst);
        while current > 0 {
            match self.active.compare_exchange(
                current,
                current - 1,
                Ordering::SeqCst,
                Ordering::SeqCst,
            ) {
                Ok(_) => break,
                Err(next) => current = next,
            }
        }
    }

    fn push_recent(
        &self,
        command: &str,
        outcome: &'static str,
        queued_ms: u128,
        elapsed_ms: u128,
        force: bool,
    ) {
        if !force && outcome == "ok" && elapsed_ms < HOST_RUNTIME_SLOW_SAMPLE_MIN_MS {
            return;
        }
        let Ok(mut recent_events) = self.recent_events.lock() else {
            return;
        };
        if recent_events.len() == HOST_RUNTIME_RECENT_EVENTS_LIMIT {
            recent_events.pop_front();
        }
        recent_events.push_back(HostRuntimeRecentEvent {
            pool: pool_label(self.lane, self.execution_pool),
            command: command.to_string(),
            outcome,
            queued_ms,
            elapsed_ms,
        });
    }

    fn recent_events(&self) -> Vec<HostRuntimeRecentEvent> {
        self.recent_events
            .lock()
            .map(|events| events.iter().cloned().collect())
            .unwrap_or_default()
    }
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
                        log::error!(
                            target: HOST_RUNTIME_LOG_TARGET,
                            "Host command dynamic resource registry lock was poisoned"
                        );
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
    execution_pool: HostCommandExecutionPool,
    sender: mpsc::Sender<ResolvedHostCommand>,
    telemetry: HostRuntimePoolTelemetry,
}

#[derive(Debug, Clone, Copy)]
struct HostRuntimePoolDescriptor {
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
                log::error!(
                    target: HOST_RUNTIME_LOG_TARGET,
                    "Failed to enqueue host command: id={} command={} lane={:?} pool={:?} reason={}",
                    response.id,
                    command.name,
                    sender.lane,
                    sender.execution_pool,
                    reason
                );
                if let Err(error) = self.writer.write_response(&response) {
                    sender
                        .telemetry
                        .record_writer_failed(record_telemetry, &command.name);
                    log::error!(
                        target: HOST_RUNTIME_LOG_TARGET,
                        "Failed to write host command enqueue error response: id={} command={} lane={:?} pool={:?} error={}",
                        response.id,
                        command.name,
                        sender.lane,
                        sender.execution_pool,
                        error
                    );
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
                log::error!(
                    target: HOST_RUNTIME_LOG_TARGET,
                    "Host command pool semaphore closed: lane={:?} pool={:?} error={}",
                    descriptor.lane,
                    descriptor.execution_pool,
                    error
                );
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
                log::error!(
                    target: HOST_RUNTIME_LOG_TARGET,
                    "Host command blocking task join failed: id={} command={} lane={:?} pool={:?} error={}",
                    response.id,
                    command_name,
                    descriptor.lane,
                    descriptor.execution_pool,
                    error
                );
                let write_pool_telemetry = failure_pool_telemetry.clone();
                let write_command_name = command_name.clone();
                let write_descriptor = descriptor;
                let write_join = tauri::async_runtime::spawn_blocking(move || {
                    if let Err(write_error) = failure_writer.write_response(&response) {
                        write_pool_telemetry
                            .record_writer_failed(record_telemetry, &write_command_name);
                        log::error!(
                            target: HOST_RUNTIME_LOG_TARGET,
                            "Failed to write host command join failure response: id={} command={} lane={:?} pool={:?} error={}",
                            response.id,
                            write_command_name,
                            write_descriptor.lane,
                            write_descriptor.execution_pool,
                            write_error
                        );
                    }
                })
                .await;
                if let Err(write_join_error) = write_join {
                    failure_pool_telemetry.record_writer_failed(record_telemetry, &command_name);
                    log::error!(
                        target: HOST_RUNTIME_LOG_TARGET,
                        "Host command join failure response writer task failed: command={} lane={:?} pool={:?} error={}",
                        command_name,
                        descriptor.lane,
                        descriptor.execution_pool,
                        write_join_error
                    );
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
    let cancel_policy = command.cancel_policy;
    let mutation_policy = command.mutation_policy;
    let record_telemetry = command.record_telemetry;
    let queued_ms = command.submitted_at.elapsed().as_millis();
    let started_at = Instant::now();
    let active = pool_telemetry.record_started(record_telemetry, queued_ms);
    log::debug!(
        target: HOST_RUNTIME_LOG_TARGET,
        "Host command started: id={} command={} lane={:?} pool={:?} active={} maxConcurrency={} resources={:?} cancelPolicy={:?} mutationPolicy={:?} queuedMs={}",
        id,
        name,
        descriptor.lane,
        descriptor.execution_pool,
        active,
        descriptor.max_concurrency,
        command_resources,
        cancel_policy,
        mutation_policy,
        queued_ms
    );
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
        log::error!(
            target: HOST_RUNTIME_LOG_TARGET,
            "Failed to write host command response: id={} command={} lane={:?} pool={:?} error={}",
            id,
            name,
            descriptor.lane,
            descriptor.execution_pool,
            error
        );
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
    panic_safe_dispatch_outcome(id, command, dispatch).0
}

fn panic_safe_dispatch_outcome<F>(
    id: Value,
    command: &str,
    dispatch: F,
) -> (HostCommandResponse, bool)
where
    F: FnOnce() -> HostCommandResult,
{
    match panic::catch_unwind(AssertUnwindSafe(dispatch)) {
        Ok(result) => (dispatch_result_to_response(id, result), false),
        Err(payload) => {
            let message = panic_message(payload.as_ref());
            log::error!(
                target: HOST_RUNTIME_LOG_TARGET,
                "Host command panicked: id={} command={} panic={}",
                id,
                command,
                message
            );
            (
                HostCommandResponse {
                    id,
                    ok: false,
                    result: None,
                    error: Some(json!(format!(
                        "Host command {command} panicked before returning a response."
                    ))),
                },
                true,
            )
        }
    }
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
    if response.ok {
        log::debug!(
            target: HOST_RUNTIME_LOG_TARGET,
            "Host command finished: id={} command={} lane={:?} pool={:?} active={} maxConcurrency={} queuedMs={} elapsedMs={}",
            id,
            command,
            lane,
            execution_pool,
            active,
            max_concurrency,
            queued_ms,
            elapsed_ms
        );
    } else {
        log::warn!(
            target: HOST_RUNTIME_LOG_TARGET,
            "Host command failed: id={} command={} lane={:?} pool={:?} active={} maxConcurrency={} queuedMs={} elapsedMs={} error={}",
            id,
            command,
            lane,
            execution_pool,
            active,
            max_concurrency,
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

fn env_flag_is_enabled(name: &str) -> bool {
    std::env::var(name).is_ok_and(|value| env_flag_is_enabled_value(&value))
}

fn env_flag_is_enabled_value(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn saturating_u128_to_u64(value: u128) -> u64 {
    value.min(u64::MAX as u128) as u64
}

fn percentage(numerator: u128, denominator: u128) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 * 100.0 / denominator as f64
    }
}

fn average_ms(total_ms: u64, count: u64) -> f64 {
    if count == 0 {
        0.0
    } else {
        total_ms as f64 / count as f64
    }
}

fn log_summary_lines(level: log::Level, summary: &str) {
    for line in summary.trim_end().lines() {
        log::log!(target: HOST_RUNTIME_LOG_TARGET, level, "{line}");
    }
}

fn progress_bar(percent: f64) -> String {
    const WIDTH: usize = 10;
    let filled = ((percent.clamp(0.0, 100.0) / 100.0) * WIDTH as f64).round() as usize;
    format!("[{}{}]", "#".repeat(filled), ".".repeat(WIDTH - filled))
}

fn pool_label(lane: HostCommandLane, execution_pool: HostCommandExecutionPool) -> String {
    format!("{lane:?}/{execution_pool:?}")
}

fn format_ms(value: f64) -> String {
    format!("{value:.1}ms")
}

fn format_duration_ms(value: u128) -> String {
    if value >= 1_000 {
        format!("{:.1}s", value as f64 / 1_000.0)
    } else {
        format!("{value}ms")
    }
}
