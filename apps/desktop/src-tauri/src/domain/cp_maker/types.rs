use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::infrastructure::game_formats::tbin::MapDocument;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerDraftRecord {
    pub draft_storage_key: String,
    pub project_metadata: CpMakerMetadata,
    #[serde(default)]
    pub overlay_targets: Vec<CpMakerOverlayTarget>,
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
    pub event_source_snapshots_by_target: BTreeMap<String, CpMakerEventSourceSnapshot>,
    #[serde(default)]
    pub last_draft_saved_at: Option<i64>,
    #[serde(default)]
    pub last_exported_at: Option<i64>,
    #[serde(default)]
    pub last_export_path: Option<String>,
    #[serde(default)]
    pub last_export_fingerprint: Option<CpMakerExportFingerprint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerEventSourceSnapshot {
    #[serde(default)]
    pub raw_scripts_by_key: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicToken {
    pub name: String,
    pub value: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<Map<String, Value>>,
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
pub struct CpMakerMetadata {
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
pub struct CpMakerOverlayTarget {
    pub unique_id: String,
    pub display_name: Option<String>,
    pub required: bool,
    pub source: CpMakerOverlayTargetSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CpMakerOverlayTargetSource {
    ScannedMod,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerExportFingerprint {
    pub draft_fingerprint: String,
    pub environment_fingerprint: String,
    pub capability_fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerDraftSummary {
    pub draft_storage_key: String,
    pub project_name: String,
    pub project_unique_id: String,
    pub last_draft_saved_at: Option<i64>,
    pub last_exported_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyCpMakerDraftRequest {
    pub source_draft_storage_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerExportRequest {
    pub output_path: String,
    pub manifest_json: String,
    pub content_json: String,
    #[serde(default)]
    pub virtual_assets: Vec<VirtualPreviewAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCpMakerMapAssetRequest {
    pub relative_path: String,
    pub map_document: MapDocument,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpMakerExportResult {
    pub output_path: String,
    pub manifest_path: String,
    pub content_path: String,
    #[serde(default)]
    pub virtual_asset_paths: Vec<String>,
}

impl CpMakerDraftRecord {
    pub fn summary(&self) -> CpMakerDraftSummary {
        CpMakerDraftSummary {
            draft_storage_key: self.draft_storage_key.clone(),
            project_name: self.project_metadata.project_name.clone(),
            project_unique_id: self.project_metadata.project_unique_id.clone(),
            last_draft_saved_at: self.last_draft_saved_at,
            last_exported_at: self.last_exported_at,
        }
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
        Self {
            patches: Vec::new(),
        }
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
