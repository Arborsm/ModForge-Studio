use crate::support::logging::{DebugLoggingState, LogEvent, targets};
use std::collections::VecDeque;
use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use super::response::HostCommandResponse;
use super::{HostCommandExecutionPool, HostCommandLane, HostRuntimePoolDescriptor};

const HOST_RUNTIME_STATS_ENV: &str = "MODFORGE_HOST_RUNTIME_STATS";
const HOST_RUNTIME_RECENT_EVENTS_LIMIT: usize = 128;
const HOST_RUNTIME_SLOW_SAMPLE_LIMIT: usize = 5;
const HOST_RUNTIME_SLOW_SAMPLE_MIN_MS: u128 = 250;

#[derive(Debug, Clone)]
pub struct HostRuntimeTelemetrySnapshot {
    event: LogEvent,
}

impl HostRuntimeTelemetrySnapshot {
    /// Renders the diagnostics event exactly as it reaches the log sinks.
    pub fn render(&self) -> String {
        self.event.render()
    }
}

#[derive(Clone)]
pub(crate) struct HostRuntimeTelemetry {
    started_at: Instant,
    debug_logging_state: DebugLoggingState,
    pools: Arc<[HostRuntimePoolTelemetry]>,
}

#[derive(Clone)]
pub(crate) struct HostRuntimePoolTelemetry {
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
    pub(crate) active: Arc<AtomicUsize>,
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
    pub(crate) fn new(
        debug_logging_state: DebugLoggingState,
        pools: &[HostRuntimePoolDescriptor],
    ) -> Self {
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

    pub(crate) fn pool(
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

    pub(crate) fn summary(&self, reason: &str) -> Option<HostRuntimeTelemetrySnapshot> {
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
            // One aligned row per pool. Four rows each turned a nine-pool
            // snapshot into a wall of text nobody reads.
            let _ = writeln!(
                summary,
                "  {:<28} {} usage={:>5.1}%  active={}/{} peak={}/{} {:>5.1}%  jobs={:<6} ok={:<6} fail={:<4} rej={:<4} q={}/{} peakQ={}/{} {:>5.1}%  avgQ={:<8} avgRun={:<8} avgLock={}",
                pool_name,
                progress_bar(usage_percent),
                usage_percent,
                snapshot.active,
                snapshot.max_concurrency,
                snapshot.peak_active,
                snapshot.max_concurrency,
                peak_active_percent,
                snapshot.submitted,
                snapshot.succeeded,
                snapshot.failed,
                snapshot.rejected,
                snapshot.queued,
                snapshot.queue_capacity,
                snapshot.peak_queue,
                snapshot.queue_capacity,
                peak_queue_percent,
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
        HostRuntimeTelemetrySnapshot {
            event: LogEvent::new("hostRuntime.stats")
                .field("reason", reason)
                .field("uptime", format_duration_ms(elapsed_ms))
                .block(summary),
        }
    }

    pub(crate) fn print_summary(&self, reason: &str) {
        let Some(snapshot) = self.summary(reason) else {
            return;
        };
        self.print_snapshot(snapshot);
    }

    pub(crate) fn print_summary_now(&self, reason: &str) {
        self.print_snapshot(self.build_summary(reason));
    }

    fn print_snapshot(&self, snapshot: HostRuntimeTelemetrySnapshot) {
        let level = if self.has_failures() {
            log::Level::Warn
        } else {
            log::Level::Info
        };
        snapshot.event.emit(level, targets::HOST_RUNTIME);
    }

    pub(crate) fn should_record(&self) -> bool {
        self.debug_logging_state.is_enabled() || env_flag_is_truthy(HOST_RUNTIME_STATS_ENV)
    }

    fn should_print_summary(&self) -> bool {
        match std::env::var(HOST_RUNTIME_STATS_ENV) {
            Ok(value) => env_flag_value_is_truthy(&value),
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

    pub(crate) fn record_submitted(&self, record_telemetry: bool) {
        if !record_telemetry {
            return;
        }
        self.submitted.fetch_add(1, Ordering::Relaxed);
        let queued = self.queued.fetch_add(1, Ordering::SeqCst) + 1;
        self.peak_queue.fetch_max(queued, Ordering::SeqCst);
    }

    pub(crate) fn record_rejected(&self, record_telemetry: bool, command: &str) {
        if !record_telemetry {
            return;
        }
        self.submitted.fetch_add(1, Ordering::Relaxed);
        self.rejected.fetch_add(1, Ordering::Relaxed);
        self.push_recent(command, "rejected", 0, 0, true);
    }

    pub(crate) fn record_started(&self, record_telemetry: bool, queued_ms: u128) -> usize {
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

    pub(crate) fn record_finished(
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

    pub(crate) fn record_panicked(&self, record_telemetry: bool) {
        if record_telemetry {
            self.panicked.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub(crate) fn record_join_failed(&self, record_telemetry: bool, command: &str) {
        self.decrement_active();
        if record_telemetry {
            self.join_failed.fetch_add(1, Ordering::Relaxed);
            self.failed.fetch_add(1, Ordering::Relaxed);
            self.push_recent(command, "joinFailed", 0, 0, true);
        }
    }

    pub(crate) fn record_writer_failed(&self, record_telemetry: bool, command: &str) {
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

/// Whitelist-style env flag: only an explicit truthy value enables the flag.
/// Intentionally stricter than `support::logging::env_flag_is_enabled`, which
/// is a blacklist-style check for log-filter env vars.
fn env_flag_is_truthy(name: &str) -> bool {
    std::env::var(name).is_ok_and(|value| env_flag_value_is_truthy(&value))
}

fn env_flag_value_is_truthy(value: &str) -> bool {
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
