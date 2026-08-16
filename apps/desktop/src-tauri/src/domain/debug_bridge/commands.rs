use crate::AppHandle;
use crate::domain;
use crate::domain::debug_bridge::{DebugBridgeModState, DebugBridgeStatus};
use host_command_macros::host_command;
use serde_json::Value;

#[host_command(network)]
pub async fn get_debug_bridge_status(
    app: AppHandle,
    port: Option<u16>,
) -> Result<DebugBridgeStatus, String> {
    domain::debug_bridge::get_debug_bridge_status(port)
}

#[host_command(network)]
pub async fn send_debug_bridge_command(app: AppHandle, request: Value) -> Result<Value, String> {
    domain::debug_bridge::send_debug_bridge_command(request)
}

#[host_command(io)]
pub async fn get_debug_bridge_mod_state(
    app: AppHandle,
    game_root_path: String,
) -> Result<DebugBridgeModState, String> {
    domain::debug_bridge::get_debug_bridge_mod_state(game_root_path)
}

#[host_command(mutation, resources(DebugBridgeInstall))]
pub async fn install_debug_bridge_mod(
    app: AppHandle,
    game_root_path: String,
) -> Result<DebugBridgeModState, String> {
    domain::debug_bridge::install_debug_bridge_mod(game_root_path)
}
