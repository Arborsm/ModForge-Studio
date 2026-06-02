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

use crate::domain::launcher::types::LauncherSettings;

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}
