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
    PersistLauncherLibraryRemoteCoverRequest, ResolveLauncherImageRequest,
    ResolveLauncherImageResult, RestoreLauncherInstallBackupRequest,
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
pub fn load_launcher_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherSettings, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_settings),
        json!({}),
    )
}

#[tauri::command]
pub fn save_launcher_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(save_launcher_settings),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn launch_launcher_game(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(launch_launcher_game),
        json!({}),
    )
}

#[tauri::command]
pub fn get_launcher_backup_directory(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<String, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(get_launcher_backup_directory),
        json!({}),
    )
}

#[tauri::command]
pub fn open_launcher_path(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: OpenLauncherPathRequest,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(open_launcher_path),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn open_launcher_url(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: OpenLauncherUrlRequest,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(open_launcher_url),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_library_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherLibraryState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_library_state),
        json!({}),
    )
}

#[tauri::command]
pub fn save_launcher_library_state(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(save_launcher_library_state),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_library_covers(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_library_covers),
        json!({}),
    )
}

#[tauri::command]
pub fn load_launcher_image_failures(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherImageFailuresState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_image_failures),
        json!({}),
    )
}

#[tauri::command]
pub fn set_launcher_library_cover(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(set_launcher_library_cover),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn persist_launcher_library_remote_cover(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: PersistLauncherLibraryRemoteCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(persist_launcher_library_remote_cover),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn scan_launcher_library(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(scan_launcher_library),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_runtime_info(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherRuntimeInfo, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_runtime_info),
        json!({}),
    )
}

#[tauri::command]
pub fn set_launcher_mod_enabled(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(set_launcher_mod_enabled),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_download_queue(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<LauncherDownloadQueueState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_download_queue),
        json!({}),
    )
}

#[tauri::command]
pub fn save_launcher_download_queue(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(save_launcher_download_queue),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn download_launcher_mod(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(download_launcher_mod),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn cancel_launcher_download(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    download_id: String,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(cancel_launcher_download),
        json!({ "downloadId": download_id }),
    )
}

#[tauri::command]
pub fn search_launcher_catalog(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(search_launcher_catalog),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_remote_mod_detail(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_remote_mod_detail),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_launcher_update_changelog(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_update_changelog),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn resolve_launcher_image(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(resolve_launcher_image),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn clear_launcher_image_cache(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(clear_launcher_image_cache),
        json!({}),
    )
}

#[tauri::command]
pub fn load_launcher_nexus_diagnostics(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_launcher_nexus_diagnostics),
        json!({}),
    )
}

#[tauri::command]
pub fn restart_launcher_nexus_diagnostics(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(restart_launcher_nexus_diagnostics),
        json!({}),
    )
}

#[tauri::command]
pub fn retry_launcher_nexus_diagnostics_route(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    route_id: String,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(retry_launcher_nexus_diagnostics_route),
        json!({ "routeId": route_id }),
    )
}

#[tauri::command]
pub fn set_launcher_nexus_force_offline(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    force_offline: bool,
) -> Result<NexusDiagnosticsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(set_launcher_nexus_force_offline),
        json!({ "forceOffline": force_offline }),
    )
}

#[tauri::command]
pub fn load_cached_launcher_updates(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_cached_launcher_updates),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn load_suppressed_launcher_update_mod_ids(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> Result<LauncherSuppressedUpdateModIdsResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(load_suppressed_launcher_update_mod_ids),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn check_launcher_updates(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(check_launcher_updates),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn install_launcher_archive(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(install_launcher_archive),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn list_launcher_install_backups(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(list_launcher_install_backups),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn restore_launcher_install_backup(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(restore_launcher_install_backup),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn inspect_launcher_archive(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(inspect_launcher_archive),
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn validate_nexus_api_key(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<ValidateApiKeyResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(validate_nexus_api_key),
        json!({}),
    )
}

#[tauri::command]
pub fn start_nexus_sso(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<SsoStartResult, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(start_nexus_sso),
        json!({}),
    )
}

#[tauri::command]
pub fn get_nexus_sso_status(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<SsoSnapshot, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(get_nexus_sso_status),
        json!({}),
    )
}

#[tauri::command]
pub fn cancel_nexus_sso(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state,
        crate::host_command_name!(cancel_nexus_sso),
        json!({}),
    )
}
