use super::project::{normalize_relative_path, resolve_include_relative_path};
use super::schema::{parse_json_file, parse_json_str};
use super::types::{ContentPatcherMapDebugSummary, ContentPatcherProjectSnapshot};
use crate::attached_api::AttachedApiRegistry;
use crate::pathing::{clean_input_path, normalize_path};
use crate::tbin::MapDocument;
use crate::tbin::parse_tbin_map;
use crate::xnb::read_xnb_from_path;
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, GenericImageView, ImageEncoder, RgbaImage};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

fn target_looks_like_map(target: &str) -> bool {
    target.starts_with("Maps/")
}

fn target_looks_like_image(target: &str) -> bool {
    matches!(
        target.split('/').next(),
        Some("TileSheets" | "LooseSprites" | "Maps" | "Portraits" | "Characters" | "Minigames")
    )
}

fn from_file_looks_like_image(from_file: &str) -> bool {
    Path::new(from_file)
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| matches!(value.to_ascii_lowercase().as_str(), "png"))
}

pub fn infer_target_asset_kind(
    target: &str,
    actions: &[String],
    from_files: &[Option<String>],
    attached_api_registry: &AttachedApiRegistry,
) -> String {
    if let Some(asset_kind) = attached_api_registry.infer_asset_kind(target) {
        return asset_kind.to_string();
    }
    if actions.iter().any(|action| action.eq_ignore_ascii_case("EditImage"))
        || from_files
            .iter()
            .flatten()
            .any(|from_file| from_file_looks_like_image(from_file))
    {
        return "image".to_string();
    }
    if actions.iter().any(|action| action.eq_ignore_ascii_case("EditMap")) || target_looks_like_map(target) {
        return "map".to_string();
    }
    if target_looks_like_image(target) {
        return "image".to_string();
    }
    "json".to_string()
}

fn resolve_from_file_path(
    snapshot: &ContentPatcherProjectSnapshot,
    source_path: &str,
    from_file: &str,
) -> Result<(String, PathBuf), String> {
    let relative_from = resolve_include_relative_path(Path::new(source_path), from_file)?;
    let normalized_from = normalize_relative_path(&relative_from);
    let root = snapshot
        .summary
        .absolute_path
        .as_ref()
        .ok_or_else(|| format!("Unable to resolve FromFile `{from_file}` without project root path."))?;
    Ok((normalized_from, Path::new(root).join(&relative_from)))
}

pub fn load_base_json_asset(target: &str, game_root_path: Option<&str>) -> Value {
    if let Some(root) = game_root_path {
        if let Some(base_path) = build_target_asset_base_path(root, target) {
            for candidate in [base_path.with_extension("xnb"), base_path.with_extension("json"), base_path.clone()] {
                if !candidate.exists() {
                    continue;
                }

                let extension = candidate
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default();
                if extension.eq_ignore_ascii_case("xnb") {
                    match read_xnb_from_path(&candidate) {
                        Ok(xnb) => {
                            return xnb.content.to_json();
                        }
                        Err(error) => {
                            log::warn!("Failed to load base JSON asset {}: {error}", candidate.display());
                        }
                    }
                    continue;
                }

                match parse_json_file(&candidate) {
                    Ok((_, parsed)) => return parsed,
                    Err(error) => {
                        log::warn!("Failed to load base JSON asset {}: {error}", candidate.display());
                    }
                }
            }
        }
    }

    Value::Object(Map::new())
}

fn build_target_asset_base_path(game_root_path: &str, target: &str) -> Option<PathBuf> {
    let normalized_target = target.trim().replace('\\', "/");
    if normalized_target.is_empty() {
        return None;
    }

    let mut relative_path = PathBuf::new();
    for segment in normalized_target.split('/') {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        relative_path.push(trimmed);
    }

    if relative_path.as_os_str().is_empty() {
        return None;
    }

    Some(clean_input_path(game_root_path).join("Content").join(relative_path))
}

fn load_image_from_asset_path(path: &Path) -> Result<RgbaImage, String> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if extension.eq_ignore_ascii_case("xnb") {
        let xnb = read_xnb_from_path(path)?;
        let texture = xnb
            .content
            .as_texture()
            .ok_or_else(|| format!("XNB image asset {} did not contain a Texture2D payload.", path.display()))?;
        return RgbaImage::from_vec(texture.width, texture.height, texture.rgba.clone()).ok_or_else(|| {
            format!(
                "Texture payload for {} did not match {}x{} RGBA dimensions.",
                path.display(),
                texture.width,
                texture.height
            )
        });
    }

    image::open(path)
        .map_err(|err| format!("Failed to load base image asset {}: {err}", path.display()))
        .map(|image| image.to_rgba8())
}

#[derive(Debug, Clone)]
pub struct LoadedBaseImageAsset {
    pub image: RgbaImage,
    pub source: String,
}

fn describe_base_image_source(game_root_path: &str, candidate: &Path) -> String {
    let root = clean_input_path(game_root_path);
    let relative = candidate
        .strip_prefix(&root)
        .map(normalize_path)
        .unwrap_or_else(|_| normalize_path(candidate))
        .replace('\\', "/");
    format!("Game content -> {relative}")
}

pub fn load_base_image_asset(target: &str, game_root_path: Option<&str>) -> LoadedBaseImageAsset {
    if let Some(root) = game_root_path {
        if let Some(base_path) = build_target_asset_base_path(root, target) {
            for candidate in [base_path.with_extension("xnb"), base_path.with_extension("png"), base_path.clone()] {
                if !candidate.exists() {
                    continue;
                }

                match load_image_from_asset_path(&candidate) {
                    Ok(image) => {
                        return LoadedBaseImageAsset {
                            image,
                            source: describe_base_image_source(root, &candidate),
                        }
                    }
                    Err(error) => {
                        log::warn!("{error}");
                    }
                }
            }
        }
    }

    LoadedBaseImageAsset {
        image: RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0])),
        source: format!("No game base image found for `{target}`. Using transparent fallback."),
    }
}

fn build_map_debug_summary(document: &MapDocument) -> ContentPatcherMapDebugSummary {
    ContentPatcherMapDebugSummary {
        layers: document.layers.iter().map(|layer| layer.name.clone()).collect(),
        properties: document.properties.keys().cloned().collect(),
        warps: if document.properties.contains_key("Warp") {
            vec!["Warp".to_string()]
        } else {
            Vec::new()
        },
    }
}

#[derive(Debug)]
pub struct LoadedMapAsset {
    pub document: MapDocument,
    pub debug: ContentPatcherMapDebugSummary,
}

fn create_empty_map_document(target: &str) -> MapDocument {
    MapDocument {
        name: target
            .split('/')
            .last()
            .filter(|value| !value.is_empty())
            .unwrap_or(target)
            .to_string(),
        format: "xnb".to_string(),
        source_path: format!("Content/{target}.xnb"),
        relative_path: format!("Content/{target}.xnb"),
        width: 0,
        height: 0,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        properties: std::collections::HashMap::new(),
        tilesets: Vec::new(),
        layers: Vec::new(),
        object_groups: Vec::new(),
    }
}

pub fn load_base_map_asset(target: &str, game_root_path: Option<&str>) -> LoadedMapAsset {
    if let Some(root) = game_root_path {
        if let Some(base_path) = build_target_asset_base_path(root, target) {
            let candidate = base_path.with_extension("xnb");
            if candidate.exists() {
                match read_xnb_from_path(&candidate)
                    .and_then(|xnb| {
                        let bytes = xnb
                            .content
                            .as_bytes()
                            .ok_or_else(|| format!("Map XNB did not contain TBin data: {}", candidate.display()))?;
                        parse_tbin_map(
                            bytes,
                            &candidate,
                            &normalize_path(&Path::new("Content").join(format!("{target}.xnb"))),
                        )
                    }) {
                    Ok(document) => {
                        let debug = build_map_debug_summary(&document);
                        return LoadedMapAsset { document, debug };
                    }
                    Err(error) => {
                        log::warn!("Failed to load base map asset {}: {error}", candidate.display());
                    }
                }
            }
        }
    }

    let document = create_empty_map_document(target);
    LoadedMapAsset {
        debug: build_map_debug_summary(&document),
        document,
    }
}

pub fn load_json_patch_asset(
    snapshot: &ContentPatcherProjectSnapshot,
    source_path: &str,
    from_file: &str,
) -> Result<Value, String> {
    let (normalized_from, absolute_from) = resolve_from_file_path(snapshot, source_path, from_file)?;

    if let Some(source) = snapshot.sources.iter().find(|source| source.path == normalized_from) {
        return parse_json_str(&source.raw_json, &source.path);
    }

    let (_, parsed) = parse_json_file(&absolute_from)?;
    Ok(parsed)
}

pub fn load_image_patch_asset(
    snapshot: &ContentPatcherProjectSnapshot,
    source_path: &str,
    from_file: &str,
) -> Result<RgbaImage, String> {
    let (_, absolute_from) = resolve_from_file_path(snapshot, source_path, from_file)?;
    let image = image::open(&absolute_from)
        .map_err(|err| format!("Failed to load image patch asset {}: {err}", absolute_from.display()))?;
    Ok(image.to_rgba8())
}

pub fn load_map_patch_asset(
    snapshot: &ContentPatcherProjectSnapshot,
    source_path: &str,
    from_file: &str,
) -> Result<LoadedMapAsset, String> {
    let (_, absolute_from) = resolve_from_file_path(snapshot, source_path, from_file)?;
    let bytes = std::fs::read(&absolute_from)
        .map_err(|err| format!("Failed to read map patch asset {}: {err}", absolute_from.display()))?;
    let document = parse_tbin_map(&bytes, &absolute_from, from_file)?;
    let debug = build_map_debug_summary(&document);

    Ok(LoadedMapAsset {
        document,
        debug,
    })
}

pub fn encode_image_png(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut buffer = Vec::new();
    let encoder = PngEncoder::new(&mut buffer);
    encoder
        .write_image(image.as_raw(), image.width(), image.height(), ColorType::Rgba8.into())
        .map_err(|err| format!("Failed to encode image result: {err}"))?;
    Ok(buffer)
}

pub fn image_to_data_url(image: &RgbaImage) -> Result<String, String> {
    let encoded = base64::engine::general_purpose::STANDARD.encode(encode_image_png(image)?);
    Ok(format!("data:image/png;base64,{encoded}"))
}

pub fn expand_image_to_fit(image: &mut RgbaImage, width: u32, height: u32) {
    if image.width() >= width && image.height() >= height {
        return;
    }

    let next_width = image.width().max(width);
    let next_height = image.height().max(height);
    let mut expanded = RgbaImage::from_pixel(next_width, next_height, image::Rgba([0, 0, 0, 0]));
    image::imageops::replace(&mut expanded, image, 0, 0);
    *image = expanded;
}

pub fn crop_image_area(
    image: &RgbaImage,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<RgbaImage, String> {
    let right = x
        .checked_add(width)
        .ok_or_else(|| "Image crop width overflowed.".to_string())?;
    let bottom = y
        .checked_add(height)
        .ok_or_else(|| "Image crop height overflowed.".to_string())?;
    if right > image.width() || bottom > image.height() {
        return Err(format!(
            "Image crop area [{x}, {y}, {width}, {height}] is outside the source image bounds {}x{}.",
            image.width(),
            image.height()
        ));
    }

    Ok(image.view(x, y, width, height).to_image())
}

#[cfg(test)]
#[path = "tests/assets_tests.rs"]
mod tests;
