use crate::AppHandle;
use crate::domain;
use crate::domain::app_ui::{AppUiState, AppUiStatePatch};
use host_command_macros::host_command;

#[host_command(mutation, resources(AppUiState))]
pub async fn load_app_ui_state(app: AppHandle) -> Result<AppUiState, String> {
    domain::app_ui::load_app_ui_state()
}

#[host_command(mutation, resources(AppUiState))]
pub async fn patch_app_ui_state(
    app: AppHandle,
    request: AppUiStatePatch,
) -> Result<AppUiState, String> {
    domain::app_ui::patch_app_ui_state(request)
}
