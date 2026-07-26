use crate::support::logging::{LogEvent, targets};
use anyhow::Context;
use reqwest::StatusCode;
use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, USER_AGENT};
use serde_json::Value;
use std::error::Error;
use std::sync::{
    Mutex, OnceLock,
    atomic::{AtomicU64, Ordering},
};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub(crate) const LAUNCHER_USER_AGENT: &str = "ModForge Studio/0.1";
pub(crate) const PUBLIC_BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
pub(crate) const LAUNCHER_APP_NAME: &str = "ModForge Studio";
pub(crate) const LAUNCHER_APP_VERSION: &str = "0.1";

const NEXUS_REQUEST_INTERVAL_MIN_MS: u64 = 45;
const NEXUS_REQUEST_INTERVAL_MAX_MS: u64 = 80;
const NEXUS_DEFAULT_RETRY_ATTEMPTS: usize = 4;

#[derive(Clone, Copy, Debug)]
pub(crate) enum NexusRetryDelay {
    HeaderOrJitter,
    Exponential { base_ms: u64, max_ms: u64 },
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct NexusRetryPolicy {
    label: &'static str,
    max_retries: usize,
    delay: NexusRetryDelay,
    throttle: bool,
}

impl NexusRetryPolicy {
    const fn new(
        label: &'static str,
        max_retries: usize,
        delay: NexusRetryDelay,
        throttle: bool,
    ) -> Self {
        Self {
            label,
            max_retries,
            delay,
            throttle,
        }
    }

    pub(crate) fn max_retries(self) -> usize {
        self.max_retries
    }
}

const DEFAULT_NEXUS_RETRY_POLICY: NexusRetryPolicy = NexusRetryPolicy::new(
    "nexus",
    NEXUS_DEFAULT_RETRY_ATTEMPTS,
    NexusRetryDelay::HeaderOrJitter,
    true,
);
pub(crate) const LAUNCHER_IMAGE_CDN_RETRY_POLICY: NexusRetryPolicy = NexusRetryPolicy::new(
    "launcher image CDN",
    3,
    NexusRetryDelay::Exponential {
        base_ms: 250,
        max_ms: 2_000,
    },
    false,
);

#[derive(Debug)]
struct NexusThrottleState {
    last_request_started_at: Option<Instant>,
}

pub(crate) fn launcher_http_client() -> anyhow::Result<Client> {
    Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .build()
        .with_context(|| format!("Failed to create launcher HTTP client"))
}

fn nexus_throttle_state() -> &'static Mutex<NexusThrottleState> {
    static STATE: OnceLock<Mutex<NexusThrottleState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(NexusThrottleState {
            last_request_started_at: None,
        })
    })
}

fn nexus_request_delay_seed_state() -> &'static AtomicU64 {
    static STATE: OnceLock<AtomicU64> = OnceLock::new();
    STATE.get_or_init(|| AtomicU64::new(1))
}

fn next_nexus_request_delay_seed() -> u64 {
    let time_seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos() as u64)
        .unwrap_or_default();
    let counter_seed = nexus_request_delay_seed_state().fetch_add(1, Ordering::Relaxed);
    time_seed ^ counter_seed.rotate_left(17) ^ 0x9E37_79B9_7F4A_7C15
}

fn nexus_request_delay_for_seed(seed: u64) -> Duration {
    let span = NEXUS_REQUEST_INTERVAL_MAX_MS - NEXUS_REQUEST_INTERVAL_MIN_MS;
    let mixed = seed ^ seed.rotate_left(13) ^ seed.wrapping_mul(0xA24B_AED4_963E_E407);
    let jitter = mixed % (span + 1);
    Duration::from_millis(NEXUS_REQUEST_INTERVAL_MIN_MS + jitter)
}

#[cfg(test)]
pub(crate) fn nexus_request_delay_for_test(seed: u64) -> Duration {
    nexus_request_delay_for_seed(seed)
}

pub(crate) fn apply_launcher_headers(headers: &mut HeaderMap) {
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

pub(crate) fn with_nexus_request_slot<T, F>(operation: F) -> T
where
    F: FnOnce() -> T,
{
    {
        let mut state = nexus_throttle_state()
            .lock()
            .expect("launcher nexus throttle mutex should not be poisoned");
        if let Some(previous_started_at) = state.last_request_started_at {
            let elapsed = previous_started_at.elapsed();
            let minimum_interval = nexus_request_delay_for_seed(next_nexus_request_delay_seed());
            if elapsed < minimum_interval {
                thread::sleep(minimum_interval - elapsed);
            }
        }
        state.last_request_started_at = Some(Instant::now());
    }

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

fn parse_retry_after_seconds(headers: &HeaderMap) -> Option<Duration> {
    headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs)
}

fn parse_rate_limit_reset_delay(headers: &HeaderMap) -> Option<Duration> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();

    ["x-rl-hourly-reset", "x-rl-daily-reset"]
        .iter()
        .filter_map(|header| {
            headers
                .get(*header)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse::<u64>().ok())
        })
        .filter(|reset| *reset > now)
        .map(|reset| Duration::from_secs(reset - now))
        .min()
}

pub(crate) fn retry_delay_from_headers(headers: &HeaderMap, attempt: usize) -> Duration {
    parse_retry_after_seconds(headers)
        .or_else(|| parse_rate_limit_reset_delay(headers))
        .unwrap_or_else(|| {
            let mut seed = next_nexus_request_delay_seed() ^ ((attempt as u64 + 1) * 0x9E37_79B9);
            if seed == 0 {
                seed = 1;
            }
            nexus_request_delay_for_seed(seed)
        })
}

fn exponential_retry_delay(base_ms: u64, max_ms: u64, attempt: usize) -> Duration {
    let multiplier = 1_u64.checked_shl(attempt as u32).unwrap_or(u64::MAX);
    Duration::from_millis(base_ms.saturating_mul(multiplier).min(max_ms))
}

pub(crate) fn retry_delay_for_policy(
    policy: NexusRetryPolicy,
    headers: Option<&HeaderMap>,
    attempt: usize,
) -> Duration {
    if let Some(delay) = headers.and_then(|value| {
        parse_retry_after_seconds(value).or_else(|| parse_rate_limit_reset_delay(value))
    }) {
        return delay;
    }

    match policy.delay {
        NexusRetryDelay::HeaderOrJitter => retry_delay_from_headers(&HeaderMap::new(), attempt),
        NexusRetryDelay::Exponential { base_ms, max_ms } => {
            exponential_retry_delay(base_ms, max_ms, attempt)
        }
    }
}

fn reqwest_error_with_sources(error: &reqwest::Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(error_source) = source {
        message.push_str("; cause=");
        message.push_str(&error_source.to_string());
        source = error_source.source();
    }
    message
}

pub(crate) fn send_nexus_request<F>(mut send: F) -> anyhow::Result<Response>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    send_nexus_request_with_policy(DEFAULT_NEXUS_RETRY_POLICY, &mut send)
}

pub(crate) fn send_nexus_request_with_policy<F>(
    policy: NexusRetryPolicy,
    mut send: F,
) -> anyhow::Result<Response>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut last_error = None;

    for attempt in 0..=policy.max_retries {
        let outcome = if policy.throttle {
            with_nexus_request_slot(&mut send)
        } else {
            send()
        };
        match outcome {
            Ok(response)
                if should_retry_status(response.status()) && attempt < policy.max_retries =>
            {
                let delay = retry_delay_for_policy(policy, Some(response.headers()), attempt);
                LogEvent::new("nexus.request.retry")
                    .field("route", policy.label)
                    .field("reason", "http-status")
                    .field("status", response.status().as_u16())
                    .ms("delayMs", delay)
                    .field("retry", attempt + 1)
                    .field("maxRetries", policy.max_retries)
                    .emit_warn(targets::NEXUS);
                thread::sleep(delay);
            }
            Ok(response) => return Ok(response),
            Err(error) if attempt < policy.max_retries => {
                let delay = retry_delay_for_policy(policy, None, attempt);
                let error_message = reqwest_error_with_sources(&error);
                LogEvent::new("nexus.request.retry")
                    .field("route", policy.label)
                    .field("reason", "transport-error")
                    .ms("delayMs", delay)
                    .field("retry", attempt + 1)
                    .field("maxRetries", policy.max_retries)
                    .error(&error_message)
                    .emit_warn(targets::NEXUS);
                thread::sleep(delay);
                last_error = Some(error_message);
            }
            Err(error) => {
                last_error = Some(reqwest_error_with_sources(&error));
                break;
            }
        }
    }

    Err(last_error
        .map(|error| anyhow::anyhow!(error))
        .unwrap_or_else(|| anyhow::anyhow!("Nexus request failed without an error message.")))
}

pub(crate) fn read_nexus_response_body_with_retry<F>(mut read_body: F) -> anyhow::Result<Vec<u8>>
where
    F: FnMut() -> anyhow::Result<Vec<u8>>,
{
    read_nexus_response_body_with_retry_policy(DEFAULT_NEXUS_RETRY_POLICY, &mut read_body)
}

pub(crate) fn read_nexus_response_body_with_retry_policy<T, F>(
    policy: NexusRetryPolicy,
    mut read_body: F,
) -> anyhow::Result<T>
where
    F: FnMut() -> anyhow::Result<T>,
{
    let mut last_error = None;

    for attempt in 0..=policy.max_retries {
        match read_body() {
            Ok(body) => return Ok(body),
            Err(error) if attempt < policy.max_retries && should_retry_body_read_error(&error) => {
                let delay = retry_delay_for_policy(policy, None, attempt);
                LogEvent::new("nexus.request.retry")
                    .field("route", policy.label)
                    .field("reason", "body-read-error")
                    .ms("delayMs", delay)
                    .field("retry", attempt + 1)
                    .field("maxRetries", policy.max_retries)
                    .error(&error)
                    .emit_warn(targets::NEXUS);
                thread::sleep(delay);
                last_error = Some(error);
            }
            Err(error) => {
                last_error = Some(error);
                break;
            }
        }
    }

    Err(last_error
        .map(|error| anyhow::anyhow!(error))
        .unwrap_or_else(|| {
            anyhow::anyhow!("Nexus response body read failed without an error message.")
        }))
}

fn should_retry_body_read_error(error: &impl std::fmt::Display) -> bool {
    let normalized = error.to_string().trim().to_ascii_lowercase();
    normalized.contains("error decoding response body")
        || normalized.contains("unexpected eof")
        || normalized.contains("connection reset")
        || normalized.contains("channel closed")
}

pub(crate) fn send_nexus_json_request<F>(send: F) -> anyhow::Result<(StatusCode, Value)>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut send = send;
    let mut status = StatusCode::OK;
    let body = read_nexus_response_body_with_retry(|| {
        let response = send_nexus_request(&mut send)?;
        status = response.status();
        if !status.is_success() {
            return Ok(Vec::new());
        }

        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(anyhow::Error::msg)
    })?;
    if !status.is_success() {
        return Ok((status, Value::Null));
    }

    let payload = serde_json::from_slice::<Value>(&body)?;
    Ok((status, payload))
}

pub(crate) fn api_headers(api_key: &str) -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);
    headers.insert(
        "apikey",
        HeaderValue::from_str(api_key)
            .with_context(|| format!("Failed to encode launcher Nexus API key header"))?,
    );
    Ok(headers)
}

#[cfg(test)]
#[path = "../../tests/integration/nexusmods_http_tests.rs"]
mod nexusmods_http_tests;
