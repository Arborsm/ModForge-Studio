use base64::Engine;
use std::fs;
use std::path::{Component, Path, PathBuf};

use super::types::{ContentPatcherResultAsset, ExportContentPatcherAssetResult};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::game_formats::tbin::{MapDocument, serialize_tbin_map};
use anyhow::{Context, bail};

fn reject_symlink_directory_or_parent(directory: &Path) -> anyhow::Result<()> {
    for ancestor in directory.ancestors() {
        if ancestor.as_os_str().is_empty() {
            continue;
        }
        if ancestor.is_symlink() {
            bail!(
                "Export directory {} cannot be a symbolic link.",
                normalize_path(ancestor)
            );
        }
    }

    Ok(())
}

fn sanitize_export_stem(target: &str) -> String {
    let stem = target
        .replace('\\', "/")
        .split('/')
        .filter_map(|segment| {
            let trimmed = segment.trim();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .collect::<Vec<_>>()
        .join("-");
    let sanitized = stem
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if sanitized.is_empty() {
        "content-patcher-result".to_string()
    } else {
        sanitized
    }
}

fn export_extension(result: &ContentPatcherResultAsset) -> anyhow::Result<&'static str> {
    match result.kind.as_str() {
        "json" => Ok("json"),
        "image" => Ok("png"),
        "map" => Ok("tbin"),
        unsupported => Err(anyhow::anyhow!("unsupported export kind `{unsupported}`")),
    }
}

pub fn build_export_output_path(
    target: &str,
    output_directory: &str,
    result: &ContentPatcherResultAsset,
) -> anyhow::Result<PathBuf> {
    let directory = clean_input_path(output_directory);
    if directory
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        bail!("Export directory cannot contain parent path segments.");
    }
    reject_symlink_directory_or_parent(&directory)?;
    fs::create_dir_all(&directory).with_context(|| {
        format!(
            "Failed to create export directory {}",
            normalize_path(&directory)
        )
    })?;

    let canonical_directory = directory.canonicalize().with_context(|| {
        format!(
            "Failed to resolve export directory {}",
            normalize_path(&directory)
        )
    })?;
    let filename = format!(
        "{}.{}",
        sanitize_export_stem(target),
        export_extension(result)?
    );
    let output_path = canonical_directory.join(filename);
    let parent = output_path
        .parent()
        .context("Export output path has no parent directory.")?;
    if parent != Path::new(&canonical_directory) {
        bail!("Export output path escaped the selected directory.");
    }

    Ok(output_path)
}

pub fn write_result_asset(
    target: &str,
    output_path: &str,
    result: &ContentPatcherResultAsset,
) -> anyhow::Result<ExportContentPatcherAssetResult> {
    match result.kind.as_str() {
        "json" => {
            let json = result.json.as_ref().context("missing json result")?;
            let formatted = serde_json::to_string_pretty(json)?;
            fs::write(output_path, formatted)?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "json".to_string(),
                diagnostics: Vec::new(),
            })
        }
        "image" => {
            let image_data_url = result
                .image_data_url
                .as_deref()
                .context("missing image result")?;
            let (_, encoded) = image_data_url
                .split_once(',')
                .context("invalid image data URL")?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .with_context(|| format!("Failed to decode image export payload"))?;
            fs::write(output_path, bytes)?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "png".to_string(),
                diagnostics: Vec::new(),
            })
        }
        "map" => {
            let map_json = result.json.as_ref().context("missing map result")?;
            let document: MapDocument = serde_json::from_value(map_json.clone())
                .with_context(|| format!("Failed to deserialize map export payload"))?;
            let bytes = serialize_tbin_map(&document)
                .with_context(|| format!("Failed to serialize map export payload"))?;
            fs::write(output_path, bytes)?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "tbin".to_string(),
                diagnostics: Vec::new(),
            })
        }
        unsupported => Err(anyhow::anyhow!("unsupported export kind `{unsupported}`")),
    }
}
