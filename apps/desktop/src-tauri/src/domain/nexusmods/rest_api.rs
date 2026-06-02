pub mod client;
pub mod downloads;

pub(crate) use client::{
    daily_quota_remaining, daily_quota_reset_at, get_mod, hourly_quota_remaining,
    hourly_quota_reset_at, validate_user,
};

pub(crate) const NEXUS_REST_BASE: &str = super::endpoints::REST_V1_BASE;
pub(crate) const TRENDING_ENDPOINT: &str = super::endpoints::REST_TRENDING;

pub(crate) fn mod_files_endpoint(mod_id: i64) -> String {
    format!("{NEXUS_REST_BASE}/games/stardewvalley/mods/{mod_id}/files.json")
}

pub(crate) fn download_link_endpoint(mod_id: i64, file_id: i64) -> String {
    format!(
        "{NEXUS_REST_BASE}/games/stardewvalley/mods/{mod_id}/files/{file_id}/download_link.json"
    )
}
