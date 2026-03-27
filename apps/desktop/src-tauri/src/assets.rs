use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};

use crate::mime::{infer_audio_mime, infer_image_mime};
use crate::models::{
    AudioAssetSummary, EventAssetSummary, GameDirectoryInfo, LocalTextFileContent, MapAssetContent, MapAssetSummary, TextAssetContent,
};
use crate::pathing::{
    audio_source_roots, clean_input_path, collect_known_game_paths, event_source_path, map_source_paths, normalize_path,
};

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

pub fn read_directory_info(root: &Path) -> Result<GameDirectoryInfo, String> {
    if !root.exists() {
        return Err(format!("Directory does not exist: {}", normalize_path(root)));
    }

    let executable_path = root.join("Stardew Valley.exe");
    if !executable_path.exists() {
        return Err(format!(
            "Stardew Valley.exe was not found in {}",
            normalize_path(root)
        ));
    }

    let (unpacked_maps_path, xnb_maps_path) = map_source_paths(root);
    let has_unpacked_maps = unpacked_maps_path.exists();
    let has_xnb_maps = xnb_maps_path.exists();

    if !has_unpacked_maps && !has_xnb_maps {
        return Err(format!(
            "Neither Content (unpacked)\\Maps nor Content\\Maps exists in {}",
            normalize_path(root)
        ));
    }

    let (preferred_maps_path, preferred_format) = if has_unpacked_maps {
        (Some(unpacked_maps_path.clone()), "tmx")
    } else {
        (Some(xnb_maps_path.clone()), "xnb")
    };

    let map_count = match preferred_maps_path.as_ref() {
        Some(path) => count_map_files(path, preferred_format)?,
        None => 0,
    };

    Ok(GameDirectoryInfo {
        root_path: normalize_path(root),
        executable_path: normalize_path(&executable_path),
        unpacked_maps_path: has_unpacked_maps.then(|| normalize_path(&unpacked_maps_path)),
        xnb_maps_path: has_xnb_maps.then(|| normalize_path(&xnb_maps_path)),
        preferred_maps_path: preferred_maps_path.map(|path| normalize_path(&path)),
        preferred_format: preferred_format.to_string(),
        has_unpacked_maps,
        has_xnb_maps,
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

fn collect_audio_assets(base_root: &Path, root: &Path, results: &mut Vec<AudioAssetSummary>) -> Result<(), String> {
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

#[tauri::command]
pub fn detect_default_game_directory() -> Option<String> {
    collect_known_game_paths()
        .into_iter()
        .find(|path| path.exists())
        .map(|path| normalize_path(&path))
}

#[tauri::command]
pub fn validate_game_directory(path: String) -> Result<GameDirectoryInfo, String> {
    read_directory_info(&clean_input_path(&path))
}

#[tauri::command]
pub fn scan_maps(path: String) -> Result<Vec<MapAssetSummary>, String> {
    let root = clean_input_path(&path);
    let info = read_directory_info(&root)?;
    let maps_path = info
        .preferred_maps_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "No map source path is available for the selected game directory.".to_string())?;

    let entries = fs::read_dir(&maps_path)
        .map_err(|error| format!("Failed to read {}: {error}", normalize_path(&maps_path)))?;

    let mut maps = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect map entry: {error}"))?;
        let absolute_path = entry.path();
        if !absolute_path.is_file() {
            continue;
        }

        let is_target_format = absolute_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(&info.preferred_format));

        if !is_target_format {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|error| format!("Failed to read file metadata: {error}"))?;
        let relative_path = absolute_path
            .strip_prefix(&root)
            .map_err(|error| format!("Failed to derive relative path: {error}"))?;
        let name = absolute_path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unnamed")
            .to_string();
        let file_name = absolute_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();

        maps.push(MapAssetSummary {
            id: normalize_path(relative_path).replace('\\', "/"),
            name,
            file_name,
            format: info.preferred_format.clone(),
            absolute_path: normalize_path(&absolute_path),
            relative_path: normalize_path(relative_path),
            size_bytes: metadata.len(),
        });
    }

    maps.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(maps)
}

#[tauri::command]
pub fn scan_events(path: String) -> Result<Vec<EventAssetSummary>, String> {
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

        let is_json = absolute_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"));
        if !is_json {
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

#[tauri::command]
pub fn load_map_asset(root_path: String, map_path: String) -> Result<MapAssetContent, String> {
    let root = clean_input_path(&root_path);
    let absolute_path = clean_input_path(&map_path);

    if !absolute_path.exists() {
        return Err(format!("Map file does not exist: {}", normalize_path(&absolute_path)));
    }

    let relative_path = absolute_path
        .strip_prefix(&root)
        .map_err(|error| format!("Map path is outside the selected game directory: {error}"))?;

    let format = absolute_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let content = match format.as_str() {
        "tmx" => fs::read_to_string(&absolute_path)
            .map_err(|error| format!("Failed to read TMX map {}: {error}", normalize_path(&absolute_path)))?,
        "xnb" => {
            return Err("XNB loading is not implemented yet. Use Content (unpacked) TMX maps for now.".to_string())
        }
        _ => {
            return Err(format!(
                "Unsupported map format for {}",
                normalize_path(&absolute_path)
            ))
        }
    };

    let name = absolute_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Unnamed")
        .to_string();

    Ok(MapAssetContent {
        name,
        format,
        absolute_path: normalize_path(&absolute_path),
        relative_path: normalize_path(relative_path),
        content,
    })
}

#[tauri::command]
pub fn load_text_asset(root_path: String, asset_path: String) -> Result<TextAssetContent, String> {
    let root = clean_input_path(&root_path);
    let absolute_path = root.join(clean_input_path(&asset_path));

    if !absolute_path.exists() {
        return Err(format!("Text asset does not exist: {}", normalize_path(&absolute_path)));
    }

    let relative_path = absolute_path
        .strip_prefix(&root)
        .map_err(|error| format!("Text asset path is outside the selected game directory: {error}"))?;

    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read text asset {}: {error}", normalize_path(&absolute_path)))?;

    Ok(TextAssetContent {
        absolute_path: normalize_path(&absolute_path),
        relative_path: normalize_path(relative_path),
        content,
    })
}

#[tauri::command]
pub fn load_text_file(path: String) -> Result<LocalTextFileContent, String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        return Err(format!("Text file does not exist: {}", normalize_path(&absolute_path)));
    }

    let content = fs::read_to_string(&absolute_path)
        .map_err(|error| format!("Failed to read text file {}: {error}", normalize_path(&absolute_path)))?;

    Ok(LocalTextFileContent {
        absolute_path: normalize_path(&absolute_path),
        content,
    })
}

#[tauri::command]
pub fn load_image_data_url(path: String) -> Result<String, String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        return Err(format!("Image file does not exist: {}", normalize_path(&absolute_path)));
    }

    let bytes = fs::read(&absolute_path)
        .map_err(|error| format!("Failed to read image file {}: {error}", normalize_path(&absolute_path)))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_image_mime(&absolute_path);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
pub fn scan_audio_assets(path: String) -> Result<Vec<AudioAssetSummary>, String> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let mut assets = Vec::new();
    for candidate in audio_source_roots(&root) {
        collect_audio_assets(&root, &candidate, &mut assets)?;
    }

    assets.sort_by(|left, right| left.cue.cmp(&right.cue).then_with(|| left.kind.cmp(&right.kind)));
    Ok(assets)
}

#[tauri::command]
pub fn load_audio_data_url(path: String) -> Result<String, String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        return Err(format!("Audio file does not exist: {}", normalize_path(&absolute_path)));
    }

    let bytes = fs::read(&absolute_path)
        .map_err(|error| format!("Failed to read audio file {}: {error}", normalize_path(&absolute_path)))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_audio_mime(&absolute_path);
    Ok(format!("data:{mime};base64,{encoded}"))
}
