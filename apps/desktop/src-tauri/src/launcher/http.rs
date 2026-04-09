use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use std::time::Duration;

pub(crate) const DEFAULT_GAME_ID: i64 = 1303;
pub(crate) const LAUNCHER_USER_AGENT: &str = "ModForge Studio/0.1";

pub(crate) fn launcher_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to create launcher HTTP client: {error}"))
}

pub(crate) fn api_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(LAUNCHER_USER_AGENT));
    headers.insert(
        "apikey",
        HeaderValue::from_str(api_key)
            .map_err(|error| format!("Failed to encode launcher Nexus API key header: {error}"))?,
    );
    Ok(headers)
}
