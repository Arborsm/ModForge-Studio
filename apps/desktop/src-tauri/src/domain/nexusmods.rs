pub mod diagnostics;
pub mod endpoints;
pub mod graphql;
pub mod http;
pub mod probes;
pub mod rest_api;
pub mod routes;
pub mod shared;
pub mod sso;
pub mod types;

pub use graphql::catalog;
pub use graphql::mod_detail;
pub use graphql::updates;
pub use rest_api::downloads;

use crate::AppHandle;
use crate::domain::launcher::types::LauncherSettings;

use self::types::ValidateApiKeyResult;

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}

fn optional_nexus_value_as_string(value: Option<serde_json::Value>) -> Option<String> {
    match value? {
        serde_json::Value::String(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        serde_json::Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

pub(crate) fn validate_nexus_api_key(app: AppHandle) -> Result<ValidateApiKeyResult, String> {
    let settings = crate::domain::launcher::settings::load_launcher_settings(app)?;
    let api_key = settings.nexus_api_key.as_deref().unwrap_or("");
    log::info!(
        target: "Nexus",
        "Validate API key requested: api-key-present={} api-key-length={}",
        !api_key.trim().is_empty(),
        api_key.len()
    );
    let user_info = rest_api::validate_user(api_key).map_err(|e| e.to_string())?;
    let avatar_url = graphql::load_user_avatar(api_key, user_info.user_id)
        .map_err(|error| {
            log::warn!(target: "Nexus", "User avatar lookup failed: error={error}");
            error
        })
        .ok()
        .flatten();
    Ok(ValidateApiKeyResult {
        user_name: user_info.name,
        avatar_url,
        profile_url: Some(user_info.profile_url),
        is_premium: user_info.is_premium,
        premium_expires_at: optional_nexus_value_as_string(user_info.premium_expires_at),
        is_lifetime_premium: user_info.is_lifetime_premium,
        daily_remaining: rest_api::daily_quota_remaining(),
        hourly_remaining: rest_api::hourly_quota_remaining(),
        daily_reset_at: rest_api::daily_quota_reset_at(),
        hourly_reset_at: rest_api::hourly_quota_reset_at(),
    })
}
