use crate::domain::launcher::archive;
use crate::domain::launcher::discovery;
use crate::domain::launcher::downloads;
use crate::domain::launcher::http;
use crate::domain::launcher::image_cache;
use crate::domain::launcher::library;
use crate::domain::launcher::remote;
use crate::domain::launcher::runtime;
use crate::domain::launcher::settings;
use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, DownloadLauncherModRequest, DownloadLauncherModResult,
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherCatalogPageResult, LauncherDownloadQueueState,
    LauncherGameLaunchError, LauncherGameLaunchResult, LauncherInstallBackupSummary,
    LauncherLibraryCoversState, LauncherLibraryScanResult, LauncherLibraryState,
    LauncherNexusDiagnosticsResult, LauncherRemoteModDetail, LauncherSettings,
    LauncherSuppressedUpdateModIdsResult, LauncherUpdateChangelogResult, LauncherUpdatesResult,
    ListLauncherInstallBackupsRequest, LoadCachedLauncherUpdatesRequest,
    LoadLauncherRemoteModDetailRequest,
    LoadLauncherUpdateChangelogRequest, OpenLauncherPathRequest, OpenLauncherUrlRequest,
    PublicHtmlVerificationRequest,
    PersistLauncherLibraryRemoteCoverRequest, ResolveLauncherImageRequest, ResolveLauncherImageResult,
    RestoreLauncherInstallBackupRequest, RestoreLauncherInstallBackupResult,
    SaveLauncherSettingsRequest, ScanLauncherLibraryRequest, SearchLauncherCatalogRequest,
    SetLauncherLibraryCoverRequest, SetLauncherModEnabledRequest, SetLauncherModEnabledResult,
    LoadSuppressedLauncherUpdateModIdsRequest,
};
use crate::domain::launcher::updates;
use crate::domain::launcher::types::PublicHtmlVerificationSnapshot;

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
    app: tauri::AppHandle,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    remote::load_launcher_remote_mod_detail(app, request).await
}

#[tauri::command]
pub async fn load_launcher_update_changelog(
    app: tauri::AppHandle,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    remote::load_launcher_update_changelog(app, request).await
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
pub fn load_launcher_nexus_diagnostics(
    app: tauri::AppHandle,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    http::load_launcher_nexus_diagnostics(&app)
}

#[tauri::command]
pub fn restart_launcher_nexus_diagnostics(
    app: tauri::AppHandle,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    http::restart_launcher_nexus_diagnostics_with_app(&app)
}

#[tauri::command]
pub fn set_launcher_nexus_force_offline(
    app: tauri::AppHandle,
    force_offline: bool,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    http::set_launcher_nexus_force_offline(&app, force_offline)
}

#[tauri::command]
pub fn load_cached_launcher_updates(
    app: tauri::AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    updates::load_cached_launcher_updates(app, request)
}

#[tauri::command]
pub fn load_suppressed_launcher_update_mod_ids(
    app: tauri::AppHandle,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> Result<LauncherSuppressedUpdateModIdsResult, String> {
    updates::load_suppressed_launcher_update_mod_ids(app, request)
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
pub fn list_launcher_install_backups(
    app: tauri::AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
    archive::list_launcher_install_backups(app, request)
}

#[tauri::command]
pub fn restore_launcher_install_backup(
    app: tauri::AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
    archive::restore_launcher_install_backup(app, request)
}

#[tauri::command]
pub fn inspect_launcher_archive(
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    archive::inspect_launcher_archive(request)
}


#[tauri::command]
pub fn public_html_nexus_verify_status(
    app: tauri::AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let settings = crate::domain::launcher::settings::load_launcher_settings(app.clone())?;
    Ok(crate::domain::launcher::public_html_webview::refresh_disable_public_html_route_flag(
        settings.disable_public_html_route,
    ))
}

#[tauri::command]
pub async fn public_html_nexus_open_verify(
    app: tauri::AppHandle,
    request: PublicHtmlVerificationRequest,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    crate::domain::launcher::public_html_webview::request_verification_with_app(
        &app,
        request.reason,
        request.target_url,
    )?;
    crate::domain::launcher::public_html_webview::open_verification_window_with_app(&app)
}

#[tauri::command]
pub fn public_html_nexus_signal_opened() -> Result<PublicHtmlVerificationSnapshot, String> {
    Ok(crate::domain::launcher::public_html_webview::signal_verification_opened())
}

#[tauri::command]
pub fn public_html_nexus_submit_cookie(
    cookie: String,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    Ok(crate::domain::launcher::public_html_webview::submit_verification(cookie))
}

#[tauri::command]
pub fn public_html_nexus_cancel_verify() -> Result<PublicHtmlVerificationSnapshot, String> {
    Ok(crate::domain::launcher::public_html_webview::cancel_verification())
}

#[tauri::command]
pub fn public_html_nexus_refresh_verify(
    app: tauri::AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    crate::domain::launcher::public_html_webview::refresh_verification_with_app(&app)
}

#[tauri::command]
pub fn public_html_nexus_close_verify(
    app: tauri::AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    crate::domain::launcher::public_html_webview::close_verification_with_app(&app)
}

#[tauri::command]
pub fn public_html_nexus_clear_session(
    app: tauri::AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    crate::domain::launcher::public_html_webview::clear_verification_session_with_app(&app)
}
