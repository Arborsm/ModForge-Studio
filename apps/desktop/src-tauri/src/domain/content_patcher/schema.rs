use crate::infrastructure::game_formats::json_relaxed;
use serde_json::Value;
use std::path::Path;

pub(crate) fn parse_json_file(path: &Path) -> anyhow::Result<(String, Value)> {
    json_relaxed::read_json_file_labeled(path)
}

pub(crate) fn coerce_number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }
}

pub(crate) fn coerce_u32(value: &Value) -> Option<u32> {
    let numeric = coerce_number(value)?;
    if !numeric.is_finite() || numeric < 0.0 || numeric.fract() != 0.0 || numeric > u32::MAX as f64
    {
        return None;
    }

    Some(numeric as u32)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/content_patcher/schema_tests.rs"]
mod tests;
