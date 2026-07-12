use super::context::SimulationContext;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectSummary {
    pub name: Option<String>,
    pub unique_id: Option<String>,
    pub content_pack_for: Option<String>,
    pub absolute_path: Option<String>,
    pub manifest_path: Option<String>,
    pub content_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherSourceFile {
    pub path: String,
    pub absolute_path: String,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherIncludeEdge {
    pub source_path: String,
    pub included_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectDiagnostic {
    pub severity: String,
    pub message: String,
    pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectSnapshot {
    pub summary: ContentPatcherProjectSummary,
    pub sources: Vec<ContentPatcherSourceFile>,
    pub include_tree: Vec<ContentPatcherIncludeEdge>,
    pub diagnostics: Vec<ContentPatcherProjectDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPlannedPatch {
    pub id: String,
    pub action: String,
    pub target: String,
    pub log_name: String,
    pub from_file: Option<String>,
    pub when: BTreeMap<String, Value>,
    pub source_path: String,
    pub priority: i32,
    pub update: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPatchPlan {
    pub patches: Vec<ContentPatcherPlannedPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VirtualPreviewAsset {
    pub relative_path: String,
    pub media_type: String,
    pub bytes_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPreviewFingerprint {
    pub draft_fingerprint: String,
    pub environment_fingerprint: String,
    pub capability_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherSnapshotInput {
    pub path: Option<String>,
    pub game_root_path: Option<String>,
    pub snapshot: Option<ContentPatcherProjectSnapshot>,
    pub manifest_json: Option<String>,
    pub content_json: Option<String>,
    pub virtual_assets: Option<Vec<VirtualPreviewAsset>>,
    pub available_capabilities: Option<Vec<String>>,
    pub fingerprint: Option<ContentPatcherPreviewFingerprint>,
    pub context: Option<SimulationContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPatchStatus {
    pub patch_id: Option<String>,
    pub status: String,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherTargetSummary {
    pub path: String,
    pub asset_kind: String,
    pub touched_patch_count: usize,
    pub result_state: String,
    pub patch_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherTraceEntry {
    pub patch_id: String,
    pub log_name: String,
    pub action: String,
    pub source_path: String,
    pub status: String,
    pub reason_summary: String,
    pub change_summary: String,
    pub diagnostics: Vec<ContentPatcherProjectDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherResultAsset {
    pub kind: String,
    pub json: Option<Value>,
    pub image_data_url: Option<String>,
    pub original_image_data_url: Option<String>,
    pub original_image_source: Option<String>,
    pub map_debug: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherMapDebugSummary {
    pub layers: Vec<String>,
    pub properties: Vec<String>,
    pub warps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoadContentPatcherResultAssetRequest {
    pub path: Option<String>,
    pub game_root_path: Option<String>,
    pub snapshot: Option<ContentPatcherProjectSnapshot>,
    pub manifest_json: Option<String>,
    pub content_json: Option<String>,
    pub virtual_assets: Option<Vec<VirtualPreviewAsset>>,
    pub available_capabilities: Option<Vec<String>>,
    pub fingerprint: Option<ContentPatcherPreviewFingerprint>,
    pub context: Option<SimulationContext>,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LoadContentPatcherResultAssetResult {
    pub target: ContentPatcherTargetSummary,
    pub trace: Vec<ContentPatcherTraceEntry>,
    pub result: ContentPatcherResultAsset,
    pub diagnostics: Vec<ContentPatcherProjectDiagnostic>,
    pub exportable: bool,
}
