use crate::domain::mods as domain_mods;
pub use crate::domain::mods::SaveModProjectRequest;
use crate::domain::mods::{
    ModAssetIndex, ModProjectDetail, ModProjectSummary, SaveModProjectResult,
};

#[tauri::command]
pub fn scan_mod_projects(root_path: String) -> Result<Vec<ModProjectSummary>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_mod_projects",
        domain_mods::scan_mod_projects(root_path),
    )
}

#[tauri::command]
pub fn scan_mod_asset_index(root_path: String) -> Result<ModAssetIndex, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "scan_mod_asset_index",
        domain_mods::scan_mod_asset_index(root_path),
    )
}

#[tauri::command]
pub fn load_mod_project(path: String) -> Result<ModProjectDetail, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_mod_project",
        domain_mods::load_mod_project(path),
    )
}

#[tauri::command]
pub fn save_mod_project(request: SaveModProjectRequest) -> Result<SaveModProjectResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "save_mod_project",
        domain_mods::save_mod_project(request),
    )
}
