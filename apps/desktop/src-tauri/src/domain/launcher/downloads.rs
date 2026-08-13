use super::archive::install_archive_at_path;
use super::fs::{sanitize_file_name, unique_path};
use super::paths::{launcher_backup_dir, launcher_download_queue_path, launcher_settings_path};
use super::runtime::open_launcher_url_in_browser;
use super::settings::{load_or_create_settings_at_path, resolve_download_dir};
use super::trace::log_launcher_trace;
use super::types::{
    DownloadLauncherModRequest, DownloadLauncherModResult, LauncherDownloadProgressPayload,
    LauncherDownloadQueueItem, LauncherDownloadQueueState,
};
use crate::AppHandle;
use crate::domain::app_ui::load_app_ui_state;
use crate::domain::nexusmods::downloads::{
    ResolveDownloadUrlError, download_file_response, fetch_mod_files_payload, resolve_download_url,
    select_download_candidate,
};
use crate::domain::nexusmods::http::launcher_http_client;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::http::resumable_download::{
    PartialRetention, ResumableDownloadRequest, ResumeRequest, download_resumable,
};
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::blocking::Response;
use reqwest::header::CONTENT_DISPOSITION;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};

pub(crate) const NEXUS_STARDEW_VALLEY_GAME_ID: i64 = 1303;
const LAUNCHER_DOWNLOAD_PROGRESS_EVENT: &str = "launcher://download-progress";
static LAUNCHER_DOWNLOAD_QUEUE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_launcher_download_queue_file() -> MutexGuard<'static, ()> {
    match LAUNCHER_DOWNLOAD_QUEUE_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            LogEvent::new("launcher.lock.poisoned")
                .field("resource", "download-queue-file")
                .emit_error(targets::LAUNCHER_DOWNLOADS);
            poisoned.into_inner()
        }
    }
}

fn cancelled_launcher_downloads() -> &'static Mutex<HashSet<String>> {
    static STATE: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn cancel_launcher_download(download_id: String) -> anyhow::Result<()> {
    let normalized = download_id.trim();
    if normalized.is_empty() {
        return Ok(());
    }

    cancelled_launcher_downloads()
        .lock()
        .map_err(|_| anyhow::anyhow!("Launcher download cancellation mutex was poisoned."))?
        .insert(normalized.to_string());
    Ok(())
}

pub(crate) fn take_cancelled_launcher_download(download_id: &str) -> anyhow::Result<bool> {
    Ok(cancelled_launcher_downloads()
        .lock()
        .map_err(|_| anyhow::anyhow!("Launcher download cancellation mutex was poisoned."))?
        .remove(download_id))
}

pub(crate) fn is_launcher_download_cancelled(download_id: &str) -> anyhow::Result<bool> {
    Ok(cancelled_launcher_downloads()
        .lock()
        .map_err(|_| anyhow::anyhow!("Launcher download cancellation mutex was poisoned."))?
        .contains(download_id))
}

pub(crate) fn ensure_launcher_download_not_cancelled(
    download_id: Option<&str>,
) -> anyhow::Result<()> {
    if let Some(download_id) = download_id {
        if is_launcher_download_cancelled(download_id)? {
            let _ = take_cancelled_launcher_download(download_id)?;
            bail!("Launcher download was cancelled.");
        }
    }

    Ok(())
}

fn emit_download_progress(
    app: &AppHandle,
    download_id: &str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    bytes_per_second: Option<u64>,
) -> anyhow::Result<()> {
    app.emit(
        LAUNCHER_DOWNLOAD_PROGRESS_EVENT,
        LauncherDownloadProgressPayload {
            download_id: download_id.to_string(),
            downloaded_bytes,
            total_bytes,
            bytes_per_second,
        },
    )
    .map_err(anyhow::Error::msg)
}

pub(crate) fn nexus_manual_download_url(file_id: i64, game_id: i64) -> String {
    format!(
        "https://www.nexusmods.com/Core/Libs/Common/Widgets/DownloadPopUp?id={file_id}&game_id={game_id}"
    )
}

fn open_nexus_manual_download_page(mod_id: i64, file_id: i64, game_id: i64) -> anyhow::Result<()> {
    let url = nexus_manual_download_url(file_id, game_id);
    open_launcher_url_in_browser(&url)?;
    log_launcher_trace("download.manualPageOpened", |event| {
        event
            .field("modId", mod_id)
            .field("fileId", file_id)
            .field("gameId", game_id)
            .field("url", &url)
    });
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
    log_launcher_trace("download.complete", |event| {
        event
            .field("modId", result.mod_id)
            .field("archivePath", &result.archive_path)
            .flag("installed", result.installed)
            .optional(
                "installedTargetPath",
                result.installed_target_path.as_deref(),
            )
            .flag(
                "manualDownloadPageOpened",
                result.manual_download_page_opened,
            )
    });
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
                let was_stale_in_flight = normalized_status == "queued"
                    && matches!(
                        item.status.trim(),
                        "downloading" | "resolving" | "installing" | "extracting" | "verifying"
                    );

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
                    total_bytes: item.total_bytes,
                    downloaded_bytes: if was_stale_in_flight {
                        None
                    } else {
                        item.downloaded_bytes
                    },
                    bytes_per_second: if was_stale_in_flight {
                        None
                    } else {
                        item.bytes_per_second
                    },
                })
            })
            .collect(),
    }
}

pub(crate) fn load_or_create_download_queue_at_path(
    queue_path: &Path,
) -> anyhow::Result<LauncherDownloadQueueState> {
    let _queue_file_guard = lock_launcher_download_queue_file();
    load_or_create_download_queue_at_path_unlocked(queue_path)
}

fn load_or_create_download_queue_at_path_unlocked(
    queue_path: &Path,
) -> anyhow::Result<LauncherDownloadQueueState> {
    if queue_path.is_file() {
        let content = read_text_file(queue_path).with_context(|| {
            format!(
                "Failed to read launcher download queue {}",
                normalize_path(queue_path)
            )
        })?;
        let parsed: LauncherDownloadQueueState =
            serde_json::from_str(&content).with_context(|| {
                format!(
                    "Launcher download queue {} is invalid JSON",
                    normalize_path(queue_path)
                )
            })?;
        return Ok(normalize_download_queue_state(parsed));
    }

    let defaults = LauncherDownloadQueueState { items: Vec::new() };
    save_download_queue_at_path_unlocked(queue_path, &defaults)?;
    Ok(defaults)
}

pub(crate) fn save_download_queue_at_path(
    queue_path: &Path,
    state: &LauncherDownloadQueueState,
) -> anyhow::Result<()> {
    let _queue_file_guard = lock_launcher_download_queue_file();
    save_download_queue_at_path_unlocked(queue_path, state)
}

fn save_download_queue_at_path_unlocked(
    queue_path: &Path,
    state: &LauncherDownloadQueueState,
) -> anyhow::Result<()> {
    if let Some(parent) = queue_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create launcher download queue directory {}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_download_queue_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize launcher download queue JSON"))?;
    fs::write(queue_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher download queue {}",
            normalize_path(queue_path)
        )
    })?;
    Ok(())
}

pub fn load_launcher_download_queue(_app: AppHandle) -> anyhow::Result<LauncherDownloadQueueState> {
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
) -> anyhow::Result<LauncherDownloadQueueState> {
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
    app: AppHandle,
    request: DownloadLauncherModRequest,
) -> anyhow::Result<DownloadLauncherModResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "download_launcher_mod",
        (|| {
            if request.mod_id < 1 {
                bail!("modId must be greater than 0.");
            }
            let download_id = request
                .download_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            ensure_launcher_download_not_cancelled(download_id)?;
            log_launcher_trace("download.start", |event| {
                event
                    .field("modId", request.mod_id)
                    .optional("requestedFileId", request.file_id)
                    .optional("requestedVersion", request.version.as_deref())
            });

            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            if settings
                .nexus_api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                bail!("Nexus API key is required to download mods.");
            }
            let download_dir = resolve_download_dir(&settings)?;
            fs::create_dir_all(&download_dir).with_context(|| {
                format!(
                    "Failed to create launcher download directory {}",
                    normalize_path(&download_dir)
                )
            })?;

            let client = launcher_http_client()?;
            let files_payload = fetch_mod_files_payload(&client, &settings, request.mod_id)?;
            ensure_launcher_download_not_cancelled(download_id)?;
            let candidate = select_download_candidate(
                &files_payload,
                request.file_id,
                request.version.as_deref(),
            )?;
            ensure_launcher_download_not_cancelled(download_id)?;
            log_launcher_trace("download.selectedFile", |event| {
                event
                    .field("modId", request.mod_id)
                    .field("fileId", candidate.file_id)
                    .field("fileName", &candidate.file_name)
                    .optional("version", candidate.version.as_deref())
            });

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
                    Err(ResolveDownloadUrlError::Message(message)) => {
                        return Err(anyhow::anyhow!(message));
                    }
                };
            ensure_launcher_download_not_cancelled(download_id)?;
            let response = download_file_response(&client, &download_url, None, None)?;
            ensure_launcher_download_not_cancelled(download_id)?;
            if !response.status().is_success() {
                bail!(
                    "Failed to download launcher mod {}: HTTP {}",
                    request.mod_id,
                    response.status()
                );
            }

            let file_name = download_file_name(&response, &candidate.file_name);
            let archive_path = unique_path(&download_dir.join(&file_name));
            ensure_launcher_download_not_cancelled(download_id)?;
            let download = download_resumable(
                &ResumableDownloadRequest {
                    destination: archive_path.clone(),
                    expected_size: None,
                    expected_sha256: None,
                    version_identity: format!("nexus:{}:{}", request.mod_id, candidate.file_id),
                    current_file: file_name,
                    file_index: 1,
                    file_count: 1,
                    partial_retention: PartialRetention::DeleteOnFailure,
                },
                Some(response),
                |resume: ResumeRequest| {
                    download_file_response(
                        &client,
                        &download_url,
                        Some(resume.start),
                        resume.if_range.as_deref(),
                    )
                },
                || {
                    let Some(download_id) = download_id else {
                        return Ok(false);
                    };
                    let cancelled = is_launcher_download_cancelled(download_id)?;
                    if cancelled {
                        let _ = take_cancelled_launcher_download(download_id)?;
                    }
                    Ok(cancelled)
                },
                |progress| {
                    if let Some(download_id) = download_id {
                        emit_download_progress(
                            &app,
                            download_id,
                            progress.downloaded_bytes,
                            progress.total_bytes,
                            progress.bytes_per_second,
                        )?;
                    }
                    Ok(())
                },
            )?;
            let bytes_written = download.size;
            log_launcher_trace("download.saved", |event| {
                event
                    .field("modId", request.mod_id)
                    .path("archivePath", &archive_path)
                    .field("bytes", bytes_written)
            });

            let mut installed = false;
            let mut installed_target_path = None;
            if settings.auto_install_downloads {
                if let Err(error) = ensure_launcher_download_not_cancelled(download_id) {
                    let _ = fs::remove_file(&archive_path);
                    return Err(error);
                }
                let install_result = install_archive_at_path(
                    &archive_path,
                    settings.mods_path.as_deref(),
                    Some(launcher_backup_dir()?.as_path()),
                )?;
                installed = true;
                installed_target_path = Some(install_result.target_path.clone());
                log_launcher_trace("download.autoInstall.complete", |event| {
                    event
                        .field("modId", request.mod_id)
                        .field("targetPath", &install_result.target_path)
                });
                if !settings.keep_downloaded_archives {
                    let _ = fs::remove_file(&archive_path);
                }
            }
            if let Some(download_id) = download_id {
                let _ = take_cancelled_launcher_download(download_id)?;
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
            download_id: None,
            mod_id: 1915,
            file_id: Some(160463),
            version: None,
            title: Some("  Content Patcher  ".to_string()),
        };
        assert_eq!(download_result_title(&titled), "Content Patcher");

        let fallback = DownloadLauncherModRequest {
            download_id: None,
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
            download_id: None,
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
