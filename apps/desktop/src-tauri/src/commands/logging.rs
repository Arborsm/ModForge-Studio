use crate::support::logging::{DebugLoggingState, FrontendLogRequest};
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn write_frontend_log(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: FrontendLogRequest,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(write_frontend_log),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn set_debug_logging_enabled(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    enabled: bool,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(set_debug_logging_enabled),
        json!({ "enabled": enabled }),
    )
    .await
}

#[tauri::command]
pub async fn print_host_runtime_diagnostics(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(print_host_runtime_diagnostics),
        json!({}),
    )
    .await
}
