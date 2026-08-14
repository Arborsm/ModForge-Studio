use crate::AppHandle;
use crate::domain;
use crate::domain::resource_registry::ResourceRegistry;
use host_command_macros::host_command;

#[host_command(io)]
pub async fn load_resource_registry(
    app: AppHandle,
    root_path: String,
    locale: Option<String>,
) -> Result<ResourceRegistry, String> {
    domain::resource_registry::load_resource_registry(root_path, locale)
}
