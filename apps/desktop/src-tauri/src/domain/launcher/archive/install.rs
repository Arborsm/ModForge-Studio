use super::extract::{expand_archive_to_path, temp_work_dir};
use super::inspect::inspect_archive_at_path;
use crate::AppHandle;
use crate::domain::app_paths::{
    launcher_backup_dir, launcher_settings_path, launcher_updates_cache_path,
};
use crate::domain::launcher::install_manager::{
    install_archive_bundle_at_path, list_backup_sessions_at_root, restore_backup_session_at_path,
};
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    InspectLauncherArchiveRequest, InspectLauncherArchiveResult,
    InstallLauncherArchiveInstalledMod, InstallLauncherArchiveRequest,
    InstallLauncherArchiveResult, LauncherInstallBackupSummary, ListLauncherInstallBackupsRequest,
    RestoreLauncherInstallBackupRequest, RestoreLauncherInstallBackupResult,
};
use crate::domain::launcher::update_cache::invalidate_launcher_updates_cache_at_path;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use anyhow::{Context, bail};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn install_archive_at_path(
    archive_path: &Path,
    mods_path: Option<&str>,
    backup_root: Option<&Path>,
) -> anyhow::Result<InstallLauncherArchiveResult> {
    if !archive_path.is_file() {
        bail!(
            "Launcher archive {} does not exist.",
            normalize_path(archive_path)
        );
    }
    let mods_path = mods_path
        .map(clean_input_path)
        .context("modsPath is required to install launcher archives.")?;
    log_launcher_trace("install.start", |event| {
        event
            .path("archivePath", archive_path)
            .path("modsPath", &mods_path)
            .flag("hasBackupRoot", backup_root.is_some())
    });
    fs::create_dir_all(&mods_path).with_context(|| {
        format!(
            "Failed to create launcher mods directory {}",
            normalize_path(&mods_path)
        )
    })?;
    let persisted_backup_root = backup_root
        .map(Path::to_path_buf)
        .unwrap_or_else(|| temp_work_dir("launcher-install-backups"));
    fs::create_dir_all(&persisted_backup_root).with_context(|| {
        format!(
            "Failed to create launcher backup directory {}",
            normalize_path(&persisted_backup_root)
        )
    })?;

    let result = install_archive_bundle_at_path(
        archive_path,
        &mods_path,
        &persisted_backup_root,
        |temp_root| {
            expand_archive_to_path(archive_path, temp_root, None)?;
            Ok(temp_root.to_path_buf())
        },
    )?;
    let public_result = InstallLauncherArchiveResult {
        mod_name: result.mod_name,
        unique_id: result.unique_id,
        version: result.version,
        target_path: result.target_path,
        preserved_config: result.preserved_config,
        preserved_i18n_files: result.preserved_i18n_files,
        installed_mods: result
            .installed_mods
            .into_iter()
            .map(|item| InstallLauncherArchiveInstalledMod {
                mod_name: item.mod_name,
                unique_id: item.unique_id,
                version: item.version,
                target_path: item.target_path,
                preserved_config: item.preserved_config,
                preserved_i18n_files: item.preserved_i18n_files,
            })
            .collect(),
        backup_id: result.backup_id,
        backup_path: result.backup_path,
        previous_version: result.previous_version,
        upgraded: result.upgraded,
    };
    log_launcher_trace("install.complete", |event| {
        event
            .field("targetPath", &public_result.target_path)
            .field("modName", &public_result.mod_name)
            .optional("uniqueId", public_result.unique_id.as_deref())
            .optional("version", public_result.version.as_deref())
            .count("installedModCount", public_result.installed_mods.len())
            .field("backupId", &public_result.backup_id)
    });
    Ok(public_result)
}

pub(crate) fn resolve_backup_session_path(
    backup_root: &Path,
    backup_id: &str,
) -> anyhow::Result<PathBuf> {
    let backup_id = backup_id.trim();
    if backup_id.is_empty() {
        bail!("backupId is required.");
    }
    if backup_id
        .chars()
        .any(|character| matches!(character, '/' | '\\' | ':'))
    {
        bail!("backupId {backup_id} must identify a direct backup entry.");
    }

    let mut components = Path::new(backup_id).components();
    match components.next() {
        Some(Component::Normal(_)) if components.next().is_none() => {
            Ok(backup_root.join(backup_id))
        }
        _ => Err(anyhow::anyhow!(
            "backupId {backup_id} must identify a direct backup entry."
        )),
    }
}

pub fn install_launcher_archive(
    _app: AppHandle,
    request: InstallLauncherArchiveRequest,
) -> anyhow::Result<InstallLauncherArchiveResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "install_launcher_archive",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let result = install_archive_at_path(
                &clean_input_path(request.archive_path.trim()),
                request
                    .mods_path
                    .as_deref()
                    .filter(|value| !value.trim().is_empty())
                    .or(settings.mods_path.as_deref()),
                Some(launcher_backup_dir()?.as_path()),
            )?;

            if let Some(mods_path) = clean_input_path(&result.target_path)
                .parent()
                .map(normalize_path)
            {
                let cache_path = launcher_updates_cache_path()?;
                invalidate_launcher_updates_cache_at_path(&cache_path, Some(&mods_path))?;
            }

            Ok(result)
        })(),
    )
}

pub fn inspect_launcher_archive(
    request: InspectLauncherArchiveRequest,
) -> anyhow::Result<InspectLauncherArchiveResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "inspect_launcher_archive",
        (|| {
            let archive_path = request.archive_path.trim();
            if archive_path.is_empty() {
                bail!("archivePath is required.");
            }

            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(clean_input_path);

            inspect_archive_at_path(&clean_input_path(archive_path), mods_path.as_deref())
        })(),
    )
}

pub fn list_launcher_install_backups(
    _app: AppHandle,
    request: ListLauncherInstallBackupsRequest,
) -> anyhow::Result<Vec<LauncherInstallBackupSummary>> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "list_launcher_install_backups",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .or(settings.mods_path.as_deref())
                .map(clean_input_path);
            let backup_root = launcher_backup_dir()?;
            let sessions = list_backup_sessions_at_root(&backup_root, mods_path.as_deref())?;
            Ok(sessions
                .into_iter()
                .map(|session| LauncherInstallBackupSummary {
                    backup_id: session.backup_id,
                    backup_path: session.backup_path,
                    delete_count: session.delete_count,
                    overwrite_count: session.overwrite_count,
                    created_at_ms: session.created_at_ms,
                    primary_mod_name: session.primary_mod_name,
                    primary_version: session.primary_version,
                    mod_count: session.mod_count,
                })
                .collect())
        })(),
    )
}

pub fn restore_launcher_install_backup(
    _app: AppHandle,
    request: RestoreLauncherInstallBackupRequest,
) -> anyhow::Result<RestoreLauncherInstallBackupResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "restore_launcher_install_backup",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let mods_path = request
                .mods_path
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .or(settings.mods_path.as_deref())
                .map(clean_input_path);
            let backup_root = launcher_backup_dir()?;
            let backup_path = resolve_backup_session_path(&backup_root, &request.backup_id)?;
            let result = restore_backup_session_at_path(&backup_path, mods_path.as_deref())?;

            let cache_path = launcher_updates_cache_path()?;
            let mut invalidated = BTreeSet::new();
            for restored_path in &result.restored_paths {
                if let Some(mods_path) =
                    clean_input_path(restored_path).parent().map(normalize_path)
                {
                    if invalidated.insert(mods_path.clone()) {
                        invalidate_launcher_updates_cache_at_path(&cache_path, Some(&mods_path))?;
                    }
                }
            }

            Ok(RestoreLauncherInstallBackupResult {
                backup_id: result.backup_id,
                backup_path: result.backup_path,
                restored_paths: result.restored_paths,
            })
        })(),
    )
}
