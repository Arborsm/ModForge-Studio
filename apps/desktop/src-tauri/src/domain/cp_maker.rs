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
    CopyCpMakerDraftRequest, CpMakerDraftError, CpMakerDraftErrorCode, CpMakerDraftOperation,
    CpMakerDraftRecord, CpMakerDraftSummary,
};

use crate::domain::app_paths::cp_maker_drafts_dir;

pub fn list_cp_maker_drafts() -> Result<Vec<CpMakerDraftSummary>, CpMakerDraftError> {
    let drafts_dir = cp_maker_drafts_dir().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::List,
            error,
        )
    })?;
    list_cp_maker_drafts_at_dir(&drafts_dir)
}

pub fn load_cp_maker_draft(
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    let drafts_dir = cp_maker_drafts_dir().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Load,
            error,
        )
    })?;
    load_cp_maker_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn save_cp_maker_draft(
    draft: CpMakerDraftRecord,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    let drafts_dir = cp_maker_drafts_dir().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Save,
            error,
        )
    })?;
    save_cp_maker_draft_at_dir(&drafts_dir, draft)
}

pub fn delete_cp_maker_draft(draft_storage_key: String) -> Result<(), CpMakerDraftError> {
    let drafts_dir = cp_maker_drafts_dir().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Delete,
            error,
        )
    })?;
    delete_cp_maker_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn copy_cp_maker_draft(
    request: CopyCpMakerDraftRequest,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    let drafts_dir = cp_maker_drafts_dir().map_err(|error| {
        CpMakerDraftError::new(
            CpMakerDraftErrorCode::ReadFailed,
            CpMakerDraftOperation::Copy,
            error,
        )
    })?;
    copy_cp_maker_draft_at_dir(&drafts_dir, request)
}

#[cfg(test)]
mod tests;
