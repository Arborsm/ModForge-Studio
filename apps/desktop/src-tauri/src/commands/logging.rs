use tauri::State;

#[tauri::command]
pub fn write_frontend_log(request: crate::support::logging::FrontendLogRequest) {
    crate::support::logging::write_frontend_log(request);
}

#[tauri::command]
pub fn set_debug_logging_enabled(
    state: State<'_, crate::support::logging::DebugLoggingState>,
    enabled: bool,
) {
    crate::support::logging::set_debug_logging_enabled(&state, enabled);
}
