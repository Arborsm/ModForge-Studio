use std::collections::HashMap;
use std::fmt::Display;
use std::fs::{self, File, OpenOptions};
use std::io::{IsTerminal, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};

use crate::domain::app_paths::app_logs_dir;
use log::{LevelFilter, Metadata, Record, RecordBuilder};
use owo_colors::OwoColorize;
use serde::Deserialize;
use sheen::{Formatter as _, Level as SheenLevel};

const LOG_FILE_NAME: &str = "modforge-studio";
const LOG_FILE_SIZE_BYTES: u128 = 1_000_000;
const LOG_FILE_COUNT: usize = 10;
const HOST_LOG_PREFIX: &str = "modforge-host";
const SIDECAR_LOG_PREFIX: &str = "modforge-sidecar";
const DEV_ASSET_BRIDGE_LOG_PREFIX: &str = "modforge-dev-asset-bridge";
const LOG_COLOR_ENV: &str = "MODFORGE_LOG_COLOR";
const COMMAND_TRACE_ENV: &str = "MODFORGE_COMMAND_TRACE";
const FRONTEND_LOG_TARGET: &str = "Webview";
const COMMAND_LOG_TARGET: &str = "Tauri Command";
const HOST_RUNTIME_LOG_TARGET: &str = "HostRuntime";
const SYSTEM_CERTIFICATE_LOG_TARGET: &str = "rustls_platform_verifier::verification::others";
const REQWEST_CONNECT_LOG_TARGET: &str = "reqwest::connect";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogFileConfig {
    pub directory: PathBuf,
    pub file_name: &'static str,
    pub max_file_size_bytes: u128,
    pub retained_file_count: usize,
}

pub fn log_file_config() -> Result<LogFileConfig, String> {
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
            log::Level::Debug | log::Level::Trace
                if metadata.target() == HOST_RUNTIME_LOG_TARGET =>
            {
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

struct LayeredTerminalFormatter {
    colorize: bool,
}

impl sheen::Formatter for LayeredTerminalFormatter {
    fn format(
        &self,
        level: SheenLevel,
        message: &str,
        timestamp: Option<&str>,
        prefix: Option<&str>,
        fields: &[(String, String)],
        extra: &[(&str, &dyn std::fmt::Debug)],
    ) -> String {
        let target = fields
            .iter()
            .find_map(|(key, value)| (key == "target").then_some(value.as_str()))
            .unwrap_or("unknown");

        let mut segments = Vec::new();

        if let Some(timestamp) = timestamp {
            segments.push(style_secondary(timestamp, self.colorize));
        }

        if let Some(prefix) = prefix {
            segments.push(style_process_prefix(prefix, self.colorize));
        }

        segments.push(style_level(level, self.colorize));
        segments.push(style_target(target, self.colorize));
        segments.push(style_message(message, self.colorize));

        for (key, value) in fields.iter().filter(|(key, _)| key != "target") {
            segments.push(style_key_value(key, value, self.colorize));
        }

        for (key, value) in extra {
            segments.push(style_key_value(key, &format!("{value:?}"), self.colorize));
        }

        segments.join(" ")
    }
}

fn style_secondary(value: &str, colorize: bool) -> String {
    if colorize {
        value.dimmed().to_string()
    } else {
        value.to_string()
    }
}

fn style_process_prefix(value: &str, colorize: bool) -> String {
    if colorize {
        value.bright_black().to_string()
    } else {
        value.to_string()
    }
}

fn style_level(level: SheenLevel, colorize: bool) -> String {
    let label = level.as_str().to_string();
    if !colorize {
        return label;
    }

    match level {
        SheenLevel::Trace => label.dimmed().to_string(),
        SheenLevel::Debug => label.magenta().to_string(),
        SheenLevel::Info => label.cyan().to_string(),
        SheenLevel::Warn => label.yellow().to_string(),
        SheenLevel::Error => label.red().to_string(),
    }
}

fn style_target(value: &str, colorize: bool) -> String {
    if colorize {
        value.bright_blue().to_string()
    } else {
        value.to_string()
    }
}

fn style_message(message: &str, colorize: bool) -> String {
    message
        .split_whitespace()
        .map(|segment| style_message_segment(segment, colorize))
        .collect::<Vec<_>>()
        .join(" ")
}

fn style_message_segment(segment: &str, colorize: bool) -> String {
    if let Some((key, value)) = segment.split_once('=')
        && is_log_key(key)
        && !value.is_empty()
    {
        return style_key_value(key, value, colorize);
    }

    if looks_like_path_url_or_host(segment) {
        if colorize {
            return segment.bright_cyan().to_string();
        }

        return segment.to_string();
    }

    segment.to_string()
}

fn style_key_value(key: &str, value: &str, colorize: bool) -> String {
    if colorize {
        format!("{}={}", key.dimmed(), value.green())
    } else {
        format!("{key}={value}")
    }
}

fn is_log_key(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
}

fn looks_like_path_url_or_host(value: &str) -> bool {
    let trimmed = value.trim_matches(|character: char| {
        matches!(
            character,
            '"' | '\'' | ')' | '(' | '[' | ']' | '{' | '}' | ',' | ';'
        )
    });

    trimmed.starts_with('/')
        || trimmed.starts_with("~/")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.contains('\\')
        || (trimmed.contains('.') && !trimmed.contains('='))
}

fn current_log_timestamp() -> String {
    let now = time::OffsetDateTime::now_local().unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    format!("{:02}:{:02}:{:02}", now.hour(), now.minute(), now.second())
}

fn env_flag_is_enabled(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    !normalized.is_empty() && !matches!(normalized.as_str(), "0" | "false" | "no" | "off")
}

fn env_flag_is_disabled(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "0" | "false" | "no" | "off" | "never"
    )
}

fn should_colorize_terminal_output(is_terminal: bool) -> bool {
    if let Ok(value) = std::env::var(LOG_COLOR_ENV) {
        return match value.trim().to_ascii_lowercase().as_str() {
            "always" | "force" | "1" | "true" | "yes" | "on" => true,
            "never" | "0" | "false" | "no" | "off" => false,
            _ => is_terminal,
        };
    }

    if std::env::var_os("NO_COLOR").is_some() {
        return false;
    }

    if std::env::var("FORCE_COLOR").is_ok_and(|value| env_flag_is_enabled(&value)) {
        return true;
    }

    if std::env::var("CLICOLOR_FORCE").is_ok_and(|value| env_flag_is_enabled(&value)) {
        return true;
    }

    if std::env::var("CLICOLOR").is_ok_and(|value| env_flag_is_disabled(&value)) {
        return false;
    }

    is_terminal
}

fn format_layered_terminal_log_line(
    timestamp: &str,
    process_prefix: Option<&str>,
    level: log::Level,
    target: &str,
    message: &str,
    colorize: bool,
) -> String {
    let formatter = LayeredTerminalFormatter { colorize };
    let fields = [("target".to_string(), target.to_string())];

    formatter.format(
        level.into(),
        message,
        Some(timestamp),
        process_prefix,
        &fields,
        &[],
    )
}

fn format_record_for_terminal(
    record: &Record<'_>,
    process_prefix: Option<&str>,
    colorize: bool,
) -> String {
    format_layered_terminal_log_line(
        &current_log_timestamp(),
        process_prefix,
        record.level(),
        record.target(),
        &record.args().to_string(),
        colorize,
    )
}

pub fn write_fallback_terminal_log(
    process_prefix: &str,
    level: log::Level,
    target: &str,
    message: impl AsRef<str>,
) {
    eprintln!(
        "{}",
        format_layered_terminal_log_line(
            &current_log_timestamp(),
            Some(process_prefix),
            level,
            target,
            message.as_ref(),
            should_colorize_terminal_output(std::io::stderr().is_terminal()),
        )
    );
}

pub fn write_sidecar_fallback_log(level: log::Level, target: &str, message: impl AsRef<str>) {
    write_fallback_terminal_log(SIDECAR_LOG_PREFIX, level, target, message);
}

pub fn write_dev_asset_bridge_log(level: log::Level, target: &str, message: impl AsRef<str>) {
    write_fallback_terminal_log(DEV_ASSET_BRIDGE_LOG_PREFIX, level, target, message);
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

        eprintln!(
            "{}",
            format_record_for_terminal(
                record,
                None,
                should_colorize_terminal_output(std::io::stderr().is_terminal())
            )
        );
    }

    fn flush(&self) {}
}

impl HostLogFile {
    fn new(config: LogFileConfig) -> Result<Self, String> {
        fs::create_dir_all(&config.directory).map_err(|error| {
            format!(
                "Failed to create log directory {}: {error}",
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

    fn write_line(&mut self, line: &str) -> Result<(), String> {
        let line_size = line.len() as u64 + 1;
        if self.current_size_bytes.saturating_add(line_size) > self.max_file_size_bytes {
            self.rotate()?;
        }

        let Some(file) = self.file.as_mut() else {
            return Err("Host log file is not open.".to_string());
        };

        file.write_all(line.as_bytes())
            .and_then(|_| file.write_all(b"\n"))
            .and_then(|_| file.flush())
            .map_err(|error| {
                format!("Failed to write host log {}: {error}", self.path.display())
            })?;
        self.current_size_bytes = self.current_size_bytes.saturating_add(line_size);
        Ok(())
    }

    fn rotate(&mut self) -> Result<(), String> {
        self.file.take();

        for index in (1..=self.retained_file_count).rev() {
            let source = rotated_host_log_path(&self.path, index);
            if !source.exists() {
                continue;
            }

            if index == self.retained_file_count {
                fs::remove_file(&source).map_err(|error| {
                    format!(
                        "Failed to remove old host log {}: {error}",
                        source.display()
                    )
                })?;
            } else {
                let target = rotated_host_log_path(&self.path, index + 1);
                fs::rename(&source, &target).map_err(|error| {
                    format!(
                        "Failed to rotate host log {} to {}: {error}",
                        source.display(),
                        target.display()
                    )
                })?;
            }
        }

        if self.path.exists() {
            fs::rename(&self.path, rotated_host_log_path(&self.path, 1)).map_err(|error| {
                format!("Failed to rotate host log {}: {error}", self.path.display())
            })?;
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
            println!(
                "{}",
                format_record_for_terminal(
                    record,
                    Some(HOST_LOG_PREFIX),
                    should_colorize_terminal_output(std::io::stdout().is_terminal())
                )
            );
        }

        let file_line = format_record_for_terminal(record, Some(HOST_LOG_PREFIX), false);
        if let Ok(mut file) = self.file.lock() {
            if let Err(error) = file.write_line(&file_line) {
                eprintln!("{error}");
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

fn open_host_log_file(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Failed to open host log {}: {error}", path.display()))
}

pub fn init_sidecar_logging(state: &DebugLoggingState) -> Result<(), log::SetLoggerError> {
    log::set_boxed_logger(Box::new(SidecarStderrLogger {
        state: state.clone(),
        terminal_noise: TerminalNoiseState::new(),
    }))?;
    state.apply_global_level_filter();
    Ok(())
}

pub fn init_host_logging(state: &DebugLoggingState) -> Result<(), String> {
    log::set_boxed_logger(Box::new(HostLogger {
        state: state.clone(),
        terminal_noise: TerminalNoiseState::new(),
        file: Mutex::new(HostLogFile::new(log_file_config()?)?),
    }))
    .map_err(|error| format!("Failed to install ModForge host logger: {error}"))?;
    state.apply_global_level_filter();
    Ok(())
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
    let message = format_frontend_log_message(&request.message, &key_values);
    log::logger().log(&builder.args(format_args!("{message}")).build());
    log::logger().flush();
}

fn format_frontend_log_message(message: &str, key_values: &HashMap<String, String>) -> String {
    if key_values.is_empty() {
        return message.to_string();
    }

    let mut entries = key_values
        .iter()
        .map(|(key, value)| (key.as_str(), value.as_str()))
        .collect::<Vec<_>>();
    entries.sort_by_key(|(key, _)| *key);

    let metadata = entries
        .into_iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(" ");

    format!("{message} {metadata}")
}

pub fn set_debug_logging_enabled(state: &DebugLoggingState, enabled: bool) {
    state.set_enabled(enabled);

    log::info!(
        target: "Backend Log",
        "Backend debug logging {}",
        if enabled { "enabled" } else { "disabled" }
    );
}

#[cfg(test)]
#[path = "../tests/unit/support/logging_tests.rs"]
mod tests;
