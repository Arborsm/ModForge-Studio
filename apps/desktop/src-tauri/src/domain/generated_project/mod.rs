mod builder;
mod export;
mod map_asset;
pub mod storage;
pub mod types;

pub use self::builder::import_generated_project_pack;
pub use self::export::export_generated_project_pack;
pub use self::map_asset::build_generated_project_map_asset;
use self::storage::{
    copy_generated_project_draft_at_dir, delete_generated_project_draft_at_dir,
    list_generated_project_drafts_at_dir, load_generated_project_draft_at_dir,
    save_generated_project_draft_at_dir,
};
use self::types::{
    CopyGeneratedProjectDraftRequest, GeneratedProjectDraftError, GeneratedProjectDraftErrorCode,
    GeneratedProjectDraftOperation, GeneratedProjectDraftRecord, GeneratedProjectDraftSummary,
};

use crate::domain::app_paths::generated_project_drafts_dir;

pub fn list_generated_project_drafts() -> Result<Vec<GeneratedProjectDraftSummary>, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            GeneratedProjectDraftOperation::List,
            error,
        )
    })?;
    list_generated_project_drafts_at_dir(&drafts_dir)
}

pub fn load_generated_project_draft(
    draft_storage_key: String,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            GeneratedProjectDraftOperation::Load,
            error,
        )
    })?;
    load_generated_project_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn save_generated_project_draft(
    draft: GeneratedProjectDraftRecord,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            GeneratedProjectDraftOperation::Save,
            error,
        )
    })?;
    save_generated_project_draft_at_dir(&drafts_dir, draft)
}

pub fn delete_generated_project_draft(
    draft_storage_key: String,
) -> Result<(), GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            GeneratedProjectDraftOperation::Delete,
            error,
        )
    })?;
    delete_generated_project_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn copy_generated_project_draft(
    request: CopyGeneratedProjectDraftRequest,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            GeneratedProjectDraftOperation::Copy,
            error,
        )
    })?;
    copy_generated_project_draft_at_dir(&drafts_dir, request)
}

#[cfg(test)]
mod tests;
