mod builder;
mod export;
mod map_asset;
pub mod storage;
pub mod types;

#[allow(unused_imports)]
pub use self::builder::{build_content_json, build_manifest_json};
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

use std::path::PathBuf;
use tauri::Manager;

pub fn list_generated_project_drafts(
    app: tauri::AppHandle,
) -> Result<Vec<GeneratedProjectDraftSummary>, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir(&app, GeneratedProjectDraftOperation::List)?;
    list_generated_project_drafts_at_dir(&drafts_dir)
}

pub fn load_generated_project_draft(
    app: tauri::AppHandle,
    draft_storage_key: String,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir(&app, GeneratedProjectDraftOperation::Load)?;
    load_generated_project_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn save_generated_project_draft(
    app: tauri::AppHandle,
    draft: GeneratedProjectDraftRecord,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir(&app, GeneratedProjectDraftOperation::Save)?;
    save_generated_project_draft_at_dir(&drafts_dir, draft)
}

pub fn delete_generated_project_draft(
    app: tauri::AppHandle,
    draft_storage_key: String,
) -> Result<(), GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir(&app, GeneratedProjectDraftOperation::Delete)?;
    delete_generated_project_draft_at_dir(&drafts_dir, &draft_storage_key)
}

pub fn copy_generated_project_draft(
    app: tauri::AppHandle,
    request: CopyGeneratedProjectDraftRequest,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let drafts_dir = generated_project_drafts_dir(&app, GeneratedProjectDraftOperation::Copy)?;
    copy_generated_project_draft_at_dir(&drafts_dir, request)
}

fn generated_project_drafts_dir(
    app: &tauri::AppHandle,
    operation: GeneratedProjectDraftOperation,
) -> Result<PathBuf, GeneratedProjectDraftError> {
    let config_dir = app.path().app_config_dir().map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            operation,
            format!("Failed to resolve app config directory: {error}"),
        )
    })?;
    Ok(config_dir.join("generated-project").join("drafts"))
}

#[cfg(test)]
mod tests;
