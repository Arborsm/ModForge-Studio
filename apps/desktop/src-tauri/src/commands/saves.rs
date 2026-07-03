use crate::domain::saves::DefaultSaveSlotSummary;
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn scan_default_save_slots(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<DefaultSaveSlotSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_default_save_slots),
        json!({}),
    )
}
