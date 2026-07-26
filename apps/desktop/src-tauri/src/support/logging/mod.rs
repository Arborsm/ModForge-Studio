pub mod event;
pub mod terminal;

use std::collections::HashMap;
use std::fmt::Display;
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use crate::domain::app_paths::app_logs_dir;
use anyhow::{Context, bail};
use log::{LevelFilter, Metadata, Record, RecordBuilder};
use serde::Deserialize;

pub use event::{LogEvent, targets};
use terminal::{
    LogLine, LogSink, current_log_timestamp, format_log_line, stderr_colorize, stdout_colorize,
};

const LOG_FILE_NAME: &str = "modforge-studio";
const LOG_FILE_SIZE_BYTES: u128 = 1_000_000;
const LOG_FILE_COUNT: usize = 10;
const HOST_PROCESS_TAG: &str = "host";
const SIDECAR_PROCESS_TAG: &str = "sidecar";
const DEV_ASSET_BRIDGE_PROCESS_TAG: &str = "bridge";
const COMMAND_TRACE_ENV: &str = "MODFORGE_COMMAND_TRACE";
const SYSTEM_CERTIFICATE_LOG_TARGET: &str = "rustls_platform_verifier::verification::others";
const REQWEST_CONNECT_LOG_TARGET: &str = "reqwest::connect";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogFileConfig {
    pub directory: PathBuf,
    pub file_name: &'static str,
    pub max_file_size_bytes: u128,
    pub retained_file_count: usize,
}

pub fn log_file_config() -> anyhow::Result<LogFileConfig> {
    Ok(LogFileConfig {
        directory: app_logs_dir()?,
        file_name: LOG_FILE_NAME,
        max_file_size_bytes: LOG_FILE_SIZE_BYTES,
        retained_file_count: LOG_FILE_COUNT,
    })
}

#[derive(Debug, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendLogRequest {
    level: FrontendLogLevel,
    message: String,
    file: Option<String>,
    line: Option<u32>,
    key_values: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize, serde::Serialize)]
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
    command_trace_enabled: Arc<AtomicBool>,
}

impl DebugLoggingState {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            command_trace_enabled: Arc::new(AtomicBool::new(
                std::env::var(COMMAND_TRACE_ENV).is_ok_and(|value| env_flag_is_enabled(&value)),
            )),
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        self.apply_global_level_filter();
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    fn max_level_filter(&self) -> LevelFilter {
        if self.enabled.load(Ordering::Relaxed)
            || self.command_trace_enabled.load(Ordering::Relaxed)
        {
            LevelFilter::Debug
        } else {
            LevelFilter::Info
        }
    }

    fn apply_global_level_filter(&self) {
        log::set_max_level(self.max_level_filter());
    }

    fn level_enabled(&self, metadata: &Metadata<'_>) -> bool {
        match metadata.level() {
            log::Level::Debug | log::Level::Trace if metadata.target() == targets::HOST_RUNTIME => {
                self.command_trace_enabled.load(Ordering::Relaxed)
            }
            log::Level::Debug | log::Level::Trace => self.enabled.load(Ordering::Relaxed),
            _ => true,
        }
    }

    fn should_log_metadata(&self, metadata: &Metadata<'_>) -> bool {
        self.level_enabled(metadata)
    }
}

struct SidecarStderrLogger {
    state: DebugLoggingState,
    terminal_noise: TerminalNoiseState,
}

struct HostLogger {
    state: DebugLoggingState,
    terminal_noise: TerminalNoiseState,
    file: Mutex<HostLogFile>,
}

struct HostLogFile {
    path: PathBuf,
    current_size_bytes: u64,
    file: Option<File>,
    max_file_size_bytes: u64,
    retained_file_count: usize,
}

#[derive(Clone)]
struct TerminalNoiseState {
    system_certificate_log_seen: Arc<AtomicBool>,
}

impl TerminalNoiseState {
    fn new() -> Self {
        Self {
            system_certificate_log_seen: Arc::new(AtomicBool::new(false)),
        }
    }

    fn should_emit(&self, metadata: &Metadata<'_>) -> bool {
        if metadata.level() != log::Level::Debug {
            return true;
        }

        match metadata.target() {
            REQWEST_CONNECT_LOG_TARGET => false,
            SYSTEM_CERTIFICATE_LOG_TARGET => self
                .system_certificate_log_seen
                .compare_exchange(false, true, Ordering::Relaxed, Ordering::Relaxed)
                .is_ok(),
            _ => true,
        }
    }
}

fn env_flag_is_enabled(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    !normalized.is_empty() && !matches!(normalized.as_str(), "0" | "false" | "no" | "off")
}

fn format_record(
    record: &Record<'_>,
    process_tag: Option<&str>,
    sink: LogSink,
    colorize: bool,
) -> String {
    let message = record.args().to_string();
    format_log_line(
        LogLine {
            timestamp: &current_log_timestamp(),
            process_tag,
            level: record.level(),
            target: record.target(),
            message: &message,
        },
        sink,
        colorize,
    )
}

pub fn write_fallback_terminal_log(
    process_tag: &str,
    level: log::Level,
    target: &str,
    message: impl AsRef<str>,
) {
    eprintln!(
        "{}",
        format_log_line(
            LogLine {
                timestamp: &current_log_timestamp(),
                process_tag: Some(process_tag),
                level,
                target,
                message: message.as_ref(),
            },
            LogSink::Terminal,
            stderr_colorize(),
        )
    );
}

pub fn write_sidecar_fallback_log(level: log::Level, target: &str, message: impl AsRef<str>) {
    write_fallback_terminal_log(SIDECAR_PROCESS_TAG, level, target, message);
}

pub fn write_dev_asset_bridge_log(level: log::Level, target: &str, message: impl AsRef<str>) {
    write_fallback_terminal_log(DEV_ASSET_BRIDGE_PROCESS_TAG, level, target, message);
}

impl log::Log for SidecarStderrLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        self.state.level_enabled(metadata)
    }

    fn log(&self, record: &Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }

        if !self.terminal_noise.should_emit(record.metadata()) {
            return;
        }

        // Electron already prefixes sidecar stderr, so no process tag here.
        eprintln!(
            "{}",
            format_record(record, None, LogSink::Terminal, stderr_colorize())
        );
    }

    fn flush(&self) {}
}

impl HostLogFile {
    fn new(config: LogFileConfig) -> anyhow::Result<Self> {
        fs::create_dir_all(&config.directory).with_context(|| {
            format!(
                "Failed to create log directory {}",
                config.directory.display()
            )
        })?;

        let path = host_log_path(&config.directory, config.file_name);
        let file = open_host_log_file(&path)?;
        let current_size_bytes = file.metadata().map(|metadata| metadata.len()).unwrap_or(0);

        Ok(Self {
            path,
            current_size_bytes,
            file: Some(file),
            max_file_size_bytes: config.max_file_size_bytes.min(u64::MAX as u128) as u64,
            retained_file_count: config.retained_file_count.max(1),
        })
    }

    fn write_line(&mut self, line: &str) -> anyhow::Result<()> {
        use std::io::Write;

        let line_size = line.len() as u64 + 1;
        if self.current_size_bytes.saturating_add(line_size) > self.max_file_size_bytes {
            self.rotate()?;
        }

        let Some(file) = self.file.as_mut() else {
            bail!("Host log file is not open.");
        };

        file.write_all(line.as_bytes())
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.flush())
            .with_context(|| format!("Failed to write host log {}", self.path.display()))?;
        self.current_size_bytes = self.current_size_bytes.saturating_add(line_size);
        Ok(())
    }

    fn rotate(&mut self) -> anyhow::Result<()> {
        self.file.take();

        for index in (1..=self.retained_file_count).rev() {
            let source = rotated_host_log_path(&self.path, index);
            if !source.exists() {
                continue;
            }

            if index == self.retained_file_count {
                fs::remove_file(&source).with_context(|| {
                    format!("Failed to remove old host log {}", source.display())
                })?;
            } else {
                let target = rotated_host_log_path(&self.path, index + 1);
                fs::rename(&source, &target).with_context(|| {
                    format!(
                        "Failed to rotate host log {} to {}",
                        source.display(),
                        target.display()
                    )
                })?;
            }
        }

        if self.path.exists() {
            fs::rename(&self.path, rotated_host_log_path(&self.path, 1))
                .with_context(|| format!("Failed to rotate host log {}", self.path.display()))?;
        }

        self.file = Some(open_host_log_file(&self.path)?);
        self.current_size_bytes = 0;
        Ok(())
    }
}

impl log::Log for HostLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        self.state.should_log_metadata(metadata)
    }

    fn log(&self, record: &Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }

        if self.terminal_noise.should_emit(record.metadata()) {
            // The host owns the terminal, so its own lines need no process tag.
            println!(
                "{}",
                format_record(record, None, LogSink::Terminal, stdout_colorize())
            );
        }

        let file_line = format_record(record, Some(HOST_PROCESS_TAG), LogSink::File, false);
        if let Ok(mut file) = self.file.lock() {
            for line in file_line.lines() {
                if let Err(error) = file.write_line(line) {
                    eprintln!("{error}");
                    break;
                }
            }
        }
    }

    fn flush(&self) {}
}

fn host_log_path(directory: &Path, file_name: &str) -> PathBuf {
    directory.join(format!("{file_name}.log"))
}

fn rotated_host_log_path(path: &Path, index: usize) -> PathBuf {
    let file_stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("modforge-studio");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("log");
    path.with_file_name(format!("{file_stem}.{index}.{extension}"))
}

fn open_host_log_file(path: &Path) -> anyhow::Result<File> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("Failed to open host log {}", path.display()))
}

pub fn init_sidecar_logging(state: &DebugLoggingState) -> Result<(), log::SetLoggerError> {
    log::set_boxed_logger(Box::new(SidecarStderrLogger {
        state: state.clone(),
        terminal_noise: TerminalNoiseState::new(),
    }))?;
    state.apply_global_level_filter();
    Ok(())
}

pub fn init_host_logging(state: &DebugLoggingState) -> anyhow::Result<()> {
    log::set_boxed_logger(Box::new(HostLogger {
        state: state.clone(),
        terminal_noise: TerminalNoiseState::new(),
        file: Mutex::new(HostLogFile::new(log_file_config()?)?),
    }))
    .context("Failed to install ModForge host logger")?;
    state.apply_global_level_filter();
    Ok(())
}

fn format_tauri_command_error(command_name: &str, error_message: &str) -> String {
    LogEvent::new("tauriCommand.failed")
        .field("command", command_name)
        .error(error_message)
        .render()
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
            log::error!(target: targets::TAURI_COMMAND, "{message}");
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
        log::error!(target: targets::TAURI_COMMAND, "{message}");
    })
}

pub fn write_frontend_log(request: FrontendLogRequest) {
    let mut builder = RecordBuilder::new();
    builder
        .level(request.level.as_log_level())
        .target(targets::WEBVIEW)
        .file(request.file.as_deref())
        .line(request.line);

    let key_values = request.key_values.unwrap_or_default();
    let message = format_frontend_log_message(&request.message, &key_values);
    log::logger().log(&builder.args(format_args!("{message}")).build());
    log::logger().flush();
}

fn format_frontend_log_message(message: &str, key_values: &HashMap<String, String>) -> String {
    let mut entries = key_values
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    entries.sort_by_key(|(key, _)| *key);

    let mut event = LogEvent::new(message);
    for (key, value) in entries {
        event = event.field(key, value);
    }

    event.render()
}

pub fn set_debug_logging_enabled(state: &DebugLoggingState, enabled: bool) {
    if !apply_debug_logging_toggle(state, enabled) {
        return;
    }

    LogEvent::new("backendLog.debugLogging")
        .flag("enabled", enabled)
        .emit_info(targets::BACKEND_LOG);
}

/// Applies the toggle and reports whether it actually changed.
///
/// The frontend re-syncs this on every shell mount and settings load, so a
/// no-op sync must not produce a line.
fn apply_debug_logging_toggle(state: &DebugLoggingState, enabled: bool) -> bool {
    if state.is_enabled() == enabled {
        return false;
    }

    state.set_enabled(enabled);
    true
}

#[cfg(test)]
#[path = "../../tests/unit/support/logging_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "../../tests/unit/support/log_call_site_tests.rs"]
mod call_site_tests;
