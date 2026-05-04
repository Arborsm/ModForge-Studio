use crate::domain::assets as domain_assets;
use crate::domain::assets::{
    AudioAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo, LocalTextFileContent,
    MapAssetContent, MapAssetSummary, TextAssetContent,
};

#[tauri::command]
pub fn detect_default_game_directory() -> Option<String> {
    domain_assets::detect_default_game_directory()
}

#[tauri::command]
pub fn list_known_game_directories() -> Vec<String> {
    domain_assets::list_known_game_directories()
}

#[tauri::command]
pub fn get_file_cache_stats() -> Result<FileCacheStats, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "get_file_cache_stats",
        domain_assets::get_file_cache_stats(),
    )
}

#[tauri::command]
pub fn clear_file_cache() -> Result<(), String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "clear_file_cache",
        domain_assets::clear_file_cache(),
    )
}

#[tauri::command]
pub fn validate_game_directory(path: String) -> Result<GameDirectoryInfo, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "validate_game_directory",
        domain_assets::validate_game_directory(path),
    )
}

#[tauri::command]
pub fn scan_maps(path: String, locale: Option<String>) -> Result<Vec<MapAssetSummary>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_maps",
        domain_assets::scan_maps(path, locale),
    )
}

#[tauri::command]
pub fn scan_events(path: String) -> Result<Vec<EventAssetSummary>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_events",
        domain_assets::scan_events(path),
    )
}

#[tauri::command]
pub fn load_map_asset(
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> Result<MapAssetContent, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_map_asset",
        domain_assets::load_map_asset(root_path, map_path, locale),
    )
}

#[tauri::command]
pub fn load_text_asset(
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<TextAssetContent, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_text_asset",
        domain_assets::load_text_asset(root_path, asset_path, locale),
    )
}

#[tauri::command]
pub fn load_text_file(path: String) -> Result<LocalTextFileContent, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_text_file",
        domain_assets::load_text_file(path),
    )
}

#[tauri::command]
pub fn load_image_data_url(path: String, locale: Option<String>) -> Result<String, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_image_data_url",
        domain_assets::load_image_data_url(path, locale),
    )
}

#[tauri::command]
pub fn scan_audio_assets(path: String) -> Result<Vec<AudioAssetSummary>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_audio_assets",
        domain_assets::scan_audio_assets(path),
    )
}

#[tauri::command]
pub fn load_audio_data_url(path: String) -> Result<String, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_audio_data_url",
        domain_assets::load_audio_data_url(path),
    )
}
