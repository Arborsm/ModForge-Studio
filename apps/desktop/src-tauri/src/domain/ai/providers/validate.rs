use super::super::types::{
    AiProtocol, AiTranslateBatchRequest, AiTranslationItem, AiTranslationResultItem,
};
use super::transport::{MAX_BATCH_BYTES, MAX_BATCH_ITEMS, MAX_ITEM_BYTES, MAX_REQUEST_BYTES};
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use regex::Regex;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::OnceLock;

pub(crate) fn validate_request(request: &AiTranslateBatchRequest) -> anyhow::Result<()> {
    if request.items.is_empty() {
        bail!("AI translation batch cannot be empty.");
    }
    if request.items.len() > MAX_BATCH_ITEMS {
        bail!("AI translation batches support at most {MAX_BATCH_ITEMS} items.");
    }
    if let Some(limit) = request.max_batch_bytes {
        if limit == 0 || limit > MAX_BATCH_BYTES as u64 {
            bail!(
                "AI translation max batch bytes must be a positive integer no larger than {MAX_BATCH_BYTES}."
            );
        }
    }
    let batch_limit = request
        .max_batch_bytes
        .map(|limit| limit as usize)
        .unwrap_or(MAX_BATCH_BYTES)
        .min(MAX_BATCH_BYTES);
    if request
        .items
        .iter()
        .map(|item| item.text.len())
        .sum::<usize>()
        > batch_limit
    {
        bail!(
            "AI translation batch exceeds the {} KB payload limit.",
            batch_limit / 1024
        );
    }
    if request
        .items
        .iter()
        .any(|item| item.text.len() > MAX_ITEM_BYTES)
    {
        bail!(
            "An AI translation item exceeds the {} KB item limit.",
            MAX_ITEM_BYTES / 1024
        );
    }
    if serde_json::to_vec(request)
        .context("Failed to validate the AI translation request size.")?
        .len()
        > MAX_REQUEST_BYTES
    {
        bail!("AI translation request exceeds the 512 KB serialized payload limit.");
    }
    let ids = request
        .items
        .iter()
        .map(|item| item.id.as_str())
        .collect::<BTreeSet<_>>();
    if ids.len() != request.items.len() || ids.contains("") {
        bail!("AI translation item ids must be non-empty and unique.");
    }
    Ok(())
}

/// Extracts provider chain-of-thought text from a raw protocol response.
/// Returns `None` when reasoning is absent or empty.
///
/// - Chat Completions: DeepSeek-style `choices[0].message.reasoning_content`,
///   plus the newer OpenAI `message.reasoning` part array.
/// - Responses API: `output` items with `type: "reasoning"`, joined from their
///   `summary[*].text` and `content[*].text`.
/// - Anthropic: not supported in the first version.
fn extract_reasoning(value: &Value, protocol: AiProtocol) -> Option<String> {
    let raw = match protocol {
        AiProtocol::OpenaiChatCompletions => value
            .pointer("/choices/0/message/reasoning_content")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                value
                    .pointer("/choices/0/message/reasoning")
                    .and_then(Value::as_array)
                    .map(|parts| {
                        parts
                            .iter()
                            .filter_map(|part| part.get("text").and_then(Value::as_str))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
            }),
        AiProtocol::OpenaiResponses => {
            value.get("output").and_then(Value::as_array).map(|output| {
                output
                    .iter()
                    .filter(|item| item.get("type").and_then(Value::as_str) == Some("reasoning"))
                    .flat_map(|item| {
                        let summaries = item
                            .get("summary")
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .filter_map(|summary| summary.get("text").and_then(Value::as_str));
                        let contents = item
                            .get("content")
                            .and_then(Value::as_array)
                            .into_iter()
                            .flatten()
                            .filter_map(|content| content.get("text").and_then(Value::as_str));
                        summaries.chain(contents)
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
        }
        AiProtocol::AnthropicMessages => None,
    }?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Parses the translation JSON out of a protocol response and returns it
/// alongside any chain-of-thought text the provider included.
pub(crate) fn parse_translation_value(
    value: Value,
    protocol: AiProtocol,
) -> anyhow::Result<(Value, Option<String>)> {
    let reasoning = extract_reasoning(&value, protocol);
    fn parse_json_text(text: &str, context: &str) -> anyhow::Result<Value> {
        let text = text.trim();
        let text = if let Some(fenced) = text.strip_prefix("```") {
            let fenced = fenced
                .strip_prefix("json")
                .or_else(|| fenced.strip_prefix("JSON"))
                .unwrap_or(fenced)
                .trim_start_matches(['\r', '\n']);
            fenced
                .strip_suffix("```")
                .map(str::trim_end)
                .context("AI provider returned an unterminated JSON code fence.")?
        } else {
            text
        };
        serde_json::from_str(text).with_context(|| context.to_string())
    }
    let parsed = match protocol {
        AiProtocol::OpenaiResponses => {
            let text = value
                .get("output_text")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    value
                        .get("output")?
                        .as_array()?
                        .iter()
                        .flat_map(|output| {
                            output
                                .get("content")
                                .and_then(Value::as_array)
                                .into_iter()
                                .flatten()
                        })
                        .find_map(|content| {
                            // Reasoning items carry `reasoning_text` blocks; only
                            // `output_text` (or untyped) blocks hold the JSON.
                            let is_output = content
                                .get("type")
                                .and_then(Value::as_str)
                                .map(|value| value == "output_text" || value.is_empty())
                                .unwrap_or(true);
                            if !is_output {
                                return None;
                            }
                            content
                                .get("text")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        })
                })
                .context("OpenAI Responses result did not contain output text.")?;
            parse_json_text(
                &text,
                "OpenAI Responses output was not valid translation JSON.",
            )
        }
        AiProtocol::OpenaiChatCompletions => {
            let text = value
                .pointer("/choices/0/message/content")
                .and_then(Value::as_str)
                .context("Chat Completions result did not contain message content.")?;
            parse_json_text(
                text,
                "Chat Completions output was not valid translation JSON.",
            )
        }
        AiProtocol::AnthropicMessages => {
            let content = value
                .get("content")
                .and_then(Value::as_array)
                .context("Anthropic result did not contain content blocks.")?;
            if let Some(input) = content
                .iter()
                .find(|item| item.get("type").and_then(Value::as_str) == Some("tool_use"))
                .and_then(|item| item.get("input"))
            {
                return Ok((input.clone(), reasoning));
            }
            let text = content
                .iter()
                .find(|item| item.get("type").and_then(Value::as_str) == Some("text"))
                .and_then(|item| item.get("text"))
                .and_then(Value::as_str)
                .context(
                    "Anthropic result did not contain translation tool or JSON text output.",
                )?;
            parse_json_text(
                text,
                "Anthropic text output was not valid translation JSON.",
            )
        }
    }?;
    Ok((parsed, reasoning))
}

fn placeholder_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        Regex::new(
            r"\{\{[^{}\r\n]+\}\}|\{[A-Za-z0-9_.-]+[ \t]*(?::[^{}\r\n]+)?[ \t]*\}|%(?:\d+\$)?[sdif]\b|\$\d+",
        )
        .expect("placeholder regex must compile")
    })
}

fn placeholders(value: &str) -> BTreeMap<String, usize> {
    let mut values = BTreeMap::new();
    for capture in placeholder_regex().find_iter(value) {
        // Whitespace inside a placeholder token is cosmetic ({{ name }} == {{name}}),
        // so normalize it away before comparing identity and counts. The token order
        // and multiplicity are still enforced by the multiset comparison.
        let token: String = capture
            .as_str()
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect();
        *values.entry(token).or_insert(0) += 1;
    }
    values
}

/// Renders a placeholder multiset as `{{name}}x2, $0` for diagnostics.
fn placeholder_summary(value: &str) -> String {
    placeholders(value)
        .into_iter()
        .map(|(token, count)| {
            if count == 1 {
                token
            } else {
                format!("{token}x{count}")
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Matches the sentinel tokens (`⟦0⟧`, `⟦12⟧`) produced by `sentinelize_batch`.
fn sentinel_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| Regex::new(r"⟦(\d+)⟧").expect("sentinel regex must compile"))
}

/// The sentinel-protected view of one translation batch: wire items whose
/// placeholder tokens were replaced by `⟦i⟧` (per-item local numbering) plus
/// the original placeholder tokens keyed by item id for the restore pass.
pub(crate) struct SentinelBatch {
    pub(crate) items: Vec<AiTranslationItem>,
    pub(crate) tokens_by_id: BTreeMap<String, Vec<String>>,
}

/// Replaces placeholder tokens with rare sentinel tokens before the request is
/// serialized, so the provider cannot rewrite, merge, or "fix" them (the model
/// only ever sees opaque `⟦i⟧` tokens). After the response is validated the
/// sentinels are restored and count-checked by `restore_sentinel_item`.
///
/// Items whose text already contains the sentinel character (a collision that
/// would break the restore pass) and items without placeholders pass through
/// untouched; the regular placeholder multiset validation still covers them.
/// BBCode tags are never sentinelized: the frontend already splits batches
/// around them and the provider must be free to reflow their interior text.
pub(crate) fn sentinelize_batch(items: &[AiTranslationItem]) -> SentinelBatch {
    let mut sentinel_items = Vec::with_capacity(items.len());
    let mut tokens_by_id = BTreeMap::new();
    for item in items {
        let text = if item.text.contains('⟦') {
            item.text.clone()
        } else {
            let matches = placeholder_regex()
                .find_iter(&item.text)
                .collect::<Vec<_>>();
            if matches.is_empty() {
                item.text.clone()
            } else {
                let tokens = matches
                    .iter()
                    .map(|matched| matched.as_str().to_string())
                    .collect::<Vec<_>>();
                let mut sentinel = String::with_capacity(item.text.len());
                let mut cursor = 0;
                for (index, matched) in matches.into_iter().enumerate() {
                    sentinel.push_str(&item.text[cursor..matched.start()]);
                    sentinel.push_str(&format!("⟦{index}⟧"));
                    cursor = matched.end();
                }
                sentinel.push_str(&item.text[cursor..]);
                tokens_by_id.insert(item.id.clone(), tokens);
                sentinel
            }
        };
        sentinel_items.push(AiTranslationItem {
            text,
            ..item.clone()
        });
    }
    SentinelBatch {
        items: sentinel_items,
        tokens_by_id,
    }
}

/// Restores the sentinel tokens of one translated item back to the original
/// placeholder tokens and count-checks the round trip:
///
/// - every `⟦i⟧` must map to an index inside the item's source token list;
/// - the number of sentinels in the response must equal the source count;
/// - no `⟦`/`⟧` characters may remain after restoration (a provider-invented
///   or corrupted token).
///
/// Any violation means the provider rewrote, dropped, or invented placeholder
/// tokens, so the error message carries `changed placeholders` and flows into
/// the frontend's placeholder-mismatch degradation path (batch retry, then
/// per-item split retry, then keep-original).
pub(crate) fn restore_sentinel_item(
    translated: &str,
    tokens: &[String],
    item_id: &str,
) -> anyhow::Result<String> {
    let mut restored = String::with_capacity(translated.len());
    let mut cursor = 0;
    let mut count = 0usize;
    for captures in sentinel_regex().captures_iter(translated) {
        let matched = captures.get(0).expect("sentinel capture always matches");
        let index = captures[1].parse::<usize>().unwrap_or(usize::MAX);
        let token = tokens.get(index).with_context(|| {
            format!(
                "AI translation changed placeholders for item {item_id}: sentinel restore found an unknown token {}.",
                matched.as_str()
            )
        })?;
        restored.push_str(&translated[cursor..matched.start()]);
        restored.push_str(token);
        cursor = matched.end();
        count += 1;
    }
    restored.push_str(&translated[cursor..]);
    if count != tokens.len() {
        anyhow::bail!(
            "AI translation changed placeholders for item {item_id}: expected {} placeholder tokens but the response contained {}.",
            tokens.len(),
            count
        );
    }
    if restored.contains('⟦') || restored.contains('⟧') {
        anyhow::bail!(
            "AI translation changed placeholders for item {item_id}: the response contains leftover sentinel characters."
        );
    }
    Ok(restored)
}

pub(crate) fn same_language(text: &str, target: &str) -> bool {
    let Some(info) = whatlang::detect(text) else {
        return false;
    };
    if info.confidence() < 0.85 {
        return false;
    }
    let target = target.to_ascii_lowercase();
    let target = target.split(['-', '_']).next().unwrap_or(target.as_str());
    matches!(
        (info.lang().code(), target),
        ("eng", "en")
            | ("cmn", "zh")
            | ("fra", "fr")
            | ("deu", "de")
            | ("hun", "hu")
            | ("ita", "it")
            | ("jpn", "ja")
            | ("kor", "ko")
            | ("por", "pt")
            | ("rus", "ru")
            | ("spa", "es")
            | ("tur", "tr")
    )
}

pub(crate) fn validate_translation_items(
    request: &AiTranslateBatchRequest,
    value: Value,
    skip_placeholder_check: bool,
) -> anyhow::Result<Vec<AiTranslationResultItem>> {
    let raw_items = value
        .get("items")
        .and_then(Value::as_array)
        .context("AI translation output is missing items.")?;
    let mut by_id = BTreeMap::new();
    for item in raw_items {
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .context("AI translation item is missing id.")?;
        if by_id.insert(id.to_string(), item).is_some() {
            bail!("AI translation output contains duplicate item ids.");
        }
    }
    if by_id.len() != request.items.len() {
        bail!("AI translation output item ids do not exactly match the request.");
    }
    let mut aliased_items = 0usize;
    let mut results = Vec::with_capacity(request.items.len());
    for source in &request.items {
        if same_language(&source.text, &request.target_locale) {
            results.push(AiTranslationResultItem {
                id: source.id.clone(),
                translated_text: source.text.clone(),
                detected_language: Some(request.target_locale.clone()),
                skipped_same_language: true,
            });
            continue;
        }
        let item = by_id
            .get(&source.id)
            .context("AI translation output omitted an item.")?;
        // Some providers echo the request item back verbatim and write the
        // translation into the input `text` field instead of `translatedText`
        // (e.g. deepseek-v4-flash). Accept that alias when the canonical field
        // is absent; unknown extra fields are already ignored by the generic
        // JSON parse. Both fields missing still fails as an invalid response.
        let translated = match item.get("translatedText").and_then(Value::as_str) {
            Some(translated_text) => translated_text.to_string(),
            None => match item.get("text").and_then(Value::as_str) {
                Some(aliased_text) => {
                    aliased_items += 1;
                    aliased_text.to_string()
                }
                None => bail!("AI translation item is missing translatedText and text."),
            },
        };
        if !skip_placeholder_check && placeholders(&source.text) != placeholders(&translated) {
            bail!(
                "AI translation changed placeholders for item {}: expected [{}] but got [{}].",
                source.id,
                placeholder_summary(&source.text),
                placeholder_summary(&translated),
            );
        }
        results.push(AiTranslationResultItem {
            id: source.id.clone(),
            translated_text: translated,
            detected_language: item
                .get("detectedLanguage")
                .and_then(Value::as_str)
                .map(str::to_string),
            skipped_same_language: false,
        });
    }
    if aliased_items > 0 {
        LogEvent::new("ai.translate.textAliasFallback")
            .field("job", &request.job_id)
            .count("items", aliased_items)
            .emit_debug(targets::LOCALIZATION_TRANSLATION);
    }
    Ok(results)
}

/// Truncates a diagnostic value to a bounded number of characters without
/// breaking UTF-8 boundaries. Responses are logged in excerpt form only.
pub(crate) fn truncate_for_log(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        let head: String = value.chars().take(max_chars).collect();
        format!("{head}…")
    }
}
