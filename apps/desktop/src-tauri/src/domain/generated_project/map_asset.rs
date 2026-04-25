use super::types::{
    BuildGeneratedProjectMapAssetRequest, GeneratedProjectDraftError, GeneratedProjectDraftErrorCode,
    GeneratedProjectDraftOperation,
};
use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::game_formats::tbin::serialize_tbin_map;
use base64::Engine;
use std::path::{Component, Path, PathBuf};

const MAP_ASSET_MEDIA_TYPE: &str = "application/x-tbin";

pub fn build_generated_project_map_asset(
    request: BuildGeneratedProjectMapAssetRequest,
) -> Result<VirtualPreviewAsset, GeneratedProjectDraftError> {
    let relative_path = validate_relative_asset_path(&request.relative_path)?;
    let bytes = serialize_tbin_map(&request.map_document).map_err(|error| {
        invalid_map_asset(
            &relative_path,
            format!("Failed to serialize generated-project map document: {error}"),
        )
    })?;

    Ok(VirtualPreviewAsset {
        relative_path: normalize_path(&relative_path),
        media_type: MAP_ASSET_MEDIA_TYPE.to_string(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

fn validate_relative_asset_path(raw_relative_path: &str) -> Result<PathBuf, GeneratedProjectDraftError> {
    let trimmed = raw_relative_path.trim();
    if trimmed.is_empty() {
        return Err(invalid_map_asset(
            Path::new(raw_relative_path),
            "Generated-project map assets must include a relativePath.",
        ));
    }

    let relative_path = clean_input_path(trimmed);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_map_asset(
            Path::new(raw_relative_path),
            format!(
                "Generated-project map asset path `{raw_relative_path}` must stay relative to the content pack."
            ),
        ));
    }

    Ok(relative_path)
}

fn invalid_map_asset(path: &Path, message: impl Into<String>) -> GeneratedProjectDraftError {
    GeneratedProjectDraftError::new(
        GeneratedProjectDraftErrorCode::InvalidExport,
        GeneratedProjectDraftOperation::BuildMapAsset,
        message,
    )
    .with_path(normalize_path(path))
}
