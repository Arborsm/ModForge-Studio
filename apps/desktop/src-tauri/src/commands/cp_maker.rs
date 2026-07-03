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
pub async fn list_cp_maker_drafts(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<CpMakerDraftSummary>, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(list_cp_maker_drafts),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn load_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_cp_maker_draft),
        json!({ "draftStorageKey": draft_storage_key }),
    )
    .await
}

#[tauri::command]
pub async fn save_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft: CpMakerDraftRecord,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_cp_maker_draft),
        json!({ "draft": draft }),
    )
    .await
}

#[tauri::command]
pub async fn delete_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft_storage_key: String,
) -> Result<(), CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(delete_cp_maker_draft),
        json!({ "draftStorageKey": draft_storage_key }),
    )
    .await
}

#[tauri::command]
pub async fn copy_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CopyCpMakerDraftRequest,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(copy_cp_maker_draft),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn export_cp_maker_pack(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: CpMakerExportRequest,
) -> Result<CpMakerExportResult, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(export_cp_maker_pack),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn build_cp_maker_map_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: BuildCpMakerMapAssetRequest,
) -> Result<VirtualPreviewAsset, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(build_cp_maker_map_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn import_cp_maker_pack(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    mod_directory_path: String,
) -> Result<CpMakerDraftRecord, CpMakerDraftError> {
    crate::commands::runtime::execute_tauri_command_typed_error(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(import_cp_maker_pack),
        json!({ "modDirectoryPath": mod_directory_path }),
    )
    .await
}
