use super::paths::launcher_settings_path;
use super::types::{LauncherSettings, SaveLauncherSettingsRequest};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

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
        download_path: normalize_optional_path(settings.download_path),
        nexus_api_key: normalize_optional_text(settings.nexus_api_key),
        auto_install_downloads: settings.auto_install_downloads,
        keep_downloaded_archives: settings.keep_downloaded_archives,
        auto_check_mod_updates: settings.auto_check_mod_updates,
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

pub(crate) fn load_or_create_settings_at_path(
    settings_path: &Path,
) -> Result<LauncherSettings, String> {
    if settings_path.is_file() {
        let content = fs::read_to_string(settings_path).map_err(|error| {
            format!(
                "Failed to read launcher settings {}: {error}",
                normalize_path(settings_path)
            )
        })?;
        let parsed: LauncherSettings = serde_json::from_str(&content).map_err(|error| {
            format!(
                "Launcher settings {} is invalid JSON: {error}",
                normalize_path(settings_path)
            )
        })?;
        return Ok(normalize_settings(parsed));
    }

    let defaults = LauncherSettings::default();
    save_settings_at_path(settings_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_settings_at_path(
    settings_path: &Path,
    settings: &LauncherSettings,
) -> Result<(), String> {
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher settings directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_settings(settings.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize launcher settings JSON: {error}"))?;
    fs::write(settings_path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher settings {}: {error}",
            normalize_path(settings_path)
        )
    })?;
    Ok(())
}

pub(crate) fn resolve_download_dir(settings: &LauncherSettings) -> Result<PathBuf, String> {
    if let Some(path) = settings.download_path.as_deref() {
        return Ok(clean_input_path(path));
    }

    default_download_path().ok_or_else(|| {
        "downloadPath is not configured and no default Downloads folder was found.".to_string()
    })
}

fn default_download_path() -> Option<PathBuf> {
    if let Ok(user_profile) = env::var("USERPROFILE") {
        return Some(
            PathBuf::from(user_profile)
                .join("Downloads")
                .join("ModForge Studio"),
        );
    }

    if let Ok(home) = env::var("HOME") {
        return Some(
            PathBuf::from(home)
                .join("Downloads")
                .join("ModForge Studio"),
        );
    }

    None
}

pub fn load_launcher_settings(_app: tauri::AppHandle) -> Result<LauncherSettings, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_settings",
        (|| {
            let settings_path = launcher_settings_path()?;
            load_or_create_settings_at_path(&settings_path)
        })(),
    )
}

pub fn save_launcher_settings(
    app: tauri::AppHandle,
    request: SaveLauncherSettingsRequest,
) -> Result<LauncherSettings, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_launcher_settings",
        (|| {
            let settings_path = launcher_settings_path()?;
            let existing = load_or_create_settings_at_path(&settings_path)?;
            let merged = LauncherSettings {
                game_path: request.game_path.or(existing.game_path),
                mods_path: request.mods_path.or(existing.mods_path),
                download_path: request.download_path.or(existing.download_path),
                nexus_api_key: request.nexus_api_key.or(existing.nexus_api_key),
                auto_install_downloads: request
                    .auto_install_downloads
                    .unwrap_or(existing.auto_install_downloads),
                keep_downloaded_archives: request
                    .keep_downloaded_archives
                    .unwrap_or(existing.keep_downloaded_archives),
                auto_check_mod_updates: request
                    .auto_check_mod_updates
                    .unwrap_or(existing.auto_check_mod_updates),
            };
            let normalized = normalize_settings(merged);
            save_settings_at_path(&settings_path, &normalized)?;
            restart_launcher_nexus_diagnostics_with_app(&app, &normalized);
            Ok(normalized)
        })(),
    )
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_app(
    app: &tauri::AppHandle,
    settings: &LauncherSettings,
) {
    crate::domain::nexusmods::http::restart_launcher_nexus_diagnostics_with_handle(
        Some(app),
        settings,
    );
}

#[cfg(test)]
#[path = "tests/settings_tests.rs"]
mod settings_tests;
