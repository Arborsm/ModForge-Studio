use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultSaveSlotSummary {
    pub slot_name: String,
    pub folder_path: String,
    pub file_path: String,
    pub modified_time_ms: u128,
}
