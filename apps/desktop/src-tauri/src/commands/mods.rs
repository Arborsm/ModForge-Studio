pub use crate::domain::mods::SaveModI18nFilesRequest;
use crate::domain::mods::{
    ModAssetIndex, ModProjectDetail, ModProjectSummary, SaveModI18nFilesResult,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn scan_mod_projects(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
) -> Result<Vec<ModProjectSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_mod_projects),
        json!({ "rootPath": root_path }),
    )
    .await
}

#[tauri::command]
pub async fn scan_mod_asset_index(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
) -> Result<ModAssetIndex, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_mod_asset_index),
        json!({ "rootPath": root_path }),
    )
    .await
}

#[tauri::command]
pub async fn load_mod_project(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<ModProjectDetail, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_mod_project),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn inspect_mod_archive(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<ModProjectDetail, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(inspect_mod_archive),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn save_mod_i18n_files(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SaveModI18nFilesRequest,
) -> Result<SaveModI18nFilesResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_mod_i18n_files),
        json!({ "request": request }),
    )
    .await
}
