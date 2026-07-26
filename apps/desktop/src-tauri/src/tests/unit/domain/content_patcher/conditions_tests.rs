use crate::domain::content_patcher::conditions::evaluate_patch_status;
use crate::domain::content_patcher::context::SimulationContext;
use crate::test_support::{create_temp_dir, write_file};
use serde_json::json;

#[test]
fn evaluate_patch_status_returns_three_state_results() {
    let spring_context = SimulationContext {
        season: Some("spring".to_string()),
        weather: Some("sunny".to_string()),
        ..SimulationContext::default()
    };
    let active = evaluate_patch_status(&json!({ "Season": "spring" }), &spring_context, None);
    let inactive = evaluate_patch_status(&json!({ "Season": "winter" }), &spring_context, None);
    let indeterminate = evaluate_patch_status(
        &json!({ "HasMod |contains=FlashShifter.SVECode": true }),
        &SimulationContext::default(),
        None,
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
        None,
    );

    assert_eq!(status.status, "skipped");
    assert!(
        status
            .reasons
            .iter()
            .any(|reason| reason.contains("Season"))
    );
    assert!(
        status
            .reasons
            .iter()
            .any(|reason| reason.contains("not yet supported") || reason.contains("unsupported"))
    );
}

#[test]
fn evaluate_patch_status_supports_contains_modifier_for_config_tokens() {
    let context = SimulationContext {
        config: [
            ("RegularCropsEnabled".to_string(), json!(true)),
            ("RegularCrops".to_string(), json!(["Carrot", "Broccoli"])),
        ]
        .into_iter()
        .collect(),
        ..SimulationContext::default()
    };

    let status = evaluate_patch_status(
        &json!({
            "RegularCropsEnabled": "True",
            "RegularCrops |contains= Carrot": true
        }),
        &context,
        None,
    );

    assert_eq!(status.status, "applied");
    assert!(status.reasons.is_empty());
}

#[test]
fn evaluate_patch_status_supports_has_mod_tokens() {
    let context = SimulationContext {
        installed_mods: vec!["FlashShifter.SVECode".to_string()],
        ..SimulationContext::default()
    };

    let status = evaluate_patch_status(
        &json!({
            "HasMod": "FlashShifter.SVECode"
        }),
        &context,
        None,
    );

    assert_eq!(status.status, "applied");
    assert!(status.reasons.is_empty());
}

#[test]
fn evaluate_patch_status_supports_has_file_tokens() {
    let root = create_temp_dir("cp-conditions-has-file");
    write_file(&root.join("assets").join("mine.png"), "stub");

    let status = evaluate_patch_status(
        &json!({
            "HasFile:assets/mine.png": "true"
        }),
        &SimulationContext::default(),
        Some(root.to_string_lossy().as_ref()),
    );

    assert_eq!(status.status, "applied");
    assert!(status.reasons.is_empty());
}

#[test]
fn evaluate_patch_status_supports_value_at_modifier_for_arrays() {
    let context = SimulationContext {
        has_flags: vec!["festival".to_string(), "beach_party".to_string()],
        ..SimulationContext::default()
    };

    let first = evaluate_patch_status(&json!({ "HasFlag|valueAt=1": "festival" }), &context, None);
    let second = evaluate_patch_status(
        &json!({ "HasFlag|valueAt=2": "beach_party" }),
        &context,
        None,
    );
    let out_of_bounds =
        evaluate_patch_status(&json!({ "HasFlag|valueAt=5": "anything" }), &context, None);

    assert_eq!(first.status, "applied");
    assert_eq!(second.status, "applied");
    assert_eq!(out_of_bounds.status, "skipped");
}

#[test]
fn evaluate_patch_status_supports_value_at_modifier_for_strings() {
    let context = SimulationContext {
        season: Some("spring,summer".to_string()),
        ..SimulationContext::default()
    };

    let first = evaluate_patch_status(&json!({ "Season|valueAt=1": "spring" }), &context, None);
    let second = evaluate_patch_status(&json!({ "Season|valueAt=2": "summer" }), &context, None);

    assert_eq!(first.status, "applied");
    assert_eq!(second.status, "applied");
}

#[test]
fn evaluate_patch_status_supports_input_separator_modifier() {
    let context = SimulationContext {
        season: Some("spring/summer/autumn".to_string()),
        ..SimulationContext::default()
    };

    let first = evaluate_patch_status(
        &json!({ "Season|inputSeparator=/|valueAt=1": "spring" }),
        &context,
        None,
    );
    let second = evaluate_patch_status(
        &json!({ "Season|inputSeparator=/|valueAt=2": "summer" }),
        &context,
        None,
    );

    assert_eq!(first.status, "applied");
    assert_eq!(second.status, "applied");
}

#[test]
fn evaluate_patch_status_supports_combined_input_and_comparison_modifiers() {
    let context = SimulationContext {
        has_flags: vec!["beach_party".to_string(), "festival".to_string()],
        ..SimulationContext::default()
    };

    let contains = evaluate_patch_status(
        &json!({ "HasFlag|valueAt=1|contains=beach": true }),
        &context,
        None,
    );
    let not_contains = evaluate_patch_status(
        &json!({ "HasFlag|valueAt=1|contains=mountain": true }),
        &context,
        None,
    );

    assert_eq!(contains.status, "applied");
    assert_eq!(not_contains.status, "skipped");
}

#[test]
fn value_at_negative_index_counts_from_end() {
    let context = SimulationContext {
        has_flags: vec!["a".to_string(), "b".to_string(), "c".to_string()],
        season: Some("spring,summer,fall".to_string()),
        ..SimulationContext::default()
    };

    let last_flag = evaluate_patch_status(&json!({ "HasFlag|valueAt=-1": "c" }), &context, None);
    let second_last_flag =
        evaluate_patch_status(&json!({ "HasFlag|valueAt=-2": "b" }), &context, None);
    let last_season =
        evaluate_patch_status(&json!({ "Season|valueAt=-1": "fall" }), &context, None);
    let out_of_bounds_negative =
        evaluate_patch_status(&json!({ "HasFlag|valueAt=-5": "anything" }), &context, None);

    assert_eq!(last_flag.status, "applied");
    assert_eq!(second_last_flag.status, "applied");
    assert_eq!(last_season.status, "applied");
    assert_eq!(out_of_bounds_negative.status, "skipped");
}

#[test]
fn has_value_modifier_checks_token_presence() {
    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };

    let has_value = evaluate_patch_status(&json!({ "Season|hasValue": "true" }), &context, None);
    let no_value = evaluate_patch_status(&json!({ "Weather|hasValue": "true" }), &context, None);
    let explicitly_false =
        evaluate_patch_status(&json!({ "Weather|hasValue": "false" }), &context, None);
    let empty_context = SimulationContext {
        weather: Some(String::new()),
        ..SimulationContext::default()
    };
    let empty_string_false = evaluate_patch_status(
        &json!({ "Weather|hasValue": "false" }),
        &empty_context,
        None,
    );
    let empty_string_true =
        evaluate_patch_status(&json!({ "Weather|hasValue": "true" }), &empty_context, None);

    assert_eq!(has_value.status, "applied");
    assert_eq!(no_value.status, "skipped");
    assert_eq!(explicitly_false.status, "applied");
    assert_eq!(empty_string_false.status, "applied");
    assert_eq!(empty_string_true.status, "skipped");
}

#[test]
fn relationship_condition_with_contains() {
    let mut relationships = std::collections::BTreeMap::new();
    relationships.insert("Abigail".to_string(), "Married".to_string());
    relationships.insert("Sebastian".to_string(), "Dating".to_string());
    let context = SimulationContext {
        relationships,
        ..SimulationContext::default()
    };

    let married = evaluate_patch_status(
        &json!({ "Relationship:Abigail": "Married" }),
        &context,
        None,
    );
    let contains_married = evaluate_patch_status(
        &json!({ "Relationship:Abigail|contains=Mar": "true" }),
        &context,
        None,
    );
    let dating = evaluate_patch_status(
        &json!({ "Relationship:Sebastian": "Dating" }),
        &context,
        None,
    );
    let missing =
        evaluate_patch_status(&json!({ "Relationship:Haley": "Married" }), &context, None);

    assert_eq!(married.status, "applied");
    assert_eq!(contains_married.status, "applied");
    assert_eq!(dating.status, "applied");
    assert_eq!(missing.status, "indeterminate");
}
