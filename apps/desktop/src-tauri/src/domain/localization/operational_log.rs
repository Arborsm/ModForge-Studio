use std::fmt::Display;

pub const TRANSLATION: &str = "LocalizationTranslation";
pub const KNOWLEDGE: &str = "LocalizationKnowledge";
pub const SEMANTIC: &str = "LocalizationSemantic";
pub const REVIEW: &str = "LocalizationReview";
pub const MACHINE_TRANSLATION: &str = "LocalizationMachineTranslation";

#[derive(Debug, Default)]
pub struct Fields {
    event: &'static str,
    values: Vec<(&'static str, String)>,
}

impl Fields {
    pub fn new(event: &'static str) -> Self {
        Self {
            event,
            values: Vec::new(),
        }
    }

    pub fn field(mut self, key: &'static str, value: impl Display) -> Self {
        self.values.push((key, value.to_string()));
        self
    }

    pub fn optional(mut self, key: &'static str, value: Option<&str>) -> Self {
        if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
            self.values.push((key, value.to_string()));
        }
        self
    }

    pub fn optional_owned(mut self, key: &'static str, value: Option<String>) -> Self {
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            self.values.push((key, value));
        }
        self
    }
}

fn quote(value: &str) -> String {
    let escaped = value
        .chars()
        .flat_map(|character| character.escape_default())
        .collect::<String>();
    format!("\"{escaped}\"")
}

impl std::fmt::Display for Fields {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "event={}", quote(self.event))?;
        for (key, value) in &self.values {
            write!(formatter, " {key}={}", quote(value))?;
        }
        Ok(())
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
