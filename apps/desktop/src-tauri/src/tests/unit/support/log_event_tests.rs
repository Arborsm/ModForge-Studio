use super::{LogEvent, format_field_value, is_event_name, is_field_key, targets};
use std::time::Duration;

#[test]
fn event_renders_name_then_fields_in_insertion_order() {
    let rendered = LogEvent::new("launcher.install.start")
        .field("modsPath", "E:/SDV/Mods")
        .flag("hasBackupRoot", true)
        .count("entries", 12)
        .render();

    assert_eq!(
        rendered,
        "launcher.install.start modsPath=E:/SDV/Mods hasBackupRoot=true entries=12"
    );
}

#[test]
fn repeated_keys_overwrite_in_place_instead_of_duplicating() {
    let rendered = LogEvent::new("launcher.toggle")
        .field("enabled", false)
        .field("modsPath", "E:/SDV/Mods")
        .field("enabled", true)
        .render();

    assert_eq!(
        rendered,
        "launcher.toggle enabled=true modsPath=E:/SDV/Mods"
    );
}

#[test]
fn optional_fields_are_omitted_when_absent_or_blank() {
    let rendered = LogEvent::new("launcher.install.complete")
        .optional("uniqueId", None::<String>)
        .optional("version", Some("   "))
        .optional("backupId", Some("backup-3"))
        .render();

    assert_eq!(rendered, "launcher.install.complete backupId=backup-3");
}

#[test]
fn durations_render_as_whole_milliseconds() {
    let rendered = LogEvent::new("nexus.request")
        .ms("elapsedMs", Duration::from_millis(1_450))
        .render();

    assert_eq!(rendered, "nexus.request elapsedMs=1450");
}

#[test]
fn error_field_uses_the_conventional_key() {
    let rendered = LogEvent::new("nexus.request.failed")
        .error("connection reset")
        .render();

    assert_eq!(rendered, "nexus.request.failed error=\"connection reset\"");
}

#[test]
fn block_bodies_render_on_following_lines() {
    let rendered = LogEvent::new("hostRuntime.stats")
        .field("reason", "shutdown")
        .block("Pools\n  Io/Lane\n    jobs=1 ok=1\n")
        .render();

    assert_eq!(
        rendered,
        "hostRuntime.stats reason=shutdown\nPools\n  Io/Lane\n    jobs=1 ok=1"
    );
}

#[test]
fn field_values_are_quoted_only_when_parsing_would_break() {
    assert_eq!(format_field_value("missing"), "missing");
    assert_eq!(format_field_value("12"), "12");
    assert_eq!(format_field_value(""), "\"\"");
    assert_eq!(
        format_field_value("Like A Duck To Water"),
        "\"Like A Duck To Water\""
    );
    assert_eq!(format_field_value("a=b"), "\"a=b\"");
    assert_eq!(format_field_value("said \"hi\""), "\"said \\\"hi\\\"\"");
}

#[test]
fn windows_paths_keep_literal_backslashes() {
    let rendered = LogEvent::new("launcher.scan")
        .field("modsPath", "E:\\Stardew Valley\\Mods")
        .render();

    assert_eq!(
        rendered,
        "launcher.scan modsPath=\"E:\\Stardew Valley\\Mods\""
    );
}

#[test]
fn path_fields_are_normalized_like_command_results() {
    let rendered = LogEvent::new("launcher.scan")
        .path("modsPath", std::path::Path::new("E:/SDV/Mods"))
        .render();

    assert!(
        rendered.starts_with("launcher.scan modsPath="),
        "{rendered}"
    );
    assert!(!rendered.contains("\\\\"), "{rendered}");
}

#[test]
fn field_key_and_event_name_recognition_match_the_rendered_shape() {
    assert!(is_field_key("modsPath"));
    assert!(is_field_key("entry-state"));
    assert!(!is_field_key("mods path"));
    assert!(!is_field_key(""));

    assert!(is_event_name("launcher.install.start"));
    assert!(!is_event_name("launcher"));
    assert!(!is_event_name("Launcher.Install"));
    assert!(!is_event_name("launcher."));
}

#[test]
fn targets_stay_dotted_pascal_case_namespaces() {
    assert_eq!(targets::LAUNCHER, "Launcher");
    assert_eq!(targets::LAUNCHER_TRACE, "Launcher.Trace");
    assert_eq!(
        targets::LOCALIZATION_TRANSLATION,
        "Localization.Translation"
    );
    assert_eq!(targets::HOST_RUNTIME, "HostRuntime");
}
