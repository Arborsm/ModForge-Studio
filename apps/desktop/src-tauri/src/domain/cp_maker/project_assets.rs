use super::storage::validate_draft_storage_key;
use super::types::{
    ProjectAssetDependency, ProjectAssetPayload, ProjectAssetRef, ProjectAssetSource,
};
use crate::infrastructure::fs::pathing::{normalize_path, validated_game_relative_path};
use anyhow::{Context, bail};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use uuid::Uuid;

pub(super) fn project_assets_dir(projects_dir: &Path, draft_storage_key: &str) -> PathBuf {
    projects_dir.join(draft_storage_key).join("assets")
}

pub(super) fn read_project_asset_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<ProjectAssetPayload> {
    let (asset, _path, bytes) =
        read_verified_project_asset_at_dir(projects_dir, draft_storage_key, relative_path, assets)?;
    Ok(ProjectAssetPayload {
        asset,
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

pub(super) fn read_verified_project_asset_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<(ProjectAssetRef, PathBuf, Vec<u8>)> {
    let (asset, path) =
        resolve_project_asset_path_at_dir(projects_dir, draft_storage_key, relative_path, assets)?;
    let bytes = fs::read(&path).with_context(|| {
        format!(
            "Failed to read project asset [draftStorageKey={draft_storage_key}] [path={}]",
            normalize_path(&path)
        )
    })?;
    verify_asset_bytes(&asset, &bytes, &path)?;
    Ok((asset, path, bytes))
}

pub(super) fn resolve_project_asset_path_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<(ProjectAssetRef, PathBuf)> {
    validate_draft_storage_key(draft_storage_key)?;
    let relative = validated_asset_relative_path(relative_path)?;
    let normalized = normalize_path(&relative).replace('\\', "/");
    let asset = assets
        .iter()
        .find(|asset| asset.relative_path.eq_ignore_ascii_case(&normalized))
        .with_context(|| format!("Project asset ref was not found. [draftStorageKey={draft_storage_key}] [path={normalized}]"))?
        .clone();
    let root = project_assets_dir(projects_dir, draft_storage_key);
    let path = root.join(&relative);
    Ok((asset, path))
}

pub(super) fn write_project_asset_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    media_type: &str,
    bytes: &[u8],
    source_type: ProjectAssetSource,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<(ProjectAssetRef, PathBuf, Option<PathBuf>)> {
    validate_draft_storage_key(draft_storage_key)?;
    let relative = validated_asset_relative_path(relative_path)?;
    let normalized = normalize_path(&relative).replace('\\', "/");
    if assets.iter().any(|asset| {
        asset.relative_path.eq_ignore_ascii_case(&normalized) && asset.relative_path != normalized
    }) {
        bail!("Project asset path collides by case with an existing asset. [path={normalized}]");
    }
    let root = project_assets_dir(projects_dir, draft_storage_key);
    let destination = root.join(&relative);
    let parent = destination
        .parent()
        .context("Project asset path has no parent")?;
    fs::create_dir_all(parent).with_context(|| {
        format!(
            "Failed to create project asset directory [path={}]",
            normalize_path(parent)
        )
    })?;
    let temp_path = parent.join(format!(".asset-{}.tmp", Uuid::new_v4()));
    let backup_path = destination
        .exists()
        .then(|| parent.join(format!(".asset-{}.bak", Uuid::new_v4())));
    {
        let mut file = File::create(&temp_path).with_context(|| {
            format!(
                "Failed to create temporary project asset [path={}]",
                normalize_path(&temp_path)
            )
        })?;
        file.write_all(bytes).with_context(|| {
            format!(
                "Failed to write temporary project asset [path={}]",
                normalize_path(&temp_path)
            )
        })?;
        file.sync_all().with_context(|| {
            format!(
                "Failed to flush temporary project asset [path={}]",
                normalize_path(&temp_path)
            )
        })?;
    }
    if let Some(backup) = &backup_path {
        fs::rename(&destination, backup).with_context(|| {
            format!(
                "Failed to stage existing project asset [path={}]",
                normalize_path(&destination)
            )
        })?;
    }
    if let Err(error) = fs::rename(&temp_path, &destination) {
        if let Some(backup) = &backup_path {
            let _ = fs::rename(backup, &destination);
        }
        let _ = fs::remove_file(&temp_path);
        return Err(error).with_context(|| {
            format!(
                "Failed to finalize project asset [path={}]",
                normalize_path(&destination)
            )
        });
    }
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let asset = ProjectAssetRef {
        relative_path: normalized.clone(),
        media_type: if media_type.trim().is_empty() {
            infer_media_type(&destination).to_string()
        } else {
            media_type.trim().to_string()
        },
        size_bytes: bytes.len() as u64,
        sha256: format!("{:x}", hasher.finalize()),
        storage_key: normalized,
        source_type,
        dependencies: assets
            .iter()
            .find(|asset| asset.relative_path.eq_ignore_ascii_case(relative_path))
            .map(|asset| asset.dependencies.clone())
            .unwrap_or_default(),
    };
    Ok((asset, destination, backup_path))
}

pub(super) fn commit_project_asset_write(backup_path: Option<PathBuf>) -> anyhow::Result<()> {
    if let Some(path) = backup_path {
        if path.exists() {
            fs::remove_file(&path).with_context(|| {
                format!(
                    "Failed to remove project asset backup [path={}]",
                    normalize_path(&path)
                )
            })?;
        }
    }
    Ok(())
}

pub(super) fn rollback_project_asset_write(destination: &Path, backup_path: Option<&Path>) {
    let _ = fs::remove_file(destination);
    if let Some(backup) = backup_path {
        let _ = fs::rename(backup, destination);
    }
}

pub(super) struct ProjectAssetBatchWriteInput {
    pub relative_path: String,
    pub media_type: String,
    pub bytes: Vec<u8>,
    pub source_type: ProjectAssetSource,
}

#[derive(Debug)]
pub(super) struct StagedProjectAssetBatch {
    pub assets: Vec<ProjectAssetRef>,
    writes: Vec<(PathBuf, Option<PathBuf>)>,
}

pub(super) fn write_project_assets_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    inputs: Vec<ProjectAssetBatchWriteInput>,
    existing_assets: &[ProjectAssetRef],
) -> anyhow::Result<StagedProjectAssetBatch> {
    if inputs.is_empty() {
        bail!("Project asset batch write requires at least one asset.");
    }
    let mut seen = HashSet::new();
    for input in &inputs {
        let relative = validated_asset_relative_path(&input.relative_path)?;
        let normalized = normalize_path(&relative).replace('\\', "/");
        if !seen.insert(normalized.to_lowercase()) {
            bail!("Project asset batch contains a duplicate path. [path={normalized}]");
        }
    }

    let mut working_assets = existing_assets.to_vec();
    let mut staged = StagedProjectAssetBatch {
        assets: Vec::with_capacity(inputs.len()),
        writes: Vec::with_capacity(inputs.len()),
    };
    for input in inputs {
        let write = write_project_asset_at_dir(
            projects_dir,
            draft_storage_key,
            &input.relative_path,
            &input.media_type,
            &input.bytes,
            input.source_type,
            &working_assets,
        );
        let (asset, destination, backup) = match write {
            Ok(result) => result,
            Err(error) => {
                rollback_project_asset_batch(&staged);
                return Err(error);
            }
        };
        working_assets.retain(|current| {
            !current
                .relative_path
                .eq_ignore_ascii_case(&asset.relative_path)
        });
        working_assets.push(asset.clone());
        staged.assets.push(asset);
        staged.writes.push((destination, backup));
    }
    Ok(staged)
}

pub(super) fn rollback_project_asset_batch(batch: &StagedProjectAssetBatch) {
    for (destination, backup) in batch.writes.iter().rev() {
        rollback_project_asset_write(destination, backup.as_deref());
    }
}

pub(super) fn commit_project_asset_batch(batch: StagedProjectAssetBatch) -> anyhow::Result<()> {
    for (_, backup) in batch.writes {
        commit_project_asset_write(backup)?;
    }
    Ok(())
}

fn validated_asset_relative_path(raw: &str) -> anyhow::Result<PathBuf> {
    if raw.trim().is_empty() {
        bail!("Project asset path must not be empty.");
    }
    validated_game_relative_path(raw).with_context(|| {
        format!(
            "Project asset path must stay relative to the project. [path={}]",
            raw.trim()
        )
    })
}

fn verify_asset_bytes(asset: &ProjectAssetRef, bytes: &[u8], path: &Path) -> anyhow::Result<()> {
    if bytes.len() as u64 != asset.size_bytes {
        bail!(
            "Project asset size differs from its persisted ref. [path={}] [expected={}] [actual={}]",
            normalize_path(path),
            asset.size_bytes,
            bytes.len()
        );
    }
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let actual = format!("{:x}", hasher.finalize());
    if actual != asset.sha256 {
        bail!(
            "Project asset hash differs from its persisted ref. [path={}] [expected={}] [actual={actual}]",
            normalize_path(path),
            asset.sha256
        );
    }
    Ok(())
}

pub(super) fn verify_asset_file(asset: &ProjectAssetRef, path: &Path) -> anyhow::Result<()> {
    let mut file = File::open(path).with_context(|| {
        format!(
            "Failed to open project asset [path={}]",
            normalize_path(path)
        )
    })?;
    let mut hasher = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).with_context(|| {
            format!(
                "Failed to verify project asset [path={}]",
                normalize_path(path)
            )
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        size = size.saturating_add(read as u64);
    }
    if size != asset.size_bytes {
        bail!(
            "Project asset size differs from its persisted ref. [path={}] [expected={}] [actual={size}]",
            normalize_path(path),
            asset.size_bytes
        );
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != asset.sha256 {
        bail!(
            "Project asset hash differs from its persisted ref. [path={}] [expected={}] [actual={actual}]",
            normalize_path(path),
            asset.sha256
        );
    }
    Ok(())
}

pub(super) fn rename_project_asset_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    new_relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<(ProjectAssetRef, PathBuf, PathBuf)> {
    validate_draft_storage_key(draft_storage_key)?;
    let old_relative = validated_asset_relative_path(relative_path)?;
    let new_relative = validated_asset_relative_path(new_relative_path)?;
    let old_normalized = normalize_path(&old_relative).replace('\\', "/");
    let new_normalized = normalize_path(&new_relative).replace('\\', "/");
    let current = assets
        .iter()
        .find(|asset| asset.relative_path.eq_ignore_ascii_case(&old_normalized))
        .with_context(|| format!("Project asset ref was not found. [path={old_normalized}]"))?;
    if assets.iter().any(|asset| {
        !asset.relative_path.eq_ignore_ascii_case(&old_normalized)
            && asset.relative_path.eq_ignore_ascii_case(&new_normalized)
    }) {
        bail!("Project asset rename collides with an existing asset. [path={new_normalized}]");
    }
    if old_normalized.eq_ignore_ascii_case(&new_normalized) && old_normalized != new_normalized {
        bail!(
            "Project asset paths that differ only by case are not supported. [path={new_normalized}]"
        );
    }
    let root = project_assets_dir(projects_dir, draft_storage_key);
    let source = root.join(&old_relative);
    let destination = root.join(&new_relative);
    verify_asset_file(current, &source)?;
    if source == destination {
        return Ok((current.clone(), source.clone(), destination));
    }
    if destination.exists() {
        bail!(
            "Project asset rename target already exists. [path={}]",
            normalize_path(&destination)
        );
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create project asset directory [path={}]",
                normalize_path(parent)
            )
        })?;
    }
    fs::rename(&source, &destination).with_context(|| {
        format!(
            "Failed to rename project asset [from={}] [to={}]",
            normalize_path(&source),
            normalize_path(&destination)
        )
    })?;
    let mut renamed = current.clone();
    renamed.relative_path = new_normalized.clone();
    renamed.storage_key = new_normalized;
    Ok((renamed, source, destination))
}

pub(super) fn stage_project_asset_delete_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<(PathBuf, PathBuf)> {
    validate_draft_storage_key(draft_storage_key)?;
    let relative = validated_asset_relative_path(relative_path)?;
    let normalized = normalize_path(&relative).replace('\\', "/");
    let current = assets
        .iter()
        .find(|asset| asset.relative_path.eq_ignore_ascii_case(&normalized))
        .with_context(|| format!("Project asset ref was not found. [path={normalized}]"))?;
    let source = project_assets_dir(projects_dir, draft_storage_key).join(relative);
    verify_asset_file(current, &source)?;
    let staged = source.with_file_name(format!(".asset-{}.deleted", Uuid::new_v4()));
    fs::rename(&source, &staged).with_context(|| {
        format!(
            "Failed to stage project asset deletion [path={}]",
            normalize_path(&source)
        )
    })?;
    Ok((source, staged))
}

pub(super) fn import_project_assets_at_dir(
    source_dir: &Path,
    projects_dir: &Path,
    draft_storage_key: &str,
) -> anyhow::Result<Vec<ProjectAssetRef>> {
    validate_draft_storage_key(draft_storage_key)?;
    let source_root = source_dir.canonicalize().with_context(|| {
        format!(
            "Failed to resolve imported content pack [path={}]",
            normalize_path(source_dir)
        )
    })?;
    if !source_root.is_dir() {
        bail!(
            "Imported content pack must be a directory. [path={}]",
            normalize_path(&source_root)
        );
    }
    fs::create_dir_all(projects_dir).with_context(|| {
        format!(
            "Failed to create cp-maker projects directory [path={}]",
            normalize_path(projects_dir)
        )
    })?;
    let project_dir = projects_dir.join(draft_storage_key);
    if project_dir.exists() {
        bail!(
            "Cp-maker project asset directory already exists. [draftStorageKey={draft_storage_key}] [path={}]",
            normalize_path(&project_dir)
        );
    }
    let temp_project_dir =
        projects_dir.join(format!(".import-{}-{}", draft_storage_key, Uuid::new_v4()));
    let temp_assets_dir = temp_project_dir.join("assets");
    fs::create_dir_all(&temp_assets_dir).with_context(|| {
        format!(
            "Failed to create temporary project asset directory [path={}]",
            normalize_path(&temp_assets_dir)
        )
    })?;

    let imported = collect_and_copy_assets(&source_root, &source_root, &temp_assets_dir);
    let assets = match imported {
        Ok(mut assets) => {
            if let Err(error) = populate_project_asset_dependencies(&temp_assets_dir, &mut assets) {
                let _ = fs::remove_dir_all(&temp_project_dir);
                return Err(error);
            }
            assets
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&temp_project_dir);
            return Err(error);
        }
    };
    if let Err(error) = fs::rename(&temp_project_dir, &project_dir) {
        let _ = fs::remove_dir_all(&temp_project_dir);
        return Err(error).with_context(|| format!("Failed to finalize project asset import [draftStorageKey={draft_storage_key}] [path={}]", normalize_path(&project_dir)));
    }
    Ok(assets)
}

pub(super) struct ImportedProjectAssetBatch {
    pub assets: Vec<ProjectAssetRef>,
    pub finalized_roots: Vec<PathBuf>,
}

pub(super) fn import_project_asset_paths_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    source_paths: &[String],
    destination_directory: &str,
    existing_assets: &[ProjectAssetRef],
) -> anyhow::Result<ImportedProjectAssetBatch> {
    validate_draft_storage_key(draft_storage_key)?;
    if source_paths.is_empty() {
        bail!("Project asset import requires at least one source path.");
    }
    let destination_directory = validated_asset_relative_path(destination_directory)?;
    let project_root = project_assets_dir(projects_dir, draft_storage_key);
    fs::create_dir_all(&project_root).with_context(|| {
        format!(
            "Failed to create project asset root [path={}]",
            normalize_path(&project_root)
        )
    })?;
    let staging_root = project_root.join(format!(".import-{}", Uuid::new_v4()));
    fs::create_dir_all(&staging_root).with_context(|| {
        format!(
            "Failed to create project asset import staging directory [path={}]",
            normalize_path(&staging_root)
        )
    })?;

    let imported = (|| {
        let mut assets = Vec::new();
        let mut roots = Vec::new();
        let mut seen_paths = existing_assets
            .iter()
            .map(|asset| asset.relative_path.to_lowercase())
            .collect::<HashSet<_>>();
        let mut seen_sources = HashSet::new();

        for raw_source in source_paths {
            let source_input = PathBuf::from(raw_source.trim());
            let metadata = fs::symlink_metadata(&source_input).with_context(|| {
                format!(
                    "Failed to inspect imported project asset source [path={}]",
                    normalize_path(&source_input)
                )
            })?;
            if metadata.file_type().is_symlink() {
                bail!(
                    "Project asset import source must not be a symbolic link. [path={}]",
                    normalize_path(&source_input)
                );
            }
            let source = source_input.canonicalize().with_context(|| {
                format!(
                    "Failed to resolve imported project asset source [path={}]",
                    normalize_path(&source_input)
                )
            })?;
            let source_key = normalize_path(&source).to_lowercase();
            if !seen_sources.insert(source_key) {
                bail!(
                    "Project asset import contains a duplicate source path. [path={}]",
                    normalize_path(&source)
                );
            }
            let file_name = source
                .file_name()
                .and_then(|value| value.to_str())
                .context("Imported project asset source has no UTF-8 file name")?;
            let is_directory = metadata.is_dir();
            if !is_directory && !metadata.is_file() {
                bail!(
                    "Project asset import source must be a file or directory. [path={}]",
                    normalize_path(&source)
                );
            }
            let relative_root = allocate_import_root(
                &project_root,
                &destination_directory,
                file_name,
                is_directory,
                &seen_paths,
            )?;
            roots.push(relative_root.clone());

            if is_directory {
                let asset_count_before = assets.len();
                collect_directory(
                    &source,
                    &source,
                    &staging_root,
                    &relative_root,
                    false,
                    &mut seen_paths,
                    &mut assets,
                )?;
                if assets.len() == asset_count_before {
                    bail!(
                        "Project asset import directory contains no files. [path={}]",
                        normalize_path(&source)
                    );
                }
            } else {
                let destination = staging_root.join(&relative_root);
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent)?;
                }
                let (size_bytes, sha256) = copy_and_hash(&source, &destination)?;
                let normalized = normalize_path(&relative_root).replace('\\', "/");
                seen_paths.insert(normalized.to_lowercase());
                assets.push(ProjectAssetRef {
                    relative_path: normalized.clone(),
                    media_type: infer_media_type(&source).to_string(),
                    size_bytes,
                    sha256,
                    storage_key: normalized,
                    source_type: ProjectAssetSource::Imported,
                    dependencies: Vec::new(),
                });
            }
        }
        populate_project_asset_dependencies(&staging_root, &mut assets)?;
        Ok::<_, anyhow::Error>((assets, roots))
    })();

    let (mut assets, roots) = match imported {
        Ok(imported) => imported,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging_root);
            return Err(error);
        }
    };
    let mut finalized_roots: Vec<PathBuf> = Vec::new();
    for relative_root in roots {
        let staged = staging_root.join(&relative_root);
        let destination = project_root.join(&relative_root);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        if let Err(error) = fs::rename(&staged, &destination) {
            for finalized in finalized_roots.iter().rev() {
                let staged_rollback = staging_root.join(
                    finalized
                        .strip_prefix(&project_root)
                        .unwrap_or(finalized.as_path()),
                );
                let _ = fs::rename(finalized, staged_rollback);
            }
            let _ = fs::remove_dir_all(&staging_root);
            return Err(error).with_context(|| {
                format!(
                    "Failed to finalize imported project asset [path={}]",
                    normalize_path(&destination)
                )
            });
        }
        finalized_roots.push(destination);
    }
    let _ = fs::remove_dir_all(&staging_root);
    assets.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(ImportedProjectAssetBatch {
        assets,
        finalized_roots,
    })
}

pub(super) fn rollback_project_asset_import(batch: &ImportedProjectAssetBatch) {
    for path in batch.finalized_roots.iter().rev() {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }
}

fn allocate_import_root(
    project_root: &Path,
    destination_directory: &Path,
    file_name: &str,
    is_directory: bool,
    occupied: &HashSet<String>,
) -> anyhow::Result<PathBuf> {
    let name_path = Path::new(file_name);
    let stem = name_path
        .file_stem()
        .and_then(|value| value.to_str())
        .context("Imported project asset source has no UTF-8 name")?;
    let extension = (!is_directory)
        .then(|| name_path.extension().and_then(|value| value.to_str()))
        .flatten();
    for suffix in 1u32.. {
        let name = if suffix == 1 {
            file_name.to_string()
        } else if let Some(extension) = extension {
            format!("{stem} ({suffix}).{extension}")
        } else {
            format!("{stem} ({suffix})")
        };
        let candidate = destination_directory.join(name);
        validate_relative_path(&candidate)?;
        let normalized = normalize_path(&candidate).replace('\\', "/");
        let key = normalized.to_lowercase();
        let collides = if is_directory {
            occupied
                .iter()
                .any(|path| path == &key || path.starts_with(&format!("{key}/")))
        } else {
            occupied.contains(&key)
        };
        if !collides && !project_root.join(&candidate).exists() {
            return Ok(candidate);
        }
    }
    unreachable!("u32 import path suffix space exhausted")
}

fn populate_project_asset_dependencies(
    assets_root: &Path,
    assets: &mut [ProjectAssetRef],
) -> anyhow::Result<()> {
    for asset in assets {
        let extension = Path::new(&asset.relative_path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !matches!(extension.to_ascii_lowercase().as_str(), "tmx" | "tsx") {
            continue;
        }
        asset.dependencies = read_tiled_dependencies(
            &assets_root.join(&asset.storage_key),
            Path::new(&asset.relative_path),
        )
        .with_context(|| {
            format!(
                "Failed to inspect Tiled dependency references. [path={}]",
                asset.relative_path
            )
        })?;
    }
    Ok(())
}

fn read_tiled_dependencies(
    source_path: &Path,
    project_relative_path: &Path,
) -> anyhow::Result<Vec<ProjectAssetDependency>> {
    let file = File::open(source_path).with_context(|| {
        format!(
            "Failed to open Tiled asset for dependency inspection. [path={}]",
            normalize_path(source_path)
        )
    })?;
    let mut reader = quick_xml::Reader::from_reader(BufReader::new(file));
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut dependencies = Vec::new();
    let mut seen = HashSet::new();
    loop {
        let event = reader.read_event_into(&mut buffer).with_context(|| {
            format!(
                "Failed to parse Tiled asset while reading dependencies. [path={}] [byte={}]",
                normalize_path(source_path),
                reader.buffer_position()
            )
        })?;
        match event {
            quick_xml::events::Event::Start(element) | quick_xml::events::Event::Empty(element) => {
                let kind = match element.name().as_ref() {
                    b"tileset" => Some("tileset"),
                    b"image" => Some("image"),
                    _ => None,
                };
                if let Some(kind) = kind {
                    for attribute in element.attributes() {
                        let attribute = attribute?;
                        if attribute.key.as_ref() != b"source" {
                            continue;
                        }
                        let raw = std::str::from_utf8(attribute.value.as_ref())?;
                        let source = quick_xml::escape::unescape(raw)?.into_owned();
                        if let Some(relative_path) =
                            resolve_tiled_dependency_path(project_relative_path, &source)?
                        {
                            let key = relative_path.to_lowercase();
                            if seen.insert(key) {
                                dependencies.push(ProjectAssetDependency {
                                    relative_path,
                                    kind: kind.to_string(),
                                });
                            }
                        }
                    }
                }
            }
            quick_xml::events::Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    dependencies.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(dependencies)
}

fn resolve_tiled_dependency_path(
    owner_path: &Path,
    raw_source: &str,
) -> anyhow::Result<Option<String>> {
    let source = raw_source.trim().replace('\\', "/");
    if source.is_empty()
        || source.contains("{{")
        || source.starts_with('/')
        || source.contains("://")
        || source.get(1..2) == Some(":")
    {
        return Ok(None);
    }
    let mut segments = owner_path
        .parent()
        .into_iter()
        .flat_map(Path::components)
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str().map(str::to_string),
            _ => None,
        })
        .collect::<Vec<_>>();
    for segment in source.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.pop().is_none() {
                    bail!(
                        "Tiled dependency escapes the project root. [owner={}] [source={raw_source}]",
                        normalize_path(owner_path)
                    );
                }
            }
            value => segments.push(value.to_string()),
        }
    }
    if segments.is_empty() {
        bail!(
            "Tiled dependency does not identify a project file. [owner={}] [source={raw_source}]",
            normalize_path(owner_path)
        );
    }
    Ok(Some(segments.join("/")))
}

fn collect_and_copy_assets(
    source_root: &Path,
    current_dir: &Path,
    destination_root: &Path,
) -> anyhow::Result<Vec<ProjectAssetRef>> {
    let mut result = Vec::new();
    let mut seen_paths = HashSet::new();
    collect_directory(
        source_root,
        current_dir,
        destination_root,
        Path::new(""),
        true,
        &mut seen_paths,
        &mut result,
    )?;
    result.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(result)
}

fn collect_directory(
    source_root: &Path,
    current_dir: &Path,
    destination_root: &Path,
    relative_prefix: &Path,
    skip_pack_metadata: bool,
    seen_paths: &mut HashSet<String>,
    result: &mut Vec<ProjectAssetRef>,
) -> anyhow::Result<()> {
    for entry in fs::read_dir(current_dir).with_context(|| {
        format!(
            "Failed to read imported content pack directory [path={}]",
            normalize_path(current_dir)
        )
    })? {
        let entry = entry.with_context(|| {
            format!(
                "Failed to read imported content pack entry [path={}]",
                normalize_path(current_dir)
            )
        })?;
        let file_type = entry.file_type().with_context(|| {
            format!(
                "Failed to inspect imported content pack entry [path={}]",
                normalize_path(&entry.path())
            )
        })?;
        if file_type.is_symlink() {
            bail!(
                "Imported content pack contains a symbolic link, which is not allowed. [path={}]",
                normalize_path(&entry.path())
            );
        }
        let path = entry.path();
        let source_relative = path
            .strip_prefix(source_root)
            .context("Imported asset escaped source root")?;
        if skip_pack_metadata && should_skip_import(source_relative) {
            continue;
        }
        let relative = relative_prefix.join(source_relative);
        validate_relative_path(&relative)?;
        if file_type.is_dir() {
            collect_directory(
                source_root,
                &path,
                destination_root,
                relative_prefix,
                skip_pack_metadata,
                seen_paths,
                result,
            )?;
        } else if file_type.is_file() {
            let relative_path = normalize_path(&relative).replace('\\', "/");
            if !seen_paths.insert(relative_path.to_lowercase()) {
                bail!(
                    "Imported content pack contains a case-insensitive path collision. [path={relative_path}]"
                );
            }
            let destination = destination_root.join(relative);
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!(
                        "Failed to create project asset directory [path={}]",
                        normalize_path(parent)
                    )
                })?;
            }
            let (size_bytes, sha256) = copy_and_hash(&path, &destination)?;
            result.push(ProjectAssetRef {
                relative_path: relative_path.clone(),
                media_type: infer_media_type(&path).to_string(),
                size_bytes,
                sha256,
                storage_key: relative_path,
                source_type: ProjectAssetSource::Imported,
                dependencies: Vec::new(),
            });
        }
    }
    Ok(())
}

fn should_skip_import(relative: &Path) -> bool {
    let normalized = normalize_path(relative).replace('\\', "/").to_lowercase();
    matches!(normalized.as_str(), "manifest.json" | "content.json")
        || normalized.starts_with("i18n/")
}

fn validate_relative_path(path: &Path) -> anyhow::Result<()> {
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        bail!(
            "Project asset path must stay relative to the project. [path={}]",
            normalize_path(path)
        );
    }
    Ok(())
}

fn copy_and_hash(source: &Path, destination: &Path) -> anyhow::Result<(u64, String)> {
    let mut input = File::open(source).with_context(|| {
        format!(
            "Failed to open imported asset [path={}]",
            normalize_path(source)
        )
    })?;
    let mut output = File::create(destination).with_context(|| {
        format!(
            "Failed to create project asset [path={}]",
            normalize_path(destination)
        )
    })?;
    let mut hasher = Sha256::new();
    let mut size = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = input.read(&mut buffer).with_context(|| {
            format!(
                "Failed to read imported asset [path={}]",
                normalize_path(source)
            )
        })?;
        if read == 0 {
            break;
        }
        output.write_all(&buffer[..read]).with_context(|| {
            format!(
                "Failed to write project asset [path={}]",
                normalize_path(destination)
            )
        })?;
        hasher.update(&buffer[..read]);
        size = size.saturating_add(read as u64);
    }
    output.sync_all().with_context(|| {
        format!(
            "Failed to flush project asset [path={}]",
            normalize_path(destination)
        )
    })?;
    Ok((size, format!("{:x}", hasher.finalize())))
}

pub(super) fn copy_project_assets_at_dir(
    projects_dir: &Path,
    source_key: &str,
    target_key: &str,
) -> anyhow::Result<()> {
    validate_draft_storage_key(source_key)?;
    validate_draft_storage_key(target_key)?;
    let source = projects_dir.join(source_key);
    if !source.exists() {
        return Ok(());
    }
    let target = projects_dir.join(target_key);
    if target.exists() {
        bail!(
            "Copied project asset directory already exists. [path={}]",
            normalize_path(&target)
        );
    }
    copy_directory_tree(&source, &target)
}

fn copy_directory_tree(source: &Path, target: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(target).with_context(|| {
        format!(
            "Failed to create copied project directory [path={}]",
            normalize_path(target)
        )
    })?;
    for entry in fs::read_dir(source).with_context(|| {
        format!(
            "Failed to read project directory [path={}]",
            normalize_path(source)
        )
    })? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            bail!(
                "Project asset directory contains a symbolic link. [path={}]",
                normalize_path(&entry.path())
            );
        }
        let destination = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory_tree(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), &destination).with_context(|| {
                format!(
                    "Failed to copy project asset [path={}]",
                    normalize_path(&entry.path())
                )
            })?;
        }
    }
    Ok(())
}

pub(super) fn delete_project_assets_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
) -> anyhow::Result<()> {
    validate_draft_storage_key(draft_storage_key)?;
    let path = projects_dir.join(draft_storage_key);
    if path.exists() {
        fs::remove_dir_all(&path).with_context(|| {
            format!(
                "Failed to delete project assets [draftStorageKey={draft_storage_key}] [path={}]",
                normalize_path(&path)
            )
        })?;
    }
    Ok(())
}

#[cfg(test)]
#[path = "../../tests/unit/domain/cp_maker/project_assets_tests.rs"]
mod tests;

fn infer_media_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "tmx" => "application/xml",
        "tsx" => "application/xml",
        "tbin" => "application/x-tbin",
        "json" => "application/json",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "mp3" => "audio/mpeg",
        _ => "application/octet-stream",
    }
}
