use serde::{Deserialize, Serialize};

pub(crate) const UNSORTED_STORAGE_FOLDER_ID: &str = "unsorted";
pub(crate) const UNSORTED_STORAGE_FOLDER_NAME: &str = "Unsorted";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub game_path: Option<String>,
    pub mods_path: Option<String>,
    pub download_path: Option<String>,
    pub nexus_api_key: Option<String>,
    pub nexus_cookie: Option<String>,
    pub auto_install_downloads: bool,
    pub keep_downloaded_archives: bool,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLauncherSettingsRequest {
    pub game_path: Option<String>,
    pub mods_path: Option<String>,
    pub download_path: Option<String>,
    pub nexus_api_key: Option<String>,
    pub nexus_cookie: Option<String>,
    pub auto_install_downloads: Option<bool>,
    pub keep_downloaded_archives: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanLauncherLibraryRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryModSummary {
    pub id: String,
    pub label_key: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub unique_id: Option<String>,
    pub folder_name: String,
    pub absolute_path: String,
    pub enabled: bool,
    pub nexus_mod_id: Option<i64>,
    pub update_keys: Vec<String>,
    pub mod_url: Option<String>,
    pub image_url: Option<String>,
    pub missing_required_dependencies: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryScanResult {
    pub mods_path: String,
    pub mods: Vec<LauncherLibraryModSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryStorageFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub mod_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryPackPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub mod_keys: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherLibraryScopeMode {
    #[default]
    All,
    CurrentPack,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryState {
    #[serde(default)]
    pub storage_folders: Vec<LauncherLibraryStorageFolder>,
    #[serde(default)]
    pub pack_presets: Vec<LauncherLibraryPackPreset>,
    #[serde(default)]
    pub current_pack_id: Option<String>,
    #[serde(default)]
    pub scope_mode: LauncherLibraryScopeMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryCover {
    pub label_key: String,
    pub image_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryCoversState {
    pub covers: Vec<LauncherLibraryCover>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDownloadQueueItem {
    pub id: String,
    pub mod_id: i64,
    pub title: String,
    pub version: Option<String>,
    pub image_url: Option<String>,
    pub source: String,
    pub status: String,
    pub archive_path: Option<String>,
    pub installed_target_path: Option<String>,
    pub error: Option<String>,
    pub added_at: u128,
    pub completed_at: Option<u128>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDownloadQueueState {
    pub items: Vec<LauncherDownloadQueueItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherModEnabledRequest {
    pub mod_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherLibraryCoverRequest {
    pub label_key: String,
    pub image_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherModEnabledResult {
    pub absolute_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLauncherPathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLauncherRemoteModDetailRequest {
    pub mod_id: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogFacetEntry {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogFacets {
    pub categories: Vec<LauncherCatalogFacetEntry>,
    pub languages: Vec<LauncherCatalogFacetEntry>,
    pub tags: Vec<LauncherCatalogFacetEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherCatalogPageResult {
    pub page: usize,
    pub page_size: usize,
    pub total_count: usize,
    pub has_more: bool,
    pub facets: LauncherCatalogFacets,
    pub results: Vec<LauncherCatalogResult>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherRemoteModDetail {
    pub mod_id: i64,
    pub title: String,
    pub summary: Option<String>,
    pub author: Option<String>,
    pub version: Option<String>,
    pub mod_url: String,
    pub image_url: Option<String>,
    pub gallery_images: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLauncherImageRequest {
    pub url: String,
    pub refresh: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLauncherImageResult {
    pub source_url: String,
    pub local_path: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckLauncherUpdatesRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateProgressPayload {
    pub mods_path: String,
    pub checked: usize,
    pub total: usize,
    pub current_mod_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateSummary {
    pub mod_id: i64,
    pub name: String,
    pub current_version: Option<String>,
    pub latest_version: String,
    pub absolute_path: String,
    pub mod_url: String,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdatesResult {
    pub mods_path: String,
    pub checked_at_ms: u128,
    pub updates: Vec<LauncherUpdateSummary>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLauncherModRequest {
    pub mod_id: i64,
    pub file_id: Option<i64>,
    pub version: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLauncherModResult {
    pub mod_id: i64,
    pub title: String,
    pub version: Option<String>,
    pub file_name: String,
    pub archive_path: String,
    pub installed: bool,
    pub installed_target_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLauncherArchiveRequest {
    pub archive_path: String,
    pub mods_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLauncherArchiveResult {
    pub mod_name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub target_path: String,
    pub preserved_config: bool,
    pub preserved_i18n_files: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLauncherArchiveRequest {
    pub archive_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherArchiveTreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size_bytes: Option<u64>,
    pub children: Vec<LauncherArchiveTreeNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLauncherArchiveResult {
    pub archive_path: String,
    pub archive_file_name: String,
    pub total_entries: usize,
    pub total_files: usize,
    pub mod_roots: Vec<String>,
    pub tree: Vec<LauncherArchiveTreeNode>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LauncherGameLaunchTarget {
    Smapi,
    StardewValley,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LauncherGameLaunchErrorCode {
    MissingGamePath,
    MissingExecutable,
    LaunchFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherGameLaunchError {
    pub code: LauncherGameLaunchErrorCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherGameLaunchResult {
    pub executable_path: String,
    pub target: LauncherGameLaunchTarget,
}

impl Default for LauncherLibraryState {
    fn default() -> Self {
        Self {
            storage_folders: vec![default_unsorted_storage_folder()],
            pack_presets: Vec::new(),
            current_pack_id: None,
            scope_mode: LauncherLibraryScopeMode::All,
        }
    }
}

fn default_unsorted_storage_folder() -> LauncherLibraryStorageFolder {
    LauncherLibraryStorageFolder {
        id: UNSORTED_STORAGE_FOLDER_ID.to_string(),
        name: UNSORTED_STORAGE_FOLDER_NAME.to_string(),
        mod_keys: Vec::new(),
    }
}
