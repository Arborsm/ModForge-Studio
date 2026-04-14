use serde_json::{Map, Value};

pub(crate) fn parse_target_values(patch: &Map<String, Value>) -> Vec<String> {
    let mut targets = match patch.get("Target") {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    if targets.is_empty() {
        targets.push(String::new());
    }

    targets
}

pub(crate) fn parse_from_file_values(patch: &Map<String, Value>) -> Vec<Option<String>> {
    let from_files = match patch.get("FromFile") {
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![Some(trimmed.to_string())]
            }
        }
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| Some(value.to_string()))
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    if from_files.is_empty() {
        vec![None]
    } else {
        from_files
    }
}

#[cfg(test)]
#[path = "tests/patch_fields_tests.rs"]
mod tests;
