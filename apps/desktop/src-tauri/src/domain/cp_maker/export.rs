use super::types::{
    CpMakerDraftError, CpMakerDraftErrorCode, CpMakerDraftOperation,
    CpMakerExportRequest, CpMakerExportResult,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

struct PreparedVirtualAsset {
    relative_path: PathBuf,
    output_path: PathBuf,
    bytes: Vec<u8>,
}

pub fn export_cp_maker_pack(
    request: CpMakerExportRequest,
) -> Result<CpMakerExportResult, CpMakerDraftError> {
    let output_path = clean_input_path(&request.output_path);
    validate_output_path(&output_path)?;
    validate_fresh_output_directory(&output_path)?;

    let manifest_path = output_path.join("manifest.json");
    let content_path = output_path.join("content.json");
    let manifest = parse_export_json(&request.manifest_json, &manifest_path, "manifest.json")?;
    let content = parse_export_json(&request.content_json, &content_path, "content.json")?;
    let prepared_assets = request
        .virtual_assets
        .into_iter()
        .map(|asset| prepare_virtual_asset(&output_path, asset))
        .collect::<Result<Vec<_>, _>>()?;
    validate_virtual_asset_paths(&manifest_path, &content_path, &prepared_assets)?;

    fs::create_dir_all(&output_path).map_err(|error| {
        write_failed(
            &output_path,
            format!("Failed to create export directory: {error}"),
        )
    })?;

    let mut virtual_asset_paths = Vec::with_capacity(prepared_assets.len());
    for asset in prepared_assets {
        if let Some(parent) = asset.output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                write_failed(
                    parent,
                    format!("Failed to create virtual asset directory: {error}"),
                )
            })?;
        }

        fs::write(&asset.output_path, asset.bytes).map_err(|error| {
            write_failed(
                &asset.output_path,
                format!("Failed to write virtual asset: {error}"),
            )
        })?;
        virtual_asset_paths.push(normalize_path(&asset.output_path));
    }

    write_pretty_json_file(&manifest_path, &manifest, "manifest.json")?;
    write_pretty_json_file(&content_path, &content, "content.json")?;

    Ok(CpMakerExportResult {
        output_path: normalize_path(&output_path),
        manifest_path: normalize_path(&manifest_path),
        content_path: normalize_path(&content_path),
        virtual_asset_paths,
    })
}

fn validate_output_path(output_path: &Path) -> Result<(), CpMakerDraftError> {
    let normalized_output_path = normalize_path(output_path);
    if normalized_output_path.trim().is_empty() {
        return Err(invalid_export(
            output_path,
            "Cp-maker export outputPath is required.",
        ));
    }

    let mut has_directory_component = false;
    for segment in normalized_output_path
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty())
    {
        if matches!(segment, "." | "..") {
            return Err(invalid_export(
                output_path,
                "Cp-maker export outputPath must be a clean directory path target without `.` or `..` components.",
            ));
        }

        if !segment.ends_with(':') {
            has_directory_component = true;
        }
    }

    if !has_directory_component {
        return Err(invalid_export(
            output_path,
            "Cp-maker export outputPath must target a directory path.",
        ));
    }

    Ok(())
}

fn validate_fresh_output_directory(output_path: &Path) -> Result<(), CpMakerDraftError> {
    if !output_path.exists() {
        return Ok(());
    }

    if !output_path.is_dir() {
        return Err(invalid_export(
            output_path,
            "Cp-maker export outputPath must point to a directory.",
        ));
    }

    let mut entries = fs::read_dir(output_path).map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Export,
            format!("Failed to inspect export directory: {error}"),
        )
        .with_path(normalize_path(output_path))
    })?;

    if entries.next().transpose().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Export,
            format!("Failed to inspect export directory: {error}"),
        )
        .with_path(normalize_path(output_path))
    })?.is_some() {
        return Err(invalid_export(
            output_path,
            "Cp-maker export requires a fresh directory. Choose a new or empty directory.",
        ));
    }

    Ok(())
}

fn parse_export_json(
    json: &str,
    path: &Path,
    label: &str,
) -> Result<Value, CpMakerDraftError> {
    serde_json::from_str(json).map_err(|error| {
        invalid_export(path, format!("{label} is not valid JSON: {error}"))
    })
}

fn prepare_virtual_asset(
    output_path: &Path,
    asset: crate::domain::content_patcher::types::VirtualPreviewAsset,
) -> Result<PreparedVirtualAsset, CpMakerDraftError> {
    let raw_relative_path = asset.relative_path.trim();
    if raw_relative_path.is_empty() {
        return Err(invalid_export(
            Path::new(&asset.relative_path),
            "Cp-maker virtual assets must include a relativePath.",
        ));
    }

    let relative_path = clean_input_path(raw_relative_path);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(invalid_export(
            Path::new(&asset.relative_path),
            format!(
                "Cp-maker virtual asset path `{}` must stay relative to the export directory.",
                asset.relative_path
            ),
        ));
    }

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&asset.bytes_base64)
        .map_err(|error| {
            invalid_export(
                Path::new(&asset.relative_path),
                format!(
                    "Cp-maker virtual asset `{}` payload is not valid base64: {error}",
                    asset.relative_path
                ),
            )
        })?;

    Ok(PreparedVirtualAsset {
        relative_path: relative_path.clone(),
        output_path: output_path.join(relative_path),
        bytes,
    })
}

fn validate_virtual_asset_paths(
    manifest_path: &Path,
    content_path: &Path,
    assets: &[PreparedVirtualAsset],
) -> Result<(), CpMakerDraftError> {
    let reserved_paths = [
        (comparable_path_key(manifest_path), "manifest.json"),
        (comparable_path_key(content_path), "content.json"),
    ];
    let mut seen_output_paths = HashMap::<String, String>::new();

    for asset in assets {
        let normalized_relative_path = normalize_path(&asset.relative_path);
        let output_path_key = comparable_path_key(&asset.output_path);

        if let Some((_, reserved_name)) = reserved_paths
            .iter()
            .find(|(reserved_path_key, _)| *reserved_path_key == output_path_key)
        {
            return Err(invalid_export(
                &asset.relative_path,
                format!(
                    "Cp-maker virtual asset path `{normalized_relative_path}` collides with reserved export file `{reserved_name}`."
                ),
            ));
        }

        if let Some(existing_relative_path) =
            seen_output_paths.insert(output_path_key, normalized_relative_path.clone())
        {
            return Err(invalid_export(
                &asset.relative_path,
                format!(
                    "Cp-maker virtual asset path `{normalized_relative_path}` collides with another virtual asset path `{existing_relative_path}` after normalization."
                ),
            ));
        }
    }

    Ok(())
}

fn comparable_path_key(path: &Path) -> String {
    normalize_path(path)
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

fn write_pretty_json_file(
    path: &Path,
    value: &Value,
    label: &str,
) -> Result<(), CpMakerDraftError> {
    let formatted = serde_json::to_string_pretty(value)
        .map_err(|error| write_failed(path, format!("Failed to serialize {label}: {error}")))?;
    fs::write(path, format!("{formatted}\n"))
        .map_err(|error| write_failed(path, format!("Failed to write {label}: {error}")))
}

fn invalid_export(path: &Path, message: impl Into<String>) -> CpMakerDraftError {
    CpMakerDraftError::new(
        CpMakerDraftErrorCode::InvalidExport,
        CpMakerDraftOperation::Export,
        message,
    )
    .with_path(normalize_path(path))
}

fn write_failed(path: &Path, message: impl Into<String>) -> CpMakerDraftError {
    CpMakerDraftError::new(
        CpMakerDraftErrorCode::WriteFailed,
        CpMakerDraftOperation::Export,
        message,
    )
    .with_path(normalize_path(path))
}
