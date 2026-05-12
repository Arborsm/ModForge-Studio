use reqwest::blocking::Response;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;

use crate::domain::nexusmods::http;

fn daily_quota_state() -> &'static AtomicU64 {
    static STATE: OnceLock<AtomicU64> = OnceLock::new();
    STATE.get_or_init(|| AtomicU64::new(u64::MAX))
}

fn hourly_quota_state() -> &'static AtomicU64 {
    static STATE: OnceLock<AtomicU64> = OnceLock::new();
    STATE.get_or_init(|| AtomicU64::new(u64::MAX))
}

fn daily_reset_state() -> &'static AtomicU64 {
    static STATE: OnceLock<AtomicU64> = OnceLock::new();
    STATE.get_or_init(|| AtomicU64::new(0))
}

fn hourly_reset_state() -> &'static AtomicU64 {
    static STATE: OnceLock<AtomicU64> = OnceLock::new();
    STATE.get_or_init(|| AtomicU64::new(0))
}

pub(crate) fn daily_quota_remaining() -> Option<u64> {
    let val = daily_quota_state().load(Ordering::Relaxed);
    if val == u64::MAX {
        None
    } else {
        Some(val)
    }
}

pub(crate) fn hourly_quota_remaining() -> Option<u64> {
    let val = hourly_quota_state().load(Ordering::Relaxed);
    if val == u64::MAX {
        None
    } else {
        Some(val)
    }
}

pub(crate) fn daily_quota_reset_at() -> Option<u64> {
    let val = daily_reset_state().load(Ordering::Relaxed);
    if val == 0 {
        None
    } else {
        Some(val)
    }
}

pub(crate) fn hourly_quota_reset_at() -> Option<u64> {
    let val = hourly_reset_state().load(Ordering::Relaxed);
    if val == 0 {
        None
    } else {
        Some(val)
    }
}

fn parse_u64_header(response: &Response, name: &str) -> Option<u64> {
    response
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
}

fn update_quota(response: &Response) {
    if let Some(val) = parse_u64_header(response, "X-RL-Daily-Remaining") {
        daily_quota_state().store(val, Ordering::Relaxed);
    }
    if let Some(val) = parse_u64_header(response, "X-RL-Hourly-Remaining") {
        hourly_quota_state().store(val, Ordering::Relaxed);
    }
    if let Some(val) = parse_u64_header(response, "X-RL-Daily-Reset") {
        daily_reset_state().store(val, Ordering::Relaxed);
    }
    if let Some(val) = parse_u64_header(response, "X-RL-Hourly-Reset") {
        hourly_reset_state().store(val, Ordering::Relaxed);
    }
}

// ---- Error type ----

#[derive(Debug, thiserror::Error)]
pub(crate) enum NexusRestError {
    #[error("Not authenticated: no API Key configured")]
    NotAuthenticated,

    #[error("Invalid API Key: the Nexus Mods API rejected the provided key (HTTP 401)")]
    InvalidApiKey,

    #[error("Rate limited: daily_remaining={daily_remaining:?}, hourly_remaining={hourly_remaining:?}, reset_at={reset_at:?}")]
    RateLimited {
        daily_remaining: Option<u64>,
        hourly_remaining: Option<u64>,
        reset_at: Option<u64>,
    },

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not found: the requested resource does not exist")]
    NotFound,

    #[error("API error: HTTP {status} — {message}")]
    ApiError { status: u16, message: String },
}

impl Serialize for NexusRestError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

// ---- Request/Response types ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct UserInfo {
    pub user_id: u64,
    pub key: String,
    pub name: String,
    pub is_premium: bool,
    pub is_supporter: bool,
    pub email: String,
    pub profile_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ModInfo {
    pub name: String,
    pub summary: String,
    pub mod_id: u64,
    pub game_id: u64,
    pub mod_downloads: u64,
    pub mod_endorsements: u64,
    pub author: String,
    pub uploaded_by: String,
    pub uploaded_users_profile_url: String,
    pub created_timestamp: u64,
    pub updated_timestamp: u64,
    pub category_name: String,
    pub mod_url: String,
    pub picture_url: Option<String>,
    pub contains_adult_content: bool,
    pub allow_rating: bool,
    pub domain_name: String,
    pub available: bool,
    pub status: String,
    pub user: ModUserInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ModUserInfo {
    pub name: String,
    pub member_group_id: u64,
    pub member_id: u64,
}

// ---- Internal helpers ----

/// Send a GET request to a Nexus REST v1 endpoint and deserialize the response.
///
/// Uses send_nexus_request (which handles throttle + retry internally),
/// extracts daily quota from response headers, and maps HTTP errors to NexusRestError.
fn send_rest_request<T: serde::de::DeserializeOwned>(
    api_key: &str,
    endpoint: &str,
) -> Result<T, NexusRestError> {
    let url = format!("{}{endpoint}", super::NEXUS_REST_BASE);
    let headers = http::api_headers(api_key).map_err(|_| NexusRestError::NotAuthenticated)?;

    let client = http::launcher_http_client().map_err(|_| NexusRestError::NotAuthenticated)?;

    let response = http::send_nexus_request(|| client.get(&url).headers(headers.clone()).send())
        .map_err(|error| NexusRestError::ApiError {
            status: 0,
            message: error,
        })?;

    update_quota(&response);

    let status = response.status();
    match status {
        StatusCode::OK => {
            let body: Value = response.json().map_err(|error| NexusRestError::ApiError {
                status: 200,
                message: format!("Failed to decode response JSON: {error}"),
            })?;
            serde_json::from_value(body).map_err(|error| NexusRestError::ApiError {
                status: 200,
                message: format!("Failed to deserialize response: {error}"),
            })
        }
        StatusCode::UNAUTHORIZED => Err(NexusRestError::InvalidApiKey),
        StatusCode::FORBIDDEN => {
            let message = response
                .text()
                .unwrap_or_else(|_| "Access denied by Nexus Mods.".to_string());
            Err(NexusRestError::Forbidden(message))
        }
        StatusCode::NOT_FOUND => Err(NexusRestError::NotFound),
        StatusCode::TOO_MANY_REQUESTS => Err(NexusRestError::RateLimited {
            daily_remaining: daily_quota_remaining(),
            hourly_remaining: hourly_quota_remaining(),
            reset_at: hourly_quota_reset_at().or_else(daily_quota_reset_at),
        }),
        _ => {
            let message = format!("HTTP {status}");
            Err(NexusRestError::ApiError {
                status: status.as_u16(),
                message,
            })
        }
    }
}

// ---- Public API functions ----

/// Validate API key and return user info (including premium status).
pub(crate) fn validate_user(api_key: &str) -> Result<UserInfo, NexusRestError> {
    send_rest_request(api_key, "/users/validate.json")
}

/// Get details for a specific mod.
pub(crate) fn get_mod(api_key: &str, domain: &str, mod_id: u64) -> Result<ModInfo, NexusRestError> {
    let endpoint = format!("/games/{domain}/mods/{mod_id}.json");
    send_rest_request(api_key, &endpoint)
}

#[cfg(test)]
mod tests {
    use super::UserInfo;

    #[test]
    fn user_info_deserializes_nexus_rest_validate_response() {
        let payload = r#"{
            "user_id": 123,
            "key": "api-key",
            "name": "ApiPilot",
            "is_premium": true,
            "is_supporter": false,
            "email": "pilot@example.com",
            "profile_url": "https://www.nexusmods.com/users/123"
        }"#;

        let info: UserInfo = serde_json::from_str(payload).expect("Nexus REST user payload");

        assert_eq!(info.user_id, 123);
        assert_eq!(info.name, "ApiPilot");
        assert!(info.is_premium);
        assert_eq!(info.profile_url, "https://www.nexusmods.com/users/123");
    }
}
