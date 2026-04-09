use super::archive::install_archive_at_path;
use super::fs::{sanitize_file_name, unique_path};
use super::http::{api_headers, launcher_http_client, DEFAULT_GAME_ID, LAUNCHER_USER_AGENT};
use super::paths::{launcher_backup_dir, launcher_download_queue_path, launcher_settings_path};
use super::settings::{load_or_create_settings_at_path, resolve_download_dir};
use super::types::{
    DownloadLauncherModRequest, DownloadLauncherModResult, LauncherDownloadQueueItem,
    LauncherDownloadQueueState,
};
use crate::pathing::normalize_path;
use reqwest::blocking::Response;
use reqwest::header::{CONTENT_DISPOSITION, COOKIE, USER_AGENT};
use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Clone)]
struct DownloadCandidate {
    file_id: i64,
    file_name: String,
    version: Option<String>,
}

fn normalize_download_queue_state(state: LauncherDownloadQueueState) -> LauncherDownloadQueueState {
    LauncherDownloadQueueState {
        items: state
            .items
            .into_iter()
            .filter_map(|item| {
                let id = item.id.trim().to_string();
                let title = item.title.trim().to_string();
                let source = item.source.trim().to_string();
                if id.is_empty() || item.mod_id < 1 || title.is_empty() || source.is_empty() {
                    return None;
                }

                let normalized_status = match item.status.trim() {
                    "downloading" | "resolving" | "installing" | "extracting" | "verifying" => {
                        "queued".to_string()
                    }
                    value if !value.is_empty() => value.to_string(),
                    _ => "queued".to_string(),
                };

                Some(LauncherDownloadQueueItem {
                    id,
                    mod_id: item.mod_id,
                    title,
                    version: item
                        .version
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    image_url: item
                        .image_url
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    source,
                    status: normalized_status,
                    archive_path: item
                        .archive_path
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    installed_target_path: item
                        .installed_target_path
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    error: item
                        .error
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty()),
                    added_at: item.added_at,
                    completed_at: item.completed_at,
                })
            })
            .collect(),
    }
}

pub(crate) fn load_or_create_download_queue_at_path(
    queue_path: &Path,
) -> Result<LauncherDownloadQueueState, String> {
    if queue_path.is_file() {
        let content = fs::read_to_string(queue_path).map_err(|error| {
            format!(
                "Failed to read launcher download queue {}: {error}",
                normalize_path(queue_path)
            )
        })?;
        let parsed: LauncherDownloadQueueState = serde_json::from_str(&content).map_err(|error| {
            format!(
                "Launcher download queue {} is invalid JSON: {error}",
                normalize_path(queue_path)
            )
        })?;
        return Ok(normalize_download_queue_state(parsed));
    }

    let defaults = LauncherDownloadQueueState { items: Vec::new() };
    save_download_queue_at_path(queue_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_download_queue_at_path(
    queue_path: &Path,
    state: &LauncherDownloadQueueState,
) -> Result<(), String> {
    if let Some(parent) = queue_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher download queue directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_download_queue_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize launcher download queue JSON: {error}"))?;
    fs::write(queue_path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher download queue {}: {error}",
            normalize_path(queue_path)
        )
    })?;
    Ok(())
}

#[tauri::command]
pub fn load_launcher_download_queue(
    app: tauri::AppHandle,
) -> Result<LauncherDownloadQueueState, String> {
    let queue_path = launcher_download_queue_path(&app)?;
    load_or_create_download_queue_at_path(&queue_path)
}

#[tauri::command]
pub fn save_launcher_download_queue(
    app: tauri::AppHandle,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    let queue_path = launcher_download_queue_path(&app)?;
    let normalized = normalize_download_queue_state(request);
    save_download_queue_at_path(&queue_path, &normalized)?;
    Ok(normalized)
}

fn fetch_mod_files_payload(
    client: &reqwest::blocking::Client,
    api_key: &str,
    mod_id: i64,
) -> Result<Value, String> {
    let response = client
        .get(format!(
            "https://api.nexusmods.com/v1/games/stardewvalley/mods/{mod_id}/files.json"
        ))
        .headers(api_headers(api_key)?)
        .send()
        .map_err(|error| format!("Failed to fetch launcher mod files: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Launcher mod files request failed for {mod_id}: HTTP {}",
            response.status()
        ));
    }

    response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse launcher mod files JSON: {error}"))
}

fn select_download_candidate(
    payload: &Value,
    requested_file_id: Option<i64>,
    requested_version: Option<&str>,
) -> Result<DownloadCandidate, String> {
    let files = payload
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| "Launcher mod files payload did not contain a files array.".to_string())?;
    if files.is_empty() {
        return Err("Launcher mod did not contain any downloadable files.".to_string());
    }

    let selected = if let Some(file_id) = requested_file_id {
        files.iter().find(|item| item.get("file_id").and_then(Value::as_i64) == Some(file_id))
    } else if let Some(version) = requested_version {
        files.iter().find(|item| {
            item.get("version")
                .and_then(Value::as_str)
                .map(|value| value.trim() == version.trim())
                .unwrap_or(false)
        })
    } else {
        files.iter().max_by_key(|item| {
            item.get("uploaded_timestamp")
                .and_then(Value::as_i64)
                .unwrap_or_default()
        })
    }
    .ok_or_else(|| "Unable to resolve a launcher download file.".to_string())?;

    let file_id = selected
        .get("file_id")
        .and_then(Value::as_i64)
        .ok_or_else(|| "Launcher download file is missing file_id.".to_string())?;
    let file_name = selected
        .get("file_name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Launcher download file is missing file_name.".to_string())?
        .to_string();

    Ok(DownloadCandidate {
        file_id,
        file_name,
        version: selected
            .get("version")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
    })
}

fn resolve_download_url(
    client: &reqwest::blocking::Client,
    settings: &super::types::LauncherSettings,
    mod_id: i64,
    file_id: i64,
) -> Result<String, String> {
    if let Some(api_key) = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let response = client
            .get(format!(
                "https://api.nexusmods.com/v1/games/stardewvalley/mods/{mod_id}/files/{file_id}/download_link.json"
            ))
            .headers(api_headers(api_key)?)
            .send()
            .map_err(|error| format!("Failed to fetch launcher download links: {error}"))?;
        if response.status().is_success() {
            let payload = response
                .json::<Value>()
                .map_err(|error| format!("Failed to parse launcher download links JSON: {error}"))?;
            if let Some(uri) = payload
                .as_array()
                .and_then(|items| items.first())
                .and_then(|item| item.get("URI"))
                .and_then(Value::as_str)
            {
                return Ok(uri.to_string());
            }
        }
    }

    let cookie = settings
        .nexus_cookie
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            "Unable to resolve a Nexus download link. Configure a Nexus cookie or use a premium API key.".to_string()
        })?;
    let response = client
        .post("https://www.nexusmods.com/Core/Libs/Common/Managers/Downloads?GenerateDownloadUrl")
        .header(USER_AGENT, LAUNCHER_USER_AGENT)
        .header(COOKIE, cookie)
        .form(&[
            ("fid", file_id.to_string()),
            ("game_id", DEFAULT_GAME_ID.to_string()),
        ])
        .send()
        .map_err(|error| format!("Failed to fetch launcher web download link: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Launcher web download link request failed for {mod_id}/{file_id}: HTTP {}",
            response.status()
        ));
    }
    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse launcher web download link JSON: {error}"))?;
    payload
        .get("url")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Launcher web download link response did not include a URL.".to_string())
}

fn download_file_name(response: &Response, fallback: &str) -> String {
    let fallback_name = sanitize_file_name(fallback);
    response
        .headers()
        .get(CONTENT_DISPOSITION)
        .and_then(|value| value.to_str().ok())
        .and_then(parse_content_disposition_file_name)
        .map(|value| sanitize_file_name(&value))
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_name)
}

fn parse_content_disposition_file_name(value: &str) -> Option<String> {
    value.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        if !key.eq_ignore_ascii_case("filename") {
            return None;
        }
        Some(value.trim_matches('"').trim().to_string())
    })
}

#[tauri::command]
pub fn download_launcher_mod(
    app: tauri::AppHandle,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    if request.mod_id < 1 {
        return Err("modId must be greater than 0.".to_string());
    }

    let settings_path = launcher_settings_path(&app)?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let api_key = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Nexus API key is required to download mods.".to_string())?;
    let download_dir = resolve_download_dir(&settings)?;
    fs::create_dir_all(&download_dir).map_err(|error| {
        format!(
            "Failed to create launcher download directory {}: {error}",
            normalize_path(&download_dir)
        )
    })?;

    let client = launcher_http_client()?;
    let files_payload = fetch_mod_files_payload(&client, api_key, request.mod_id)?;
    let candidate = select_download_candidate(
        &files_payload,
        request.file_id,
        request.version.as_deref(),
    )?;
    let download_url = resolve_download_url(&client, &settings, request.mod_id, candidate.file_id)?;
    let response = client
        .get(&download_url)
        .send()
        .map_err(|error| format!("Failed to download launcher mod: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to download launcher mod {}: HTTP {}",
            request.mod_id,
            response.status()
        ));
    }

    let file_name = download_file_name(&response, &candidate.file_name);
    let archive_path = unique_path(&download_dir.join(file_name));
    let mut archive_file = fs::File::create(&archive_path).map_err(|error| {
        format!(
            "Failed to create launcher archive {}: {error}",
            normalize_path(&archive_path)
        )
    })?;
    let bytes = response
        .bytes()
        .map_err(|error| format!("Failed to read launcher download bytes: {error}"))?;
    archive_file.write_all(&bytes).map_err(|error| {
        format!(
            "Failed to write launcher archive {}: {error}",
            normalize_path(&archive_path)
        )
    })?;

    let mut installed = false;
    let mut installed_target_path = None;
    if settings.auto_install_downloads {
        let install_result = install_archive_at_path(
            &archive_path,
            settings.mods_path.as_deref(),
            Some(launcher_backup_dir(&app)?.as_path()),
        )?;
        installed = true;
        installed_target_path = Some(install_result.target_path.clone());
        if !settings.keep_downloaded_archives {
            let _ = fs::remove_file(&archive_path);
        }
    }

    Ok(DownloadLauncherModResult {
        mod_id: request.mod_id,
        title: request
            .title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| format!("Nexus Mod {}", request.mod_id)),
        version: candidate.version,
        file_name: archive_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string(),
        archive_path: normalize_path(&archive_path),
        installed,
        installed_target_path,
    })
}
