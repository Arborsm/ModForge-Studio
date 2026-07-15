use super::*;
use crate::domain::localization::types::*;
use std::fs;
use std::sync::{Mutex, MutexGuard, OnceLock};

fn test_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn root() -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("modforge-knowledge-{}", uuid::Uuid::new_v4()));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    root
}
fn project(binding: &str) -> AiLocalizationScopeSnapshot {
    resolve_scope(ResolveLocalizationScopeRequest {
        binding_kind: "project-unique-id".into(),
        binding_value: binding.into(),
        name: "Test project".into(),
    })
    .unwrap()
}

#[test]
fn concurrent_first_open_initializes_localization_knowledge_once() {
    let _guard = test_lock();
    let data_root = root();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(16));
    let threads = (0..16)
        .map(|_| {
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                open().map(|connection| {
                    connection
                        .query_row(
                            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='localization_scopes'",
                            [],
                            |row| row.get::<_, u64>(0),
                        )
                        .unwrap()
                })
            })
        })
        .collect::<Vec<_>>();
    for thread in threads {
        assert_eq!(thread.join().unwrap().unwrap(), 1);
    }
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn scope_bindings_normalize_unique_ids_and_hash_canonical_fallback_paths() {
    let _guard = test_lock();
    let data_root = root();
    let project_root = data_root.join("Installed Mod");
    fs::create_dir_all(&project_root).unwrap();
    let first = project("Example.Mod");
    let same = project(" example.mod ");
    assert_eq!(first.scope.id, same.scope.id);

    let fallback = resolve_scope(ResolveLocalizationScopeRequest {
        binding_kind: "canonical-path-hash".into(),
        binding_value: project_root.to_string_lossy().into_owned(),
        name: "Fallback project".into(),
    })
    .unwrap();
    assert_eq!(
        fallback.scope.binding_kind.as_deref(),
        Some("canonical-path-hash")
    );
    let stored = fallback.scope.binding_value.unwrap();
    assert_eq!(stored.len(), 64);
    assert!(!stored.contains("Installed Mod"));
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn scopes_glossary_style_and_confirmed_memory_are_transactional() {
    let _guard = test_lock();
    let root = root();
    let first = project("Example.Mod");
    let same = project("Example.Mod");
    assert_eq!(first.scope.id, same.scope.id);
    let revision = first.scope.revision;
    let scope_id = first.scope.id.clone();
    let entry = AiGlossaryEntry {
        id: String::new(),
        scope_id: scope_id.clone(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_term: "Junimo".into(),
        target_term: "祝尼魔".into(),
        match_mode: "case-insensitive".into(),
        do_not_translate: false,
        notes: "Official term".into(),
        updated_at_ms: 0,
    };
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: scope_id.clone(),
        entries: vec![entry.clone()],
    })
    .unwrap();
    let mut replacement = entry;
    replacement.target_term = "朱尼魔".into();
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: scope_id.clone(),
        entries: vec![replacement],
    })
    .unwrap();
    let glossary = list_glossary(SearchLocalizationKnowledgeRequest {
        scope_id: scope_id.clone(),
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 100,
    })
    .unwrap();
    assert_eq!(glossary.total, 1);
    assert_eq!(glossary.records[0].target_term, "朱尼魔");
    let style = save_style(AiStyleGuide {
        scope_id: scope_id.clone(),
        target_locale: "zh-CN".into(),
        tone: "warm".into(),
        audience: "players".into(),
        formality: "neutral".into(),
        forbidden_phrases: vec!["您".into()],
        preferred_phrases: vec!["你".into()],
        rules: vec!["Keep NPC voice".into()],
        updated_at_ms: 0,
    })
    .unwrap();
    assert_eq!(
        load_style(LoadLocalizationStyleGuideRequest {
            scope_id: scope_id.clone(),
            target_locale: "zh-CN".into()
        })
        .unwrap()
        .unwrap()
        .tone,
        style.tone
    );
    let confirmed = |key: &str, target: &str| ConfirmedTranslation {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_text: format!("source-{key}"),
        target_text: target.into(),
        file_namespace: "i18n/default.json".into(),
        unit_key: key.into(),
    };
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: scope_id.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("a", "甲"), confirmed("b", "乙")],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: scope_id.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("a", "新甲")],
    })
    .unwrap();
    let memory = search_memory(SearchLocalizationKnowledgeRequest {
        scope_id: scope_id.clone(),
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 100,
    })
    .unwrap();
    assert_eq!(memory.total, 1);
    assert_eq!(memory.records[0].target_text, "新甲");
    assert!(
        load_scope(LoadLocalizationScopeRequest { scope_id })
            .unwrap()
            .scope
            .revision
            > revision
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn translation_knowledge_prefers_project_memory_and_glossary() {
    let _guard = test_lock();
    let root = root();
    let project = project("Priority.Mod").scope.id;
    let make_term = |scope_id: &str, target: &str| AiGlossaryEntry {
        id: String::new(),
        scope_id: scope_id.into(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_term: "Junimo".into(),
        target_term: target.into(),
        match_mode: "exact".into(),
        do_not_translate: false,
        notes: String::new(),
        updated_at_ms: 0,
    };
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: GLOBAL_SCOPE_ID.into(),
        entries: vec![make_term(GLOBAL_SCOPE_ID, "祝尼魔")],
    })
    .unwrap();
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: project.clone(),
        entries: vec![make_term(&project, "朱尼魔")],
    })
    .unwrap();
    let confirmed = |target: &str| ConfirmedTranslation {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_text: "Hello".into(),
        target_text: target.into(),
        file_namespace: "i18n/default.json".into(),
        unit_key: "Greeting".into(),
    };
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: GLOBAL_SCOPE_ID.into(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("你好")],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: project.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("您好")],
    })
    .unwrap();
    save_style(AiStyleGuide {
        scope_id: GLOBAL_SCOPE_ID.into(),
        target_locale: "zh-CN".into(),
        tone: "warm".into(),
        audience: "all ages".into(),
        formality: "neutral".into(),
        forbidden_phrases: vec!["global forbidden".into()],
        preferred_phrases: Vec::new(),
        rules: Vec::new(),
        updated_at_ms: 0,
    })
    .unwrap();
    save_style(AiStyleGuide {
        scope_id: project.clone(),
        target_locale: "zh-CN".into(),
        tone: "playful".into(),
        audience: String::new(),
        formality: String::new(),
        forbidden_phrases: Vec::new(),
        preferred_phrases: vec!["project preferred".into()],
        rules: Vec::new(),
        updated_at_ms: 0,
    })
    .unwrap();
    let items = vec![
        crate::domain::ai::types::AiTranslationItem {
            id: "exact".into(),
            text: "Hello".into(),
            format: crate::domain::ai::types::AiTranslationFormat::PlainText,
            context: None,
        },
        crate::domain::ai::types::AiTranslationItem {
            id: "term".into(),
            text: "A Junimo appears".into(),
            format: crate::domain::ai::types::AiTranslationFormat::PlainText,
            context: None,
        },
    ];
    let resolved = resolve_translation_knowledge(
        Some(&project),
        &crate::domain::ai::types::KnowledgePolicy {
            enabled: true,
            use_official_corpus: false,
            use_global_knowledge: true,
            use_project_knowledge: true,
        },
        "en-US",
        "zh-CN",
        &items,
    )
    .unwrap();
    assert_eq!(
        resolved.exact.get("exact").map(String::as_str),
        Some("您好")
    );
    assert!(resolved.contexts["term"].contains("朱尼魔"));
    assert!(!resolved.contexts["term"].contains("祝尼魔"));
    assert!(resolved.contexts["term"].contains("playful"));
    assert!(resolved.contexts["term"].contains("all ages"));
    assert!(resolved.contexts["term"].contains("global forbidden"));
    assert!(resolved.contexts["term"].contains("project preferred"));
    assert_eq!(resolved.trace.translation_memory_matches, 1);
    assert!(resolved.revision.contains(&project));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn copies_translation_memory_to_another_scope_as_editable_memory() {
    let _guard = test_lock();
    let root = root();
    let source = project("Copy.Source").scope.id;
    let target_snapshot = project("Copy.Target");
    let target = target_snapshot.scope.id.clone();
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: source.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![ConfirmedTranslation {
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            source_text: "Hello".into(),
            target_text: "你好".into(),
            file_namespace: "i18n/default.json".into(),
            unit_key: "Greeting".into(),
        }],
    })
    .unwrap();
    let source_page = search_memory(SearchLocalizationKnowledgeRequest {
        scope_id: source.clone(),
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(
        copy_memory(CopyTranslationMemoryEntriesRequest {
            source_scope_id: source,
            target_scope_id: target.clone(),
            ids: vec![source_page.records[0].id.clone()],
        })
        .unwrap(),
        1
    );
    let target_page = search_memory(SearchLocalizationKnowledgeRequest {
        scope_id: target.clone(),
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(target_page.records.len(), 1);
    assert_eq!(target_page.records[0].source_kind, "manual");
    assert_eq!(target_page.records[0].target_text, "你好");
    assert!(
        load_scope(LoadLocalizationScopeRequest { scope_id: target })
            .unwrap()
            .scope
            .revision
            > target_snapshot.scope.revision
    );
    let _ = fs::remove_dir_all(root);
}

#[test]
fn project_scope_rebinding_is_transactional_and_unique() {
    let _guard = test_lock();
    let root = root();
    let first = project("Rebind.Source");
    let second = project("Rebind.Other");
    let rebound = rebind_scope(RebindLocalizationScopeRequest {
        scope_id: first.scope.id.clone(),
        binding_kind: "project-unique-id".into(),
        binding_value: "Rebind.Target".into(),
    })
    .unwrap();
    assert_eq!(
        rebound.scope.binding_value.as_deref(),
        Some("rebind.target")
    );
    assert!(rebound.scope.revision > first.scope.revision);
    assert!(
        rebind_scope(RebindLocalizationScopeRequest {
            scope_id: second.scope.id,
            binding_kind: "project-unique-id".into(),
            binding_value: "Rebind.Target".into(),
        })
        .is_err()
    );
    assert_eq!(project("Rebind.Target").scope.id, first.scope.id);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn knowledge_pack_csv_and_tmx_round_trip_with_real_parsers() {
    let _guard = test_lock();
    let root = root();
    let source = project("Source.Mod").scope.id;
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: source.clone(),
        entries: vec![AiGlossaryEntry {
            id: String::new(),
            scope_id: source.clone(),
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            source_term: "Farm".into(),
            target_term: "农场".into(),
            match_mode: "exact".into(),
            do_not_translate: false,
            notes: String::new(),
            updated_at_ms: 0,
        }],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        scope_id: source.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![ConfirmedTranslation {
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            source_text: "Good morning".into(),
            target_text: "早上好".into(),
            file_namespace: "i18n/default.json".into(),
            unit_key: "Morning".into(),
        }],
    })
    .unwrap();
    for (format, name) in [
        (LocalizationKnowledgeFormat::KnowledgePackJson, "pack.json"),
        (LocalizationKnowledgeFormat::GlossaryCsv, "terms.csv"),
        (
            LocalizationKnowledgeFormat::TranslationMemoryTmx,
            "memory.tmx",
        ),
    ] {
        let path = root.join(name);
        export_knowledge(ExportLocalizationKnowledgeRequest {
            scope_id: source.clone(),
            destination_path: path.to_string_lossy().into_owned(),
            format,
            source_locale: None,
            target_locale: None,
            query: None,
        })
        .unwrap();
        assert!(fs::metadata(&path).unwrap().len() > 0);
        let target = project(&format!("Target.{name}")).scope.id;
        let result = import_knowledge(ImportLocalizationKnowledgeRequest {
            scope_id: target.clone(),
            source_path: path.to_string_lossy().into_owned(),
            format,
        })
        .unwrap();
        match format {
            LocalizationKnowledgeFormat::KnowledgePackJson => {
                assert_eq!(result.glossary_count, 1);
                assert_eq!(result.memory_count, 1)
            }
            LocalizationKnowledgeFormat::GlossaryCsv => assert_eq!(result.glossary_count, 1),
            LocalizationKnowledgeFormat::TranslationMemoryTmx => assert_eq!(result.memory_count, 1),
        }
        if result.memory_count > 0 {
            let imported = search_memory(SearchLocalizationKnowledgeRequest {
                scope_id: target,
                source_locale: None,
                target_locale: None,
                query: Some("Good morning".into()),
                offset: 0,
                limit: 10,
            })
            .unwrap();
            assert_eq!(imported.records[0].source_kind, "imported");
        }
    }
    let _ = fs::remove_dir_all(root);
}
