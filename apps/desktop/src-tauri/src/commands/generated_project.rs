use crate::domain::generated_project as domain_generated_project;
use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::domain::generated_project::types::{
    BuildGeneratedProjectMapAssetRequest, CopyGeneratedProjectDraftRequest,
    GeneratedProjectDraftError, GeneratedProjectDraftRecord, GeneratedProjectDraftSummary,
    GeneratedProjectExportRequest, GeneratedProjectExportResult,
};

#[tauri::command]
pub fn list_generated_project_drafts(
    app: tauri::AppHandle,
) -> Result<Vec<GeneratedProjectDraftSummary>, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "list_generated_project_drafts",
        domain_generated_project::list_generated_project_drafts(app),
    )
}

#[tauri::command]
pub fn load_generated_project_draft(
    app: tauri::AppHandle,
    draft_storage_key: String,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_generated_project_draft",
        domain_generated_project::load_generated_project_draft(app, draft_storage_key),
    )
}

#[tauri::command]
pub fn save_generated_project_draft(
    app: tauri::AppHandle,
    draft: GeneratedProjectDraftRecord,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_generated_project_draft",
        domain_generated_project::save_generated_project_draft(app, draft),
    )
}

#[tauri::command]
pub fn delete_generated_project_draft(
    app: tauri::AppHandle,
    draft_storage_key: String,
) -> Result<(), GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "delete_generated_project_draft",
        domain_generated_project::delete_generated_project_draft(app, draft_storage_key),
    )
}

#[tauri::command]
pub fn copy_generated_project_draft(
    app: tauri::AppHandle,
    request: CopyGeneratedProjectDraftRequest,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "copy_generated_project_draft",
        domain_generated_project::copy_generated_project_draft(app, request),
    )
}

#[tauri::command]
pub fn export_generated_project_pack(
    request: GeneratedProjectExportRequest,
) -> Result<GeneratedProjectExportResult, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "export_generated_project_pack",
        domain_generated_project::export_generated_project_pack(request),
    )
}

#[tauri::command]
pub fn build_generated_project_map_asset(
    request: BuildGeneratedProjectMapAssetRequest,
) -> Result<VirtualPreviewAsset, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "build_generated_project_map_asset",
        domain_generated_project::build_generated_project_map_asset(request),
    )
}

#[tauri::command]
pub fn import_generated_project_pack(
    mod_directory_path: String,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "import_generated_project_pack",
        domain_generated_project::import_generated_project_pack(&mod_directory_path,
        ),
    )
}
