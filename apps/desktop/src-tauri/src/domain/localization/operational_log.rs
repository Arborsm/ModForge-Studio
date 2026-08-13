use crate::support::logging::{LogEvent, targets};

pub const TRANSLATION: &str = targets::LOCALIZATION_TRANSLATION;
pub const KNOWLEDGE: &str = targets::LOCALIZATION_KNOWLEDGE;
pub const CORPUS: &str = targets::LOCALIZATION_CORPUS;
pub const SEMANTIC: &str = targets::LOCALIZATION_SEMANTIC;
pub const REVIEW: &str = targets::LOCALIZATION_REVIEW;
pub const MACHINE_TRANSLATION: &str = targets::LOCALIZATION_MACHINE_TRANSLATION;

/// Starts a localization operational log event such as `translation.started`.
pub fn event(name: &str) -> LogEvent {
    LogEvent::new(name)
}

/// Emits a provider attempt: routine at debug, a failed one at warn so it
/// survives the default log level.
pub fn emit_attempt(attempt: LogEvent, succeeded: bool, target: &str) {
    if succeeded {
        attempt.emit_debug(target);
    } else {
        attempt.emit_warn(target);
    }
}

pub fn failure_category(error: &anyhow::Error) -> &'static str {
    let message = error.to_string().to_ascii_lowercase();
    if message.contains("cancel") {
        "cancelled"
    } else if message.contains("rate") && message.contains("limit") {
        "rate-limit"
    } else if message.contains("network")
        || message.contains("connect")
        || message.contains("timeout")
    {
        "network"
    } else if message.contains("parse") || message.contains("json") || message.contains("response")
    {
        "parse"
    } else if message.contains("sqlite")
        || message.contains("database")
        || message.contains("write")
    {
        "storage"
    } else if message.contains("provider") || message.contains("http") {
        "provider"
    } else {
        "validation"
    }
}

pub fn stable_failure_category(value: Option<&str>) -> Option<&'static str> {
    value.map(|value| match value {
        "cancelled" => "cancelled",
        "network" => "network",
        "rate-limit" => "rate-limit",
        "parse" => "parse",
        "storage" => "storage",
        "usage-ledger" => "usage-ledger",
        "provider" | "authentication" => "provider",
        _ => "validation",
    })
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_operational_log_tests.rs"]
mod tests;
