use super::super::jobs::AiJobGuard;
use super::super::presets::provider_preset;
use super::super::settings::resolve_profile_credential;
use super::super::types::{
    AiModelInfo, AiProtocol, AiProviderProfile, AiStructuredOutputCapability,
    AiTranslateBatchRequest, AiTranslationItem, AiTranslationResultItem,
};
use super::request::{
    apply_generation_params, chat_response_format, next_degraded, remember_structured_output,
    resolved_structured_output, translation_request_at,
};
use super::transport::{
    AiStreamDelta, CONNECT_TIMEOUT, MAX_ERROR_RESPONSE_BYTES, MAX_REQUEST_BYTES,
    MAX_RESPONSE_BYTES, MAX_RETRIES, ProviderAttempt, ProviderUsage, ReadBodyFailure,
    STREAMING_TOTAL_BUDGET, authenticated, client, client_with_timeouts, endpoint, http_status_of,
    is_sse_response, oversized_response_error, provider_usage, read_response_body,
    read_stream_body, response_error, retry_sleep, send_with_retry_observed,
};
use super::validate::{
    SentinelBatch, parse_translation_value, restore_sentinel_item, same_language,
    sentinelize_batch, truncate_for_log, validate_request, validate_translation_items,
};
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::StatusCode;
use reqwest::header::CONTENT_TYPE;
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::time::Duration;

pub(crate) fn list_models(profile: &AiProviderProfile) -> anyhow::Result<Vec<AiModelInfo>> {
    if provider_preset(&profile.preset_id).is_some_and(|preset| !preset.supports_model_listing) {
        bail!("The selected AI provider does not expose a compatible model listing endpoint.");
    }
    let credential = resolve_profile_credential(profile)?;
    let client = client()?;
    let url = endpoint(profile, "models")?;
    let value = send_with_retry_observed(
        None,
        || authenticated(client.get(&url), profile, credential.as_deref()),
        |_| {},
    )?;
    let mut models = value
        .get("data")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some(AiModelInfo {
                id: item.get("id")?.as_str()?.to_string(),
                display_name: item
                    .get("display_name")
                    .or_else(|| item.get("displayName"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                // Some providers include the context window in the /models
                // payload; others leave it to the models.dev catalog which the
                // caller enriches from the disk cache.
                context_window_tokens: item
                    .get("context_window")
                    .or_else(|| item.get("contextWindow"))
                    .and_then(Value::as_u64)
                    .filter(|value| *value > 0),
            })
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    Ok(models)
}

pub(crate) fn execute_structured_observed(
    profile: &AiProviderProfile,
    job: &AiJobGuard,
    system: &str,
    user: &str,
    schema: &Value,
    observe: &mut dyn FnMut(ProviderAttempt),
) -> anyhow::Result<Value> {
    if system.len() + user.len() > MAX_REQUEST_BYTES {
        bail!("AI structured request exceeds the 512 KB payload limit.")
    }
    let credential = resolve_profile_credential(profile)?;
    let mut capability = resolved_structured_output(profile);
    loop {
        let client = client()?;
        let (url, body) = match profile.protocol {
            AiProtocol::OpenaiResponses => {
                let mut body = json!({"model":profile.model,"input":[{"role":"system","content":[{"type":"input_text","text":system}]},{"role":"user","content":[{"type":"input_text","text":user}]}]});
                if capability == AiStructuredOutputCapability::JsonSchema {
                    body["text"] = json!({"format":{"type":"json_schema","name":"localization_review","schema":schema,"strict":true}});
                }
                apply_generation_params(&mut body, profile, "max_output_tokens", true);
                (endpoint(profile, "responses")?, body)
            }
            AiProtocol::OpenaiChatCompletions => {
                let mut body = json!({"model":profile.model,"messages":[{"role":"system","content":format!("{system} Return only JSON matching this schema: {schema}")},{"role":"user","content":user}]});
                apply_generation_params(&mut body, profile, "max_tokens", true);
                if let Some(format) =
                    chat_response_format(capability, schema, "localization_review")
                {
                    body["response_format"] = format
                }
                (endpoint(profile, "chat/completions")?, body)
            }
            AiProtocol::AnthropicMessages => {
                let mut body = json!({"model":profile.model,"max_tokens":8192,"system":format!("{system} Return only JSON matching this schema: {schema}"),"messages":[{"role":"user","content":user}],"tools":[{"name":"return_review","description":"Return localization review issues","input_schema":schema}],"tool_choice":{"type":"tool","name":"return_review"}});
                apply_generation_params(&mut body, profile, "max_tokens", false);
                if reqwest::Url::parse(&profile.base_url)
                    .ok()
                    .and_then(|url| url.host_str().map(str::to_owned))
                    .as_deref()
                    == Some("api.kimi.com")
                {
                    body.as_object_mut()
                        .expect("Anthropic request is an object")
                        .remove("tool_choice");
                }
                (endpoint(profile, "messages")?, body)
            }
        };
        let result = send_with_retry_observed(
            Some(job),
            || {
                authenticated(
                    client
                        .post(&url)
                        .header(CONTENT_TYPE, "application/json")
                        .json(&body),
                    profile,
                    credential.as_deref(),
                )
            },
            observe_with_capability(observe, capability),
        );
        match result {
            Ok(value) => {
                job.check()?;
                let (parsed, _reasoning) = parse_translation_value(value, profile.protocol)?;
                return Ok(parsed);
            }
            Err(error) => {
                if http_status_of(&error) == Some(StatusCode::BAD_REQUEST)
                    && next_degraded(profile, capability).is_some()
                {
                    capability = next_degraded(profile, capability).expect("checked above");
                    remember_structured_output(profile, capability);
                    LogEvent::new("ai.review.structuredOutputDegraded")
                        .field("profile", &profile.id)
                        .debug("protocol", &profile.protocol)
                        .field("capability", capability.as_str())
                        .field("error", truncate_for_log(&error.to_string(), 300))
                        .emit_debug(targets::LOCALIZATION_TRANSLATION);
                    continue;
                }
                return Err(error);
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn translate(
    profile: &AiProviderProfile,
    request: &AiTranslateBatchRequest,
    job: &AiJobGuard,
) -> anyhow::Result<(Vec<AiTranslationResultItem>, Option<String>)> {
    translate_observed(profile, request, job, &mut |_| {}, &mut |_| {})
}

/// Rebuilds a protocol-shaped response from the content text accumulated by a
/// stream, so the result goes through the exact same parse-and-validate path as
/// a non-streaming response. Anthropic streams tool input as partial JSON: when
/// it already parses as the structured result it is fed back as the tool input,
/// otherwise it is treated as plain text output.
fn streamed_translation_value(content: &str, protocol: AiProtocol) -> anyhow::Result<Value> {
    Ok(match protocol {
        AiProtocol::OpenaiResponses => json!({"output_text": content}),
        AiProtocol::OpenaiChatCompletions => {
            json!({"choices":[{"message":{"content": content}}]})
        }
        AiProtocol::AnthropicMessages => {
            if let Ok(parsed) = serde_json::from_str::<Value>(content) {
                if parsed.get("items").is_some() {
                    json!({"content":[{"type":"tool_use","input": parsed}]})
                } else {
                    json!({"content":[{"type":"text","text": content}]})
                }
            } else {
                json!({"content":[{"type":"text","text": content}]})
            }
        }
    })
}

/// Shared tail for streamed and non-streamed translations: parse, validate,
/// restore sentinels, log, and reassemble the result in request order.
/// `reasoning_override` wins when the provider reported reasoning through
/// stream deltas. `sentinel` carries the wire/sentinel mapping produced by
/// `sentinelize_batch`; when an item was sentinelized its translated text is
/// restored and count-checked here (the authoritative restore — the frontend
/// only mirrors it for streaming previews).
fn finalize_translation(
    profile: &AiProviderProfile,
    remote_request: &AiTranslateBatchRequest,
    original_items: &[AiTranslationItem],
    value: Value,
    reasoning_override: Option<String>,
    sentinel: &SentinelBatch,
) -> anyhow::Result<(Vec<AiTranslationResultItem>, Option<String>)> {
    let (parsed, reasoning) = parse_translation_value(value, profile.protocol)?;
    let reasoning = reasoning_override.or(reasoning);
    let parsed_body = parsed.to_string();
    LogEvent::new("ai.translate.response")
        .field("job", &remote_request.job_id)
        .field("profile", &profile.id)
        .debug("protocol", &profile.protocol)
        .field("chars", parsed_body.chars().count())
        .field("body", truncate_for_log(&parsed_body, 600))
        .emit_debug(targets::LOCALIZATION_TRANSLATION);
    let translated = match validate_translation_items(
        remote_request,
        parsed,
        remote_request.skip_format_validation,
    ) {
        Ok(items) => items,
        Err(error) => {
            LogEvent::new("ai.translate.validationFailed")
                .field("job", &remote_request.job_id)
                .field("profile", &profile.id)
                .debug("protocol", &profile.protocol)
                .field("error", truncate_for_log(&error.to_string(), 1200))
                .emit_warn(targets::LOCALIZATION_TRANSLATION);
            return Err(error);
        }
    };
    let mut translated = translated
        .into_iter()
        .map(|mut item| {
            // Restore sentinels on every result item that was sentinelized
            // (including same-language copies, which echo the sentinel text).
            if let Some(tokens) = sentinel.tokens_by_id.get(&item.id) {
                item.translated_text =
                    restore_sentinel_item(&item.translated_text, tokens, &item.id)?;
            }
            Ok((item.id.clone(), item))
        })
        .collect::<anyhow::Result<BTreeMap<_, _>>>()?;
    let items = original_items
        .iter()
        .map(|item| {
            Ok(translated
                .remove(&item.id)
                .unwrap_or_else(|| AiTranslationResultItem {
                    id: item.id.clone(),
                    translated_text: item.text.clone(),
                    detected_language: Some(remote_request.target_locale.clone()),
                    skipped_same_language: true,
                }))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    Ok((items, reasoning))
}

pub(crate) fn translate_observed(
    profile: &AiProviderProfile,
    request: &AiTranslateBatchRequest,
    job: &AiJobGuard,
    observe: &mut dyn FnMut(ProviderAttempt),
    emit_stream: &mut dyn FnMut(AiStreamDelta),
) -> anyhow::Result<(Vec<AiTranslationResultItem>, Option<String>)> {
    validate_request(request)?;
    let remote_items = request
        .items
        .iter()
        .filter(|item| !same_language(&item.text, &request.target_locale))
        .cloned()
        .collect::<Vec<_>>();
    if remote_items.is_empty() {
        return Ok((
            request
                .items
                .iter()
                .map(|item| AiTranslationResultItem {
                    id: item.id.clone(),
                    translated_text: item.text.clone(),
                    detected_language: Some(request.target_locale.clone()),
                    skipped_same_language: true,
                })
                .collect(),
            None,
        ));
    }
    let remote_request = AiTranslateBatchRequest {
        items: remote_items,
        ..request.clone()
    };
    // Sentinel-ize placeholder tokens before the wire round trip so the
    // provider cannot rewrite, merge, or drop them (it only ever sees opaque
    // `⟦i⟧` tokens). The response is restored and count-checked in
    // `finalize_translation`; a failed restore surfaces as a
    // placeholder-mismatch error for the frontend degradation path.
    let sentinel = sentinelize_batch(&remote_request.items);
    let wire_request = AiTranslateBatchRequest {
        items: sentinel.items.clone(),
        ..remote_request.clone()
    };
    let credential = resolve_profile_credential(profile)?;
    // Start from the declared capability (already degraded for this base
    // URL/preset when a previous batch hit a 400) and step down one level per
    // 400 rejection until the endpoint accepts the request.
    let mut capability = resolved_structured_output(profile);
    loop {
        let (url, body) = translation_request_at(profile, &wire_request, capability)?;
        let attempted = if !profile.stream_translation {
            translate_nonstreaming_once(
                profile,
                job,
                &url,
                &body,
                credential.as_deref(),
                capability,
                observe,
            )
        } else {
            translate_streaming_once(
                profile,
                job,
                &wire_request.job_id,
                &url,
                &body,
                credential.as_deref(),
                capability,
                observe,
                emit_stream,
            )
        };
        match attempted {
            Ok((value, reasoning_override)) => {
                job.check()?;
                return finalize_translation(
                    profile,
                    &wire_request,
                    &request.items,
                    value,
                    reasoning_override,
                    &sentinel,
                );
            }
            Err(error) => {
                if http_status_of(&error) == Some(StatusCode::BAD_REQUEST)
                    && next_degraded(profile, capability).is_some()
                {
                    capability = next_degraded(profile, capability).expect("checked above");
                    remember_structured_output(profile, capability);
                    LogEvent::new("ai.translate.structuredOutputDegraded")
                        .field("job", &wire_request.job_id)
                        .field("profile", &profile.id)
                        .debug("protocol", &profile.protocol)
                        .field("capability", capability.as_str())
                        .field("error", truncate_for_log(&error.to_string(), 300))
                        .emit_debug(targets::LOCALIZATION_TRANSLATION);
                    continue;
                }
                return Err(error);
            }
        }
    }
}

/// One non-streaming send with the built-in transport/429/5xx retry. Returns
/// the raw provider JSON; non-retryable HTTP rejections (400 included) surface
/// as errors so the capability degradation loop in `translate_observed` can
/// step down when the endpoint refuses the forcing parameter.
fn translate_nonstreaming_once(
    profile: &AiProviderProfile,
    job: &AiJobGuard,
    url: &str,
    body: &Value,
    credential: Option<&str>,
    capability: AiStructuredOutputCapability,
    observe: &mut dyn FnMut(ProviderAttempt),
) -> anyhow::Result<(Value, Option<String>)> {
    let client = client()?;
    let value = send_with_retry_observed(
        Some(job),
        || {
            authenticated(
                client
                    .post(url)
                    .header(CONTENT_TYPE, "application/json")
                    .json(body),
                profile,
                credential,
            )
        },
        observe_with_capability(observe, capability),
    )?;
    Ok((value, None))
}

/// Wraps an attempt observer so every `ProviderAttempt` records the capability
/// level the request was sent with, making the degradation chain observable in
/// the operational ledger.
fn observe_with_capability<'a>(
    observe: &'a mut dyn FnMut(ProviderAttempt),
    capability: AiStructuredOutputCapability,
) -> impl FnMut(ProviderAttempt) + 'a {
    move |attempt| {
        let mut attempt = attempt;
        attempt.structured_output = Some(capability.as_str().to_string());
        observe(attempt)
    }
}

/// One streaming send with the built-in retry budget. Deltas are emitted as
/// they arrive (raw wire text, sentinels included — the frontend restores them
/// for previews); the accumulated content is returned together with any
/// streamed reasoning so the caller finalizes it through the exact same
/// parse/validate/restore path. A stream that already produced deltas can never
/// be replayed, so only pre-chunk failures keep the bounded retry budget.
///
/// A 400 whose error body mentions "stream" is the endpoint rejecting the
/// `stream` flag outright: the batch is retried once without streaming at the
/// current capability level. Any other 400 (including a non-stream retry that
/// 400s) surfaces as an error for the capability degradation loop.
fn translate_streaming_once(
    profile: &AiProviderProfile,
    job: &AiJobGuard,
    job_id: &str,
    url: &str,
    body: &Value,
    credential: Option<&str>,
    capability: AiStructuredOutputCapability,
    observe: &mut dyn FnMut(ProviderAttempt),
    emit_stream: &mut dyn FnMut(AiStreamDelta),
) -> anyhow::Result<(Value, Option<String>)> {
    let mut stream_body = body.clone();
    stream_body["stream"] = json!(true);
    let stream_client = client_with_timeouts(CONNECT_TIMEOUT, STREAMING_TOTAL_BUDGET)?;
    let mut observe = observe_with_capability(observe, capability);
    for attempt in 0..=MAX_RETRIES {
        job.check()?;
        let started = std::time::Instant::now();
        let response = match authenticated(
            stream_client
                .post(url)
                .header(CONTENT_TYPE, "application/json")
                .json(&stream_body),
            profile,
            credential,
        )?
        .send()
        {
            Ok(response) => response,
            Err(error) => {
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
                    retry_sleep(Some(job), Duration::from_secs(1_u64 << attempt.min(4)))?;
                    continue;
                }
                return Err(error).context("AI provider request could not be sent.");
            }
        };
        let status = response.status();
        if status.is_success() {
            if !is_sse_response(&response) {
                // The endpoint ignored `stream` and returned a regular JSON
                // response: parse it directly as a one-shot fallback.
                LogEvent::new("ai.translate.streamFallback")
                    .field("job", job_id)
                    .field("profile", &profile.id)
                    .debug("protocol", &profile.protocol)
                    .field("reason", "non-sse-content-type")
                    .emit_debug(targets::LOCALIZATION_TRANSLATION);
                let value = match read_response_body(response, MAX_RESPONSE_BYTES) {
                    Ok(body) => body,
                    Err(ReadBodyFailure::TooLarge) => {
                        return Err(oversized_response_error(MAX_RESPONSE_BYTES));
                    }
                    Err(ReadBodyFailure::Transport(error)) => {
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
                            retry_sleep(Some(job), Duration::from_secs(1_u64 << attempt.min(4)))?;
                            continue;
                        }
                        return Err(error);
                    }
                };
                let value: Value =
                    serde_json::from_slice(&value).context("AI provider returned invalid JSON.")?;
                observe(ProviderAttempt {
                    attempt: attempt as u32 + 1,
                    succeeded: true,
                    latency_ms: started.elapsed().as_millis() as u64,
                    failure_category: None,
                    response_characters: value.to_string().len() as u64,
                    usage: provider_usage(&value),
                    structured_output: None,
                });
                return Ok((value, None));
            }
            match read_stream_body(
                response,
                profile.protocol,
                Some(job),
                emit_stream,
                MAX_RESPONSE_BYTES,
            ) {
                Ok(outcome) => {
                    observe(ProviderAttempt {
                        attempt: attempt as u32 + 1,
                        succeeded: true,
                        latency_ms: started.elapsed().as_millis() as u64,
                        failure_category: None,
                        response_characters: outcome.content.len() as u64,
                        usage: ProviderUsage::default(),
                        structured_output: None,
                    });
                    let value = streamed_translation_value(&outcome.content, profile.protocol)?;
                    let reasoning = if outcome.reasoning.is_empty() {
                        None
                    } else {
                        Some(outcome.reasoning)
                    };
                    return Ok((value, reasoning));
                }
                Err(failure) => {
                    observe(ProviderAttempt {
                        attempt: attempt as u32 + 1,
                        succeeded: false,
                        latency_ms: started.elapsed().as_millis() as u64,
                        failure_category: Some("network".into()),
                        response_characters: 0,
                        usage: ProviderUsage::default(),
                        structured_output: None,
                    });
                    // A stream that already produced deltas cannot be replayed;
                    // only pre-chunk failures keep the bounded retry budget.
                    if !failure.started && attempt < MAX_RETRIES {
                        retry_sleep(Some(job), Duration::from_secs(1_u64 << attempt.min(4)))?;
                        continue;
                    }
                    return Err(failure.error);
                }
            }
        }
        let error_body = match read_response_body(response, MAX_ERROR_RESPONSE_BYTES) {
            Ok(body) => String::from_utf8_lossy(&body).into_owned(),
            Err(ReadBodyFailure::TooLarge) => {
                oversized_response_error(MAX_ERROR_RESPONSE_BYTES).to_string()
            }
            Err(ReadBodyFailure::Transport(error)) => error.to_string(),
        };
        if error_body.to_ascii_lowercase().contains("stream") {
            // The endpoint rejected the `stream` flag outright: retry once
            // without streaming so the batch still completes.
            LogEvent::new("ai.translate.streamUnsupportedRetry")
                .field("job", job_id)
                .field("profile", &profile.id)
                .debug("protocol", &profile.protocol)
                .field("status", status.as_u16())
                .emit_debug(targets::LOCALIZATION_TRANSLATION);
            let client = client()?;
            let value = send_with_retry_observed(
                Some(job),
                || {
                    authenticated(
                        client
                            .post(url)
                            .header(CONTENT_TYPE, "application/json")
                            .json(body),
                        profile,
                        credential,
                    )
                },
                &mut observe,
            )?;
            return Ok((value, None));
        }
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
            response_characters: error_body.len() as u64,
            usage: ProviderUsage::default(),
            structured_output: None,
        });
        if (status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error())
            && attempt < MAX_RETRIES
        {
            let delay = Duration::from_secs(1_u64 << attempt.min(4));
            retry_sleep(Some(job), delay)?;
            continue;
        }
        return Err(response_error(status, &error_body));
    }
    unreachable!()
}
