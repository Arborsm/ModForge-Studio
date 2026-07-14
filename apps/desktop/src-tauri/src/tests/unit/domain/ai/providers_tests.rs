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
        parse_translation_value(responses, AiProtocol::OpenaiResponses).unwrap()["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(chat, AiProtocol::OpenaiChatCompletions).unwrap()["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(anthropic, AiProtocol::AnthropicMessages).unwrap()["items"][0]["id"],
        "a"
    );
    assert_eq!(
        parse_translation_value(anthropic_text, AiProtocol::AnthropicMessages).unwrap()["items"][0]
            ["id"],
        "a"
    );
}

#[test]
fn rejects_extra_ids_and_changed_placeholders() {
    let source = request(vec![item("a", "Hello {{name}} $0")]);
    let extra = json!({"items":[
        {"id":"a","translatedText":"你好 {{name}} $0","detectedLanguage":"en"},
        {"id":"extra","translatedText":"x","detectedLanguage":"en"}
    ]});
    assert!(
        validate_translation_items(&source, extra)
            .unwrap_err()
            .to_string()
            .contains("exactly match")
    );

    let changed =
        json!({"items":[{"id":"a","translatedText":"你好 {{user}} $0","detectedLanguage":"en"}]});
    assert!(
        validate_translation_items(&source, changed)
            .unwrap_err()
            .to_string()
            .contains("changed placeholders")
    );
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
    let oversized = request(vec![item("large", &"a".repeat(8 * 1024 + 1))]);
    assert!(
        validate_request(&oversized)
            .unwrap_err()
            .to_string()
            .contains("8 KB")
    );
    let oversized_context = request(vec![AiTranslationItem {
        context: Some("x".repeat(MAX_REQUEST_BYTES)),
        ..item("context", "small")
    }]);
    assert!(
        validate_request(&oversized_context)
            .unwrap_err()
            .to_string()
            .contains("64 KB")
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
    let mut gemini = test_profile(AiProtocol::OpenaiChatCompletions);
    gemini.preset_id = "gemini".into();
    assert_eq!(
        chat_response_format(&gemini, &translation_schema()).unwrap()["type"],
        "json_schema"
    );

    let custom = test_profile(AiProtocol::OpenaiChatCompletions);
    assert!(chat_response_format(&custom, &translation_schema()).is_none());
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
        if protocol == AiProtocol::OpenaiChatCompletions {
            profile.preset_id = "ollama".into();
        } else {
            profile.credential_environment = Some("PATH".into());
        }
        profile.base_url = base_url;
        let batch = request(vec![item(
            "a",
            "This is a source sentence for translation.",
        )]);
        let job = super::super::jobs::AiJobGuard::register(&format!("adapter-{index}")).unwrap();
        let translated = translate(&profile, &batch, &job).unwrap();
        assert_eq!(translated[0].translated_text, "你好");
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
