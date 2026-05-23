use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NexusRouteStatus {
    Loading,
    Warning,
    Success,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusRouteSnapshot {
    pub route_id: String,
    pub label: String,
    pub endpoint: String,
    pub status: NexusRouteStatus,
    pub attempts: u8,
    pub max_attempts: u8,
    pub available: bool,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusDiagnosticsResult {
    pub routes: Vec<NexusRouteSnapshot>,
}
