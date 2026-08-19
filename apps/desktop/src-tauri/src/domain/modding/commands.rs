//! Host command bindings for the modding domain (compat plugin listing).

use crate::AppHandle;
use crate::domain;
use crate::domain::modding::compat_plugin::{CompatPluginSummary, resolve_plugin_roots};
use host_command_macros::host_command;
use tauri::Manager;

/// Lists installed compat plugins with inline i18n bundles and page ids.
///
/// Plugin roots are resolved from the build configuration: dev build uses the
/// source-tree `compat-plugins/` directory; packaged build also scans the
/// bundled resource directory and the user app-data directory. Results are
/// cached for the process lifetime.
#[host_command(io)]
pub async fn list_compat_plugins(app: AppHandle) -> Result<Vec<CompatPluginSummary>, String> {
    let mut roots = resolve_plugin_roots(None);
    // Packaged build: also scan resource_dir and app_data_dir for compat-plugins.
    if let Some(tauri_app) = app.as_tauri() {
        if let Ok(resource_dir) = tauri_app.path().resource_dir() {
            let plugin_dir = resource_dir.join("compat-plugins");
            if plugin_dir.is_dir() && !roots.contains(&plugin_dir) {
                roots.push(plugin_dir);
            }
        }
        if let Ok(app_data_dir) = tauri_app.path().app_data_dir() {
            let plugin_dir = app_data_dir.join("compat-plugins");
            if plugin_dir.is_dir() && !roots.contains(&plugin_dir) {
                roots.push(plugin_dir);
            }
        }
    }
    Ok::<Vec<CompatPluginSummary>, String>(domain::modding::compat_plugin::list_summaries(&roots))
}
