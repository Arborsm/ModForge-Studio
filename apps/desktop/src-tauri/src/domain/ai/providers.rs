//! AI provider adapters, split by responsibility:
//!
//! - [`transport`] — wire transport: HTTP client, auth headers, bounded retry,
//!   response reading, usage parsing and SSE stream reading/delta extraction.
//! - [`request`] — request construction: translation schema/prompt, structured-
//!   output capability & 400 degradation chain, and generation parameters.
//! - [`validate`] — request validation and response parsing/validation:
//!   placeholder sentinels, language detection and result reassembly checks.
//! - [`translate`] — orchestration: `translate_observed`,
//!   `execute_structured_observed` and `list_models`.
//!
//! The submodules are implementation details; the `pub(crate) use` re-exports
//! below keep every existing `providers::…` call site unchanged. The test-only
//! re-exports are gated on `#[cfg(test)]` because `providers_tests` globs this
//! facade through `use super::*` and no production code needs those names.

mod request;
mod translate;
mod transport;
mod validate;

pub(crate) use translate::{execute_structured_observed, list_models, translate_observed};
pub(crate) use transport::{AiStreamDelta, ProviderAttempt, StreamDeltaKind};

#[cfg(test)]
pub(crate) use super::jobs::AiJobGuard;
#[cfg(test)]
pub(crate) use super::types::{
    AiProtocol, AiProviderProfile, AiStructuredOutputCapability, AiTranslateBatchRequest,
    ReasoningEffort,
};
#[cfg(test)]
pub(crate) use request::{
    apply_generation_params, chat_response_format, next_degraded, remember_structured_output,
    resolved_structured_output, translation_request_at, translation_schema,
};
#[cfg(test)]
pub(crate) use reqwest::header::AUTHORIZATION;
#[cfg(test)]
pub(crate) use serde_json::json;
#[cfg(test)]
pub(crate) use translate::translate;
#[cfg(test)]
pub(crate) use transport::{
    MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, MAX_RETRIES, SseLineAccumulator, authenticated, client,
    client_with_timeouts, extract_stream_delta, provider_usage, retry_delay, send_with_retry,
    send_with_retry_observed,
};
#[cfg(test)]
pub(crate) use validate::{
    parse_translation_value, restore_sentinel_item, same_language, sentinelize_batch,
    validate_request, validate_translation_items,
};

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/providers_tests.rs"]
mod tests;
