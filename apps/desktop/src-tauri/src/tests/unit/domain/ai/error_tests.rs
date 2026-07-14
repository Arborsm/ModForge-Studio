use super::{classify_error_message, format_command_error};
use anyhow::Context;

#[test]
fn classifies_stable_ai_command_error_categories() {
    let cases = [
        ("No default AI profile is configured.", "not-configured"),
        (
            "AI provider request failed (401 Unauthorized)",
            "authentication",
        ),
        (
            "AI provider request failed (429 Too Many Requests)",
            "rate-limit",
        ),
        ("request timed out", "timeout"),
        ("AI provider request could not be sent", "network"),
        ("Failed to write the AI translation cache", "cache"),
        (
            "AI translation output item ids do not exactly match",
            "invalid-response",
        ),
        (
            "AI translation changed placeholders for item greeting",
            "placeholder-mismatch",
        ),
        ("AI translation was cancelled", "cancelled"),
    ];

    for (message, expected) in cases {
        assert_eq!(classify_error_message(message), expected, "{message}");
    }
}

#[test]
fn command_error_preserves_detail_behind_the_stable_code() {
    assert_eq!(
        format_command_error(anyhow::anyhow!("request timed out")),
        "AI_ERROR::timeout::request timed out"
    );

    let nested = Err::<(), _>(anyhow::anyhow!("operation timed out"))
        .context("AI provider request could not be sent")
        .unwrap_err();
    assert_eq!(
        format_command_error(nested),
        "AI_ERROR::timeout::AI provider request could not be sent: operation timed out"
    );
}
