use super::*;
use crate::domain::localization::types::{
    AiSemanticExecutionPreference, SaveAiSemanticSettingsRequest,
};

#[test]
fn source_context_fusion_is_normalized_and_source_weighted() {
    let merged = merge_vectors(vec![1.0, 0.0], vec![0.0, 1.0]).unwrap();
    let norm = merged.iter().map(|value| value * value).sum::<f32>().sqrt();
    assert!((norm - 1.0).abs() < 1e-6);
    assert!(merged[0] > merged[1]);
}

#[test]
fn source_context_fusion_rejects_incompatible_vectors() {
    assert!(merge_vectors(vec![1.0], vec![1.0, 0.0]).is_err());
    assert!(merge_vectors(Vec::new(), Vec::new()).is_err());
}

#[test]
fn remote_usage_records_tokens_and_metadata_without_corpus_text() {
    let texts = vec!["private source text".into(), "another private entry".into()];
    let event = remote_usage_event(
        &texts,
        "semantic-index",
        "job-1",
        Some("scope-1"),
        Some("profile-1".into()),
        Some("embedding-model".into()),
        Some(37),
        true,
        std::time::Duration::from_millis(12),
    );

    assert_eq!(event.operation, "semantic-index");
    assert_eq!(event.engine_kind, "embedding");
    assert_eq!(event.profile_id.as_deref(), Some("profile-1"));
    assert_eq!(event.scope_id.as_deref(), Some("scope-1"));
    assert_eq!(event.input_tokens, Some(37));
    assert_eq!(event.request_items, 2);
    assert_eq!(event.request_characters, 40);
    assert_eq!(event.response_characters, 0);
    assert_eq!(event.usage_source, "provider-reported");
    assert!(event.succeeded);
    let serialized = serde_json::to_string(&event).unwrap();
    assert!(!serialized.contains("private source text"));
    assert!(!serialized.contains("another private entry"));
}

#[test]
fn failed_remote_usage_is_explicitly_unavailable() {
    let event = remote_usage_event(
        &["query".into()],
        "semantic-query",
        "job-2",
        None,
        Some("profile-1".into()),
        Some("embedding-model".into()),
        None,
        false,
        std::time::Duration::from_millis(5),
    );

    assert_eq!(event.operation, "semantic-query");
    assert!(!event.succeeded);
    assert_eq!(event.failure_category.as_deref(), Some("provider"));
    assert_eq!(event.usage_source, "unavailable");
}

#[test]
fn remote_rebuild_and_sync_require_explicit_upload_confirmation() {
    for operation in ["indexing", "synchronization"] {
        let error = require_remote_upload_confirmation(
            &crate::domain::localization::types::AiSemanticSearchMode::RemoteOpenai,
            false,
            operation,
        )
        .unwrap_err();
        assert!(error.to_string().contains(operation));
        assert!(error.to_string().contains("explicit upload confirmation"));
        require_remote_upload_confirmation(
            &crate::domain::localization::types::AiSemanticSearchMode::RemoteOpenai,
            true,
            operation,
        )
        .unwrap();
    }
    require_remote_upload_confirmation(
        &crate::domain::localization::types::AiSemanticSearchMode::Builtin,
        false,
        "indexing",
    )
    .unwrap();
}

#[test]
fn lexical_probe_uses_real_empty_indexes_and_reports_the_missing_official_corpus() {
    let _guard = crate::test_support::process_environment_lock();
    let root =
        std::env::temp_dir().join(format!("modforge-semantic-probe-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    settings::save_settings(SaveAiSemanticSettingsRequest {
        mode: AiSemanticSearchMode::Lexical,
        execution_preference: AiSemanticExecutionPreference::Auto,
        local_model_directory: None,
        active_remote_profile_id: None,
        remote_profiles: Vec::new(),
    })
    .unwrap();

    let result = run_probe(ProbeAiSemanticSearchRequest {
        query: "winter gift Abigail".into(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        limit: 10,
    })
    .unwrap();
    assert_eq!(result.retrieval_mode, "lexical");
    assert_eq!(result.total_candidates, 0);
    assert!(result.records.is_empty());
    assert_eq!(result.warnings.len(), 1);
    assert!(result.warnings[0].contains("Official corpus"));

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}
