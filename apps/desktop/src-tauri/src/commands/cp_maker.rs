use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, CopyCpMakerDraftRequest, CpMakerDraftError, CpMakerDraftRecord,
    CpMakerDraftSummary, CpMakerExportRequest, CpMakerExportResult,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub fn list_cp_maker_drafts(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<CpMakerDraftSummary>, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "list_cp_maker_drafts",
        json!({}),
    )
}

#[tauri::command]
pub fn load_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "load_cp_maker_draft",
        json!({ "draftStorageKey": draft_storage_key }),
    )
}

#[tauri::command]
pub fn save_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft: CpMakerDraftRecord,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "save_cp_maker_draft",
        json!({ "draft": draft }),
    )
}

#[tauri::command]
pub fn delete_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft_storage_key: String,
) -> Result<(), CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "delete_cp_maker_draft",
        json!({ "draftStorageKey": draft_storage_key }),
    )
}

#[tauri::command]
pub fn copy_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CopyCpMakerDraftRequest,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "copy_cp_maker_draft",
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn export_cp_maker_pack(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CpMakerExportRequest,
) -> Result<CpMakerExportResult, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "export_cp_maker_pack",
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn build_cp_maker_map_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: BuildCpMakerMapAssetRequest,
) -> Result<VirtualPreviewAsset, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "build_cp_maker_map_asset",
        json!({ "request": request }),
    )
}

#[tauri::command]
pub fn import_cp_maker_pack(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    mod_directory_path: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state,
        "import_cp_maker_pack",
        json!({ "modDirectoryPath": mod_directory_path }),
    )
}
