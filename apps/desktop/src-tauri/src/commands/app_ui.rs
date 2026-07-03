use crate::domain::app_ui::{AppUiState, AppUiStatePatch};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn load_app_ui_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<AppUiState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_app_ui_state),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn patch_app_ui_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: AppUiStatePatch,
) -> Result<AppUiState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(patch_app_ui_state),
        json!({ "request": request }),
    )
    .await
}
