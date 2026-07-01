use crate::domain::content_patcher::types::{
    ContentPatcherProjectSnapshot, ExportContentPatcherAssetRequest,
    ExportContentPatcherAssetResult, LoadContentPatcherResultAssetRequest,
    LoadContentPatcherResultAssetResult, SimulateContentPatcherRequest,
    SimulateContentPatcherResult,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn load_content_patcher_project(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<ContentPatcherProjectSnapshot, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_content_patcher_project),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn simulate_content_patcher(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SimulateContentPatcherRequest,
) -> Result<SimulateContentPatcherResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(simulate_content_patcher),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_content_patcher_result_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadContentPatcherResultAssetRequest,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_content_patcher_result_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn export_content_patcher_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ExportContentPatcherAssetRequest,
) -> Result<ExportContentPatcherAssetResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(export_content_patcher_asset),
        json!({ "request": request }),
    )
    .await
}
