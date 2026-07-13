use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NexusRouteStatus {
    Loading,
    Warning,
    Success,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusRouteSnapshot {
    pub route_id: String,
    pub label: String,
    pub endpoint: String,
    pub status: NexusRouteStatus,
    pub attempts: u8,
    pub max_attempts: u8,
    pub available: bool,
    pub latency_ms: Option<u64>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NexusDiagnosticsResult {
    pub routes: Vec<NexusRouteSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateApiKeyResult {
    pub user_name: String,
    pub avatar_url: Option<String>,
    pub profile_url: Option<String>,
    pub is_premium: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub premium_expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_lifetime_premium: Option<bool>,
    pub daily_remaining: Option<u64>,
    pub hourly_remaining: Option<u64>,
    pub daily_reset_at: Option<u64>,
    pub hourly_reset_at: Option<u64>,
}
