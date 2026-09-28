use super::*;

#[test]
fn accepts_https_and_loopback_http_only() {
    assert_eq!(
        validate_base_url("https://api.example.com/v1/", false).unwrap(),
        "https://api.example.com/v1"
    );
    assert!(validate_base_url("http://127.0.0.1:11434/v1", false).is_ok());
    assert!(validate_base_url("http://localhost:1234/v1", false).is_ok());
    assert!(validate_base_url("http://example.com/v1", false).is_err());
}

#[test]
fn allows_public_http_only_when_insecure_http_is_enabled() {
    assert!(validate_base_url("http://example.com/v1", false).is_err());
    assert_eq!(
        validate_base_url("http://example.com:8080/v1/", true).unwrap(),
        "http://example.com:8080/v1"
    );
    assert!(validate_base_url("https://example.com/v1", true).is_ok());
    assert!(validate_base_url("http://127.0.0.1:11434/v1", true).is_ok());
    assert!(validate_base_url("ftp://example.com/v1", true).is_err());
    assert!(validate_base_url("not a url", true).is_err());
}

#[test]
fn stored_profiles_default_to_disallowing_insecure_http() {
    let profile: StoredAiProfile = serde_json::from_str(
        r#"{"id":"p","name":"P","presetId":"custom","protocol":"openai-chat-completions","baseUrl":"https://example.com/v1","model":"m","credentialEnvironment":null}"#,
    )
    .unwrap();
    assert!(!profile.allow_insecure_http);
    let saved: SaveAiProviderProfile = serde_json::from_str(
        r#"{"id":"p","name":"P","presetId":"custom","protocol":"openai-chat-completions","baseUrl":"https://example.com/v1","model":"m","credentialEnvironment":null}"#,
    )
    .unwrap();
    assert!(!saved.allow_insecure_http);
}

#[test]
fn legacy_profiles_default_all_new_optional_fields_to_none() {
    let profile: StoredAiProfile = serde_json::from_str(
        r#"{"id":"p","name":"P","presetId":"custom","protocol":"openai-chat-completions","baseUrl":"https://example.com/v1","model":"m","credentialEnvironment":null}"#,
    )
    .unwrap();
    assert_eq!(profile.context_window_tokens, None);
    assert_eq!(profile.max_output_tokens, None);
    assert_eq!(profile.temperature, None);
    assert_eq!(profile.top_p, None);
    assert_eq!(profile.frequency_penalty, None);
    assert_eq!(profile.presence_penalty, None);
    assert_eq!(profile.max_batch_bytes, None);
    assert!(!profile.enable_reasoning);
    assert_eq!(profile.reasoning_effort, None);
    assert!(!profile.stream_translation);
    let saved: SaveAiProviderProfile = serde_json::from_str(
        r#"{"id":"p","name":"P","presetId":"custom","protocol":"openai-chat-completions","baseUrl":"https://example.com/v1","model":"m","credentialEnvironment":null}"#,
    )
    .unwrap();
    assert_eq!(saved.context_window_tokens, None);
    assert_eq!(saved.temperature, None);
    assert_eq!(saved.max_batch_bytes, None);
    assert!(!saved.enable_reasoning);
    assert_eq!(saved.reasoning_effort, None);
    assert!(!saved.stream_translation);
}

#[test]
fn reasoning_effort_round_trips_through_normalize() {
    let profile = SaveAiProviderProfile {
        id: "profile".into(),
        name: "Profile".into(),
        preset_id: "custom".into(),
        protocol: super::super::types::AiProtocol::OpenaiChatCompletions,
        base_url: "https://example.com/v1".into(),
        model: "model".into(),
        credential_environment: None,
        allow_insecure_http: false,
        context_window_tokens: None,
        max_output_tokens: None,
        temperature: None,
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        max_batch_bytes: Some(128 * 1024),
        enable_reasoning: true,
        reasoning_effort: Some(super::super::types::ReasoningEffort::High),
        stream_translation: true,
        api_key: None,
        clear_api_key: false,
    };
    let stored = normalize(&profile).unwrap();
    assert_eq!(stored.max_batch_bytes, Some(128 * 1024));
    assert!(stored.enable_reasoning);
    assert_eq!(
        stored.reasoning_effort,
        Some(super::super::types::ReasoningEffort::High)
    );
    assert!(stored.stream_translation);
}

#[test]
fn generation_parameters_round_trip_through_normalize() {
    let profile = SaveAiProviderProfile {
        id: "profile".into(),
        name: "Profile".into(),
        preset_id: "custom".into(),
        protocol: super::super::types::AiProtocol::OpenaiChatCompletions,
        base_url: "https://example.com/v1".into(),
        model: "model".into(),
        credential_environment: None,
        allow_insecure_http: false,
        context_window_tokens: Some(128_000),
        max_output_tokens: Some(4_096),
        temperature: Some(0.7),
        top_p: Some(0.9),
        frequency_penalty: Some(0.2),
        presence_penalty: Some(-0.5),
        max_batch_bytes: Some(96 * 1024),
        enable_reasoning: true,
        reasoning_effort: Some(super::super::types::ReasoningEffort::Medium),
        stream_translation: true,
        api_key: None,
        clear_api_key: false,
    };
    let stored = normalize(&profile).unwrap();
    assert_eq!(stored.context_window_tokens, Some(128_000));
    assert_eq!(stored.max_output_tokens, Some(4_096));
    assert_eq!(stored.temperature, Some(0.7));
    assert_eq!(stored.top_p, Some(0.9));
    assert_eq!(stored.frequency_penalty, Some(0.2));
    assert_eq!(stored.presence_penalty, Some(-0.5));
    assert_eq!(stored.max_batch_bytes, Some(96 * 1024));
    assert!(stored.enable_reasoning);
    assert_eq!(
        stored.reasoning_effort,
        Some(super::super::types::ReasoningEffort::Medium)
    );
    assert!(stored.stream_translation);
}

#[test]
fn rejects_out_of_range_generation_parameters() {
    let base = SaveAiProviderProfile {
        id: "profile".into(),
        name: "Profile".into(),
        preset_id: "custom".into(),
        protocol: super::super::types::AiProtocol::OpenaiChatCompletions,
        base_url: "https://example.com/v1".into(),
        model: "model".into(),
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
        api_key: None,
        clear_api_key: false,
    };
    for (field, value) in [
        (
            "context window",
            super::super::types::SaveAiProviderProfile {
                context_window_tokens: Some(0),
                ..base.clone()
            },
        ),
        (
            "context window",
            super::super::types::SaveAiProviderProfile {
                context_window_tokens: Some(MAX_CONTEXT_WINDOW_TOKENS + 1),
                ..base.clone()
            },
        ),
        (
            "max output tokens",
            super::super::types::SaveAiProviderProfile {
                max_output_tokens: Some(0),
                ..base.clone()
            },
        ),
        (
            "temperature",
            super::super::types::SaveAiProviderProfile {
                temperature: Some(2.5),
                ..base.clone()
            },
        ),
        (
            "temperature",
            super::super::types::SaveAiProviderProfile {
                temperature: Some(f64::NAN),
                ..base.clone()
            },
        ),
        (
            "top_p",
            super::super::types::SaveAiProviderProfile {
                top_p: Some(1.5),
                ..base.clone()
            },
        ),
        (
            "frequency_penalty",
            super::super::types::SaveAiProviderProfile {
                frequency_penalty: Some(-2.5),
                ..base.clone()
            },
        ),
        (
            "presence_penalty",
            super::super::types::SaveAiProviderProfile {
                presence_penalty: Some(3.0),
                ..base.clone()
            },
        ),
        (
            "max batch bytes",
            super::super::types::SaveAiProviderProfile {
                max_batch_bytes: Some(0),
                ..base.clone()
            },
        ),
        (
            "max batch bytes",
            super::super::types::SaveAiProviderProfile {
                max_batch_bytes: Some(MAX_BATCH_BYTES + 1),
                ..base.clone()
            },
        ),
    ] {
        let error = normalize(&value).unwrap_err().to_string();
        assert!(
            error.contains(field),
            "expected {field} in validation error, got {error}"
        );
    }
}

#[test]
fn rejects_embedded_credentials_query_and_fragments() {
    for value in [
        "https://user:secret@example.com/v1",
        "https://example.com/v1?key=secret",
        "https://example.com/v1#fragment",
    ] {
        assert!(
            validate_base_url(value, false).is_err(),
            "accepted unsafe URL {value}"
        );
        assert!(
            validate_base_url(value, true).is_err(),
            "accepted unsafe URL {value} with insecure HTTP allowed"
        );
    }
}

#[test]
fn falls_back_to_the_configured_environment_variable_without_exposing_it() {
    let profile = AiProviderProfile {
        id: format!("missing-keyring-entry-{}", std::process::id()),
        name: "Test".into(),
        preset_id: "custom".into(),
        protocol: super::super::types::AiProtocol::OpenaiChatCompletions,
        base_url: "https://example.com/v1".into(),
        model: "test".into(),
        credential_environment: Some("PATH".into()),
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
        key_configured: false,
        resolved_credential_source: None,
    };
    assert_eq!(
        resolve_profile_credential(&profile).unwrap(),
        std::env::var("PATH").ok()
    );
}

#[test]
fn replaces_existing_versioned_settings_and_rejects_unknown_versions() {
    let root = std::env::temp_dir().join(format!(
        "modforge-ai-settings-test-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).unwrap();
    let path = root.join("ai-settings.json");
    let mut settings = StoredAiSettings::default();
    write_stored(&path, &settings).unwrap();
    settings.default_profile_id = Some("second-save".into());
    write_stored(&path, &settings).unwrap();
    assert_eq!(
        load_stored(&path).unwrap().default_profile_id.as_deref(),
        Some("second-save")
    );

    fs::write(
        &path,
        r#"{"version":999,"defaultProfileId":null,"profiles":[]}"#,
    )
    .unwrap();
    assert!(
        load_stored(&path)
            .unwrap_err()
            .to_string()
            .contains("version 999")
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn recovers_the_last_complete_settings_after_an_interrupted_replace() {
    let root = std::env::temp_dir().join(format!(
        "modforge-ai-settings-recovery-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).unwrap();
    let path = root.join("ai-settings.json");
    let mut settings = StoredAiSettings::default();
    settings.default_profile_id = Some("preserved".into());
    write_stored(&path, &settings).unwrap();
    fs::rename(&path, path.with_extension("json.bak")).unwrap();
    fs::write(path.with_extension("json.tmp"), "incomplete").unwrap();

    assert_eq!(
        load_stored(&path).unwrap().default_profile_id.as_deref(),
        Some("preserved")
    );
    write_stored(&path, &settings).unwrap();
    assert!(path.is_file());
    assert!(!path.with_extension("json.bak").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_unbounded_profile_and_secret_payloads() {
    let profile = SaveAiProviderProfile {
        id: "profile".into(),
        name: "x".repeat(MAX_PROFILE_NAME_BYTES + 1),
        preset_id: "custom".into(),
        protocol: super::super::types::AiProtocol::OpenaiChatCompletions,
        base_url: "https://example.com/v1".into(),
        model: "model".into(),
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
        api_key: None,
        clear_api_key: false,
    };
    assert!(
        normalize(&profile)
            .unwrap_err()
            .to_string()
            .contains("name")
    );
    let oversized_secret = SaveAiProviderProfile {
        name: "Profile".into(),
        api_key: Some("x".repeat(MAX_API_KEY_BYTES + 1)),
        ..profile
    };
    assert!(
        save_ai_settings(SaveAiSettingsRequest {
            default_profile_id: Some("profile".into()),
            profiles: vec![oversized_secret],
        })
        .unwrap_err()
        .to_string()
        .contains("API keys")
    );
}
