use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SimulationContext {
    pub season: Option<String>,
    pub weather: Option<String>,
    pub config: BTreeMap<String, Value>,
    pub installed_mods: Vec<String>,
    pub custom_tokens: BTreeMap<String, Value>,
}
