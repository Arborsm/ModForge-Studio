use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, DownloadLauncherModRequest, DownloadLauncherModResult,
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherCatalogPageResult, LauncherDownloadQueueState,
    LauncherGameLaunchError, LauncherGameLaunchResult, LauncherImageFailuresState,
    LauncherInstallBackupSummary, LauncherLibraryCoversState, LauncherLibraryScanResult,
    LauncherLibraryState, LauncherRemoteModDetail, LauncherRuntimeInfo, LauncherSettings,
    LauncherSuppressedUpdateModIdsResult, LauncherUpdateChangelogResult, LauncherUpdatesResult,
    ListLauncherInstallBackupsRequest, LoadCachedLauncherUpdatesRequest,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
    LoadSuppressedLauncherUpdateModIdsRequest, OpenLauncherPathRequest, OpenLauncherUrlRequest,
    PersistLauncherLibraryRemoteCoverRequest, RecordLauncherImageFailureRequest,
    ResolveLauncherImageRequest, ResolveLauncherImageResult, RestoreLauncherInstallBackupRequest,
    RestoreLauncherInstallBackupResult, SaveLauncherSettingsRequest, ScanLauncherLibraryRequest,
    SearchLauncherCatalogRequest, SetLauncherLibraryCoverRequest, SetLauncherModEnabledRequest,
    SetLauncherModEnabledResult,
};
use crate::domain::nexusmods::sso::{SsoSnapshot, SsoStartResult};
use crate::domain::nexusmods::types::{NexusDiagnosticsResult, ValidateApiKeyResult};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn load_launcher_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherSettings, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_settings),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn save_launcher_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_launcher_settings),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn launch_launcher_game(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(launch_launcher_game),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn get_launcher_backup_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(get_launcher_backup_directory),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn open_launcher_path(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: OpenLauncherPathRequest,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(open_launcher_path),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn open_launcher_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: OpenLauncherUrlRequest,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(open_launcher_url),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_library_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherLibraryState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_library_state),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn save_launcher_library_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_launcher_library_state),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_library_covers(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_library_covers),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_image_failures(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherImageFailuresState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_image_failures),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn record_launcher_image_failure(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: RecordLauncherImageFailureRequest,
) -> Result<LauncherImageFailuresState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(record_launcher_image_failure),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn set_launcher_library_cover(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(set_launcher_library_cover),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn persist_launcher_library_remote_cover(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: PersistLauncherLibraryRemoteCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(persist_launcher_library_remote_cover),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn scan_launcher_library(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(scan_launcher_library),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_runtime_info(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherRuntimeInfo, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_runtime_info),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn set_launcher_mod_enabled(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(set_launcher_mod_enabled),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_download_queue(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherDownloadQueueState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_download_queue),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn save_launcher_download_queue(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_launcher_download_queue),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn download_launcher_mod(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(download_launcher_mod),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn cancel_launcher_download(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    download_id: String,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(cancel_launcher_download),
        json!({ "downloadId": download_id }),
    )
    .await
}

#[tauri::command]
pub async fn search_launcher_catalog(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(search_launcher_catalog),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_remote_mod_detail(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_remote_mod_detail),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_update_changelog(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_update_changelog),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn resolve_launcher_image(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(resolve_launcher_image),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn resolve_cached_launcher_image(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ResolveLauncherImageRequest,
) -> Result<Option<ResolveLauncherImageResult>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(resolve_cached_launcher_image),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn clear_launcher_image_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(clear_launcher_image_cache),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn load_launcher_nexus_diagnostics(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_launcher_nexus_diagnostics),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn restart_launcher_nexus_diagnostics(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(restart_launcher_nexus_diagnostics),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn retry_launcher_nexus_diagnostics_route(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    route_id: String,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(retry_launcher_nexus_diagnostics_route),
        json!({ "routeId": route_id }),
    )
    .await
}

#[tauri::command]
pub async fn set_launcher_nexus_force_offline(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    force_offline: bool,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(set_launcher_nexus_force_offline),
        json!({ "forceOffline": force_offline }),
    )
    .await
}

#[tauri::command]
pub async fn load_cached_launcher_updates(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_cached_launcher_updates),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_suppressed_launcher_update_mod_ids(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> Result<LauncherSuppressedUpdateModIdsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_suppressed_launcher_update_mod_ids),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn check_launcher_updates(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(check_launcher_updates),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn install_launcher_archive(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(install_launcher_archive),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn list_launcher_install_backups(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(list_launcher_install_backups),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn restore_launcher_install_backup(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(restore_launcher_install_backup),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn inspect_launcher_archive(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(inspect_launcher_archive),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn validate_nexus_api_key(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<ValidateApiKeyResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(validate_nexus_api_key),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn start_nexus_sso(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<SsoStartResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(start_nexus_sso),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn get_nexus_sso_status(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<SsoSnapshot, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(get_nexus_sso_status),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn cancel_nexus_sso(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(cancel_nexus_sso),
        json!({}),
    )
    .await
}
