use super::types::BuildCpMakerMapAssetRequest;
use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::game_formats::tbin::serialize_tbin_map;
use anyhow::{Context, bail};
use base64::Engine;
use std::path::{Component, Path, PathBuf};

const MAP_ASSET_MEDIA_TYPE: &str = "application/x-tbin";

pub fn build_cp_maker_map_asset(
    request: BuildCpMakerMapAssetRequest,
) -> anyhow::Result<VirtualPreviewAsset> {
    let relative_path = validate_relative_asset_path(&request.relative_path)?;
    let bytes = serialize_tbin_map(&request.map_document).with_context(|| {
        format!(
            "Failed to serialize cp-maker map document [path={}]",
            normalize_path(&relative_path)
        )
    })?;

    Ok(VirtualPreviewAsset {
        relative_path: normalize_path(&relative_path),
        media_type: MAP_ASSET_MEDIA_TYPE.to_string(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

fn validate_relative_asset_path(raw_relative_path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = raw_relative_path.trim();
    if trimmed.is_empty() {
        bail!(
            "Cp-maker map assets must include a relativePath. [path={}]",
            normalize_path(Path::new(raw_relative_path))
        );
    }

    let relative_path = clean_input_path(trimmed);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!(
            "Cp-maker map asset path `{raw_relative_path}` must stay relative to the content pack. [path={}]",
            normalize_path(Path::new(raw_relative_path))
        );
    }

    Ok(relative_path)
}
