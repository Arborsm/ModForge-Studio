pub(crate) const LAUNCHER_TRACE_TARGET: &str = "Launcher Trace";

pub(crate) fn format_launcher_trace_message(action: &str, fields: &[(&str, String)]) -> String {
    let context = fields
        .iter()
        .filter_map(|(key, value)| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                return None;
            }

            Some(format!("{key}={trimmed:?}"))
        })
        .collect::<Vec<_>>()
        .join(" ");

    if context.is_empty() {
        format!("launcher.{action}")
    } else {
        format!("launcher.{action} {context}")
    }
}

pub(crate) fn log_launcher_trace(action: &str, fields: &[(&str, String)]) {
    log::debug!(
        target: LAUNCHER_TRACE_TARGET,
        "{}",
        format_launcher_trace_message(action, fields)
    );
}
