use std::collections::HashMap;
use std::fmt::Display;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use log::RecordBuilder;
use serde::Deserialize;
use tauri::{plugin::TauriPlugin, Runtime};
use tauri_plugin_log::{log::LevelFilter, RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_FILE_NAME: &str = "modforge-studio";
const LOG_FILE_SIZE_BYTES: u128 = 1_000_000;
const LOG_FILE_COUNT: usize = 10;
const FRONTEND_LOG_TARGET: &str = "webview";
const COMMAND_LOG_TARGET: &str = "tauri_command";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogRequest {
    level: FrontendLogLevel,
    message: String,
    file: Option<String>,
    line: Option<u32>,
    key_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FrontendLogLevel {
    Debug,
    Info,
    Warning,
    Error,
}

impl FrontendLogLevel {
    fn as_log_level(&self) -> log::Level {
        match self {
            Self::Debug => log::Level::Debug,
            Self::Info => log::Level::Info,
            Self::Warning => log::Level::Warn,
            Self::Error => log::Level::Error,
        }
    }
}

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

fn format_tauri_command_error(command_name: &str, error_message: &str) -> String {
    format!("Tauri command `{command_name}` failed: {error_message}")
}

fn log_tauri_command_error_with<T, E, DescribeError, LogError>(
    command_name: &str,
    result: Result<T, E>,
    describe_error: DescribeError,
    log_error: LogError,
) -> Result<T, E>
where
    DescribeError: FnOnce(&E) -> String,
    LogError: FnOnce(String),
{
    if let Err(error) = &result {
        log_error(format_tauri_command_error(
            command_name,
            &describe_error(error),
        ));
    }

    result
}

pub fn log_tauri_command_error<T, E>(command_name: &str, result: Result<T, E>) -> Result<T, E>
where
    E: Display,
{
    log_tauri_command_error_with(
        command_name,
        result,
        |error| error.to_string(),
        |message| {
            log::error!(target: COMMAND_LOG_TARGET, "{message}");
        },
    )
}

pub fn log_tauri_command_error_with_message<T, E, F>(
    command_name: &str,
    result: Result<T, E>,
    describe_error: F,
) -> Result<T, E>
where
    F: FnOnce(&E) -> String,
{
    log_tauri_command_error_with(command_name, result, describe_error, |message| {
        log::error!(target: COMMAND_LOG_TARGET, "{message}");
    })
}

pub fn write_frontend_log(request: FrontendLogRequest) {
    let mut builder = RecordBuilder::new();
    builder
        .level(request.level.as_log_level())
        .target(FRONTEND_LOG_TARGET)
        .file(request.file.as_deref())
        .line(request.line);

    let key_values = request.key_values.unwrap_or_default();
    let mut kv = HashMap::new();
    for (key, value) in key_values.iter() {
        kv.insert(key.as_str(), value.as_str());
    }
    builder.key_values(&kv);

    let message = request.message;
    log::logger().log(&builder.args(format_args!("{message}")).build());
    log::logger().flush();
}

pub fn set_debug_logging_enabled(state: &DebugLoggingState, enabled: bool) {
    state.set_enabled(enabled);

    log::info!(
        "Backend debug logging {}",
        if enabled { "enabled" } else { "disabled" }
    );
}


#[cfg(test)]
#[path = "tests/logging_tests.rs"]
mod tests;
