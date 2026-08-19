//! Host command bindings for logging: frontend log forwarding, debug toggle,
//! and host runtime diagnostics snapshot.

use crate::AppHandle;
use crate::support::logging::FrontendLogRequest;
use host_command_macros::host_command;
use serde_json::Value;

/// Forwards a frontend console log entry into the backend structured logger.
#[host_command(control, wrap(raw))]
pub async fn write_frontend_log(app: AppHandle, request: FrontendLogRequest) -> Result<(), String> {
    crate::support::logging::write_frontend_log(request);
    Ok(Value::Null)
}

/// Toggles backend debug-level logging on or off.
#[host_command(control, wrap(raw))]
pub async fn set_debug_logging_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    crate::support::logging::set_debug_logging_enabled(&debug_logging_state, enabled);
    Ok(Value::Null)
}

/// Prints a manual snapshot of host runtime diagnostics to the log.
#[host_command(control, context)]
pub async fn print_host_runtime_diagnostics(app: AppHandle) -> Result<(), String> {
    command_context.print_diagnostics_summary("manual snapshot");
    Ok(Value::Null)
}
