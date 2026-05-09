pub mod archive;
pub mod discovery;
pub mod downloads;
pub mod fs;
pub mod http;
pub mod image_cache;
pub mod install_manager;
pub mod library;
pub mod paths;
pub mod remote;
pub mod runtime;
pub mod settings;
pub mod shared;
pub mod trace;
pub mod types;
pub mod update_cache;
pub mod updates;
pub mod accelerater;
pub mod public_html_webview;

use types::LauncherSettings;

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        || settings
            .nexus_cookie
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
}
