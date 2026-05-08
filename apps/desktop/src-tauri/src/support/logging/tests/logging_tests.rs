use super::{log_tauri_command_error_with, COMMAND_LOG_TARGET};

#[test]
fn command_error_logging_helper_skips_successful_results() {
    let mut captured = None;

    let result = log_tauri_command_error_with(
        "scan_maps",
        Ok::<usize, String>(3),
        |error| error.to_string(),
        |message| {
            captured = Some(message);
        },
    );

    assert_eq!(result.unwrap(), 3);
    assert_eq!(captured, None);
}

#[test]
fn command_error_logging_helper_formats_failed_results() {
    let mut captured = None;

    let result = log_tauri_command_error_with(
        "scan_maps",
        Err::<(), _>("content pipeline exploded"),
        |error| error.to_string(),
        |message| {
            captured = Some(message);
        },
    );

    assert_eq!(result.unwrap_err(), "content pipeline exploded".to_string());
    assert_eq!(
        captured.as_deref(),
        Some("Tauri command `scan_maps` failed: content pipeline exploded")
    );
    assert_eq!(COMMAND_LOG_TARGET, "tauri_command");
}
