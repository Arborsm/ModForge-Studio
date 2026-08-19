//! Host command bindings for the modding domain (compat plugin listing and
//! directory-pack entry I/O for stage 2 schema-rendered pages).

use crate::AppHandle;
use crate::domain;
use crate::domain::modding::compat_plugin::{
    CompatPluginEntrySummary, CompatPluginSummary, ReadCompatPluginEntryRequest,
    ReadCompatPluginEntryResult, WriteCompatPluginEntryRequest,
};
use host_command_macros::host_command;

/// Lists installed compat plugins with inline i18n bundles and page ids.
///
/// Plugin roots are resolved from the process-level root set initialized at
/// startup (Tauri `setup` for macOS/Windows, sidecar entry for Linux). Results
/// are cached for the process lifetime.
#[host_command(io)]
pub async fn list_compat_plugins(app: AppHandle) -> Result<Vec<CompatPluginSummary>, String> {
    Ok::<Vec<CompatPluginSummary>, String>(
        domain::modding::compat_plugin::list_summaries_from_resolved_roots(),
    )
}

/// Reloads compat plugins from disk, clearing all caches. Returns the refreshed
/// plugin summaries. Used by the stage 4 plugin management page's manual reload
/// button.
#[host_command(io)]
pub async fn reload_compat_plugins(app: AppHandle) -> Result<Vec<CompatPluginSummary>, String> {
    // Clear the plugin summaries cache and the attached API registry cache,
    // then re-scan from disk.
    domain::modding::compat_plugin::clear_plugin_caches();
    Ok::<Vec<CompatPluginSummary>, String>(
        domain::modding::compat_plugin::list_summaries_from_resolved_roots(),
    )
}

/// Lists pack entries under a directory-pack source. Scans `<mod_root>/<root_subdir>`
/// for subdirectories containing the declared entry file, returning one summary
/// per entry. Used by stage 2 `directory-pack` source adapters.
#[host_command(io)]
pub async fn list_compat_plugin_entries(
    app: AppHandle,
    request: ListCompatPluginEntriesRequest,
) -> Result<Vec<CompatPluginEntrySummary>, String> {
    Ok::<Vec<CompatPluginEntrySummary>, String>(
        domain::modding::compat_plugin::list_directory_pack_entries(&request),
    )
}

/// Reads one pack entry's JSON content from a directory-pack source. The path
/// is resolved as `<mod_root>/<root_subdir>/<entry_id>/<entry_file>` with path
/// traversal protection (no `..` escape, no absolute paths).
#[host_command(io)]
pub async fn read_compat_plugin_entry(
    app: AppHandle,
    request: ReadCompatPluginEntryRequest,
) -> Result<ReadCompatPluginEntryResult, String> {
    domain::modding::compat_plugin::read_directory_pack_entry(request)
}

/// Writes one pack entry's JSON content to a directory-pack source. The path
/// is resolved as `<mod_root>/<root_subdir>/<entry_id>/<entry_file>` with path
/// traversal protection. The write is atomic (write to temp then rename).
#[host_command(mutation, resources(CompatPluginEntry))]
pub async fn write_compat_plugin_entry(
    app: AppHandle,
    request: WriteCompatPluginEntryRequest,
) -> Result<(), String> {
    Ok::<(), String>(domain::modding::compat_plugin::write_directory_pack_entry(
        request,
    )?)
}

/// Request payload for `list_compat_plugin_entries`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCompatPluginEntriesRequest {
    /// Absolute path to the target mod's root directory (from `scan_mod_projects`).
    pub mod_root: String,
    /// Subdirectory within the mod root containing entries (e.g. "Textures").
    pub root_subdir: String,
    /// Entry file name to look for in each subdirectory (e.g. "texture.json").
    pub entry_file: String,
    /// Optional companion image file name (e.g. "texture.png").
    pub entry_image: Option<String>,
}
