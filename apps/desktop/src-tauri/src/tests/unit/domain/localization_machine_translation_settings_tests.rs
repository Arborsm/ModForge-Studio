use super::*;

fn environment_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
}

#[test]
fn settings_round_trip_without_serializing_credentials() {
    let _lock = environment_lock();
    let root = std::env::temp_dir().join(format!("modforge-mt-settings-{}", uuid::Uuid::new_v4()));
    unsafe {
        std::env::set_var("MODFORGE_TEST_DATA_DIR", &root);
        std::env::set_var("MODFORGE_TEST_MT_KEY", "environment-secret")
    }
    let saved = save(SaveMachineTranslationSettingsRequest {
        default_profile_id: Some("google".into()),
        profiles: vec![SaveMachineTranslationProfile {
            id: "google".into(),
            name: "Google".into(),
            preset_id: "google-basic-v2".into(),
            protocol: MachineTranslationProtocol::GoogleBasicV2,
            base_url: "https://translation.googleapis.com".into(),
            region: None,
            enabled: true,
            default_source_locale: Some("en".into()),
            default_target_locale: Some("zh-CN".into()),
            credential_environments: BTreeMap::from([(
                "api-key".into(),
                "MODFORGE_TEST_MT_KEY".into(),
            )]),
            credentials: BTreeMap::new(),
            clear_credentials: Vec::new(),
        }],
    })
    .unwrap();
    assert_eq!(
        saved.profiles[0]
            .credential_sources
            .get("api-key")
            .map(String::as_str),
        Some("environment")
    );
    let raw = std::fs::read_to_string(root.join("ai/machine-translation-settings.json")).unwrap();
    assert!(!raw.contains("environment-secret"));
    assert!(!raw.contains("credentials\""));
    let loaded = load().unwrap();
    assert_eq!(loaded.default_profile_id.as_deref(), Some("google"));
    assert_eq!(
        resolve_credentials(&loaded.profiles[0])
            .unwrap()
            .get("api-key")
            .map(String::as_str),
        Some("environment-secret")
    );
    unsafe {
        std::env::remove_var("MODFORGE_TEST_MT_KEY");
        std::env::remove_var("MODFORGE_TEST_DATA_DIR")
    };
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn rejects_insecure_endpoints_and_credentials_outside_the_preset() {
    assert!(validate_base_url("http://translation.example.com").is_err());
    assert!(validate_base_url("http://127.0.0.1:5000").is_ok());
    let value = SaveMachineTranslationProfile {
        id: "bad".into(),
        name: "Bad".into(),
        preset_id: "deepl-free".into(),
        protocol: MachineTranslationProtocol::Deepl,
        base_url: "https://api-free.deepl.com".into(),
        region: None,
        enabled: true,
        default_source_locale: None,
        default_target_locale: None,
        credential_environments: BTreeMap::new(),
        credentials: BTreeMap::from([("secret-key".into(), "not-allowed".into())]),
        clear_credentials: Vec::new(),
    };
    assert!(normalize(&value).is_err());
}
