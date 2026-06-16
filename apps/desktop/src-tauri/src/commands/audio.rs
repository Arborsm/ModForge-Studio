use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn load_xact_audio_data_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    cue: String,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_xact_audio_data_url),
        json!({ "rootPath": root_path, "cue": cue }),
    )
}
