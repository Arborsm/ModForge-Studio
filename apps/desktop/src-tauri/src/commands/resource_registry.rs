use crate::domain::resource_registry::ResourceRegistry;
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn load_resource_registry(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    locale: Option<String>,
) -> Result<ResourceRegistry, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_resource_registry),
        json!({ "rootPath": root_path, "locale": locale }),
    )
    .await
}
