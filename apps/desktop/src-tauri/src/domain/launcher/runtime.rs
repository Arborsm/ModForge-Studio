use super::paths::{launcher_backup_dir, launcher_settings_path};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    LauncherGameLaunchError, LauncherGameLaunchErrorCode, LauncherGameLaunchResult,
    LauncherGameLaunchTarget, LauncherSettings, OpenLauncherPathRequest, OpenLauncherUrlRequest,
};
use crate::infrastructure::fs::pathing::{
    clean_input_path, normalize_path, smapi_launch_candidates, stardew_game_launch_candidates,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use url::Url;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    log_launcher_trace(
        "launch.resolve",
        &[("gamePath", normalize_path(&game_root))],
    );
    let smapi_candidates = smapi_launch_candidates(&game_root);
    if let Some(smapi_path) = smapi_candidates.iter().find(|path| path.is_file()) {
        return Ok((smapi_path.to_path_buf(), LauncherGameLaunchTarget::Smapi));
    }

    let base_candidates = stardew_game_launch_candidates(&game_root);
    if let Some(base_path) = base_candidates.iter().find(|path| path.is_file()) {
        return Ok((
            base_path.to_path_buf(),
            LauncherGameLaunchTarget::StardewValley,
        ));
    }

    let checked_paths = smapi_candidates
        .iter()
        .chain(base_candidates.iter())
        .map(|path| normalize_path(path))
        .collect::<Vec<_>>()
        .join(", ");

    Err(launcher_launch_error(
        LauncherGameLaunchErrorCode::MissingExecutable,
        format!("No launcher executable found. Checked {checked_paths}."),
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
    log_launcher_trace(
        "launch.start",
        &[
            ("target", format!("{target:?}")),
            ("executablePath", normalize_path(&executable_path)),
        ],
    );
    runner(&executable_path).map_err(|message| {
        launcher_launch_error(
            LauncherGameLaunchErrorCode::LaunchFailed,
            format!(
                "Failed to launch {}: {message}",
                normalize_path(&executable_path)
            ),
        )
    })?;
    log_launcher_trace(
        "launch.complete",
        &[
            ("target", format!("{target:?}")),
            ("executablePath", normalize_path(&executable_path)),
        ],
    );
    Ok(LauncherGameLaunchResult {
        executable_path: normalize_path(&executable_path),
        target,
    })
}

fn spawn_launcher_process(path: &Path) -> Result<(), String> {
    let mut command = Command::new(path);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to start process: {error}"))
}

pub fn launch_launcher_game(
    _app: tauri::AppHandle,
) -> Result<LauncherGameLaunchResult, LauncherGameLaunchError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error_with_message(
        "launch_launcher_game",
        (|| {
            let settings_path = launcher_settings_path().map_err(|message| {
                launcher_launch_error(LauncherGameLaunchErrorCode::LaunchFailed, message)
            })?;
            let settings = load_or_create_settings_at_path(&settings_path).map_err(|message| {
                launcher_launch_error(LauncherGameLaunchErrorCode::LaunchFailed, message)
            })?;
            launch_game_with_runner(&settings, spawn_launcher_process)
        })(),
        |error| error.message.clone(),
    )
}

pub fn get_launcher_backup_directory(_app: tauri::AppHandle) -> Result<String, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "get_launcher_backup_directory",
        (|| {
            let backup_dir = launcher_backup_dir()?;
            fs::create_dir_all(&backup_dir).map_err(|error| {
                format!(
                    "Failed to create launcher backup directory {}: {error}",
                    normalize_path(&backup_dir)
                )
            })?;
            Ok(normalize_path(&backup_dir))
        })(),
    )
}

pub fn open_launcher_path(request: OpenLauncherPathRequest) -> Result<(), String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "open_launcher_path",
        (|| {
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
        })(),
    )
}

pub fn open_launcher_url(request: OpenLauncherUrlRequest) -> Result<(), String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "open_launcher_url",
        open_launcher_url_in_browser(&request.url),
    )
}

pub(crate) fn open_launcher_url_in_browser(raw_url: &str) -> Result<(), String> {
    let raw_url = raw_url.trim();
    if raw_url.is_empty() {
        return Err("url is required.".to_string());
    }

    let parsed =
        Url::parse(raw_url).map_err(|error| format!("Invalid launcher URL {raw_url}: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => open_url_in_shell(parsed.as_str()),
        scheme => Err(format!("Unsupported launcher URL scheme: {scheme}.")),
    }
}

#[cfg(target_os = "windows")]
fn open_path_in_shell(path: &Path) -> Result<(), String> {
    let mut command = Command::new("explorer");
    command.creation_flags(CREATE_NO_WINDOW).arg(path);

    let status = command.status().map_err(|error| {
        format!(
            "Failed to launch explorer for {}: {error}",
            normalize_path(path)
        )
    })?;
    if !status.success() {
        return Err(format!("Explorer failed for {}.", normalize_path(path)));
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn open_url_in_shell(url: &str) -> Result<(), String> {
    let mut command = Command::new("rundll32");
    command
        .creation_flags(CREATE_NO_WINDOW)
        .args(["url.dll,FileProtocolHandler", url])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command
        .spawn()
        .map_err(|error| format!("Failed to launch browser for {url}: {error}"))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn open_url_in_shell(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to launch browser for {url}: {error}"))?;

    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_url_in_shell(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to launch browser for {url}: {error}"))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn open_path_in_shell(path: &Path) -> Result<(), String> {
    let status = Command::new("open").arg(path).status().map_err(|error| {
        format!(
            "Failed to launch open for {}: {error}",
            normalize_path(path)
        )
    })?;
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
        .map_err(|error| {
            format!(
                "Failed to launch xdg-open for {}: {error}",
                normalize_path(path)
            )
        })?;
    if !status.success() {
        return Err(format!("xdg-open failed for {}.", normalize_path(path)));
    }

    Ok(())
}
