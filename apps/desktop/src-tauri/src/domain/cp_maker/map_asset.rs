use super::types::{BuildCpMakerMapAssetRequest, BuildCpMakerMapAssetResult};
use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path, normalize_separators};
use crate::infrastructure::game_formats::map::MapDocument;
use crate::infrastructure::game_formats::tbin::serialize_tbin_map;
use crate::infrastructure::game_formats::tmx::{serialize_tmx_map, serialize_tsx_tileset};
use anyhow::{Context, bail};
use base64::Engine;
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

pub fn build_cp_maker_map_asset(
    request: BuildCpMakerMapAssetRequest,
) -> anyhow::Result<BuildCpMakerMapAssetResult> {
    let relative_path = validate_relative_asset_path(&request.relative_path)?;
    let extension = relative_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let serialization = match extension.as_str() {
        "tmx" => serialize_tmx_map(&request.map_document).and_then(|bytes| {
            build_external_tsx_assets(&relative_path, &request.map_document)
                .map(|companions| (bytes, "application/xml", companions))
        }),
        "tbin" => serialize_tbin_map(&request.map_document)
            .map(|bytes| (bytes, "application/x-tbin", Vec::new())),
        "xnb" => bail!(
            "Cp-maker cannot write map XNB containers. Save the project asset as TMX or TBin. [path={}]",
            normalize_path(&relative_path)
        ),
        _ => bail!(
            "Cp-maker map asset path must end in .tmx or .tbin. [path={}]",
            normalize_path(&relative_path)
        ),
    };
    let (bytes, media_type, companion_assets) = serialization.with_context(|| {
        format!(
            "Failed to serialize cp-maker map document [path={}]",
            normalize_path(&relative_path)
        )
    })?;

    Ok(BuildCpMakerMapAssetResult {
        asset: VirtualPreviewAsset {
            relative_path: normalize_path(&relative_path),
            media_type: media_type.to_string(),
            bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        },
        companion_assets,
    })
}

fn build_external_tsx_assets(
    map_relative_path: &Path,
    document: &MapDocument,
) -> anyhow::Result<Vec<VirtualPreviewAsset>> {
    let mut serialized_by_path = BTreeMap::<String, Vec<u8>>::new();
    for tileset in document
        .tilesets
        .iter()
        .filter(|tileset| tileset.source.is_some())
    {
        let source = tileset.source.as_deref().unwrap_or_default();
        let relative_path = resolve_dependency_asset_path(map_relative_path, source)?;
        if !relative_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("tsx"))
        {
            bail!(
                "External tileset source must end in .tsx. [path={}] [source={source}]",
                normalize_path(map_relative_path)
            );
        }
        let normalized = normalize_separators(&normalize_path(&relative_path));
        let bytes = serialize_tsx_tileset(tileset).with_context(|| {
            format!(
                "Failed to serialize external TSX dependency [path={normalized}] [sourceMap={}]",
                normalize_path(map_relative_path)
            )
        })?;
        if let Some(previous) = serialized_by_path.get(&normalized) {
            if previous != &bytes {
                bail!(
                    "Multiple tilesets resolve to the same external TSX with conflicting definitions. [path={normalized}] [sourceMap={}]",
                    normalize_path(map_relative_path)
                );
            }
        } else {
            serialized_by_path.insert(normalized, bytes);
        }
    }
    Ok(serialized_by_path
        .into_iter()
        .map(|(relative_path, bytes)| VirtualPreviewAsset {
            relative_path,
            media_type: "application/xml".to_string(),
            bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        })
        .collect())
}

pub(super) fn resolve_dependency_asset_path(
    map_relative_path: &Path,
    source: &str,
) -> anyhow::Result<PathBuf> {
    let source_path = clean_input_path(source.trim());
    if source_path.as_os_str().is_empty() || source_path.is_absolute() {
        bail!(
            "External tileset source must be a non-empty project-relative path. [path={}] [source={source}]",
            normalize_path(map_relative_path)
        );
    }
    let mut resolved = map_relative_path
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_os_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    for component in source_path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(value) => resolved.push(value.to_os_string()),
            Component::ParentDir if resolved.pop().is_some() => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => bail!(
                "External tileset source escapes the content pack. [path={}] [source={source}]",
                normalize_path(map_relative_path)
            ),
        }
    }
    let relative_path = resolved.into_iter().collect::<PathBuf>();
    validate_relative_asset_path(&normalize_path(&relative_path))
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
