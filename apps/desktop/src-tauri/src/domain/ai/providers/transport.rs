use super::super::jobs::AiJobGuard;
use super::super::presets::provider_preset;
use super::super::settings::validate_base_url;
use super::super::types::{AiAuthentication, AiProtocol, AiProviderProfile};
use anyhow::Context;
use reqwest::StatusCode;
use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, RETRY_AFTER};
use serde_json::Value;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub(crate) const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
// Translation batches carry up to 32 items and a strict JSON schema; slow
// providers can legitimately take longer than one minute to generate the full
// response, so the request budget is generous. Transient timeouts are retried
// below, so the per-batch worst case is (MAX_RETRIES + 1) x REQUEST_TIMEOUT.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
// Streaming requests trade the overall deadline for a per-chunk idle timeout:
// the client budget below only guards against a wedged connection, while
// STREAM_IDLE_TIMEOUT bounds the gap between consecutive chunks.
pub(crate) const STREAMING_TOTAL_BUDGET: Duration = Duration::from_secs(600);
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const MAX_RETRIES: usize = 2;
// Backend payload limits. The batch/item caps mirror the frontend batching
// budget so a manual or legacy request can never exceed what the UI would
// produce; the serialized envelope is larger because it carries the prompt and
// the strict JSON schema alongside the items.
pub(crate) const MAX_REQUEST_BYTES: usize = 512 * 1024;
pub(crate) const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_ERROR_RESPONSE_BYTES: usize = 64 * 1024;
pub(crate) const MAX_BATCH_BYTES: usize = 256 * 1024;
pub(crate) const MAX_ITEM_BYTES: usize = 32 * 1024;
pub(crate) const MAX_BATCH_ITEMS: usize = 32;

#[derive(Debug, Clone, Default)]
pub(crate) struct ProviderUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
}

#[derive(Debug, Clone)]
pub(crate) struct ProviderAttempt {
    pub attempt: u32,
    pub succeeded: bool,
    pub latency_ms: u64,
    pub failure_category: Option<String>,
    pub response_characters: u64,
    pub usage: ProviderUsage,
    /// The structured-output capability level this attempt was sent with
    /// (`json-schema` / `json-object` / `tool-use` / `none`). `None` when the
    /// call did not participate in structured-output forcing (e.g. /models).
    pub structured_output: Option<String>,
}

/// A non-retryable HTTP rejection carrying its status code so the structured-
/// output degradation layer can tell a 400 "response_format unsupported" apart
/// from other failures (model errors, bad payloads, …).
#[derive(Debug)]
struct ProviderHttpError {
    status: StatusCode,
    detail: String,
}

impl std::fmt::Display for ProviderHttpError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "AI provider request failed ({}): {}",
            self.status, self.detail
        )
    }
}

impl std::error::Error for ProviderHttpError {}

/// Recovers the HTTP status from an error raised by `response_error`.
pub(crate) fn http_status_of(error: &anyhow::Error) -> Option<StatusCode> {
    error
        .downcast_ref::<ProviderHttpError>()
        .map(|error| error.status)
}

pub(crate) fn client() -> anyhow::Result<Client> {
    client_with_timeouts(CONNECT_TIMEOUT, REQUEST_TIMEOUT)
}

pub(crate) fn client_with_timeouts(
    connect_timeout: Duration,
    request_timeout: Duration,
) -> anyhow::Result<Client> {
    Client::builder()
        .connect_timeout(connect_timeout)
        .timeout(request_timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("Failed to create the AI HTTP client.")
}

pub(crate) fn endpoint(profile: &AiProviderProfile, suffix: &str) -> anyhow::Result<String> {
    Ok(format!(
        "{}/{}",
        validate_base_url(&profile.base_url, profile.allow_insecure_http)?,
        suffix.trim_start_matches('/')
    ))
}

pub(crate) fn authenticated(
    request: RequestBuilder,
    profile: &AiProviderProfile,
    credential: Option<&str>,
) -> anyhow::Result<RequestBuilder> {
    let authentication = provider_preset(&profile.preset_id)
        .filter(|preset| preset.protocol == profile.protocol)
        .map(|preset| preset.authentication)
        .unwrap_or_else(|| match profile.protocol {
            AiProtocol::AnthropicMessages => AiAuthentication::AnthropicApiKey,
            AiProtocol::OpenaiResponses | AiProtocol::OpenaiChatCompletions => {
                AiAuthentication::Bearer
            }
        });
    if authentication == AiAuthentication::None {
        return Ok(request);
    }
    let credential = credential.context("No API key is available for the selected AI profile.")?;
    Ok(match authentication {
        AiAuthentication::AnthropicApiKey => request
            .header("x-api-key", credential)
            .header("anthropic-version", "2023-06-01"),
        AiAuthentication::Bearer => request.header(AUTHORIZATION, format!("Bearer {credential}")),
        AiAuthentication::None => unreachable!(),
    })
}

pub(crate) fn retry_delay(response: &Response, attempt: usize) -> Duration {
    response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            value.parse::<u64>().ok().or_else(|| {
                time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc2822)
                    .ok()
                    .map(|deadline| {
                        (deadline - time::OffsetDateTime::now_utc())
                            .whole_seconds()
                            .max(0) as u64
                    })
            })
        })
        .map(|seconds| Duration::from_secs(seconds.min(30)))
        .unwrap_or_else(|| Duration::from_secs(1_u64 << attempt.min(4)))
}

pub(crate) fn response_error(status: StatusCode, body: &str) -> anyhow::Error {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| {
            status
                .canonical_reason()
                .unwrap_or("request failed")
                .to_string()
        });
    anyhow::Error::new(ProviderHttpError {
        status,
        detail: detail.chars().take(500).collect::<String>(),
    })
}

/// Why reading a response body failed: an oversized provider response (a
/// deterministic provider misbehavior that must never be retried) or a transient
/// transport failure such as an idle read timeout or a connection reset.
pub(crate) enum ReadBodyFailure {
    TooLarge,
    Transport(anyhow::Error),
}

pub(crate) fn read_response_body(
    response: Response,
    limit: usize,
) -> Result<Vec<u8>, ReadBodyFailure> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(ReadBodyFailure::TooLarge);
    }
    let mut body =
        Vec::with_capacity(response.content_length().unwrap_or(0).min(limit as u64) as usize);
    response
        .take(limit as u64 + 1)
        .read_to_end(&mut body)
        .context("Failed to read the AI provider response.")
        .map_err(ReadBodyFailure::Transport)?;
    if body.len() > limit {
        return Err(ReadBodyFailure::TooLarge);
    }
    Ok(body)
}

pub(crate) fn oversized_response_error(limit: usize) -> anyhow::Error {
    anyhow::anyhow!("AI provider response exceeds the {limit} byte limit.")
}

/// The kind of incremental text carried by a streaming translation delta.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum StreamDeltaKind {
    /// The translation JSON text being generated for the batch.
    Content,
    /// Provider chain-of-thought (DeepSeek `reasoning_content`, Responses
    /// reasoning summary deltas).
    Reasoning,
}

/// One incremental delta extracted from a provider SSE stream.
#[derive(Debug, Clone)]
pub(crate) struct AiStreamDelta {
    pub kind: StreamDeltaKind,
    pub text: String,
}

/// One finished SSE event: the optional `event:` name (empty when the stream
/// uses anonymous `data:` events, as chat-completions does) plus the joined
/// `data:` payload.
#[derive(Debug, Clone)]
pub(crate) struct SseEventPayload {
    pub event: Option<String>,
    pub data: String,
}

/// Incrementally assembles SSE events from raw response bytes.
///
/// A line starting with `data:` appends to the current event (multiple `data:`
/// lines join with `\n`, per the SSE spec); `event:` names it; a blank line
/// finalizes it. Lines without a trailing `\n` are kept in the buffer until the
/// next push, and partial UTF-8 sequences are never split across buffer flushes.
pub(crate) struct SseLineAccumulator {
    buffer: Vec<u8>,
}

impl Default for SseLineAccumulator {
    fn default() -> Self {
        Self::new()
    }
}

impl SseLineAccumulator {
    pub(crate) fn new() -> Self {
        Self { buffer: Vec::new() }
    }

    /// Feeds a raw chunk and returns the finished events it completed.
    pub(crate) fn push(&mut self, chunk: &[u8]) -> Vec<SseEventPayload> {
        self.buffer.extend_from_slice(chunk);
        let mut events = Vec::new();
        let mut current_data: Option<String> = None;
        let mut current_event: Option<String> = None;
        loop {
            let Some(newline) = self.buffer.iter().position(|byte| *byte == b'\n') else {
                break;
            };
            let raw: Vec<u8> = self.buffer.drain(..=newline).collect();
            let line = String::from_utf8_lossy(&raw[..raw.len() - 1]);
            let line = line.trim_end_matches('\r');
            if let Some(payload) = line.strip_prefix("data:") {
                let payload = payload.trim_start();
                match current_data.as_mut() {
                    Some(existing) => {
                        existing.push('\n');
                        existing.push_str(payload);
                    }
                    None => current_data = Some(payload.to_string()),
                }
            } else if let Some(name) = line.strip_prefix("event:") {
                current_event = Some(name.trim().to_string());
            } else if line.is_empty() {
                if let Some(data) = current_data.take() {
                    events.push(SseEventPayload {
                        event: current_event.take(),
                        data,
                    });
                }
            }
            // Other SSE lines (`id:`, `:comment`) are ignored.
        }
        events
    }
}

/// Extracts the incremental text from one finished SSE event for the given
/// protocol. `None` means the event carried no renderable delta (`[DONE]`,
/// keep-alive comments, usage chunks, or an unrelated named event).
pub(crate) fn extract_stream_delta(
    protocol: AiProtocol,
    event: Option<&str>,
    data: &str,
) -> Option<AiStreamDelta> {
    if data.trim() == "[DONE]" {
        return None;
    }
    match protocol {
        AiProtocol::OpenaiChatCompletions => {
            let value: Value = serde_json::from_str(data).ok()?;
            let delta = value.pointer("/choices/0/delta")?;
            if let Some(text) = delta.get("content").and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(AiStreamDelta {
                        kind: StreamDeltaKind::Content,
                        text: text.to_string(),
                    });
                }
            }
            if let Some(text) = delta.get("reasoning_content").and_then(Value::as_str) {
                if !text.is_empty() {
                    return Some(AiStreamDelta {
                        kind: StreamDeltaKind::Reasoning,
                        text: text.to_string(),
                    });
                }
            }
            None
        }
        AiProtocol::OpenaiResponses => {
            let name = event?;
            if name.ends_with(".delta") {
                let value: Value = serde_json::from_str(data).ok()?;
                let text = value.get("delta").and_then(Value::as_str)?;
                if !text.is_empty() {
                    let kind = if name.contains("reasoning") {
                        StreamDeltaKind::Reasoning
                    } else {
                        StreamDeltaKind::Content
                    };
                    return Some(AiStreamDelta {
                        kind,
                        text: text.to_string(),
                    });
                }
            }
            None
        }
        AiProtocol::AnthropicMessages => {
            if event != Some("content_block_delta") {
                return None;
            }
            let value: Value = serde_json::from_str(data).ok()?;
            let delta = value.get("delta")?;
            let delta_type = delta.get("type").and_then(Value::as_str);
            let text = match delta_type {
                Some("text_delta") => delta.get("text").and_then(Value::as_str),
                // Structured output streams the tool input as partial JSON; the
                // frontend appends it to its accumulating preview.
                Some("input_json_delta") => delta.get("partial_json").and_then(Value::as_str),
                _ => None,
            }?;
            if !text.is_empty() {
                Some(AiStreamDelta {
                    kind: StreamDeltaKind::Content,
                    text: text.to_string(),
                })
            } else {
                None
            }
        }
    }
}

/// Whether the response advertises a streamable body (SSE or NDJSON). Endpoints
/// that ignore the `stream` flag return regular JSON, which is handled by the
/// non-streaming fallback path.
pub(crate) fn is_sse_response(response: &Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.contains("text/event-stream") || value.contains("application/x-ndjson"))
        .unwrap_or(false)
}

/// Why reading a streamed body failed. `started` records whether any chunk
/// arrived before the failure: once a stream has produced deltas it can never
/// be replayed, so callers must not retry; failures before the first chunk keep
/// the existing bounded-retry semantics.
pub(crate) struct StreamReadFailure {
    pub(crate) error: anyhow::Error,
    pub(crate) started: bool,
}

pub(crate) struct StreamOutcome {
    pub(crate) content: String,
    pub(crate) reasoning: String,
}

/// Reads an SSE response body on a background thread and emits every content or
/// reasoning delta. Idle reads (no data for STREAM_IDLE_TIMEOUT) fail instead
/// of letting the overall client budget decide, so a long but lively stream is
/// never cut off by the total timeout.
pub(crate) fn read_stream_body(
    response: Response,
    protocol: AiProtocol,
    job: Option<&AiJobGuard>,
    emit: &mut dyn FnMut(AiStreamDelta),
    limit: usize,
) -> Result<StreamOutcome, StreamReadFailure> {
    let shared = Arc::new(Mutex::new(Some(response)));
    let abort = Arc::new(AtomicBool::new(false));
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    let reader_shared = Arc::clone(&shared);
    let reader_abort = Arc::clone(&abort);
    let reader = thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            if reader_abort.load(Ordering::Acquire) {
                break;
            }
            let mut response = {
                let mut guard = reader_shared
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                match guard.take() {
                    Some(response) => response,
                    None => break,
                }
            };
            let read = response.read(&mut buffer);
            {
                let mut guard = reader_shared
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                if reader_abort.load(Ordering::Acquire) {
                    // The owner timed out; dropping the response closes the
                    // connection so the blocking read cannot linger.
                    drop(response);
                    break;
                }
                *guard = Some(response);
            }
            match read {
                Ok(0) => {
                    let _ = tx.send(Ok(Vec::new()));
                    break;
                }
                Ok(count) => {
                    if tx.send(Ok(buffer[..count].to_vec())).is_err() {
                        break;
                    }
                }
                Err(error) => {
                    let _ = tx.send(Err(error.to_string()));
                    break;
                }
            }
        }
    });

    let mut accumulator = SseLineAccumulator::new();
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut produced_any = false;
    let mut total_bytes = 0_usize;
    loop {
        if let Some(job) = job {
            if let Err(error) = job.check() {
                abort.store(true, Ordering::Release);
                drop_response(&shared);
                let _ = reader.join();
                return Err(StreamReadFailure {
                    error,
                    started: produced_any,
                });
            }
        }
        match rx.recv_timeout(STREAM_IDLE_TIMEOUT) {
            Ok(Ok(chunk)) if chunk.is_empty() => break,
            Ok(Ok(chunk)) => {
                produced_any = true;
                total_bytes += chunk.len();
                if total_bytes > limit {
                    abort.store(true, Ordering::Release);
                    drop_response(&shared);
                    let _ = reader.join();
                    return Err(StreamReadFailure {
                        error: oversized_response_error(limit),
                        started: produced_any,
                    });
                }
                for event in accumulator.push(&chunk) {
                    if let Some(delta) =
                        extract_stream_delta(protocol, event.event.as_deref(), &event.data)
                    {
                        let text = delta.text.clone();
                        match delta.kind {
                            StreamDeltaKind::Content => {
                                content.push_str(&text);
                                emit(delta);
                            }
                            StreamDeltaKind::Reasoning => {
                                reasoning.push_str(&text);
                                emit(delta);
                            }
                        }
                    }
                }
            }
            Ok(Err(error)) => {
                abort.store(true, Ordering::Release);
                drop_response(&shared);
                let _ = reader.join();
                return Err(StreamReadFailure {
                    error: anyhow::anyhow!("AI provider stream read failed: {error}"),
                    started: produced_any,
                });
            }
            Err(RecvTimeoutError::Timeout) => {
                abort.store(true, Ordering::Release);
                drop_response(&shared);
                let _ = reader.join();
                return Err(StreamReadFailure {
                    error: anyhow::anyhow!(
                        "AI provider stream went idle for more than {} seconds.",
                        STREAM_IDLE_TIMEOUT.as_secs()
                    ),
                    started: produced_any,
                });
            }
            Err(RecvTimeoutError::Disconnected) => {
                // The reader only disconnects after aborting (handled above) or
                // after sending its terminal error; treat it as a transport
                // failure so truncated streams never pass validation.
                let _ = reader.join();
                return Err(StreamReadFailure {
                    error: anyhow::anyhow!("AI provider stream ended unexpectedly."),
                    started: produced_any,
                });
            }
        }
    }
    let _ = reader.join();
    Ok(StreamOutcome { content, reasoning })
}

fn drop_response(shared: &Arc<Mutex<Option<Response>>>) {
    let mut guard = shared
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = None;
}

pub(crate) fn retry_sleep(job: Option<&AiJobGuard>, delay: Duration) -> anyhow::Result<()> {
    for _ in 0..delay.as_millis().div_ceil(100) {
        if let Some(job) = job {
            job.check()?;
        }
        thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}

pub(crate) fn send_with_retry_observed<F>(
    job: Option<&AiJobGuard>,
    mut build: F,
    mut observe: impl FnMut(ProviderAttempt),
) -> anyhow::Result<Value>
where
    F: FnMut() -> anyhow::Result<RequestBuilder>,
{
    for attempt in 0..=MAX_RETRIES {
        if let Some(job) = job {
            job.check()?;
        }
        let started = std::time::Instant::now();
        let response = match build()?.send() {
            Ok(response) => response,
            Err(error) => {
                // Transient transport failures (connect errors, resets and the
                // request timeout) are retried with the same bounded backoff as
                // 429/5xx. A single slow or flaky response must not abort an
                // entire multi-batch translation job before the retry budget is
                // exhausted.
                observe(ProviderAttempt {
                    attempt: attempt as u32 + 1,
                    succeeded: false,
                    latency_ms: started.elapsed().as_millis() as u64,
                    failure_category: Some("network".into()),
                    response_characters: 0,
                    usage: ProviderUsage::default(),
                    structured_output: None,
                });
                if attempt < MAX_RETRIES {
                    retry_sleep(job, Duration::from_secs(1_u64 << attempt.min(4)))?;
                    continue;
                }
                return Err(error).context("AI provider request could not be sent.");
            }
        };
        let status = response.status();
        if status.is_success() {
            let body = match read_response_body(response, MAX_RESPONSE_BYTES) {
                Ok(body) => body,
                // Oversized responses are a deterministic provider misbehavior;
                // retrying would just repeat the rejection, so fail immediately.
                Err(ReadBodyFailure::TooLarge) => {
                    return Err(oversized_response_error(MAX_RESPONSE_BYTES));
                }
                Err(ReadBodyFailure::Transport(error)) => {
                    // The request timeout (and stream resets) can also fire while
                    // draining the response body. Long generations pause between
                    // chunks, so a quiet body-read phase is transient: retry it
                    // with the same bounded backoff instead of failing the batch.
                    observe(ProviderAttempt {
                        attempt: attempt as u32 + 1,
                        succeeded: false,
                        latency_ms: started.elapsed().as_millis() as u64,
                        failure_category: Some("network".into()),
                        response_characters: 0,
                        usage: ProviderUsage::default(),
                        structured_output: None,
                    });
                    if attempt < MAX_RETRIES {
                        retry_sleep(job, Duration::from_secs(1_u64 << attempt.min(4)))?;
                        continue;
                    }
                    return Err(error);
                }
            };
            let value: Value =
                serde_json::from_slice(&body).context("AI provider returned invalid JSON.")?;
            observe(ProviderAttempt {
                attempt: attempt as u32 + 1,
                succeeded: true,
                latency_ms: started.elapsed().as_millis() as u64,
                failure_category: None,
                response_characters: body.len() as u64,
                usage: provider_usage(&value),
                structured_output: None,
            });
            return Ok(value);
        }
        if (status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error())
            && attempt < MAX_RETRIES
        {
            observe(ProviderAttempt {
                attempt: attempt as u32 + 1,
                succeeded: false,
                latency_ms: started.elapsed().as_millis() as u64,
                failure_category: Some(
                    if status == StatusCode::TOO_MANY_REQUESTS {
                        "rate-limit"
                    } else {
                        "provider"
                    }
                    .into(),
                ),
                response_characters: 0,
                usage: ProviderUsage::default(),
                structured_output: None,
            });
            let delay = retry_delay(&response, attempt);
            drop(response);
            retry_sleep(job, delay)?;
            continue;
        }
        let body = match read_response_body(response, MAX_ERROR_RESPONSE_BYTES) {
            Ok(body) => String::from_utf8_lossy(&body).into_owned(),
            Err(ReadBodyFailure::TooLarge) => {
                oversized_response_error(MAX_ERROR_RESPONSE_BYTES).to_string()
            }
            Err(ReadBodyFailure::Transport(error)) => error.to_string(),
        };
        observe(ProviderAttempt {
            attempt: attempt as u32 + 1,
            succeeded: false,
            latency_ms: started.elapsed().as_millis() as u64,
            failure_category: Some(
                if status == StatusCode::TOO_MANY_REQUESTS {
                    "rate-limit"
                } else if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                    "authentication"
                } else {
                    "provider"
                }
                .into(),
            ),
            response_characters: body.len() as u64,
            usage: ProviderUsage::default(),
            structured_output: None,
        });
        return Err(response_error(status, &body));
    }
    unreachable!()
}

#[cfg(test)]
pub(crate) fn send_with_retry<F>(job: Option<&AiJobGuard>, build: F) -> anyhow::Result<Value>
where
    F: FnMut() -> anyhow::Result<RequestBuilder>,
{
    send_with_retry_observed(job, build, |_| {})
}

pub(crate) fn provider_usage(value: &Value) -> ProviderUsage {
    let get = |paths: &[&str]| {
        paths
            .iter()
            .find_map(|path| value.pointer(path).and_then(Value::as_u64))
    };
    let anthropic_cache_creation = value
        .pointer("/usage/cache_creation_input_tokens")
        .and_then(Value::as_u64);
    let anthropic_cache_read = value
        .pointer("/usage/cache_read_input_tokens")
        .and_then(Value::as_u64);
    let cached_tokens = match (anthropic_cache_creation, anthropic_cache_read) {
        (Some(creation), Some(read)) => Some(creation.saturating_add(read)),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => get(&[
            "/usage/input_tokens_details/cached_tokens",
            "/usage/prompt_tokens_details/cached_tokens",
        ]),
    };
    ProviderUsage {
        input_tokens: get(&["/usage/input_tokens", "/usage/prompt_tokens"]),
        output_tokens: get(&["/usage/output_tokens", "/usage/completion_tokens"]),
        cached_tokens,
        reasoning_tokens: get(&[
            "/usage/output_tokens_details/reasoning_tokens",
            "/usage/completion_tokens_details/reasoning_tokens",
        ]),
    }
}
