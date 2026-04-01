use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectSummary {
    pub name: Option<String>,
    pub unique_id: Option<String>,
    pub content_pack_for: Option<String>,
    pub absolute_path: Option<String>,
    pub manifest_path: Option<String>,
    pub content_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherSourceFile {
    pub path: String,
    pub absolute_path: String,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherIncludeEdge {
    pub source_path: String,
    pub included_path: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectDiagnostic {
    pub severity: String,
    pub message: String,
    pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectSnapshot {
    pub summary: ContentPatcherProjectSummary,
    pub sources: Vec<ContentPatcherSourceFile>,
    pub include_tree: Vec<ContentPatcherIncludeEdge>,
    pub diagnostics: Vec<ContentPatcherProjectDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPlannedPatch {
    pub id: String,
    pub action: String,
    pub target: String,
    pub log_name: String,
    pub from_file: Option<String>,
    pub when: BTreeMap<String, Value>,
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPatchPlan {
    pub patches: Vec<ContentPatcherPlannedPatch>,
}
