use crate::support::logging::{LogEvent, targets};

pub(crate) const LAUNCHER_TRACE_TARGET: &str = targets::LAUNCHER_TRACE;

/// Builds the `launcher.<action>` event for a launcher trace line.
pub(crate) fn launcher_trace_event(
    action: &str,
    build: impl FnOnce(LogEvent) -> LogEvent,
) -> LogEvent {
    build(LogEvent::new(format!("launcher.{action}")))
}

/// Emits a `launcher.<action>` trace line. Level and target live here so no
/// call site has to repeat them.
pub(crate) fn log_launcher_trace(action: &str, build: impl FnOnce(LogEvent) -> LogEvent) {
    launcher_trace_event(action, build).emit_debug(LAUNCHER_TRACE_TARGET);
}
