use super::builder::validate_i18n_locale;
use super::project_assets::verify_asset_file;
use super::types::{CpMakerExportRequest, CpMakerExportResult, CpMakerI18nFile, ProjectAssetRef};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use anyhow::{Context, bail};
use base64::Engine;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

struct PreparedVirtualAsset {
    relative_path: PathBuf,
    output_path: PathBuf,
    bytes: Vec<u8>,
}

struct PreparedProjectAsset {
    relative_path: PathBuf,
    source_path: PathBuf,
    output_path: PathBuf,
}

pub(crate) fn export_cp_maker_pack_at_dir(
    request: CpMakerExportRequest,
    project_assets_root: &Path,
    project_assets: &[ProjectAssetRef],
) -> anyhow::Result<CpMakerExportResult> {
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
    validate_project_asset_dependencies(project_assets, &prepared_assets)?;
    let prepared_project_assets = prepare_project_assets(
        &output_path,
        project_assets_root,
        project_assets,
        &prepared_assets,
    )?;
    validate_asset_paths(
        &manifest_path,
        &content_path,
        &prepared_project_assets,
        &prepared_assets,
    )?;
    let prepared_i18n = prepare_i18n_files(request.i18n_files)?;

    fs::create_dir_all(&output_path).with_context(|| {
        format!(
            "Failed to create export directory [path={}]",
            normalize_path(&output_path)
        )
    })?;

    let mut virtual_asset_paths =
        Vec::with_capacity(prepared_project_assets.len() + prepared_assets.len());
    for asset in prepared_project_assets {
        if let Some(parent) = asset.output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create project asset export directory [path={}]",
                    normalize_path(parent)
                )
            })?;
        }
        fs::copy(&asset.source_path, &asset.output_path).with_context(|| {
            format!(
                "Failed to export persisted project asset [from={}] [to={}]",
                normalize_path(&asset.source_path),
                normalize_path(&asset.output_path)
            )
        })?;
        virtual_asset_paths.push(normalize_path(&asset.output_path));
    }
    for asset in prepared_assets {
        if let Some(parent) = asset.output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create virtual asset directory [path={}]",
                    normalize_path(parent)
                )
            })?;
        }

        fs::write(&asset.output_path, asset.bytes).with_context(|| {
            format!(
                "Failed to write virtual asset [path={}]",
                normalize_path(&asset.output_path)
            )
        })?;
        virtual_asset_paths.push(normalize_path(&asset.output_path));
    }

    write_pretty_json_file(&manifest_path, &manifest, "manifest.json")?;
    write_pretty_json_file(&content_path, &content, "content.json")?;
    if !prepared_i18n.is_empty() {
        let i18n_dir = output_path.join("i18n");
        fs::create_dir_all(&i18n_dir).with_context(|| {
            format!(
                "Failed to create i18n directory [path={}]",
                normalize_path(&i18n_dir)
            )
        })?;
        for (locale, value) in prepared_i18n {
            let path = i18n_dir.join(format!("{locale}.json"));
            write_pretty_json_file(&path, &value, &format!("i18n/{locale}.json"))?;
        }
    }

    Ok(CpMakerExportResult {
        output_path: normalize_path(&output_path),
        manifest_path: normalize_path(&manifest_path),
        content_path: normalize_path(&content_path),
        virtual_asset_paths,
    })
}

fn validate_project_asset_dependencies(
    project_assets: &[ProjectAssetRef],
    virtual_assets: &[PreparedVirtualAsset],
) -> anyhow::Result<()> {
    let virtual_paths = virtual_assets
        .iter()
        .map(|asset| comparable_path_key(&asset.relative_path))
        .collect::<HashSet<_>>();
    let mut available_paths = virtual_paths.clone();
    for asset in project_assets {
        let path = validated_export_relative_path(&asset.relative_path, "project asset")?;
        available_paths.insert(comparable_path_key(&path));
    }

    for asset in project_assets {
        let owner = validated_export_relative_path(&asset.relative_path, "project asset")?;
        if virtual_paths.contains(&comparable_path_key(&owner)) {
            continue;
        }
        for dependency in &asset.dependencies {
            let dependency_path = validated_export_relative_path(
                &dependency.relative_path,
                "project asset dependency",
            )?;
            if !available_paths.contains(&comparable_path_key(&dependency_path)) {
                bail!(
                    "Cp-maker export is missing a project asset dependency. [owner={}] [dependency={}] [kind={}] [chain={} -> {}]",
                    normalize_path(&owner),
                    normalize_path(&dependency_path),
                    dependency.kind,
                    normalize_path(&owner),
                    normalize_path(&dependency_path)
                );
            }
        }
    }
    Ok(())
}

fn prepare_project_assets(
    output_path: &Path,
    project_assets_root: &Path,
    project_assets: &[ProjectAssetRef],
    virtual_assets: &[PreparedVirtualAsset],
) -> anyhow::Result<Vec<PreparedProjectAsset>> {
    let virtual_paths = virtual_assets
        .iter()
        .map(|asset| {
            (
                comparable_path_key(&asset.relative_path),
                normalize_path(&asset.relative_path).replace('\\', "/"),
            )
        })
        .collect::<HashMap<_, _>>();
    let mut prepared = Vec::with_capacity(project_assets.len());
    for asset in project_assets {
        let relative_path = validated_export_relative_path(&asset.relative_path, "project asset")?;
        let normalized = normalize_path(&relative_path).replace('\\', "/");
        if let Some(virtual_path) = virtual_paths.get(&comparable_path_key(&relative_path)) {
            if virtual_path != &normalized {
                bail!(
                    "Generated asset path `{virtual_path}` collides by case with persisted project asset `{normalized}`. [path={normalized}]"
                );
            }
            continue;
        }
        let source_path = project_assets_root.join(&relative_path);
        verify_asset_file(asset, &source_path)?;
        prepared.push(PreparedProjectAsset {
            relative_path: relative_path.clone(),
            source_path,
            output_path: output_path.join(relative_path),
        });
    }
    Ok(prepared)
}

fn prepare_i18n_files(files: Vec<CpMakerI18nFile>) -> anyhow::Result<Vec<(String, Value)>> {
    let mut prepared = Vec::new();
    let mut locales = std::collections::HashSet::new();
    for file in files {
        let locale = file.locale.trim().to_string();
        validate_i18n_locale(&locale)?;
        if !locales.insert(locale.clone()) {
            bail!("Duplicate i18n locale in export request [locale={locale}]");
        }
        let value: Value = serde_json::from_str(&file.raw_json)
            .with_context(|| format!("i18n/{locale}.json is not valid JSON"))?;
        if !value.is_object() {
            bail!("i18n/{locale}.json must contain a JSON object");
        }
        prepared.push((locale, value));
    }
    prepared.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(prepared)
}

fn validate_output_path(output_path: &Path) -> anyhow::Result<()> {
    let normalized_output_path = normalize_path(output_path);
    if normalized_output_path.trim().is_empty() {
        bail!(
            "Cp-maker export outputPath is required. [path={}]",
            normalized_output_path
        );
    }

    let mut has_directory_component = false;
    for segment in normalized_output_path
        .replace('\\', "/")
        .split('/')
        .filter(|segment| !segment.is_empty())
    {
        if matches!(segment, "." | "..") {
            bail!(
                "Cp-maker export outputPath must be a clean directory path target without `.` or `..` components. [path={}]",
                normalized_output_path
            );
        }

        if !segment.ends_with(':') {
            has_directory_component = true;
        }
    }

    if !has_directory_component {
        bail!(
            "Cp-maker export outputPath must target a directory path. [path={}]",
            normalized_output_path
        );
    }

    Ok(())
}

fn validate_fresh_output_directory(output_path: &Path) -> anyhow::Result<()> {
    if !output_path.exists() {
        return Ok(());
    }

    if !output_path.is_dir() {
        bail!(
            "Cp-maker export outputPath must point to a directory. [path={}]",
            normalize_path(output_path)
        );
    }

    let mut entries = fs::read_dir(output_path).with_context(|| {
        format!(
            "Failed to inspect export directory [path={}]",
            normalize_path(output_path)
        )
    })?;

    if entries
        .next()
        .transpose()
        .with_context(|| {
            format!(
                "Failed to inspect export directory [path={}]",
                normalize_path(output_path)
            )
        })?
        .is_some()
    {
        bail!(
            "Cp-maker export requires a fresh directory. Choose a new or empty directory. [path={}]",
            normalize_path(output_path)
        );
    }

    Ok(())
}

fn parse_export_json(json: &str, path: &Path, label: &str) -> anyhow::Result<Value> {
    serde_json::from_str(json)
        .with_context(|| format!("{label} is not valid JSON [path={}]", normalize_path(path)))
}

fn prepare_virtual_asset(
    output_path: &Path,
    asset: crate::domain::content_patcher::types::VirtualPreviewAsset,
) -> anyhow::Result<PreparedVirtualAsset> {
    let relative_path = validated_export_relative_path(&asset.relative_path, "virtual asset")?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&asset.bytes_base64)
        .with_context(|| {
            format!(
                "Cp-maker virtual asset `{}` payload is not valid base64 [path={}]",
                asset.relative_path,
                normalize_path(Path::new(&asset.relative_path))
            )
        })?;

    Ok(PreparedVirtualAsset {
        relative_path: relative_path.clone(),
        output_path: output_path.join(relative_path),
        bytes,
    })
}

fn validated_export_relative_path(raw: &str, label: &str) -> anyhow::Result<PathBuf> {
    let raw_relative_path = raw.trim();
    if raw_relative_path.is_empty() {
        bail!("Cp-maker {label} must include a relativePath.");
    }
    let relative_path = clean_input_path(raw_relative_path);
    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!(
            "Cp-maker {label} path `{raw}` must stay relative to the export directory. [path={}]",
            normalize_path(Path::new(raw))
        );
    }
    Ok(relative_path)
}

fn validate_asset_paths(
    manifest_path: &Path,
    content_path: &Path,
    project_assets: &[PreparedProjectAsset],
    virtual_assets: &[PreparedVirtualAsset],
) -> anyhow::Result<()> {
    let reserved_paths = [
        (comparable_path_key(manifest_path), "manifest.json"),
        (comparable_path_key(content_path), "content.json"),
    ];
    let mut seen_output_paths = HashMap::<String, String>::new();

    for (relative_path, output_path) in project_assets
        .iter()
        .map(|asset| (&asset.relative_path, &asset.output_path))
        .chain(
            virtual_assets
                .iter()
                .map(|asset| (&asset.relative_path, &asset.output_path)),
        )
    {
        let normalized_relative_path = normalize_path(relative_path);
        let output_path_key = comparable_path_key(output_path);

        if let Some((_, reserved_name)) = reserved_paths
            .iter()
            .find(|(reserved_path_key, _)| *reserved_path_key == output_path_key)
        {
            bail!(
                "Cp-maker virtual asset path `{normalized_relative_path}` collides with reserved export file `{reserved_name}`. [path={}]",
                normalized_relative_path
            );
        }

        if let Some(existing_relative_path) =
            seen_output_paths.insert(output_path_key, normalized_relative_path.clone())
        {
            bail!(
                "Cp-maker virtual asset path `{normalized_relative_path}` collides with another virtual asset path `{existing_relative_path}` after normalization. [path={}]",
                normalized_relative_path
            );
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

fn write_pretty_json_file(path: &Path, value: &Value, label: &str) -> anyhow::Result<()> {
    let formatted = serde_json::to_string_pretty(value).with_context(|| {
        format!(
            "Failed to serialize {label} [path={}]",
            normalize_path(path)
        )
    })?;
    fs::write(path, format!("{formatted}\n"))
        .with_context(|| format!("Failed to write {label} [path={}]", normalize_path(path)))
}
