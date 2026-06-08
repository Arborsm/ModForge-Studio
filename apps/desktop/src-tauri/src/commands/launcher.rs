use crate::AppHandle;
use crate::domain::launcher::archive;
use crate::domain::launcher::downloads;
use crate::domain::launcher::image_cache;
use crate::domain::launcher::library;
use crate::domain::launcher::runtime;
use crate::domain::launcher::settings;
use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, DownloadLauncherModRequest, DownloadLauncherModResult,
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherCatalogPageResult, LauncherDownloadQueueState,
    LauncherGameLaunchError, LauncherGameLaunchResult, LauncherInstallBackupSummary,
    LauncherLibraryCoversState, LauncherLibraryScanResult, LauncherLibraryState,
    LauncherRemoteModDetail, LauncherRuntimeInfo, LauncherSettings,
    LauncherSuppressedUpdateModIdsResult, LauncherUpdateChangelogResult, LauncherUpdatesResult,
    ListLauncherInstallBackupsRequest, LoadCachedLauncherUpdatesRequest,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
    LoadSuppressedLauncherUpdateModIdsRequest, OpenLauncherPathRequest, OpenLauncherUrlRequest,
    PersistLauncherLibraryRemoteCoverRequest, ResolveLauncherImageRequest,
    ResolveLauncherImageResult, RestoreLauncherInstallBackupRequest,
    RestoreLauncherInstallBackupResult, SaveLauncherSettingsRequest, ScanLauncherLibraryRequest,
    SearchLauncherCatalogRequest, SetLauncherLibraryCoverRequest, SetLauncherModEnabledRequest,
    SetLauncherModEnabledResult,
};
use crate::domain::launcher::updates;
use crate::domain::nexusmods::catalog;
use crate::domain::nexusmods::diagnostics;
use crate::domain::nexusmods::graphql;
use crate::domain::nexusmods::mod_detail;
use crate::domain::nexusmods::rest_api;
use crate::domain::nexusmods::sso::{SsoConnectionStatus, SsoSnapshot};
use crate::domain::nexusmods::types::NexusDiagnosticsResult;
use serde::{Deserialize, Serialize};

#[tauri::command]
pub fn load_launcher_settings(app: AppHandle) -> Result<LauncherSettings, String> {
    settings::load_launcher_settings(app)
}

#[tauri::command]
pub fn save_launcher_settings(
    app: AppHandle,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    settings::save_launcher_settings(app, request)
}

#[tauri::command]
pub fn launch_launcher_game(
    app: AppHandle,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    runtime::launch_launcher_game(app)
}

#[tauri::command]
pub fn get_launcher_backup_directory(app: AppHandle) -> Result<String, String> {
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
pub fn load_launcher_library_state(app: AppHandle) -> Result<LauncherLibraryState, String> {
    library::load_launcher_library_state(app)
}

#[tauri::command]
pub fn save_launcher_library_state(
    app: AppHandle,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    library::save_launcher_library_state(app, request)
}

#[tauri::command]
pub fn load_launcher_library_covers(app: AppHandle) -> Result<LauncherLibraryCoversState, String> {
    library::load_launcher_library_covers(app)
}

#[tauri::command]
pub fn set_launcher_library_cover(
    app: AppHandle,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    library::set_launcher_library_cover(app, request)
}

#[tauri::command]
pub async fn persist_launcher_library_remote_cover(
    app: AppHandle,
    request: PersistLauncherLibraryRemoteCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    library::persist_launcher_library_remote_cover(app, request).await
}

#[tauri::command]
pub fn scan_launcher_library(
    app: AppHandle,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    library::scan_launcher_library(app, request)
}

#[tauri::command]
pub fn load_launcher_runtime_info(app: AppHandle) -> Result<LauncherRuntimeInfo, String> {
    let settings = settings::load_launcher_settings(app)?;
    let Some(game_path) = settings
        .game_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(LauncherRuntimeInfo {
            game_version: None,
            smapi_version: None,
        });
    };

    let game_root = crate::infrastructure::fs::pathing::clean_input_path(game_path);
    let versions = updates::resolve_smapi_runtime_versions_with_reader(
        Some(game_root.as_path()),
        updates::read_windows_file_version,
    );

    Ok(LauncherRuntimeInfo {
        game_version: Some(versions.game_version),
        smapi_version: Some(versions.api_version),
    })
}

#[tauri::command]
pub fn set_launcher_mod_enabled(
    app: AppHandle,
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    library::set_launcher_mod_enabled(app, request)
}

#[tauri::command]
pub fn load_launcher_download_queue(app: AppHandle) -> Result<LauncherDownloadQueueState, String> {
    downloads::load_launcher_download_queue(app)
}

#[tauri::command]
pub fn save_launcher_download_queue(
    app: AppHandle,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    downloads::save_launcher_download_queue(app, request)
}

#[tauri::command]
pub async fn download_launcher_mod(
    app: AppHandle,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    tauri::async_runtime::spawn_blocking(move || downloads::download_launcher_mod(app, request))
        .await
        .map_err(|error| format!("launcher mod download task failed: {error}"))?
}

#[tauri::command]
pub async fn search_launcher_catalog(
    app: AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    catalog::search_launcher_catalog(app, request).await
}

#[tauri::command]
pub async fn load_launcher_remote_mod_detail(
    app: AppHandle,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    mod_detail::load_launcher_remote_mod_detail(app, request).await
}

#[tauri::command]
pub async fn load_launcher_update_changelog(
    app: AppHandle,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    mod_detail::load_launcher_update_changelog(app, request).await
}

#[tauri::command]
pub async fn resolve_launcher_image(
    app: AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    image_cache::resolve_launcher_image(app, request).await
}

#[tauri::command]
pub fn clear_launcher_image_cache(app: AppHandle) -> Result<(), String> {
    image_cache::clear_launcher_image_cache(app)
}

#[tauri::command]
pub async fn load_launcher_nexus_diagnostics(
    app: AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    tauri::async_runtime::spawn_blocking(move || diagnostics::load_launcher_nexus_diagnostics(&app))
        .await
        .map_err(|error| format!("launcher nexus diagnostics task failed: {error}"))?
}

#[tauri::command]
pub async fn restart_launcher_nexus_diagnostics(
    app: AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics::restart_launcher_nexus_diagnostics_with_app(&app)
    })
    .await
    .map_err(|error| format!("launcher nexus diagnostics restart task failed: {error}"))?
}

#[tauri::command]
pub async fn retry_launcher_nexus_diagnostics_route(
    app: AppHandle,
    route_id: String,
) -> Result<NexusDiagnosticsResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics::retry_launcher_nexus_diagnostics_route(&app, route_id)
    })
    .await
    .map_err(|error| format!("launcher nexus diagnostics retry task failed: {error}"))?
}

#[tauri::command]
pub async fn set_launcher_nexus_force_offline(
    app: AppHandle,
    force_offline: bool,
) -> Result<NexusDiagnosticsResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        diagnostics::set_launcher_nexus_force_offline(&app, force_offline)
    })
    .await
    .map_err(|error| format!("launcher nexus force-offline task failed: {error}"))?
}

#[tauri::command]
pub fn load_cached_launcher_updates(
    app: AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    updates::load_cached_launcher_updates(app, request)
}

#[tauri::command]
pub fn load_suppressed_launcher_update_mod_ids(
    app: AppHandle,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> Result<LauncherSuppressedUpdateModIdsResult, String> {
    updates::load_suppressed_launcher_update_mod_ids(app, request)
}

#[tauri::command]
pub async fn check_launcher_updates(
    app: AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    updates::check_launcher_updates(app, request).await
}

#[tauri::command]
pub async fn install_launcher_archive(
    app: AppHandle,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    tauri::async_runtime::spawn_blocking(move || archive::install_launcher_archive(app, request))
        .await
        .map_err(|error| format!("launcher archive install task failed: {error}"))?
}

#[tauri::command]
pub fn list_launcher_install_backups(
    app: AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
    archive::list_launcher_install_backups(app, request)
}

#[tauri::command]
pub fn restore_launcher_install_backup(
    app: AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
    archive::restore_launcher_install_backup(app, request)
}

#[tauri::command]
pub async fn inspect_launcher_archive(
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    tauri::async_runtime::spawn_blocking(move || archive::inspect_launcher_archive(request))
        .await
        .map_err(|error| error.to_string())?
}

// ---- REST API v1 Commands ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateApiKeyResult {
    pub user_name: String,
    pub avatar_url: Option<String>,
    pub profile_url: Option<String>,
    pub is_premium: bool,
    pub daily_remaining: Option<u64>,
    pub hourly_remaining: Option<u64>,
    pub daily_reset_at: Option<u64>,
    pub hourly_reset_at: Option<u64>,
}

#[tauri::command]
pub async fn validate_nexus_api_key(app: AppHandle) -> Result<ValidateApiKeyResult, String> {
    tauri::async_runtime::spawn_blocking(move || validate_nexus_api_key_blocking(app))
        .await
        .map_err(|error| format!("launcher Nexus API key validation task failed: {error}"))?
}

fn validate_nexus_api_key_blocking(app: AppHandle) -> Result<ValidateApiKeyResult, String> {
    let settings = settings::load_launcher_settings(app)?;
    let api_key = settings.nexus_api_key.as_deref().unwrap_or("");
    log::info!(
        target: "Nexus",
        "Validate API key requested: api-key-present={} api-key-length={}",
        !api_key.trim().is_empty(),
        api_key.len()
    );
    let user_info = rest_api::validate_user(api_key).map_err(|e| e.to_string())?;
    let avatar_url = graphql::load_user_avatar(api_key, user_info.user_id)
        .map_err(|error| {
            log::warn!(target: "Nexus", "User avatar lookup failed: error={error}");
            error
        })
        .ok()
        .flatten();
    Ok(ValidateApiKeyResult {
        user_name: user_info.name,
        avatar_url,
        profile_url: Some(user_info.profile_url),
        is_premium: user_info.is_premium,
        daily_remaining: rest_api::daily_quota_remaining(),
        hourly_remaining: rest_api::hourly_quota_remaining(),
        daily_reset_at: rest_api::daily_quota_reset_at(),
        hourly_reset_at: rest_api::hourly_quota_reset_at(),
    })
}

// ---- SSO Commands ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SsoStartResult {
    pub sso_id: String,
    pub status: SsoConnectionStatus,
}

#[tauri::command]
pub fn start_nexus_sso(app: AppHandle) -> Result<SsoStartResult, String> {
    let sso_id = crate::domain::nexusmods::sso::start_sso(&app)?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let status = crate::domain::nexusmods::sso::get_sso_status().status;
    Ok(SsoStartResult { sso_id, status })
}

#[tauri::command]
pub fn get_nexus_sso_status() -> Result<SsoSnapshot, String> {
    Ok(crate::domain::nexusmods::sso::get_sso_status())
}

#[tauri::command]
pub fn cancel_nexus_sso() -> Result<(), String> {
    crate::domain::nexusmods::sso::cancel_sso();
    Ok(())
}
