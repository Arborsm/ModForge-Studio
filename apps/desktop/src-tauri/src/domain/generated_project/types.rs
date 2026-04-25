use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::infrastructure::game_formats::tbin::MapDocument;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fmt::{self, Display, Formatter};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectDraftRecord {
    pub draft_storage_key: String,
    pub project_metadata: GeneratedProjectMetadata,
    #[serde(default)]
    pub overlay_targets: Vec<GeneratedProjectOverlayTarget>,
    #[serde(default = "default_json_object")]
    pub config_schema_draft: Value,
    #[serde(default = "default_json_object")]
    pub serialized_change_registry: Value,
    #[serde(default)]
    pub dynamic_tokens: Vec<DynamicToken>,
    #[serde(default)]
    pub custom_locations: Vec<CustomLocation>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub alias_token_names: BTreeMap<String, String>,
    #[serde(default)]
    pub event_source_snapshots_by_target: BTreeMap<String, GeneratedProjectEventSourceSnapshot>,
    #[serde(default)]
    pub last_draft_saved_at: Option<i64>,
    #[serde(default)]
    pub last_exported_at: Option<i64>,
    #[serde(default)]
    pub last_export_path: Option<String>,
    #[serde(default)]
    pub last_export_fingerprint: Option<GeneratedProjectExportFingerprint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectEventSourceSnapshot {
    #[serde(default)]
    pub raw_scripts_by_key: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToken {
    pub name: String,
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLocation {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_map_file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub migrate_legacy_names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectMetadata {
    pub project_name: String,
    pub project_description: String,
    pub project_author: String,
    pub project_version: String,
    pub project_unique_id: String,
    pub game_root_path: Option<String>,
    #[serde(default = "default_content_pack_for_unique_id")]
    pub content_pack_for_unique_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum_api_version: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub update_keys: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectOverlayTarget {
    pub unique_id: String,
    pub display_name: Option<String>,
    pub required: bool,
    pub source: GeneratedProjectOverlayTargetSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GeneratedProjectOverlayTargetSource {
    ScannedMod,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectExportFingerprint {
    pub draft_fingerprint: String,
    pub environment_fingerprint: String,
    pub capability_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectDraftSummary {
    pub draft_storage_key: String,
    pub project_name: String,
    pub project_unique_id: String,
    pub last_draft_saved_at: Option<i64>,
    pub last_exported_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyGeneratedProjectDraftRequest {
    pub source_draft_storage_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectExportRequest {
    pub output_path: String,
    pub manifest_json: String,
    pub content_json: String,
    #[serde(default)]
    pub virtual_assets: Vec<VirtualPreviewAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildGeneratedProjectMapAssetRequest {
    pub relative_path: String,
    pub map_document: MapDocument,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectExportResult {
    pub output_path: String,
    pub manifest_path: String,
    pub content_path: String,
    #[serde(default)]
    pub virtual_asset_paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GeneratedProjectDraftOperation {
    List,
    Load,
    Save,
    Delete,
    Copy,
    BuildMapAsset,
    Export,
    Import,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GeneratedProjectDraftErrorCode {
    MissingRecord,
    CorruptedSnapshot,
    InvalidDraft,
    ReadFailed,
    WriteFailed,
    DeleteFailed,
    ListFailed,
    CopyFailed,
    InvalidExport,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedProjectDraftError {
    pub code: GeneratedProjectDraftErrorCode,
    pub operation: GeneratedProjectDraftOperation,
    pub message: String,
    pub draft_storage_key: Option<String>,
    pub path: Option<String>,
}

impl GeneratedProjectDraftRecord {
    pub fn summary(&self) -> GeneratedProjectDraftSummary {
        GeneratedProjectDraftSummary {
            draft_storage_key: self.draft_storage_key.clone(),
            project_name: self.project_metadata.project_name.clone(),
            project_unique_id: self.project_metadata.project_unique_id.clone(),
            last_draft_saved_at: self.last_draft_saved_at,
            last_exported_at: self.last_exported_at,
        }
    }
}

impl GeneratedProjectDraftError {
    pub fn new(
        code: GeneratedProjectDraftErrorCode,
        operation: GeneratedProjectDraftOperation,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            operation,
            message: message.into(),
            draft_storage_key: None,
            path: None,
        }
    }

    pub fn with_draft_storage_key(mut self, draft_storage_key: impl Into<String>) -> Self {
        self.draft_storage_key = Some(draft_storage_key.into());
        self
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }
}

// ─── Change Registry (frontend-defined opaque structure) ──────────────

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRegistry {
    #[serde(default)]
    pub patches: Vec<ChangeRegistryPatch>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeRegistryPatch {
    pub id: String,
    pub workspace: String,
    pub target: String,
    pub action: String,
    pub log_name: String,
    #[serde(default = "default_true_value")]
    pub enabled: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_file: Option<String>,
    #[serde(default)]
    pub editor_state: Value,
    // ── CP PatchConfig advanced fields ──
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_locale: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub update: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_tokens: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_field: Option<Vec<String>>,
}

impl Default for ChangeRegistryPatch {
    fn default() -> Self {
        Self {
            id: String::new(),
            workspace: String::new(),
            target: String::new(),
            action: String::new(),
            log_name: String::new(),
            enabled: default_true_value(),
            when: None,
            from_file: None,
            editor_state: Value::Object(Map::new()),
            target_locale: None,
            update: None,
            priority: None,
            local_tokens: None,
            target_field: None,
        }
    }
}

impl Default for ChangeRegistry {
    fn default() -> Self {
        Self { patches: Vec::new() }
    }
}

impl Display for GeneratedProjectDraftError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "generated-project {:?} failed ({:?}): {}",
            self.operation, self.code, self.message
        )?;
        if let Some(draft_storage_key) = &self.draft_storage_key {
            write!(formatter, " [draftStorageKey={}]", draft_storage_key)?;
        }
        if let Some(path) = &self.path {
            write!(formatter, " [path={}]", path)?;
        }
        Ok(())
    }
}

fn default_content_pack_for_unique_id() -> String {
    "Pathoschild.ContentPatcher".to_string()
}

fn default_json_object() -> Value {
    json!({})
}

fn default_true_value() -> Value {
    Value::Bool(true)
}
