pub use crate::domain::mods::SaveModProjectRequest;
use crate::domain::mods::{
    ModAssetIndex, ModProjectDetail, ModProjectSummary, SaveModProjectResult,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn scan_mod_projects(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
) -> Result<Vec<ModProjectSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_mod_projects),
        json!({ "rootPath": root_path }),
    )
}

#[tauri::command]
pub fn scan_mod_asset_index(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
) -> Result<ModAssetIndex, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_mod_asset_index),
        json!({ "rootPath": root_path }),
    )
}

#[tauri::command]
pub fn load_mod_project(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<ModProjectDetail, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_mod_project),
        json!({ "path": path }),
    )
}

#[tauri::command]
pub fn save_mod_project(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SaveModProjectRequest,
) -> Result<SaveModProjectResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(save_mod_project),
        json!({ "request": request }),
    )
}
