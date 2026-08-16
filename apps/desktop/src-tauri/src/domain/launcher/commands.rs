use crate::AppHandle;
use crate::domain;
use crate::domain::launcher::types::{
    CheckLauncherUpdatesRequest, CheckSmapiUpdateResult, DownloadLauncherModRequest,
    DownloadLauncherModResult, FindSmapiInstallerDownloadsResult, InspectLauncherArchiveRequest,
    InspectLauncherArchiveResult, InstallLauncherArchiveRequest, InstallLauncherArchiveResult,
    InstallSmapiUpdateRequest, InstallSmapiUpdateResult, LauncherCatalogPageResult,
    LauncherDownloadQueueState, LauncherGameLaunchResult, LauncherGmcmProbeDiagnosticsResult,
    LauncherImageFailuresState, LauncherInstallBackupSummary, LauncherLibraryCoversState,
    LauncherLibraryScanResult, LauncherLibraryState, LauncherModConfigResult,
    LauncherRemoteModDetail, LauncherRuntimeInfo, LauncherSettings,
    LauncherSuppressedUpdateModIdsResult, LauncherUpdateChangelogResult, LauncherUpdatesResult,
    ListLauncherInstallBackupsRequest, LoadCachedLauncherUpdatesRequest,
    LoadLauncherModConfigRequest, LoadLauncherRemoteModDetailRequest,
    LoadLauncherUpdateChangelogRequest, LoadSuppressedLauncherUpdateModIdsRequest,
    OpenLauncherPathRequest, OpenLauncherUrlRequest, PersistLauncherLibraryRemoteCoverRequest,
    RecordLauncherImageFailureRequest, ResolveLauncherImageRequest, ResolveLauncherImageResult,
    RestoreLauncherInstallBackupRequest, RestoreLauncherInstallBackupResult,
    SaveLauncherModConfigRequest, SaveLauncherSettingsRequest, ScanLauncherLibraryRequest,
    SearchLauncherCatalogRequest, SetLauncherLibraryCoverRequest, SetLauncherModEnabledRequest,
    SetLauncherModEnabledResult,
};
use crate::domain::nexusmods::sso::{SsoSnapshot, SsoStartResult};
use crate::domain::nexusmods::types::{NexusDiagnosticsResult, ValidateApiKeyResult};
use host_command_macros::host_command;
use serde_json::Value;

#[host_command(mutation, resources(LauncherSettings))]
pub async fn load_launcher_settings(app: AppHandle) -> Result<LauncherSettings, String> {
    domain::launcher::settings::load_launcher_settings(app)
}

#[host_command(mutation, resources(LauncherSettings))]
pub async fn save_launcher_settings(
    app: AppHandle,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    domain::launcher::settings::save_launcher_settings(app, request)
}

#[host_command(control, resources(LauncherSettings))]
pub async fn launch_launcher_game(app: AppHandle) -> Result<LauncherGameLaunchResult, String> {
    domain::launcher::runtime::launch_launcher_game(app)
}

#[host_command(mutation, resources(LauncherInstallTree))]
pub async fn get_launcher_backup_directory(app: AppHandle) -> Result<String, String> {
    domain::launcher::runtime::get_launcher_backup_directory(app)
}

#[host_command(control)]
pub async fn open_launcher_path(
    app: AppHandle,
    request: OpenLauncherPathRequest,
) -> Result<(), String> {
    domain::launcher::runtime::open_launcher_path(request)
}

#[host_command(control)]
pub async fn open_launcher_url(
    app: AppHandle,
    request: OpenLauncherUrlRequest,
) -> Result<(), String> {
    domain::launcher::runtime::open_launcher_url(request)
}

#[host_command(mutation, resources(LauncherLibraryState))]
pub async fn load_launcher_library_state(app: AppHandle) -> Result<LauncherLibraryState, String> {
    domain::launcher::library::load_launcher_library_state(app)
}

#[host_command(mutation, resources(LauncherLibraryState))]
pub async fn save_launcher_library_state(
    app: AppHandle,
    request: LauncherLibraryState,
) -> Result<LauncherLibraryState, String> {
    domain::launcher::library::save_launcher_library_state(app, request)
}

#[host_command(mutation, resources(LauncherLibraryCovers))]
pub async fn load_launcher_library_covers(
    app: AppHandle,
) -> Result<LauncherLibraryCoversState, String> {
    domain::launcher::library::load_launcher_library_covers(app)
}

#[host_command(io)]
pub async fn load_launcher_image_failures(
    app: AppHandle,
) -> Result<LauncherImageFailuresState, String> {
    domain::launcher::image_failures::load_launcher_image_failures(app)
}

#[host_command(mutation, resources(LauncherImageCache))]
pub async fn record_launcher_image_failure(
    app: AppHandle,
    request: RecordLauncherImageFailureRequest,
) -> Result<LauncherImageFailuresState, String> {
    domain::launcher::image_failures::record_launcher_image_failure_command(app, request)
}

#[host_command(mutation, resources(LauncherLibraryCovers))]
pub async fn set_launcher_library_cover(
    app: AppHandle,
    request: SetLauncherLibraryCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    domain::launcher::library::set_launcher_library_cover(app, request)
}

#[host_command(network)]
pub async fn persist_launcher_library_remote_cover(
    app: AppHandle,
    request: PersistLauncherLibraryRemoteCoverRequest,
) -> Result<LauncherLibraryCoversState, String> {
    domain::launcher::library::persist_launcher_library_remote_cover_blocking(&app, &request)
}

#[host_command(io, resources(LauncherLibraryCovers))]
pub async fn scan_launcher_library(
    app: AppHandle,
    request: ScanLauncherLibraryRequest,
) -> Result<LauncherLibraryScanResult, String> {
    domain::launcher::library::scan_launcher_library(app, request)
}

#[host_command(io, resources(LauncherSettings))]
pub async fn load_launcher_runtime_info(app: AppHandle) -> Result<LauncherRuntimeInfo, String> {
    domain::launcher::runtime::load_launcher_runtime_info(app)
}

#[host_command(mutation, resources(LauncherInstallTree))]
pub async fn set_launcher_mod_enabled(
    app: AppHandle,
    request: SetLauncherModEnabledRequest,
) -> Result<SetLauncherModEnabledResult, String> {
    domain::launcher::library::set_launcher_mod_enabled(app, request)
}

#[host_command(io)]
pub async fn load_launcher_mod_config(
    app: AppHandle,
    request: LoadLauncherModConfigRequest,
) -> Result<LauncherModConfigResult, String> {
    domain::launcher::mod_config::load_launcher_mod_config(request)
}

#[host_command(io)]
pub async fn load_launcher_gmcm_probe_diagnostics(
    app: AppHandle,
) -> Result<LauncherGmcmProbeDiagnosticsResult, String> {
    Ok::<_, String>(domain::launcher::mod_config::load_launcher_gmcm_probe_diagnostics())
}

#[host_command(mutation, resources(LauncherModConfig))]
pub async fn save_launcher_mod_config(
    app: AppHandle,
    request: SaveLauncherModConfigRequest,
) -> Result<LauncherModConfigResult, String> {
    domain::launcher::mod_config::save_launcher_mod_config(request)
}

#[host_command(mutation, resources(LauncherDownloadQueue))]
pub async fn load_launcher_download_queue(
    app: AppHandle,
) -> Result<LauncherDownloadQueueState, String> {
    domain::launcher::downloads::load_launcher_download_queue(app)
}

#[host_command(mutation, resources(LauncherDownloadQueue))]
pub async fn save_launcher_download_queue(
    app: AppHandle,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    domain::launcher::downloads::save_launcher_download_queue(app, request)
}

#[host_command(network)]
pub async fn download_launcher_mod(
    app: AppHandle,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    // `force_non_premium` is UI state; the binding seam is the only launcher
    // code allowed to read it (R5: business domains must not read app_ui).
    let force_non_premium = crate::domain::app_ui::load_app_ui_state()
        .map(|state| state.launcher.force_non_premium)
        .unwrap_or(false);
    domain::launcher::downloads::download_launcher_mod(app, request, force_non_premium)
}

#[host_command(control)]
pub async fn cancel_launcher_download(app: AppHandle, download_id: String) -> Result<(), String> {
    domain::launcher::downloads::cancel_launcher_download(download_id)
}

#[host_command(network)]
pub async fn search_launcher_catalog(
    app: AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    (|| -> anyhow::Result<LauncherCatalogPageResult> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::catalog::search_launcher_catalog_blocking(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
            &request,
        )
    })()
}

#[host_command(network)]
pub async fn load_launcher_remote_mod_detail(
    app: AppHandle,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    (|| -> anyhow::Result<LauncherRemoteModDetail> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::mod_detail::load_launcher_remote_mod_detail_blocking(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
            &request,
        )
    })()
}

#[host_command(network)]
pub async fn load_launcher_update_changelog(
    app: AppHandle,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    domain::nexusmods::mod_detail::load_launcher_update_changelog_blocking(&request)
}

#[host_command(network, pool(image_cdn))]
pub async fn resolve_launcher_image(
    app: AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    crate::logging::log_tauri_command_error(
        Self::NAME,
        domain::launcher::image_cache::resolve_launcher_image_blocking(&app, &request),
    )
}

#[host_command(io)]
pub async fn resolve_cached_launcher_image(
    app: AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<Option<ResolveLauncherImageResult>, String> {
    domain::launcher::image_cache::resolve_cached_launcher_image_blocking(&app, &request)
}

#[host_command(mutation, resources(LauncherImageCache))]
pub async fn clear_launcher_image_cache(app: AppHandle) -> Result<(), String> {
    domain::launcher::image_cache::clear_launcher_image_cache(app)
}

#[host_command(network)]
pub async fn load_launcher_nexus_diagnostics(
    app: AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    (|| -> anyhow::Result<NexusDiagnosticsResult> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::diagnostics::load_launcher_nexus_diagnostics(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
        )
    })()
}

#[host_command(network)]
pub async fn restart_launcher_nexus_diagnostics(
    app: AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    (|| -> anyhow::Result<NexusDiagnosticsResult> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::diagnostics::restart_launcher_nexus_diagnostics_with_app(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
        )
    })()
}

#[host_command(network)]
pub async fn retry_launcher_nexus_diagnostics_route(
    app: AppHandle,
    route_id: String,
) -> Result<NexusDiagnosticsResult, String> {
    (|| -> anyhow::Result<NexusDiagnosticsResult> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::diagnostics::retry_launcher_nexus_diagnostics_route(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
            route_id,
        )
    })()
}

#[host_command(mutation, resources(AppUiState))]
pub async fn set_launcher_nexus_force_offline(
    app: AppHandle,
    force_offline: bool,
) -> Result<NexusDiagnosticsResult, String> {
    (|| -> anyhow::Result<NexusDiagnosticsResult> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let settings = domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        domain::nexusmods::diagnostics::set_launcher_nexus_force_offline(
            &domain::nexusmods::request::NexusRequestContext::new(settings.nexus_api_key),
            force_offline,
        )
    })()
}

#[host_command(mutation, resources(LauncherUpdatesCache))]
pub async fn load_cached_launcher_updates(
    app: AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    domain::launcher::updates::load_cached_launcher_updates(app, request)
}

#[host_command(io, resources(LauncherUpdatesCache))]
pub async fn load_suppressed_launcher_update_mod_ids(
    app: AppHandle,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> Result<LauncherSuppressedUpdateModIdsResult, String> {
    domain::launcher::updates::load_suppressed_launcher_update_mod_ids(app, request)
}

#[host_command(network)]
pub async fn check_launcher_updates(
    app: AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    domain::launcher::updates::check_launcher_updates_blocking(&app, &request)
}

#[host_command(network)]
pub async fn check_smapi_update(app: AppHandle) -> Result<CheckSmapiUpdateResult, String> {
    domain::launcher::smapi_update::check_smapi_update_blocking()
}

#[host_command(mutation, resources(LauncherSettings, LauncherInstallTree))]
pub async fn install_smapi_update(
    app: AppHandle,
    request: InstallSmapiUpdateRequest,
) -> Result<InstallSmapiUpdateResult, String> {
    domain::launcher::smapi_update::install_smapi_update_blocking(&app, request)
}

#[host_command(io)]
pub async fn find_smapi_installer_downloads(
    app: AppHandle,
) -> Result<FindSmapiInstallerDownloadsResult, String> {
    domain::launcher::smapi_update::find_smapi_installer_downloads_blocking()
}

#[host_command(mutation, resources(LauncherSettings, LauncherInstallTree))]
pub async fn install_launcher_archive(
    app: AppHandle,
    request: InstallLauncherArchiveRequest,
) -> Result<InstallLauncherArchiveResult, String> {
    domain::launcher::archive::install_launcher_archive(app, request)
}

#[host_command(io)]
pub async fn list_launcher_install_backups(
    app: AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> Result<Vec<LauncherInstallBackupSummary>, String> {
    domain::launcher::archive::list_launcher_install_backups(app, request)
}

#[host_command(mutation, resources(LauncherInstallTree))]
pub async fn restore_launcher_install_backup(
    app: AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> Result<RestoreLauncherInstallBackupResult, String> {
    domain::launcher::archive::restore_launcher_install_backup(app, request)
}

#[host_command(io)]
pub async fn inspect_launcher_archive(
    app: AppHandle,
    request: InspectLauncherArchiveRequest,
) -> Result<InspectLauncherArchiveResult, String> {
    domain::launcher::archive::inspect_launcher_archive(request)
}

#[host_command(network)]
pub async fn validate_nexus_api_key(app: AppHandle) -> Result<ValidateApiKeyResult, String> {
    (|| -> anyhow::Result<ValidateApiKeyResult> {
        let api_key = domain::launcher::settings::load_launcher_settings(app)?
            .nexus_api_key
            .unwrap_or_default();
        domain::nexusmods::validate_nexus_api_key(&api_key)
    })()
}

#[host_command(network)]
pub async fn start_nexus_sso(app: AppHandle) -> Result<SsoStartResult, String> {
    // The SSO flow resolves the API key asynchronously; the binding seam
    // provides the persistence callback so the nexusmods domain never writes
    // launcher settings itself (R4).
    let save_api_key = |api_key: &str| -> anyhow::Result<()> {
        let settings_path = domain::app_paths::launcher_settings_path()?;
        let mut settings =
            domain::launcher::settings::load_or_create_settings_at_path(&settings_path)?;
        settings.nexus_api_key = Some(api_key.to_string());
        domain::launcher::settings::save_settings_at_path(&settings_path, &settings)
    };
    domain::nexusmods::sso::start_sso_with_status(&app, save_api_key)
}

#[host_command(control)]
pub async fn get_nexus_sso_status(app: AppHandle) -> Result<SsoSnapshot, String> {
    Ok::<_, String>(domain::nexusmods::sso::get_sso_status())
}

#[host_command(control, wrap(raw))]
pub async fn cancel_nexus_sso(app: AppHandle) -> Result<(), String> {
    domain::nexusmods::sso::cancel_sso();
    Ok(Value::Null)
}
