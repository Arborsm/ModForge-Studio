mod mime;
pub mod types;

pub use types::{
    AudioAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo, LocalTextFileContent,
    MapAssetContent, MapAssetSummary, TextAssetContent,
};

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};

use self::mime::{infer_audio_mime, infer_image_mime};
use crate::infrastructure::fs::pathing::{
    audio_source_roots, clean_input_path, collect_known_game_paths, event_source_path,
    map_source_path, normalize_path,
};
use crate::infrastructure::game_formats::tbin::parse_tbin_map;
use crate::infrastructure::game_formats::xnb::{self, read_xnb_from_path};

const FILE_CACHE_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
struct CachedStringAsset {
    version: u32,
    source_path: String,
    source_size_bytes: u64,
    source_modified_time_ms: u128,
    locale: String,
    payload: String,
}

#[derive(Debug, Default)]
struct LocalizedAssetVariants {
    base: Option<PathBuf>,
    localized: Option<PathBuf>,
}

fn is_locale_suffix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 5
        && bytes[2] == b'-'
        && bytes[0].is_ascii_alphabetic()
        && bytes[1].is_ascii_alphabetic()
        && bytes[3].is_ascii_alphabetic()
        && bytes[4].is_ascii_alphabetic()
}

pub(crate) fn split_localized_stem(stem: &str) -> (&str, Option<&str>) {
    match stem.rsplit_once('.') {
        Some((base, suffix)) if is_locale_suffix(suffix) => (base, Some(suffix)),
        _ => (stem, None),
    }
}

fn normalize_requested_locale(locale: Option<&str>) -> &str {
    locale.unwrap_or("en-US")
}

pub(crate) fn localized_variant_path(path: &Path, locale: &str) -> Option<PathBuf> {
    if locale.eq_ignore_ascii_case("en-US") {
        return None;
    }

    let extension = path.extension()?.to_str()?;
    let stem = path.file_stem()?.to_str()?;
    let (base_stem, _) = split_localized_stem(stem);
    Some(path.with_file_name(format!("{base_stem}.{locale}.{extension}")))
}

pub(crate) fn logicalized_asset_path(path: &Path) -> PathBuf {
    let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
        return path.to_path_buf();
    };
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return path.to_path_buf();
    };
    let (base_stem, _) = split_localized_stem(stem);
    path.with_file_name(format!("{base_stem}.{extension}"))
}

pub(crate) fn preferred_existing_xnb_path(path: &Path, locale: Option<&str>) -> PathBuf {
    let requested_locale = normalize_requested_locale(locale);
    if let Some(candidate) = localized_variant_path(path, requested_locale) {
        if candidate.exists() {
            return candidate;
        }
    }

    let logical_path = logicalized_asset_path(path);
    if logical_path.exists() {
        return logical_path;
    }

    path.to_path_buf()
}

fn is_map_xnb(path: &Path) -> bool {
    read_xnb_from_path(path)
        .ok()
        .and_then(|xnb| xnb.content.as_bytes().map(|_| ()))
        .is_some()
}

fn build_map_summary(
    logical_relative_path: &Path,
    absolute_path: &Path,
) -> Result<MapAssetSummary, String> {
    let metadata = absolute_path
        .metadata()
        .map_err(|error| format!("Failed to read file metadata: {error}"))?;
    let logical_file_path = logicalized_asset_path(logical_relative_path);
    let name = logical_file_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Unnamed")
        .to_string();
    let file_name = logical_file_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    Ok(MapAssetSummary {
        id: normalize_path(&logical_file_path).replace('\\', "/"),
        name,
        file_name,
        format: "xnb".to_string(),
        absolute_path: normalize_path(absolute_path),
        relative_path: normalize_path(&logical_file_path),
        size_bytes: metadata.len(),
    })
}

fn count_map_files(maps_path: &Path, extension: &str) -> Result<usize, String> {
    let entries = fs::read_dir(maps_path)
        .map_err(|error| format!("Failed to read {}: {error}", normalize_path(maps_path)))?;

    let mut count = 0;
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect map entry: {error}"))?;
        let path = entry.path();
        if path.is_file()
            && path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case(extension))
        {
            count += 1;
        }
    }

    Ok(count)
}

fn cache_root_dir() -> PathBuf {
    if let Ok(value) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(value).join("ModForge Studio").join("cache");
    }

    if let Ok(value) = std::env::var("XDG_CACHE_HOME") {
        return PathBuf::from(value).join("modforge-studio");
    }

    if let Ok(value) = std::env::var("HOME") {
        return PathBuf::from(value).join(".cache").join("modforge-studio");
    }

    std::env::temp_dir().join("modforge-studio-cache")
}

fn active_file_cache_dir() -> PathBuf {
    cache_root_dir().join(format!("assets-v{FILE_CACHE_VERSION}"))
}

fn cache_locale_key(locale: Option<&str>) -> String {
    normalize_requested_locale(locale).trim().to_string()
}

fn file_modified_time_ms(metadata: &fs::Metadata) -> Result<u128, String> {
    let modified = metadata
        .modified()
        .map_err(|error| format!("Failed to read file modified time: {error}"))?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("Invalid file modified time: {error}"))?;
    Ok(duration.as_millis())
}

pub(crate) fn encode_hex(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("write hex to string");
    }
    encoded
}

pub(crate) fn cache_file_path(kind: &str, source_path: &Path, locale: Option<&str>) -> PathBuf {
    let normalized_source_path = normalize_path(source_path);
    let locale_key = cache_locale_key(locale);
    let mut digest = Sha256::new();
    digest.update(kind.as_bytes());
    digest.update(b"\0");
    digest.update(normalized_source_path.as_bytes());
    digest.update(b"\0");
    digest.update(locale_key.as_bytes());
    let hash = encode_hex(&digest.finalize());
    cache_root_dir()
        .join(format!("assets-v{FILE_CACHE_VERSION}"))
        .join(kind)
        .join(format!("{hash}.json"))
}

fn read_cached_string_asset(
    kind: &str,
    source_path: &Path,
    locale: Option<&str>,
) -> Result<Option<String>, String> {
    let metadata = source_path
        .metadata()
        .map_err(|error| format!("Failed to read file metadata: {error}"))?;
    let cache_path = cache_file_path(kind, source_path, locale);
    if !cache_path.exists() {
        return Ok(None);
    }

    let bytes = match fs::read(&cache_path) {
        Ok(bytes) => bytes,
        Err(error) => {
            log::warn!(
                "Failed to read cache file {}: {}",
                normalize_path(&cache_path),
                error
            );
            return Ok(None);
        }
    };

    let cached = match serde_json::from_slice::<CachedStringAsset>(&bytes) {
        Ok(cached) => cached,
        Err(error) => {
            log::warn!(
                "Failed to deserialize cache file {}: {}",
                normalize_path(&cache_path),
                error
            );
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

fn write_cached_string_asset(
    kind: &str,
    source_path: &Path,
    locale: Option<&str>,
    payload: &str,
) -> Result<(), String> {
    let metadata = source_path
        .metadata()
        .map_err(|error| format!("Failed to read file metadata: {error}"))?;
    let cache_path = cache_file_path(kind, source_path, locale);
    let cache_dir = cache_path
        .parent()
        .ok_or_else(|| format!("Invalid cache path: {}", normalize_path(&cache_path)))?;
    fs::create_dir_all(cache_dir).map_err(|error| {
        format!(
            "Failed to create cache directory {}: {error}",
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
    let bytes = serde_json::to_vec(&cached)
        .map_err(|error| format!("Failed to serialize cache entry: {error}"))?;
    let temp_path = cache_path.with_extension("tmp");
    fs::write(&temp_path, bytes).map_err(|error| {
        format!(
            "Failed to write cache file {}: {error}",
            normalize_path(&temp_path)
        )
    })?;
    fs::rename(&temp_path, &cache_path)
        .or_else(|rename_error| {
            let _ = fs::remove_file(&cache_path);
            fs::rename(&temp_path, &cache_path).map_err(|_| rename_error)
        })
        .map_err(|error| {
            format!(
                "Failed to move cache file into place {}: {error}",
                normalize_path(&cache_path)
            )
        })?;
    Ok(())
}

fn collect_directory_size(path: &Path) -> Result<(usize, u64), String> {
    if !path.exists() {
        return Ok((0, 0));
    }

    let mut entry_count = 0usize;
    let mut total_size_bytes = 0u64;
    let mut pending = vec![path.to_path_buf()];

    while let Some(current) = pending.pop() {
        let entries = fs::read_dir(&current).map_err(|error| {
            format!(
                "Failed to read cache directory {}: {error}",
                normalize_path(&current)
            )
        })?;

        for entry in entries {
            let entry = entry.map_err(|error| format!("Failed to inspect cache entry: {error}"))?;
            let entry_path = entry.path();
            let metadata = entry.metadata().map_err(|error| {
                format!(
                    "Failed to read cache metadata {}: {error}",
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

fn unpacked_text_asset_path(root: &Path, relative_path: &Path) -> Option<PathBuf> {
    let mut components = relative_path.components();
    let first = components.next()?.as_os_str().to_str()?;
    if !first.eq_ignore_ascii_case("Content") {
        return None;
    }

    let mut unpacked_path = root.join("Content (unpacked)");
    for component in components {
        unpacked_path.push(component.as_os_str());
    }
    unpacked_path.set_extension("json");
    Some(unpacked_path)
}

fn read_unpacked_text_asset(root: &Path, relative_path: &Path) -> Result<Option<String>, String> {
    let Some(unpacked_path) = unpacked_text_asset_path(root, relative_path) else {
        return Ok(None);
    };

    if !unpacked_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&unpacked_path).map_err(|error| {
        format!(
            "Failed to read unpacked text asset {}: {error}",
            normalize_path(&unpacked_path)
        )
    })?;

    Ok(Some(content))
}

pub fn read_directory_info(root: &Path) -> Result<GameDirectoryInfo, String> {
    if !root.exists() {
        return Err(format!(
            "Directory does not exist: {}",
            normalize_path(root)
        ));
    }

    let executable_path = root.join("Stardew Valley.exe");
    if !executable_path.exists() {
        return Err(format!(
            "Stardew Valley.exe was not found in {}",
            normalize_path(root)
        ));
    }

    let maps_path = map_source_path(root);
    if !maps_path.exists() {
        return Err(format!(
            "Content\\Maps does not exist in {}",
            normalize_path(root)
        ));
    }

    let map_count = count_map_files(&maps_path, "xnb")?;

    Ok(GameDirectoryInfo {
        root_path: normalize_path(root),
        executable_path: normalize_path(&executable_path),
        maps_path: Some(normalize_path(&maps_path)),
        map_count,
    })
}

fn is_audio_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "wav" | "ogg" | "oga" | "mp3" | "flac" | "aif" | "aiff"
            )
        })
}

fn infer_audio_kind(path: &Path) -> &'static str {
    for segment in path.components() {
        let value = segment.as_os_str().to_string_lossy().to_ascii_lowercase();
        if value.contains("music") || value.contains("soundtrack") {
            return "music";
        }
        if value.contains("sound") || value.contains("sfx") || value.contains("effect") {
            return "sound";
        }
    }

    "sound"
}

fn encode_texture_png(texture: &xnb::TextureData) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let encoder = PngEncoder::new(&mut buffer);
    encoder
        .write_image(
            &texture.rgba,
            texture.width,
            texture.height,
            ColorType::Rgba8.into(),
        )
        .map_err(|error| format!("Failed to encode texture: {error}"))?;
    Ok(buffer)
}

fn collect_audio_assets(
    base_root: &Path,
    root: &Path,
    results: &mut Vec<AudioAssetSummary>,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(root)
        .map_err(|error| format!("Failed to read {}: {error}", normalize_path(root)))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect audio entry: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_audio_assets(base_root, &path, results)?;
            continue;
        }

        if !path.is_file() || !is_audio_extension(&path) {
            continue;
        }

        let cue = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        if cue.is_empty() {
            continue;
        }

        let relative_path = path
            .strip_prefix(base_root)
            .map(|relative| normalize_path(relative))
            .unwrap_or_else(|_| normalize_path(&path));
        let kind = infer_audio_kind(&path).to_string();

        results.push(AudioAssetSummary {
            cue,
            kind,
            absolute_path: normalize_path(&path),
            relative_path,
        });
    }

    Ok(())
}

pub(crate) fn detect_default_game_directory() -> Option<String> {
    collect_known_game_paths()
        .into_iter()
        .find(|path| read_directory_info(path).is_ok())
        .map(|path| normalize_path(&path))
}

pub(crate) fn list_known_game_directories() -> Vec<String> {
    collect_known_game_paths()
        .into_iter()
        .filter(|path| read_directory_info(path).is_ok())
        .map(|path| normalize_path(&path))
        .collect()
}

pub(crate) fn get_file_cache_stats() -> Result<FileCacheStats, String> {
    let root = active_file_cache_dir();
    let (entry_count, total_size_bytes) = collect_directory_size(&root)?;
    Ok(FileCacheStats {
        root_path: normalize_path(&root),
        entry_count,
        total_size_bytes,
    })
}

pub(crate) fn clear_file_cache() -> Result<(), String> {
    let root = active_file_cache_dir();
    if !root.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&root).map_err(|error| {
        format!(
            "Failed to clear file cache {}: {error}",
            normalize_path(&root)
        )
    })?;
    Ok(())
}

pub(crate) fn validate_game_directory(path: String) -> Result<GameDirectoryInfo, String> {
    read_directory_info(&clean_input_path(&path))
}

pub(crate) fn scan_maps(
    path: String,
    locale: Option<String>,
) -> Result<Vec<MapAssetSummary>, String> {
    let root = clean_input_path(&path);
    let info = read_directory_info(&root)?;
    let requested_locale = normalize_requested_locale(locale.as_deref());
    let maps_path = info.maps_path.as_ref().map(PathBuf::from).ok_or_else(|| {
        "No map source path is available for the selected game directory.".to_string()
    })?;

    let entries = fs::read_dir(&maps_path)
        .map_err(|error| format!("Failed to read {}: {error}", normalize_path(&maps_path)))?;

    let mut grouped_variants: BTreeMap<String, LocalizedAssetVariants> = BTreeMap::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect map entry: {error}"))?;
        let absolute_path = entry.path();
        if !absolute_path.is_file() {
            continue;
        }

        let is_target_format = absolute_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("xnb"));

        if !is_target_format {
            continue;
        }

        let relative_path = absolute_path
            .strip_prefix(&root)
            .map_err(|error| format!("Failed to derive relative path: {error}"))?;
        let logical_relative_path = logicalized_asset_path(relative_path);
        let logical_key = normalize_path(&logical_relative_path);
        let stem = absolute_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        let (_, suffix) = split_localized_stem(stem);
        let variants = grouped_variants.entry(logical_key).or_default();

        match suffix {
            Some(asset_locale) if asset_locale.eq_ignore_ascii_case(requested_locale) => {
                variants.localized = Some(absolute_path);
            }
            Some(_) => {}
            None => {
                variants.base = Some(absolute_path);
            }
        }
    }

    let mut maps = Vec::new();
    for (logical_relative_path, variants) in grouped_variants {
        let Some(selected_path) = variants.localized.as_ref().or(variants.base.as_ref()) else {
            continue;
        };

        if !is_map_xnb(selected_path) {
            continue;
        }

        maps.push(build_map_summary(
            Path::new(&logical_relative_path),
            selected_path,
        )?);
    }

    maps.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(maps)
}

pub(crate) fn scan_events(path: String) -> Result<Vec<EventAssetSummary>, String> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let events_path = event_source_path(&root);
    if !events_path.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&events_path)
        .map_err(|error| format!("Failed to read {}: {error}", normalize_path(&events_path)))?;

    let mut events = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect event entry: {error}"))?;
        let absolute_path = entry.path();
        if !absolute_path.is_file() {
            continue;
        }

        let is_xnb = absolute_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("xnb"));
        if !is_xnb {
            continue;
        }

        let stem = absolute_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();

        if stem
            .rsplit_once('.')
            .is_some_and(|(_, suffix)| suffix.len() == 5 && suffix.chars().nth(2) == Some('-'))
        {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to read file metadata: {error}"))?;
        let relative_path = absolute_path
            .strip_prefix(&root)
            .map_err(|error| format!("Failed to derive relative path: {error}"))?;
        let name = stem.to_string();
        let file_name = absolute_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();

        events.push(EventAssetSummary {
            id: normalize_path(relative_path).replace('\\', "/"),
            name,
            file_name,
            absolute_path: normalize_path(&absolute_path),
            relative_path: normalize_path(relative_path),
            size_bytes: metadata.len(),
        });
    }

    events.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(events)
}

pub(crate) fn load_map_asset(
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> Result<MapAssetContent, String> {
    let root = clean_input_path(&root_path);
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&clean_input_path(&map_path), requested_locale);

    if !absolute_path.exists() {
        return Err(format!(
            "Map file does not exist: {}",
            normalize_path(&absolute_path)
        ));
    }

    let relative_path = absolute_path
        .strip_prefix(&root)
        .map_err(|error| format!("Map path is outside the selected game directory: {error}"))?;
    let logical_relative_path = logicalized_asset_path(relative_path);

    let format = absolute_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let content = match format.as_str() {
        "xnb" => {
            if let Some(content) =
                read_cached_string_asset("map", &absolute_path, requested_locale)?
            {
                content
            } else {
                let xnb = read_xnb_from_path(&absolute_path)?;
                let bytes = xnb
                    .content
                    .as_bytes()
                    .ok_or_else(|| "Map XNB did not contain TBin data.".to_string())?;
                let map = parse_tbin_map(
                    bytes,
                    &absolute_path,
                    &normalize_path(&logical_relative_path),
                )?;
                let content = serde_json::to_string(&map)
                    .map_err(|error| format!("Failed to serialize map: {error}"))?;
                if let Err(error) =
                    write_cached_string_asset("map", &absolute_path, requested_locale, &content)
                {
                    log::warn!(
                        "Failed to cache parsed map {}: {}",
                        normalize_path(&absolute_path),
                        error
                    );
                }
                content
            }
        }
        "tmx" => {
            return Err("TMX loading is no longer supported. Load XNB maps instead.".to_string());
        }
        _ => {
            return Err(format!(
                "Unsupported map format for {}",
                normalize_path(&absolute_path)
            ));
        }
    };

    let name = absolute_path
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| split_localized_stem(value).0)
        .unwrap_or("Unnamed")
        .to_string();

    Ok(MapAssetContent {
        name,
        format,
        absolute_path: normalize_path(&absolute_path),
        relative_path: normalize_path(&logical_relative_path),
        content,
    })
}

pub(crate) fn load_text_asset(
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> Result<TextAssetContent, String> {
    let root = clean_input_path(&root_path);
    let requested_path = root.join(clean_input_path(&asset_path));
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&requested_path, requested_locale);

    if !absolute_path.exists() {
        return Err(format!(
            "Text asset does not exist: {}",
            normalize_path(&absolute_path)
        ));
    }

    let relative_path = absolute_path.strip_prefix(&root).map_err(|error| {
        format!("Text asset path is outside the selected game directory: {error}")
    })?;
    let logical_relative_path = logicalized_asset_path(relative_path);

    let content = match absolute_path.extension().and_then(|value| value.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("xnb") => {
            if let Some(content) =
                read_cached_string_asset("text", &absolute_path, requested_locale)?
            {
                content
            } else {
                let (content, cacheable_source_path) = match read_xnb_from_path(&absolute_path) {
                    Ok(xnb) => {
                        let json = xnb.content.to_json();
                        (
                            serde_json::to_string(&json).map_err(|error| {
                                format!("Failed to serialize XNB data: {error}")
                            })?,
                            Some(absolute_path.as_path()),
                        )
                    }
                    Err(xnb_error) => {
                        if let Some(content) =
                            read_unpacked_text_asset(&root, &logical_relative_path)?
                        {
                            log::warn!(
                                "Falling back to unpacked JSON for {} after XNB parse failure: {}",
                                normalize_path(&absolute_path),
                                xnb_error
                            );
                            (content, None)
                        } else {
                            let fallback_hint =
                                unpacked_text_asset_path(&root, &logical_relative_path)
                                    .map(|path| {
                                        format!(
                                            " Checked unpacked fallback at {}.",
                                            normalize_path(&path)
                                        )
                                    })
                                    .unwrap_or_default();
                            return Err(format!(
                                "Failed to parse XNB text asset {}: {}.{}",
                                normalize_path(&absolute_path),
                                xnb_error,
                                fallback_hint
                            ));
                        }
                    }
                };
                if let Some(cacheable_source_path) = cacheable_source_path {
                    if let Err(error) = write_cached_string_asset(
                        "text",
                        cacheable_source_path,
                        requested_locale,
                        &content,
                    ) {
                        log::warn!(
                            "Failed to cache text asset {}: {}",
                            normalize_path(&absolute_path),
                            error
                        );
                    }
                }
                content
            }
        }
        _ => {
            if let Some(content) =
                read_cached_string_asset("text-file", &absolute_path, requested_locale)?
            {
                content
            } else {
                let content = fs::read_to_string(&absolute_path).map_err(|error| {
                    format!(
                        "Failed to read text asset {}: {error}",
                        normalize_path(&absolute_path)
                    )
                })?;
                if let Err(error) = write_cached_string_asset(
                    "text-file",
                    &absolute_path,
                    requested_locale,
                    &content,
                ) {
                    log::warn!(
                        "Failed to cache text file {}: {}",
                        normalize_path(&absolute_path),
                        error
                    );
                }
                content
            }
        }
    };

    Ok(TextAssetContent {
        absolute_path: normalize_path(&absolute_path),
        relative_path: normalize_path(&logical_relative_path),
        content,
    })
}

pub(crate) fn load_text_file(path: String) -> Result<LocalTextFileContent, String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        return Err(format!(
            "Text file does not exist: {}",
            normalize_path(&absolute_path)
        ));
    }

    let content = fs::read_to_string(&absolute_path).map_err(|error| {
        format!(
            "Failed to read text file {}: {error}",
            normalize_path(&absolute_path)
        )
    })?;

    Ok(LocalTextFileContent {
        absolute_path: normalize_path(&absolute_path),
        content,
    })
}

pub(crate) fn load_image_data_url(path: String, locale: Option<String>) -> Result<String, String> {
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&clean_input_path(&path), requested_locale);

    if !absolute_path.exists() {
        return Err(format!(
            "Image file does not exist: {}",
            normalize_path(&absolute_path)
        ));
    }

    if let Some(content) = read_cached_string_asset("image", &absolute_path, requested_locale)? {
        return Ok(content);
    }

    let ext = absolute_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if ext.eq_ignore_ascii_case("xnb") {
        let xnb = read_xnb_from_path(&absolute_path)?;
        let texture = xnb
            .content
            .as_texture()
            .ok_or_else(|| "XNB file did not contain a Texture2D asset.".to_string())?;
        let png_bytes = encode_texture_png(texture)?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(png_bytes);
        let payload = format!("data:image/png;base64,{encoded}");
        if let Err(error) =
            write_cached_string_asset("image", &absolute_path, requested_locale, &payload)
        {
            log::warn!(
                "Failed to cache image asset {}: {}",
                normalize_path(&absolute_path),
                error
            );
        }
        return Ok(payload);
    }

    let bytes = fs::read(&absolute_path).map_err(|error| {
        format!(
            "Failed to read image file {}: {error}",
            normalize_path(&absolute_path)
        )
    })?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_image_mime(&absolute_path);
    let payload = format!("data:{mime};base64,{encoded}");
    if let Err(error) =
        write_cached_string_asset("image", &absolute_path, requested_locale, &payload)
    {
        log::warn!(
            "Failed to cache image asset {}: {}",
            normalize_path(&absolute_path),
            error
        );
    }
    Ok(payload)
}

pub(crate) fn scan_audio_assets(path: String) -> Result<Vec<AudioAssetSummary>, String> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let mut assets = Vec::new();
    for candidate in audio_source_roots(&root) {
        collect_audio_assets(&root, &candidate, &mut assets)?;
    }

    assets.sort_by(|left, right| {
        left.cue
            .cmp(&right.cue)
            .then_with(|| left.kind.cmp(&right.kind))
    });
    Ok(assets)
}

pub(crate) fn load_audio_data_url(path: String) -> Result<String, String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        return Err(format!(
            "Audio file does not exist: {}",
            normalize_path(&absolute_path)
        ));
    }

    let bytes = fs::read(&absolute_path).map_err(|error| {
        format!(
            "Failed to read audio file {}: {error}",
            normalize_path(&absolute_path)
        )
    })?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_audio_mime(&absolute_path);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[cfg(test)]
#[path = "../../tests/assets_tests.rs"]
mod tests;
