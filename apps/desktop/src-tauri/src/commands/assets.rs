use crate::domain::assets::{
    AudioAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo, LocalTextFileContent,
    MapAssetContent, MapAssetSummary, TextAssetContent,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn detect_default_game_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Option<String>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(detect_default_game_directory),
        json!({}),
    )
}

#[tauri::command]
pub fn list_known_game_directories(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<String>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(list_known_game_directories),
        json!({}),
    )
}

#[tauri::command]
pub fn get_file_cache_stats(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<FileCacheStats, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(get_file_cache_stats),
        json!({}),
    )
}

#[tauri::command]
pub fn clear_file_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(clear_file_cache),
        json!({}),
    )
}

#[tauri::command]
pub fn validate_game_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<GameDirectoryInfo, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(validate_game_directory),
        json!({ "path": path }),
    )
}

#[tauri::command]
pub fn scan_maps(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
    locale: Option<String>,
) -> Result<Vec<MapAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_maps),
        json!({ "path": path, "locale": locale }),
    )
}

#[tauri::command]
pub fn scan_events(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<EventAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_events),
        json!({ "path": path }),
    )
}

#[tauri::command]
pub fn load_map_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> Result<MapAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_map_asset),
        json!({ "rootPath": root_path, "mapPath": map_path, "locale": locale }),
    )
}

#[tauri::command]
pub fn load_text_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<TextAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_text_asset),
        json!({ "rootPath": root_path, "assetPath": asset_path, "locale": locale }),
    )
}

#[tauri::command]
pub fn load_text_file(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<LocalTextFileContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_text_file),
        json!({ "path": path }),
    )
}

#[tauri::command]
pub fn load_image_data_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
    locale: Option<String>,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_image_data_url),
        json!({ "path": path, "locale": locale }),
    )
}

#[tauri::command]
pub fn scan_audio_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<Vec<AudioAssetSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_audio_assets),
        json!({ "path": path }),
    )
}

#[tauri::command]
pub fn load_audio_data_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    path: String,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_audio_data_url),
        json!({ "path": path }),
    )
}
