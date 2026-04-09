use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use tauri::{plugin::TauriPlugin, Runtime, State};
use tauri_plugin_log::{log::LevelFilter, RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_FILE_NAME: &str = "modforge-studio";
const LOG_FILE_SIZE_BYTES: u128 = 1_000_000;
const LOG_FILE_COUNT: usize = 10;

#[derive(Clone)]
pub struct DebugLoggingState {
    enabled: Arc<AtomicBool>,
}

impl DebugLoggingState {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        log::set_max_level(if enabled {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        });
    }

    fn filter_enabled(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.enabled)
    }
}

pub fn build_logging_plugin<R: Runtime>(state: DebugLoggingState) -> TauriPlugin<R> {
    let filter_state = state.filter_enabled();

    tauri_plugin_log::Builder::default()
        .clear_targets()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::LogDir {
                file_name: Some(LOG_FILE_NAME.into()),
            }),
        ])
        .level(LevelFilter::Debug)
        .filter(move |metadata| match metadata.level() {
            log::Level::Debug | log::Level::Trace => filter_state.load(Ordering::Relaxed),
            _ => true,
        })
        .rotation_strategy(RotationStrategy::KeepSome(LOG_FILE_COUNT))
        .max_file_size(LOG_FILE_SIZE_BYTES)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

#[tauri::command]
pub fn set_debug_logging_enabled(state: State<'_, DebugLoggingState>, enabled: bool) {
    state.set_enabled(enabled);

    log::info!(
        "Backend debug logging {}",
        if enabled { "enabled" } else { "disabled" }
    );
}
