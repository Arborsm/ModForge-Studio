use super::*;
use crate::domain::localization::types::AiSemanticSearchMode;
use std::fs;

fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
}

fn install_isolated_data_dir() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("modforge-corpus-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    root
}

#[test]
fn prewarm_opens_knowledge_and_skips_unconfigured_components() {
    let _guard = test_lock();
    let data_root = install_isolated_data_dir();
    let result = prewarm_corpus().expect("corpus prewarm should not fail");
    assert_eq!(result.knowledge, "ready");
    // The default semantic mode is builtin but no model is installed in a fresh
    // data dir, so the local model is never loaded and the component is skipped.
    assert_eq!(result.semantic, "skipped");
    // No official corpus index exists in a fresh data dir.
    assert_eq!(result.official, "skipped");
    assert!(result.ready);
    assert!(result.error.is_none());
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn prewarm_is_idempotent_and_reports_semantic_ready_when_model_available() {
    let _guard = test_lock();
    let data_root = install_isolated_data_dir();
    let first = prewarm_corpus().unwrap();
    let second = prewarm_corpus().unwrap();
    assert_eq!(first.knowledge, "ready");
    assert_eq!(second.knowledge, "ready");
    assert_eq!(first.official, second.official);
    // Semantic mode is configurable; when set to a remote profile without a
    // configured model the prewarm must stay non-fatal (skipped), never panic.
    let mut settings = crate::domain::localization::semantic::load_settings().unwrap();
    settings.mode = AiSemanticSearchMode::RemoteOpenai;
    let status = prewarm_corpus().unwrap();
    assert_eq!(status.semantic, "skipped");
    assert!(status.ready);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}
