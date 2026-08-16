use crate::infrastructure::fs::pathing::{
    audio_source_roots, clean_input_path, collect_known_game_paths, event_source_path,
    map_source_path, normalize_path, normalize_separators, stardew_game_validation_candidates,
};
use anyhow::{Context, bail};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use super::cache::is_map_xnb;
use super::pathing::{
    cp_asset_key, logicalized_asset_path, normalize_requested_locale, split_localized_stem,
};
use super::types::{
    AudioAssetSummary, DataAssetSummary, EventAssetSummary, GameDirectoryInfo, ImageAssetSummary,
    MapAssetSummary,
};

#[derive(Debug, Default)]
struct LocalizedAssetVariants {
    base: Option<PathBuf>,
    localized: Option<PathBuf>,
}

pub fn read_directory_info(root: &Path) -> anyhow::Result<GameDirectoryInfo> {
    if !root.exists() {
        bail!("Directory does not exist: {}", normalize_path(root));
    }

    let Some(executable_path) = stardew_game_validation_candidates(root)
        .into_iter()
        .find(|path| path.exists())
    else {
        bail!(
            "No Stardew Valley executable or game assembly was found in {}",
            normalize_path(root),
        );
    };

    let maps_path = map_source_path(root);
    if !maps_path.exists() {
        bail!("Content\\Maps does not exist in {}", normalize_path(root));
    }

    let map_count = count_map_files(&maps_path, "xnb")?;

    Ok(GameDirectoryInfo {
        root_path: normalize_path(root),
        executable_path: normalize_path(&executable_path),
        maps_path: Some(normalize_path(&maps_path)),
        map_count,
    })
}

fn count_map_files(maps_path: &Path, extension: &str) -> anyhow::Result<usize> {
    let entries = fs::read_dir(maps_path)
        .with_context(|| format!("Failed to read {}", normalize_path(maps_path)))?;

    let mut count = 0;
    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect map entry"))?;
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

fn build_map_summary(
    logical_relative_path: &Path,
    absolute_path: &Path,
) -> anyhow::Result<MapAssetSummary> {
    let metadata = absolute_path
        .metadata()
        .with_context(|| format!("Failed to read file metadata"))?;
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
        id: normalize_separators(&normalize_path(&logical_file_path)),
        name,
        file_name,
        format: "xnb".to_string(),
        absolute_path: normalize_path(absolute_path),
        relative_path: normalize_path(&logical_file_path),
        size_bytes: metadata.len(),
    })
}

pub(crate) fn validate_game_directory(path: String) -> anyhow::Result<GameDirectoryInfo> {
    read_directory_info(&clean_input_path(&path))
}

pub(crate) fn scan_maps(
    path: String,
    locale: Option<String>,
) -> anyhow::Result<Vec<MapAssetSummary>> {
    let root = clean_input_path(&path);
    let info = read_directory_info(&root)?;
    let requested_locale = normalize_requested_locale(locale.as_deref());
    let maps_path = info
        .maps_path
        .as_ref()
        .map(PathBuf::from)
        .context("No map source path is available for the selected game directory.")?;

    let entries = fs::read_dir(&maps_path)
        .with_context(|| format!("Failed to read {}", normalize_path(&maps_path)))?;

    let mut grouped_variants: BTreeMap<String, LocalizedAssetVariants> = BTreeMap::new();
    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect map entry"))?;
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
            .with_context(|| format!("Failed to derive relative path"))?;
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

pub(crate) fn scan_events(path: String) -> anyhow::Result<Vec<EventAssetSummary>> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let events_path = event_source_path(&root);
    if !events_path.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&events_path)
        .with_context(|| format!("Failed to read {}", normalize_path(&events_path)))?;

    let mut events = Vec::new();
    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect event entry"))?;
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
            .with_context(|| format!("Failed to read file metadata"))?;
        let relative_path = absolute_path
            .strip_prefix(&root)
            .with_context(|| format!("Failed to derive relative path"))?;
        let name = stem.to_string();
        let file_name = absolute_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();

        events.push(EventAssetSummary {
            id: normalize_separators(&normalize_path(relative_path)),
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

fn collect_audio_assets(
    base_root: &Path,
    root: &Path,
    results: &mut Vec<AudioAssetSummary>,
) -> anyhow::Result<()> {
    if !root.exists() {
        return Ok(());
    }

    let entries =
        fs::read_dir(root).with_context(|| format!("Failed to read {}", normalize_path(root)))?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect audio entry"))?;
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

pub(crate) fn scan_audio_assets(path: String) -> anyhow::Result<Vec<AudioAssetSummary>> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let mut assets = Vec::new();
    for candidate in audio_source_roots(&root) {
        collect_audio_assets(&root, &candidate, &mut assets)?;
    }

    let xact_root = root.join("Content").join("XACT");
    if xact_root.is_dir() {
        for cue in crate::infrastructure::game_formats::xact::scan_xact_cues(&path)? {
            let xsb_absolute = normalize_path(&xact_root.join("Sound Bank.xsb"));
            assets.push(AudioAssetSummary {
                cue,
                kind: "sound".to_string(),
                absolute_path: xsb_absolute.clone(),
                relative_path: "Content/XACT/Sound Bank.xsb".to_string(),
            });
        }
    }

    assets.sort_by(|left, right| {
        left.cue
            .cmp(&right.cue)
            .then_with(|| left.kind.cmp(&right.kind))
    });
    Ok(assets)
}

fn is_xnb_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("xnb"))
}

fn is_data_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            value.eq_ignore_ascii_case("xnb") || value.eq_ignore_ascii_case("json")
        })
}

fn collect_image_assets(
    base_root: &Path,
    root: &Path,
    results: &mut Vec<ImageAssetSummary>,
) -> anyhow::Result<()> {
    if !root.exists() {
        return Ok(());
    }

    let entries =
        fs::read_dir(root).with_context(|| format!("Failed to read {}", normalize_path(root)))?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect image asset entry"))?;
        let path = entry.path();
        if path.is_dir() {
            let relative = path.strip_prefix(base_root).unwrap_or(&path);
            let normalized = normalize_separators(&normalize_path(relative));
            if normalized.eq_ignore_ascii_case("Content/Maps")
                || normalized.eq_ignore_ascii_case("Content/Data")
            {
                continue;
            }
            collect_image_assets(base_root, &path, results)?;
            continue;
        }

        if !path.is_file() || !is_xnb_file(&path) {
            continue;
        }

        let relative_path = normalize_separators(
            &path
                .strip_prefix(base_root)
                .map(normalize_path)
                .unwrap_or_else(|_| normalize_path(&path)),
        );
        if relative_path.starts_with("Content/Maps/") || relative_path.starts_with("Content/Data/")
        {
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        // Localized variants are resolved by the loaders from the base asset,
        // so the picker lists each logical asset exactly once.
        if split_localized_stem(stem).1.is_some() {
            continue;
        }

        let name = cp_asset_key(&relative_path);
        if name.is_empty() {
            continue;
        }

        let metadata = path
            .metadata()
            .with_context(|| format!("Failed to read file metadata"))?;
        results.push(ImageAssetSummary {
            name,
            absolute_path: normalize_path(&path),
            relative_path,
            size_bytes: metadata.len(),
        });
    }

    Ok(())
}

fn collect_data_assets(
    base_root: &Path,
    root: &Path,
    results: &mut Vec<DataAssetSummary>,
) -> anyhow::Result<()> {
    if !root.exists() {
        return Ok(());
    }

    let entries =
        fs::read_dir(root).with_context(|| format!("Failed to read {}", normalize_path(root)))?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect data asset entry"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_data_assets(base_root, &path, results)?;
            continue;
        }

        if !path.is_file() || !is_data_file(&path) {
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if split_localized_stem(stem).1.is_some() {
            continue;
        }

        let relative_path = normalize_separators(
            &path
                .strip_prefix(base_root)
                .map(normalize_path)
                .unwrap_or_else(|_| normalize_path(&path)),
        );
        let name = cp_asset_key(&relative_path);
        if name.is_empty() {
            continue;
        }

        let metadata = path
            .metadata()
            .with_context(|| format!("Failed to read file metadata"))?;
        results.push(DataAssetSummary {
            name,
            absolute_path: normalize_path(&path),
            relative_path,
            size_bytes: metadata.len(),
        });
    }

    Ok(())
}

/// Scans the game Content tree for XNB textures, excluding map and data assets.
pub(crate) fn scan_image_assets(path: String) -> anyhow::Result<Vec<ImageAssetSummary>> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let mut assets = Vec::new();
    collect_image_assets(&root, &root.join("Content"), &mut assets)?;

    assets.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(assets)
}

/// Scans `Content/Data` for XNB and JSON data assets.
pub(crate) fn scan_data_assets(path: String) -> anyhow::Result<Vec<DataAssetSummary>> {
    let root = clean_input_path(&path);
    read_directory_info(&root)?;

    let mut assets = Vec::new();
    collect_data_assets(&root, &root.join("Content").join("Data"), &mut assets)?;

    assets.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(assets)
}
