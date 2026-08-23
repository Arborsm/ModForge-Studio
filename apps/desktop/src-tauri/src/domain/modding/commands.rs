//! Host command bindings for the modding domain (compat plugin listing and
//! directory-pack entry I/O for stage 2 schema-rendered pages).

use crate::AppHandle;
use crate::domain;
use crate::domain::modding::compat_plugin::{
    CompatPluginEntrySummary, CompatPluginSummary, DeleteCompatPluginEntryRequest,
    ReadCompatPluginEntryRequest, ReadCompatPluginEntryResult, WriteCompatPluginEntryImageRequest,
    WriteCompatPluginEntryRequest,
};
use base64::Engine as _;
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
///
/// Mutation lane + `CompatPluginState` resource lock: clearing caches and
/// re-scanning mutates the shared plugin state, so it must serialize against
/// `toggle_compat_plugin` / `delete_compat_plugin` (which also clear caches and
/// re-scan) to avoid a reload reading a half-written marker or a toggle reading
/// pre-clear stale state.
#[host_command(mutation, resources(CompatPluginState))]
pub async fn reload_compat_plugins(app: AppHandle) -> Result<Vec<CompatPluginSummary>, String> {
    // Clear the plugin summaries cache and the attached API registry cache,
    // then re-scan from disk.
    domain::modding::compat_plugin::clear_plugin_caches();
    Ok::<Vec<CompatPluginSummary>, String>(
        domain::modding::compat_plugin::list_summaries_from_resolved_roots(),
    )
}

/// Returns the resolved compat plugin root directories. Used by the plugin
/// manager page's "open plugin directory" button to open the user-facing
/// plugin folder (app data dir) in the file explorer.
#[host_command(control)]
pub async fn get_compat_plugin_roots(app: AppHandle) -> Result<Vec<String>, String> {
    Ok::<Vec<String>, String>(
        domain::modding::compat_plugin::get_plugin_roots()
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
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

/// Deletes one complete directory-pack entry directory.
#[host_command(mutation, resources(CompatPluginEntry))]
pub async fn delete_compat_plugin_entry(
    app: AppHandle,
    request: DeleteCompatPluginEntryRequest,
) -> Result<(), String> {
    domain::modding::compat_plugin::delete_directory_pack_entry(request)
}

/// Writes a validated base64-encoded companion image into an entry directory.
#[host_command(mutation, resources(CompatPluginEntry))]
pub async fn write_compat_plugin_entry_image(
    app: AppHandle,
    request: WriteCompatPluginEntryImageRequest,
) -> Result<(), String> {
    domain::modding::compat_plugin::write_directory_pack_entry_image(request)
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

/// Request payload for `toggle_compat_plugin`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleCompatPluginRequest {
    /// Plugin id (matches the directory name).
    pub plugin_id: String,
    /// `true` to disable, `false` to enable.
    pub disabled: bool,
}

/// Toggles a compat plugin's enabled state by creating or removing a
/// `.disabled` marker file in the plugin directory. After toggling, the plugin
/// caches are cleared and refreshed summaries are returned so the frontend can
/// update the registry in place.
#[host_command(mutation, resources(CompatPluginState))]
pub async fn toggle_compat_plugin(
    app: AppHandle,
    request: ToggleCompatPluginRequest,
) -> Result<Vec<CompatPluginSummary>, String> {
    domain::modding::compat_plugin::set_plugin_disabled(&request.plugin_id, request.disabled)?;
    domain::modding::compat_plugin::clear_plugin_caches();
    Ok::<Vec<CompatPluginSummary>, String>(
        domain::modding::compat_plugin::list_summaries_from_resolved_roots(),
    )
}

/// Request payload for `delete_compat_plugin`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCompatPluginRequest {
    /// Plugin id (matches the directory name).
    pub plugin_id: String,
}

/// Deletes a compat plugin directory entirely. After deletion, the plugin
/// caches are cleared and refreshed summaries are returned so the frontend can
/// update the registry in place. The caller should confirm the deletion with
/// the user before invoking this command.
#[host_command(mutation, resources(CompatPluginState))]
pub async fn delete_compat_plugin(
    app: AppHandle,
    request: DeleteCompatPluginRequest,
) -> Result<Vec<CompatPluginSummary>, String> {
    domain::modding::compat_plugin::delete_plugin(&request.plugin_id)?;
    domain::modding::compat_plugin::clear_plugin_caches();
    Ok::<Vec<CompatPluginSummary>, String>(
        domain::modding::compat_plugin::list_summaries_from_resolved_roots(),
    )
}

/// Request payload for `read_plugin_asset`.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadPluginAssetRequest {
    /// Plugin id (matches the directory name under a plugin root).
    pub plugin_id: String,
    /// Relative path within the plugin directory (e.g. "index.js",
    /// "assets/icon.png"). Must end with a whitelisted extension.
    pub relative_path: String,
}

/// Result of reading a plugin asset via the `plugin://` protocol. The file
/// bytes are base64-encoded so they can travel over the sidecar's JSON-RPC
/// transport; the content type lets the host set the correct `Content-Type`
/// header without re-deriving it.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadPluginAssetResult {
    /// File bytes base64-encoded (standard alphabet, with padding).
    pub bytes_base64: String,
    /// MIME content type derived from the file extension.
    pub content_type: String,
}

/// Reads a plugin asset file for the `plugin://` custom URI scheme. Resolves
/// the path via [`compat_plugin::resolve_plugin_protocol_path`] (plugin id
/// validation, extension whitelist, traversal rejection — the single Rust
/// source of truth) and returns the file bytes base64-encoded with its MIME
/// content type.
///
/// Used by the Linux Electron host's `plugin://` protocol handler so all path
/// safety stays in Rust (design doc §3.1/§10.3 C3: single implementation).
/// The Electron handler becomes a pure transport layer: it forwards the
/// request over sidecar IPC and wraps the response in a `fetch` `Response`.
#[host_command(io)]
pub async fn read_plugin_asset(
    app: AppHandle,
    request: ReadPluginAssetRequest,
) -> Result<ReadPluginAssetResult, String> {
    let resolved = domain::modding::compat_plugin::resolve_plugin_protocol_path(
        &request.plugin_id,
        &request.relative_path,
    )
    .ok_or_else(|| {
        format!(
            "plugin asset not found: {}/{}",
            request.plugin_id, request.relative_path
        )
    })?;
    let bytes = std::fs::read(&resolved)
        .map_err(|e| format!("failed to read plugin asset {}: {e}", resolved.display()))?;
    let content_type =
        domain::modding::compat_plugin::plugin_asset_content_type(&resolved).to_string();
    Ok::<ReadPluginAssetResult, String>(ReadPluginAssetResult {
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        content_type,
    })
}
