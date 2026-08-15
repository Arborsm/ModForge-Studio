pub(crate) mod builder;
pub(crate) mod commands;
mod export;
mod map_asset;
mod project_assets;
pub mod storage;
pub mod types;

pub use self::map_asset::build_cp_maker_map_asset;
use self::storage::{
    copy_cp_maker_draft_at_dir, delete_cp_maker_draft_at_dir, list_cp_maker_drafts_at_dir,
    load_cp_maker_draft_at_dir, save_cp_maker_draft_at_dir,
};
use self::types::{
    CopyCpMakerDraftRequest, CpMakerDraftRecord, CpMakerDraftSummary, CpMakerExportRequest,
    CpMakerExportResult, CpMakerSession, DeleteProjectAssetRequest, ImportProjectAssetsRequest,
    ProjectAssetPayload, ProjectAssetRef, ReadProjectAssetRequest, RenameProjectAssetRequest,
    WriteProjectAssetRequest, WriteProjectAssetsRequest,
};
use base64::Engine;

use crate::domain::app_paths::cp_maker_projects_dir;
use crate::domain::app_paths::{cp_maker_drafts_dir, cp_maker_session_path};
use anyhow::Context;
use std::fs;
use std::path::Path;

pub fn list_cp_maker_drafts() -> anyhow::Result<Vec<CpMakerDraftSummary>> {
    let drafts_dir = cp_maker_drafts_dir()?;
    list_cp_maker_drafts_at_dir(&drafts_dir)
}

pub fn load_cp_maker_draft(draft_storage_key: String) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    load_cp_maker_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn save_cp_maker_draft(draft: CpMakerDraftRecord) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    save_cp_maker_draft_at_dir(&drafts_dir, draft)
}

pub fn delete_cp_maker_draft(draft_storage_key: String) -> anyhow::Result<()> {
    let drafts_dir = cp_maker_drafts_dir()?;
    delete_cp_maker_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn copy_cp_maker_draft(request: CopyCpMakerDraftRequest) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    copy_cp_maker_draft_at_dir(&drafts_dir, request)
}

pub fn import_cp_maker_pack(mod_directory_path: &str) -> anyhow::Result<CpMakerDraftRecord> {
    let mut draft = builder::import_cp_maker_pack(mod_directory_path)?;
    let projects_dir = cp_maker_projects_dir()?;
    draft.project_assets = project_assets::import_project_assets_at_dir(
        Path::new(mod_directory_path),
        &projects_dir,
        &draft.draft_storage_key,
    )?;
    let draft_storage_key = draft.draft_storage_key.clone();
    let drafts_dir = cp_maker_drafts_dir()?;
    match save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        Ok(saved) => Ok(saved),
        Err(error) => {
            let _ = project_assets::delete_project_assets_at_dir(&projects_dir, &draft_storage_key);
            Err(error)
        }
    }
}

pub fn export_cp_maker_pack(request: CpMakerExportRequest) -> anyhow::Result<CpMakerExportResult> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let asset_root =
        project_assets::project_assets_dir(&cp_maker_projects_dir()?, &request.draft_storage_key);
    export::export_cp_maker_pack_at_dir(request, &asset_root, &draft.project_assets)
}

pub fn read_cp_maker_project_asset(
    request: ReadProjectAssetRequest,
) -> anyhow::Result<ProjectAssetPayload> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    project_assets::read_project_asset_at_dir(
        &cp_maker_projects_dir()?,
        &request.draft_storage_key,
        &request.relative_path,
        &draft.project_assets,
    )
}

pub fn load_cp_maker_project_map_asset(
    request: ReadProjectAssetRequest,
) -> anyhow::Result<crate::domain::assets::MapAssetContent> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    load_cp_maker_project_map_asset_at_dir(
        &cp_maker_projects_dir()?,
        &request.draft_storage_key,
        &request.relative_path,
        &draft.project_assets,
    )
}

fn load_cp_maker_project_map_asset_at_dir(
    projects_dir: &Path,
    draft_storage_key: &str,
    relative_path: &str,
    assets: &[ProjectAssetRef],
) -> anyhow::Result<crate::domain::assets::MapAssetContent> {
    let (asset, path, bytes) = project_assets::read_verified_project_asset_at_dir(
        projects_dir,
        draft_storage_key,
        relative_path,
        assets,
    )?;
    let document =
        crate::infrastructure::game_formats::parse_map_asset(&bytes, &path, &asset.relative_path)?;
    let format = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    Ok(crate::domain::assets::MapAssetContent {
        name: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Unnamed")
            .to_string(),
        format,
        absolute_path: path.to_string_lossy().into_owned(),
        relative_path: asset.relative_path,
        content: serde_json::to_string(&document)
            .context("Failed to serialize project map document")?,
    })
}

pub fn write_cp_maker_project_asset(
    request: WriteProjectAssetRequest,
) -> anyhow::Result<ProjectAssetRef> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let mut draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&request.bytes_base64)
        .with_context(|| {
            format!(
                "Project asset payload is not valid base64. [path={}]",
                request.relative_path
            )
        })?;
    let (asset, destination, backup) = project_assets::write_project_asset_at_dir(
        &cp_maker_projects_dir()?,
        &request.draft_storage_key,
        &request.relative_path,
        &request.media_type,
        &bytes,
        request.source_type,
        &draft.project_assets,
    )?;
    draft.project_assets.retain(|current| {
        !current
            .relative_path
            .eq_ignore_ascii_case(&asset.relative_path)
    });
    draft.project_assets.push(asset.clone());
    draft
        .project_assets
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    if let Err(error) = save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        project_assets::rollback_project_asset_write(&destination, backup.as_deref());
        return Err(error);
    }
    project_assets::commit_project_asset_write(backup)?;
    Ok(asset)
}

pub fn write_cp_maker_project_assets(
    request: WriteProjectAssetsRequest,
) -> anyhow::Result<Vec<ProjectAssetRef>> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let projects_dir = cp_maker_projects_dir()?;
    let mut draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let inputs = request
        .assets
        .into_iter()
        .map(|entry| {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&entry.bytes_base64)
                .with_context(|| {
                    format!(
                        "Project asset payload is not valid base64. [path={}]",
                        entry.relative_path
                    )
                })?;
            Ok(project_assets::ProjectAssetBatchWriteInput {
                relative_path: entry.relative_path,
                media_type: entry.media_type,
                bytes,
                source_type: entry.source_type,
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    let batch = project_assets::write_project_assets_at_dir(
        &projects_dir,
        &request.draft_storage_key,
        inputs,
        &draft.project_assets,
    )?;
    for asset in &batch.assets {
        draft.project_assets.retain(|current| {
            !current
                .relative_path
                .eq_ignore_ascii_case(&asset.relative_path)
        });
        draft.project_assets.push(asset.clone());
    }
    draft
        .project_assets
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    if let Err(error) = save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        project_assets::rollback_project_asset_batch(&batch);
        return Err(error);
    }
    let assets = batch.assets.clone();
    project_assets::commit_project_asset_batch(batch)?;
    Ok(assets)
}

pub fn import_cp_maker_project_assets(
    request: ImportProjectAssetsRequest,
) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let projects_dir = cp_maker_projects_dir()?;
    let mut draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let batch = project_assets::import_project_asset_paths_at_dir(
        &projects_dir,
        &request.draft_storage_key,
        &request.source_paths,
        &request.destination_directory,
        &draft.project_assets,
    )?;
    draft.project_assets.extend(batch.assets.iter().cloned());
    draft
        .project_assets
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    match save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        Ok(saved) => Ok(saved),
        Err(error) => {
            project_assets::rollback_project_asset_import(&batch);
            Err(error)
        }
    }
}

pub fn rename_cp_maker_project_asset(
    request: RenameProjectAssetRequest,
) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let projects_dir = cp_maker_projects_dir()?;
    let mut draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let old_path = request.relative_path.replace('\\', "/");
    let (renamed, source, destination) = project_assets::rename_project_asset_at_dir(
        &projects_dir,
        &request.draft_storage_key,
        &request.relative_path,
        &request.new_relative_path,
        &draft.project_assets,
    )?;
    replace_asset_references(&mut draft, &old_path, Some(&renamed.relative_path));
    draft
        .project_assets
        .retain(|asset| !asset.relative_path.eq_ignore_ascii_case(&old_path));
    for asset in &mut draft.project_assets {
        for dependency in &mut asset.dependencies {
            if dependency.relative_path.eq_ignore_ascii_case(&old_path) {
                dependency.relative_path = renamed.relative_path.clone();
            }
        }
    }
    draft.project_assets.push(renamed);
    draft
        .project_assets
        .sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    match save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        Ok(saved) => Ok(saved),
        Err(error) => {
            let _ = fs::rename(&destination, &source);
            Err(error)
        }
    }
}

pub fn delete_cp_maker_project_asset(
    request: DeleteProjectAssetRequest,
) -> anyhow::Result<CpMakerDraftRecord> {
    let drafts_dir = cp_maker_drafts_dir()?;
    let projects_dir = cp_maker_projects_dir()?;
    let mut draft = load_cp_maker_draft_at_dir(&drafts_dir, &request.draft_storage_key)?;
    let deleted_path = request.relative_path.replace('\\', "/");
    let (source, staged) = project_assets::stage_project_asset_delete_at_dir(
        &projects_dir,
        &request.draft_storage_key,
        &request.relative_path,
        &draft.project_assets,
    )?;
    replace_asset_references(&mut draft, &deleted_path, None);
    draft
        .project_assets
        .retain(|asset| !asset.relative_path.eq_ignore_ascii_case(&deleted_path));
    for asset in &mut draft.project_assets {
        asset
            .dependencies
            .retain(|dependency| !dependency.relative_path.eq_ignore_ascii_case(&deleted_path));
    }
    match save_cp_maker_draft_at_dir(&drafts_dir, draft) {
        Ok(saved) => {
            fs::remove_file(&staged).with_context(|| {
                format!(
                    "Failed to finalize project asset deletion [path={}]",
                    staged.display()
                )
            })?;
            Ok(saved)
        }
        Err(error) => {
            let _ = fs::rename(&staged, &source);
            Err(error)
        }
    }
}

fn replace_asset_references(
    draft: &mut CpMakerDraftRecord,
    old_path: &str,
    new_path: Option<&str>,
) {
    if let Some(patches) = draft
        .serialized_change_registry
        .get_mut("patches")
        .and_then(serde_json::Value::as_array_mut)
    {
        for patch in patches {
            let Some(object) = patch.as_object_mut() else {
                continue;
            };
            let matches = object
                .get("fromFile")
                .and_then(serde_json::Value::as_str)
                .is_some_and(|value| value.replace('\\', "/").eq_ignore_ascii_case(old_path));
            if matches {
                if let Some(replacement) = new_path {
                    object.insert(
                        "fromFile".to_string(),
                        serde_json::Value::String(replacement.to_string()),
                    );
                } else {
                    object.remove("fromFile");
                }
            }
        }
    }
    for location in &mut draft.custom_locations {
        if location
            .from_map_file
            .as_deref()
            .is_some_and(|value| value.replace('\\', "/").eq_ignore_ascii_case(old_path))
        {
            location.from_map_file = new_path.map(str::to_string);
        }
    }
}

pub fn load_cp_maker_session() -> anyhow::Result<CpMakerSession> {
    let path = cp_maker_session_path()?;
    load_cp_maker_session_at_path(&path)
}

pub(crate) fn load_cp_maker_session_at_path(path: &Path) -> anyhow::Result<CpMakerSession> {
    if !path.is_file() {
        return Ok(CpMakerSession::default());
    }
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read cp-maker session [path={}]", path.display()))?;
    let session = serde_json::from_str::<CpMakerSession>(&content)
        .with_context(|| format!("Failed to parse cp-maker session [path={}]", path.display()))?;
    Ok(normalize_session(session))
}

pub fn save_cp_maker_session(session: CpMakerSession) -> anyhow::Result<CpMakerSession> {
    let path = cp_maker_session_path()?;
    save_cp_maker_session_at_path(&path, session)
}

pub(crate) fn save_cp_maker_session_at_path(
    path: &Path,
    session: CpMakerSession,
) -> anyhow::Result<CpMakerSession> {
    let session = normalize_session(session);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create cp-maker directory [path={}]",
                parent.display()
            )
        })?;
    }
    let temp_path = path.with_extension("tmp");
    let content =
        serde_json::to_string_pretty(&session).context("Failed to serialize cp-maker session")?;
    fs::write(&temp_path, format!("{content}\n")).with_context(|| {
        format!(
            "Failed to write cp-maker session [path={}]",
            temp_path.display()
        )
    })?;
    fs::rename(&temp_path, &path).with_context(|| {
        format!(
            "Failed to finalize cp-maker session [path={}]",
            path.display()
        )
    })?;
    Ok(session)
}

fn normalize_session(session: CpMakerSession) -> CpMakerSession {
    let normalize = |value: Option<String>| {
        value
            .map(|entry| entry.trim().to_string())
            .filter(|entry| !entry.is_empty())
    };
    CpMakerSession {
        active_draft_key: normalize(session.active_draft_key),
        active_generated_draft_key: normalize(session.active_generated_draft_key),
    }
}

#[cfg(test)]
#[path = "../../tests/unit/domain/cp_maker/mod.rs"]
mod tests;
