use super::*;

fn profile(id: &str) -> SaveAiProviderProfile {
    SaveAiProviderProfile {
        id: id.into(),
        name: "Primary".into(),
        preset_id: "openai".into(),
        protocol: AiProtocol::OpenaiResponses,
        base_url: "https://api.openai.com/v1".into(),
        model: "gpt-4.1-mini".into(),
        credential_environment: Some("OPENAI_API_KEY".into()),
        api_key: None,
        clear_api_key: false,
    }
}

#[test]
fn export_excludes_credentials_and_import_requires_an_explicit_conflict_policy() {
    let _guard = crate::test_support::process_environment_lock();
    let root = std::env::temp_dir().join(format!("modforge-ai-exchange-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: Some("primary".into()),
        profiles: vec![profile("primary")],
    })
    .unwrap();
    let destination = root.join("profiles.json");
    assert_eq!(
        export_profiles(ExportAiProfilesRequest {
            destination_path: destination.to_string_lossy().into_owned(),
            profile_ids: Vec::new(),
        })
        .unwrap(),
        1
    );
    let raw = fs::read_to_string(&destination).unwrap();
    assert!(raw.contains("credentialsExcluded"));
    assert!(!raw.contains("apiKey"));
    assert!(!raw.contains("secret-marker"));
    let preview = preview_profiles_import(PreviewAiProfilesImportRequest {
        source_path: destination.to_string_lossy().into_owned(),
    })
    .unwrap();
    assert!(preview.credentials_excluded);
    assert!(preview.entries[0].conflicts);
    let result = apply_profiles_import(ApplyAiProfilesImportRequest {
        source_path: destination.to_string_lossy().into_owned(),
        conflict_policy: AiProfileImportConflictPolicy::Copy,
    })
    .unwrap();
    assert_eq!(result.copied, 1);
    assert_eq!(result.settings.profiles.len(), 2);
    assert_eq!(
        result.settings.default_profile_id.as_deref(),
        Some("primary")
    );

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(root);
}

#[test]
fn import_rejects_fields_that_could_smuggle_credentials() {
    let root = std::env::temp_dir().join(format!(
        "modforge-ai-exchange-invalid-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&root).unwrap();
    let source = root.join("profiles.json");
    fs::write(
        &source,
        r#"{"formatVersion":1,"credentialsExcluded":true,"profiles":[{"id":"x","name":"x","presetId":"openai","protocol":"openai-responses","baseUrl":"https://api.openai.com/v1","model":"m","credentialEnvironment":null,"apiKey":"secret-marker"}]}"#,
    )
    .unwrap();
    let error = preview_profiles_import(PreviewAiProfilesImportRequest {
        source_path: source.to_string_lossy().into_owned(),
    })
    .unwrap_err();
    assert!(error.to_string().contains("parse"));
    fs::remove_dir_all(root).unwrap();
}
