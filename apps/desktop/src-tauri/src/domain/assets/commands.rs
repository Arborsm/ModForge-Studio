use crate::AppHandle;
use crate::domain;
use crate::domain::assets::{
    AudioAssetSummary, DataAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo,
    ImageAssetSummary, LocalTextFileContent, MapAssetContent, MapAssetSummary,
    ParsedEventAssetContent, TextAssetContent,
};
use host_command_macros::host_command;

#[host_command(io)]
pub async fn detect_default_game_directory(app: AppHandle) -> Result<Option<String>, String> {
    Ok::<_, String>(domain::assets::detect_default_game_directory())
}

#[host_command(io)]
pub async fn list_known_game_directories(app: AppHandle) -> Result<Vec<String>, String> {
    Ok::<_, String>(domain::assets::list_known_game_directories())
}

#[host_command(io)]
pub async fn get_file_cache_stats(app: AppHandle) -> Result<FileCacheStats, String> {
    domain::assets::get_file_cache_stats()
}

#[host_command(mutation, resources(GameAssetCache))]
pub async fn clear_file_cache(app: AppHandle) -> Result<(), String> {
    domain::assets::clear_file_cache()
}

#[host_command(io)]
pub async fn validate_game_directory(
    app: AppHandle,
    path: String,
) -> Result<GameDirectoryInfo, String> {
    domain::assets::validate_game_directory(path)
}

#[host_command(io)]
pub async fn scan_events(app: AppHandle, path: String) -> Result<Vec<EventAssetSummary>, String> {
    domain::assets::scan_events(path)
}

#[host_command(io)]
pub async fn load_text_file(app: AppHandle, path: String) -> Result<LocalTextFileContent, String> {
    domain::assets::load_text_file(path)
}

#[host_command(io)]
pub async fn scan_audio_assets(
    app: AppHandle,
    path: String,
) -> Result<Vec<AudioAssetSummary>, String> {
    domain::assets::scan_audio_assets(path)
}

#[host_command(io)]
pub async fn scan_image_assets(
    app: AppHandle,
    path: String,
) -> Result<Vec<ImageAssetSummary>, String> {
    domain::assets::scan_image_assets(path)
}

#[host_command(io)]
pub async fn scan_data_assets(
    app: AppHandle,
    path: String,
) -> Result<Vec<DataAssetSummary>, String> {
    domain::assets::scan_data_assets(path)
}

#[host_command(io)]
pub async fn load_audio_data_url(app: AppHandle, path: String) -> Result<String, String> {
    domain::assets::load_audio_data_url(path)
}

#[host_command(io)]
pub async fn scan_maps(
    app: AppHandle,
    path: String,
    locale: Option<String>,
) -> Result<Vec<MapAssetSummary>, String> {
    domain::assets::scan_maps(path, locale)
}

#[host_command(io)]
pub async fn load_map_asset(
    app: AppHandle,
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> Result<MapAssetContent, String> {
    domain::assets::load_map_asset(root_path, map_path, locale)
}

#[host_command(io)]
pub async fn load_text_asset(
    app: AppHandle,
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<TextAssetContent, String> {
    domain::assets::load_text_asset(root_path, asset_path, locale)
}

#[host_command(io)]
pub async fn load_event_asset(
    app: AppHandle,
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<ParsedEventAssetContent, String> {
    domain::assets::load_event_asset(root_path, asset_path, locale)
}

#[host_command(io)]
pub async fn load_image_data_url(
    app: AppHandle,
    path: String,
    locale: Option<String>,
) -> Result<String, String> {
    domain::assets::load_image_data_url(path, locale)
}

#[host_command(mutation, resources(MapPngExport))]
pub async fn export_map_png(
    app: AppHandle,
    output_path: String,
    png_base64: String,
) -> Result<(), String> {
    domain::assets::export_map_png(output_path, png_base64)
}

#[host_command(mutation, resources(FileExport))]
pub async fn export_file(
    app: AppHandle,
    output_path: String,
    content_base64: String,
) -> Result<(), String> {
    domain::assets::export_file(output_path, content_base64)
}
