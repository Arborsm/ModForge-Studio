use super::paths::{launcher_backup_dir, launcher_settings_path};
use super::settings::load_or_create_settings_at_path;
use super::types::{
    LauncherGameLaunchError, LauncherGameLaunchErrorCode, LauncherGameLaunchResult,
    LauncherGameLaunchTarget, LauncherSettings, OpenLauncherPathRequest,
};
use crate::pathing::{clean_input_path, normalize_path};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn launcher_launch_error(
    code: LauncherGameLaunchErrorCode,
    message: impl Into<String>,
) -> LauncherGameLaunchError {
    LauncherGameLaunchError {
        code,
        message: message.into(),
    }
}

fn resolve_game_launch_target(
    settings: &LauncherSettings,
) -> Result<(PathBuf, LauncherGameLaunchTarget), LauncherGameLaunchError> {
    let game_path = settings
        .game_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            launcher_launch_error(
                LauncherGameLaunchErrorCode::MissingGamePath,
                "Launcher gamePath is not configured.",
            )
        })?;
    let game_root = clean_input_path(game_path);
    let smapi_path = game_root.join("StardewModdingAPI.exe");
    if smapi_path.is_file() {
        return Ok((smapi_path, LauncherGameLaunchTarget::Smapi));
    }

    let base_path = game_root.join("Stardew Valley.exe");
    if base_path.is_file() {
        return Ok((base_path, LauncherGameLaunchTarget::StardewValley));
    }

    Err(launcher_launch_error(
        LauncherGameLaunchErrorCode::MissingExecutable,
        format!(
            "No launcher executable found. Checked {} and {}.",
            normalize_path(&smapi_path),
            normalize_path(&base_path)
        ),
    ))
}

pub(crate) fn launch_game_with_runner<F>(
    settings: &LauncherSettings,
    mut runner: F,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError>
where
    F: FnMut(&Path) -> Result<(), String>,
{
    let (executable_path, target) = resolve_game_launch_target(settings)?;
    runner(&executable_path).map_err(|message| {
        launcher_launch_error(
            LauncherGameLaunchErrorCode::LaunchFailed,
            format!(
                "Failed to launch {}: {message}",
                normalize_path(&executable_path)
            ),
        )
    })?;
    Ok(LauncherGameLaunchResult {
        executable_path: normalize_path(&executable_path),
        target,
    })
}

fn spawn_launcher_process(path: &Path) -> Result<(), String> {
    Command::new(path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to start process: {error}"))
}

#[tauri::command]
pub fn launch_launcher_game(
    app: tauri::AppHandle,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    let settings_path = launcher_settings_path(&app)
        .map_err(|message| launcher_launch_error(LauncherGameLaunchErrorCode::LaunchFailed, message))?;
    let settings = load_or_create_settings_at_path(&settings_path)
        .map_err(|message| launcher_launch_error(LauncherGameLaunchErrorCode::LaunchFailed, message))?;
    launch_game_with_runner(&settings, spawn_launcher_process)
}

#[tauri::command]
pub fn get_launcher_backup_directory(app: tauri::AppHandle) -> Result<String, String> {
    let backup_dir = launcher_backup_dir(&app)?;
    fs::create_dir_all(&backup_dir).map_err(|error| {
        format!(
            "Failed to create launcher backup directory {}: {error}",
            normalize_path(&backup_dir)
        )
    })?;
    Ok(normalize_path(&backup_dir))
}

#[tauri::command]
pub fn open_launcher_path(request: OpenLauncherPathRequest) -> Result<(), String> {
    let path = request.path.trim();
    if path.is_empty() {
        return Err("path is required.".to_string());
    }

    let resolved = clean_input_path(path);
    if !resolved.exists() {
        return Err(format!(
            "Launcher path {} does not exist.",
            normalize_path(&resolved)
        ));
    }

    open_path_in_shell(&resolved)
}

#[cfg(target_os = "windows")]
fn open_path_in_shell(path: &Path) -> Result<(), String> {
    let status = Command::new("explorer")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to launch explorer for {}: {error}", normalize_path(path)))?;
    if !status.success() {
        return Err(format!("Explorer failed for {}.", normalize_path(path)));
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn open_path_in_shell(path: &Path) -> Result<(), String> {
    let status = Command::new("open")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to launch open for {}: {error}", normalize_path(path)))?;
    if !status.success() {
        return Err(format!("open failed for {}.", normalize_path(path)));
    }

    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_path_in_shell(path: &Path) -> Result<(), String> {
    let status = Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|error| format!("Failed to launch xdg-open for {}: {error}", normalize_path(path)))?;
    if !status.success() {
        return Err(format!("xdg-open failed for {}.", normalize_path(path)));
    }

    Ok(())
}
