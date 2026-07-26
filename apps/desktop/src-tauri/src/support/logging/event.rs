use std::fmt::{self, Debug, Display};
use std::path::Path;
use std::time::Duration;

use crate::infrastructure::fs::pathing::normalize_path;

/// Stable log targets. Terminal and file output render these verbatim, so the
/// dotted hierarchy is the only place target naming is decided.
pub mod targets {
    pub const APP_UI: &str = "AppUi";
    pub const ASSETS: &str = "Assets";
    pub const BACKEND_LOG: &str = "BackendLog";
    pub const CLEANUP: &str = "Cleanup";
    pub const SIDECAR: &str = "Sidecar";
    pub const DEV_ASSET_BRIDGE: &str = "DevAssetBridge";
    pub const HOST_RUNTIME: &str = "HostRuntime";
    pub const LAUNCHER: &str = "Launcher";
    pub const LAUNCHER_DOWNLOADS: &str = "Launcher.Downloads";
    pub const LAUNCHER_GMCM_PROBE: &str = "Launcher.GmcmProbe";
    pub const LAUNCHER_MOD_CONFIG: &str = "Launcher.ModConfig";
    pub const LAUNCHER_SETTINGS: &str = "Launcher.Settings";
    pub const LAUNCHER_TRACE: &str = "Launcher.Trace";
    pub const LOCALIZATION_KNOWLEDGE: &str = "Localization.Knowledge";
    pub const LOCALIZATION_MACHINE_TRANSLATION: &str = "Localization.MachineTranslation";
    pub const LOCALIZATION_REVIEW: &str = "Localization.Review";
    pub const LOCALIZATION_SEMANTIC: &str = "Localization.Semantic";
    pub const LOCALIZATION_TRANSLATION: &str = "Localization.Translation";
    pub const NEXUS: &str = "Nexus";
    pub const TAURI_COMMAND: &str = "TauriCommand";
    pub const TEXT_ENCODING: &str = "TextEncoding";
    pub const WEBVIEW: &str = "Webview";
}

/// Structured log line builder: `<event.name> key=value key=value`.
///
/// This is the only supported way to build a backend log message, so quoting,
/// escaping, field ordering and optional-value handling stay in one place.
#[derive(Debug, Clone, Default)]
pub struct LogEvent {
    name: String,
    fields: Vec<(String, String)>,
    block: Vec<String>,
}

impl LogEvent {
    /// Starts an event named with a dotted, camelCase path such as
    /// `launcher.install.start`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            fields: Vec::new(),
            block: Vec::new(),
        }
    }

    /// Adds a `Display` value. Re-using a key overwrites it in place.
    pub fn field(mut self, key: &str, value: impl Display) -> Self {
        self.set(key, value.to_string());
        self
    }

    /// Adds a `Debug`-rendered value, for enums and other opaque diagnostics.
    pub fn debug(mut self, key: &str, value: impl Debug) -> Self {
        self.set(key, format!("{value:?}"));
        self
    }

    /// Adds a boolean flag.
    pub fn flag(mut self, key: &str, value: bool) -> Self {
        self.set(key, value.to_string());
        self
    }

    /// Adds a countable quantity.
    pub fn count(mut self, key: &str, value: usize) -> Self {
        self.set(key, value.to_string());
        self
    }

    /// Adds a filesystem path normalized the same way command results are.
    pub fn path(mut self, key: &str, value: impl AsRef<Path>) -> Self {
        self.set(key, normalize_path(value.as_ref()));
        self
    }

    /// Adds a value only when it is present and not blank.
    pub fn optional(mut self, key: &str, value: Option<impl Display>) -> Self {
        if let Some(value) = value.map(|value| value.to_string())
            && !value.trim().is_empty()
        {
            self.set(key, value);
        }
        self
    }

    /// Adds a normalized path only when it is present.
    pub fn optional_path(mut self, key: &str, value: Option<impl AsRef<Path>>) -> Self {
        if let Some(value) = value {
            self.set(key, normalize_path(value.as_ref()));
        }
        self
    }

    /// Adds a duration as whole milliseconds.
    pub fn ms(mut self, key: &str, value: Duration) -> Self {
        self.set(key, value.as_millis().to_string());
        self
    }

    /// Adds the conventional `error` field.
    pub fn error(mut self, error: impl Display) -> Self {
        self.set("error", error.to_string());
        self
    }

    /// Attaches a multi-line body rendered under the event line. The terminal
    /// indents continuation lines; the log file repeats the line prefix.
    pub fn block(mut self, body: impl Display) -> Self {
        self.block.extend(
            body.to_string()
                .trim_end()
                .lines()
                .map(|line| line.trim_end().to_string()),
        );
        self
    }

    /// Renders the event and its fields, with any block body on later lines.
    pub fn render(&self) -> String {
        let mut rendered = self.name.clone();
        for (key, value) in &self.fields {
            if !rendered.is_empty() {
                rendered.push(' ');
            }
            rendered.push_str(key);
            rendered.push('=');
            rendered.push_str(&format_field_value(value));
        }

        for line in &self.block {
            rendered.push('\n');
            rendered.push_str(line);
        }

        rendered
    }

    /// Emits the event at an explicit level.
    pub fn emit(self, level: log::Level, target: &str) {
        let message = self.render();
        log::log!(target: target, level, "{message}");
    }

    pub fn emit_debug(self, target: &str) {
        self.emit(log::Level::Debug, target);
    }

    pub fn emit_info(self, target: &str) {
        self.emit(log::Level::Info, target);
    }

    pub fn emit_warn(self, target: &str) {
        self.emit(log::Level::Warn, target);
    }

    pub fn emit_error(self, target: &str) {
        self.emit(log::Level::Error, target);
    }

    fn set(&mut self, key: &str, value: String) {
        match self.fields.iter_mut().find(|(existing, _)| existing == key) {
            Some((_, existing)) => *existing = value,
            None => self.fields.push((key.to_string(), value)),
        }
    }
}

impl Display for LogEvent {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.render())
    }
}

/// Quotes a field value only when it would otherwise break `key=value` parsing.
pub fn format_field_value(value: &str) -> String {
    if value.is_empty() {
        return "\"\"".to_string();
    }

    if !value
        .chars()
        .any(|character| character.is_whitespace() || matches!(character, '"' | '='))
    {
        return value.to_string();
    }

    let mut quoted = String::with_capacity(value.len() + 2);
    quoted.push('"');
    for character in value.chars() {
        match character {
            '"' => quoted.push_str("\\\""),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            // Backslashes stay literal so Windows paths keep reading as paths.
            _ => quoted.push(character),
        }
    }
    quoted.push('"');
    quoted
}

/// True for tokens that can be read back as a structured `key=value` key.
pub fn is_field_key(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
}

/// True for the dotted camelCase event name that opens a structured log line.
pub fn is_event_name(value: &str) -> bool {
    value.contains('.')
        && !value.ends_with('.')
        && value.split('.').all(|segment| {
            !segment.is_empty()
                && segment.starts_with(|character: char| character.is_ascii_lowercase())
                && segment
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '-')
        })
}

#[cfg(test)]
#[path = "../../tests/unit/support/log_event_tests.rs"]
mod tests;
