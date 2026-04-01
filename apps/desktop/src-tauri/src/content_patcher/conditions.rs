use super::context::SimulationContext;
use super::tokens::{parse_condition_token, INVALID_WHEN_TOKEN};
use super::types::ContentPatcherPatchStatus;
use serde_json::Value;

fn normalize_str(value: &str) -> &str {
    value.trim()
}

fn value_matches_string(expected: &Value, actual: &str) -> Result<bool, String> {
    match expected {
        Value::String(expected) => Ok(expected.eq_ignore_ascii_case(normalize_str(actual))),
        Value::Array(values) => {
            let expected_values = values
                .iter()
                .filter_map(Value::as_str)
                .map(normalize_str)
                .collect::<Vec<_>>();
            if expected_values.is_empty() {
                return Err("has an unsupported empty or non-string array value".to_string());
            }
            Ok(expected_values
                .iter()
                .any(|expected| expected.eq_ignore_ascii_case(normalize_str(actual))))
        }
        _ => Err("has an unsupported value type".to_string()),
    }
}

fn evaluate_known_token(name: &str, expected: &Value, context: &SimulationContext) -> Result<bool, String> {
    match name {
        "Season" => {
            let Some(actual) = context.season.as_deref() else {
                return Err("is missing from the simulation context".to_string());
            };
            value_matches_string(expected, actual)
        }
        "Weather" => {
            let Some(actual) = context.weather.as_deref() else {
                return Err("is missing from the simulation context".to_string());
            };
            value_matches_string(expected, actual)
        }
        INVALID_WHEN_TOKEN => Err("contains a malformed `When` value; expected an object".to_string()),
        _ => Err("is not supported in this simulation phase".to_string()),
    }
}

pub fn evaluate_patch_status(when: &Value, context: &SimulationContext) -> ContentPatcherPatchStatus {
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
        if token.has_modifiers {
            indeterminate_reasons.push(format!(
                "Condition `{}` uses modifiers that are not yet supported.",
                token.raw_key
            ));
            continue;
        }

        match evaluate_known_token(&token.name, expected, context) {
            Ok(true) => {}
            Ok(false) => mismatch_reasons.push(format!("Condition `{}` did not match.", token.raw_key)),
            Err(reason) => indeterminate_reasons.push(format!("Condition `{}` {}.", token.raw_key, reason)),
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
mod tests {
    use crate::content_patcher::conditions::evaluate_patch_status;
    use crate::content_patcher::context::SimulationContext;
    use serde_json::json;

    #[test]
    fn evaluate_patch_status_returns_three_state_results() {
        let spring_context = SimulationContext {
            season: Some("spring".to_string()),
            weather: Some("sunny".to_string()),
            ..SimulationContext::default()
        };
        let active = evaluate_patch_status(&json!({ "Season": "spring" }), &spring_context);
        let inactive = evaluate_patch_status(&json!({ "Season": "winter" }), &spring_context);
        let indeterminate = evaluate_patch_status(
            &json!({ "HasMod |contains=FlashShifter.SVECode": true }),
            &SimulationContext::default(),
        );

        assert_eq!(active.status, "applied");
        assert_eq!(inactive.status, "skipped");
        assert_eq!(indeterminate.status, "indeterminate");
        assert!(!indeterminate.reasons.is_empty());
    }

    #[test]
    fn evaluate_patch_status_preserves_unsupported_reasons_when_skipped() {
        let spring_context = SimulationContext {
            season: Some("spring".to_string()),
            ..SimulationContext::default()
        };
        let status = evaluate_patch_status(
            &json!({
                "Season": "winter",
                "HasMod |contains=FlashShifter.SVECode": true
            }),
            &spring_context,
        );

        assert_eq!(status.status, "skipped");
        assert!(status.reasons.iter().any(|reason| reason.contains("Season")));
        assert!(
            status
                .reasons
                .iter()
                .any(|reason| reason.contains("not yet supported") || reason.contains("unsupported"))
        );
    }
}
