use crate::content_patcher::conditions::evaluate_patch_status;
use crate::content_patcher::context::SimulationContext;
use crate::content_patcher::test_support::{create_temp_dir, write_file};
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
    assert!(status
        .reasons
        .iter()
        .any(|reason| reason.contains("Season")));
    assert!(status
        .reasons
        .iter()
        .any(|reason| reason.contains("not yet supported") || reason.contains("unsupported")));
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
