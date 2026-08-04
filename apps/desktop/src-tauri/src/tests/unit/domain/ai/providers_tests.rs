use super::*;
use crate::domain::ai::types::{AiTranslationFormat, AiTranslationItem};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn request(items: Vec<AiTranslationItem>) -> AiTranslateBatchRequest {
    AiTranslateBatchRequest {
        job_id: "test-job".into(),
        profile_id: None,
        source_locale: Some("en".into()),
        target_locale: "zh-Hans".into(),
        items,
        usage_context: None,
        knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
        skip_format_validation: false,
        max_batch_bytes: None,
    }
}

fn item(id: &str, text: &str) -> AiTranslationItem {
    AiTranslationItem {
        id: id.into(),
        text: text.into(),
        format: AiTranslationFormat::PlainText,
        context: None,
    }
}

#[test]
fn parses_all_three_protocol_result_shapes() {
    let payload = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let encoded = payload.to_string();
    let responses = json!({"output_text": encoded});
    let chat = json!({"choices":[{"message":{"content": payload.to_string()}}]});
    let anthropic = json!({"content":[{"type":"tool_use","input": payload}]});
    let anthropic_text =
        json!({"content":[{"type":"text","text":format!("```json\n{encoded}\n```")} ]});

    assert_eq!(
        parse_translation_value(responses, AiProtocol::OpenaiResponses)
            .unwrap()
            .0["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(chat, AiProtocol::OpenaiChatCompletions)
            .unwrap()
            .0["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(anthropic, AiProtocol::AnthropicMessages)
            .unwrap()
            .0["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(anthropic_text, AiProtocol::AnthropicMessages)
            .unwrap()
            .0["items"][0]["id"],
        "a"
    );
}

#[test]
fn extracts_reasoning_from_chat_and_responses_payloads() {
    let payload = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let encoded = payload.to_string();

    let deepseek_chat = json!({
        "choices":[{"message":{
            "content": encoded,
            "reasoning_content":"Step 1: identify the greeting.\nStep 2: translate."
        }}]
    });
    let (_, reasoning) =
        parse_translation_value(deepseek_chat, AiProtocol::OpenaiChatCompletions).unwrap();
    assert_eq!(
        reasoning.as_deref(),
        Some("Step 1: identify the greeting.\nStep 2: translate.")
    );

    let openai_reasoning_parts = json!({
        "choices":[{"message":{
            "content": encoded,
            "reasoning":[{"type":"reasoning_text","text":"first"},{"type":"reasoning_text","text":"second"}]
        }}]
    });
    let (_, reasoning) =
        parse_translation_value(openai_reasoning_parts, AiProtocol::OpenaiChatCompletions).unwrap();
    assert_eq!(reasoning.as_deref(), Some("first\nsecond"));

    let responses_reasoning = json!({
        "output":[
            {"type":"reasoning","summary":[{"type":"summary_text","text":"summary a"},{"type":"summary_text","text":"summary b"}],"content":[{"type":"reasoning_text","text":"detail"}]},
            {"type":"message","content":[{"type":"output_text","text":encoded}]}
        ]
    });
    let (_, reasoning) =
        parse_translation_value(responses_reasoning, AiProtocol::OpenaiResponses).unwrap();
    assert_eq!(reasoning.as_deref(), Some("summary a\nsummary b\ndetail"));

    // No reasoning payload -> None, and Anthropic never reports reasoning.
    let plain_chat = json!({"choices":[{"message":{"content": encoded}}]});
    let (_, reasoning) =
        parse_translation_value(plain_chat, AiProtocol::OpenaiChatCompletions).unwrap();
    assert!(reasoning.is_none());
    let anthropic = json!({"content":[{"type":"tool_use","input": payload}]});
    let (_, reasoning) = parse_translation_value(anthropic, AiProtocol::AnthropicMessages).unwrap();
    assert!(reasoning.is_none());
}

#[test]
fn combines_anthropic_cache_creation_and_read_tokens() {
    let usage = provider_usage(&json!({
        "usage": {
            "input_tokens": 20,
            "output_tokens": 8,
            "cache_creation_input_tokens": 13,
            "cache_read_input_tokens": 21
        }
    }));
    assert_eq!(usage.input_tokens, Some(20));
    assert_eq!(usage.output_tokens, Some(8));
    assert_eq!(usage.cached_tokens, Some(34));
}

#[test]
fn rejects_extra_ids_and_changed_placeholders() {
    let source = request(vec![item("a", "Hello {{name}} $0 {0:N0} %s")]);
    let extra = json!({"items":[
        {"id":"a","translatedText":"你好 {{name}} $0 {0:N0} %s","detectedLanguage":"en"},
        {"id":"extra","translatedText":"x","detectedLanguage":"en"}
    ]});
    assert!(
        validate_translation_items(&source, extra, false)
            .unwrap_err()
            .to_string()
            .contains("exactly match")
    );

    let changed = json!({"items":[{"id":"a","translatedText":"你好 {{user}} $0 {0:N0} %s","detectedLanguage":"en"}]});
    assert!(
        validate_translation_items(&source, changed, false)
            .unwrap_err()
            .to_string()
            .contains("changed placeholders")
    );
}

#[test]
fn tolerates_whitespace_inside_placeholder_tokens() {
    let source = request(vec![
        item("a", "Hello {{name}} $0 {0:N0} %s"),
        item("b", "Hi {player:DisplayName}"),
    ]);
    let whitespace = json!({"items":[
        {"id":"a","translatedText":"你好 {{ name }} $0 {0 : N0} %s","detectedLanguage":"en"},
        {"id":"b","translatedText":"你好 {player : DisplayName}","detectedLanguage":"en"}
    ]});
    let results = validate_translation_items(&source, whitespace, false).unwrap();
    assert_eq!(results[0].translated_text, "你好 {{ name }} $0 {0 : N0} %s");
    assert_eq!(results[1].translated_text, "你好 {player : DisplayName}");
}

#[test]
fn accepts_text_field_as_translation_alias_and_ignores_extra_fields() {
    let source = request(vec![item(
        "overview:segment-0",
        "This is a segment to translate.",
    )]);
    // deepseek-v4-flash echoes the request item verbatim: the translation lands
    // in `text` and the item carries format/context metadata.
    let echoed = json!({"items":[
        {"id":"overview:segment-0","format":"nexusBbcodeText","context":null,"text":"这是要翻译的片段。"}
    ]});
    let results = validate_translation_items(&source, echoed, false).unwrap();
    assert_eq!(results[0].translated_text, "这是要翻译的片段。");
    assert_eq!(results[0].detected_language, None);
}

#[test]
fn translated_text_wins_over_the_text_alias() {
    let source = request(vec![item("a", "Hello")]);
    let both = json!({"items":[
        {"id":"a","translatedText":"你好","text":"Hello","detectedLanguage":"en"}
    ]});
    let results = validate_translation_items(&source, both, false).unwrap();
    assert_eq!(results[0].translated_text, "你好");
    assert_eq!(results[0].detected_language.as_deref(), Some("en"));
}

#[test]
fn missing_both_translated_text_and_text_still_fails_validation() {
    let source = request(vec![item("a", "Hello")]);
    let neither = json!({"items":[{"id":"a"}]});
    let error = validate_translation_items(&source, neither, false)
        .unwrap_err()
        .to_string();
    assert!(error.contains("missing"), "{error}");
    // A non-string `text` is not a usable alias and still fails.
    let non_string = json!({"items":[{"id":"a","text":null}]});
    let error = validate_translation_items(&source, non_string, false)
        .unwrap_err()
        .to_string();
    assert!(error.contains("missing"), "{error}");
}

#[test]
fn id_validation_is_unchanged_when_items_use_the_text_alias() {
    let source = request(vec![item("a", "One"), item("b", "Two")]);
    let duplicates = json!({"items":[
        {"id":"a","text":"一"},
        {"id":"a","text":"二"}
    ]});
    assert!(
        validate_translation_items(&source, duplicates, false)
            .unwrap_err()
            .to_string()
            .contains("duplicate")
    );
    let extra = json!({"items":[
        {"id":"a","text":"一"},
        {"id":"b","text":"二"},
        {"id":"c","text":"三"}
    ]});
    assert!(
        validate_translation_items(&source, extra, false)
            .unwrap_err()
            .to_string()
            .contains("exactly match")
    );
    let missing = json!({"items":[{"id":"a","text":"一"}]});
    assert!(
        validate_translation_items(&source, missing, false)
            .unwrap_err()
            .to_string()
            .contains("exactly match")
    );
}

#[test]
fn placeholder_mismatch_reports_expected_vs_actual() {
    let source = request(vec![item("a", "Hello {{name}} $0")]);
    let changed =
        json!({"items":[{"id":"a","translatedText":"你好 {{user}} $0","detectedLanguage":"en"}]});
    let message = validate_translation_items(&source, changed, false)
        .unwrap_err()
        .to_string();
    assert!(message.contains("expected [$0, {{name}}]"), "{message}");
    assert!(message.contains("got [$0, {{user}}]"), "{message}");
}

#[test]
fn full_translate_path_accepts_an_echoed_request_item_shape() {
    // The reported regression: deepseek-v4-flash returns the request item with
    // the translation in `text` plus format/context metadata. The whole chain
    // (parse -> validate) must accept it instead of failing with an
    // invalid-response error.
    let echoed = json!({"items":[
        {"id":"overview:segment-0","format":"nexusBbcodeText","context":null,"text":"这是要翻译的片段。"}
    ]});
    let body = json!({"choices":[{"message":{"content":echoed.to_string()}}]}).to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let response: &'static str = Box::leak(response.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    let batch = request(vec![item(
        "overview:segment-0",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("echo-shape-job").unwrap();
    let (translated, reasoning) = translate(&profile, &batch, &job).unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert_eq!(translated[0].translated_text, "这是要翻译的片段。");
    assert_eq!(translated[0].detected_language, None);
    assert!(reasoning.is_none());
}

#[test]
fn detects_supported_same_language_targets() {
    assert!(same_language(
        "This sentence is clearly written in English for reliable language detection.",
        "en"
    ));
    assert!(same_language(
        "这是一段足够长的简体中文句子，用于可靠地检测文本语言。",
        "zh-Hans"
    ));
    assert!(!same_language(
        "This sentence is clearly written in English for reliable language detection.",
        "zh-Hans"
    ));
    assert!(same_language(
        "Cette phrase est clairement écrite en français afin de permettre une détection fiable de la langue.",
        "fr-FR"
    ));
}

#[test]
fn validates_batch_limits_and_unique_ids() {
    let duplicate = request(vec![item("same", "one"), item("same", "two")]);
    assert!(
        validate_request(&duplicate)
            .unwrap_err()
            .to_string()
            .contains("unique")
    );
    let oversized = request(vec![item("large", &"a".repeat(32 * 1024 + 1))]);
    assert!(
        validate_request(&oversized)
            .unwrap_err()
            .to_string()
            .contains("32 KB")
    );
    let oversized_context = request(vec![AiTranslationItem {
        context: Some("x".repeat(MAX_REQUEST_BYTES)),
        ..item("context", "small")
    }]);
    assert!(
        validate_request(&oversized_context)
            .unwrap_err()
            .to_string()
            .contains("512 KB")
    );
    let too_many = request((0..33).map(|index| item(&index.to_string(), "x")).collect());
    assert!(
        validate_request(&too_many)
            .unwrap_err()
            .to_string()
            .contains("32 items")
    );
}

#[test]
fn honors_the_max_batch_bytes_override_and_rejects_out_of_range_values() {
    // 9 x 30 KB = 270 KB total; each item is under the 32 KB item limit.
    let large = request(
        (0..9)
            .map(|index| item(&index.to_string(), &"a".repeat(30 * 1024)))
            .collect(),
    );
    assert!(
        validate_request(&large)
            .unwrap_err()
            .to_string()
            .contains("256 KB")
    );
    // An override can only tighten the cap: out-of-range values are rejected.
    let mut overridden = request(vec![item("mid", &"a".repeat(30 * 1024))]);
    overridden.max_batch_bytes = Some(0);
    assert!(validate_request(&overridden).is_err());
    overridden.max_batch_bytes = Some(300 * 1024);
    assert!(
        validate_request(&overridden)
            .unwrap_err()
            .to_string()
            .contains("no larger than 262144")
    );

    // 6 x 30 KB = 180 KB fits inside a 200 KB override.
    let mut fits = request(
        (0..6)
            .map(|index| item(&index.to_string(), &"a".repeat(30 * 1024)))
            .collect(),
    );
    fits.max_batch_bytes = Some(200 * 1024);
    assert!(validate_request(&fits).is_ok());

    // A 150 KB override still rejects the 180 KB batch.
    let mut tightened = request(
        (0..6)
            .map(|index| item(&index.to_string(), &"a".repeat(30 * 1024)))
            .collect(),
    );
    tightened.max_batch_bytes = Some(150 * 1024);
    let error = validate_request(&tightened).unwrap_err().to_string();
    assert!(error.contains("150 KB"), "{error}");
}

#[test]
fn skip_format_validation_skips_only_the_placeholder_multiset_comparison() {
    let mut source = request(vec![item("a", "Hello {{name}} $0"), item("b", "Hi %s")]);
    source.skip_format_validation = true;
    let changed = json!({"items":[
        {"id":"a","translatedText":"你好 {{user}} $1","detectedLanguage":"en"},
        {"id":"b","translatedText":"你好 %s","detectedLanguage":"en"}
    ]});
    // Placeholder changes pass, but the id/count checks still run.
    let results = validate_translation_items(&source, changed, true).unwrap();
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].translated_text, "你好 {{user}} $1");

    // Duplicate ids and missing items are still rejected when skipping.
    let duplicates = json!({"items":[
        {"id":"a","translatedText":"x","detectedLanguage":"en"},
        {"id":"a","translatedText":"y","detectedLanguage":"en"},
        {"id":"b","translatedText":"z","detectedLanguage":"en"}
    ]});
    assert!(
        validate_translation_items(&source, duplicates, true)
            .unwrap_err()
            .to_string()
            .contains("duplicate")
    );
    let missing = json!({"items":[{"id":"a","translatedText":"x","detectedLanguage":"en"}]});
    assert!(
        validate_translation_items(&source, missing, true)
            .unwrap_err()
            .to_string()
            .contains("exactly match")
    );
    // And the same response without skipping still fails on the placeholders.
    let changed_again = json!({"items":[
        {"id":"a","translatedText":"你好 {{user}} $1","detectedLanguage":"en"},
        {"id":"b","translatedText":"你好 %s","detectedLanguage":"en"}
    ]});
    assert!(
        validate_translation_items(&source, changed_again, false)
            .unwrap_err()
            .to_string()
            .contains("changed placeholders")
    );
}

#[test]
fn rejects_provider_responses_above_the_body_limit() {
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{{}}",
        MAX_RESPONSE_BYTES + 1
    );
    let response: &'static str = Box::leak(response.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let error = send_with_retry(None, || Ok(client().unwrap().get(&url))).unwrap_err();
    assert!(error.to_string().contains("response exceeds"));
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
}

fn test_profile(protocol: AiProtocol) -> AiProviderProfile {
    AiProviderProfile {
        id: "test".into(),
        name: "Test".into(),
        preset_id: "custom".into(),
        protocol,
        base_url: "https://example.invalid/v1".into(),
        model: "test-model".into(),
        credential_environment: None,
        allow_insecure_http: false,
        context_window_tokens: None,
        max_output_tokens: None,
        temperature: None,
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        max_batch_bytes: None,
        enable_reasoning: false,
        reasoning_effort: None,
        stream_translation: false,
        key_configured: true,
        resolved_credential_source: Some("keychain".into()),
    }
}

fn spawn_http_server(
    responses: Vec<&'static str>,
) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (request_tx, request_rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(1)))
                .unwrap();
            let mut bytes = [0_u8; 8192];
            let count = stream.read(&mut bytes).unwrap();
            request_tx
                .send(String::from_utf8_lossy(&bytes[..count]).to_string())
                .unwrap();
            stream.write_all(response.as_bytes()).unwrap();
        }
    });
    (format!("http://{address}"), request_rx, handle)
}

#[test]
fn applies_protocol_authentication_headers() {
    let client = client().unwrap();
    let openai = authenticated(
        client.get("http://127.0.0.1:1"),
        &test_profile(AiProtocol::OpenaiChatCompletions),
        Some("openai-secret"),
    )
    .unwrap()
    .build()
    .unwrap();
    assert_eq!(openai.headers()[AUTHORIZATION], "Bearer openai-secret");

    let anthropic = authenticated(
        client.get("http://127.0.0.1:1"),
        &test_profile(AiProtocol::AnthropicMessages),
        Some("anthropic-secret"),
    )
    .unwrap()
    .build()
    .unwrap();
    assert_eq!(anthropic.headers()["x-api-key"], "anthropic-secret");
    assert_eq!(anthropic.headers()["anthropic-version"], "2023-06-01");
}

#[test]
fn structured_review_reuses_authenticated_protocol_and_usage_parsing() {
    let payload = json!({"issues":[{"unitKey":"greeting","severity":"major","category":"meaning","reason":"Wrong meaning","suggestion":"您好"}]});
    let body =
        json!({"output_text":payload.to_string(),"usage":{"input_tokens":12,"output_tokens":8}})
            .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let response: &'static str = Box::leak(response.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiResponses);
    profile.base_url = url;
    profile.credential_environment = Some("MODFORGE_TEST_STRUCTURED_KEY".into());
    unsafe { std::env::set_var("MODFORGE_TEST_STRUCTURED_KEY", "review-secret") };
    let job = AiJobGuard::register("structured-review-test").unwrap();
    let mut attempts = Vec::new();
    let value = execute_structured_observed(
        &profile,
        &job,
        "Review safely",
        "{\"items\":[]}",
        &json!({"type":"object"}),
        &mut |attempt| attempts.push(attempt),
    )
    .unwrap();
    let request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    unsafe { std::env::remove_var("MODFORGE_TEST_STRUCTURED_KEY") };
    assert!(
        request.contains("Authorization: Bearer review-secret")
            || request.contains("authorization: Bearer review-secret")
    );
    assert_eq!(value["issues"][0]["unitKey"], "greeting");
    assert_eq!(attempts[0].usage.input_tokens, Some(12));
    assert_eq!(attempts[0].usage.output_tokens, Some(8));
}

#[test]
fn retries_rate_limits_and_honors_zero_retry_after() {
    let rate_limited = "HTTP/1.1 429 Too Many Requests\r\nContent-Length: 2\r\nRetry-After: 0\r\nConnection: close\r\n\r\n{}";
    let success = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}";
    let (url, requests, server) = spawn_http_server(vec![rate_limited, success]);
    let client = client().unwrap();
    let result = send_with_retry(None, || Ok(client.get(&url))).unwrap();
    assert_eq!(result["ok"], true);
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
}

#[test]
fn caps_delta_and_http_date_retry_after_values() {
    for header in [
        "999".to_string(),
        (time::OffsetDateTime::now_utc() + time::Duration::minutes(5))
            .format(&time::format_description::well_known::Rfc2822)
            .unwrap(),
    ] {
        let response = format!(
            "HTTP/1.1 429 Too Many Requests\r\nContent-Length: 2\r\nRetry-After: {header}\r\nConnection: close\r\n\r\n{{}}"
        );
        let response: &'static str = Box::leak(response.into_boxed_str());
        let (url, requests, server) = spawn_http_server(vec![response]);
        let response = client().unwrap().get(url).send().unwrap();
        assert_eq!(retry_delay(&response, 0), Duration::from_secs(30));
        requests.recv_timeout(Duration::from_secs(1)).unwrap();
        server.join().unwrap();
    }
}

#[test]
fn refuses_redirects_instead_of_forwarding_credentials() {
    let redirect = "HTTP/1.1 302 Found\r\nLocation: https://example.com/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let (url, requests, server) = spawn_http_server(vec![redirect]);
    let client = client().unwrap();
    let profile = test_profile(AiProtocol::OpenaiChatCompletions);
    let error = send_with_retry(None, || {
        authenticated(client.get(&url), &profile, Some("secret"))
    })
    .unwrap_err();
    assert!(error.to_string().contains("302 Found"));
    let request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    assert!(
        request
            .to_ascii_lowercase()
            .contains("authorization: bearer secret")
    );
    server.join().unwrap();
}

#[test]
fn retries_a_transport_timeout_and_recovers() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (request_tx, request_rx) = mpsc::channel::<String>();
    let server = thread::spawn(move || {
        // First attempt never responds before the client timeout.
        let (mut slow, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8192];
        slow.read(&mut bytes).unwrap();
        request_tx.send("first".into()).unwrap();
        thread::sleep(Duration::from_millis(200));
        // Second attempt responds immediately.
        let (mut fast, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8192];
        fast.read(&mut bytes).unwrap();
        request_tx.send("second".into()).unwrap();
        let body = "{\"ok\":true}";
        write!(
            fast,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });
    let client =
        client_with_timeouts(Duration::from_millis(50), Duration::from_millis(50)).unwrap();
    let mut attempts = Vec::new();
    let result = send_with_retry_observed(
        None,
        || Ok(client.get(&format!("http://{address}"))),
        |attempt| attempts.push(attempt),
    )
    .unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(
        request_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
        "first"
    );
    assert_eq!(
        request_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
        "second"
    );
    assert_eq!(attempts.len(), 2);
    assert!(!attempts[0].succeeded);
    assert_eq!(attempts[0].failure_category.as_deref(), Some("network"));
    assert!(attempts[1].succeeded);
    server.join().unwrap();
}

#[test]
fn retries_a_body_read_timeout_and_recovers() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (request_tx, request_rx) = mpsc::channel::<String>();
    let server = thread::spawn(move || {
        // First response sends headers plus a partial body, then stalls past the
        // client timeout while the declared Content-Length is still outstanding.
        let (mut slow, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8192];
        slow.read(&mut bytes).unwrap();
        request_tx.send("first".into()).unwrap();
        write!(
            slow,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{{\"ok\":"
        )
        .unwrap();
        slow.flush().unwrap();
        thread::sleep(Duration::from_millis(200));
        // Second response completes promptly.
        let (mut fast, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8192];
        fast.read(&mut bytes).unwrap();
        request_tx.send("second".into()).unwrap();
        let body = "{\"ok\":true}";
        write!(
            fast,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });
    let client =
        client_with_timeouts(Duration::from_millis(50), Duration::from_millis(50)).unwrap();
    let mut attempts = Vec::new();
    let result = send_with_retry_observed(
        None,
        || Ok(client.get(&format!("http://{address}"))),
        |attempt| attempts.push(attempt),
    )
    .unwrap();
    assert_eq!(result["ok"], true);
    assert_eq!(
        request_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
        "first"
    );
    assert_eq!(
        request_rx.recv_timeout(Duration::from_secs(1)).unwrap(),
        "second"
    );
    assert_eq!(attempts.len(), 2);
    assert!(!attempts[0].succeeded);
    assert_eq!(attempts[0].failure_category.as_deref(), Some("network"));
    assert!(attempts[1].succeeded);
    server.join().unwrap();
}

#[test]
fn fails_after_all_transport_attempts_time_out() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = thread::spawn(move || {
        for _ in 0..=MAX_RETRIES {
            let (mut stream, _) = listener.accept().unwrap();
            let mut bytes = [0_u8; 8192];
            stream.read(&mut bytes).unwrap();
            thread::sleep(Duration::from_millis(200));
        }
    });
    let client =
        client_with_timeouts(Duration::from_millis(50), Duration::from_millis(50)).unwrap();
    let mut attempts = Vec::new();
    let error = send_with_retry_observed(
        None,
        || Ok(client.get(&format!("http://{address}"))),
        |attempt| attempts.push(attempt),
    )
    .unwrap_err();
    assert!(error.to_string().contains("could not be sent"), "{error}");
    assert_eq!(attempts.len(), MAX_RETRIES + 1);
    for attempt in &attempts {
        assert!(!attempt.succeeded);
        assert_eq!(attempt.failure_category.as_deref(), Some("network"));
    }
    server.join().unwrap();
}

#[test]
fn enforces_the_configured_response_timeout() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let (_stream, _) = listener.accept().unwrap();
        thread::sleep(Duration::from_millis(250));
    });
    let client =
        client_with_timeouts(Duration::from_millis(50), Duration::from_millis(50)).unwrap();
    let error = send_with_retry(None, || Ok(client.get(&url))).unwrap_err();
    assert!(error.to_string().contains("could not be sent"));
    server.join().unwrap();
}

#[test]
fn chooses_chat_structured_output_from_provider_capabilities() {
    let schema = translation_schema();
    assert_eq!(
        chat_response_format(
            AiStructuredOutputCapability::JsonSchema,
            &schema,
            "translation_batch"
        )
        .unwrap()["type"],
        "json_schema"
    );
    assert_eq!(
        chat_response_format(
            AiStructuredOutputCapability::JsonObject,
            &schema,
            "translation_batch"
        )
        .unwrap()["type"],
        "json_object"
    );
    // tool-use forcing happens through `tools` + `tool_choice`, never through
    // `response_format`; `none` sends no forcing parameter at all.
    assert!(
        chat_response_format(
            AiStructuredOutputCapability::ToolUse,
            &schema,
            "translation_batch"
        )
        .is_none()
    );
    assert!(
        chat_response_format(
            AiStructuredOutputCapability::None,
            &schema,
            "translation_batch"
        )
        .is_none()
    );
}

#[test]
fn applies_profile_generation_parameters_per_protocol() {
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.max_output_tokens = Some(4096);
    profile.temperature = Some(0.7);
    profile.top_p = Some(0.9);
    profile.frequency_penalty = Some(0.2);
    profile.presence_penalty = Some(-0.5);

    let mut chat = json!({"model":"m"});
    apply_generation_params(&mut chat, &profile, "max_tokens", true);
    assert_eq!(chat["max_tokens"], 4096);
    assert_eq!(chat["temperature"], 0.7);
    assert_eq!(chat["top_p"], 0.9);
    assert_eq!(chat["frequency_penalty"], 0.2);
    assert_eq!(chat["presence_penalty"], -0.5);

    let mut responses = json!({"model":"m"});
    apply_generation_params(&mut responses, &profile, "max_output_tokens", true);
    assert_eq!(responses["max_output_tokens"], 4096);
    assert_eq!(responses["temperature"], 0.7);
    assert_eq!(responses["frequency_penalty"], 0.2);

    let mut anthropic = json!({"model":"m","max_tokens":8192});
    apply_generation_params(&mut anthropic, &profile, "max_tokens", false);
    assert_eq!(anthropic["max_tokens"], 4096);
    assert_eq!(anthropic["temperature"], 0.7);
    assert_eq!(anthropic["top_p"], 0.9);
    // Anthropic exposes no frequency/presence penalty equivalents, so they are
    // intentionally omitted from the request.
    assert!(anthropic.get("frequency_penalty").is_none());
    assert!(anthropic.get("presence_penalty").is_none());
}

#[test]
fn unset_generation_parameters_are_omitted_from_request_bodies() {
    let profile = test_profile(AiProtocol::OpenaiChatCompletions);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &profile, "max_tokens", true);
    assert!(body.get("max_tokens").is_none());
    assert!(body.get("temperature").is_none());
    assert!(body.get("top_p").is_none());
    assert!(body.get("frequency_penalty").is_none());
    assert!(body.get("presence_penalty").is_none());
}

#[test]
fn maps_reasoning_settings_per_protocol_capability() {
    // Reasoning disabled: no reasoning fields regardless of effort.
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.enable_reasoning = false;
    profile.reasoning_effort = Some(ReasoningEffort::High);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &profile, "max_tokens", true);
    assert!(body.get("reasoning_effort").is_none());
    assert!(body.get("enable_thinking").is_none());

    // Enabled without an explicit effort leaves the provider default untouched.
    profile.enable_reasoning = true;
    profile.reasoning_effort = None;
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &profile, "max_tokens", true);
    assert!(body.get("reasoning_effort").is_none());

    // Enabled with effort on OpenAI-style chat completions.
    profile.reasoning_effort = Some(ReasoningEffort::Medium);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &profile, "max_tokens", true);
    assert_eq!(body["reasoning_effort"], "medium");

    // DeepSeek exposes a nested `thinking` toggle; an unset effort leaves the
    // provider default in place (no `reasoning_effort` key).
    let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
    deepseek.preset_id = "deepseek".into();
    deepseek.enable_reasoning = true;
    deepseek.reasoning_effort = None;
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &deepseek, "max_tokens", true);
    assert_eq!(body["thinking"]["type"], "enabled");
    assert!(body.get("enable_thinking").is_none());
    assert!(body.get("reasoning_effort").is_none());

    // Responses API takes a nested reasoning object.
    let mut responses = test_profile(AiProtocol::OpenaiResponses);
    responses.enable_reasoning = true;
    responses.reasoning_effort = Some(ReasoningEffort::Low);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &responses, "max_output_tokens", true);
    assert_eq!(body["reasoning"]["effort"], "low");

    // Anthropic reasoning is not supported in the first version.
    let mut anthropic = test_profile(AiProtocol::AnthropicMessages);
    anthropic.enable_reasoning = true;
    anthropic.reasoning_effort = Some(ReasoningEffort::High);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &anthropic, "max_tokens", false);
    assert!(body.get("reasoning_effort").is_none());
    assert!(body.get("enable_thinking").is_none());
    assert!(body.get("reasoning").is_none());
}

#[test]
fn explicitly_disables_thinking_when_reasoning_is_turned_off() {
    // DeepSeek's official chat-completions API accepts the nested
    // `thinking: {"type": "disabled"}` off signal; the boolean
    // `enable_thinking` field is silently ignored (verified against the live
    // API: deepseek-v4-flash still returned reasoning_content with
    // `enable_thinking: false`).
    let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
    deepseek.preset_id = "deepseek".into();
    deepseek.enable_reasoning = false;
    deepseek.reasoning_effort = Some(ReasoningEffort::High);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &deepseek, "max_tokens", true);
    assert_eq!(
        body["thinking"]["type"], "disabled",
        "deepseek must disable thinking"
    );
    assert!(
        body.get("enable_thinking").is_none(),
        "deepseek must not guess enable_thinking"
    );
    assert!(body.get("reasoning_effort").is_none(), "deepseek");

    // Qwen (DashScope) accepts a boolean `enable_thinking` that defaults to on
    // for its reasoning models, so the off state must be sent explicitly.
    for preset_id in ["qwen-cn", "qwen-intl"] {
        let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
        profile.preset_id = preset_id.into();
        profile.enable_reasoning = false;
        profile.reasoning_effort = Some(ReasoningEffort::High);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &profile, "max_tokens", true);
        assert_eq!(
            body["enable_thinking"], false,
            "{preset_id} must disable thinking"
        );
        assert!(body.get("reasoning_effort").is_none(), "{preset_id}");
        assert!(body.get("thinking").is_none(), "{preset_id}");
    }
}

#[test]
fn reasoning_off_omits_disable_parameters_for_providers_without_a_switch() {
    // Presets without a confirmed off switch keep the parameter omitted so the
    // provider default applies; guessing a field could be rejected with a 400.
    for preset_id in [
        "custom",
        "openrouter",
        "xai",
        "mistral",
        "groq",
        "gemini",
        "moonshot",
        "zhipu",
        "siliconflow-cn",
        "ollama",
        "lm-studio",
    ] {
        let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
        profile.preset_id = preset_id.into();
        profile.enable_reasoning = false;
        profile.reasoning_effort = Some(ReasoningEffort::High);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &profile, "max_tokens", true);
        assert!(
            body.get("enable_thinking").is_none(),
            "{preset_id} must not guess a disable field"
        );
        assert!(body.get("reasoning_effort").is_none(), "{preset_id}");
    }

    // Responses API: model defaults are non-thinking, or reasoning cannot be
    // switched off (OpenAI gpt-5 family).
    let mut responses = test_profile(AiProtocol::OpenaiResponses);
    responses.enable_reasoning = false;
    responses.reasoning_effort = Some(ReasoningEffort::High);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &responses, "max_output_tokens", true);
    assert!(body.get("reasoning").is_none());

    // Anthropic reasoning is not supported in the first version.
    let mut anthropic = test_profile(AiProtocol::AnthropicMessages);
    anthropic.enable_reasoning = false;
    anthropic.reasoning_effort = Some(ReasoningEffort::High);
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &anthropic, "max_tokens", false);
    assert!(body.get("reasoning_effort").is_none());
    assert!(body.get("enable_thinking").is_none());
    assert!(body.get("reasoning").is_none());
}

#[test]
fn reasoning_on_behavior_is_unchanged_across_presets() {
    // DeepSeek sends its nested `thinking` on-switch; an unset effort leaves
    // the provider default (no `reasoning_effort` key).
    let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
    deepseek.preset_id = "deepseek".into();
    deepseek.enable_reasoning = true;
    deepseek.reasoning_effort = None;
    let mut body = json!({"model":"m"});
    apply_generation_params(&mut body, &deepseek, "max_tokens", true);
    assert_eq!(body["thinking"]["type"], "enabled");
    assert!(body.get("reasoning_effort").is_none());
    assert!(body.get("enable_thinking").is_none());

    // Qwen and the other OpenAI-style providers keep the effort dial and never
    // receive the boolean on-switch.
    for preset_id in ["qwen-cn", "qwen-intl", "openrouter", "moonshot", "zhipu"] {
        let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
        profile.preset_id = preset_id.into();
        profile.enable_reasoning = true;
        profile.reasoning_effort = Some(ReasoningEffort::Medium);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &profile, "max_tokens", true);
        assert_eq!(body["reasoning_effort"], "medium", "{preset_id}");
        assert!(body.get("enable_thinking").is_none(), "{preset_id}");
    }
}

#[test]
fn maps_xhigh_and_max_efforts_to_literal_wire_values() {
    // OpenAI documents `xhigh` and `max` as distinct, model-dependent effort
    // levels, so the enum maps to its literal wire value on chat completions...
    for (effort, expected) in [
        (ReasoningEffort::Low, "low"),
        (ReasoningEffort::Medium, "medium"),
        (ReasoningEffort::High, "high"),
        (ReasoningEffort::Xhigh, "xhigh"),
        (ReasoningEffort::Max, "max"),
    ] {
        let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
        profile.enable_reasoning = true;
        profile.reasoning_effort = Some(effort);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &profile, "max_tokens", true);
        assert_eq!(body["reasoning_effort"], expected, "{effort:?}");

        // ...and on the Responses API nested `reasoning: { effort }` object.
        let mut responses = test_profile(AiProtocol::OpenaiResponses);
        responses.enable_reasoning = true;
        responses.reasoning_effort = Some(effort);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &responses, "max_output_tokens", true);
        assert_eq!(body["reasoning"]["effort"], expected, "{effort:?}");
    }
}

#[test]
fn maps_deepseek_reasoning_effort_levels_to_wire_values() {
    // Official DeepSeek `reasoning_effort` values (OpenAI format): low / high /
    // max, plus xhigh which the server maps per model (v4-flash -> high,
    // v4-pro -> max). There is no `medium`, so it folds into `high`.
    for (effort, expected) in [
        (ReasoningEffort::Low, "low"),
        (ReasoningEffort::Medium, "high"),
        (ReasoningEffort::High, "high"),
        (ReasoningEffort::Xhigh, "xhigh"),
        (ReasoningEffort::Max, "max"),
    ] {
        let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
        deepseek.preset_id = "deepseek".into();
        deepseek.enable_reasoning = true;
        deepseek.reasoning_effort = Some(effort);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &deepseek, "max_tokens", true);
        assert_eq!(body["thinking"]["type"], "enabled", "{effort:?}");
        assert_eq!(body["reasoning_effort"], expected, "{effort:?}");
        assert!(body.get("enable_thinking").is_none(), "{effort:?}");
    }

    // Reasoning off sends only the official off switch; no effort is sent even
    // when a level is configured.
    for effort in [
        ReasoningEffort::Low,
        ReasoningEffort::Medium,
        ReasoningEffort::High,
        ReasoningEffort::Xhigh,
        ReasoningEffort::Max,
    ] {
        let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
        deepseek.preset_id = "deepseek".into();
        deepseek.enable_reasoning = false;
        deepseek.reasoning_effort = Some(effort);
        let mut body = json!({"model":"m"});
        apply_generation_params(&mut body, &deepseek, "max_tokens", true);
        assert_eq!(body["thinking"]["type"], "disabled", "{effort:?}");
        assert!(body.get("reasoning_effort").is_none(), "{effort:?}");
        assert!(body.get("enable_thinking").is_none(), "{effort:?}");
    }
}

#[test]
fn probe_request_builder_applies_reasoning_parameters() {
    // The connection-test probe (`test_ai_profile` -> `translate_observed`)
    // builds its request through the same `translation_request` builder as
    // translation batches, so the reasoning parameters below are exactly what
    // the settings "Test connection" button sends for the same profile.
    let batch = request(vec![item("probe", "Connection test")]);

    // DeepSeek with reasoning off sends the official `thinking` off signal.
    let mut deepseek = test_profile(AiProtocol::OpenaiChatCompletions);
    deepseek.preset_id = "deepseek".into();
    deepseek.enable_reasoning = false;
    deepseek.base_url = "https://api.deepseek.com".into();
    let (_, body) =
        translation_request_at(&deepseek, &batch, AiStructuredOutputCapability::JsonObject)
            .unwrap();
    assert_eq!(body["model"], "test-model");
    assert_eq!(body["thinking"]["type"], "disabled");
    assert!(body.get("enable_thinking").is_none());
    assert!(body.get("reasoning_effort").is_none());

    // DeepSeek with reasoning on sends the official `thinking` on signal plus
    // the effort dial mapped through `deepseek_reasoning_effort_str`.
    let mut deepseek_on = test_profile(AiProtocol::OpenaiChatCompletions);
    deepseek_on.preset_id = "deepseek".into();
    deepseek_on.enable_reasoning = true;
    deepseek_on.reasoning_effort = Some(ReasoningEffort::High);
    deepseek_on.base_url = "https://api.deepseek.com".into();
    let (_, body) = translation_request_at(
        &deepseek_on,
        &batch,
        AiStructuredOutputCapability::JsonObject,
    )
    .unwrap();
    assert_eq!(body["thinking"]["type"], "enabled");
    assert_eq!(body["reasoning_effort"], "high");
    assert!(body.get("enable_thinking").is_none());

    // OpenAI-style chat completions with an explicit effort carries the dial.
    let mut openai = test_profile(AiProtocol::OpenaiChatCompletions);
    openai.enable_reasoning = true;
    openai.reasoning_effort = Some(ReasoningEffort::Xhigh);
    let (_, body) =
        translation_request_at(&openai, &batch, AiStructuredOutputCapability::JsonSchema).unwrap();
    assert_eq!(body["reasoning_effort"], "xhigh");
    assert!(body.get("thinking").is_none());
}

#[test]
fn list_models_parses_context_window_when_present() {
    let body = r#"{"data":[{"id":"gpt-4o","context_window":128000},{"id":"gpt-4o-mini","display_name":"GPT-4o mini"}]}"#;
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let response: &'static str = Box::leak(response.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "openai".into();
    profile.base_url = url;
    profile.credential_environment = Some("MODFORGE_TEST_MODELS_KEY".into());
    unsafe { std::env::set_var("MODFORGE_TEST_MODELS_KEY", "models-secret") };
    let models = list_models(&profile).unwrap();
    server.join().unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    unsafe { std::env::remove_var("MODFORGE_TEST_MODELS_KEY") };
    assert_eq!(models[0].id, "gpt-4o");
    assert_eq!(models[0].context_window_tokens, Some(128000));
    assert_eq!(models[1].id, "gpt-4o-mini");
    assert_eq!(models[1].display_name.as_deref(), Some("GPT-4o mini"));
    assert_eq!(models[1].context_window_tokens, None);
}

#[test]
fn sends_and_parses_all_three_protocol_adapters_end_to_end() {
    let result = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let cases = [
        (
            AiProtocol::OpenaiResponses,
            json!({"output_text":result.to_string()}).to_string(),
            "\"text\":{\"format\":{\"name\":\"translation_batch\"",
        ),
        (
            AiProtocol::OpenaiChatCompletions,
            json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string(),
            "\"response_format\":{\"type\":\"json_object\"}",
        ),
        (
            AiProtocol::AnthropicMessages,
            json!({"content":[{"type":"tool_use","input":result}]}).to_string(),
            "\"tool_choice\":{\"name\":\"return_translations\",\"type\":\"tool\"}",
        ),
    ];
    for (index, (protocol, response_body, expected_request_fragment)) in
        cases.into_iter().enumerate()
    {
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        let response: &'static str = Box::leak(response.into_boxed_str());
        let (base_url, requests, server) = spawn_http_server(vec![response]);
        let mut profile = test_profile(protocol);
        // Capability-table-driven forcing: the Responses case uses the openai
        // preset (json_schema via `text.format`) and the chat-completions case
        // uses deepseek (json_object via `response_format`).
        if protocol == AiProtocol::OpenaiResponses {
            profile.preset_id = "openai".into();
        } else if protocol == AiProtocol::OpenaiChatCompletions {
            profile.preset_id = "deepseek".into();
        }
        profile.credential_environment = Some("PATH".into());
        profile.base_url = base_url;
        let batch = request(vec![item(
            "a",
            "This is a source sentence for translation.",
        )]);
        let job = super::super::jobs::AiJobGuard::register(&format!("adapter-{index}")).unwrap();
        let (translated, reasoning) = translate(&profile, &batch, &job).unwrap();
        assert_eq!(translated[0].translated_text, "你好");
        assert!(reasoning.is_none());
        let wire_request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(wire_request.contains(expected_request_fragment));
        server.join().unwrap();
    }
}

#[test]
fn cancellation_during_an_active_request_discards_the_provider_result() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}", listener.local_addr().unwrap());
    let (started_tx, started_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut bytes = [0_u8; 8192];
        stream.read(&mut bytes).unwrap();
        started_tx.send(()).unwrap();
        release_rx.recv_timeout(Duration::from_secs(1)).unwrap();
        let body = json!({"choices":[{"message":{"content":json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]}).to_string()}}]}).to_string();
        write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).unwrap();
    });
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = base_url;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job_id = "active-cancellation";
    let job = super::super::jobs::AiJobGuard::register(job_id).unwrap();
    let worker = thread::spawn(move || translate(&profile, &batch, &job));
    started_rx.recv_timeout(Duration::from_secs(1)).unwrap();
    super::super::jobs::cancel_ai_job(job_id).unwrap();
    release_tx.send(()).unwrap();
    let error = worker.join().unwrap().unwrap_err();
    assert!(error.to_string().contains("cancelled"));
    server.join().unwrap();
}

#[test]
fn sse_accumulator_handles_done_half_lines_event_names_and_split_chunks() {
    let mut accumulator = SseLineAccumulator::new();
    // Chat-completions style anonymous events, including [DONE] and a half
    // line that arrives with the next chunk.
    let events = accumulator.push(
        b"data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"items\\\":\"}}]}\n\ndata: [DONE]\n\ndata: {\"cho",
    );
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event, None);
    assert!(events[0].data.contains("items"));
    assert_eq!(events[1].data, "[DONE]");
    let events = accumulator.push(b"ices\":[{\"id\":\"a\"}]}\n\n");
    assert_eq!(events.len(), 1);
    assert!(events[0].data.contains("\"id\":\"a\""));
    assert!(accumulator.push(b"").is_empty());
}

#[test]
fn sse_accumulator_preserves_event_names_and_joins_multi_data_lines() {
    let mut accumulator = SseLineAccumulator::new();
    let events = accumulator.push(
        b"event: response.output_text.delta\ndata: {\"delta\":\"hel\"}\ndata: {\"delta\":\"lo\"}\n\n",
    );
    assert_eq!(events.len(), 1);
    assert_eq!(
        events[0].event.as_deref(),
        Some("response.output_text.delta")
    );
    assert_eq!(events[0].data, "{\"delta\":\"hel\"}\n{\"delta\":\"lo\"}");
}

#[test]
fn sse_accumulator_never_splits_utf8_across_chunks() {
    let mut accumulator = SseLineAccumulator::new();
    // "你" is 3 UTF-8 bytes; the chunk boundary lands mid-sequence.
    let events = accumulator.push("data: {\"content\":\"你".as_bytes());
    assert!(events.is_empty());
    let events = accumulator.push("好\"}\n\n".as_bytes());
    assert_eq!(events.len(), 1);
    assert!(events[0].data.contains("你好"), "{}", events[0].data);
}

#[test]
fn extracts_stream_deltas_for_all_three_protocols() {
    let chat_content = extract_stream_delta(
        AiProtocol::OpenaiChatCompletions,
        None,
        r#"{"choices":[{"delta":{"content":"你好"}}]}"#,
    )
    .unwrap();
    assert_eq!(chat_content.kind, StreamDeltaKind::Content);
    assert_eq!(chat_content.text, "你好");

    let chat_reasoning = extract_stream_delta(
        AiProtocol::OpenaiChatCompletions,
        None,
        r#"{"choices":[{"delta":{"reasoning_content":"Step 1"}}]}"#,
    )
    .unwrap();
    assert_eq!(chat_reasoning.kind, StreamDeltaKind::Reasoning);
    assert_eq!(chat_reasoning.text, "Step 1");

    let responses_content = extract_stream_delta(
        AiProtocol::OpenaiResponses,
        Some("response.output_text.delta"),
        r#"{"delta":"partial"}"#,
    )
    .unwrap();
    assert_eq!(responses_content.kind, StreamDeltaKind::Content);

    let responses_reasoning = extract_stream_delta(
        AiProtocol::OpenaiResponses,
        Some("response.reasoning_summary_text.delta"),
        r#"{"delta":"summary"}"#,
    )
    .unwrap();
    assert_eq!(responses_reasoning.kind, StreamDeltaKind::Reasoning);

    let anthropic_text = extract_stream_delta(
        AiProtocol::AnthropicMessages,
        Some("content_block_delta"),
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}"#,
    )
    .unwrap();
    assert_eq!(anthropic_text.kind, StreamDeltaKind::Content);
    assert_eq!(anthropic_text.text, "hi");

    let anthropic_json = extract_stream_delta(
        AiProtocol::AnthropicMessages,
        Some("content_block_delta"),
        r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"items\":["}}"#,
    )
    .unwrap();
    assert_eq!(anthropic_json.text, "{\"items\":[");

    // [DONE] and unrelated named events produce no delta.
    assert!(extract_stream_delta(AiProtocol::OpenaiChatCompletions, None, "[DONE]").is_none());
    assert!(
        extract_stream_delta(
            AiProtocol::OpenaiResponses,
            Some("response.completed"),
            r#"{"response":{}}"#
        )
        .is_none()
    );
    assert!(
        extract_stream_delta(
            AiProtocol::AnthropicMessages,
            Some("message_start"),
            r#"{"message":{}}"#
        )
        .is_none()
    );
    assert!(
        extract_stream_delta(AiProtocol::OpenaiChatCompletions, None, ": keep-alive").is_none()
    );
}

fn sse_http_response(body: &str) -> String {
    format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    )
}

#[test]
fn streams_chat_completions_deltas_and_finalizes_through_validation() {
    let body = format!(
        "data: {}\n\ndata: {}\n\ndata: {}\n\ndata: {}\n\ndata: [DONE]\n\n",
        json!({"choices":[{"delta":{"reasoning_content":"Step 1: detect greeting"}}]}),
        json!({"choices":[{"delta":{"content":"{\"items\":["}}]}),
        json!({"choices":[{"delta":{"content":format!("{{\"id\":\"a\",\"translatedText\":\"你好\",\"detectedLanguage\":\"en\"}}")}}]}),
        json!({"choices":[{"delta":{"content":"]}"}}]}),
    );
    let response: &'static str = Box::leak(sse_http_response(&body).into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("streamed-chat-job").unwrap();
    let mut deltas: Vec<AiStreamDelta> = Vec::new();
    let (translated, reasoning) =
        translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |delta| {
            deltas.push(delta)
        })
        .unwrap();
    let wire_request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(wire_request.contains("\"stream\":true"), "{wire_request}");
    assert_eq!(translated[0].translated_text, "你好");
    assert_eq!(reasoning.as_deref(), Some("Step 1: detect greeting"));
    assert_eq!(deltas.len(), 4);
    assert_eq!(deltas[0].kind, StreamDeltaKind::Reasoning);
    assert_eq!(deltas[0].text, "Step 1: detect greeting");
    assert_eq!(deltas[1].text, "{\"items\":[");
    assert_eq!(deltas[3].text, "]}");
    assert_eq!(deltas[3].kind, StreamDeltaKind::Content);
}

#[test]
fn streams_responses_and_anthropic_deltas_end_to_end() {
    // OpenAI Responses: named events with reasoning summary deltas.
    let responses_encoded =
        json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]}).to_string();
    let responses_body = format!(
        "event: response.reasoning_summary_text.delta\ndata: {{\"delta\":\"summary\"}}\n\nevent: response.output_text.delta\ndata: {{\"delta\":\"{}\"}}\n\nevent: response.output_text.delta\ndata: {{\"delta\":\"\"}}\n\nevent: response.completed\ndata: {{\"response\":{{}}}}\n\n",
        responses_encoded.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let response: &'static str = Box::leak(sse_http_response(&responses_body).into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiResponses);
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("streamed-responses-job").unwrap();
    let mut deltas: Vec<AiStreamDelta> = Vec::new();
    let (translated, reasoning) =
        translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |delta| {
            deltas.push(delta)
        })
        .unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert_eq!(translated[0].translated_text, "你好");
    assert_eq!(reasoning.as_deref(), Some("summary"));
    assert_eq!(deltas.len(), 2);
    assert_eq!(deltas[0].kind, StreamDeltaKind::Reasoning);

    // Anthropic: content streams as text deltas (plain fallback shape).
    let anthropic_body = format!(
        "event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{{\"type\":\"text_delta\",\"text\":\"{}\"}}}}\n\nevent: message_stop\ndata: {{\"type\":\"message_stop\"}}\n\n",
        json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]})
            .to_string()
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
    );
    let response: &'static str = Box::leak(sse_http_response(&anthropic_body).into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::AnthropicMessages);
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("streamed-anthropic-job").unwrap();
    let (translated, reasoning) =
        translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |_| {}).unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert_eq!(translated[0].translated_text, "你好");
    assert!(reasoning.is_none());
}

#[test]
fn falls_back_to_non_streaming_when_the_endpoint_ignores_the_stream_flag() {
    let result = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let response: &'static str = Box::leak(response.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("stream-fallback-job").unwrap();
    let mut deltas: Vec<AiStreamDelta> = Vec::new();
    let (translated, reasoning) =
        translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |delta| {
            deltas.push(delta)
        })
        .unwrap();
    let wire_request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(wire_request.contains("\"stream\":true"), "{wire_request}");
    assert!(deltas.is_empty());
    assert_eq!(translated[0].translated_text, "你好");
    assert!(reasoning.is_none());
}

#[test]
fn retries_without_stream_when_the_endpoint_rejects_the_stream_flag() {
    let result = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let success = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let rejected_body = r#"{"error":{"message":"stream is not supported by this endpoint"}}"#;
    let rejected: &'static str = Box::leak(
        format!(
            "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            rejected_body.len(),
            rejected_body
        )
        .into_boxed_str(),
    );
    let success: &'static str = Box::leak(success.into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![rejected, success]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("stream-rejected-job").unwrap();
    let (translated, _) =
        translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |_| {}).unwrap();
    let first = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    let second = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(first.contains("\"stream\":true"), "{first}");
    assert!(!second.contains("\"stream\":true"), "{second}");
    assert_eq!(translated[0].translated_text, "你好");
}

#[test]
fn streamed_responses_that_changed_placeholders_still_fail_validation() {
    let body = format!(
        "data: {}\n\ndata: {}\n\ndata: {}\n\ndata: [DONE]\n\n",
        json!({"choices":[{"delta":{"content":"{\"items\":["}}]}),
        json!({"choices":[{"delta":{"content":"{\"id\":\"a\",\"translatedText\":\"你好 {{user}} $0\",\"detectedLanguage\":\"en\"}"}}]}),
        json!({"choices":[{"delta":{"content":"]}"}}]}),
    );
    let response: &'static str = Box::leak(sse_http_response(&body).into_boxed_str());
    let (url, requests, server) = spawn_http_server(vec![response]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    profile.stream_translation = true;
    let batch = request(vec![item("a", "Hello {{name}} $0")]);
    let job = AiJobGuard::register("stream-validate-job").unwrap();
    let error = translate_observed(&profile, &batch, &job, &mut |_| {}, &mut |_| {}).unwrap_err();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(
        error.to_string().contains("changed placeholders"),
        "{error}"
    );
}

// ---------------------------------------------------------------------------
// Structured-output capability table, serialization and 400 degradation chain
// ---------------------------------------------------------------------------

#[test]
fn capability_cache_resolves_declared_then_remembered_levels() {
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "openrouter".into();
    profile.base_url = "http://127.0.0.1:9001/v1".into();
    assert_eq!(
        resolved_structured_output(&profile),
        AiStructuredOutputCapability::JsonSchema
    );
    // A previously cached degradation for the same (base URL, preset) wins.
    remember_structured_output(&profile, AiStructuredOutputCapability::JsonObject);
    assert_eq!(
        resolved_structured_output(&profile),
        AiStructuredOutputCapability::JsonObject
    );
    // A different preset on the same base URL keeps its own declared level.
    let mut other = test_profile(AiProtocol::OpenaiChatCompletions);
    other.preset_id = "deepseek".into();
    other.base_url = "http://127.0.0.1:9001/v1".into();
    assert_eq!(
        resolved_structured_output(&other),
        AiStructuredOutputCapability::JsonObject
    );
    // The trailing slash is normalized in the cache key.
    let mut slashed = test_profile(AiProtocol::OpenaiChatCompletions);
    slashed.preset_id = "openrouter".into();
    slashed.base_url = "http://127.0.0.1:9001/v1/".into();
    assert_eq!(
        resolved_structured_output(&slashed),
        AiStructuredOutputCapability::JsonObject
    );
}

#[test]
fn next_degraded_steps_down_per_protocol() {
    let chat = test_profile(AiProtocol::OpenaiChatCompletions);
    let responses = test_profile(AiProtocol::OpenaiResponses);
    assert_eq!(
        next_degraded(&chat, AiStructuredOutputCapability::JsonSchema),
        Some(AiStructuredOutputCapability::JsonObject)
    );
    assert_eq!(
        next_degraded(&chat, AiStructuredOutputCapability::JsonObject),
        Some(AiStructuredOutputCapability::None)
    );
    assert_eq!(
        next_degraded(&chat, AiStructuredOutputCapability::None),
        None
    );
    // The Responses API has no json_object wire form: json_schema skips to none.
    assert_eq!(
        next_degraded(&responses, AiStructuredOutputCapability::JsonSchema),
        Some(AiStructuredOutputCapability::None)
    );
    // tool-use forcing never degrades: a 400 there is a real request error.
    assert_eq!(
        next_degraded(&chat, AiStructuredOutputCapability::ToolUse),
        None
    );
}

#[test]
fn responses_protocol_omits_text_format_when_capability_is_none() {
    let batch = request(vec![item("a", "Hello")]);
    let mut profile = test_profile(AiProtocol::OpenaiResponses);
    profile.preset_id = "custom".into();
    profile.credential_environment = Some("PATH".into());
    let (_, body) =
        translation_request_at(&profile, &batch, AiStructuredOutputCapability::None).unwrap();
    assert!(body.get("text").is_none(), "{body}");
    let (_, body) =
        translation_request_at(&profile, &batch, AiStructuredOutputCapability::JsonSchema).unwrap();
    assert_eq!(body["text"]["format"]["type"], "json_schema");
}

fn http_response(status: &str, body: &str) -> &'static str {
    Box::leak(
        format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .into_boxed_str(),
    )
}

#[test]
fn degrades_json_schema_to_json_object_on_400_and_remembers_the_level() {
    let result = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let success_body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let rejected_body =
        r#"{"error":{"message":"response_format is not supported by this endpoint"}}"#;
    let (url, requests, server) = spawn_http_server(vec![
        http_response("400 Bad Request", rejected_body),
        http_response("200 OK", &success_body),
    ]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    // openrouter declares json_schema; the mock endpoint rejects it with a 400.
    profile.preset_id = "openrouter".into();
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url.clone();
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("degrade-json-schema").unwrap();
    let (translated, _) = translate(&profile, &batch, &job).unwrap();
    let first = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    let second = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(first.contains("\"type\":\"json_schema\""), "{first}");
    assert!(second.contains("\"type\":\"json_object\""), "{second}");
    assert_eq!(translated[0].translated_text, "你好");
    // The degraded level is cached for the (base URL, preset) pair.
    assert_eq!(
        resolved_structured_output(&profile),
        AiStructuredOutputCapability::JsonObject
    );
}

#[test]
fn degrades_json_object_to_none_on_400_and_skips_the_parameter() {
    let result = json!({"items":[{"id":"a","translatedText":"你好","detectedLanguage":"en"}]});
    let success_body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let rejected_body =
        r#"{"error":{"message":"response_format type json_object is not supported"}}"#;
    let (url, requests, server) = spawn_http_server(vec![
        http_response("400 Bad Request", rejected_body),
        http_response("200 OK", &success_body),
    ]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "deepseek".into();
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url.clone();
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("degrade-json-object").unwrap();
    let (translated, _) = translate(&profile, &batch, &job).unwrap();
    let first = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    let second = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(first.contains("\"type\":\"json_object\""), "{first}");
    assert!(!second.contains("response_format"), "{second}");
    assert_eq!(translated[0].translated_text, "你好");
    assert_eq!(
        resolved_structured_output(&profile),
        AiStructuredOutputCapability::None
    );
}

#[test]
fn does_not_degrade_on_non_400_rejections() {
    let rejected_body = r#"{"error":{"message":"invalid api key"}}"#;
    let (url, requests, server) =
        spawn_http_server(vec![http_response("401 Unauthorized", rejected_body)]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "openrouter".into();
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url.clone();
    let batch = request(vec![item(
        "a",
        "This is a source sentence for translation.",
    )]);
    let job = AiJobGuard::register("no-degrade").unwrap();
    let error = translate(&profile, &batch, &job).unwrap_err();
    let wire = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(wire.contains("\"type\":\"json_schema\""), "{wire}");
    assert!(error.to_string().contains("401 Unauthorized"), "{error}");
    // The declared capability is untouched by a non-400 rejection.
    assert_eq!(
        resolved_structured_output(&profile),
        AiStructuredOutputCapability::JsonSchema
    );
}

// ---------------------------------------------------------------------------
// Placeholder sentinels
// ---------------------------------------------------------------------------

#[test]
fn sentinelize_batch_replaces_placeholders_in_order_and_skips_collisions() {
    let batch = sentinelize_batch(&[
        item("a", "Hello {{name}}, pay $0 and %1$s!"),
        item("b", "Plain text"),
        item("c", "Literal ⟦0⟧ stays untouched"),
    ]);
    assert_eq!(batch.items[0].text, "Hello ⟦0⟧, pay ⟦1⟧ and ⟦2⟧!");
    assert_eq!(batch.items[1].text, "Plain text");
    assert_eq!(batch.items[2].text, "Literal ⟦0⟧ stays untouched");
    assert_eq!(batch.tokens_by_id["a"], vec!["{{name}}", "$0", "%1$s"]);
    assert!(!batch.tokens_by_id.contains_key("b"));
    assert!(!batch.tokens_by_id.contains_key("c"));
}

#[test]
fn restore_sentinel_item_round_trips_and_enforces_counts() {
    let tokens = vec!["{{name}}".to_string(), "$0".to_string()];
    let restored = restore_sentinel_item("你好 ⟦0⟧，共 ⟦1⟧ 个", &tokens, "a").unwrap();
    assert_eq!(restored, "你好 {{name}}，共 $0 个");

    // A dropped sentinel fails the count check.
    let error = restore_sentinel_item("你好 ⟦0⟧", &tokens, "a")
        .unwrap_err()
        .to_string();
    assert!(error.contains("changed placeholders"), "{error}");
    // An out-of-range index fails the mapping even when the count matches.
    let error = restore_sentinel_item("你好 ⟦0⟧⟦7⟧", &tokens, "a")
        .unwrap_err()
        .to_string();
    assert!(error.contains("changed placeholders"), "{error}");
    assert!(error.contains("unknown token"), "{error}");
    // Leftover sentinel characters (provider-invented) fail the scan.
    let error = restore_sentinel_item("你好 ⟦0⟧⟦1⟧ ⟦x⟧", &tokens, "a")
        .unwrap_err()
        .to_string();
    assert!(error.contains("leftover sentinel"), "{error}");
}

#[test]
fn sentinel_round_trip_preserves_placeholders_through_the_full_path() {
    let result = json!({"items":[{"id":"a","translatedText":"你好 ⟦0⟧，共 ⟦1⟧ 个","detectedLanguage":"en"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let (url, requests, server) = spawn_http_server(vec![http_response("200 OK", &body)]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    let batch = request(vec![item("a", "Hello {{name}}, pay $0!")]);
    let job = AiJobGuard::register("sentinel-round-trip").unwrap();
    let (translated, _) = translate(&profile, &batch, &job).unwrap();
    let wire = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    // The wire request carries the sentinelized item text...
    assert!(wire.contains("Hello ⟦0⟧, pay ⟦1⟧!"), "{wire}");
    // ...and the committed result restores the original placeholders.
    assert_eq!(translated[0].translated_text, "你好 {{name}}，共 $0 个");
}

#[test]
fn model_rewritten_sentinel_fails_with_placeholder_mismatch() {
    // The model drops the second sentinel; the multiset check is a no-op on
    // sentinel text (the placeholder regex never matches `⟦N⟧`), so the
    // restore count-check is what rejects the response.
    let result = json!({"items":[{"id":"a","translatedText":"你好 ⟦0⟧","detectedLanguage":"en"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let (url, requests, server) = spawn_http_server(vec![http_response("200 OK", &body)]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    let batch = request(vec![item("a", "Hello {{name}}, pay $0!")]);
    let job = AiJobGuard::register("sentinel-rewritten").unwrap();
    let error = translate(&profile, &batch, &job).unwrap_err();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(
        error.to_string().contains("changed placeholders"),
        "{error}"
    );
}

#[test]
fn sentinel_restore_count_check_enforces_even_when_validation_is_skipped() {
    // The launcher path (skip_format_validation = true) skips the multiset
    // comparison; the sentinel restore count-check still catches a dropped
    // placeholder so the frontend degradation path can keep the item original.
    let mut batch = request(vec![item("a", "Hello {{name}} $0")]);
    batch.skip_format_validation = true;
    let result = json!({"items":[{"id":"a","translatedText":"你好 ⟦0⟧","detectedLanguage":"en"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let (url, requests, server) = spawn_http_server(vec![http_response("200 OK", &body)]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "ollama".into();
    profile.base_url = url;
    let job = AiJobGuard::register("sentinel-skip-validation").unwrap();
    let error = translate(&profile, &batch, &job).unwrap_err();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert!(
        error.to_string().contains("changed placeholders"),
        "{error}"
    );
}

#[test]
fn sentinel_restore_coexists_with_the_text_alias_fallback() {
    // deepseek-v4-flash echoes the request item (sentinels included) and writes
    // the translation into `text`; the restore pass must apply to the alias
    // just like the canonical `translatedText` field.
    let result =
        json!({"items":[{"id":"a","format":"plainText","context":null,"text":"这是⟦0⟧的译文"}]});
    let body = json!({"choices":[{"message":{"content":result.to_string()}}]}).to_string();
    let (url, requests, server) = spawn_http_server(vec![http_response("200 OK", &body)]);
    let mut profile = test_profile(AiProtocol::OpenaiChatCompletions);
    profile.preset_id = "deepseek".into();
    profile.credential_environment = Some("PATH".into());
    profile.base_url = url;
    let batch = request(vec![item("a", "Translation for {{name}}.")]);
    let job = AiJobGuard::register("sentinel-text-alias").unwrap();
    let (translated, _) = translate(&profile, &batch, &job).unwrap();
    requests.recv_timeout(Duration::from_secs(1)).unwrap();
    server.join().unwrap();
    assert_eq!(translated[0].translated_text, "这是{{name}}的译文");
    assert_eq!(translated[0].detected_language, None);
}
