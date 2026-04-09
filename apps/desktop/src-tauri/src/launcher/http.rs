use reqwest::blocking::{Client, Response};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, USER_AGENT};
use reqwest::StatusCode;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

pub(crate) const DEFAULT_GAME_ID: i64 = 1303;
pub(crate) const LAUNCHER_USER_AGENT: &str = "ModForge Studio/0.1";
pub(crate) const LAUNCHER_APP_NAME: &str = "ModForge Studio";
pub(crate) const LAUNCHER_APP_VERSION: &str = "0.1";

const NEXUS_REQUEST_INTERVAL_MS: u64 = 650;
const NEXUS_RETRY_ATTEMPTS: usize = 4;

#[derive(Debug)]
struct NexusThrottleState {
    last_request_started_at: Option<Instant>,
}

pub(crate) fn launcher_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to create launcher HTTP client: {error}"))
}

fn nexus_throttle_state() -> &'static Mutex<NexusThrottleState> {
    static STATE: OnceLock<Mutex<NexusThrottleState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(NexusThrottleState {
            last_request_started_at: None,
        })
    })
}

fn apply_launcher_headers(headers: &mut HeaderMap) {
    headers.insert(USER_AGENT, HeaderValue::from_static(LAUNCHER_USER_AGENT));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(
        "Application-Name",
        HeaderValue::from_static(LAUNCHER_APP_NAME),
    );
    headers.insert(
        "Application-Version",
        HeaderValue::from_static(LAUNCHER_APP_VERSION),
    );
}

fn with_nexus_request_slot<T, F>(operation: F) -> T
where
    F: FnOnce() -> T,
{
    let mut state = nexus_throttle_state()
        .lock()
        .expect("launcher nexus throttle mutex should not be poisoned");
    if let Some(previous_started_at) = state.last_request_started_at {
        let elapsed = previous_started_at.elapsed();
        let minimum_interval = Duration::from_millis(NEXUS_REQUEST_INTERVAL_MS);
        if elapsed < minimum_interval {
            thread::sleep(minimum_interval - elapsed);
        }
    }
    state.last_request_started_at = Some(Instant::now());
    operation()
}

fn should_retry_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS
        || status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::BAD_GATEWAY
        || status == StatusCode::SERVICE_UNAVAILABLE
        || status == StatusCode::GATEWAY_TIMEOUT
        || status.is_server_error()
}

fn retry_delay(response: Option<&Response>, attempt: usize) -> Duration {
    let retry_after = response
        .and_then(|value| value.headers().get("retry-after"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    retry_after.unwrap_or_else(|| Duration::from_millis(800 * (1_u64 << attempt.min(5))))
}

pub(crate) fn send_nexus_request<F>(mut send: F) -> Result<Response, String>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut last_error = None;

    for attempt in 0..=NEXUS_RETRY_ATTEMPTS {
        let outcome = with_nexus_request_slot(&mut send);
        match outcome {
            Ok(response) if should_retry_status(response.status()) && attempt < NEXUS_RETRY_ATTEMPTS => {
                let delay = retry_delay(Some(&response), attempt);
                log::warn!(
                    "retrying nexus request after HTTP {} in {:?} (attempt {})",
                    response.status(),
                    delay,
                    attempt + 1
                );
                thread::sleep(delay);
            }
            Ok(response) => return Ok(response),
            Err(error) if attempt < NEXUS_RETRY_ATTEMPTS => {
                let delay = retry_delay(None, attempt);
                log::warn!(
                    "retrying nexus request after transport error in {:?} (attempt {}): {}",
                    delay,
                    attempt + 1,
                    error
                );
                thread::sleep(delay);
                last_error = Some(error.to_string());
            }
            Err(error) => {
                last_error = Some(error.to_string());
                break;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Nexus request failed without an error message.".to_string()))
}

pub(crate) fn api_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);
    headers.insert(
        "apikey",
        HeaderValue::from_str(api_key)
            .map_err(|error| format!("Failed to encode launcher Nexus API key header: {error}"))?,
    );
    Ok(headers)
}

pub(crate) fn graphql_headers(
    api_key: Option<&str>,
    cookie: Option<&str>,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);

    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            "apikey",
            HeaderValue::from_str(api_key).map_err(|error| {
                format!("Failed to encode launcher Nexus GraphQL API key header: {error}")
            })?,
        );
    }

    if let Some(cookie) = cookie.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            COOKIE,
            HeaderValue::from_str(cookie)
                .map_err(|error| format!("Failed to encode launcher Nexus cookie header: {error}"))?,
        );
    }

    if !headers.contains_key("apikey") && !headers.contains_key(COOKIE) {
        return Err("Configure a Nexus API key or cookie before querying Nexus Mods.".to_string());
    }

    Ok(headers)
}
