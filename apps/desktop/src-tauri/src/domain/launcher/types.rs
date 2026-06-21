use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;

pub(crate) const UNSORTED_STORAGE_FOLDER_ID: &str = "unsorted";
pub(crate) const UNSORTED_STORAGE_FOLDER_NAME: &str = "Unsorted";

fn default_auto_check_mod_updates() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct LauncherSettings {
    pub game_path: Option<String>,
    pub mods_path: Option<String>,
    pub download_path: Option<String>,
    pub nexus_api_key: Option<String>,
    pub auto_install_downloads: bool,
    pub keep_downloaded_archives: bool,
    #[serde(default = "default_auto_check_mod_updates")]
    pub auto_check_mod_updates: bool,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            game_path: None,
            mods_path: None,
            download_path: None,
            nexus_api_key: None,
            auto_install_downloads: false,
            keep_downloaded_archives: false,
            auto_check_mod_updates: default_auto_check_mod_updates(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NullablePatch<T> {
    Missing,
    Null,
    Value(T),
}

impl<T> NullablePatch<T> {
    pub fn state_label(&self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Null => "null",
            Self::Value(_) => "value",
        }
    }

    pub fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }
}

impl<T> Default for NullablePatch<T> {
    fn default() -> Self {
        Self::Missing
    }
}

impl<'de, T> Deserialize<'de> for NullablePatch<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        Option::<T>::deserialize(deserializer).map(|value| match value {
            Some(value) => Self::Value(value),
            None => Self::Null,
        })
    }
}

impl<T> Serialize for NullablePatch<T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Missing | Self::Null => serializer.serialize_none(),
            Self::Value(value) => value.serialize(serializer),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLauncherSettingsRequest {
    pub game_path: Option<String>,
    pub mods_path: Option<String>,
    pub download_path: Option<String>,
    #[serde(default, skip_serializing_if = "NullablePatch::is_missing")]
    pub nexus_api_key: NullablePatch<String>,
    pub auto_install_downloads: Option<bool>,
    pub keep_downloaded_archives: Option<bool>,
    pub auto_check_mod_updates: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanLauncherLibraryRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    #[serde(default)]
    pub required_dependencies: Vec<String>,
    pub missing_required_dependencies: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryScanResult {
    pub mods_path: String,
    pub mods: Vec<LauncherLibraryModSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherRuntimeInfo {
    pub game_version: Option<String>,
    pub smapi_version: Option<String>,
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
    #[serde(default)]
    pub folder_classification_mode: LauncherLibraryFolderClassificationMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherLibraryFolderClassificationMode {
    #[default]
    Global,
    Independent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryChildModGroup {
    pub parent_mod_key: String,
    #[serde(default)]
    pub child_mod_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryFolder {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub pack_id: Option<String>,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default)]
    pub parent_folder_id: Option<String>,
    #[serde(default)]
    pub mod_keys: Vec<String>,
    #[serde(default)]
    pub cover_mod_keys: Vec<String>,
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
    pub hidden_mod_keys: Vec<String>,
    #[serde(default)]
    pub pack_presets: Vec<LauncherLibraryPackPreset>,
    #[serde(default)]
    pub child_mod_groups: Vec<LauncherLibraryChildModGroup>,
    #[serde(default)]
    pub library_folders: Vec<LauncherLibraryFolder>,
    #[serde(default)]
    pub custom_orders: BTreeMap<String, Vec<String>>,
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
pub struct LauncherImageFailureEntry {
    pub mod_key: String,
    pub failure_count: u32,
    pub blocked: bool,
    pub last_error: String,
    pub last_failed_at_ms: u128,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherImageFailuresState {
    pub entries: Vec<LauncherImageFailureEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordLauncherImageFailureRequest {
    pub mod_key: String,
    pub error: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDownloadQueueItem {
    pub id: String,
    pub mod_id: i64,
    pub file_id: Option<i64>,
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
    #[serde(default)]
    pub total_bytes: Option<u64>,
    #[serde(default)]
    pub downloaded_bytes: Option<u64>,
    #[serde(default)]
    pub bytes_per_second: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDownloadQueueState {
    pub items: Vec<LauncherDownloadQueueItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherModEnabledRequest {
    pub mod_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherLibraryCoverRequest {
    pub label_key: String,
    pub image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistLauncherLibraryRemoteCoverRequest {
    pub label_key: String,
    pub image_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetLauncherModEnabledResult {
    pub absolute_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLauncherPathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenLauncherUrlRequest {
    pub url: String,
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLauncherImageRequest {
    pub url: String,
    pub refresh: Option<bool>,
    #[serde(default)]
    pub mod_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLauncherImageResult {
    pub source_url: String,
    pub local_path: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckLauncherUpdatesRequest {
    pub mods_path: String,
    pub force_refresh: Option<bool>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadCachedLauncherUpdatesRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadSuppressedLauncherUpdateModIdsRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSuppressedUpdateModIdsResult {
    pub mods_path: String,
    pub mod_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateProgressPayload {
    pub mods_path: String,
    pub session_id: String,
    pub checked: usize,
    pub total: usize,
    pub current_mod_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updates: Option<Vec<LauncherUpdateSummary>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherDownloadProgressPayload {
    pub download_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub bytes_per_second: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdateSummary {
    pub mod_id: i64,
    pub name: String,
    #[serde(default)]
    pub author: Option<String>,
    pub current_version: Option<String>,
    pub latest_version: String,
    pub absolute_path: String,
    pub mod_url: String,
    pub image_url: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub file_size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherUpdatesResult {
    pub mods_path: String,
    pub checked_at_ms: u128,
    #[serde(default = "default_launcher_updates_result_is_complete")]
    pub is_complete: bool,
    pub updates: Vec<LauncherUpdateSummary>,
}

fn default_launcher_updates_result_is_complete() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLauncherModRequest {
    pub download_id: Option<String>,
    pub mod_id: i64,
    pub file_id: Option<i64>,
    pub version: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadLauncherModResult {
    pub mod_id: i64,
    pub title: String,
    pub version: Option<String>,
    pub file_name: String,
    pub archive_path: String,
    pub installed: bool,
    pub installed_target_path: Option<String>,
    pub manual_download_page_opened: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLauncherArchiveInstalledMod {
    pub mod_name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub target_path: String,
    pub preserved_config: bool,
    pub preserved_i18n_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLauncherArchiveRequest {
    pub archive_path: String,
    pub mods_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallLauncherArchiveResult {
    pub mod_name: String,
    pub unique_id: Option<String>,
    pub version: Option<String>,
    pub target_path: String,
    pub preserved_config: bool,
    pub preserved_i18n_files: usize,
    pub installed_mods: Vec<InstallLauncherArchiveInstalledMod>,
    pub backup_id: String,
    pub backup_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherInstallBackupSummary {
    pub backup_id: String,
    pub backup_path: String,
    pub delete_count: usize,
    pub overwrite_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLauncherInstallBackupsRequest {
    pub mods_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreLauncherInstallBackupRequest {
    pub backup_id: String,
    pub mods_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreLauncherInstallBackupResult {
    pub backup_id: String,
    pub backup_path: String,
    pub restored_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLauncherArchiveRequest {
    pub archive_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherArchiveTreeNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size_bytes: Option<u64>,
    pub children: Vec<LauncherArchiveTreeNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

impl From<String> for LauncherGameLaunchError {
    fn from(message: String) -> Self {
        Self {
            code: LauncherGameLaunchErrorCode::LaunchFailed,
            message,
        }
    }
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
            hidden_mod_keys: Vec::new(),
            pack_presets: Vec::new(),
            child_mod_groups: Vec::new(),
            library_folders: Vec::new(),
            custom_orders: BTreeMap::new(),
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
