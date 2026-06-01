use crate::domain::resource_registry::{self, ResourceRegistry};

#[tauri::command]
pub fn load_resource_registry(
    root_path: String,
    locale: Option<String>,
) -> Result<ResourceRegistry, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_resource_registry",
        resource_registry::load_resource_registry(root_path, locale),
    )
}
