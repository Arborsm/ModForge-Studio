use crate::AppHandle;
use crate::domain;
use crate::domain::mods::{
    ModAssetIndex, ModProjectDetail, ModProjectSummary, SaveModI18nFilesRequest,
    SaveModI18nFilesResult,
};
use crate::host_runtime::HostCommandResource;
use crate::host_runtime::{DispatchContext, HostCommand, ResolvedCommandOrResponse, ok};
use host_command_macros::host_command;
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

#[host_command(io)]
pub async fn scan_mod_projects(
    app: AppHandle,
    root_path: String,
) -> Result<Vec<ModProjectSummary>, String> {
    domain::mods::scan_mod_projects(root_path)
}

#[host_command(io)]
pub async fn scan_mod_asset_index(
    app: AppHandle,
    root_path: String,
) -> Result<ModAssetIndex, String> {
    domain::mods::scan_mod_asset_index(root_path)
}

#[host_command(io)]
pub async fn load_mod_project(app: AppHandle, path: String) -> Result<ModProjectDetail, String> {
    domain::mods::load_mod_project(path)
}

#[host_command(io)]
pub async fn inspect_mod_archive(app: AppHandle, path: String) -> Result<ModProjectDetail, String> {
    domain::mods::inspect_mod_archive(path)
}

// `save_mod_i18n_files` stays hand-written: its resource lock is computed at
// runtime from the payload (canonical project root), which the macro does not
// model.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModI18nFilesParams {
    pub request: SaveModI18nFilesRequest,
}

impl HostCommand for SaveModI18nFilesParams {
    const NAME: &'static str = "save_mod_i18n_files";

    fn resolve(_ctx: &DispatchContext, id: Value, params: Self) -> ResolvedCommandOrResponse {
        let source_path = params.request.source_path.clone();
        Self::mutation_with_resource_resolver(
            id,
            move || {
                let canonical_root = domain::mods::canonical_mod_project_root(&source_path)
                    .map_err(|error| json!(error.to_string()))?;
                Ok(vec![HostCommandResource::ModProjectRoot(Arc::from(
                    canonical_root.to_string_lossy().as_ref(),
                ))])
            },
            move || ok(domain::mods::save_mod_i18n_files(params.request)),
        )
    }
}

#[tauri::command]
pub async fn save_mod_i18n_files(
    app: AppHandle,
    request: SaveModI18nFilesRequest,
) -> Result<SaveModI18nFilesResult, String> {
    crate::host_runtime::execute(app, SaveModI18nFilesParams { request }).await
}
