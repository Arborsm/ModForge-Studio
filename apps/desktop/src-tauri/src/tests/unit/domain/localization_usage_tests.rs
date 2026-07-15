use super::*;
use std::fs;

#[test]
fn usage_ledger_records_summarizes_exports_and_never_contains_body_text() {
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
    };
    record_usage(event).unwrap();
    let query = AiUsageQuery {
        from_ms: occurred_at_ms - 24 * 60 * 60 * 1000,
        to_ms: occurred_at_ms + 24 * 60 * 60 * 1000,
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
    let _ = fs::remove_dir_all(root);
}
