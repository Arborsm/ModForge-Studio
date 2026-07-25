use super::*;

#[test]
fn events_have_stable_order_escape_values_and_omit_empty_options() {
    let value = event("translation.started")
        .field("job", "job-1")
        .optional("scope", Some(""))
        .optional("model", None::<String>)
        .field("operation", "translate\nnext")
        .to_string();
    assert_eq!(
        value,
        "translation.started job=job-1 operation=\"translate\\nnext\""
    );
}

#[test]
fn failure_categories_are_stable() {
    for (message, expected) in [
        ("job was cancelled", "cancelled"),
        ("rate limit", "rate-limit"),
        ("network timeout", "network"),
        ("invalid JSON response", "parse"),
        ("SQLite database failed", "storage"),
        ("provider HTTP 500", "provider"),
        ("invalid locale", "validation"),
    ] {
        assert_eq!(failure_category(&anyhow::anyhow!(message)), expected);
    }
    assert_eq!(
        stable_failure_category(Some("authentication")),
        Some("provider")
    );
    assert_eq!(stable_failure_category(Some("request")), Some("validation"));
}

#[test]
fn localization_operational_logs_do_not_reference_body_or_secret_fields() {
    let sources = [
        include_str!("../../../domain/localization/orchestrator.rs"),
        include_str!("../../../domain/localization/semantic/mod.rs"),
        include_str!("../../../domain/localization/review.rs"),
    ];
    for source in sources {
        assert!(!source.contains("log::error!"));
        for line in source.lines().filter(|line| line.contains("log::")) {
            assert!(!line.contains(".text"));
            assert!(!line.contains("translated_text"));
            assert!(!line.contains("api_key"));
            assert!(!line.contains("prompt"));
        }
    }
}
