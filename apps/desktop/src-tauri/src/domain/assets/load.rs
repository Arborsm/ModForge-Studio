use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::game_formats::parse_map_asset;
use crate::infrastructure::game_formats::xnb::{self, read_xnb_from_path};
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use base64::Engine;
use image::codecs::png::PngEncoder;
use image::{ColorType, ImageEncoder};
use std::fs;
use std::path::{Path, PathBuf};

use super::cache::{read_cached_string_asset, write_cached_string_asset};
use super::mime::{infer_audio_mime, infer_image_mime};
use super::pathing::{
    localized_variant_path, logicalized_asset_path, preferred_existing_xnb_path,
    split_localized_stem,
};
use super::types::{
    LocalTextFileContent, MapAssetContent, ParsedEventAssetContent, TextAssetContent,
};

fn encode_texture_png(texture: &xnb::TextureData) -> anyhow::Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let encoder = PngEncoder::new(&mut buffer);
    encoder
        .write_image(
            &texture.rgba,
            texture.width,
            texture.height,
            ColorType::Rgba8.into(),
        )
        .with_context(|| format!("Failed to encode texture"))?;
    Ok(buffer)
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

fn read_unpacked_text_asset(
    root: &Path,
    relative_path: &Path,
    locale: Option<&str>,
) -> anyhow::Result<Option<String>> {
    let Some(unpacked_path) = unpacked_text_asset_path(root, relative_path) else {
        return Ok(None);
    };

    let unpacked_path = locale
        .and_then(|locale| localized_variant_path(&unpacked_path, locale))
        .filter(|path| path.exists())
        .unwrap_or(unpacked_path);

    if !unpacked_path.exists() {
        return Ok(None);
    }

    let content = read_text_file(&unpacked_path)?;

    Ok(Some(content))
}

pub(crate) fn load_map_asset(
    root_path: String,
    map_path: String,
    locale: Option<String>,
) -> anyhow::Result<MapAssetContent> {
    let root = clean_input_path(&root_path);
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&clean_input_path(&map_path), requested_locale);

    if !absolute_path.exists() {
        bail!(
            "Map file does not exist: {}",
            normalize_path(&absolute_path)
        );
    }

    let relative_path = absolute_path
        .strip_prefix(&root)
        .with_context(|| format!("Map path is outside the selected game directory"))?;
    let logical_relative_path = logicalized_asset_path(relative_path);

    let format = absolute_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let content = match format.as_str() {
        "xnb" | "tmx" | "tbin" => {
            if let Some(content) =
                read_cached_string_asset("map", &absolute_path, requested_locale)?
            {
                content
            } else {
                let bytes = std::fs::read(&absolute_path).with_context(|| {
                    format!("Failed to read map {}", normalize_path(&absolute_path))
                })?;
                let map = parse_map_asset(
                    &bytes,
                    &absolute_path,
                    &normalize_path(&logical_relative_path),
                )?;
                let content = serde_json::to_string(&map)
                    .with_context(|| format!("Failed to serialize map"))?;
                if let Err(error) =
                    write_cached_string_asset("map", &absolute_path, requested_locale, &content)
                {
                    LogEvent::new("assets.cache.writeFailed")
                        .field("kind", "map")
                        .path("assetPath", &absolute_path)
                        .error(error)
                        .emit_warn(targets::ASSETS);
                }
                content
            }
        }
        _ => {
            bail!(
                "Unsupported map format for {}",
                normalize_path(&absolute_path)
            );
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
) -> anyhow::Result<TextAssetContent> {
    let root = clean_input_path(&root_path);
    let requested_path = root.join(clean_input_path(&asset_path));
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&requested_path, requested_locale);

    if !absolute_path.exists() {
        bail!(
            "Text asset does not exist: {}",
            normalize_path(&absolute_path)
        );
    }

    let relative_path = absolute_path
        .strip_prefix(&root)
        .with_context(|| format!("Text asset path is outside the selected game directory"))?;
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
                            serde_json::to_string(&json)
                                .with_context(|| format!("Failed to serialize XNB data"))?,
                            Some(absolute_path.as_path()),
                        )
                    }
                    Err(xnb_error) => {
                        if let Some(content) = read_unpacked_text_asset(
                            &root,
                            &logical_relative_path,
                            requested_locale,
                        )? {
                            LogEvent::new("assets.xnb.unpackedFallback")
                                .path("assetPath", &absolute_path)
                                .error(xnb_error)
                                .emit_warn(targets::ASSETS);
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
                            bail!(
                                "Failed to parse XNB text asset {}: {}.{}",
                                normalize_path(&absolute_path),
                                xnb_error,
                                fallback_hint
                            );
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
                        LogEvent::new("assets.cache.writeFailed")
                            .field("kind", "text-asset")
                            .path("assetPath", &absolute_path)
                            .error(error)
                            .emit_warn(targets::ASSETS);
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
                let content = read_text_file(&absolute_path)?;
                if let Err(error) = write_cached_string_asset(
                    "text-file",
                    &absolute_path,
                    requested_locale,
                    &content,
                ) {
                    LogEvent::new("assets.cache.writeFailed")
                        .field("kind", "text-file")
                        .path("assetPath", &absolute_path)
                        .error(error)
                        .emit_warn(targets::ASSETS);
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

/// Loads and parses a Stardew event asset using the canonical Rust event grammar.
pub(crate) fn load_event_asset(
    root_path: String,
    asset_path: String,
    locale: Option<String>,
) -> anyhow::Result<ParsedEventAssetContent> {
    let loaded = load_text_asset(root_path, asset_path, locale)?;
    let events = crate::domain::event_script::parse_event_asset_json(&loaded.content)?;
    Ok(ParsedEventAssetContent {
        absolute_path: loaded.absolute_path,
        relative_path: loaded.relative_path,
        events,
    })
}

pub(crate) fn load_text_file(path: String) -> anyhow::Result<LocalTextFileContent> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        bail!(
            "Text file does not exist: {}",
            normalize_path(&absolute_path)
        );
    }

    let content = read_text_file(&absolute_path)?;

    Ok(LocalTextFileContent {
        absolute_path: normalize_path(&absolute_path),
        content,
    })
}

pub(crate) fn load_image_data_url(path: String, locale: Option<String>) -> anyhow::Result<String> {
    let requested_locale = locale.as_deref();
    let absolute_path = preferred_existing_xnb_path(&clean_input_path(&path), requested_locale);

    if !absolute_path.exists() {
        bail!(
            "Image file does not exist: {}",
            normalize_path(&absolute_path)
        );
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
            .context("XNB file did not contain a Texture2D asset.")?;
        let png_bytes = encode_texture_png(texture)?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(png_bytes);
        let payload = format!("data:image/png;base64,{encoded}");
        if let Err(error) =
            write_cached_string_asset("image", &absolute_path, requested_locale, &payload)
        {
            LogEvent::new("assets.cache.writeFailed")
                .field("kind", "image")
                .path("assetPath", &absolute_path)
                .error(error)
                .emit_warn(targets::ASSETS);
        }
        return Ok(payload);
    }

    let bytes = fs::read(&absolute_path).with_context(|| {
        format!(
            "Failed to read image file {}",
            normalize_path(&absolute_path)
        )
    })?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_image_mime(&absolute_path);
    let payload = format!("data:{mime};base64,{encoded}");
    if let Err(error) =
        write_cached_string_asset("image", &absolute_path, requested_locale, &payload)
    {
        LogEvent::new("assets.cache.writeFailed")
            .field("kind", "image")
            .path("assetPath", &absolute_path)
            .error(error)
            .emit_warn(targets::ASSETS);
    }
    Ok(payload)
}

pub(crate) fn load_audio_data_url(path: String) -> anyhow::Result<String> {
    let absolute_path = clean_input_path(&path);

    if !absolute_path.exists() {
        bail!(
            "Audio file does not exist: {}",
            normalize_path(&absolute_path)
        );
    }

    let bytes = fs::read(&absolute_path).with_context(|| {
        format!(
            "Failed to read audio file {}",
            normalize_path(&absolute_path)
        )
    })?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let mime = infer_audio_mime(&absolute_path);
    Ok(format!("data:{mime};base64,{encoded}"))
}
