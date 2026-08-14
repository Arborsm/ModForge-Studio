use crate::AppHandle;
use crate::domain;
use crate::domain::cp_maker::types::{
    BuildCpMakerMapAssetRequest, BuildCpMakerMapAssetResult, CopyCpMakerDraftRequest,
    CpMakerDraftRecord, CpMakerDraftSummary, CpMakerExportRequest, CpMakerExportResult,
    CpMakerSession, DeleteProjectAssetRequest, ImportProjectAssetsRequest, ProjectAssetPayload,
    ProjectAssetRef, ReadProjectAssetRequest, RenameProjectAssetRequest, WriteProjectAssetRequest,
    WriteProjectAssetsRequest,
};
use host_command_macros::host_command;

#[host_command(io)]
pub async fn list_cp_maker_drafts(app: AppHandle) -> Result<Vec<CpMakerDraftSummary>, String> {
    domain::cp_maker::list_cp_maker_drafts()
}

#[host_command(io, resources(CpMakerDrafts))]
pub async fn load_cp_maker_session(app: AppHandle) -> Result<CpMakerSession, String> {
    domain::cp_maker::load_cp_maker_session()
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn save_cp_maker_session(
    app: AppHandle,
    session: CpMakerSession,
) -> Result<CpMakerSession, String> {
    domain::cp_maker::save_cp_maker_session(session)
}

#[host_command(io)]
pub async fn load_cp_maker_draft(
    app: AppHandle,
    draft_storage_key: String,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::load_cp_maker_draft(draft_storage_key)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn save_cp_maker_draft(
    app: AppHandle,
    draft: CpMakerDraftRecord,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::save_cp_maker_draft(draft)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn delete_cp_maker_draft(
    app: AppHandle,
    draft_storage_key: String,
) -> Result<(), String> {
    domain::cp_maker::delete_cp_maker_draft(draft_storage_key)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn copy_cp_maker_draft(
    app: AppHandle,
    request: CopyCpMakerDraftRequest,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::copy_cp_maker_draft(request)
}

#[host_command(mutation, resources(ModProject, CpMakerDrafts))]
pub async fn export_cp_maker_pack(
    app: AppHandle,
    request: CpMakerExportRequest,
) -> Result<CpMakerExportResult, String> {
    domain::cp_maker::export_cp_maker_pack(request)
}

// Pure serialization of an in-memory map document into preview bytes: no
// persistent state is touched, so the io lane (parse/transform) fits and no
// resource lock is needed.
#[host_command(io)]
pub async fn build_cp_maker_map_asset(
    app: AppHandle,
    request: BuildCpMakerMapAssetRequest,
) -> Result<BuildCpMakerMapAssetResult, String> {
    domain::cp_maker::build_cp_maker_map_asset(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn import_cp_maker_pack(
    app: AppHandle,
    mod_directory_path: String,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::import_cp_maker_pack(&mod_directory_path)
}

#[host_command(io, resources(CpMakerDrafts))]
pub async fn read_cp_maker_project_asset(
    app: AppHandle,
    request: ReadProjectAssetRequest,
) -> Result<ProjectAssetPayload, String> {
    domain::cp_maker::read_cp_maker_project_asset(request)
}

#[host_command(io, resources(CpMakerDrafts))]
pub async fn load_cp_maker_project_map_asset(
    app: AppHandle,
    request: ReadProjectAssetRequest,
) -> Result<crate::domain::assets::MapAssetContent, String> {
    domain::cp_maker::load_cp_maker_project_map_asset(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn write_cp_maker_project_asset(
    app: AppHandle,
    request: WriteProjectAssetRequest,
) -> Result<ProjectAssetRef, String> {
    domain::cp_maker::write_cp_maker_project_asset(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn write_cp_maker_project_assets(
    app: AppHandle,
    request: WriteProjectAssetsRequest,
) -> Result<Vec<ProjectAssetRef>, String> {
    domain::cp_maker::write_cp_maker_project_assets(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn import_cp_maker_project_assets(
    app: AppHandle,
    request: ImportProjectAssetsRequest,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::import_cp_maker_project_assets(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn rename_cp_maker_project_asset(
    app: AppHandle,
    request: RenameProjectAssetRequest,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::rename_cp_maker_project_asset(request)
}

#[host_command(mutation, resources(CpMakerDrafts))]
pub async fn delete_cp_maker_project_asset(
    app: AppHandle,
    request: DeleteProjectAssetRequest,
) -> Result<CpMakerDraftRecord, String> {
    domain::cp_maker::delete_cp_maker_project_asset(request)
}
