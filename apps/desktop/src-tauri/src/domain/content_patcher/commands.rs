use crate::AppHandle;
use crate::domain;
use crate::domain::content_patcher::types::{
    LoadContentPatcherResultAssetRequest, LoadContentPatcherResultAssetResult,
};
use host_command_macros::host_command;

#[host_command(io)]
pub async fn load_content_patcher_result_asset(
    app: AppHandle,
    request: LoadContentPatcherResultAssetRequest,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    domain::content_patcher::load_content_patcher_result_asset(request)
}
