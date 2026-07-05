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
use self::types::{CopyCpMakerDraftRequest, CpMakerDraftRecord, CpMakerDraftSummary};

use crate::domain::app_paths::cp_maker_drafts_dir;

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

#[cfg(test)]
#[path = "../tests/unit/domain/cp_maker/mod.rs"]
mod tests;
