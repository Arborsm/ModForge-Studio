use super::*;
use std::fs;

fn root() -> std::path::PathBuf {
    let root =
        std::env::temp_dir().join(format!("modforge-semantic-index-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    root
}

fn record(id: &str, scope: Option<&str>, vector: Vec<f32>) -> SemanticVectorRecord {
    SemanticVectorRecord {
        source_kind: "memory".into(),
        source_id: id.into(),
        source_fingerprint: format!("fingerprint-{id}"),
        scope_id: scope.map(str::to_string),
        source_locale: "en-US".into(),
        vector,
    }
}

#[test]
fn semantic_search_orders_cosine_similarity_after_scope_filtering() {
    let _guard = crate::test_support::process_environment_lock();
    let root = root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    replace_generation(
        "model-key",
        "model",
        2,
        None,
        Some("knowledge:1"),
        &[
            record("exact", Some("project"), vec![1.0, 0.0]),
            record("near", Some("project"), vec![0.8, 0.6]),
            record("other", Some("project"), vec![0.0, 1.0]),
            record("wrong-scope", Some("global"), vec![1.0, 0.0]),
        ],
    )
    .unwrap();
    let matches = search(
        "model-key",
        "memory",
        Some("project"),
        "en-US",
        &[1.0, 0.0],
        10,
    )
    .unwrap();
    assert_eq!(
        matches
            .iter()
            .map(|value| value.source_id.as_str())
            .collect::<Vec<_>>(),
        vec!["exact", "near", "other"]
    );
    assert!((matches[0].similarity - 1.0).abs() < 0.0001);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn semantic_index_rebuilds_incompatible_disposable_schemas() {
    let _guard = crate::test_support::process_environment_lock();
    let root = root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let path = localization_semantic_index_path().unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let connection = Connection::open(&path).unwrap();
    connection
        .execute_batch("CREATE TABLE obsolete(value TEXT); PRAGMA user_version=99;")
        .unwrap();
    drop(connection);
    replace_generation(
        "new-model",
        "model",
        2,
        Some("official:1"),
        None,
        &[SemanticVectorRecord {
            source_kind: "official".into(),
            source_id: "1".into(),
            source_fingerprint: "fingerprint".into(),
            scope_id: None,
            source_locale: "en-US".into(),
            vector: vec![1.0, 0.0],
        }],
    )
    .unwrap();
    let connection = Connection::open(path).unwrap();
    let version: u32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    let obsolete: u32 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE name='obsolete'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(obsolete, 0);
    drop(connection);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn semantic_index_rejects_an_obsolete_embedding_template() {
    let _guard = crate::test_support::process_environment_lock();
    let root = root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    replace_generation(
        "local:fingerprint:template-v1",
        "model",
        2,
        Some("official:1"),
        Some("knowledge:1"),
        &[record("source", Some("project"), vec![1.0, 0.0])],
    )
    .unwrap();
    let status = inspect(
        Some("model"),
        Some(":template-v3"),
        &["project".into()],
        &[record("source", Some("project"), Vec::new())],
    )
    .unwrap();
    assert!(status.stale);
    assert!(!status.available);
    assert_eq!(status.retrieval_mode, "lexical");
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn semantic_index_reports_fingerprint_level_partial_coverage() {
    let _guard = crate::test_support::process_environment_lock();
    let root = root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    replace_generation(
        "local:fingerprint:template-v3",
        "model",
        2,
        Some("official:1"),
        Some("knowledge:1"),
        &[
            record("unchanged", Some("project"), vec![1.0, 0.0]),
            record("changed", Some("project"), vec![0.0, 1.0]),
            record("deleted", Some("project"), vec![0.5, 0.5]),
        ],
    )
    .unwrap();
    let mut changed = record("changed", Some("project"), Vec::new());
    changed.source_fingerprint = "new-fingerprint".into();
    let status = inspect(
        Some("model"),
        Some(":template-v3"),
        &["project".into()],
        &[
            record("unchanged", Some("project"), Vec::new()),
            changed,
            record("new", Some("project"), Vec::new()),
        ],
    )
    .unwrap();
    assert!(!status.stale);
    assert!(status.available);
    assert_eq!(status.retrieval_mode, "partial");
    assert_eq!(status.indexed_records, 1);
    assert_eq!(status.pending_records, 3);
    assert_eq!(status.coverage_percentage, 25.0);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn semantic_index_synchronizes_changed_new_and_deleted_records_by_scope() {
    let _guard = crate::test_support::process_environment_lock();
    let root = root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    replace_generation(
        "local:fingerprint:template-v3",
        "model",
        2,
        None,
        Some("knowledge:1"),
        &[
            record("unchanged", Some("project"), vec![1.0, 0.0]),
            record("changed", Some("project"), vec![1.0, 0.0]),
            record("deleted", Some("project"), vec![1.0, 0.0]),
            record("other-scope", Some("other"), vec![1.0, 0.0]),
        ],
    )
    .unwrap();
    let generation = active_generation().unwrap().unwrap();
    let unchanged = record("unchanged", Some("project"), Vec::new());
    let mut changed = record("changed", Some("project"), vec![0.0, 1.0]);
    changed.source_fingerprint = "changed-v2".into();
    let added = record("added", Some("project"), vec![0.0, 1.0]);
    synchronize_generation(
        &generation,
        None,
        "knowledge:2",
        &["project".into()],
        &[unchanged, changed.clone(), added.clone()],
        &[changed, added],
    )
    .unwrap();

    let project = search(
        "local:fingerprint:template-v3",
        "memory",
        Some("project"),
        "en-US",
        &[1.0, 0.0],
        10,
    )
    .unwrap();
    assert_eq!(
        project
            .iter()
            .map(|item| item.source_id.as_str())
            .collect::<Vec<_>>(),
        vec!["unchanged", "added", "changed"]
    );
    assert_eq!(
        project
            .iter()
            .find(|item| item.source_id == "changed")
            .unwrap()
            .source_fingerprint,
        "changed-v2"
    );
    let other = search(
        "local:fingerprint:template-v3",
        "memory",
        Some("other"),
        "en-US",
        &[1.0, 0.0],
        10,
    )
    .unwrap();
    assert_eq!(other.len(), 1);
    assert_eq!(other[0].source_id, "other-scope");
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}
