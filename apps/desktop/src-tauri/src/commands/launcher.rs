use crate::domain::launcher::archive;
use crate::domain::launcher::discovery;
use crate::domain::launcher::downloads;
use crate::domain::launcher::image_cache;
use crate::domain::launcher::library;
use crate::domain::launcher::remote;
use crate::domain::launcher::runtime;
use crate::domain::launcher::settings;
use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, DownloadLauncherModRequest, DownloadLauncherModResult,
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherCatalogPageResult, LauncherDownloadQueueState,
    LauncherGameLaunchError, LauncherGameLaunchResult, LauncherLibraryCoversState,
    LauncherLibraryScanResult, LauncherLibraryState, LauncherRemoteModDetail, LauncherSettings,
    LauncherUpdateChangelogResult, LauncherUpdatesResult, LoadCachedLauncherUpdatesRequest,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
    OpenLauncherPathRequest, OpenLauncherUrlRequest, PersistLauncherLibraryRemoteCoverRequest,
    ResolveLauncherImageRequest, ResolveLauncherImageResult, SaveLauncherSettingsRequest,
    ScanLauncherLibraryRequest, SearchLauncherCatalogRequest, SetLauncherLibraryCoverRequest,
    SetLauncherModEnabledRequest, SetLauncherModEnabledResult,
};
use crate::domain::launcher::updates;

#[tauri::command]
pub fn load_launcher_settings(app: tauri::AppHandle) -> Result<LauncherSettings, String> {
    settings::load_launcher_settings(app)
}

#[tauri::command]
pub fn save_launcher_settings(
    app: tauri::AppHandle,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    settings::save_launcher_settings(app, request)
}

#[tauri::command]
pub fn launch_launcher_game(
    app: tauri::AppHandle,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    runtime::launch_launcher_game(app)
}

#[tauri::command]
pub fn get_launcher_backup_directory(app: tauri::AppHandle) -> Result<String, String> {
    runtime::get_launcher_backup_directory(app)
}

#[tauri::command]
pub fn open_launcher_path(request: OpenLauncherPathRequest) -> Result<(), String> {
    runtime::open_launcher_path(request)
}

#[tauri::command]
pub fn open_launcher_url(request: OpenLauncherUrlRequest) -> Result<(), String> {
    runtime::open_launcher_url(request)
}

#[tauri::command]
pub fn load_launcher_library_state(app: tauri::AppHandle) -> Result<LauncherLibraryState, String> {
    library::load_launcher_library_state(app)
}

#[tauri::command]
pub fn save_launcher_library_state(
    app: tauri::AppHandle,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    library::save_launcher_library_state(app, request)
}

#[tauri::command]
pub fn load_launcher_library_covers(
    app: tauri::AppHandle,
) -> Result<LauncherLibraryCoversState, String> {
    library::load_launcher_library_covers(app)
}

#[tauri::command]
pub fn set_launcher_library_cover(
    app: tauri::AppHandle,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    library::set_launcher_library_cover(app, request)
}

#[tauri::command]
pub async fn persist_launcher_library_remote_cover(
    app: tauri::AppHandle,
    request: PersistLauncherLibraryRemoteCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    library::persist_launcher_library_remote_cover(app, request).await
}

#[tauri::command]
pub fn scan_launcher_library(
    app: tauri::AppHandle,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    library::scan_launcher_library(app, request)
}

#[tauri::command]
pub fn set_launcher_mod_enabled(
    app: tauri::AppHandle,
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    library::set_launcher_mod_enabled(app, request)
}

#[tauri::command]
pub fn load_launcher_download_queue(
    app: tauri::AppHandle,
) -> Result<LauncherDownloadQueueState, String> {
    downloads::load_launcher_download_queue(app)
}

#[tauri::command]
pub fn save_launcher_download_queue(
    app: tauri::AppHandle,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    downloads::save_launcher_download_queue(app, request)
}

#[tauri::command]
pub fn download_launcher_mod(
    app: tauri::AppHandle,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    downloads::download_launcher_mod(app, request)
}

#[tauri::command]
pub async fn search_launcher_catalog(
    app: tauri::AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    discovery::search_launcher_catalog(app, request).await
}

#[tauri::command]
pub async fn load_launcher_remote_mod_detail(
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    remote::load_launcher_remote_mod_detail(request).await
}

#[tauri::command]
pub async fn load_launcher_update_changelog(
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    remote::load_launcher_update_changelog(request).await
}

#[tauri::command]
pub async fn resolve_launcher_image(
    app: tauri::AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    image_cache::resolve_launcher_image(app, request).await
}

#[tauri::command]
pub fn clear_launcher_image_cache(app: tauri::AppHandle) -> Result<(), String> {
    image_cache::clear_launcher_image_cache(app)
}

#[tauri::command]
pub fn load_cached_launcher_updates(
    app: tauri::AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    updates::load_cached_launcher_updates(app, request)
}

#[tauri::command]
pub async fn check_launcher_updates(
    app: tauri::AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    updates::check_launcher_updates(app, request).await
}

#[tauri::command]
pub fn install_launcher_archive(
    app: tauri::AppHandle,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    archive::install_launcher_archive(app, request)
}

#[tauri::command]
pub fn inspect_launcher_archive(
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    archive::inspect_launcher_archive(request)
}
