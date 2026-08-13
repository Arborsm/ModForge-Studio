use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, BuildCpMakerMapAssetResult, CopyCpMakerDraftRequest,
    CpMakerDraftRecord, CpMakerDraftSummary, CpMakerExportRequest, CpMakerExportResult,
    CpMakerSession, DeleteProjectAssetRequest, ImportProjectAssetsRequest, ProjectAssetPayload,
    ProjectAssetRef, ReadProjectAssetRequest, RenameProjectAssetRequest, WriteProjectAssetRequest,
    WriteProjectAssetsRequest,
};
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn list_cp_maker_drafts(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<Vec<CpMakerDraftSummary>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(list_cp_maker_drafts),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn load_cp_maker_session(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
) -> Result<CpMakerSession, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_cp_maker_session),
        json!({}),
    )
    .await
}

#[tauri::command]
pub async fn save_cp_maker_session(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    session: CpMakerSession,
) -> Result<CpMakerSession, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(save_cp_maker_session),
        json!({ "session": session }),
    )
    .await
}

#[tauri::command]
pub async fn load_cp_maker_draft(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<(), String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<CpMakerExportResult, String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<BuildCpMakerMapAssetResult, String> {
    crate::commands::runtime::execute_tauri_command(
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
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(import_cp_maker_pack),
        json!({ "modDirectoryPath": mod_directory_path }),
    )
    .await
}

#[tauri::command]
pub async fn read_cp_maker_project_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ReadProjectAssetRequest,
) -> Result<ProjectAssetPayload, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(read_cp_maker_project_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn load_cp_maker_project_map_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ReadProjectAssetRequest,
) -> Result<crate::domain::assets::MapAssetContent, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(load_cp_maker_project_map_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn write_cp_maker_project_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: WriteProjectAssetRequest,
) -> Result<ProjectAssetRef, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(write_cp_maker_project_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn write_cp_maker_project_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: WriteProjectAssetsRequest,
) -> Result<Vec<ProjectAssetRef>, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(write_cp_maker_project_assets),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn import_cp_maker_project_assets(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: ImportProjectAssetsRequest,
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(import_cp_maker_project_assets),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn rename_cp_maker_project_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: RenameProjectAssetRequest,
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(rename_cp_maker_project_asset),
        json!({ "request": request }),
    )
    .await
}

#[tauri::command]
pub async fn delete_cp_maker_project_asset(
    app: tauri::AppHandle<AppRuntime>,
    debug_logging_state: State<'_, DebugLoggingState>,
    request: DeleteProjectAssetRequest,
) -> Result<CpMakerDraftRecord, String> {
    crate::commands::runtime::execute_tauri_command(
        AppHandle::from_tauri(app),
        debug_logging_state.inner().clone(),
        crate::host_command_name!(delete_cp_maker_project_asset),
        json!({ "request": request }),
    )
    .await
}
