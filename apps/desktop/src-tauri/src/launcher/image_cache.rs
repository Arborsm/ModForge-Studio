use super::http::launcher_http_client;
use super::paths::launcher_image_cache_dir;
use super::types::{ResolveLauncherImageRequest, ResolveLauncherImageResult};
use crate::pathing::normalize_path;
use reqwest::header::CONTENT_TYPE;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

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

pub(crate) fn resolve_launcher_image_blocking(
    app: &tauri::AppHandle,
    request: &ResolveLauncherImageRequest,
) -> Result<ResolveLauncherImageResult, String> {
    let request = request;
    let app = app;
    (|| {
        let url = request.url.trim();
        if url.is_empty() {
            return Err("url is required.".to_string());
        }

        let local_source = Path::new(url);
        if local_source.is_file() {
            return Ok(ResolveLauncherImageResult {
                source_url: normalize_path(local_source),
                mime_type: mime_type_from_path(local_source),
                local_path: normalize_path(local_source),
            });
        }

        let cache_dir = launcher_image_cache_dir(&app)?;
        fs::create_dir_all(&cache_dir).map_err(|error| {
            format!(
                "Failed to create launcher image cache directory {}: {error}",
                normalize_path(&cache_dir)
            )
        })?;

        let cache_key = hash_string(url);
        if !request.refresh.unwrap_or(false) {
            if let Some(existing_path) = find_cached_image_path(&cache_dir, &cache_key)? {
                return Ok(ResolveLauncherImageResult {
                    source_url: url.to_string(),
                    mime_type: mime_type_from_path(&existing_path),
                    local_path: normalize_path(&existing_path),
                });
            }
        }

        let client = launcher_http_client()?;
        let response = client
            .get(url)
            .send()
            .map_err(|error| format!("Failed to fetch launcher image: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch launcher image {}: HTTP {}",
                url,
                response.status()
            ));
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
            .map_err(|error| format!("Failed to read launcher image bytes: {error}"))?;

        clear_cached_files_for_key(&cache_dir, &cache_key)?;
        fs::write(&target_path, &bytes).map_err(|error| {
            format!(
                "Failed to write launcher image cache {}: {error}",
                normalize_path(&target_path)
            )
        })?;

        Ok(ResolveLauncherImageResult {
            source_url: url.to_string(),
            mime_type: content_type,
            local_path: normalize_path(&target_path),
        })
    })()
}

#[tauri::command]
pub async fn resolve_launcher_image(
    app: tauri::AppHandle,
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

#[tauri::command]
pub fn clear_launcher_image_cache(app: tauri::AppHandle) -> Result<(), String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "clear_launcher_image_cache",
        (|| {
            let cache_dir = launcher_image_cache_dir(&app)?;
            clear_launcher_image_cache_dir(&cache_dir)
        })(),
    )
}
