use super::paths::{launcher_image_cache_dir, launcher_image_failures_path};
use super::types::{ResolveLauncherImageRequest, ResolveLauncherImageResult};
use crate::AppHandle;
use crate::domain::launcher::image_failures::{
    clear_launcher_image_failure_entries_at_path, clear_launcher_image_failure_for_mod_at_path,
    is_launcher_image_blocked, load_or_create_image_failures_at_path,
    record_launcher_image_failure,
};
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::http::launcher_http_client;
use crate::domain::nexusmods::routes::launcher_nexus_route_for_url;
use crate::infrastructure::fs::pathing::normalize_path;
use reqwest::header::CONTENT_TYPE;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, OnceLock};

static LAUNCHER_IMAGE_CACHE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static LAUNCHER_IMAGE_CACHE_GENERATION: AtomicU64 = AtomicU64::new(0);

fn lock_launcher_image_cache_files() -> MutexGuard<'static, ()> {
    match LAUNCHER_IMAGE_CACHE_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!(target: "Launcher", "Launcher image cache file lock was poisoned");
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

fn find_cached_image_path(cache_dir: &Path, cache_key: &str) -> Result<Option<PathBuf>, String> {
    let entries = fs::read_dir(cache_dir).map_err(|error| {
        format!(
            "Failed to inspect launcher image cache {}: {error}",
            normalize_path(cache_dir)
        )
    })?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Failed to inspect launcher image cache entry: {error}"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if file_name.starts_with(cache_key) {
            return Ok(Some(entry.path()));
        }
    }

    Ok(None)
}

fn clear_cached_files_for_key(cache_dir: &Path, cache_key: &str) -> Result<(), String> {
    let entries = fs::read_dir(cache_dir).map_err(|error| {
        format!(
            "Failed to inspect launcher image cache {}: {error}",
            normalize_path(cache_dir)
        )
    })?;
    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Failed to inspect launcher image cache entry: {error}"))?;
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if !file_name.starts_with(cache_key) {
            continue;
        }

        fs::remove_file(entry.path()).map_err(|error| {
            format!(
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

pub(crate) fn clear_launcher_image_cache_dir(cache_dir: &Path) -> Result<(), String> {
    let _cache_file_guard = lock_launcher_image_cache_files();
    LAUNCHER_IMAGE_CACHE_GENERATION.fetch_add(1, Ordering::SeqCst);
    if !cache_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(cache_dir).map_err(|error| {
        format!(
            "Failed to clear launcher image cache {}: {error}",
            normalize_path(cache_dir)
        )
    })
}

pub(crate) fn clear_launcher_image_cache_dir_and_failures_at_path(
    cache_dir: &Path,
    failures_path: &Path,
) -> Result<(), String> {
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
    _app: &AppHandle,
    request: &ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    let request = request;
    (|| {
        let url = request.url.trim();
        if url.is_empty() {
            return Err("url is required.".to_string());
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
                log::warn!(
                    target: "Launcher",
                    "launcher.image.cover.blocked mod-key=\"{}\" url=\"{}\"",
                    mod_key,
                    url
                );
                return Err(format!(
                    "Launcher image loading is disabled for mod {mod_key} after repeated failures."
                ));
            }
        }

        let client = launcher_http_client()?;
        if let Some(route) = launcher_nexus_route_for_url(url) {
            if let Err(error) = probe_blocked_launcher_nexus_route(&client, None, route) {
                if let Some(mod_key) = mod_key.as_deref() {
                    record_launcher_image_failure(mod_key, &error)?;
                }
                return Err(error);
            }
        }
        let response = client
            .get(url)
            .send()
            .map_err(|error| format!("Failed to fetch launcher image: {error}"));
        let response = match response {
            Ok(response) => response,
            Err(error) => {
                if let Some(mod_key) = mod_key.as_deref() {
                    record_launcher_image_failure(mod_key, &error)?;
                }
                return Err(error);
            }
        };
        if !response.status().is_success() {
            let error = format!(
                "Failed to fetch launcher image {}: HTTP {}",
                url,
                response.status()
            );
            if let Some(mod_key) = mod_key.as_deref() {
                record_launcher_image_failure(mod_key, &error)?;
            }
            return Err(error);
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("image/jpeg")
            .to_string();
        let extension = image_extension_from_content_type(&content_type)
            .or_else(|| extension_from_url(url))
            .unwrap_or_else(|| "jpg".to_string());
        let target_path = cache_dir.join(format!("{cache_key}.{extension}"));
        let bytes = response
            .bytes()
            .map_err(|error| format!("Failed to read launcher image bytes: {error}"));
        let bytes = match bytes {
            Ok(bytes) => bytes,
            Err(error) => {
                if let Some(mod_key) = mod_key.as_deref() {
                    record_launcher_image_failure(mod_key, &error)?;
                }
                return Err(error);
            }
        };

        let _cache_file_guard = lock_launcher_image_cache_files();
        if LAUNCHER_IMAGE_CACHE_GENERATION.load(Ordering::SeqCst) != cache_generation {
            return Err("Launcher image cache was cleared while fetching image.".to_string());
        }
        fs::create_dir_all(&cache_dir).map_err(|error| {
            format!(
                "Failed to create launcher image cache directory {}: {error}",
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
        fs::write(&target_path, &bytes).map_err(|error| {
            format!(
                "Failed to write launcher image cache {}: {error}",
                normalize_path(&target_path)
            )
        })?;
        if let Some(mod_key) = mod_key.as_deref() {
            clear_launcher_image_failure_for_mod_at_path(&failures_path, mod_key)?;
        }

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
) -> Result<Option<ResolveLauncherImageResult>, String> {
    let url = request.url.trim();
    if url.is_empty() {
        return Err("url is required.".to_string());
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
) -> Result<Option<ResolveLauncherImageResult>, String> {
    let cache_dir = launcher_image_cache_dir()?;
    let failures_path = launcher_image_failures_path()?;
    resolve_launcher_image_local_or_cached_at_paths(request, &cache_dir, &failures_path)
}

pub async fn resolve_launcher_image(
    app: AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "resolve_launcher_image",
        tauri::async_runtime::spawn_blocking(move || {
            resolve_launcher_image_blocking(&app, &request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher image task: {error}"))?,
    )
}

pub async fn resolve_cached_launcher_image(
    app: AppHandle,
    request: ResolveLauncherImageRequest,
) -> Result<Option<ResolveLauncherImageResult>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "resolve_cached_launcher_image",
        tauri::async_runtime::spawn_blocking(move || {
            resolve_cached_launcher_image_blocking(&app, &request)
        })
        .await
        .map_err(|error| format!("Failed to join cached launcher image task: {error}"))?,
    )
}

pub fn clear_launcher_image_cache(_app: AppHandle) -> Result<(), String> {
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
    use std::fs;

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
}
