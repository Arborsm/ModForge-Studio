use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::BTreeMap;

pub(crate) const UNSORTED_STORAGE_FOLDER_ID: &str = "unsorted";
pub(crate) const UNSORTED_STORAGE_FOLDER_NAME: &str = "Unsorted";

fn default_auto_check_mod_updates() -> bool {
    true
}

fn default_gmcm_parsing_enabled() -> bool {
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
    #[serde(default = "default_gmcm_parsing_enabled")]
    pub gmcm_parsing_enabled: bool,
    pub show_console_window: bool,
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
            gmcm_parsing_enabled: default_gmcm_parsing_enabled(),
            show_console_window: false,
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
    pub gmcm_parsing_enabled: Option<bool>,
    pub show_console_window: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanLauncherLibraryRequest {
    pub mods_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherLibraryDependency {
    pub unique_id: String,
    pub required: bool,
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
    pub has_config: bool,
    pub nexus_mod_id: Option<i64>,
    pub update_keys: Vec<String>,
    pub mod_url: Option<String>,
    pub image_url: Option<String>,
    #[serde(default)]
    pub dependencies: Vec<LauncherLibraryDependency>,
    #[serde(default)]
    pub required_dependencies: Vec<String>,
    pub missing_required_dependencies: Vec<String>,
    /// The mod's `MinimumApiVersion` manifest field, when declared.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum_api_version: Option<String>,
    /// True when `minimum_api_version` is declared and newer than the detected
    /// installed SMAPI version (set by the library scan, not the raw file scan).
    #[serde(default)]
    pub requires_newer_smapi: bool,
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
pub struct LoadLauncherModConfigRequest {
    pub mod_path: String,
    #[serde(default)]
    pub locale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLauncherModConfigRequest {
    pub mod_path: String,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub values: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherModConfigSource {
    ContentPatcher,
    GenericModConfigMenu,
    ConfigJson,
    DllStatic,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherModConfigFieldType {
    Boolean,
    Integer,
    Number,
    String,
    StringArray,
    Object,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherModConfigUiHint {
    Color,
    Item,
    ItemList,
    Keybind,
    KeybindList,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherModConfigProbeStatus {
    NotRun,
    Unavailable,
    Succeeded,
    Failed,
    TimedOut,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherModConfigField {
    pub key: String,
    pub label: String,
    pub description: Option<String>,
    pub section: Option<String>,
    pub field_type: LauncherModConfigFieldType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ui_hint: Option<LauncherModConfigUiHint>,
    pub value: serde_json::Value,
    pub default_value: Option<serde_json::Value>,
    #[serde(default)]
    pub allow_values: Vec<serde_json::Value>,
    #[serde(default)]
    pub allow_blank: bool,
    #[serde(default)]
    pub allow_multiple: bool,
    pub editable: bool,
    pub source: LauncherModConfigSource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherModConfigResult {
    pub mod_path: String,
    pub config_path: String,
    pub config_exists: bool,
    #[serde(default)]
    pub fields: Vec<LauncherModConfigField>,
    #[serde(default)]
    pub schema_sources: Vec<LauncherModConfigSource>,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub probe_status: LauncherModConfigProbeStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub probe_diagnostics: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LauncherGmcmProbeDiagnosticStatus {
    Ready,
    Warning,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherGmcmProbeDiagnosticsResult {
    pub status: LauncherGmcmProbeDiagnosticStatus,
    pub probe_assembly_path: Option<String>,
    pub dotnet_path: String,
    pub dotnet_available: bool,
    pub net6_runtime_available: bool,
    #[serde(default)]
    pub installed_runtimes: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub repair_actions: Vec<String>,
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

/// One installed mod whose declared `MinimumApiVersion` is newer than the detected
/// installed SMAPI version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmapiUpdateRequiredByMod {
    /// The mod's manifest `UniqueID` (falls back to the scan id).
    pub mod_id: String,
    pub mod_name: String,
    pub minimum_api_version: String,
}

/// Which source produced the SMAPI latest-version lookup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SmapiVersionSource {
    /// GitHub releases (primary; assets carry sha256 digests and direct URLs).
    #[default]
    Github,
    /// Nexus Mods public GraphQL fallback (mod 2400; no sha256, free users must
    /// use the manual download popup).
    Nexus,
}

/// Which file naming a locally downloaded SMAPI installer archive uses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SmapiInstallerNaming {
    /// `SMAPI-{version}-installer.zip` / `SMAPI-{version}-installer-double-zipped.zip`.
    #[default]
    Github,
    /// `SMAPI {version}-2400-{version}-{timestamp}.zip`.
    Nexus,
}

/// Download info for the target SMAPI installer, source-aware: GitHub assets carry
/// a direct URL plus sha256 digest; Nexus provides no sha256 and no free direct
/// download, so the UI gets the manual-download popup instead.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmapiUpdateDownloadInfo {
    pub source: SmapiVersionSource,
    /// Direct download URL (GitHub only). Absent for Nexus-sourced downloads.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Hex SHA-256 digest (without the `sha256:` prefix) when the source provides
    /// one (GitHub asset digest). Absent for Nexus.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    pub asset_name: String,
    /// Nexus mod page URL (Nexus-sourced downloads only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nexus_mod_page_url: Option<String>,
    /// Nexus manual-download popup URL for free users (Nexus-sourced downloads
    /// with a known file id only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nexus_download_popup_url: Option<String>,
    /// Nexus file id the popup targets (Nexus-sourced downloads only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nexus_file_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckSmapiUpdateResult {
    pub installed_version: String,
    pub game_version: String,
    pub latest_stable_version: String,
    pub target_version: String,
    pub update_available: bool,
    /// Which source produced the latest-version lookup (`github` or `nexus`).
    pub version_source: SmapiVersionSource,
    #[serde(default)]
    pub required_by_mods: Vec<SmapiUpdateRequiredByMod>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download: Option<SmapiUpdateDownloadInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSmapiUpdateRequest {
    /// Optional cancellation id checked during the download phase; the frontend
    /// cancels through the existing `cancel_launcher_download` command.
    #[serde(default)]
    pub job_id: Option<String>,
    /// Direct GitHub asset URL for the download branch. Mutually exclusive with
    /// `local_file_path`; required when no local file is provided.
    #[serde(default)]
    pub download_url: Option<String>,
    /// Hex SHA-256 digest of the installer zip (optionally `sha256:`-prefixed).
    /// Required for the download branch; optional for the local-file branch —
    /// when absent, the local file is validated structurally instead.
    #[serde(default)]
    pub expected_sha256: Option<String>,
    pub target_version: String,
    /// Local SMAPI installer archive to install from instead of downloading.
    /// The file name must match a recognized SMAPI installer naming and the
    /// payload is validated structurally (never trusts the path blindly).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSmapiUpdateResult {
    pub success: bool,
    /// Re-read installed SMAPI version after the installer finished.
    pub installed_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmapiUpdateProgressPayload {
    /// One of `downloading`, `verifying`, `extracting`, `installing`.
    pub phase: String,
    /// Completion percent for the download phase; `None` when unknown or
    /// indeterminate (verifying/extracting/installing).
    pub percent: Option<f64>,
    pub message: String,
}

/// A recognized SMAPI installer archive found in the user's download directories.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SmapiInstallerDownloadCandidate {
    pub path: String,
    pub file_name: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    /// True for GitHub `-double-zipped` archives (the payload is an inner zip).
    pub double_zipped: bool,
    pub naming: SmapiInstallerNaming,
    /// `true` when the version is within the game-compatible maximum; `None`
    /// when no game version / latest reference could be resolved (e.g. game path
    /// unconfigured or no cached latest release to compare against).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compatible: Option<bool>,
    /// `true` when the version is at or above the current target version; `None`
    /// when the installed SMAPI / target could not be resolved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub satisfies_target: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindSmapiInstallerDownloadsResult {
    /// Newest version first.
    pub candidates: Vec<SmapiInstallerDownloadCandidate>,
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
    /// Version of the primary mod target before this install replaced it.
    /// `None` when the primary target was a fresh install (no previous folder).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_version: Option<String>,
    /// True when the primary target already existed and was replaced in place
    /// (UpgradeReplace path, with config/i18n preservation and backup).
    #[serde(default)]
    pub upgraded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherInstallBackupSummary {
    pub backup_id: String,
    pub backup_path: String,
    pub delete_count: usize,
    pub overwrite_count: usize,
    pub created_at_ms: u128,
    pub primary_mod_name: Option<String>,
    pub primary_version: Option<String>,
    pub mod_count: usize,
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
    /// Mods folder used to detect already-installed mods for the same unique ID
    /// and produce per-root install diff summaries. Optional; when absent the
    /// inspection only reports archive contents.
    #[serde(default)]
    pub mods_path: Option<String>,
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

/// How one file differs between the archive mod root (incoming) and the
/// installed folder it would replace (existing).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LauncherArchiveFileChangeKind {
    /// Present in the archive root only.
    Added,
    /// Present in the installed folder only.
    Removed,
    /// Present in both trees with different bytes.
    Changed,
}

/// Per-file change detail inside a mod-root diff summary. Sizes and modified
/// times are byte counts / unix epoch milliseconds on each side; the archive
/// side comes from archive entry metadata when the format exposes it, otherwise
/// `None`. `text_diff` holds a unified diff only for text files small enough to
/// diff (both sides <= 256 KiB), truncated to `MAX_TEXT_DIFF_LINES` lines.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherArchiveFileDiff {
    /// File path relative to the mod root, forward slashes.
    pub path: String,
    pub change_kind: LauncherArchiveFileChangeKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_size: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub old_modified_ms: Option<u128>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub new_modified_ms: Option<u128>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_diff: Option<String>,
    /// True when `text_diff` was truncated to the line budget.
    #[serde(default)]
    pub text_diff_truncated: bool,
}

/// File-level difference summary between an archive mod root (incoming) and the
/// already-installed folder it would replace (existing). Counts cover every
/// differing file; `files` is capped per root (`truncated_file_count` reports
/// how many files were omitted beyond the cap).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherArchiveDiffSummary {
    /// Files present in the archive root but not in the installed folder.
    pub added: usize,
    /// Files present in both trees with different bytes.
    pub changed: usize,
    /// Files present in the installed folder but not in the archive root
    /// (they would be removed by the replace install).
    pub removed: usize,
    #[serde(default)]
    pub files: Vec<LauncherArchiveFileDiff>,
    /// Number of differing files omitted because the per-root detail cap was
    /// reached; absent when nothing was omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub truncated_file_count: Option<usize>,
}

/// One detected mod root inside an inspected archive, enriched with manifest
/// metadata and — when a Mods folder was provided and the unique ID matches an
/// installed mod — the existing install info and a file diff summary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherArchiveModRootInfo {
    /// Archive-relative root path; `"."` when the manifest sits at the archive root.
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_unique_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifest_version: Option<String>,
    /// Unique ID of the installed mod matched by manifest unique ID. Absent when
    /// no Mods folder was provided or no installed mod matches.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_unique_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub existing_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff_summary: Option<LauncherArchiveDiffSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLauncherArchiveResult {
    pub archive_path: String,
    pub archive_file_name: String,
    pub total_entries: usize,
    pub total_files: usize,
    pub mod_roots: Vec<LauncherArchiveModRootInfo>,
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
