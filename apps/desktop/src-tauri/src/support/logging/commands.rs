use crate::AppHandle;
use crate::support::logging::FrontendLogRequest;
use host_command_macros::host_command;
use serde_json::Value;

#[host_command(control, wrap(raw))]
pub async fn write_frontend_log(app: AppHandle, request: FrontendLogRequest) -> Result<(), String> {
    crate::support::logging::write_frontend_log(request);
    Ok(Value::Null)
}

#[host_command(control, wrap(raw))]
pub async fn set_debug_logging_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    crate::support::logging::set_debug_logging_enabled(&debug_logging_state, enabled);
    Ok(Value::Null)
}

#[host_command(control, context)]
pub async fn print_host_runtime_diagnostics(app: AppHandle) -> Result<(), String> {
    command_context.print_diagnostics_summary("manual snapshot");
    Ok(Value::Null)
}
