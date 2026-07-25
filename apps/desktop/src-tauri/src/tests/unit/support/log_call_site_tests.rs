//! Static guard: every backend log line goes through `LogEvent`.
//!
//! The builder owns quoting, optional-field handling and field naming, so a
//! hand-written `log::warn!("… key={}", value)` silently reintroduces the
//! inconsistent formats this module replaced.

use std::fs;
use std::path::{Path, PathBuf};

/// The only places allowed to touch a `log::` macro directly.
const ALLOWED_MACRO_FILES: &[&str] = &[
    // The builder itself is the one legitimate emitter.
    "support/logging/event.rs",
    // Tauri command errors are pre-rendered by `format_tauri_command_error`.
    "support/logging/mod.rs",
];

fn source_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn production_sources() -> Vec<(String, String)> {
    let root = source_root();
    let mut sources = Vec::new();
    let mut stack = vec![root.clone()];

    while let Some(directory) = stack.pop() {
        for entry in fs::read_dir(&directory)
            .unwrap_or_else(|error| panic!("failed to read {}: {error}", directory.display()))
        {
            let path = entry.expect("directory entry").path();
            if path.is_dir() {
                // Test fixtures assert on rendered output and may spell out formats.
                if path.file_name().is_some_and(|name| name == "tests") {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if path.extension().is_none_or(|extension| extension != "rs") {
                continue;
            }
            let relative = path
                .strip_prefix(&root)
                .expect("source path under src")
                .to_string_lossy()
                .replace('\\', "/");
            let source = fs::read_to_string(&path)
                .unwrap_or_else(|error| panic!("failed to read {}: {error}", path.display()));
            sources.push((relative, source));
        }
    }

    sources.sort_by(|left, right| left.0.cmp(&right.0));
    sources
}

#[test]
fn production_code_emits_logs_through_the_event_builder() {
    let mut offenders = Vec::new();

    for (relative, source) in production_sources() {
        if ALLOWED_MACRO_FILES.contains(&relative.as_str()) {
            continue;
        }
        for (index, line) in source.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") {
                continue;
            }
            for macro_name in [
                "log::debug!",
                "log::info!",
                "log::warn!",
                "log::error!",
                "log::trace!",
                "log::log!",
            ] {
                if trimmed.contains(macro_name) {
                    offenders.push(format!("{relative}:{}: {trimmed}", index + 1));
                }
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "build log lines with LogEvent instead of a log:: macro:\n{}",
        offenders.join("\n")
    );
}

#[test]
fn log_targets_come_from_the_typed_targets_module() {
    let mut offenders = Vec::new();

    for (relative, source) in production_sources() {
        if relative == "support/logging/event.rs" {
            continue;
        }
        for (index, line) in source.lines().enumerate() {
            let trimmed = line.trim_start();
            if trimmed.starts_with("//") {
                continue;
            }
            // A literal target string bypasses `targets::*`, so renaming a
            // namespace would silently leave stragglers behind.
            if trimmed.contains("target: \"") {
                offenders.push(format!("{relative}:{}: {trimmed}", index + 1));
            }
            if trimmed.contains("emit_debug(\"")
                || trimmed.contains("emit_info(\"")
                || trimmed.contains("emit_warn(\"")
                || trimmed.contains("emit_error(\"")
            {
                offenders.push(format!("{relative}:{}: {trimmed}", index + 1));
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "use a targets::* constant instead of a literal log target:\n{}",
        offenders.join("\n")
    );
}
