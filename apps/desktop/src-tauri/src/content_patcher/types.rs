use serde::Serialize;

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
