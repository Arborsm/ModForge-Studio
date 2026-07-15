use super::*;
use crate::domain::localization::review;
use std::sync::{Mutex, OnceLock};
fn lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
}
fn request(scope: &str) -> AiReviewRequest {
    AiReviewRequest {
        job_id: format!("review:{}", uuid::Uuid::new_v4()),
        scope_id: scope.into(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        mode: "all".into(),
        profile_id: None,
        run_ai: false,
        engine: "local".into(),
        items: vec![
            AiReviewItem {
                unit_key: "empty".into(),
                source_text: "Hello {{name}}".into(),
                target_text: "".into(),
            },
            AiReviewItem {
                unit_key: "marker".into(),
                source_text: "Hi {{name}}".into(),
                target_text: "你好".into(),
            },
            AiReviewItem {
                unit_key: "space".into(),
                source_text: "Welcome".into(),
                target_text: " 欢迎  回来 ".into(),
            },
        ],
    }
}

#[test]
fn post_translation_validation_reports_markers_and_required_user_terms() {
    let items = vec![(
        "greeting".to_string(),
        "Hello {{name}}".to_string(),
        "你好".to_string(),
    )];
    let required = std::collections::BTreeMap::from([(
        "greeting".to_string(),
        vec![("Hello".to_string(), "您好".to_string())],
    )]);
    let issues = review::translation_validation_issues("en-US", "zh-CN", &items, &required, false);
    assert!(
        issues
            .iter()
            .any(|issue| issue.category == "marker-mismatch")
    );
    assert!(
        issues
            .iter()
            .any(|issue| issue.category == "user-terminology"
                && issue.expected_term.as_deref() == Some("您好"))
    );
}

#[test]
fn deterministic_review_persists_only_problem_snapshots_and_validates_acceptance() {
    let _guard = lock();
    let root = std::env::temp_dir().join(format!("modforge-review-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let scope = knowledge::resolve_scope(ResolveLocalizationScopeRequest {
        binding_kind: "project-unique-id".into(),
        binding_value: "Review.Mod".into(),
        name: "Review".into(),
    })
    .unwrap();
    let result = run_local(request(&scope.scope.id)).unwrap();
    assert!(
        result
            .issues
            .iter()
            .any(|issue| issue.category == "empty-translation" && issue.severity == "critical")
    );
    assert!(
        result
            .issues
            .iter()
            .any(|issue| issue.category == "marker-mismatch")
    );
    let whitespace = result
        .issues
        .iter()
        .find(|issue| issue.category == "illegal-whitespace" && issue.suggestion.is_some())
        .unwrap();
    let stale = update_issues(UpdateReviewIssuesRequest {
        run_id: result.run.id.clone(),
        issues: vec![UpdateReviewIssueStatus {
            id: whitespace.id.clone(),
            status: "accepted".into(),
            current_source_text: "changed".into(),
            current_target_text: whitespace.target_snapshot.clone(),
        }],
    })
    .unwrap();
    assert_eq!(
        stale
            .issues
            .iter()
            .find(|issue| issue.id == whitespace.id)
            .unwrap()
            .status,
        "stale"
    );
    let loaded = load_run(LoadReviewRunRequest {
        run_id: result.run.id,
    })
    .unwrap();
    assert_eq!(loaded.issues.len(), result.issues.len());
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn review_history_keeps_the_latest_fifty_runs_per_scope() {
    let _guard = lock();
    let root = std::env::temp_dir().join(format!(
        "modforge-review-retention-{}",
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let scope = knowledge::resolve_scope(ResolveLocalizationScopeRequest {
        binding_kind: "project-unique-id".into(),
        binding_value: "Retention.Mod".into(),
        name: "Retention".into(),
    })
    .unwrap();
    for _ in 0..52 {
        run_local(request(&scope.scope.id)).unwrap();
    }
    let page = list_runs(ListReviewRunsRequest {
        scope_id: scope.scope.id,
        offset: 0,
        limit: 100,
    })
    .unwrap();
    assert_eq!(page.total, 50);
    assert_eq!(page.records.len(), 50);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}
