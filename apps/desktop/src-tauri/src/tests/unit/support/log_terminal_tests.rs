use super::{
    LogLine, LogSink, MIN_MESSAGE_WIDTH, TARGET_COLUMN_WIDTH, format_log_line_within,
    should_colorize_terminal_output, visible_width,
};
use std::sync::{Mutex, OnceLock};

const ANSI_ESCAPE: &str = "\u{1b}[";

/// Serializes the env-mutating tests, recovering from poisoning so one failing
/// assertion does not cascade into unrelated failures.
fn lock_env() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
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

fn line<'a>(level: log::Level, target: &'a str, message: &'a str) -> LogLine<'a> {
    LogLine {
        timestamp: "12:34:56",
        process_tag: None,
        level,
        target,
        message,
    }
}

/// Renders without wrapping, so layout assertions do not depend on the width of
/// whatever terminal the suite runs in.
fn render(line: LogLine<'_>, sink: LogSink, colorize: bool) -> String {
    format_log_line_within(line, sink, colorize, None)
}

#[test]
fn terminal_layout_aligns_the_message_column_across_targets() {
    let short = render(
        line(log::Level::Info, "Nexus", "nexus.request.start host=api"),
        LogSink::Terminal,
        false,
    );
    let long = render(
        line(
            log::Level::Info,
            "Localization.MachineTranslation",
            "translation.started job=alpha",
        ),
        LogSink::Terminal,
        false,
    );
    let overflowing = render(
        line(
            log::Level::Info,
            "Localization.MachineTranslationDiagnostics",
            "translation.started job=alpha",
        ),
        LogSink::Terminal,
        false,
    );

    assert!(!short.contains(ANSI_ESCAPE));
    assert_eq!(
        short.find("nexus.request.start"),
        Some(short.len() - "nexus.request.start host=api".len())
    );
    assert!(short.contains("[Nexus]"), "{short:?}");
    let message_column = short
        .find("nexus.request.start")
        .expect("terminal line keeps the message");
    assert!(message_column >= TARGET_COLUMN_WIDTH, "{short:?}");
    // A target too wide for the column abbreviates its leading namespaces instead
    // of pushing the message out of the shared column.
    assert!(long.contains("[L.MachineTranslation]"), "{long:?}");
    assert_eq!(
        long.find("translation.started"),
        Some(message_column),
        "{long:?}"
    );
    // Abbreviation only shortens what it can; the distinguishing last segment is
    // kept whole even when that still overflows, and one space always separates.
    assert!(
        overflowing.contains("[L.MachineTranslationDiagnostics] translation.started"),
        "{overflowing:?}"
    );
}

#[test]
fn terminal_block_bodies_use_an_indented_gutter() {
    let rendered = render(
        line(
            log::Level::Info,
            "HostRuntime",
            "hostRuntime.stats reason=shutdown\nPools\n  Io/Lane",
        ),
        LogSink::Terminal,
        false,
    );

    let mut lines = rendered.lines();
    let head = lines.next().expect("head line");
    let first_body = lines.next().expect("first block line");
    let second_body = lines.next().expect("second block line");

    let gutter_column = visible_width(head) - "hostRuntime.stats reason=shutdown".len();
    assert!(
        first_body.starts_with(&" ".repeat(gutter_column)),
        "{first_body:?}"
    );
    assert!(
        first_body.trim_start().starts_with("\u{2502} Pools"),
        "{first_body:?}"
    );
    assert!(
        second_body.contains("\u{2502}   Io/Lane"),
        "{second_body:?}"
    );
}

#[test]
fn block_bodies_keep_their_own_column_alignment() {
    let rendered = render(
        line(
            log::Level::Info,
            "HostRuntime",
            "hostRuntime.stats\n  Io/Lane\n    load active=2/8   peak=3/8   [###.....]",
        ),
        LogSink::Terminal,
        true,
    );

    let table_row = rendered.lines().nth(2).expect("table row");
    // The pre-formatted spacing survives styling, so the columns still line up.
    assert!(table_row.contains("   "), "{table_row:?}");
    assert!(
        table_row.contains("[###.....]") && table_row.contains("load"),
        "{table_row:?}"
    );
}

#[test]
fn long_lines_wrap_into_the_message_column_instead_of_column_zero() {
    let message = "launcher.updateCache.miss modsPath=\"E:\\Games\\Stardew Valley\\Mods\" entryState=missing activeChecks=0 hadActiveCheck=false";
    let rendered = format_log_line_within(
        line(log::Level::Debug, "Launcher.Trace", message),
        LogSink::Terminal,
        false,
        Some(100),
    );

    let lines = rendered.lines().collect::<Vec<_>>();
    assert!(lines.len() > 1, "expected a wrapped line, got {rendered:?}");
    for entry in &lines {
        assert!(entry.chars().count() <= 100, "{entry:?}");
    }

    let head = lines[0];
    let message_column = head
        .find("launcher.updateCache.miss")
        .expect("head keeps the event name");
    for continuation in &lines[1..] {
        assert!(
            continuation.starts_with(&" ".repeat(message_column)),
            "{continuation:?}"
        );
        assert!(
            continuation[message_column..].starts_with("\u{2502} "),
            "{continuation:?}"
        );
    }

    // Wrapping splits between fields, never inside one.
    assert!(rendered.contains("hadActiveCheck=false"), "{rendered:?}");
    assert!(
        rendered.contains("modsPath=\"E:\\Games\\Stardew Valley\\Mods\""),
        "{rendered:?}"
    );
}

#[test]
fn a_lone_trailing_field_is_not_stranded_on_its_own_line() {
    // Just past the limit, so a naive wrap would push only `hadActiveCheck` down.
    let message = "launcher.updateCache.miss modsPath=E:\\Games\\Mods entryState=missing hadActiveCheck=false";
    let rendered = format_log_line_within(
        line(log::Level::Debug, "Launcher.Trace", message),
        LogSink::Terminal,
        false,
        Some(125),
    );

    // Overflowing by one field beats spending a whole row to show it alone.
    assert_eq!(rendered.lines().count(), 1, "{rendered:?}");
    assert!(rendered.ends_with("hadActiveCheck=false"), "{rendered:?}");
}

#[test]
fn a_single_oversized_field_does_not_leave_an_empty_head_line() {
    let mods = format!("mods=\"{}\"", "Some Mod Name (12345), ".repeat(20));
    let message = format!("launcher.autoCover.skippedBlocked {mods} skipped=20");
    let rendered = format_log_line_within(
        line(log::Level::Debug, "Webview", &message),
        LogSink::Terminal,
        false,
        Some(120),
    );

    let head = rendered.lines().next().expect("head line");
    // The event name must stay on the first line, never orphaned above the field.
    assert!(
        head.trim_end()
            .ends_with("launcher.autoCover.skippedBlocked")
            || head.contains("launcher.autoCover.skippedBlocked mods="),
        "{head:?}"
    );
    assert!(!head.trim().is_empty(), "{rendered:?}");
    assert!(rendered.contains("skipped=20"), "{rendered:?}");
}

#[test]
fn a_field_wider_than_the_terminal_is_never_truncated() {
    let long_path = format!(
        "modsPath=\"{}\"",
        "E:\\".to_string() + &"nested\\".repeat(40)
    );
    let message = format!("launcher.scan.start {long_path} count=1");
    let rendered = format_log_line_within(
        line(log::Level::Info, "Launcher", &message),
        LogSink::Terminal,
        false,
        Some(80),
    );

    assert!(rendered.contains(&long_path), "{rendered:?}");
    assert!(rendered.contains("count=1"), "{rendered:?}");
}

#[test]
fn wrapping_is_skipped_when_the_message_column_would_be_too_narrow() {
    let message = "launcher.scan.start modsPath=E:\\Mods count=12 enabled=true";
    let rendered = format_log_line_within(
        line(log::Level::Info, "Launcher", message),
        LogSink::Terminal,
        false,
        // Narrower than the prefix plus the minimum message column.
        Some(TARGET_COLUMN_WIDTH + MIN_MESSAGE_WIDTH),
    );

    assert_eq!(rendered.lines().count(), 1, "{rendered:?}");
    assert!(rendered.ends_with(message), "{rendered:?}");
}

#[test]
fn file_lines_repeat_the_full_prefix_so_each_line_greps_alone() {
    let rendered = render(
        LogLine {
            timestamp: "12:34:56",
            process_tag: Some("host"),
            level: log::Level::Warn,
            target: "HostRuntime",
            message: "hostRuntime.stats reason=shutdown\nPools\n  Io/Lane",
        },
        LogSink::File,
        false,
    );

    let lines = rendered.lines().collect::<Vec<_>>();
    assert_eq!(lines.len(), 3);
    for entry in &lines {
        assert!(
            entry.starts_with("12:34:56  WARN  host [HostRuntime] "),
            "{entry:?}"
        );
    }
    assert!(!rendered.contains(ANSI_ESCAPE));
    assert!(!rendered.contains('\u{2502}'));
}

#[test]
fn file_lines_are_never_wrapped_whatever_the_terminal_width_is() {
    let message = "launcher.scan.start modsPath=E:\\Mods count=12 enabled=true warnings=none";
    let rendered = format_log_line_within(
        LogLine {
            timestamp: "12:34:56",
            process_tag: Some("host"),
            level: log::Level::Info,
            target: "Launcher",
            message,
        },
        LogSink::File,
        false,
        Some(40),
    );

    assert_eq!(rendered.lines().count(), 1, "{rendered:?}");
    assert!(rendered.ends_with(message), "{rendered:?}");
}

#[test]
fn file_lines_keep_the_full_target_the_terminal_column_abbreviates() {
    let target = "Localization.MachineTranslation";
    let rendered = render(
        LogLine {
            timestamp: "12:34:56",
            process_tag: Some("host"),
            level: log::Level::Info,
            target,
            message: "translation.started job=alpha",
        },
        LogSink::File,
        false,
    );

    // Grepping the log file by target only works if the name is never shortened.
    assert!(rendered.contains(&format!("[{target}]")), "{rendered:?}");
}

#[test]
fn file_lines_keep_console_bridge_metadata_that_the_terminal_hides() {
    let message = "[vite] hot updated: /src/styles/index.css method=debug source=console count=3";

    let terminal = render(
        line(log::Level::Debug, "Webview", message),
        LogSink::Terminal,
        true,
    );
    assert!(!terminal.contains("method="), "{terminal:?}");
    assert!(!terminal.contains("source="), "{terminal:?}");
    assert!(
        terminal.contains("\u{1b}[90mcount\u{1b}[39m\u{1b}[90m=\u{1b}[39m3"),
        "{terminal:?}"
    );
    // Free-form message text is left exactly as the emitter wrote it.
    assert!(terminal.contains("/src/styles/index.css"), "{terminal:?}");

    let file = render(
        line(log::Level::Debug, "Webview", message),
        LogSink::File,
        false,
    );
    assert!(file.contains("method=debug"), "{file:?}");
    assert!(file.contains("source=console"), "{file:?}");
    assert!(file.contains("count=3"), "{file:?}");
}

#[test]
fn only_warn_and_error_levels_get_a_filled_badge() {
    let cases = [
        (log::Level::Trace, "\u{1b}[90m TRACE \u{1b}[39m"),
        (log::Level::Debug, "\u{1b}[90m DEBUG \u{1b}[39m"),
        (log::Level::Info, "\u{1b}[90m INFO  \u{1b}[39m"),
        (log::Level::Warn, "\u{1b}[30;43m WARN  \u{1b}[0m"),
        (log::Level::Error, "\u{1b}[37;41m ERROR \u{1b}[0m"),
    ];

    for (level, expected) in cases {
        let rendered = render(
            line(level, "Nexus", "nexus.request.start ok=true"),
            LogSink::Terminal,
            true,
        );
        assert!(
            rendered.contains(expected),
            "expected {level} line to contain {expected:?}, got {rendered:?}"
        );
    }
}

#[test]
fn field_values_outrank_their_keys() {
    let rendered = render(
        line(
            log::Level::Warn,
            "Nexus",
            "nexus.request.failed host=api.nexusmods.com attempts=3 cached=false error=\"connection reset\"",
        ),
        LogSink::Terminal,
        true,
    );

    assert!(
        rendered.contains("\u{1b}[90m12:34:56\u{1b}[39m"),
        "{rendered:?}"
    );
    assert!(
        rendered.contains("\u{1b}[90m[Nexus]\u{1b}[39m"),
        "{rendered:?}"
    );
    assert!(
        rendered.contains("\u{1b}[1mnexus.request.failed\u{1b}[0m"),
        "{rendered:?}"
    );
    // Keys recede to grey; the values beside them keep the default foreground,
    // which is what makes the data the brightest thing on the line.
    for (key, value) in [
        ("host", "api.nexusmods.com"),
        ("attempts", "3"),
        ("cached", "false"),
    ] {
        assert!(
            rendered.contains(&format!(
                "\u{1b}[90m{key}\u{1b}[39m\u{1b}[90m=\u{1b}[39m{value}"
            )),
            "expected a grey {key} key and an uncolored value in {rendered:?}"
        );
    }
    // The failure reason is the one colored value, and its quotes recede.
    assert!(
        rendered.contains(
            "\u{1b}[90m\"\u{1b}[39m\u{1b}[31mconnection reset\u{1b}[39m\u{1b}[90m\"\u{1b}[39m"
        ),
        "{rendered:?}"
    );
}

#[test]
fn routine_values_are_never_colorized() {
    let rendered = render(
        line(
            log::Level::Info,
            "HostRuntime",
            "hostRuntime.command.finished elapsedMs=1284 usage=75.0% active=3/8 lane=Io ok=true",
        ),
        LogSink::Terminal,
        true,
    );

    // Paths, numbers and booleans used to each get their own color, which turned
    // every line into a swatch. Grey keys carry the separation instead.
    for (key, value) in [
        ("elapsedMs", "1284"),
        ("usage", "75.0%"),
        ("active", "3/8"),
        ("lane", "Io"),
        ("ok", "true"),
    ] {
        assert!(
            rendered.contains(&format!(
                "\u{1b}[90m{key}\u{1b}[39m\u{1b}[90m=\u{1b}[39m{value}"
            )),
            "expected an uncolored {key} value in {rendered:?}"
        );
    }
}

#[test]
fn only_error_fields_are_colorized_not_every_field_on_a_warn_line() {
    let clean_shutdown = render(
        line(
            log::Level::Warn,
            "HostRuntime",
            "hostRuntime.stats reason=shutdown uptime=4m12s",
        ),
        LogSink::Terminal,
        true,
    );
    // `reason` is a general-purpose discriminator, so a clean shutdown on a warn
    // line must not be painted like a failure. The badge already carries the level.
    assert!(
        clean_shutdown.contains("\u{1b}[90mreason\u{1b}[39m\u{1b}[90m=\u{1b}[39mshutdown"),
        "{clean_shutdown:?}"
    );
    assert!(!clean_shutdown.contains("\u{1b}[31m"), "{clean_shutdown:?}");

    let failure = render(
        line(
            log::Level::Warn,
            "Nexus",
            "nexus.request.failed error=timeout",
        ),
        LogSink::Terminal,
        true,
    );
    assert!(
        failure.contains("\u{1b}[31mtimeout\u{1b}[39m"),
        "{failure:?}"
    );
}

#[test]
fn quoted_field_values_stay_one_segment() {
    let rendered = render(
        line(
            log::Level::Info,
            "Launcher.Trace",
            "launcher.cache.miss modsPath=\"E:\\Stardew Valley\\Mods\" entryState=missing",
        ),
        LogSink::Terminal,
        true,
    );

    // The path keeps its spaces and its quotes, on one line, uncolored.
    assert!(
        rendered.contains("\u{1b}[90m\"\u{1b}[39mE:\\Stardew Valley\\Mods\u{1b}[90m\"\u{1b}[39m"),
        "{rendered:?}"
    );
    assert!(
        rendered.contains("\u{1b}[90mentryState\u{1b}[39m\u{1b}[90m=\u{1b}[39mmissing"),
        "{rendered:?}"
    );
    assert_eq!(rendered.lines().count(), 1, "{rendered:?}");
}

#[test]
fn free_form_message_text_is_passed_through_untouched() {
    let message = "Keys should be unique across updates. in a future version. see /src/index.css";
    let rendered = render(
        line(log::Level::Error, "Webview", message),
        LogSink::Terminal,
        true,
    );

    // A console-mirrored sentence has no fields to style, so nothing in the body
    // is colorized at all.
    assert!(rendered.ends_with(message), "{rendered:?}");
}

#[test]
fn visible_width_ignores_ansi_sequences() {
    let plain = render(
        line(log::Level::Info, "Nexus", "nexus.request.start"),
        LogSink::Terminal,
        false,
    );
    let colored = render(
        line(log::Level::Info, "Nexus", "nexus.request.start"),
        LogSink::Terminal,
        true,
    );

    assert!(colored.len() > plain.len());
    assert_eq!(visible_width(&colored), plain.chars().count());
}

#[test]
fn terminal_color_policy_respects_modforge_override() {
    let _guard = lock_env();
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
    let _guard = lock_env();
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
fn explicit_log_width_env_overrides_the_detected_terminal_width() {
    let _guard = lock_env();
    let message =
        "launcher.scan.start modsPath=E:\\Mods count=12 enabled=true warnings=none files=8";

    unsafe {
        std::env::set_var("MODFORGE_LOG_WIDTH", "90");
    }
    let wrapped = super::format_log_line(
        line(log::Level::Info, "Launcher", message),
        LogSink::Terminal,
        false,
    );
    assert!(wrapped.lines().count() > 1, "{wrapped:?}");

    unsafe {
        std::env::set_var("MODFORGE_LOG_WIDTH", "off");
    }
    let unwrapped = super::format_log_line(
        line(log::Level::Info, "Launcher", message),
        LogSink::Terminal,
        false,
    );
    assert_eq!(unwrapped.lines().count(), 1, "{unwrapped:?}");

    unsafe {
        std::env::remove_var("MODFORGE_LOG_WIDTH");
    }
}
