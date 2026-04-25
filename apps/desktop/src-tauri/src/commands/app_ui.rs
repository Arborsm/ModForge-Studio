use crate::domain::app_ui as domain_app_ui;
use crate::domain::app_ui::{AppUiState, AppUiStatePatch};

#[tauri::command]
pub fn load_app_ui_state(app: tauri::AppHandle) -> Result<AppUiState, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_app_ui_state",
        domain_app_ui::load_app_ui_state(app),
    )
}

#[tauri::command]
pub fn patch_app_ui_state(
    app: tauri::AppHandle,
    request: AppUiStatePatch,
) -> Result<AppUiState, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "patch_app_ui_state",
        domain_app_ui::patch_app_ui_state(app, request),
    )
}
