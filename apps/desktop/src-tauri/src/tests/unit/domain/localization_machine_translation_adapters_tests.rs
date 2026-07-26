use super::*;
use std::net::TcpListener;
use std::sync::mpsc;

fn server(body: &'static str, extra_headers: &'static str) -> (String, mpsc::Receiver<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut bytes = Vec::new();
        let mut buffer = [0u8; 4096];
        loop {
            let count = std::io::Read::read(&mut stream, &mut buffer).unwrap();
            if count == 0 {
                break;
            }
            bytes.extend_from_slice(&buffer[..count]);
            if let Some(header_end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..header_end]);
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|value| value.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if bytes.len() >= header_end + 4 + length {
                    break;
                }
            }
        }
        tx.send(String::from_utf8_lossy(&bytes).into_owned())
            .unwrap();
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n{}",
            body.len(),
            extra_headers,
            body
        );
        std::io::Write::write_all(&mut stream, response.as_bytes()).unwrap();
    });
    (format!("http://{address}"), rx)
}

fn profile(protocol: MachineTranslationProtocol, base_url: String) -> MachineTranslationProfile {
    MachineTranslationProfile {
        id: "test".into(),
        name: "test".into(),
        preset_id: "test".into(),
        protocol,
        base_url,
        region: Some("ap-guangzhou".into()),
        enabled: true,
        default_source_locale: None,
        default_target_locale: None,
        credential_environments: BTreeMap::new(),
        credential_sources: BTreeMap::new(),
    }
}
fn execute(
    protocol: MachineTranslationProtocol,
    response: &'static str,
    credentials: BTreeMap<String, String>,
) -> (
    Vec<(String, Option<String>)>,
    String,
    Vec<MachineTranslationAttempt>,
) {
    let (base, rx) = server(
        response,
        if protocol == MachineTranslationProtocol::MicrosoftV3 {
            "X-Metered-Usage: 5\r\n"
        } else {
            ""
        },
    );
    let mut attempts = Vec::new();
    let result = translate_wire(
        &profile(protocol, base),
        &credentials,
        "en-US",
        "zh-CN",
        &["Hello".into()],
        "mt-wire-test",
        &mut |attempt| attempts.push(attempt),
    )
    .unwrap();
    jobs::clear("mt-wire-test");
    (result, rx.recv().unwrap(), attempts)
}

#[test]
fn deepl_uses_auth_header_and_parses_billed_characters() {
    let (result, request, attempts) = execute(
        MachineTranslationProtocol::Deepl,
        r#"{"translations":[{"text":"你好","detected_source_language":"EN"}],"billed_characters":5}"#,
        BTreeMap::from([("api-key".into(), "deep-key".into())]),
    );
    assert_eq!(result[0].0, "你好");
    assert!(request.starts_with("POST /v2/translate"));
    assert!(request.contains("DeepL-Auth-Key deep-key"));
    assert_eq!(attempts[0].billed_characters, Some(5));
}

#[test]
fn google_basic_v2_uses_key_query_and_json_batch() {
    let (result, request, _) = execute(
        MachineTranslationProtocol::GoogleBasicV2,
        r#"{"data":{"translations":[{"translatedText":"你好 &amp; 再见","detectedSourceLanguage":"en"}]}}"#,
        BTreeMap::from([("api-key".into(), "google-key".into())]),
    );
    assert_eq!(result[0].0, "你好 & 再见");
    assert!(request.starts_with("POST /language/translate/v2?key=google-key"));
    assert!(request.contains("\"q\":[\"Hello\"]"));
}

#[test]
fn microsoft_uses_subscription_headers_and_metered_usage() {
    let (result, request, attempts) = execute(
        MachineTranslationProtocol::MicrosoftV3,
        r#"[{"detectedLanguage":{"language":"en"},"translations":[{"text":"你好","to":"zh-Hans"}]}]"#,
        BTreeMap::from([("api-key".into(), "ms-key".into())]),
    );
    assert_eq!(result[0].0, "你好");
    let request = request.to_ascii_lowercase();
    assert!(request.contains("ocp-apim-subscription-key: ms-key"));
    assert!(request.contains("ocp-apim-subscription-region: ap-guangzhou"));
    assert_eq!(attempts[0].billed_characters, Some(5));
}

#[test]
fn baidu_signs_form_without_sending_secret() {
    let (result, request, _) = execute(
        MachineTranslationProtocol::BaiduGeneral,
        r#"{"from":"en","to":"zh","trans_result":[{"src":"Hello","dst":"你好"}]}"#,
        BTreeMap::from([
            ("app-id".into(), "app".into()),
            ("secret".into(), "secret-value".into()),
        ]),
    );
    assert_eq!(result[0].0, "你好");
    assert!(request.starts_with("POST /api/trans/vip/translate"));
    assert!(request.contains("appid=app"));
    assert!(request.contains("sign="));
    assert!(!request.contains("secret-value"));
}

#[test]
fn tencent_emits_tc3_signature_and_batch_action() {
    let (result, request, _) = execute(
        MachineTranslationProtocol::TencentTmt,
        r#"{"Response":{"TargetTextList":["你好"],"RequestId":"id"}}"#,
        BTreeMap::from([
            ("secret-id".into(), "id".into()),
            ("secret-key".into(), "key".into()),
        ]),
    );
    assert_eq!(result[0].0, "你好");
    assert!(request.contains("TC3-HMAC-SHA256 Credential=id/"));
    assert!(
        request
            .to_ascii_lowercase()
            .contains("x-tc-action: batchtranslate")
    );
    assert!(!request.contains("\r\nkey\r\n"));
}

#[test]
fn libretranslate_sends_optional_key_in_json_body() {
    let (result, request, _) = execute(
        MachineTranslationProtocol::LibreTranslate,
        r#"{"translatedText":["你好"]}"#,
        BTreeMap::from([("api-key".into(), "libre-key".into())]),
    );
    assert_eq!(result[0].0, "你好");
    assert!(request.starts_with("POST /translate"));
    assert!(request.contains("\"api_key\":\"libre-key\""));
}

#[test]
fn common_transport_retries_429_and_server_errors_as_separate_attempts() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        for (index, status) in [
            "500 Internal Server Error",
            "429 Too Many Requests",
            "200 OK",
        ]
        .into_iter()
        .enumerate()
        {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0u8; 4096];
            let _ = std::io::Read::read(&mut stream, &mut buffer);
            let body = if index == 2 {
                "{\"ok\":true}"
            } else {
                "{\"error\":{\"message\":\"retry\"}}"
            };
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nRetry-After: 0\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            std::io::Write::write_all(&mut stream, response.as_bytes()).unwrap();
        }
    });
    let client = client().unwrap();
    let mut attempts = Vec::new();
    let value = send(
        "mt-retry-test",
        || {
            Ok(client
                .post(format!("http://{address}/translate"))
                .json(&json!({"q":"Hello"})))
        },
        &mut |attempt| attempts.push(attempt),
    )
    .unwrap();
    jobs::clear("mt-retry-test");
    assert_eq!(value.value["ok"], true);
    assert_eq!(
        attempts
            .iter()
            .map(|attempt| attempt.attempt)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    assert_eq!(
        attempts.iter().filter(|attempt| !attempt.succeeded).count(),
        2
    );
}

#[test]
fn versioned_baidu_and_tencent_language_maps_cover_stardew_locales() {
    let baidu = static_languages(MachineTranslationProtocol::BaiduGeneral);
    assert!(
        baidu
            .iter()
            .any(|language| language.code == "cht" && language.supports_target)
    );
    let tencent = static_languages(MachineTranslationProtocol::TencentTmt);
    assert!(
        tencent
            .iter()
            .any(|language| language.code == "zh-TW" && language.supports_target)
    );
    assert!(
        !tencent
            .iter()
            .find(|language| language.code == "auto")
            .unwrap()
            .supports_target
    );
}

#[test]
fn dynamic_language_responses_are_parsed_for_all_remote_catalogs() {
    let cases = [
        (
            MachineTranslationProtocol::Deepl,
            json!([{"language":"ZH","name":"Chinese"}]),
            "ZH",
        ),
        (
            MachineTranslationProtocol::GoogleBasicV2,
            json!({"data":{"languages":[{"language":"zh-CN","name":"Chinese"}]}}),
            "zh-CN",
        ),
        (
            MachineTranslationProtocol::MicrosoftV3,
            json!({"translation":{"zh-Hans":{"name":"Chinese Simplified"}}}),
            "zh-Hans",
        ),
        (
            MachineTranslationProtocol::LibreTranslate,
            json!([{"code":"zh","name":"Chinese"}]),
            "zh",
        ),
    ];
    for (protocol, response, expected) in cases {
        let languages = parse_languages(protocol, &response).unwrap();
        assert_eq!(languages.len(), 1);
        assert_eq!(languages[0].code, expected);
        assert!(languages[0].supports_source && languages[0].supports_target);
    }
}

#[test]
fn character_limits_reject_oversized_items_and_batches() {
    let capability = MachineTranslationCapability {
        languages_dynamic: false,
        max_item_characters: 5,
        max_batch_characters: 8,
        supports_html: false,
        supports_glossary: false,
        usage_capability: "local-measured".into(),
        authentication: "none".into(),
    };
    let item = |id: &str, text: &str| MachineTranslationItem {
        id: id.into(),
        text: text.into(),
        format: crate::domain::ai::types::AiTranslationFormat::PlainText,
    };
    assert!(validate_limits(&[item("a", "12345")], &capability).is_ok());
    assert!(validate_limits(&[item("a", "123456")], &capability).is_err());
    assert!(validate_limits(&[item("a", "12345"), item("b", "6789")], &capability).is_err());
}

#[test]
fn provider_result_count_must_match_request_count() {
    let (base, request) = server(
        r#"{"translations":[{"text":"one","detected_source_language":"EN"}]}"#,
        "",
    );
    let error = translate_wire(
        &profile(MachineTranslationProtocol::Deepl, base),
        &BTreeMap::from([("api-key".into(), "key".into())]),
        "en-US",
        "zh-CN",
        &["one".into(), "two".into()],
        "mt-result-count",
        &mut |_| {},
    )
    .unwrap_err();
    let _ = request.recv().unwrap();
    jobs::clear("mt-result-count");
    assert!(error.to_string().contains("returned 1 results for 2 items"));
}

#[test]
fn request_timeout_is_enforced() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    std::thread::spawn(move || {
        let (_stream, _) = listener.accept().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));
    });
    let client = client_with_timeouts(
        std::time::Duration::from_millis(20),
        std::time::Duration::from_millis(20),
    )
    .unwrap();
    let mut attempts = Vec::new();
    let error = send(
        "mt-timeout",
        || Ok(client.get(format!("http://{address}/languages"))),
        &mut |attempt| attempts.push(attempt),
    )
    .unwrap_err();
    jobs::clear("mt-timeout");
    assert!(error.to_string().contains("could not be sent"));
    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].failure_category.as_deref(), Some("network"));
}
