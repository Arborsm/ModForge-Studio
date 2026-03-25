use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GameDirectoryInfo {
    root_path: String,
    executable_path: String,
    unpacked_maps_path: Option<String>,
    xnb_maps_path: Option<String>,
    preferred_maps_path: Option<String>,
    preferred_format: String,
    has_unpacked_maps: bool,
    has_xnb_maps: bool,
    map_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MapAssetSummary {
    id: String,
    name: String,
    file_name: String,
    format: String,
    absolute_path: String,
    relative_path: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MapAssetContent {
    name: String,
    format: String,
    absolute_path: String,
    relative_path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TextAssetContent {
    absolute_path: String,
    relative_path: String,
    content: String,
}

fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn clean_input_path(path: &str) -> PathBuf {
    PathBuf::from(path.trim().trim_matches('"'))
}

fn collect_known_game_paths() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"E:\SteamLibrary\steamapps\common\Stardew Valley"),
        PathBuf::from(r"D:\SteamLibrary\steamapps\common\Stardew Valley"),
        PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Stardew Valley"),
    ];

    if let Ok(program_files) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            Path::new(&program_files)
                .join("Steam")
                .join("steamapps")
                .join("common")
                .join("Stardew Valley"),
        );
    }

    candidates
}

fn map_source_paths(root: &Path) -> (PathBuf, PathBuf) {
    (
        root.join("Content (unpacked)").join("Maps"),
        root.join("Content").join("Maps"),
    )
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

fn read_directory_info(root: &Path) -> Result<GameDirectoryInfo, String> {
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

#[tauri::command]
fn detect_default_game_directory() -> Option<String> {
    collect_known_game_paths()
        .into_iter()
        .find(|path| path.exists())
        .map(|path| normalize_path(&path))
}

#[tauri::command]
fn validate_game_directory(path: String) -> Result<GameDirectoryInfo, String> {
    read_directory_info(&clean_input_path(&path))
}

#[tauri::command]
fn scan_maps(path: String) -> Result<Vec<MapAssetSummary>, String> {
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
fn load_map_asset(root_path: String, map_path: String) -> Result<MapAssetContent, String> {
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
fn load_text_asset(root_path: String, asset_path: String) -> Result<TextAssetContent, String> {
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
        .invoke_handler(tauri::generate_handler![
            detect_default_game_directory,
            validate_game_directory,
            scan_maps,
            load_map_asset,
            load_text_asset
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
