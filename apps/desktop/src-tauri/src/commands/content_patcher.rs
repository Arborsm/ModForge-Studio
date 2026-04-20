use crate::domain::content_patcher;
use crate::domain::content_patcher::types::{
    ContentPatcherPreviewRequest, ContentPatcherProjectSnapshot, ExportContentPatcherAssetRequest,
    ExportContentPatcherAssetResult, LoadContentPatcherResultAssetRequest,
    LoadContentPatcherResultAssetResult, SimulateContentPatcherRequest,
    SimulateContentPatcherResult,
};

#[tauri::command]
pub fn load_content_patcher_project(path: String) -> Result<ContentPatcherProjectSnapshot, String> {
    content_patcher::project::load_content_patcher_project(path)
}

#[tauri::command]
pub fn simulate_content_patcher(
    request: SimulateContentPatcherRequest,
) -> Result<SimulateContentPatcherResult, String> {
    content_patcher::simulate_content_patcher(request)
}

pub fn build_preview_simulation_request(
    request: ContentPatcherPreviewRequest,
) -> SimulateContentPatcherRequest {
    request.into()
}

#[tauri::command]
pub fn load_content_patcher_result_asset(
    request: LoadContentPatcherResultAssetRequest,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    content_patcher::load_content_patcher_result_asset(request)
}

#[tauri::command]
pub fn export_content_patcher_asset(
    request: ExportContentPatcherAssetRequest,
) -> Result<ExportContentPatcherAssetResult, String> {
    content_patcher::export_content_patcher_asset(request)
}
