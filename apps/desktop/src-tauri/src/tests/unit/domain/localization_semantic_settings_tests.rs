use super::*;
use crate::domain::localization::types::AiSemanticExecutionPreference;

fn test_root() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!(
        "modforge-semantic-settings-{}",
        uuid::Uuid::new_v4()
    ));
    std::fs::create_dir_all(root.join("ai")).unwrap();
    root
}

#[test]
fn legacy_settings_default_to_automatic_execution() {
    let _guard = crate::test_support::process_environment_lock();
    let root = test_root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    std::fs::write(
        root.join("ai").join("semantic-search-settings.json"),
        r#"{"version":1,"mode":"builtin","localModelDirectory":null,"activeRemoteProfileId":null,"remoteProfiles":[]}"#,
    )
    .unwrap();

    let settings = load_settings().unwrap();
    assert_eq!(
        settings.execution_preference,
        AiSemanticExecutionPreference::Auto
    );

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn cpu_execution_preference_is_persisted() {
    let _guard = crate::test_support::process_environment_lock();
    let root = test_root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };

    save_settings(SaveAiSemanticSettingsRequest {
        mode: AiSemanticSearchMode::Builtin,
        execution_preference: AiSemanticExecutionPreference::Cpu,
        local_model_directory: None,
        active_remote_profile_id: None,
        remote_profiles: Vec::new(),
    })
    .unwrap();
    assert_eq!(
        load_settings().unwrap().execution_preference,
        AiSemanticExecutionPreference::Cpu
    );

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    std::fs::remove_dir_all(root).unwrap();
}
