use crate::domain::localization::types::*;
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

macro_rules! execute {
    ($app:expr,$debug:expr,$name:ident,$args:expr) => {
        crate::commands::runtime::execute_tauri_command(
            AppHandle::from_tauri($app),
            $debug.inner().clone(),
            crate::host_command_name!($name),
            $args,
        )
        .await
    };
}

#[tauri::command]
pub async fn load_machine_translation_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
) -> Result<MachineTranslationSettingsSnapshot, String> {
    execute!(app, debug, load_machine_translation_settings, json!({}))
}
#[tauri::command]
pub async fn save_machine_translation_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SaveMachineTranslationSettingsRequest,
) -> Result<MachineTranslationSettingsSnapshot, String> {
    execute!(
        app,
        debug,
        save_machine_translation_settings,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn list_machine_translation_languages(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: MachineTranslationProfileRequest,
) -> Result<Vec<MachineTranslationLanguage>, String> {
    execute!(
        app,
        debug,
        list_machine_translation_languages,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn test_machine_translation_profile(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: MachineTranslationProfileRequest,
) -> Result<MachineTranslationProfileTestResult, String> {
    execute!(
        app,
        debug,
        test_machine_translation_profile,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn translate_machine_translation_batch(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: MachineTranslateBatchRequest,
) -> Result<MachineTranslateBatchResult, String> {
    execute!(
        app,
        debug,
        translate_machine_translation_batch,
        json!({"request":request})
    )
}
