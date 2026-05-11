pub mod catalog;
pub mod downloads;
pub mod http;
pub mod mod_detail;
pub mod rest_api;
pub mod shared;
pub mod sso;
pub mod updates;

use crate::domain::launcher::types::LauncherSettings;

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}
