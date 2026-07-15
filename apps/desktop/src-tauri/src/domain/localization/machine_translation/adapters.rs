use super::protection::{ProtectedText, protect};
use super::settings::{resolve_credentials, resolve_profile};
use crate::domain::localization::jobs;
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use hmac::{Hmac, Mac};
use md5::{Digest as _, Md5};
use reqwest::StatusCode;
use reqwest::blocking::{Client, RequestBuilder, Response};
use reqwest::header::{CONTENT_TYPE, RETRY_AFTER};
use serde_json::{Value, json};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::io::Read;
use std::thread;
use std::time::{Duration, Instant};
use url::Url;

const MAX_RETRIES: usize = 2;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct MachineTranslationAttempt {
    pub attempt: u32,
    pub succeeded: bool,
    pub latency_ms: u64,
    pub failure_category: Option<String>,
    pub response_characters: u64,
    pub billed_characters: Option<u64>,
    pub usage_source: String,
}

#[derive(Debug)]
struct WireResponse {
    value: Value,
}

fn client() -> anyhow::Result<Client> {
    client_with_timeouts(Duration::from_secs(10), Duration::from_secs(60))
}

fn client_with_timeouts(
    connect_timeout: Duration,
    request_timeout: Duration,
) -> anyhow::Result<Client> {
    Client::builder()
        .connect_timeout(connect_timeout)
        .timeout(request_timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("Failed to create the machine translation HTTP client.")
}

fn validate_limits(
    items: &[MachineTranslationItem],
    capability: &MachineTranslationCapability,
) -> anyhow::Result<()> {
    let characters = items
        .iter()
        .map(|item| item.text.chars().count() as u64)
        .sum::<u64>();
    if characters > capability.max_batch_characters
        || items
            .iter()
            .any(|item| item.text.chars().count() as u64 > capability.max_item_characters)
    {
        bail!("Machine translation request exceeds the selected provider character limit.")
    }
    Ok(())
}

fn credential<'a>(values: &'a BTreeMap<String, String>, field: &str) -> anyhow::Result<&'a str> {
    values
        .get(field)
        .map(String::as_str)
        .with_context(|| format!("Machine translation credential `{field}` is not configured."))
}

fn endpoint(profile: &MachineTranslationProfile, suffix: &str) -> String {
    format!(
        "{}/{}",
        profile.base_url.trim_end_matches('/'),
        suffix.trim_start_matches('/')
    )
}

fn retry_delay(response: &Response, attempt: usize) -> Duration {
    response
        .headers()
        .get(RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .map(|seconds| Duration::from_secs(seconds.min(30)))
        .unwrap_or_else(|| Duration::from_secs(1 << attempt.min(4)))
}

fn read_body(response: Response) -> anyhow::Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|value| value > MAX_RESPONSE_BYTES as u64)
    {
        bail!("Machine translation response exceeds the 2 MB limit.")
    }
    let mut body = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES as u64 + 1)
        .read_to_end(&mut body)?;
    if body.len() > MAX_RESPONSE_BYTES {
        bail!("Machine translation response exceeds the 2 MB limit.")
    }
    Ok(body)
}

fn error_detail(status: StatusCode, body: &[u8]) -> anyhow::Error {
    let value = serde_json::from_slice::<Value>(body).ok();
    let detail = value
        .as_ref()
        .and_then(|value| {
            value
                .pointer("/error/message")
                .or_else(|| value.get("message"))
        })
        .and_then(Value::as_str)
        .unwrap_or_else(|| status.canonical_reason().unwrap_or("request failed"));
    anyhow::anyhow!(
        "Machine translation provider request failed ({status}): {}",
        detail.chars().take(500).collect::<String>()
    )
}

fn send(
    job_id: &str,
    mut build: impl FnMut() -> anyhow::Result<RequestBuilder>,
    observe: &mut dyn FnMut(MachineTranslationAttempt),
) -> anyhow::Result<WireResponse> {
    for attempt in 0..=MAX_RETRIES {
        jobs::check(job_id)?;
        let started = Instant::now();
        let response = match build()?.send() {
            Ok(response) => response,
            Err(error) => {
                observe(MachineTranslationAttempt {
                    attempt: attempt as u32 + 1,
                    succeeded: false,
                    latency_ms: started.elapsed().as_millis() as u64,
                    failure_category: Some("network".into()),
                    response_characters: 0,
                    billed_characters: None,
                    usage_source: "unavailable".into(),
                });
                return Err(error).context("Machine translation request could not be sent.");
            }
        };
        let status = response.status();
        let retry = status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error();
        let delay = retry_delay(&response, attempt);
        let metered = response
            .headers()
            .get("x-metered-usage")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok());
        let body = read_body(response)?;
        if status.is_success() {
            let value: Value = serde_json::from_slice(&body)
                .context("Machine translation response is not valid JSON.")?;
            let billed = value
                .get("billed_characters")
                .and_then(Value::as_u64)
                .or(metered);
            observe(MachineTranslationAttempt {
                attempt: attempt as u32 + 1,
                succeeded: true,
                latency_ms: started.elapsed().as_millis() as u64,
                failure_category: None,
                response_characters: String::from_utf8_lossy(&body).chars().count() as u64,
                billed_characters: billed,
                usage_source: if billed.is_some() {
                    "provider-reported".into()
                } else {
                    "local-measured".into()
                },
            });
            return Ok(WireResponse { value });
        }
        observe(MachineTranslationAttempt {
            attempt: attempt as u32 + 1,
            succeeded: false,
            latency_ms: started.elapsed().as_millis() as u64,
            failure_category: Some(
                if status == StatusCode::TOO_MANY_REQUESTS {
                    "rate-limit"
                } else if status.is_server_error() {
                    "provider"
                } else {
                    "request"
                }
                .into(),
            ),
            response_characters: String::from_utf8_lossy(&body).chars().count() as u64,
            billed_characters: metered,
            usage_source: if metered.is_some() {
                "provider-reported".into()
            } else {
                "unavailable".into()
            },
        });
        if retry && attempt < MAX_RETRIES {
            thread::sleep(delay);
            continue;
        }
        return Err(error_detail(status, &body));
    }
    unreachable!()
}

fn locale(protocol: MachineTranslationProtocol, value: &str) -> String {
    let normalized = value.replace('_', "-");
    match protocol {
        MachineTranslationProtocol::Deepl => normalized
            .split('-')
            .next()
            .unwrap_or(&normalized)
            .to_ascii_uppercase(),
        MachineTranslationProtocol::BaiduGeneral => {
            match normalized.to_ascii_lowercase().as_str() {
                "en" | "en-us" => "en",
                "zh-cn" | "zh-hans" => "zh",
                "zh-tw" | "zh-hant" => "cht",
                "ja" | "ja-jp" => "jp",
                "ko" | "ko-kr" => "kor",
                other => other,
            }
            .into()
        }
        MachineTranslationProtocol::TencentTmt => match normalized.to_ascii_lowercase().as_str() {
            "zh-cn" | "zh-hans" => "zh",
            "zh-tw" | "zh-hant" => "zh-TW",
            other => other,
        }
        .into(),
        _ => normalized,
    }
}

fn md5_hex(value: &str) -> String {
    format!("{:x}", Md5::digest(value.as_bytes()))
}
fn sha256_hex(value: &str) -> String {
    use sha2::Digest;
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn hmac(key: &[u8], value: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts arbitrary key lengths");
    mac.update(value.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

fn tencent_headers(
    profile: &MachineTranslationProfile,
    credentials: &BTreeMap<String, String>,
    payload: &str,
) -> anyhow::Result<BTreeMap<String, String>> {
    let secret_id = credential(credentials, "secret-id")?;
    let secret_key = credential(credentials, "secret-key")?;
    let url = Url::parse(&profile.base_url)?;
    let host = url.host_str().context("Tencent endpoint has no host.")?;
    let timestamp = time::OffsetDateTime::now_utc().unix_timestamp();
    let date = time::OffsetDateTime::from_unix_timestamp(timestamp)?
        .date()
        .to_string();
    let action = "BatchTranslate";
    let service = "tmt";
    let canonical_headers = format!(
        "content-type:application/json\nhost:{host}\nx-tc-action:{}\n",
        action.to_ascii_lowercase()
    );
    let signed_headers = "content-type;host;x-tc-action";
    let canonical_request = format!(
        "POST\n/\n\n{canonical_headers}\n{signed_headers}\n{}",
        sha256_hex(payload)
    );
    let scope = format!("{date}/{service}/tc3_request");
    let string_to_sign = format!(
        "TC3-HMAC-SHA256\n{timestamp}\n{scope}\n{}",
        sha256_hex(&canonical_request)
    );
    let secret_date = hmac(format!("TC3{secret_key}").as_bytes(), &date);
    let secret_service = hmac(&secret_date, service);
    let secret_signing = hmac(&secret_service, "tc3_request");
    let signature = hmac(&secret_signing, &string_to_sign)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(BTreeMap::from([
        (
            "Authorization".into(),
            format!(
                "TC3-HMAC-SHA256 Credential={secret_id}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
            ),
        ),
        ("Host".into(), host.into()),
        ("X-TC-Action".into(), action.into()),
        ("X-TC-Version".into(), "2018-03-21".into()),
        ("X-TC-Timestamp".into(), timestamp.to_string()),
        (
            "X-TC-Region".into(),
            profile
                .region
                .clone()
                .context("Tencent TMT profile requires a region.")?,
        ),
    ]))
}

fn translate_wire(
    profile: &MachineTranslationProfile,
    credentials: &BTreeMap<String, String>,
    source: &str,
    target: &str,
    texts: &[String],
    job_id: &str,
    observe: &mut dyn FnMut(MachineTranslationAttempt),
) -> anyhow::Result<Vec<(String, Option<String>)>> {
    let client = client()?;
    let source = locale(profile.protocol, source);
    let target = locale(profile.protocol, target);
    let response = match profile.protocol {
        MachineTranslationProtocol::Deepl => {
            let mut form = vec![
                ("source_lang".to_string(), source),
                ("target_lang".to_string(), target),
            ];
            form.extend(texts.iter().cloned().map(|text| ("text".into(), text)));
            send(
                job_id,
                || {
                    Ok(client
                        .post(endpoint(profile, "v2/translate"))
                        .header(
                            "Authorization",
                            format!("DeepL-Auth-Key {}", credential(credentials, "api-key")?),
                        )
                        .form(&form))
                },
                observe,
            )?
        }
        MachineTranslationProtocol::GoogleBasicV2 => {
            let mut url = Url::parse(&endpoint(profile, "language/translate/v2"))?;
            url.query_pairs_mut()
                .append_pair("key", credential(credentials, "api-key")?);
            let body = json!({"q":texts,"source":source,"target":target,"format":"text"});
            send(job_id, || Ok(client.post(url.clone()).json(&body)), observe)?
        }
        MachineTranslationProtocol::MicrosoftV3 => {
            let mut url = Url::parse(&endpoint(profile, "translate"))?;
            url.query_pairs_mut()
                .append_pair("api-version", "3.0")
                .append_pair("from", &source)
                .append_pair("to", &target);
            let body = texts
                .iter()
                .map(|text| json!({"Text":text}))
                .collect::<Vec<_>>();
            send(
                job_id,
                || {
                    let mut request = client
                        .post(url.clone())
                        .header(
                            "Ocp-Apim-Subscription-Key",
                            credential(credentials, "api-key")?,
                        )
                        .json(&body);
                    if let Some(region) = &profile.region {
                        request = request.header("Ocp-Apim-Subscription-Region", region)
                    }
                    Ok(request)
                },
                observe,
            )?
        }
        MachineTranslationProtocol::BaiduGeneral => {
            let joined = texts.join("\n");
            let salt = uuid::Uuid::new_v4().simple().to_string();
            let app_id = credential(credentials, "app-id")?;
            let sign = md5_hex(&format!(
                "{app_id}{joined}{salt}{}",
                credential(credentials, "secret")?
            ));
            let form = [
                ("q", joined),
                ("from", source),
                ("to", target),
                ("appid", app_id.into()),
                ("salt", salt),
                ("sign", sign),
            ];
            send(
                job_id,
                || {
                    Ok(client
                        .post(endpoint(profile, "api/trans/vip/translate"))
                        .form(&form))
                },
                observe,
            )?
        }
        MachineTranslationProtocol::TencentTmt => {
            let body =
                json!({"Source":source,"Target":target,"ProjectId":0,"SourceTextList":texts});
            let payload = serde_json::to_string(&body)?;
            send(
                job_id,
                || {
                    let headers = tencent_headers(profile, credentials, &payload)?;
                    let mut request = client
                        .post(&profile.base_url)
                        .header(CONTENT_TYPE, "application/json")
                        .body(payload.clone());
                    for (key, value) in headers {
                        request = request.header(key, value)
                    }
                    Ok(request)
                },
                observe,
            )?
        }
        MachineTranslationProtocol::LibreTranslate => {
            let body = json!({"q":texts,"source":source,"target":target,"format":"text","api_key":credentials.get("api-key")});
            send(
                job_id,
                || Ok(client.post(endpoint(profile, "translate")).json(&body)),
                observe,
            )?
        }
    };
    let value = response.value;
    let results = match profile.protocol {
        MachineTranslationProtocol::Deepl => value
            .get("translations")
            .and_then(Value::as_array)
            .context("DeepL response has no translations.")?
            .iter()
            .map(|item| {
                Ok((
                    item.get("text")
                        .and_then(Value::as_str)
                        .context("DeepL translation has no text.")?
                        .into(),
                    item.get("detected_source_language")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MachineTranslationProtocol::GoogleBasicV2 => value
            .pointer("/data/translations")
            .and_then(Value::as_array)
            .context("Google response has no translations.")?
            .iter()
            .map(|item| {
                Ok((
                    html_escape::decode_html_entities(
                        item.get("translatedText")
                            .and_then(Value::as_str)
                            .context("Google translation has no text.")?,
                    )
                    .into_owned(),
                    item.get("detectedSourceLanguage")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MachineTranslationProtocol::MicrosoftV3 => value
            .as_array()
            .context("Microsoft response is not an array.")?
            .iter()
            .map(|item| {
                Ok((
                    item.pointer("/translations/0/text")
                        .and_then(Value::as_str)
                        .context("Microsoft translation has no text.")?
                        .into(),
                    item.pointer("/detectedLanguage/language")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MachineTranslationProtocol::BaiduGeneral => value
            .get("trans_result")
            .and_then(Value::as_array)
            .context("Baidu response has no translations.")?
            .iter()
            .map(|item| {
                Ok((
                    item.get("dst")
                        .and_then(Value::as_str)
                        .context("Baidu translation has no text.")?
                        .into(),
                    value
                        .get("from")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MachineTranslationProtocol::TencentTmt => value
            .pointer("/Response/TargetTextList")
            .and_then(Value::as_array)
            .context("Tencent response has no translations.")?
            .iter()
            .map(|item| {
                Ok((
                    item.as_str()
                        .context("Tencent translation is not text.")?
                        .into(),
                    None,
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MachineTranslationProtocol::LibreTranslate => {
            let texts = value
                .get("translatedText")
                .context("LibreTranslate response has no translatedText.")?;
            if let Some(items) = texts.as_array() {
                items
                    .iter()
                    .map(|item| {
                        Ok((
                            item.as_str()
                                .context("LibreTranslate translation is not text.")?
                                .into(),
                            value
                                .get("detectedLanguage")
                                .and_then(|v| v.get("language"))
                                .and_then(Value::as_str)
                                .map(str::to_string),
                        ))
                    })
                    .collect::<anyhow::Result<Vec<_>>>()?
            } else {
                vec![(
                    texts
                        .as_str()
                        .context("LibreTranslate translation is not text.")?
                        .into(),
                    None,
                )]
            }
        }
    };
    if results.len() != texts.len() {
        bail!(
            "Machine translation provider returned {} results for {} items.",
            results.len(),
            texts.len()
        )
    }
    Ok(results)
}

pub fn translate(
    request: &MachineTranslateBatchRequest,
    observe: &mut dyn FnMut(MachineTranslationAttempt),
) -> anyhow::Result<Vec<MachineTranslationResultItem>> {
    if request.items.is_empty() {
        bail!("Machine translation batch cannot be empty.")
    }
    let profile = resolve_profile(request.profile_id.as_deref())?;
    if !profile.enabled {
        bail!("The selected machine translation profile is disabled.")
    }
    let credentials = resolve_credentials(&profile)?;
    let preset = super::presets::preset(&profile.preset_id)
        .context("Machine translation preset does not exist.")?;
    validate_limits(&request.items, &preset.capability)?;
    let protected = request
        .items
        .iter()
        .map(|item| protect(&item.text, item.format))
        .collect::<Vec<ProtectedText>>();
    let texts = protected
        .iter()
        .map(|item| item.request_text().to_string())
        .collect::<Vec<_>>();
    let remote = translate_wire(
        &profile,
        &credentials,
        request.source_locale.as_deref().unwrap_or("auto"),
        &request.target_locale,
        &texts,
        &request.job_id,
        observe,
    )?;
    request
        .items
        .iter()
        .zip(protected)
        .zip(remote)
        .map(|((item, protected), (translated, detected))| {
            Ok(MachineTranslationResultItem {
                id: item.id.clone(),
                translated_text: protected.restore(&translated)?,
                detected_language: detected,
            })
        })
        .collect()
}

fn static_languages(protocol: MachineTranslationProtocol) -> Vec<MachineTranslationLanguage> {
    let values = match protocol {
        MachineTranslationProtocol::BaiduGeneral => vec![
            ("auto", "Auto"),
            ("zh", "Chinese Simplified"),
            ("cht", "Chinese Traditional"),
            ("en", "English"),
            ("jp", "Japanese"),
            ("kor", "Korean"),
            ("fra", "French"),
            ("spa", "Spanish"),
            ("de", "German"),
        ],
        MachineTranslationProtocol::TencentTmt => vec![
            ("auto", "Auto"),
            ("zh", "Chinese Simplified"),
            ("zh-TW", "Chinese Traditional"),
            ("en", "English"),
            ("ja", "Japanese"),
            ("ko", "Korean"),
            ("fr", "French"),
            ("es", "Spanish"),
            ("de", "German"),
        ],
        _ => Vec::new(),
    };
    values
        .into_iter()
        .map(|(code, name)| MachineTranslationLanguage {
            code: code.into(),
            name: name.into(),
            supports_source: true,
            supports_target: code != "auto",
        })
        .collect()
}

pub fn list_languages(
    request: MachineTranslationProfileRequest,
) -> anyhow::Result<Vec<MachineTranslationLanguage>> {
    let profile = resolve_profile(Some(&request.profile_id))?;
    if matches!(
        profile.protocol,
        MachineTranslationProtocol::BaiduGeneral | MachineTranslationProtocol::TencentTmt
    ) {
        return Ok(static_languages(profile.protocol));
    }
    let credentials = resolve_credentials(&profile)?;
    let client = client()?;
    let mut noop = |_: MachineTranslationAttempt| {};
    let job = format!("mt-languages:{}", profile.id);
    let response = match profile.protocol {
        MachineTranslationProtocol::Deepl => {
            send(
                &job,
                || {
                    Ok(client
                        .get(endpoint(&profile, "v2/languages"))
                        .header(
                            "Authorization",
                            format!("DeepL-Auth-Key {}", credential(&credentials, "api-key")?),
                        )
                        .query(&[("type", "target")]))
                },
                &mut noop,
            )?
            .value
        }
        MachineTranslationProtocol::GoogleBasicV2 => {
            let mut url = Url::parse(&endpoint(&profile, "language/translate/v2/languages"))?;
            url.query_pairs_mut()
                .append_pair("key", credential(&credentials, "api-key")?)
                .append_pair("target", "en");
            send(&job, || Ok(client.get(url.clone())), &mut noop)?.value
        }
        MachineTranslationProtocol::MicrosoftV3 => {
            send(
                &job,
                || {
                    Ok(client
                        .get(endpoint(&profile, "languages"))
                        .query(&[("api-version", "3.0")]))
                },
                &mut noop,
            )?
            .value
        }
        MachineTranslationProtocol::LibreTranslate => {
            send(
                &job,
                || Ok(client.get(endpoint(&profile, "languages"))),
                &mut noop,
            )?
            .value
        }
        _ => unreachable!(),
    };
    let result = parse_languages(profile.protocol, &response)?;
    jobs::clear(&job);
    Ok(result)
}

fn parse_languages(
    protocol: MachineTranslationProtocol,
    response: &Value,
) -> anyhow::Result<Vec<MachineTranslationLanguage>> {
    let result = match protocol {
        MachineTranslationProtocol::Deepl => response
            .as_array()
            .context("DeepL languages response is not an array.")?
            .iter()
            .map(|v| MachineTranslationLanguage {
                code: v
                    .get("language")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                name: v
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                supports_source: true,
                supports_target: true,
            })
            .collect(),
        MachineTranslationProtocol::GoogleBasicV2 => response
            .pointer("/data/languages")
            .and_then(Value::as_array)
            .context("Google languages response is invalid.")?
            .iter()
            .map(|v| MachineTranslationLanguage {
                code: v
                    .get("language")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                name: v
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                supports_source: true,
                supports_target: true,
            })
            .collect(),
        MachineTranslationProtocol::MicrosoftV3 => response
            .pointer("/translation")
            .and_then(Value::as_object)
            .context("Microsoft languages response is invalid.")?
            .iter()
            .map(|(code, v)| MachineTranslationLanguage {
                code: code.clone(),
                name: v.get("name").and_then(Value::as_str).unwrap_or(code).into(),
                supports_source: true,
                supports_target: true,
            })
            .collect(),
        MachineTranslationProtocol::LibreTranslate => response
            .as_array()
            .context("LibreTranslate languages response is invalid.")?
            .iter()
            .map(|v| MachineTranslationLanguage {
                code: v
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                name: v
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                supports_source: true,
                supports_target: true,
            })
            .collect(),
        _ => unreachable!(),
    };
    Ok(result)
}

pub fn test_profile(
    request: MachineTranslationProfileRequest,
    observe: &mut dyn FnMut(MachineTranslationAttempt),
) -> anyhow::Result<MachineTranslationProfileTestResult> {
    let profile = resolve_profile(Some(&request.profile_id))?;
    let (source, target) = match profile.protocol {
        MachineTranslationProtocol::BaiduGeneral => ("en-US", "zh-CN"),
        MachineTranslationProtocol::TencentTmt => ("en-US", "zh-CN"),
        _ => ("en-US", "de-DE"),
    };
    let job_id = format!("mt-test:{}", profile.id);
    let started = Instant::now();
    let request = MachineTranslateBatchRequest {
        job_id: job_id.clone(),
        profile_id: Some(profile.id),
        source_locale: Some(source.into()),
        target_locale: target.into(),
        items: vec![MachineTranslationItem {
            id: "probe".into(),
            text: "Hello".into(),
            format: crate::domain::ai::types::AiTranslationFormat::PlainText,
        }],
        usage_context: None,
        knowledge_policy: Default::default(),
    };
    let item = translate(&request, observe)?
        .into_iter()
        .next()
        .context("Machine translation test returned no result.")?;
    jobs::clear(&job_id);
    Ok(MachineTranslationProfileTestResult {
        latency_ms: started.elapsed().as_millis(),
        detected_language: item.detected_language,
    })
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_machine_translation_adapters_tests.rs"]
mod tests;
