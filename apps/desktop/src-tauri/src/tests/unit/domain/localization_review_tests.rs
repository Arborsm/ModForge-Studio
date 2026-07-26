use super::*;
use crate::domain::localization::orchestrator::compile_official_context;
use crate::domain::localization::review;
fn lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
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

fn official_unit(id: i64, source: &str, target: &str) -> AiOfficialUnit {
    AiOfficialUnit {
        id,
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_text: source.into(),
        target_text: target.into(),
        asset_path: "Strings/NPCNames.xnb".into(),
        unit_key: source.into(),
        unit_kind: "term".into(),
        searchable: true,
        semantic_eligible: true,
        prompt_eligible: true,
        fingerprint: format!("fingerprint-{id}"),
        similarity: 1.0,
        score: 1.0,
        semantic_similarity: None,
        lexical_similarity: 1.0,
        match_kind: "exact".into(),
        retrieval_mode: "lexical".into(),
    }
}

#[test]
fn generative_official_context_counts_terms_and_examples_once_and_respects_user_overrides() {
    let abigail = official_unit(1, "Abigail", "阿比盖尔");
    let farm = official_unit(2, "Welcome to the farm", "欢迎来到农场");
    let (count, context) = compile_official_context(
        vec![abigail.clone()],
        vec![abigail, farm],
        &std::collections::BTreeSet::new(),
    );
    assert_eq!(count, 2);
    let context = context.unwrap();
    assert!(context.contains("Official terminology:\nAbigail => 阿比盖尔"));
    assert_eq!(context.matches("Abigail => 阿比盖尔").count(), 1);
    assert!(context.contains("Official examples:\nWelcome to the farm => 欢迎来到农场"));

    let (count, context) = compile_official_context(
        vec![official_unit(1, "Abigail", "阿比盖尔")],
        Vec::new(),
        &std::collections::BTreeSet::from(["Abigail".to_string()]),
    );
    assert_eq!(count, 0);
    assert!(context.is_none());
}

#[test]
fn post_translation_validation_reports_markers_and_required_user_terms() {
    let items = vec![(
        "greeting".to_string(),
        "Hello {{name}} {0:N0} $1 %s".to_string(),
        "你好".to_string(),
    )];
    let required = std::collections::BTreeMap::from([(
        "greeting".to_string(),
        vec![("Hello".to_string(), "您好".to_string())],
    )]);
    let issues = review::translation_validation_issues(
        &items,
        &required,
        &std::collections::BTreeMap::new(),
    );
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
fn post_translation_validation_uses_the_traced_official_term_matches() {
    let items = vec![(
        "gift".to_string(),
        "A gift for Abigail".to_string(),
        "错误译文".to_string(),
    )];
    let official = std::collections::BTreeMap::from([(
        "gift".to_string(),
        vec![("Abigail".to_string(), "阿比盖尔".to_string())],
    )]);

    let issues = review::translation_validation_issues(
        &items,
        &std::collections::BTreeMap::new(),
        &official,
    );

    assert_eq!(official.values().map(Vec::len).sum::<usize>(), 1);
    assert!(issues.iter().any(|issue| {
        issue.category == "official-terminology"
            && issue.source_term.as_deref() == Some("Abigail")
            && issue.expected_term.as_deref() == Some("阿比盖尔")
    }));
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
