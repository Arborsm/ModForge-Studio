use super::*;
use crate::domain::ai::save_ai_settings;
use crate::domain::ai::types::{AiProtocol, SaveAiProviderProfile, SaveAiSettingsRequest};

fn profile(id: &str) -> SaveAiProviderProfile {
    SaveAiProviderProfile {
        id: id.into(),
        name: id.into(),
        preset_id: "openai".into(),
        protocol: AiProtocol::OpenaiResponses,
        base_url: "https://api.openai.com/v1".into(),
        model: "gpt-4.1-mini".into(),
        credential_environment: None,
        api_key: None,
        clear_api_key: false,
    }
}

#[test]
fn default_engine_round_trips_and_replaces_the_existing_file() {
    let _lock = crate::test_support::process_environment_lock();
    let root = std::env::temp_dir().join(format!(
        "modforge-localization-settings-{}",
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: None,
        profiles: vec![profile("first"), profile("second")],
    })
    .unwrap();

    save_default_engine(LocalizationEngineRef {
        kind: "generative-ai".into(),
        profile_id: "first".into(),
    })
    .unwrap();
    save_default_engine(LocalizationEngineRef {
        kind: "generative-ai".into(),
        profile_id: "second".into(),
    })
    .unwrap();

    let loaded = load_default_engine().unwrap().unwrap();
    assert_eq!(loaded.kind, "generative-ai");
    assert_eq!(loaded.profile_id, "second");
    assert!(!root.join("ai/localization-settings.json.tmp").exists());
    assert!(!root.join("ai/localization-settings.json.bak").exists());

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn rejects_a_default_engine_that_does_not_reference_a_real_profile() {
    let _lock = crate::test_support::process_environment_lock();
    let root = std::env::temp_dir().join(format!(
        "modforge-localization-settings-invalid-{}",
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };

    let error = save_default_engine(LocalizationEngineRef {
        kind: "generative-ai".into(),
        profile_id: "missing".into(),
    })
    .unwrap_err();
    assert!(error.to_string().contains("does not exist"));
    assert!(!root.join("ai/localization-settings.json").exists());

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}
