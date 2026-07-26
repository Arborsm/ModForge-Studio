use super::*;
use std::fs;
use std::sync::{Arc, Barrier};

fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
}

#[test]
fn concurrent_first_open_initializes_the_usage_ledger_once() {
    let _guard = test_lock();
    let root = std::env::temp_dir().join(format!("modforge-usage-open-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let barrier = Arc::new(Barrier::new(16));
    let threads = (0..16)
        .map(|_| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                open().map(|db| {
                    db.query_row(
                        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('usage_events','usage_daily')",
                        [],
                        |row| row.get::<_, u64>(0),
                    )
                    .unwrap()
                })
            })
        })
        .collect::<Vec<_>>();
    for thread in threads {
        assert_eq!(thread.join().unwrap().unwrap(), 2);
    }
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(root);
}

#[test]
fn usage_ledger_records_summarizes_exports_and_never_contains_body_text() {
    let _guard = test_lock();
    let root = std::env::temp_dir().join(format!("modforge-usage-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let occurred_at_ms =
        time::OffsetDateTime::now_utc().unix_timestamp() * 1000 - 100 * 24 * 60 * 60 * 1000;
    let event = AiUsageEvent {
        occurred_at_ms,
        job_id: "job-1".into(),
        attempt: 1,
        page_source: "workbench-translation".into(),
        operation: "translate".into(),
        engine_kind: "generative-ai".into(),
        profile_id: Some("profile-1".into()),
        provider: "openai".into(),
        model: Some("model-1".into()),
        scope_id: Some("scope-1".into()),
        succeeded: true,
        latency_ms: 125,
        failure_category: None,
        request_items: 2,
        request_characters: 17,
        response_characters: 21,
        input_tokens: Some(11),
        output_tokens: Some(7),
        cached_tokens: Some(3),
        reasoning_tokens: Some(2),
        billed_characters: None,
        usage_source: "provider-reported".into(),
        job_succeeded: None,
    };
    record_usage(event).unwrap();
    let query = AiUsageQuery {
        from_ms: occurred_at_ms - 24 * 60 * 60 * 1000,
        to_ms: occurred_at_ms + 24 * 60 * 60 * 1000,
        provider: None,
        failure_category: None,
        usage_facet: None,
        profile_id: None,
        model: None,
        operation: None,
        engine_kind: None,
        scope_id: None,
        succeeded: None,
        offset: 0,
        limit: 100,
    };
    let page = query_records(query.clone()).unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.records[0].input_tokens, Some(11));
    let mut scheduled_event = page.records[0].clone();
    scheduled_event.job_id = "scheduled-retention".into();
    let summary = query_summary(query.clone()).unwrap();
    assert_eq!(summary.totals.requests, 1);
    assert_eq!(summary.totals.cached_tokens, 3);
    let destination = root.join("usage.csv");
    assert_eq!(
        export_usage(AiUsageExportRequest {
            query: query.clone(),
            destination_path: destination.to_string_lossy().into_owned()
        })
        .unwrap(),
        1
    );
    let csv = fs::read_to_string(destination).unwrap();
    assert!(csv.contains("profile-1"));
    assert!(!csv.contains("source body"));
    assert!(!csv.contains("translated body"));
    let compacted = clear_usage(AiUsageClearRequest {
        mode: AiUsageClearMode::DetailOlderThan90Days,
    })
    .unwrap();
    assert_eq!(compacted.removed_events, 1);
    assert_eq!(query_records(query.clone()).unwrap().total, 0);
    let retained = query_summary(query.clone()).unwrap();
    assert_eq!(retained.totals.requests, 1);
    assert_eq!(retained.totals.input_tokens, 11);
    let mut model_query = query.clone();
    model_query.model = Some("model-1".into());
    assert_eq!(query_summary(model_query).unwrap().totals.requests, 1);
    let mut other_model_query = query.clone();
    other_model_query.model = Some("other-model".into());
    assert_eq!(query_summary(other_model_query).unwrap().totals.requests, 0);
    let cleared = clear_usage(AiUsageClearRequest {
        mode: AiUsageClearMode::All,
    })
    .unwrap();
    assert_eq!(cleared.removed_events, 0);
    assert_eq!(cleared.removed_daily_rows, 1);
    let mut db = open().unwrap();
    insert(&db, &scheduled_event).unwrap();
    assert_eq!(compact_expired(&mut db).unwrap(), 1);
    assert_eq!(query_records(query.clone()).unwrap().total, 0);
    assert_eq!(query_summary(query).unwrap().totals.requests, 1);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(root);
}

#[test]
fn diagnostics_separate_attempt_and_final_job_rates_and_use_request_cache_hits() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch(
        "CREATE TABLE usage_events(
          occurred_at_ms INTEGER NOT NULL, job_id TEXT NOT NULL, provider TEXT NOT NULL,
          model TEXT, operation TEXT NOT NULL, engine_kind TEXT NOT NULL, profile_id TEXT,
          scope_id TEXT, succeeded INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
          failure_category TEXT, cached_tokens INTEGER, billed_characters INTEGER,
          usage_source TEXT NOT NULL);
         INSERT INTO usage_events VALUES
          (2000000000000,'retry-job','openai','model','translate','generative-ai','profile',NULL,0,10,'rate-limit',0,NULL,'provider-reported'),
          (2000000000001,'retry-job','openai','model','translate','generative-ai','profile',NULL,1,20,NULL,4,NULL,'provider-reported'),
          (2000000000002,'failed-job','openai','model','translate','generative-ai','profile',NULL,0,100,'network',NULL,NULL,'unavailable');",
    )
    .unwrap();
    let query = AiUsageQuery {
        from_ms: 1_999_999_999_000,
        to_ms: 2_000_000_001_000,
        provider: None,
        failure_category: None,
        usage_facet: None,
        profile_id: None,
        model: None,
        operation: None,
        engine_kind: None,
        scope_id: None,
        succeeded: None,
        offset: 0,
        limit: 100,
    };
    let diagnostics = query_diagnostics(&db, &query).unwrap();
    assert_eq!(diagnostics.p95_latency_ms, 100);
    assert!((diagnostics.average_latency_ms - 43.333).abs() < 0.01);
    assert!((diagnostics.attempt_success_rate - 1.0 / 3.0).abs() < 0.001);
    assert_eq!(diagnostics.jobs, 2);
    assert_eq!(diagnostics.successful_jobs, 1);
    assert_eq!(diagnostics.job_success_rate, 0.5);
    assert_eq!(diagnostics.cache_eligible_requests, 2);
    assert_eq!(diagnostics.cache_hit_requests, 1);
    assert_eq!(diagnostics.cache_hit_rate, 0.5);
    assert_eq!(diagnostics.token_unavailable_requests, 1);
    assert_eq!(diagnostics.provider_models[0].attempts, 3);
    assert_eq!(diagnostics.failure_categories.len(), 2);
}
