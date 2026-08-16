use crate::domain::app_paths::app_cache_dir;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::game_formats::xnb::read_xnb_from_path;
use crate::support::logging::{LogEvent, targets};
use anyhow::Context;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use super::pathing::normalize_requested_locale;
use super::types::FileCacheStats;

// Bump when any cached asset's parsed representation changes (e.g. tbin now
// decodes `@TileIndex@` tilesheet properties into `tile_properties`), so stale
// parses from older app versions are abandoned in their `assets-v<N>` dir.
const FILE_CACHE_VERSION: u32 = 2;
pub(crate) const MAP_CLASSIFICATION_CACHE_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct CachedStringAsset {
    version: u32,
    source_path: String,
    source_size_bytes: u64,
    source_modified_time_ms: u128,
    locale: String,
    payload: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedMapClassification {
    version: u32,
    source_path: String,
    source_size_bytes: u64,
    source_modified_time_ns: u128,
    is_map: bool,
}

fn parse_map_xnb_classification(path: &Path) -> bool {
    read_xnb_from_path(path)
        .ok()
        .and_then(|xnb| xnb.content.as_bytes().map(|_| ()))
        .is_some()
}

pub(crate) fn map_classification_cache_path(cache_root: &Path, source_path: &Path) -> PathBuf {
    let normalized_source_path = normalize_path(source_path);
    let mut digest = Sha256::new();
    digest.update(b"map-classification\0");
    digest.update(normalized_source_path.as_bytes());
    cache_root.join(format!("{}.json", encode_hex(&digest.finalize())))
}

pub(crate) fn classify_map_xnb_with_cache(
    cache_root: &Path,
    path: &Path,
    classifier: impl FnOnce(&Path) -> bool,
) -> anyhow::Result<bool> {
    let metadata = path
        .metadata()
        .with_context(|| format!("Failed to read file metadata"))?;
    let source_path = normalize_path(path);
    let source_modified_time_ns = metadata
        .modified()
        .with_context(|| format!("Failed to read file modified time"))?
        .duration_since(UNIX_EPOCH)
        .with_context(|| format!("Invalid file modified time"))?
        .as_nanos();
    let cache_path = map_classification_cache_path(cache_root, path);

    if let Ok(bytes) = fs::read(&cache_path)
        && let Ok(cached) = serde_json::from_slice::<CachedMapClassification>(&bytes)
        && cached.version == MAP_CLASSIFICATION_CACHE_VERSION
        && cached.source_path == source_path
        && cached.source_size_bytes == metadata.len()
        && cached.source_modified_time_ns == source_modified_time_ns
    {
        return Ok(cached.is_map);
    }

    let is_map = classifier(path);
    fs::create_dir_all(cache_root)
        .with_context(|| format!("Failed to create {}", normalize_path(cache_root)))?;
    let cached = CachedMapClassification {
        version: MAP_CLASSIFICATION_CACHE_VERSION,
        source_path,
        source_size_bytes: metadata.len(),
        source_modified_time_ns,
        is_map,
    };
    let bytes =
        serde_json::to_vec(&cached).context("Failed to serialize map classification cache")?;
    let temporary_path = cache_path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    fs::write(&temporary_path, bytes)
        .with_context(|| format!("Failed to write {}", normalize_path(&temporary_path)))?;
    if cache_path.exists() {
        fs::remove_file(&cache_path)
            .with_context(|| format!("Failed to replace {}", normalize_path(&cache_path)))?;
    }
    if let Err(error) = fs::rename(&temporary_path, &cache_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error)
            .with_context(|| format!("Failed to save {}", normalize_path(&cache_path)));
    }
    Ok(is_map)
}

pub(super) fn is_map_xnb(path: &Path) -> bool {
    let cache_root = match active_file_cache_dir() {
        Ok(root) => root.join("map-classification"),
        Err(_) => return parse_map_xnb_classification(path),
    };
    classify_map_xnb_with_cache(&cache_root, path, parse_map_xnb_classification)
        .unwrap_or_else(|_| parse_map_xnb_classification(path))
}

fn cache_root_dir() -> anyhow::Result<PathBuf> {
    Ok(app_cache_dir()?)
}

fn active_file_cache_dir() -> anyhow::Result<PathBuf> {
    Ok(cache_root_dir()?.join(format!("assets-v{FILE_CACHE_VERSION}")))
}

fn cache_locale_key(locale: Option<&str>) -> String {
    normalize_requested_locale(locale).trim().to_string()
}

fn file_modified_time_ms(metadata: &fs::Metadata) -> anyhow::Result<u128> {
    let modified = metadata
        .modified()
        .with_context(|| format!("Failed to read file modified time"))?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .with_context(|| format!("Invalid file modified time"))?;
    Ok(duration.as_millis())
}

pub(crate) fn encode_hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("write hex to string");
    }
    encoded
}

pub(crate) fn cache_file_path(
    kind: &str,
    source_path: &Path,
    locale: Option<&str>,
) -> anyhow::Result<PathBuf> {
    let normalized_source_path = normalize_path(source_path);
    let locale_key = cache_locale_key(locale);
    let mut digest = Sha256::new();
    digest.update(kind.as_bytes());
    digest.update(b"\0");
    digest.update(normalized_source_path.as_bytes());
    digest.update(b"\0");
    digest.update(locale_key.as_bytes());
    let hash = encode_hex(&digest.finalize());
    Ok(active_file_cache_dir()?
        .join(kind)
        .join(format!("{hash}.json")))
}

pub(super) fn read_cached_string_asset(
    kind: &str,
    source_path: &Path,
    locale: Option<&str>,
) -> anyhow::Result<Option<String>> {
    let metadata = source_path
        .metadata()
        .with_context(|| format!("Failed to read file metadata"))?;
    let cache_path = cache_file_path(kind, source_path, locale)?;
    if !cache_path.exists() {
        return Ok(None);
    }

    let bytes = match fs::read(&cache_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            LogEvent::new("assets.cache.readFailed")
                .path("cachePath", &cache_path)
                .error(error)
                .emit_warn(targets::ASSETS);
            return Ok(None);
        }
    };

    let cached = match serde_json::from_slice::<CachedStringAsset>(&bytes) {
        Ok(cached) => cached,
        Err(error) => {
            LogEvent::new("assets.cache.deserializeFailed")
                .path("cachePath", &cache_path)
                .error(error)
                .emit_warn(targets::ASSETS);
            return Ok(None);
        }
    };

    let source_size_bytes = metadata.len();
    let source_modified_time_ms = file_modified_time_ms(&metadata)?;
    let locale_key = cache_locale_key(locale);
    let normalized_source_path = normalize_path(source_path);

    if cached.version != FILE_CACHE_VERSION
        || cached.source_path != normalized_source_path
        || cached.source_size_bytes != source_size_bytes
        || cached.source_modified_time_ms != source_modified_time_ms
        || cached.locale != locale_key
    {
        return Ok(None);
    }

    Ok(Some(cached.payload))
}

pub(super) fn write_cached_string_asset(
    kind: &str,
    source_path: &Path,
    locale: Option<&str>,
    payload: &str,
) -> anyhow::Result<()> {
    let metadata = source_path
        .metadata()
        .with_context(|| format!("Failed to read file metadata"))?;
    let cache_path = cache_file_path(kind, source_path, locale)?;
    let cache_dir = cache_path
        .parent()
        .with_context(|| format!("Invalid cache path: {}", normalize_path(&cache_path)))?;
    fs::create_dir_all(cache_dir).with_context(|| {
        format!(
            "Failed to create cache directory {}",
            normalize_path(cache_dir)
        )
    })?;

    let cached = CachedStringAsset {
        version: FILE_CACHE_VERSION,
        source_path: normalize_path(source_path),
        source_size_bytes: metadata.len(),
        source_modified_time_ms: file_modified_time_ms(&metadata)?,
        locale: cache_locale_key(locale),
        payload: payload.to_string(),
    };
    let bytes =
        serde_json::to_vec(&cached).with_context(|| format!("Failed to serialize cache entry"))?;
    let temp_path = cache_path.with_extension("tmp");
    fs::write(&temp_path, bytes)
        .with_context(|| format!("Failed to write cache file {}", normalize_path(&temp_path)))?;
    fs::rename(&temp_path, &cache_path)
        .or_else(|rename_error| {
            let _ = fs::remove_file(&cache_path);
            fs::rename(&temp_path, &cache_path).map_err(|_| rename_error)
        })
        .with_context(|| {
            format!(
                "Failed to move cache file into place {}",
                normalize_path(&cache_path)
            )
        })?;
    Ok(())
}

fn collect_directory_size(path: &Path) -> anyhow::Result<(usize, u64)> {
    if !path.exists() {
        return Ok((0, 0));
    }

    let mut entry_count = 0usize;
    let mut total_size_bytes = 0u64;
    let mut pending = vec![path.to_path_buf()];

    while let Some(current) = pending.pop() {
        let entries = fs::read_dir(&current).with_context(|| {
            format!(
                "Failed to read cache directory {}",
                normalize_path(&current)
            )
        })?;

        for entry in entries {
            let entry = entry.with_context(|| format!("Failed to inspect cache entry"))?;
            let entry_path = entry.path();
            let metadata = entry.metadata().with_context(|| {
                format!(
                    "Failed to read cache metadata {}",
                    normalize_path(&entry_path)
                )
            })?;

            if metadata.is_dir() {
                pending.push(entry_path);
                continue;
            }

            if metadata.is_file() {
                entry_count += 1;
                total_size_bytes = total_size_bytes.saturating_add(metadata.len());
            }
        }
    }

    Ok((entry_count, total_size_bytes))
}

pub(crate) fn get_file_cache_stats() -> anyhow::Result<FileCacheStats> {
    let root = active_file_cache_dir()?;
    let (entry_count, total_size_bytes) = collect_directory_size(&root)?;
    Ok(FileCacheStats {
        root_path: normalize_path(&root),
        entry_count,
        total_size_bytes,
    })
}

pub(crate) fn clear_file_cache() -> anyhow::Result<()> {
    let root = active_file_cache_dir()?;
    if !root.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&root)
        .with_context(|| format!("Failed to clear file cache {}", normalize_path(&root)))?;
    Ok(())
}
