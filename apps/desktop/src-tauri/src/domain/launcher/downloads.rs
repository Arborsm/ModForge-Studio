use super::archive::install_archive_at_path;
use super::fs::{sanitize_file_name, unique_path};
use super::paths::{launcher_backup_dir, launcher_download_queue_path, launcher_settings_path};
use super::runtime::open_launcher_url_in_browser;
use super::settings::{load_or_create_settings_at_path, resolve_download_dir};
use super::trace::log_launcher_trace;
use super::types::{
    DownloadLauncherModRequest, DownloadLauncherModResult, LauncherDownloadQueueItem,
    LauncherDownloadQueueState,
};
use crate::AppHandle;
use crate::domain::app_ui::load_app_ui_state;
use crate::domain::nexusmods::downloads::{
    ResolveDownloadUrlError, download_file_response, fetch_mod_files_payload, resolve_download_url,
    select_download_candidate,
};
use crate::domain::nexusmods::http::launcher_http_client;
use crate::infrastructure::fs::pathing::normalize_path;
use reqwest::blocking::Response;
use reqwest::header::CONTENT_DISPOSITION;
use std::fs;
use std::io::Write;
use std::path::Path;

const NEXUS_STARDEW_VALLEY_GAME_ID: i64 = 1303;

fn nexus_manual_download_url(file_id: i64, game_id: i64) -> String {
    format!(
        "https://www.nexusmods.com/Core/Libs/Common/Widgets/DownloadPopUp?id={file_id}&game_id={game_id}"
    )
}

fn open_nexus_manual_download_page(mod_id: i64, file_id: i64, game_id: i64) -> Result<(), String> {
    let url = nexus_manual_download_url(file_id, game_id);
    open_launcher_url_in_browser(&url)?;
    log_launcher_trace(
        "download.manual-page-opened",
        &[
            ("modId", mod_id.to_string()),
            ("fileId", file_id.to_string()),
            ("gameId", game_id.to_string()),
            ("url", url),
        ],
    );
    Ok(())
}

fn download_result_title(request: &DownloadLauncherModRequest) -> String {
    request
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("Nexus Mod {}", request.mod_id))
}

fn manual_download_page_opened_result(
    request: &DownloadLauncherModRequest,
    file_name: String,
    version: Option<String>,
) -> DownloadLauncherModResult {
    DownloadLauncherModResult {
        mod_id: request.mod_id,
        title: download_result_title(request),
        version,
        file_name,
        archive_path: String::new(),
        installed: false,
        installed_target_path: None,
        manual_download_page_opened: true,
    }
}

fn log_download_result_complete(result: &DownloadLauncherModResult) {
    log_launcher_trace(
        "download.complete",
        &[
            ("modId", result.mod_id.to_string()),
            ("archivePath", result.archive_path.clone()),
            ("installed", result.installed.to_string()),
            (
                "installedTargetPath",
                result.installed_target_path.clone().unwrap_or_default(),
            ),
            (
                "manualDownloadPageOpened",
                result.manual_download_page_opened.to_string(),
            ),
        ],
    );
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
                    file_id: item.file_id,
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
        let parsed: LauncherDownloadQueueState =
            serde_json::from_str(&content).map_err(|error| {
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

pub fn load_launcher_download_queue(_app: AppHandle) -> Result<LauncherDownloadQueueState, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_download_queue",
        (|| {
            let queue_path = launcher_download_queue_path()?;
            load_or_create_download_queue_at_path(&queue_path)
        })(),
    )
}

pub fn save_launcher_download_queue(
    _app: AppHandle,
    request: LauncherDownloadQueueState,
) -> Result<LauncherDownloadQueueState, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_launcher_download_queue",
        (|| {
            let queue_path = launcher_download_queue_path()?;
            let normalized = normalize_download_queue_state(request);
            save_download_queue_at_path(&queue_path, &normalized)?;
            Ok(normalized)
        })(),
    )
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

pub fn download_launcher_mod(
    _app: AppHandle,
    request: DownloadLauncherModRequest,
) -> Result<DownloadLauncherModResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "download_launcher_mod",
        (|| {
            if request.mod_id < 1 {
                return Err("modId must be greater than 0.".to_string());
            }
            log_launcher_trace(
                "download.start",
                &[
                    ("modId", request.mod_id.to_string()),
                    (
                        "requestedFileId",
                        request
                            .file_id
                            .map(|value| value.to_string())
                            .unwrap_or_default(),
                    ),
                    (
                        "requestedVersion",
                        request.version.clone().unwrap_or_default(),
                    ),
                ],
            );

            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            if settings
                .nexus_api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                return Err("Nexus API key is required to download mods.".to_string());
            }
            let download_dir = resolve_download_dir(&settings)?;
            fs::create_dir_all(&download_dir).map_err(|error| {
                format!(
                    "Failed to create launcher download directory {}: {error}",
                    normalize_path(&download_dir)
                )
            })?;

            let client = launcher_http_client()?;
            let files_payload = fetch_mod_files_payload(&client, &settings, request.mod_id)?;
            let candidate = select_download_candidate(
                &files_payload,
                request.file_id,
                request.version.as_deref(),
            )?;
            log_launcher_trace(
                "download.selected-file",
                &[
                    ("modId", request.mod_id.to_string()),
                    ("fileId", candidate.file_id.to_string()),
                    ("fileName", candidate.file_name.clone()),
                    ("version", candidate.version.clone().unwrap_or_default()),
                ],
            );

            if load_app_ui_state()
                .map(|state| state.launcher.force_non_premium)
                .unwrap_or(false)
            {
                open_nexus_manual_download_page(
                    request.mod_id,
                    candidate.file_id,
                    NEXUS_STARDEW_VALLEY_GAME_ID,
                )?;
                let result = manual_download_page_opened_result(
                    &request,
                    candidate.file_name,
                    candidate.version,
                );
                log_download_result_complete(&result);
                return Ok(result);
            }

            let download_url =
                match resolve_download_url(&client, &settings, request.mod_id, candidate.file_id) {
                    Ok(download_url) => download_url,
                    Err(ResolveDownloadUrlError::PremiumRequired) => {
                        open_nexus_manual_download_page(
                            request.mod_id,
                            candidate.file_id,
                            NEXUS_STARDEW_VALLEY_GAME_ID,
                        )?;
                        let result = manual_download_page_opened_result(
                            &request,
                            candidate.file_name,
                            candidate.version,
                        );
                        log_download_result_complete(&result);
                        return Ok(result);
                    }
                    Err(ResolveDownloadUrlError::Message(message)) => return Err(message),
                };
            let response = download_file_response(&client, &download_url)?;
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
            let mut response_reader = response;
            let bytes_written = std::io::copy(&mut response_reader, &mut archive_file)
                .map_err(|error| format!("Failed to stream launcher download bytes: {error}"))?;
            archive_file.flush().map_err(|error| {
                format!(
                    "Failed to flush launcher archive {}: {error}",
                    normalize_path(&archive_path)
                )
            })?;
            log_launcher_trace(
                "download.saved",
                &[
                    ("modId", request.mod_id.to_string()),
                    ("archivePath", normalize_path(&archive_path)),
                    ("bytes", bytes_written.to_string()),
                ],
            );

            let mut installed = false;
            let mut installed_target_path = None;
            if settings.auto_install_downloads {
                let install_result = install_archive_at_path(
                    &archive_path,
                    settings.mods_path.as_deref(),
                    Some(launcher_backup_dir()?.as_path()),
                )?;
                installed = true;
                installed_target_path = Some(install_result.target_path.clone());
                log_launcher_trace(
                    "download.auto-install.complete",
                    &[
                        ("modId", request.mod_id.to_string()),
                        ("targetPath", install_result.target_path.clone()),
                    ],
                );
                if !settings.keep_downloaded_archives {
                    let _ = fs::remove_file(&archive_path);
                }
            }

            let result = DownloadLauncherModResult {
                mod_id: request.mod_id,
                title: download_result_title(&request),
                version: candidate.version,
                file_name: archive_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
                    .to_string(),
                archive_path: normalize_path(&archive_path),
                installed,
                installed_target_path,
                manual_download_page_opened: false,
            };
            log_download_result_complete(&result);
            Ok(result)
        })(),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        DownloadLauncherModRequest, NEXUS_STARDEW_VALLEY_GAME_ID, download_result_title,
        manual_download_page_opened_result, nexus_manual_download_url,
    };

    #[test]
    fn nexus_manual_download_url_targets_file_popup_with_explicit_game_id() {
        assert_eq!(
            nexus_manual_download_url(167813, NEXUS_STARDEW_VALLEY_GAME_ID),
            "https://www.nexusmods.com/Core/Libs/Common/Widgets/DownloadPopUp?id=167813&game_id=1303"
        );
    }

    #[test]
    fn download_result_title_uses_trimmed_request_title_or_mod_fallback() {
        let titled = DownloadLauncherModRequest {
            mod_id: 1915,
            file_id: Some(160463),
            version: None,
            title: Some("  Content Patcher  ".to_string()),
        };
        assert_eq!(download_result_title(&titled), "Content Patcher");

        let fallback = DownloadLauncherModRequest {
            mod_id: 1915,
            file_id: None,
            version: None,
            title: Some("   ".to_string()),
        };
        assert_eq!(download_result_title(&fallback), "Nexus Mod 1915");
    }

    #[test]
    fn manual_download_page_opened_result_marks_browser_fallback_without_local_archive() {
        let request = DownloadLauncherModRequest {
            mod_id: 1915,
            file_id: Some(160463),
            version: Some("2.9.1".to_string()),
            title: Some("Content Patcher".to_string()),
        };

        let result = manual_download_page_opened_result(
            &request,
            "ContentPatcher.zip".to_string(),
            Some("2.9.1".to_string()),
        );

        assert_eq!(result.mod_id, 1915);
        assert_eq!(result.title, "Content Patcher");
        assert_eq!(result.version.as_deref(), Some("2.9.1"));
        assert_eq!(result.file_name, "ContentPatcher.zip");
        assert!(result.archive_path.is_empty());
        assert!(!result.installed);
        assert_eq!(result.installed_target_path, None);
        assert!(result.manual_download_page_opened);
    }
}
