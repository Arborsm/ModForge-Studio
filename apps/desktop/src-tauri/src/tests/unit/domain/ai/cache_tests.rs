use super::*;
use std::sync::{Arc, Barrier};

fn temporary_cache_path(label: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "modforge-ai-cache-{label}-{}-{}.sqlite3",
        std::process::id(),
        uuid::Uuid::new_v4()
    ))
}

#[test]
fn cache_replaces_changed_sources_without_touching_other_scopes_or_locales() {
    let path = temporary_cache_path("replace");
    let _ = std::fs::remove_file(&path);
    let connection = open_cache_at(&path).unwrap();
    assert_eq!(
        connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
            .unwrap(),
        2
    );
    let entry = AiTranslationCacheEntry {
        scope_key: "mod:123:description".into(),
        target_locale: "zh-Hans".into(),
        source_hash: "hash-one".into(),
        translated_text: "译文".into(),
        provider_profile_id: "profile".into(),
        model: "model".into(),
        updated_at_ms: 42,
    };
    write_to(&connection, &entry).unwrap();
    let request = ReadAiTranslationCacheRequest {
        scope_key: entry.scope_key.clone(),
        target_locale: entry.target_locale.clone(),
        source_hash: entry.source_hash.clone(),
    };
    assert_eq!(
        read_from(&connection, &request)
            .unwrap()
            .unwrap()
            .translated_text,
        "译文"
    );
    assert_eq!(stats_from(&connection, &path).unwrap().entry_count, 1);
    assert!(
        read_from(
            &connection,
            &ReadAiTranslationCacheRequest {
                source_hash: "changed".into(),
                ..request.clone()
            }
        )
        .unwrap()
        .is_none()
    );
    let changed_entry = AiTranslationCacheEntry {
        source_hash: "changed".into(),
        translated_text: "新译文".into(),
        ..entry.clone()
    };
    let other_locale = AiTranslationCacheEntry {
        target_locale: "en".into(),
        source_hash: "english".into(),
        translated_text: "Translation".into(),
        ..entry.clone()
    };
    let other_scope = AiTranslationCacheEntry {
        scope_key: "mod:456:description".into(),
        source_hash: "other-mod".into(),
        translated_text: "其他模组".into(),
        ..entry.clone()
    };
    write_to(&connection, &other_locale).unwrap();
    write_to(&connection, &other_scope).unwrap();
    write_to(&connection, &changed_entry).unwrap();
    assert_eq!(stats_from(&connection, &path).unwrap().entry_count, 3);
    let expected_size = file_size(&path)
        + file_size(&sidecar_path(&path, "-wal"))
        + file_size(&sidecar_path(&path, "-shm"));
    assert_eq!(
        stats_from(&connection, &path).unwrap().size_bytes,
        expected_size
    );
    assert!(read_from(&connection, &request).unwrap().is_none());
    assert_eq!(
        read_from(
            &connection,
            &ReadAiTranslationCacheRequest {
                scope_key: changed_entry.scope_key,
                target_locale: changed_entry.target_locale,
                source_hash: changed_entry.source_hash,
            }
        )
        .unwrap()
        .unwrap()
        .translated_text,
        "新译文"
    );
    for preserved in [other_locale, other_scope] {
        assert!(
            read_from(
                &connection,
                &ReadAiTranslationCacheRequest {
                    scope_key: preserved.scope_key,
                    target_locale: preserved.target_locale,
                    source_hash: preserved.source_hash,
                }
            )
            .unwrap()
            .is_some()
        );
    }
    connection.execute("DELETE FROM translations", []).unwrap();
    assert_eq!(stats_from(&connection, &path).unwrap().entry_count, 0);

    let oversized = AiTranslationCacheEntry {
        translated_text: "x".repeat(MAX_TRANSLATED_TEXT_BYTES + 1),
        ..entry
    };
    assert!(
        validate_entry(&oversized)
            .unwrap_err()
            .to_string()
            .contains("translated text")
    );
    drop(connection);
    let _ = std::fs::remove_file(path);
}

#[test]
fn concurrent_first_open_initializes_the_cache_once() {
    let path = temporary_cache_path("concurrent-open");
    let _ = std::fs::remove_file(&path);
    let workers = 16;
    let barrier = Arc::new(Barrier::new(workers));
    let handles = (0..workers)
        .map(|_| {
            let path = path.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || -> anyhow::Result<u32> {
                barrier.wait();
                let connection = open_cache_at(&path)?;
                Ok(connection.query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))?)
            })
        })
        .collect::<Vec<_>>();
    for handle in handles {
        assert_eq!(handle.join().unwrap().unwrap(), 2);
    }
    let connection = open_cache_at(&path).unwrap();
    let table_count = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='translations'",
            [],
            |row| row.get::<_, u32>(0),
        )
        .unwrap();
    assert_eq!(table_count, 1);
    drop(connection);
    let _ = std::fs::remove_file(path);
}
