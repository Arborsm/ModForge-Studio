use super::{
    COMMAND_LOG_TARGET, COMMAND_TRACE_ENV, DebugLoggingState, LOG_FILE_COUNT, LOG_FILE_NAME,
    LOG_FILE_SIZE_BYTES, REQWEST_CONNECT_LOG_TARGET, SYSTEM_CERTIFICATE_LOG_TARGET,
    TerminalNoiseState, format_frontend_log_message, format_layered_terminal_log_line,
    format_record_for_terminal, log_file_config, log_tauri_command_error_with,
    should_colorize_terminal_output,
};
use crate::domain::app_paths::app_logs_dir;
use log::RecordBuilder;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

const ANSI_ESCAPE: &str = "\u{1b}[";

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn clear_color_env() {
    unsafe {
        std::env::remove_var("MODFORGE_LOG_COLOR");
        std::env::remove_var("NO_COLOR");
        std::env::remove_var("FORCE_COLOR");
        std::env::remove_var("CLICOLOR_FORCE");
        std::env::remove_var("CLICOLOR");
    }
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
        Some("Tauri command `scan_maps` failed: content pipeline exploded")
    );
    assert_eq!(COMMAND_LOG_TARGET, "Tauri Command");
}

#[test]
fn log_file_config_writes_to_rotating_app_log_file() {
    let config = log_file_config().expect("log file config");

    assert_eq!(config.directory, app_logs_dir().expect("app logs dir"));
    assert_eq!(config.file_name, LOG_FILE_NAME);
    assert_eq!(config.max_file_size_bytes, LOG_FILE_SIZE_BYTES);
    assert_eq!(config.retained_file_count, LOG_FILE_COUNT);
}

#[test]
fn layered_terminal_formatter_keeps_non_color_output_plain() {
    let line = format_layered_terminal_log_line(
        "12:34:56",
        Some("modforge-sidecar"),
        log::Level::Info,
        "Nexus",
        "Loaded settings: apiKey-present=true mods-path=\"/tmp/Stardew Valley/Mods\"",
        false,
    );

    assert!(!line.contains(ANSI_ESCAPE));
    assert!(line.contains("12:34:56"));
    assert!(line.contains("modforge-sidecar"));
    assert!(line.contains("INFO"));
    assert!(line.contains("Nexus"));
    assert!(line.contains("Loaded settings"));
    assert!(line.contains("apiKey-present=true"));
}

#[test]
fn layered_terminal_formatter_colors_important_segments() {
    let line = format_layered_terminal_log_line(
        "12:34:56",
        Some("modforge-sidecar"),
        log::Level::Warn,
        "Nexus",
        "Request failed host=api.nexusmods.com path=/tmp/Mods enabled=false",
        true,
    );

    assert!(line.contains(ANSI_ESCAPE));
    assert!(line.contains("12:34:56"));
    assert!(line.contains("modforge-sidecar"));
    assert!(line.contains("WARN"));
    assert!(line.contains("Nexus"));
    assert!(line.contains("Request failed"));
    assert!(line.contains("host"));
    assert!(line.contains("api.nexusmods.com"));
    assert!(line.contains("path"));
    assert!(line.contains("/tmp/Mods"));
    assert!(line.contains("enabled"));
    assert!(line.contains("false"));
}

#[test]
fn layered_terminal_formatter_has_stable_level_colors() {
    let cases = [
        (log::Level::Trace, "\u{1b}[2mTRACE"),
        (log::Level::Debug, "\u{1b}[35mDEBUG"),
        (log::Level::Info, "\u{1b}[36mINFO"),
        (log::Level::Warn, "\u{1b}[33mWARN"),
        (log::Level::Error, "\u{1b}[31mERROR"),
    ];

    for (level, expected) in cases {
        let line = format_layered_terminal_log_line(
            "12:34:56",
            Some("modforge-sidecar"),
            level,
            "Nexus",
            "message flag=true",
            true,
        );

        assert!(
            line.contains(expected),
            "expected {level} line to contain {expected:?}, got {line:?}"
        );
    }
}

#[test]
fn sidecar_terminal_formatter_omits_process_prefix_for_electron_prefixing() {
    let record = RecordBuilder::new()
        .level(log::Level::Info)
        .target("Nexus")
        .args(format_args!("Started force-restart=false"))
        .build();

    let line = format_record_for_terminal(&record, None, false);

    assert!(!line.contains("modforge-sidecar"));
    assert!(line.contains("INFO"));
    assert!(line.contains("Nexus"));
    assert!(line.contains("force-restart=false"));
}

#[test]
fn debug_logging_state_does_not_suppress_repeated_third_party_debug_logs() {
    let state = DebugLoggingState::new();
    state.set_enabled(true);

    let metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target(SYSTEM_CERTIFICATE_LOG_TARGET)
        .build();

    assert!(state.should_log_metadata(&metadata));
    assert!(state.should_log_metadata(&metadata));
}

#[test]
fn command_trace_defaults_to_off_without_environment_flag() {
    let _guard = env_lock().lock().expect("env lock");
    clear_command_trace_env();

    let state = DebugLoggingState::new();
    let command_trace_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target("HostRuntime")
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target("Nexus")
        .build();
    let info_metadata = log::Metadata::builder()
        .level(log::Level::Info)
        .target("HostRuntime")
        .build();

    assert!(!state.should_log_metadata(&command_trace_metadata));
    assert!(!state.should_log_metadata(&regular_debug_metadata));
    assert!(state.should_log_metadata(&info_metadata));
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
        .target("HostRuntime")
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target("Nexus")
        .build();

    assert!(state.should_log_metadata(&command_trace_metadata));
    assert!(!state.should_log_metadata(&regular_debug_metadata));
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
        .target("HostRuntime")
        .build();
    let regular_debug_metadata = log::Metadata::builder()
        .level(log::Level::Debug)
        .target("Nexus")
        .build();

    assert!(!state.should_log_metadata(&command_trace_metadata));
    assert!(state.should_log_metadata(&regular_debug_metadata));
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
        .target("Launcher Trace")
        .build();

    assert!(state.should_emit(&system_certificate_metadata));
    assert!(!state.should_emit(&system_certificate_metadata));
    assert!(!state.should_emit(&reqwest_connect_metadata));
    assert!(state.should_emit(&launcher_trace_metadata));
}

#[test]
fn terminal_color_policy_respects_modforge_override() {
    let _guard = env_lock().lock().expect("env lock should not be poisoned");
    clear_color_env();

    unsafe {
        std::env::set_var("MODFORGE_LOG_COLOR", "always");
    }
    assert!(should_colorize_terminal_output(false));

    unsafe {
        std::env::set_var("MODFORGE_LOG_COLOR", "never");
    }
    assert!(!should_colorize_terminal_output(true));

    clear_color_env();
}

#[test]
fn terminal_color_policy_supports_standard_force_and_no_color_envs() {
    let _guard = env_lock().lock().expect("env lock should not be poisoned");
    clear_color_env();

    unsafe {
        std::env::set_var("NO_COLOR", "1");
        std::env::set_var("FORCE_COLOR", "1");
    }
    assert!(!should_colorize_terminal_output(true));

    unsafe {
        std::env::remove_var("NO_COLOR");
    }
    assert!(should_colorize_terminal_output(false));

    unsafe {
        std::env::remove_var("FORCE_COLOR");
        std::env::set_var("CLICOLOR_FORCE", "1");
    }
    assert!(should_colorize_terminal_output(false));

    unsafe {
        std::env::remove_var("CLICOLOR_FORCE");
    }

    clear_color_env();
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
