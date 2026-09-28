use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NexusRouteStatus {
    Loading,
    Warning,
    Success,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusRouteSnapshot {
    pub route_id: String,
    pub label: String,
    pub endpoint: String,
    pub status: NexusRouteStatus,
    pub attempts: u8,
    pub max_attempts: u8,
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusDiagnosticsResult {
    pub routes: Vec<NexusRouteSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateApiKeyResult {
    pub user_name: String,
    pub avatar_url: Option<String>,
    pub profile_url: Option<String>,
    pub is_premium: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub premium_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_lifetime_premium: Option<bool>,
    pub daily_remaining: Option<u64>,
    pub hourly_remaining: Option<u64>,
    pub daily_reset_at: Option<u64>,
    pub hourly_reset_at: Option<u64>,
}

// The launcher-facing wire types below are produced by the nexusmods domain
// (catalog search, remote mod detail) and consumed by the launcher domain, so
// they live here and are re-exported by `launcher::types` for the launcher
// side (R4: nexusmods must not reference launcher).

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchLauncherCatalogRequest {
    pub query: Option<String>,
    pub title_query: Option<String>,
    pub description_query: Option<String>,
    pub author_query: Option<String>,
    pub uploader_query: Option<String>,
    pub page: Option<usize>,
    pub page_size: Option<usize>,
    pub time_range: Option<String>,
    pub sort: Option<String>,
    pub ascending: Option<bool>,
    pub category: Option<String>,
    pub language: Option<String>,
    pub tags_include: Option<String>,
    pub tags_exclude: Option<String>,
    pub include_adult: Option<bool>,
    pub min_file_size: Option<u64>,
    pub max_file_size: Option<u64>,
    pub min_downloads: Option<u64>,
    pub max_downloads: Option<u64>,
    pub min_endorsements: Option<u64>,
    pub max_endorsements: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLauncherRemoteModDetailRequest {
    pub mod_id: i64,
    #[serde(default = "default_include_remote_files")]
    pub include_files: bool,
}

fn default_include_remote_files() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLauncherUpdateChangelogRequest {
    pub mod_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogResult {
    pub mod_id: i64,
    pub title: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub uploader: Option<String>,
    pub mod_url: String,
    pub image_url: Option<String>,
    pub category: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub downloads: Option<u64>,
    pub endorsements: Option<u64>,
    pub file_size: Option<u64>,
    pub update_available: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogFacetEntry {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogFacets {
    pub categories: Vec<LauncherCatalogFacetEntry>,
    pub languages: Vec<LauncherCatalogFacetEntry>,
    pub tags: Vec<LauncherCatalogFacetEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogPageResult {
    pub page: usize,
    pub page_size: usize,
    pub total_count: usize,
    pub has_more: bool,
    pub facets: LauncherCatalogFacets,
    pub results: Vec<LauncherCatalogResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherRemoteModDetail {
    pub mod_id: i64,
    pub title: String,
    #[serde(default)]
    pub unavailable: bool,
    #[serde(default)]
    pub unavailable_reason: Option<String>,
    pub summary: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub mod_url: String,
    pub image_url: Option<String>,
    pub gallery_images: Vec<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub file_size: Option<u64>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub downloads: Option<u64>,
    #[serde(default)]
    pub endorsements: Option<u64>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub direct_download_enabled: Option<bool>,
    #[serde(default)]
    pub supports_vortex: Option<bool>,
    #[serde(default)]
    pub primary_file_id: Option<i64>,
    #[serde(default)]
    pub primary_file_name: Option<String>,
    #[serde(default)]
    pub primary_file_version: Option<String>,
    #[serde(default)]
    pub primary_file_category: Option<String>,
    #[serde(default)]
    pub primary_file_size: Option<u64>,
    #[serde(default)]
    pub primary_file_size_bytes: Option<u64>,
    #[serde(default)]
    pub primary_file_scanned: Option<bool>,
    #[serde(default)]
    pub primary_file_scan_status: Option<String>,
    #[serde(default)]
    pub primary_file_changelog: Vec<String>,
    #[serde(default)]
    pub required_loader: Option<String>,
    #[serde(default)]
    pub game_version: Option<String>,
    #[serde(default)]
    pub archive_type: Option<String>,
    #[serde(default)]
    pub update_risk: Option<String>,
    #[serde(default)]
    pub requirements: Vec<LauncherRemoteModRequirement>,
    #[serde(default)]
    pub files: Vec<LauncherRemoteModFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherRemoteModRequirement {
    pub name: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub mod_id: Option<i64>,
    #[serde(default)]
    pub external: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherRemoteModFile {
    #[serde(default)]
    pub file_id: Option<i64>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub uploaded_at: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub unique_downloads: Option<u64>,
    #[serde(default)]
    pub total_downloads: Option<u64>,
    #[serde(default)]
    pub manager_download_enabled: Option<bool>,
    #[serde(default)]
    pub uid: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub primary: bool,
    #[serde(default)]
    pub scanned: Option<bool>,
    #[serde(default)]
    pub scan_status: Option<String>,
    #[serde(default)]
    pub changelog: Vec<String>,
    #[serde(default)]
    pub archive_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateChangelogResult {
    pub mod_id: i64,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub changelog: Option<String>,
}
