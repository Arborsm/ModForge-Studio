mod builder;
mod export;
mod map_asset;
pub mod storage;
pub mod types;

pub use self::builder::import_cp_maker_pack;
pub use self::export::export_cp_maker_pack;
pub use self::map_asset::build_cp_maker_map_asset;
use self::storage::{
    copy_cp_maker_draft_at_dir, delete_cp_maker_draft_at_dir, list_cp_maker_drafts_at_dir,
    load_cp_maker_draft_at_dir, save_cp_maker_draft_at_dir,
};
use self::types::{
    CopyCpMakerDraftRequest, CpMakerDraftRecord, CpMakerDraftSummary, CpMakerSession,
};

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
#[path = "../tests/unit/domain/cp_maker/mod.rs"]
mod tests;
