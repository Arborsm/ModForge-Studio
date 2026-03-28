use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameDirectoryInfo {
    pub root_path: String,
    pub executable_path: String,
    pub maps_path: Option<String>,
    pub map_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapAssetSummary {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub format: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventAssetSummary {
    pub id: String,
    pub name: String,
    pub file_name: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapAssetContent {
    pub name: String,
    pub format: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextAssetContent {
    pub absolute_path: String,
    pub relative_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTextFileContent {
    pub absolute_path: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultSaveSlotSummary {
    pub slot_name: String,
    pub folder_path: String,
    pub file_path: String,
    pub modified_time_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAssetSummary {
    pub cue: String,
    pub kind: String,
    pub absolute_path: String,
    pub relative_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCacheStats {
    pub root_path: String,
    pub entry_count: usize,
    pub total_size_bytes: u64,
}
