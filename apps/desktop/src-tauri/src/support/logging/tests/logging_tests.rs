use super::{
    COMMAND_LOG_TARGET, LOG_FILE_COUNT, LOG_FILE_NAME, LOG_FILE_SIZE_BYTES, log_file_config,
    log_tauri_command_error_with,
};
use crate::domain::app_paths::app_logs_dir;

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

#[test]
fn log_file_config_writes_to_rotating_app_log_file() {
    let config = log_file_config().expect("log file config");

    assert_eq!(config.directory, app_logs_dir().expect("app logs dir"));
    assert_eq!(config.file_name, LOG_FILE_NAME);
    assert_eq!(config.max_file_size_bytes, LOG_FILE_SIZE_BYTES);
    assert_eq!(config.retained_file_count, LOG_FILE_COUNT);
}
