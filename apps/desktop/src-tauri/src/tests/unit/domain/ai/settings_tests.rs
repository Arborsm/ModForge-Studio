use super::*;

#[test]
fn accepts_https_and_loopback_http_only() {
    assert_eq!(
        validate_base_url("https://api.example.com/v1/").unwrap(),
        "https://api.example.com/v1"
    );
    assert!(validate_base_url("http://127.0.0.1:11434/v1").is_ok());
    assert!(validate_base_url("http://localhost:1234/v1").is_ok());
    assert!(validate_base_url("http://example.com/v1").is_err());
}

#[test]
fn rejects_embedded_credentials_query_and_fragments() {
    for value in [
        "https://user:secret@example.com/v1",
        "https://example.com/v1?key=secret",
        "https://example.com/v1#fragment",
    ] {
        assert!(
            validate_base_url(value).is_err(),
            "accepted unsafe URL {value}"
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
