use crate::domain::content_patcher::types::{
    LoadContentPatcherResultAssetRequest, LoadContentPatcherResultAssetResult,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

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
