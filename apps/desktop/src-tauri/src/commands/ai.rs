use crate::domain::ai::types::{
    AiModelInfo, AiProfileImportPreview, AiProfileImportResult, AiProfileRequest,
    AiProfileTestResult, AiSettingsSnapshot, AiTranslateBatchRequest, AiTranslateBatchResult,
    AiTranslationCacheEntry, AiTranslationCacheStats, ApplyAiProfilesImportRequest,
    CancelAiJobRequest, ExportAiProfilesRequest, ModelsDevCatalog, PreviewAiProfilesImportRequest,
    ReadAiTranslationCacheRequest, SaveAiSettingsRequest,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

macro_rules! execute {
    ($app:expr, $debug:expr, $name:ident, $args:expr) => {
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
pub async fn load_ai_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
) -> Result<AiSettingsSnapshot, String> {
    execute!(app, debug, load_ai_settings, json!({}))
}

#[tauri::command]
pub async fn save_ai_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SaveAiSettingsRequest,
) -> Result<AiSettingsSnapshot, String> {
    execute!(app, debug, save_ai_settings, json!({ "request": request }))
}

#[tauri::command]
pub async fn export_ai_profiles(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ExportAiProfilesRequest,
) -> Result<u32, String> {
    execute!(
        app,
        debug,
        export_ai_profiles,
        json!({ "request": request })
    )
}

#[tauri::command]
pub async fn preview_ai_profiles_import(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: PreviewAiProfilesImportRequest,
) -> Result<AiProfileImportPreview, String> {
    execute!(
        app,
        debug,
        preview_ai_profiles_import,
        json!({ "request": request })
    )
}

#[tauri::command]
pub async fn apply_ai_profiles_import(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ApplyAiProfilesImportRequest,
) -> Result<AiProfileImportResult, String> {
    execute!(
        app,
        debug,
        apply_ai_profiles_import,
        json!({ "request": request })
    )
}

#[tauri::command]
pub async fn list_ai_models(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiProfileRequest,
) -> Result<Vec<AiModelInfo>, String> {
    execute!(app, debug, list_ai_models, json!({ "request": request }))
}

#[tauri::command]
pub async fn fetch_ai_models_dev_catalog(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
) -> Result<ModelsDevCatalog, String> {
    execute!(app, debug, fetch_ai_models_dev_catalog, json!({}))
}

#[tauri::command]
pub async fn test_ai_profile(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiProfileRequest,
) -> Result<AiProfileTestResult, String> {
    execute!(app, debug, test_ai_profile, json!({ "request": request }))
}

#[tauri::command]
pub async fn translate_ai_batch(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiTranslateBatchRequest,
) -> Result<AiTranslateBatchResult, String> {
    execute!(
        app,
        debug,
        translate_ai_batch,
        json!({ "request": request })
    )
}

#[tauri::command]
pub async fn cancel_ai_job(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: CancelAiJobRequest,
) -> Result<(), String> {
    execute!(app, debug, cancel_ai_job, json!({ "request": request }))
}

#[tauri::command]
pub async fn read_ai_translation_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ReadAiTranslationCacheRequest,
) -> Result<Option<AiTranslationCacheEntry>, String> {
    execute!(
        app,
        debug,
        read_ai_translation_cache,
        json!({ "request": request })
    )
}

#[tauri::command]
pub async fn write_ai_translation_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    entry: AiTranslationCacheEntry,
) -> Result<AiTranslationCacheEntry, String> {
    execute!(
        app,
        debug,
        write_ai_translation_cache,
        json!({ "entry": entry })
    )
}

#[tauri::command]
pub async fn get_ai_translation_cache_stats(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
) -> Result<AiTranslationCacheStats, String> {
    execute!(app, debug, get_ai_translation_cache_stats, json!({}))
}

#[tauri::command]
pub async fn clear_ai_translation_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
) -> Result<AiTranslationCacheStats, String> {
    execute!(app, debug, clear_ai_translation_cache, json!({}))
}
