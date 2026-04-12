mod remote;
mod search;
mod shared;
mod updates;

use super::types::LauncherSettings;
use super::types::{
    CheckLauncherUpdatesRequest, LauncherCatalogPageResult, LauncherRemoteModDetail,
    LauncherUpdateChangelogResult, LauncherUpdatesResult, LoadCachedLauncherUpdatesRequest,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
    SearchLauncherCatalogRequest,
};

#[cfg(test)]
pub(crate) use remote::{
    enrich_remote_mod_detail_with_gallery_images, parse_launcher_update_changelog_text,
    parse_launcher_update_file_metadata_text, parse_public_mod_detail_graphql_response,
    parse_remote_mod_detail_html, parse_remote_mod_images_tab_html, RemoteModDetail,
};
#[cfg(test)]
pub(crate) use search::{
    build_catalog_graphql_payload, build_public_catalog_graphql_payload,
    parse_catalog_graphql_response, parse_catalog_results,
};
#[cfg(test)]
pub(crate) use updates::build_smapi_update_payload;
#[cfg(test)]
pub(crate) use updates::{
    build_launcher_update_summary, build_smapi_update_payload_with_versions,
    build_update_batch_graphql_payload, dedupe_update_candidates_by_mod_id,
    finalize_remote_mod_details_batch, parse_smapi_update_response,
    parse_update_batch_graphql_response, resolve_smapi_runtime_versions_with_reader,
    SmapiRuntimeVersions, UpdateCheckCandidate,
};

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        || settings
            .nexus_cookie
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
}

#[tauri::command]
pub async fn search_launcher_catalog(
    app: tauri::AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    search::search_launcher_catalog(app, request).await
}

#[tauri::command]
pub async fn load_launcher_remote_mod_detail(
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    remote::load_launcher_remote_mod_detail(request).await
}

#[tauri::command]
pub async fn load_launcher_update_changelog(
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    remote::load_launcher_update_changelog(request).await
}

#[tauri::command]
pub fn load_cached_launcher_updates(
    app: tauri::AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    updates::load_cached_launcher_updates(app, request)
}

#[tauri::command]
pub async fn check_launcher_updates(
    app: tauri::AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    updates::check_launcher_updates(app, request).await
}
