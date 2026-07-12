use super::paths::launcher_settings_path;
use super::types::{LauncherSettings, NullablePatch, SaveLauncherSettingsRequest};
use crate::AppHandle;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::text_encoding::read_text_file;
use anyhow::Context;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

static LAUNCHER_SETTINGS_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_launcher_settings_file() -> MutexGuard<'static, ()> {
    match LAUNCHER_SETTINGS_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!(target: "Launcher Settings", "Launcher settings file lock was poisoned");
            poisoned.into_inner()
        }
    }
}

pub(crate) fn normalize_settings(settings: LauncherSettings) -> LauncherSettings {
    let game_path = normalize_optional_path(settings.game_path);
    let mut mods_path = normalize_optional_path(settings.mods_path);
    if mods_path.is_none() {
        if let Some(game_root) = game_path.as_deref() {
            let derived = clean_input_path(game_root).join("Mods");
            if derived.is_dir() {
                mods_path = Some(normalize_path(&derived));
            }
        }
    }

    LauncherSettings {
        game_path,
        mods_path,
        download_path: normalize_optional_path(settings.download_path)
            .or_else(default_launcher_download_path),
        nexus_api_key: normalize_optional_text(settings.nexus_api_key),
        auto_install_downloads: settings.auto_install_downloads,
        keep_downloaded_archives: settings.keep_downloaded_archives,
        auto_check_mod_updates: settings.auto_check_mod_updates,
        gmcm_parsing_enabled: settings.gmcm_parsing_enabled,
    }
}

fn normalize_optional_path(path: Option<String>) -> Option<String> {
    path.and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            return None;
        }

        Some(normalize_path(&clean_input_path(trimmed)))
    })
}

pub(crate) fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn optional_text_present(value: &Option<String>) -> bool {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}

pub(crate) fn load_or_create_settings_at_path(
    settings_path: &Path,
) -> anyhow::Result<LauncherSettings> {
    let _settings_file_guard = lock_launcher_settings_file();
    load_or_create_settings_at_path_unlocked(settings_path)
}

fn load_or_create_settings_at_path_unlocked(
    settings_path: &Path,
) -> anyhow::Result<LauncherSettings> {
    if settings_path.is_file() {
        let content = read_text_file(settings_path).with_context(|| {
            format!(
                "Failed to read launcher settings {}",
                normalize_path(settings_path)
            )
        })?;
        let parsed: LauncherSettings = serde_json::from_str(&content).with_context(|| {
            format!(
                "Launcher settings {} is invalid JSON",
                normalize_path(settings_path)
            )
        })?;
        return Ok(normalize_settings(parsed));
    }

    let defaults = normalize_settings(LauncherSettings::default());
    save_settings_at_path_unlocked(settings_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_settings_at_path(
    settings_path: &Path,
    settings: &LauncherSettings,
) -> anyhow::Result<()> {
    let _settings_file_guard = lock_launcher_settings_file();
    save_settings_at_path_unlocked(settings_path, settings)
}

fn save_settings_at_path_unlocked(
    settings_path: &Path,
    settings: &LauncherSettings,
) -> anyhow::Result<()> {
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create launcher settings directory {}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_settings(settings.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize launcher settings JSON"))?;
    fs::write(settings_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher settings {}",
            normalize_path(settings_path)
        )
    })?;
    Ok(())
}

pub(crate) fn resolve_download_dir(settings: &LauncherSettings) -> anyhow::Result<PathBuf> {
    if let Some(path) = settings.download_path.as_deref() {
        return Ok(clean_input_path(path));
    }

    default_download_path()
        .context("downloadPath is not configured and no default Downloads folder was found.")
}

fn default_launcher_download_path() -> Option<String> {
    default_download_path().map(|path| normalize_path(&path))
}

fn default_download_path() -> Option<PathBuf> {
    dirs::download_dir()
}

pub fn load_launcher_settings(_app: AppHandle) -> anyhow::Result<LauncherSettings> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_settings",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            log::info!(
                target: "Launcher Settings",
                "Loaded settings: api-key-present={}",
                optional_text_present(&settings.nexus_api_key)
            );
            Ok(settings)
        })(),
    )
}

pub(crate) fn merge_launcher_settings(
    existing: LauncherSettings,
    request: SaveLauncherSettingsRequest,
) -> LauncherSettings {
    LauncherSettings {
        game_path: request.game_path.or(existing.game_path),
        mods_path: request.mods_path.or(existing.mods_path),
        download_path: request.download_path.or(existing.download_path),
        nexus_api_key: match request.nexus_api_key {
            NullablePatch::Missing => existing.nexus_api_key,
            NullablePatch::Null => None,
            NullablePatch::Value(value) => Some(value),
        },
        auto_install_downloads: request
            .auto_install_downloads
            .unwrap_or(existing.auto_install_downloads),
        keep_downloaded_archives: request
            .keep_downloaded_archives
            .unwrap_or(existing.keep_downloaded_archives),
        auto_check_mod_updates: request
            .auto_check_mod_updates
            .unwrap_or(existing.auto_check_mod_updates),
        gmcm_parsing_enabled: request
            .gmcm_parsing_enabled
            .unwrap_or(existing.gmcm_parsing_enabled),
    }
}

pub fn save_launcher_settings(
    app: AppHandle,
    request: SaveLauncherSettingsRequest,
) -> anyhow::Result<LauncherSettings> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_launcher_settings",
        (|| {
            let settings_path = launcher_settings_path()?;
            let _settings_file_guard = lock_launcher_settings_file();
            let existing = load_or_create_settings_at_path_unlocked(&settings_path)?;
            let nexus_api_key_request_state = request.nexus_api_key.state_label();
            log::info!(
                target: "Launcher Settings",
                "Save settings request: api-key={} existing-api-key-present={}",
                nexus_api_key_request_state,
                optional_text_present(&existing.nexus_api_key)
            );

            let merged = merge_launcher_settings(existing, request);
            let normalized = normalize_settings(merged);
            log::info!(
                target: "Launcher Settings",
                "Saved settings: api-key-present={}",
                optional_text_present(&normalized.nexus_api_key)
            );
            save_settings_at_path_unlocked(&settings_path, &normalized)?;
            restart_launcher_nexus_diagnostics_with_app(&app, &normalized);
            Ok(normalized)
        })(),
    )
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_app(
    app: &AppHandle,
    settings: &LauncherSettings,
) {
    log::info!(
        target: "Launcher Settings",
        "Restart Nexus diagnostics after settings save: api-key-present={}",
        optional_text_present(&settings.nexus_api_key)
    );
    crate::domain::nexusmods::diagnostics::restart_launcher_nexus_diagnostics_with_handle(
        Some(app),
        settings,
    );
}

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/settings_tests.rs"]
mod settings_tests;
