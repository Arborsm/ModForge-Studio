use super::{
    COMMAND_TRACE_ENV, DebugLoggingState, HostLogFile, LOG_FILE_COUNT, LOG_FILE_NAME,
    LOG_FILE_SIZE_BYTES, LogFileConfig, REQWEST_CONNECT_LOG_TARGET, SYSTEM_CERTIFICATE_LOG_TARGET,
    TerminalNoiseState, apply_debug_logging_toggle, format_frontend_log_message, log_file_config,
    log_tauri_command_error_with, rotated_host_log_path, targets,
};
use crate::domain::app_paths::app_logs_dir;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn clear_command_trace_env() {
    unsafe {
        std::env::remove_var(COMMAND_TRACE_ENV);
    }
}

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
        Some("tauriCommand.failed command=scan_maps error=\"content pipeline exploded\"")
    );
    assert_eq!(targets::TAURI_COMMAND, "TauriCommand");
}

#[test]
fn log_file_config_writes_to_rotating_app_log_file() {
    let production = log_file_config().expect("log file config");
    assert_eq!(production.directory, app_logs_dir().expect("app logs dir"));
    assert_eq!(production.file_name, LOG_FILE_NAME);
    assert_eq!(production.max_file_size_bytes, LOG_FILE_SIZE_BYTES);
    assert_eq!(production.retained_file_count, LOG_FILE_COUNT);

    let directory = crate::test_support::create_temp_dir("rotating-host-log");
    let mut log_file = HostLogFile::new(LogFileConfig {
        directory: directory.clone(),
        file_name: "rotation-test",
        max_file_size_bytes: 8,
        retained_file_count: 2,
    })
    .expect("create rotating log");

    for line in ["first", "second", "third", "fourth"] {
        log_file.write_line(line).expect("write rotating log line");
    }

    let active = directory.join("rotation-test.log");
    assert_eq!(std::fs::read_to_string(&active).unwrap(), "fourth\n");
    assert_eq!(
        std::fs::read_to_string(rotated_host_log_path(&active, 1)).unwrap(),
        "third\n"
    );
    assert_eq!(
        std::fs::read_to_string(rotated_host_log_path(&active, 2)).unwrap(),
        "second\n"
    );
    assert!(!rotated_host_log_path(&active, 3).exists());
    std::fs::remove_dir_all(directory).expect("cleanup rotating log fixture");
}

#[test]
fn debug_logging_state_does_not_suppress_repeated_third_party_debug_logs() {
    let state = DebugLoggingState::new();
    state.set_enabled(true);

    let metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(SYSTEM_CERTIFICATE_LOG_TARGET)
        .build();

    assert!(state.level_enabled(&metadata));
    assert!(state.level_enabled(&metadata));
}

#[test]
fn command_trace_defaults_to_off_without_environment_flag() {
    let _guard = env_lock().lock().expect("env lock");
    clear_command_trace_env();

    let state = DebugLoggingState::new();
    let command_trace_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::HOST_RUNTIME)
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::NEXUS)
        .build();
    let info_metadata = log::Metadata::builder()
        .level(log::Level::Info)
        .target(targets::HOST_RUNTIME)
        .build();

    assert!(!state.level_enabled(&command_trace_metadata));
    assert!(!state.level_enabled(&regular_debug_metadata));
    assert!(state.level_enabled(&info_metadata));
}

#[test]
fn repeated_debug_logging_syncs_do_not_re_announce_the_same_state() {
    let state = DebugLoggingState::new();

    assert!(apply_debug_logging_toggle(&state, true));
    assert!(state.is_enabled());
    // The shell re-syncs the same value on every mount; only a change is news.
    assert!(!apply_debug_logging_toggle(&state, true));
    assert!(state.is_enabled());

    assert!(apply_debug_logging_toggle(&state, false));
    assert!(!state.is_enabled());
    assert!(!apply_debug_logging_toggle(&state, false));
}

#[test]
fn command_trace_environment_flag_only_enables_host_runtime_debug_logs() {
    let _guard = env_lock().lock().expect("env lock");
    unsafe {
        std::env::set_var(COMMAND_TRACE_ENV, "1");
    }

    let state = DebugLoggingState::new();
    let command_trace_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::HOST_RUNTIME)
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::NEXUS)
        .build();

    assert!(state.level_enabled(&command_trace_metadata));
    assert!(!state.level_enabled(&regular_debug_metadata));
    clear_command_trace_env();
}

#[test]
fn debug_logging_toggle_does_not_enable_command_trace_logs() {
    let _guard = env_lock().lock().expect("env lock");
    clear_command_trace_env();

    let state = DebugLoggingState::new();
    state.set_enabled(true);
    let command_trace_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::HOST_RUNTIME)
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::NEXUS)
        .build();

    assert!(!state.level_enabled(&command_trace_metadata));
    assert!(state.level_enabled(&regular_debug_metadata));
}

#[test]
fn terminal_noise_state_limits_low_value_third_party_debug_output() {
    let state = TerminalNoiseState::new();
    let system_certificate_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(SYSTEM_CERTIFICATE_LOG_TARGET)
        .build();
    let reqwest_connect_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(REQWEST_CONNECT_LOG_TARGET)
        .build();
    let launcher_trace_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(targets::LAUNCHER_TRACE)
        .build();

    assert!(state.should_emit(&system_certificate_metadata));
    assert!(!state.should_emit(&system_certificate_metadata));
    assert!(!state.should_emit(&reqwest_connect_metadata));
    assert!(state.should_emit(&launcher_trace_metadata));
}

#[test]
fn frontend_log_message_appends_sorted_metadata() {
    let key_values = HashMap::from([
        ("source".to_string(), "console".to_string()),
        ("method".to_string(), "warn".to_string()),
    ]);

    assert_eq!(
        format_frontend_log_message("Failed to preload asset", &key_values),
        "Failed to preload asset method=warn source=console"
    );
}

#[test]
fn frontend_log_message_quotes_metadata_values_with_spaces() {
    let key_values = HashMap::from([
        ("modName".to_string(), "Like A Duck To Water".to_string()),
        ("nexusModId".to_string(), "21285".to_string()),
    ]);

    assert_eq!(
        format_frontend_log_message("launcher.autoCover.skipBlocked", &key_values),
        "launcher.autoCover.skipBlocked modName=\"Like A Duck To Water\" nexusModId=21285"
    );

    let quoted = HashMap::from([("note".to_string(), "said \"hi\" loudly".to_string())]);
    assert_eq!(
        format_frontend_log_message("event", &quoted),
        "event note=\"said \\\"hi\\\" loudly\""
    );
}
