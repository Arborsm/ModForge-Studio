use crate::domain::assets::{
    AudioAssetSummary, DataAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo,
    ImageAssetSummary, LocalTextFileContent, MapAssetContent, MapAssetSummary,
    ParsedEventAssetContent, TextAssetContent,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn detect_default_game_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Option<String>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(detect_default_game_directory),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn list_known_game_directories(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<String>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(list_known_game_directories),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn get_file_cache_stats(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<FileCacheStats, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(get_file_cache_stats),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn clear_file_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(clear_file_cache),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn validate_game_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<GameDirectoryInfo, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(validate_game_directory),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn scan_maps(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
    locale: Option<String>,
) -> Result<Vec<MapAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_maps),
        json!({ "path": path, "locale": locale }),
    )
    .await
}

#[tauri::command]
pub async fn scan_events(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<EventAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_events),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn load_map_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> Result<MapAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_map_asset),
        json!({ "rootPath": root_path, "mapPath": map_path, "locale": locale }),
    )
    .await
}

#[tauri::command]
pub async fn load_text_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<TextAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_text_asset),
        json!({ "rootPath": root_path, "assetPath": asset_path, "locale": locale }),
    )
    .await
}

#[tauri::command]
pub async fn load_event_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<ParsedEventAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_event_asset),
        json!({ "rootPath": root_path, "assetPath": asset_path, "locale": locale }),
    )
    .await
}

#[tauri::command]
pub async fn load_text_file(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<LocalTextFileContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_text_file),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn load_image_data_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
    locale: Option<String>,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_image_data_url),
        json!({ "path": path, "locale": locale }),
    )
    .await
}

#[tauri::command]
pub async fn scan_audio_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<AudioAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_audio_assets),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn scan_image_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<ImageAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_image_assets),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn scan_data_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<DataAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_data_assets),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn load_audio_data_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_audio_data_url),
        json!({ "path": path }),
    )
    .await
}

#[tauri::command]
pub async fn export_map_png(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    output_path: String,
    png_base64: String,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(export_map_png),
        json!({ "outputPath": output_path, "pngBase64": png_base64 }),
    )
    .await
}

#[tauri::command]
pub async fn export_file(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    output_path: String,
    content_base64: String,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(export_file),
        json!({ "outputPath": output_path, "contentBase64": content_base64 }),
    )
    .await
}
