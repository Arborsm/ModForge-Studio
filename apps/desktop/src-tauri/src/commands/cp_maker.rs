use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::domain::cp_maker as domain_cp_maker;
use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, CopyCpMakerDraftRequest, CpMakerDraftError, CpMakerDraftRecord,
    CpMakerDraftSummary, CpMakerExportRequest, CpMakerExportResult,
};

#[tauri::command]
pub fn list_cp_maker_drafts() -> Result<Vec<CpMakerDraftSummary>, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "list_cp_maker_drafts",
        domain_cp_maker::list_cp_maker_drafts(),
    )
}

#[tauri::command]
pub fn load_cp_maker_draft(
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_cp_maker_draft",
        domain_cp_maker::load_cp_maker_draft(draft_storage_key),
    )
}

#[tauri::command]
pub fn save_cp_maker_draft(
    draft: CpMakerDraftRecord,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_cp_maker_draft",
        domain_cp_maker::save_cp_maker_draft(draft),
    )
}

#[tauri::command]
pub fn delete_cp_maker_draft(draft_storage_key: String) -> Result<(), CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "delete_cp_maker_draft",
        domain_cp_maker::delete_cp_maker_draft(draft_storage_key),
    )
}

#[tauri::command]
pub fn copy_cp_maker_draft(
    request: CopyCpMakerDraftRequest,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "copy_cp_maker_draft",
        domain_cp_maker::copy_cp_maker_draft(request),
    )
}

#[tauri::command]
pub fn export_cp_maker_pack(
    request: CpMakerExportRequest,
) -> Result<CpMakerExportResult, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "export_cp_maker_pack",
        domain_cp_maker::export_cp_maker_pack(request),
    )
}

#[tauri::command]
pub fn build_cp_maker_map_asset(
    request: BuildCpMakerMapAssetRequest,
) -> Result<VirtualPreviewAsset, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "build_cp_maker_map_asset",
        domain_cp_maker::build_cp_maker_map_asset(request),
    )
}

#[tauri::command]
pub fn import_cp_maker_pack(
    mod_directory_path: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "import_cp_maker_pack",
        domain_cp_maker::import_cp_maker_pack(&mod_directory_path),
    )
}
