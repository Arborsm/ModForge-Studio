use super::context::SimulationContext;
use super::tokens::{parse_condition_token, ConditionModifier, INVALID_WHEN_TOKEN};
use super::types::ContentPatcherPatchStatus;
use serde_json::Value;
use std::path::{Path, PathBuf};

fn normalize_str(value: &str) -> &str {
    value.trim()
}

fn value_to_scalar_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn value_to_scalar_strings(value: &Value) -> Result<Vec<String>, String> {
    match value {
        Value::Array(values) => {
            let scalars = values
                .iter()
                .map(|entry| {
                    value_to_scalar_string(entry)
                        .ok_or_else(|| "has an unsupported non-scalar array value".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            if scalars.is_empty() {
                return Err("has an unsupported empty array value".to_string());
            }
            Ok(scalars)
        }
        _ => value_to_scalar_string(value)
            .map(|scalar| vec![scalar])
            .ok_or_else(|| "has an unsupported value type".to_string()),
    }
}

fn value_matches_expected(expected: &Value, actual: &Value) -> Result<bool, String> {
    let expected_values = value_to_scalar_strings(expected)?;
    let actual_values = value_to_scalar_strings(actual)?;

    Ok(actual_values.iter().any(|actual| {
        expected_values
            .iter()
            .any(|expected| expected.eq_ignore_ascii_case(normalize_str(actual)))
    }))
}

fn value_to_bool(value: &Value) -> Result<bool, String> {
    match value {
        Value::Bool(flag) => Ok(*flag),
        Value::String(text) => {
            let normalized = text.trim();
            if normalized.eq_ignore_ascii_case("true") {
                Ok(true)
            } else if normalized.eq_ignore_ascii_case("false") {
                Ok(false)
            } else {
                Err("has an unsupported non-boolean string value".to_string())
            }
        }
        _ => Err("has an unsupported non-boolean value".to_string()),
    }
}

fn path_from_relative(root: &str, relative: &str) -> PathBuf {
    let mut path = PathBuf::from(root);
    for segment in relative.split(['/', '\\']) {
        let trimmed = segment.trim();
        if !trimmed.is_empty() {
            path.push(trimmed);
        }
    }
    path
}

fn lookup_context_value<'a>(
    values: &'a std::collections::BTreeMap<String, Value>,
    token_name: &str,
) -> Option<&'a Value> {
    values
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(token_name))
        .map(|(_, value)| value)
}

fn strip_prefix_case_insensitive<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    value
        .get(..prefix.len())
        .filter(|candidate| candidate.eq_ignore_ascii_case(prefix))
        .and_then(|_| value.get(prefix.len()..))
}

fn resolve_condition_value(
    name: &str,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> Result<Value, String> {
    if name.eq_ignore_ascii_case("Season") {
        let Some(actual) = context.season.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Weather") {
        let Some(actual) = context.weather.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("HasMod") {
        let values = context
            .installed_mods
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if let Some(relative_path) = strip_prefix_case_insensitive(name, "HasFile:") {
        let root =
            project_root_path.ok_or_else(|| "requires a content pack root path".to_string())?;
        let candidate = path_from_relative(root, relative_path);
        return Ok(Value::Bool(
            candidate.exists() && Path::new(&candidate).is_file(),
        ));
    }
    if name == INVALID_WHEN_TOKEN {
        return Err("contains a malformed `When` value; expected an object".to_string());
    }
    lookup_context_value(&context.custom_tokens, name)
        .cloned()
        .or_else(|| lookup_context_value(&context.config, name).cloned())
        .ok_or_else(|| "is not supported in this simulation phase".to_string())
}

fn value_contains_term(value: &Value, expected_term: &str) -> Result<bool, String> {
    let actual_values = value_to_scalar_strings(value)?;
    let normalized_expected = normalize_str(expected_term);
    Ok(actual_values.iter().any(|actual| {
        let trimmed_actual = normalize_str(actual);
        trimmed_actual.eq_ignore_ascii_case(normalized_expected)
            || trimmed_actual
                .split(',')
                .map(normalize_str)
                .any(|segment| segment.eq_ignore_ascii_case(normalized_expected))
            || trimmed_actual
                .split(';')
                .map(normalize_str)
                .any(|segment| segment.eq_ignore_ascii_case(normalized_expected))
    }))
}

fn apply_modifier(
    modifier: &ConditionModifier,
    actual: &Value,
    expected: &Value,
) -> Result<bool, String> {
    if modifier.name.eq_ignore_ascii_case("contains") {
        let expected_contains = modifier
            .value
            .as_deref()
            .ok_or_else(|| "uses a `contains` modifier without a value".to_string())?;
        let should_contain = value_to_bool(expected)?;
        let contains = value_contains_term(actual, expected_contains)?;
        return Ok(contains == should_contain);
    }

    Err(format!(
        "uses modifier `{}` that is not supported in this simulation phase",
        modifier.name
    ))
}

fn evaluate_token_condition(
    token: &super::tokens::ConditionToken,
    expected: &Value,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> Result<bool, String> {
    let actual = resolve_condition_value(&token.name, context, project_root_path)?;
    if token.modifiers.is_empty() {
        return value_matches_expected(expected, &actual);
    }

    let mut matches = true;
    for modifier in &token.modifiers {
        matches &= apply_modifier(modifier, &actual, expected)?;
    }
    if matches {
        Ok(true)
    } else {
        Ok(false)
    }
}

pub fn evaluate_patch_status(
    when: &Value,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> ContentPatcherPatchStatus {
    let mut mismatch_reasons = Vec::new();
    let mut indeterminate_reasons = Vec::new();

    let Some(conditions) = when.as_object() else {
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "applied".to_string(),
            reasons: Vec::new(),
        };
    };

    for (raw_key, expected) in conditions {
        let token = parse_condition_token(raw_key);
        if token.name.is_empty() {
            indeterminate_reasons.push(format!("Condition key `{}` is empty.", token.raw_key));
            continue;
        }

        match evaluate_token_condition(&token, expected, context, project_root_path) {
            Ok(true) => {}
            Ok(false) => mismatch_reasons.push(format!("Condition `{}` did not match.", raw_key)),
            Err(reason) => {
                indeterminate_reasons.push(format!("Condition `{}` {}.", token.raw_key, reason))
            }
        }
    }

    if !mismatch_reasons.is_empty() {
        mismatch_reasons.extend(indeterminate_reasons);
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "skipped".to_string(),
            reasons: mismatch_reasons,
        };
    }

    if !indeterminate_reasons.is_empty() {
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "indeterminate".to_string(),
            reasons: indeterminate_reasons,
        };
    }

    ContentPatcherPatchStatus {
        patch_id: None,
        status: "applied".to_string(),
        reasons: Vec::new(),
    }
}

#[cfg(test)]
#[path = "tests/conditions_tests.rs"]
mod tests;
