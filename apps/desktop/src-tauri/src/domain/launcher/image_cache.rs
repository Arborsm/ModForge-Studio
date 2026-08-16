use super::types::{ResolveLauncherImageRequest, ResolveLauncherImageResult};
use crate::AppHandle;
use crate::domain::app_paths::{launcher_image_cache_dir, launcher_image_failures_path};
use crate::domain::launcher::image_failures::{
    clear_launcher_image_failure_entries_at_path, clear_launcher_image_failure_for_mod_at_path,
    is_launcher_image_blocked, load_or_create_image_failures_at_path,
    record_launcher_image_failure,
};
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::http::{
    LAUNCHER_IMAGE_CDN_RETRY_POLICY, launcher_http_client,
    read_nexus_response_body_with_retry_policy, send_nexus_request_with_policy,
};
use crate::domain::nexusmods::routes::launcher_nexus_route_for_url;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::header::CONTENT_TYPE;
use reqwest::{StatusCode, header::HeaderMap};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::Instant;

static LAUNCHER_IMAGE_CACHE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static LAUNCHER_IMAGE_CACHE_GENERATION: AtomicU64 = AtomicU64::new(0);
const LAUNCHER_IMAGE_DISCONNECT_EVENT: &str = "launcher://image-fetch-disconnected";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LauncherImageFetchDisconnectedPayload {
    source_url: String,
    mod_key: Option<String>,
    error: String,
    elapsed_ms: u128,
}

struct LauncherImageFetchResult {
    status: StatusCode,
    headers: HeaderMap,
    bytes: Vec<u8>,
}

fn lock_launcher_image_cache_files() -> MutexGuard<'static, ()> {
    match LAUNCHER_IMAGE_CACHE_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            LogEvent::new("launcher.lock.poisoned")
                .field("resource", "image-cache-file")
                .emit_error(targets::LAUNCHER);
            poisoned.into_inner()
        }
    }
}

fn hash_string(value: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    let hash = digest.finalize();
    hash.iter().map(|item| format!("{item:02x}")).collect()
}

fn find_cached_image_path(cache_dir: &Path, cache_key: &str) -> anyhow::Result<Option<PathBuf>> {
    let entries = fs::read_dir(cache_dir).with_context(|| {
        format!(
            "Failed to inspect launcher image cache {}",
            normalize_path(cache_dir)
        )
    })?;
    for entry in entries {
        let entry =
            entry.with_context(|| format!("Failed to inspect launcher image cache entry"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if file_name.starts_with(cache_key) {
            return Ok(Some(entry.path()));
        }
    }

    Ok(None)
}

fn clear_cached_files_for_key(cache_dir: &Path, cache_key: &str) -> anyhow::Result<()> {
    let entries = fs::read_dir(cache_dir).with_context(|| {
        format!(
            "Failed to inspect launcher image cache {}",
            normalize_path(cache_dir)
        )
    })?;
    for entry in entries {
        let entry =
            entry.with_context(|| format!("Failed to inspect launcher image cache entry"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if !file_name.starts_with(cache_key) {
            continue;
        }

        fs::remove_file(entry.path()).map_err(|error| {
            anyhow::anyhow!(
                "Failed to clear stale launcher image cache {}: {error}",
                normalize_path(&entry.path())
            )
        })?;
    }

    Ok(())
}

fn extension_from_url(value: &str) -> Option<String> {
    let path = value.split('?').next()?;
    let extension = Path::new(path).extension()?.to_str()?.trim();
    if extension.is_empty() {
        None
    } else {
        Some(extension.to_ascii_lowercase())
    }
}

fn image_extension_from_content_type(value: &str) -> Option<String> {
    match value
        .split(';')
        .next()?
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "image/jpeg" => Some("jpg".to_string()),
        "image/png" => Some("png".to_string()),
        "image/webp" => Some("webp".to_string()),
        "image/gif" => Some("gif".to_string()),
        _ => None,
    }
}

fn mime_type_from_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
    {
        "png" => "image/png".to_string(),
        "webp" => "image/webp".to_string(),
        "gif" => "image/gif".to_string(),
        _ => "image/jpeg".to_string(),
    }
}

fn is_launcher_image_disconnect_error(error: &str) -> bool {
    let normalized = error.trim().to_ascii_lowercase();
    normalized.contains("econnreset")
        || normalized.contains("connection reset")
        || normalized.contains("connection was reset")
        || normalized.contains("disconnected before secure tls connection")
        || normalized.contains("unexpected eof")
}

fn emit_launcher_image_disconnect(
    app: &AppHandle,
    url: &str,
    mod_key: Option<&str>,
    error: &str,
    elapsed_ms: u128,
) {
    if !is_launcher_image_disconnect_error(error) {
        return;
    }

    if let Err(emit_error) = app.emit(
        LAUNCHER_IMAGE_DISCONNECT_EVENT,
        LauncherImageFetchDisconnectedPayload {
            source_url: url.to_string(),
            mod_key: mod_key.map(ToOwned::to_owned),
            error: error.to_string(),
            elapsed_ms,
        },
    ) {
        LogEvent::new("launcher.image.cover.disconnectNotify.failed")
            .error(&emit_error)
            .emit_warn(targets::LAUNCHER);
    }
}

fn fetch_launcher_image_with_retry(
    client: &reqwest::blocking::Client,
    url: &str,
) -> anyhow::Result<LauncherImageFetchResult> {
    read_nexus_response_body_with_retry_policy(LAUNCHER_IMAGE_CDN_RETRY_POLICY, || {
        let response = send_nexus_request_with_policy(LAUNCHER_IMAGE_CDN_RETRY_POLICY, || {
            client.get(url).send()
        })
        .with_context(|| format!("Failed to fetch launcher image"))?;
        let status = response.status();
        let headers = response.headers().clone();
        if !status.is_success() {
            return Ok(LauncherImageFetchResult {
                status,
                headers,
                bytes: Vec::new(),
            });
        }

        let bytes = response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .with_context(|| format!("Failed to read launcher image bytes"))?;
        Ok(LauncherImageFetchResult {
            status,
            headers,
            bytes,
        })
    })
}

pub(crate) fn clear_launcher_image_cache_dir(cache_dir: &Path) -> anyhow::Result<()> {
    let _cache_file_guard = lock_launcher_image_cache_files();
    LAUNCHER_IMAGE_CACHE_GENERATION.fetch_add(1, Ordering::SeqCst);
    if !cache_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(cache_dir).with_context(|| {
        format!(
            "Failed to clear launcher image cache {}",
            normalize_path(cache_dir)
        )
    })
}

pub(crate) fn clear_launcher_image_cache_dir_and_failures_at_path(
    cache_dir: &Path,
    failures_path: &Path,
) -> anyhow::Result<()> {
    clear_launcher_image_cache_dir(cache_dir)?;
    clear_launcher_image_failure_entries_at_path(failures_path)
}

fn cover_mod_key(request: &ResolveLauncherImageRequest) -> Option<String> {
    request
        .mod_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn resolve_launcher_image_blocking(
    app: &AppHandle,
    request: &ResolveLauncherImageRequest,
) -> anyhow::Result<ResolveLauncherImageResult> {
    let request = request;
    (|| {
        let url = request.url.trim();
        if url.is_empty() {
            bail!("url is required.");
        }

        let cache_dir = launcher_image_cache_dir()?;
        let failures_path = launcher_image_failures_path()?;
        let mod_key = cover_mod_key(request);
        if let Some(result) =
            resolve_launcher_image_local_or_cached_at_paths(request, &cache_dir, &failures_path)?
        {
            return Ok(result);
        }

        let cache_key = hash_string(url);
        let cache_generation = LAUNCHER_IMAGE_CACHE_GENERATION.load(Ordering::SeqCst);

        if let Some(mod_key) = mod_key.as_deref()
            && !request.refresh.unwrap_or(false)
        {
            let failures = load_or_create_image_failures_at_path(&failures_path)?;
            if is_launcher_image_blocked(&failures, mod_key) {
                LogEvent::new("launcher.image.cover.blocked")
                    .field("modKey", mod_key)
                    .field("url", url)
                    .emit_warn(targets::LAUNCHER);
                bail!(
                    "Launcher image loading is disabled for mod {mod_key} after repeated failures."
                );
            }
        }

        let client = launcher_http_client()?;
        if let Some(route) = launcher_nexus_route_for_url(url) {
            if let Err(error) = probe_blocked_launcher_nexus_route(&client, None, route) {
                if let Some(mod_key) = mod_key.as_deref() {
                    record_launcher_image_failure(mod_key, &error.to_string())?;
                }
                return Err(error);
            }
        }
        let fetch_started_at = Instant::now();
        let fetch_result = fetch_launcher_image_with_retry(&client, url);
        let fetch_result = match fetch_result {
            Ok(fetch_result) => fetch_result,
            Err(error) => {
                let elapsed_ms = fetch_started_at.elapsed().as_millis();
                LogEvent::new("launcher.image.cover.fetch.failed")
                    .field("phase", "network")
                    .field("urlHash", &cache_key)
                    .optional("modKey", mod_key.as_deref())
                    .field("retries", LAUNCHER_IMAGE_CDN_RETRY_POLICY.max_retries())
                    .field("elapsedMs", elapsed_ms)
                    .error(&error)
                    .emit_warn(targets::LAUNCHER);
                emit_launcher_image_disconnect(
                    app,
                    url,
                    mod_key.as_deref(),
                    &error.to_string(),
                    elapsed_ms,
                );
                if let Some(mod_key) = mod_key.as_deref() {
                    record_launcher_image_failure(mod_key, &error.to_string())?;
                }
                return Err(error);
            }
        };
        let status = fetch_result.status;
        if !status.is_success() {
            let error = format!("Failed to fetch launcher image {}: HTTP {}", url, status);
            LogEvent::new("launcher.image.cover.fetch.failed")
                .field("phase", "status")
                .field("urlHash", &cache_key)
                .optional("modKey", mod_key.as_deref())
                .field("status", status)
                .ms("elapsedMs", fetch_started_at.elapsed())
                .error(&error)
                .emit_warn(targets::LAUNCHER);
            if let Some(mod_key) = mod_key.as_deref() {
                record_launcher_image_failure(mod_key, &error)?;
            }
            return Err(anyhow::anyhow!(error));
        }

        let content_type = fetch_result
            .headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let extension = image_extension_from_content_type(&content_type)
            .or_else(|| extension_from_url(url))
            .unwrap_or_else(|| "jpg".to_string());
        let target_path = cache_dir.join(format!("{cache_key}.{extension}"));
        let bytes = fetch_result.bytes;
        let bytes_len = bytes.len();

        let _cache_file_guard = lock_launcher_image_cache_files();
        if LAUNCHER_IMAGE_CACHE_GENERATION.load(Ordering::SeqCst) != cache_generation {
            bail!("Launcher image cache was cleared while fetching image.");
        }
        fs::create_dir_all(&cache_dir).with_context(|| {
            format!(
                "Failed to create launcher image cache directory {}",
                normalize_path(&cache_dir)
            )
        })?;
        if !request.refresh.unwrap_or(false) {
            if let Some(existing_path) = find_cached_image_path(&cache_dir, &cache_key)? {
                if let Some(mod_key) = mod_key.as_deref() {
                    clear_launcher_image_failure_for_mod_at_path(&failures_path, mod_key)?;
                }
                return Ok(ResolveLauncherImageResult {
                    source_url: url.to_string(),
                    mime_type: mime_type_from_path(&existing_path),
                    local_path: normalize_path(&existing_path),
                });
            }
        }
        clear_cached_files_for_key(&cache_dir, &cache_key)?;
        fs::write(&target_path, &bytes).with_context(|| {
            format!(
                "Failed to write launcher image cache {}",
                normalize_path(&target_path)
            )
        })?;
        if let Some(mod_key) = mod_key.as_deref() {
            clear_launcher_image_failure_for_mod_at_path(&failures_path, mod_key)?;
        }

        // Reached only after `status.is_success()`, so the status adds nothing.
        LogEvent::new("launcher.image.cover.fetch.succeeded")
            .field("urlHash", &cache_key)
            .optional("modKey", mod_key.as_deref())
            .ms("elapsedMs", fetch_started_at.elapsed())
            .field("bytes", bytes_len)
            .field("mimeType", &content_type)
            .emit_debug(targets::LAUNCHER);

        Ok(ResolveLauncherImageResult {
            source_url: url.to_string(),
            mime_type: content_type,
            local_path: normalize_path(&target_path),
        })
    })()
}

pub(crate) fn resolve_launcher_image_local_or_cached_at_paths(
    request: &ResolveLauncherImageRequest,
    cache_dir: &Path,
    failures_path: &Path,
) -> anyhow::Result<Option<ResolveLauncherImageResult>> {
    let url = request.url.trim();
    if url.is_empty() {
        bail!("url is required.");
    }
    let mod_key = cover_mod_key(request);

    let local_source = Path::new(url);
    if local_source.is_file() {
        if let Some(mod_key) = mod_key.as_deref() {
            clear_launcher_image_failure_for_mod_at_path(failures_path, mod_key)?;
        }
        return Ok(Some(ResolveLauncherImageResult {
            source_url: normalize_path(local_source),
            mime_type: mime_type_from_path(local_source),
            local_path: normalize_path(local_source),
        }));
    }

    if request.refresh.unwrap_or(false) {
        return Ok(None);
    }

    let cache_key = hash_string(url);
    let cached = {
        let _cache_file_guard = lock_launcher_image_cache_files();
        if !cache_dir.exists() {
            None
        } else {
            find_cached_image_path(cache_dir, &cache_key)?
        }
    };
    if let Some(existing_path) = cached {
        if let Some(mod_key) = mod_key.as_deref() {
            clear_launcher_image_failure_for_mod_at_path(failures_path, mod_key)?;
        }
        return Ok(Some(ResolveLauncherImageResult {
            source_url: url.to_string(),
            mime_type: mime_type_from_path(&existing_path),
            local_path: normalize_path(&existing_path),
        }));
    }

    Ok(None)
}

pub(crate) fn resolve_cached_launcher_image_blocking(
    _app: &AppHandle,
    request: &ResolveLauncherImageRequest,
) -> anyhow::Result<Option<ResolveLauncherImageResult>> {
    let cache_dir = launcher_image_cache_dir()?;
    let failures_path = launcher_image_failures_path()?;
    resolve_launcher_image_local_or_cached_at_paths(request, &cache_dir, &failures_path)
}

pub fn clear_launcher_image_cache(_app: AppHandle) -> anyhow::Result<()> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "clear_launcher_image_cache",
        (|| {
            let cache_dir = launcher_image_cache_dir()?;
            let failures_path = launcher_image_failures_path()?;
            clear_launcher_image_cache_dir_and_failures_at_path(&cache_dir, &failures_path)
        })(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::launcher::image_failures::{
        get_launcher_image_failure_entry, record_launcher_image_failure_at_path,
    };
    use crate::test_support::{create_temp_dir, write_file};
    use reqwest::header::HeaderValue;
    use std::fs;
    use std::sync::{Arc, Mutex};

    #[test]
    fn clear_launcher_image_cache_removes_cached_files_and_failure_blocks() {
        let root = create_temp_dir("launcher-image-cache-clear");
        let cache_dir = root.join("launcher").join("images");
        let failures_path = root.join("launcher").join("image-failures.json");
        write_file(&cache_dir.join("cover.webp"), "cached");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 1")
            .expect("record first failure");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 2")
            .expect("record second failure");
        let failures = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 3",
        )
        .expect("record blocked failure");
        assert!(
            get_launcher_image_failure_entry(&failures, "ModForge.NPCAdventures")
                .expect("blocked entry")
                .blocked
        );

        clear_launcher_image_cache_dir_and_failures_at_path(&cache_dir, &failures_path)
            .expect("clear launcher image cache and failures");

        assert!(!cache_dir.exists());
        assert!(!failures_path.exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn cached_launcher_image_lookup_returns_none_without_network_or_failure_state_on_miss() {
        let root = create_temp_dir("launcher-image-cache-miss");
        let cache_dir = root.join("launcher").join("images");
        let failures_path = root.join("launcher").join("image-failures.json");

        let result = resolve_launcher_image_local_or_cached_at_paths(
            &ResolveLauncherImageRequest {
                url: "https://example.test/cover.png".to_string(),
                refresh: None,
                mod_key: Some("ModForge.NPCAdventures".to_string()),
            },
            &cache_dir,
            &failures_path,
        )
        .expect("resolve cached launcher image");

        assert!(result.is_none());
        assert!(!failures_path.exists());
        assert!(!cache_dir.exists());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn cached_launcher_image_lookup_allows_local_file_when_mod_is_blocked() {
        let root = create_temp_dir("launcher-image-local-blocked");
        let cache_dir = root.join("launcher").join("images");
        let failures_path = root.join("launcher").join("image-failures.json");
        let local_cover_path = root.join("cover.png");
        write_file(&local_cover_path, "not really an image");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 1")
            .expect("record first failure");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 2")
            .expect("record second failure");
        let blocked = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 3",
        )
        .expect("record blocked failure");
        assert!(
            get_launcher_image_failure_entry(&blocked, "ModForge.NPCAdventures")
                .expect("blocked entry")
                .blocked
        );

        let result = resolve_launcher_image_local_or_cached_at_paths(
            &ResolveLauncherImageRequest {
                url: local_cover_path.to_string_lossy().to_string(),
                refresh: None,
                mod_key: Some("ModForge.NPCAdventures".to_string()),
            },
            &cache_dir,
            &failures_path,
        )
        .expect("resolve cached launcher image")
        .expect("local image result");

        assert_eq!(result.local_path, normalize_path(&local_cover_path));
        let failures =
            load_or_create_image_failures_at_path(&failures_path).expect("load image failures");
        assert!(get_launcher_image_failure_entry(&failures, "ModForge.NPCAdventures").is_none());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn cached_launcher_image_lookup_allows_disk_cache_when_mod_is_blocked() {
        let root = create_temp_dir("launcher-image-disk-cache-blocked");
        let cache_dir = root.join("launcher").join("images");
        let failures_path = root.join("launcher").join("image-failures.json");
        let url = "https://example.test/cover.webp";
        let cached_path = cache_dir.join(format!("{}.webp", hash_string(url)));
        write_file(&cached_path, "not really an image");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 1")
            .expect("record first failure");
        record_launcher_image_failure_at_path(&failures_path, "ModForge.NPCAdventures", "boom 2")
            .expect("record second failure");
        let blocked = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 3",
        )
        .expect("record blocked failure");
        assert!(
            get_launcher_image_failure_entry(&blocked, "ModForge.NPCAdventures")
                .expect("blocked entry")
                .blocked
        );

        let result = resolve_launcher_image_local_or_cached_at_paths(
            &ResolveLauncherImageRequest {
                url: url.to_string(),
                refresh: None,
                mod_key: Some("ModForge.NPCAdventures".to_string()),
            },
            &cache_dir,
            &failures_path,
        )
        .expect("resolve cached launcher image")
        .expect("disk cached image result");

        assert_eq!(result.source_url, url);
        assert_eq!(result.local_path, normalize_path(&cached_path));
        let failures =
            load_or_create_image_failures_at_path(&failures_path).expect("load image failures");
        assert!(get_launcher_image_failure_entry(&failures, "ModForge.NPCAdventures").is_none());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn launcher_image_disconnect_event_emits_only_for_disconnect_errors() {
        let events = Arc::new(Mutex::new(Vec::<(String, serde_json::Value)>::new()));
        let app = AppHandle::sidecar({
            let events = Arc::clone(&events);
            move |event, payload| {
                events
                    .lock()
                    .expect("events lock")
                    .push((event.to_string(), payload));
                Ok(())
            }
        });

        emit_launcher_image_disconnect(
            &app,
            "https://example.test/cover.webp",
            Some("20599"),
            "Failed to fetch launcher image https://example.test/cover.webp: HTTP 404",
            12,
        );
        assert!(events.lock().expect("events lock").is_empty());

        emit_launcher_image_disconnect(
            &app,
            "https://example.test/cover.webp",
            Some("20599"),
            "connection reset by peer",
            42,
        );

        let events = events.lock().expect("events lock");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, LAUNCHER_IMAGE_DISCONNECT_EVENT);
        assert_eq!(
            events[0].1,
            serde_json::json!({
                "sourceUrl": "https://example.test/cover.webp",
                "modKey": "20599",
                "error": "connection reset by peer",
                "elapsedMs": 42
            })
        );
    }

    #[test]
    fn launcher_image_body_retry_keeps_final_fetch_metadata() {
        let mut attempts = 0;
        let result = read_nexus_response_body_with_retry_policy(
            LAUNCHER_IMAGE_CDN_RETRY_POLICY,
            || -> anyhow::Result<LauncherImageFetchResult> {
                attempts += 1;
                if attempts == 1 {
                    bail!("unexpected eof while reading body");
                }

                let mut headers = HeaderMap::new();
                headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/webp"));
                Ok(LauncherImageFetchResult {
                    status: StatusCode::OK,
                    headers,
                    bytes: b"webp-bytes".to_vec(),
                })
            },
        )
        .expect("launcher image body read should retry after EOF");

        assert_eq!(attempts, 2);
        assert_eq!(result.status, StatusCode::OK);
        assert_eq!(result.bytes, b"webp-bytes".to_vec());
        assert_eq!(
            result
                .headers
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("image/webp")
        );
    }
}
