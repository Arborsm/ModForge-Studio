use crate::domain::debug_bridge::{DebugBridgeModState, DebugBridgeStatus};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::{Value, json};
use tauri::State;

#[tauri::command]
pub async fn get_debug_bridge_status(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    port: Option<u16>,
) -> Result<DebugBridgeStatus, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(get_debug_bridge_status),
        json!({ "port": port }),
    )
    .await
}

#[tauri::command]
pub async fn send_debug_bridge_command(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: Value,
) -> Result<Value, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(send_debug_bridge_command),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn get_debug_bridge_mod_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    game_root_path: String,
) -> Result<DebugBridgeModState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(get_debug_bridge_mod_state),
        json!({ "gameRootPath": game_root_path }),
    )
    .await
}

#[tauri::command]
pub async fn install_debug_bridge_mod(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    game_root_path: String,
) -> Result<DebugBridgeModState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(install_debug_bridge_mod),
        json!({ "gameRootPath": game_root_path }),
    )
    .await
}
