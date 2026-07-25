use std::io::IsTerminal;

use owo_colors::OwoColorize;

use super::event::{is_event_name, is_field_key};

const LOG_COLOR_ENV: &str = "MODFORGE_LOG_COLOR";
const LOG_WIDTH_ENV: &str = "MODFORGE_LOG_WIDTH";
const TARGET_COLUMN_WIDTH: usize = 24;
const CONTINUATION_GUTTER: &str = "\u{2502} ";
/// Wrapping into a message column narrower than this trades one unreadable line
/// for several, so below it the line is left to the terminal.
const MIN_MESSAGE_WIDTH: usize = 32;

/// Where a formatted line is going, which decides how much is trimmed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogSink {
    /// Aligned, colorized, wrapped, console-bridge metadata dropped.
    Terminal,
    /// Plain, full metadata, every line individually prefixed for grep.
    File,
}

impl LogSink {
    fn is_terminal(self) -> bool {
        self == Self::Terminal
    }
}

/// One resolved log line ready for layout.
#[derive(Debug, Clone, Copy)]
pub struct LogLine<'a> {
    pub timestamp: &'a str,
    pub process_tag: Option<&'a str>,
    pub level: log::Level,
    pub target: &'a str,
    pub message: &'a str,
}

/// Lays out a log record for the given sink, wrapping to the detected terminal
/// width.
pub fn format_log_line(line: LogLine<'_>, sink: LogSink, colorize: bool) -> String {
    format_log_line_within(line, sink, colorize, terminal_wrap_width())
}

/// Lays out a log record against an explicit wrap width, `None` meaning no wrap.
///
/// Terminal output is a fixed set of columns — time, level badge, bracketed
/// target, message — so scanning a busy dev console stays possible. Fields that
/// do not fit continue under a gutter marker in the same column instead of
/// soft-wrapping to column zero and breaking the alignment. Block bodies are
/// pre-formatted tables, so they keep their own spacing and are never re-wrapped.
/// File output repeats the full prefix on every line instead, verbatim, so each
/// line greps alone.
pub fn format_log_line_within(
    line: LogLine<'_>,
    sink: LogSink,
    colorize: bool,
    wrap_width: Option<usize>,
) -> String {
    let prefix = render_prefix(line, sink, colorize);

    if !sink.is_terminal() {
        return line
            .message
            .lines()
            .map(|body| format!("{prefix}{body}"))
            .collect::<Vec<_>>()
            .join("\n");
    }

    let prefix_width = visible_width(&prefix);
    let gutter_width = CONTINUATION_GUTTER.chars().count();
    let budget = |reserved: usize| {
        wrap_width
            .map(|width| width.saturating_sub(prefix_width + reserved))
            .filter(|available| *available >= MIN_MESSAGE_WIDTH)
    };

    let mut physical = Vec::new();
    for (index, source) in line.message.lines().enumerate() {
        if index == 0 {
            let segments = message_segments(source, colorize);
            physical.extend(wrap_segments(&segments, budget(0), budget(gutter_width)));
        } else {
            physical.push(style_block_line(source, colorize));
        }
    }

    let indent = " ".repeat(prefix_width);
    let gutter = style_structure(CONTINUATION_GUTTER, colorize);
    physical
        .iter()
        .enumerate()
        .map(|(index, body)| {
            if index == 0 {
                format!("{prefix}{body}")
            } else {
                format!("{indent}{gutter}{body}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn render_prefix(line: LogLine<'_>, sink: LogSink, colorize: bool) -> String {
    let mut prefix = String::new();
    prefix.push_str(&style_structure(line.timestamp, colorize));
    // The terminal badge carries its own surrounding space; the file label does
    // not, so it gets the wider gap that keeps both sinks readable.
    prefix.push_str(if sink.is_terminal() { " " } else { "  " });
    prefix.push_str(&style_level(line.level, sink, colorize));
    prefix.push(' ');

    if let Some(tag) = line.process_tag {
        prefix.push_str(&style_process_tag(tag, colorize));
        prefix.push(' ');
    }

    if sink.is_terminal() {
        let target = format!("[{}]", fit_target(line.target));
        // Anything still wider than the column overflows into the message rather
        // than losing characters, and keeps exactly one separating space.
        let padding = TARGET_COLUMN_WIDTH.saturating_sub(target.chars().count() + 1);
        prefix.push_str(&style_target(&target, colorize));
        prefix.push_str(&" ".repeat(padding + 1));
    } else {
        prefix.push_str(&format!("[{}] ", line.target));
    }

    prefix
}

/// Shrinks a dotted target until it fits the terminal column.
///
/// Leading namespace segments collapse to their initial, the way logger names are
/// abbreviated elsewhere, so `Localization.MachineTranslation` reads as
/// `L.MachineTranslation`. The last segment is what distinguishes one target from
/// another and is never touched, and the log file always keeps the full name so
/// grepping by target still works.
fn fit_target(target: &str) -> String {
    let budget = TARGET_COLUMN_WIDTH.saturating_sub("[] ".len());
    if target.chars().count() <= budget {
        return target.to_string();
    }

    let mut segments: Vec<String> = target.split('.').map(str::to_string).collect();
    let last = segments.len().saturating_sub(1);
    for (index, segment) in segments.iter_mut().enumerate() {
        if index == last {
            break;
        }
        if let Some(initial) = segment.chars().next() {
            *segment = initial.to_string();
        }
    }

    segments.join(".")
}

fn style_level(level: log::Level, sink: LogSink, colorize: bool) -> String {
    let label = format!("{:<5}", level.as_str());
    if !sink.is_terminal() {
        return label;
    }

    // The badge keeps its padding even without color so a `MODFORGE_LOG_COLOR=never`
    // terminal lines up column-for-column with a colorized one.
    let badge = format!(" {label} ");
    if !colorize {
        return badge;
    }

    // Only warn and error get a filled badge. Routine levels are the common case,
    // so a colored block on every line becomes noise rather than signal.
    match level {
        log::Level::Trace | log::Level::Debug => badge.bright_black().to_string(),
        log::Level::Info => badge.bright_black().to_string(),
        log::Level::Warn => badge.black().on_yellow().to_string(),
        log::Level::Error => badge.white().on_red().to_string(),
    }
}

/// Subordinate text — timestamp, field keys, `=`, quotes, the wrap gutter.
///
/// ANSI dim (SGR 2) is deliberately avoided: on a mid-grey terminal background it
/// renders close to unreadable. Bright black is the one recede color used
/// throughout, so the palette stays monochrome apart from genuine signal.
fn style_structure(value: &str, colorize: bool) -> String {
    if colorize {
        value.bright_black().to_string()
    } else {
        value.to_string()
    }
}

fn style_process_tag(value: &str, colorize: bool) -> String {
    style_structure(value, colorize)
}

fn style_target(value: &str, colorize: bool) -> String {
    style_structure(value, colorize)
}

/// Styled head-line tokens paired with the terminal columns they occupy.
fn message_segments(message: &str, colorize: bool) -> Vec<(String, usize)> {
    split_message_segments(message.trim_start())
        .iter()
        .enumerate()
        .filter_map(|(index, segment)| {
            style_token(segment, index == 0, colorize, true)
                .map(|styled| (styled, segment.chars().count()))
        })
        .collect()
}

/// Number of fields a continuation line must carry to be worth creating.
///
/// Pushing a single trailing field onto its own line costs a whole row to show
/// one `key=value`, which reads worse than letting the line run slightly over.
const MIN_SEGMENTS_PER_CONTINUATION: usize = 2;

fn wrap_segments(
    segments: &[(String, usize)],
    first_budget: Option<usize>,
    continuation_budget: Option<usize>,
) -> Vec<String> {
    let Some(first_limit) = first_budget else {
        return vec![join_segments(segments)];
    };

    // The head line always keeps the event name, and wrapping is only worth it
    // when enough fields follow to fill a continuation line.
    let total_width = segments_width(segments);
    if total_width <= first_limit || segments.len() <= MIN_SEGMENTS_PER_CONTINUATION {
        return vec![join_segments(segments)];
    }

    let continuation_limit = continuation_budget.unwrap_or(first_limit);
    let mut lines: Vec<Vec<&(String, usize)>> = Vec::new();
    let mut current: Vec<&(String, usize)> = Vec::new();
    let mut current_width = 0;

    for segment in segments {
        let limit = if lines.is_empty() {
            first_limit
        } else {
            continuation_limit
        };
        let projected = if current.is_empty() {
            segment.1
        } else {
            current_width + 1 + segment.1
        };

        // An over-wide segment is never split; it just overflows its own line.
        if !current.is_empty() && projected > limit {
            lines.push(std::mem::take(&mut current));
            current_width = 0;
        }

        current_width += if current.is_empty() { 0 } else { 1 };
        current_width += segment.1;
        current.push(segment);
    }

    // Fold a lone trailing field back into the previous line rather than
    // stranding it under a gutter on a row of its own.
    if current.len() < MIN_SEGMENTS_PER_CONTINUATION
        && let Some(previous) = lines.last_mut()
    {
        previous.append(&mut current);
    }
    if !current.is_empty() {
        lines.push(current);
    }

    lines
        .iter()
        .map(|line| {
            line.iter()
                .map(|(styled, _)| styled.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect()
}

fn join_segments(segments: &[(String, usize)]) -> String {
    segments
        .iter()
        .map(|(styled, _)| styled.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

fn segments_width(segments: &[(String, usize)]) -> usize {
    let separators = segments.len().saturating_sub(1);
    segments
        .iter()
        .map(|(_, width)| width)
        .sum::<usize>()
        .saturating_add(separators)
}

/// Styles a pre-formatted block line, preserving its own column alignment.
fn style_block_line(source: &str, colorize: bool) -> String {
    let mut rendered = String::new();
    let mut rest = source;

    while !rest.is_empty() {
        let leading_spaces = rest.len() - rest.trim_start().len();
        if leading_spaces > 0 {
            rendered.push_str(&rest[..leading_spaces]);
            rest = &rest[leading_spaces..];
            continue;
        }

        let token_len = rest.find(char::is_whitespace).unwrap_or(rest.len());
        let (token, remainder) = rest.split_at(token_len);
        if let Some(styled) = style_token(token, false, colorize, false) {
            rendered.push_str(&styled);
        }
        rest = remainder;
    }

    rendered
}

fn split_message_segments(message: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut quoted_pair: Option<String> = None;

    for token in message.split_whitespace() {
        if let Some(pair) = quoted_pair.as_mut() {
            pair.push(' ');
            pair.push_str(token);
            if ends_quoted_value(token) {
                segments.push(quoted_pair.take().expect("quoted pair must exist"));
            }
            continue;
        }

        if starts_open_quoted_key_value(token) {
            quoted_pair = Some(token.to_string());
        } else {
            segments.push(token.to_string());
        }
    }

    if let Some(pair) = quoted_pair {
        segments.push(pair);
    }

    segments
}

fn starts_open_quoted_key_value(token: &str) -> bool {
    let Some((key, value)) = token.split_once('=') else {
        return false;
    };

    is_field_key(key) && value.starts_with('"') && !ends_quoted_value(value)
}

fn ends_quoted_value(value: &str) -> bool {
    let mut characters = value.chars().rev();
    if characters.next() != Some('"') {
        return false;
    }

    // A trailing `\"` is escaped content, not the closing quote.
    let escapes = characters
        .take_while(|character| *character == '\\')
        .count();
    escapes % 2 == 0 && value.len() > 1
}

fn style_token(
    token: &str,
    is_first: bool,
    colorize: bool,
    hide_bridge_metadata: bool,
) -> Option<String> {
    if let Some((key, value)) = token.split_once('=')
        && is_field_key(key)
        && !value.is_empty()
    {
        if hide_bridge_metadata && is_console_bridge_metadata(key, value) {
            return None;
        }

        return Some(style_field(key, value, colorize));
    }

    if is_first && is_event_name(token) {
        return Some(style_event_name(token, colorize));
    }

    Some(token.to_string())
}

// Console-mirrored frontend lines always append `method=<level> source=console`;
// the level badge and Webview target already carry that, so the terminal hides it
// while the log file keeps the full metadata.
fn is_console_bridge_metadata(key: &str, value: &str) -> bool {
    (key == "source" && value == "console")
        || (key == "method" && matches!(value, "debug" | "info" | "warn" | "error"))
}

fn style_event_name(value: &str, colorize: bool) -> String {
    if colorize {
        value.bold().to_string()
    } else {
        value.to_string()
    }
}

/// Renders `key=value` with the key receding so the value it carries is what the
/// eye lands on.
fn style_field(key: &str, value: &str, colorize: bool) -> String {
    if !colorize {
        return format!("{key}={value}");
    }

    format!(
        "{}{}{}",
        style_structure(key, true),
        style_structure("=", true),
        style_field_value(key, value)
    )
}

fn style_field_value(key: &str, value: &str) -> String {
    match quoted_body(value) {
        // Quotes are punctuation, not payload, so they recede with the key.
        Some(body) => format!(
            "{}{}{}",
            style_structure("\"", true),
            style_scalar(key, body),
            style_structure("\"", true)
        ),
        None => style_scalar(key, value),
    }
}

/// Values carry the default foreground so they stand out against the grey keys.
///
/// Only a failure earns a color: coloring paths, numbers and booleans differently
/// turned every line into a swatch, which is exactly the noise the contrast
/// between grey key and plain value already solves.
fn style_scalar(key: &str, value: &str) -> String {
    if is_failure_field(key) {
        return value.red().to_string();
    }

    value.to_string()
}

/// True for the fields that always describe a failure, whatever level carried
/// them.
///
/// The level is deliberately not part of this. `reason` is a general-purpose
/// discriminator — `hostRuntime.stats reason=shutdown` is a clean shutdown — so
/// keying off the level painted routine warn lines as errors. When a record is a
/// warning, its badge already says so.
fn is_failure_field(key: &str) -> bool {
    matches!(key, "error" | "warnings")
}

fn quoted_body(value: &str) -> Option<&str> {
    if value.len() >= 2 && value.starts_with('"') && ends_quoted_value(value) {
        Some(&value[1..value.len() - 1])
    } else {
        None
    }
}

fn visible_width(value: &str) -> usize {
    let mut width = 0;
    let mut characters = value.chars();

    while let Some(character) = characters.next() {
        if character != '\u{1b}' {
            width += 1;
            continue;
        }

        // Skip the CSI sequence; it occupies no terminal columns.
        for escape in characters.by_ref() {
            if escape.is_ascii_alphabetic() {
                break;
            }
        }
    }

    width
}

/// Columns available for a terminal log line, or `None` when output is not going
/// to a terminal that has a width.
fn terminal_wrap_width() -> Option<usize> {
    if let Ok(value) = std::env::var(LOG_WIDTH_ENV) {
        let trimmed = value.trim();
        if matches!(trimmed.to_ascii_lowercase().as_str(), "0" | "off" | "none") {
            return None;
        }
        if let Ok(width) = trimmed.parse::<usize>() {
            return Some(width);
        }
    }

    // Records go to stdout from the host logger and stderr from the sidecar, and
    // under `tauri dev` both are pipes while stdin still carries the real
    // terminal, so every handle gets a try before giving up.
    let detected = terminal_size::terminal_size_of(std::io::stdout())
        .or_else(|| terminal_size::terminal_size_of(std::io::stderr()))
        .or_else(|| terminal_size::terminal_size_of(std::io::stdin()))
        .or_else(terminal_size::terminal_size);

    // Leaving the last column free keeps terminals that wrap on write from
    // inserting a blank line after a full-width record.
    //
    // When no handle reports a width the record is left whole: guessing a width
    // narrower than the real terminal wraps lines that would have fit, which is
    // worse than the terminal's own soft wrap. Set `MODFORGE_LOG_WIDTH` to get
    // aligned wrapping through a pipe.
    let (terminal_size::Width(width), _) = detected?;
    Some((width as usize).saturating_sub(1))
}

pub fn current_log_timestamp() -> String {
    let now = time::OffsetDateTime::now_local().unwrap_or_else(|_| time::OffsetDateTime::now_utc());
    format!("{:02}:{:02}:{:02}", now.hour(), now.minute(), now.second())
}

fn env_flag_is_enabled(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    !normalized.is_empty() && !matches!(normalized.as_str(), "0" | "false" | "no" | "off")
}

fn env_flag_is_disabled(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "0" | "false" | "no" | "off" | "never"
    )
}

pub fn should_colorize_terminal_output(is_terminal: bool) -> bool {
    if let Ok(value) = std::env::var(LOG_COLOR_ENV) {
        return match value.trim().to_ascii_lowercase().as_str() {
            "always" | "force" | "1" | "true" | "yes" | "on" => true,
            "never" | "0" | "false" | "no" | "off" => false,
            _ => is_terminal,
        };
    }

    if std::env::var_os("NO_COLOR").is_some() {
        return false;
    }

    if std::env::var("FORCE_COLOR").is_ok_and(|value| env_flag_is_enabled(&value)) {
        return true;
    }

    if std::env::var("CLICOLOR_FORCE").is_ok_and(|value| env_flag_is_enabled(&value)) {
        return true;
    }

    if std::env::var("CLICOLOR").is_ok_and(|value| env_flag_is_disabled(&value)) {
        return false;
    }

    is_terminal
}

pub fn stdout_colorize() -> bool {
    should_colorize_terminal_output(std::io::stdout().is_terminal())
}

pub fn stderr_colorize() -> bool {
    should_colorize_terminal_output(std::io::stderr().is_terminal())
}

#[cfg(test)]
#[path = "../../tests/unit/support/log_terminal_tests.rs"]
mod tests;
