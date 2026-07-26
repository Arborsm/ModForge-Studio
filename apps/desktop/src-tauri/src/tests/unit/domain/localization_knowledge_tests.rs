use super::*;
use crate::domain::localization::types::*;
use std::fs;

fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
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

fn confirmed(key: &str, target: &str) -> ConfirmedTranslation {
    ConfirmedTranslation {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_text: format!("source-{key}"),
        target_text: target.into(),
        file_namespace: "i18n/zh-CN.json".into(),
        unit_key: key.into(),
    }
}

#[test]
fn initialize_plan_creates_reuses_and_synchronizes_one_bound_plan() {
    let _guard = test_lock();
    let data_root = root();
    let request =
        |entries: Vec<ConfirmedTranslation>, import_existing| InitializeLocalizationPlanRequest {
            job_id: uuid::Uuid::new_v4().to_string(),
            binding_kind: "installed-mod".into(),
            binding_value: "Example.Plan".into(),
            plan_name: "Example Plan".into(),
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            file_namespace: "i18n/zh-CN.json".into(),
            import_existing,
            entries,
        };
    let first = initialize_plan(request(
        vec![confirmed("a", "甲"), confirmed("b", "乙")],
        true,
    ))
    .unwrap();
    assert_eq!(first.imported_count, 2);
    assert!(first.snapshot.settings.knowledge_policy.enabled);
    assert!(first.snapshot.settings.knowledge_policy.use_official_corpus);
    assert!(
        first
            .snapshot
            .settings
            .knowledge_policy
            .use_global_knowledge
    );
    assert!(
        first
            .snapshot
            .settings
            .knowledge_policy
            .use_profile_knowledge
    );

    let second = initialize_plan(request(vec![confirmed("a", "新甲")], true)).unwrap();
    assert_eq!(first.snapshot.scope.id, second.snapshot.scope.id);
    let memory = search_memory(SearchLocalizationKnowledgeRequest {
        scope_id: second.snapshot.scope.id.clone(),
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 100,
    })
    .unwrap();
    assert_eq!(memory.total, 1);
    assert_eq!(memory.records[0].target_text, "新甲");

    let third = initialize_plan(request(Vec::new(), false)).unwrap();
    assert_eq!(third.imported_count, 0);
    assert_eq!(third.snapshot.scope.id, second.snapshot.scope.id);
    assert_eq!(
        search_memory(SearchLocalizationKnowledgeRequest {
            scope_id: third.snapshot.scope.id,
            source_locale: None,
            target_locale: None,
            query: None,
            offset: 0,
            limit: 100,
        })
        .unwrap()
        .total,
        1
    );
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn initialize_plan_rolls_back_scope_when_import_validation_fails() {
    let _guard = test_lock();
    let data_root = root();
    let error = initialize_plan(InitializeLocalizationPlanRequest {
        job_id: uuid::Uuid::new_v4().to_string(),
        binding_kind: "installed-mod".into(),
        binding_value: "Rollback.Mod".into(),
        plan_name: "Rollback".into(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        file_namespace: "i18n/zh-CN.json".into(),
        import_existing: true,
        entries: vec![ConfirmedTranslation {
            source_locale: "en-US".into(),
            target_locale: "ja-JP".into(),
            source_text: "Hello".into(),
            target_text: "こんにちは".into(),
            file_namespace: "i18n/ja-JP.json".into(),
            unit_key: "hello".into(),
        }],
    })
    .unwrap_err();
    assert!(error.to_string().contains("invalid translation entry"));
    let scopes = list_scopes(ListLocalizationScopesRequest {
        query: Some("Rollback".into()),
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(scopes.total, 0);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
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
    assert_eq!(fallback.scope.bindings.len(), 1);
    assert_eq!(fallback.scope.bindings[0].kind, "canonical-path-hash");
    let stored = &fallback.scope.bindings[0].value;
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
        job_id: uuid::Uuid::new_v4().to_string(),
        scope_id: scope_id.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("a", "甲"), confirmed("b", "乙")],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        job_id: uuid::Uuid::new_v4().to_string(),
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
        job_id: uuid::Uuid::new_v4().to_string(),
        scope_id: GLOBAL_SCOPE_ID.into(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![confirmed("你好")],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        job_id: uuid::Uuid::new_v4().to_string(),
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
            use_profile_knowledge: true,
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
        job_id: uuid::Uuid::new_v4().to_string(),
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
fn lexical_fallback_recalls_partial_memory_for_preview_and_ai_context() {
    let _guard = test_lock();
    let data_root = root();
    let scope = project("Lexical.Fallback").scope.id;
    record_confirmed(RecordConfirmedTranslationsRequest {
        job_id: uuid::Uuid::new_v4().to_string(),
        scope_id: scope.clone(),
        file_namespace: "i18n/default.json".into(),
        entries: vec![ConfirmedTranslation {
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            source_text: "Welcome to Pelican Town".into(),
            target_text: "欢迎来到鹈鹕镇".into(),
            file_namespace: "i18n/default.json".into(),
            unit_key: "town.welcome".into(),
        }],
    })
    .unwrap();

    let page = search_memory(SearchLocalizationKnowledgeRequest {
        scope_id: scope.clone(),
        source_locale: Some("en-US".into()),
        target_locale: Some("zh-CN".into()),
        query: Some("Welcome back, farmer".into()),
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.records[0].match_kind, "keyword");
    assert_eq!(page.records[0].retrieval_mode, "lexical");

    let policy = crate::domain::ai::types::KnowledgePolicy {
        enabled: true,
        use_official_corpus: false,
        use_global_knowledge: false,
        use_profile_knowledge: true,
    };
    let preview = inspect_context(InspectLocalizationContextRequest {
        scope_id: scope.clone(),
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        source_text: "Welcome back, farmer".into(),
        unit_key: Some("farm.return".into()),
        game_directory: None,
        knowledge_policy: policy.clone(),
    })
    .unwrap();
    assert_eq!(preview.memory.len(), 1);

    let resolved = resolve_translation_knowledge(
        Some(&scope),
        &policy,
        "en-US",
        "zh-CN",
        &[crate::domain::ai::types::AiTranslationItem {
            id: "return".into(),
            text: "Welcome back, farmer".into(),
            format: crate::domain::ai::types::AiTranslationFormat::PlainText,
            context: None,
        }],
    )
    .unwrap();
    let context = &resolved.contexts["return"];
    assert!(context.contains("Translation memory suggestions"));
    assert!(context.contains("Welcome to Pelican Town => 欢迎来到鹈鹕镇"));
    assert_eq!(resolved.trace.translation_memory_matches, 1);

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn open_migrates_legacy_project_scopes_to_profile_kind() {
    let _guard = test_lock();
    let data_root = root();
    {
        let db = open().unwrap();
        db.execute(
            "INSERT INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES('legacy-project','project','Legacy project',0,0,0)",
            [],
        )
        .unwrap();
    }
    let db = open().unwrap();
    let kind: String = db
        .query_row(
            "SELECT kind FROM localization_scopes WHERE id='legacy-project'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(kind, "profile");
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}

#[test]
fn create_profile_makes_unbound_profile_scope_with_default_settings() {
    let _guard = test_lock();
    let root = root();
    let snapshot = create_profile("  Shared profile  ".into()).unwrap();
    assert_eq!(snapshot.scope.kind, "profile");
    assert_eq!(snapshot.scope.name, "Shared profile");
    assert!(snapshot.scope.bindings.is_empty());
    assert!(!snapshot.settings.knowledge_policy.enabled);
    assert!(snapshot.settings.knowledge_policy.use_official_corpus);
    assert!(snapshot.settings.knowledge_policy.use_global_knowledge);
    assert!(snapshot.settings.knowledge_policy.use_profile_knowledge);
    assert!(create_profile("   ".into()).is_err());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn rename_profile_updates_name_and_rejects_global_scope() {
    let _guard = test_lock();
    let root = root();
    let profile = create_profile("Before".into()).unwrap();
    let renamed = rename_profile(profile.scope.id.clone(), "  After  ".into()).unwrap();
    assert_eq!(renamed.scope.name, "After");
    assert!(renamed.scope.revision > profile.scope.revision);
    let error = rename_profile(GLOBAL_SCOPE_ID.into(), "Nope".into()).unwrap_err();
    assert!(error.to_string().contains("cannot be renamed"));
    assert!(rename_profile(profile.scope.id, "   ".into()).is_err());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn delete_profile_cascades_knowledge_rows_and_rejects_global_scope() {
    let _guard = test_lock();
    let root = root();
    let profile = create_profile("Disposable".into()).unwrap();
    let scope_id = profile.scope.id.clone();
    upsert_glossary(UpsertLocalizationGlossaryEntriesRequest {
        scope_id: scope_id.clone(),
        entries: vec![AiGlossaryEntry {
            id: String::new(),
            scope_id: scope_id.clone(),
            source_locale: "en-US".into(),
            target_locale: "zh-CN".into(),
            source_term: "Junimo".into(),
            target_term: "祝尼魔".into(),
            match_mode: "exact".into(),
            do_not_translate: false,
            notes: String::new(),
            updated_at_ms: 0,
        }],
    })
    .unwrap();
    record_confirmed(RecordConfirmedTranslationsRequest {
        job_id: uuid::Uuid::new_v4().to_string(),
        scope_id: scope_id.clone(),
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
    delete_profile(scope_id.clone()).unwrap();
    let db = open().unwrap();
    for table in [
        "glossary_entries",
        "translation_memory",
        "scope_settings",
        "scope_bindings",
    ] {
        let remaining: u64 = db
            .query_row(
                &format!("SELECT COUNT(*) FROM {table} WHERE scope_id=?"),
                [&scope_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0, "{table} rows must cascade");
    }
    drop(db);
    assert!(load_scope(LoadLocalizationScopeRequest { scope_id }).is_err());
    assert!(delete_profile(GLOBAL_SCOPE_ID.into()).is_err());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn profile_bindings_move_between_profiles_and_list_scopes_stays_flat() {
    let _guard = test_lock();
    let root = root();
    let first = create_profile("First".into()).unwrap();
    let second = create_profile("Second".into()).unwrap();
    set_profile_binding(
        first.scope.id.clone(),
        "project-unique-id".into(),
        "Example.Mod".into(),
    )
    .unwrap();
    let first_two = set_profile_binding(
        first.scope.id.clone(),
        "project-unique-id".into(),
        "Other.Mod".into(),
    )
    .unwrap();
    assert_eq!(first_two.scope.bindings.len(), 2);
    let moved = set_profile_binding(
        second.scope.id.clone(),
        "project-unique-id".into(),
        " example.mod ".into(),
    )
    .unwrap();
    assert_eq!(moved.scope.bindings.len(), 1);
    assert_eq!(moved.scope.bindings[0].kind, "project-unique-id");
    assert_eq!(moved.scope.bindings[0].value, "example.mod");
    let first_after = load_scope(LoadLocalizationScopeRequest {
        scope_id: first.scope.id.clone(),
    })
    .unwrap();
    assert_eq!(first_after.scope.bindings.len(), 1);
    assert_eq!(first_after.scope.bindings[0].value, "other.mod");
    assert_eq!(project("Example.Mod").scope.id, second.scope.id);
    let page = list_scopes(ListLocalizationScopesRequest {
        query: None,
        offset: 0,
        limit: 50,
    })
    .unwrap();
    assert_eq!(
        page.records
            .iter()
            .filter(|scope| scope.id == first.scope.id)
            .count(),
        1
    );
    let listed = page
        .records
        .iter()
        .find(|scope| scope.id == first.scope.id)
        .unwrap();
    assert_eq!(listed.bindings.len(), 1);
    let found = list_scopes(ListLocalizationScopesRequest {
        query: Some("other.mod".into()),
        offset: 0,
        limit: 50,
    })
    .unwrap();
    assert!(found.records.iter().any(|scope| scope.id == first.scope.id));
    let again = set_profile_binding(
        second.scope.id.clone(),
        "project-unique-id".into(),
        "Example.Mod".into(),
    )
    .unwrap();
    assert_eq!(again.scope.revision, moved.scope.revision);
    let _ = fs::remove_dir_all(root);
}

#[test]
fn remove_profile_binding_detaches_without_deleting_profile() {
    let _guard = test_lock();
    let root = root();
    let profile = create_profile("Detachable".into()).unwrap();
    set_profile_binding(
        profile.scope.id.clone(),
        "project-unique-id".into(),
        "Detach.Mod".into(),
    )
    .unwrap();
    remove_profile_binding("project-unique-id".into(), "Detach.Mod".into()).unwrap();
    let loaded = load_scope(LoadLocalizationScopeRequest {
        scope_id: profile.scope.id.clone(),
    })
    .unwrap();
    assert!(loaded.scope.bindings.is_empty());
    remove_profile_binding("project-unique-id".into(), "Detach.Mod".into()).unwrap();
    let resolved = project("Detach.Mod");
    assert_ne!(resolved.scope.id, profile.scope.id);
    assert_eq!(resolved.scope.kind, "profile");
    let _ = fs::remove_dir_all(root);
}

#[test]
fn resolve_scope_auto_creates_profile_kind_scope_on_first_use() {
    let _guard = test_lock();
    let root = root();
    let snapshot = project("Auto.Create");
    assert_eq!(snapshot.scope.kind, "profile");
    assert_eq!(snapshot.scope.bindings.len(), 1);
    assert_eq!(snapshot.scope.bindings[0].kind, "project-unique-id");
    assert_eq!(snapshot.scope.bindings[0].value, "auto.create");
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
        job_id: uuid::Uuid::new_v4().to_string(),
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
        let exported = export_knowledge(ExportLocalizationKnowledgeRequest {
            scope_id: source.clone(),
            destination_path: path.to_string_lossy().into_owned(),
            format,
            source_locale: None,
            target_locale: None,
            query: None,
        })
        .unwrap();
        match format {
            LocalizationKnowledgeFormat::KnowledgePackJson => {
                assert_eq!((exported.glossary_count, exported.memory_count), (1, 1));
            }
            LocalizationKnowledgeFormat::GlossaryCsv => {
                assert_eq!(
                    (
                        exported.glossary_count,
                        exported.memory_count,
                        exported.style_count
                    ),
                    (1, 0, 0)
                );
                let bytes = fs::read(&path).unwrap();
                assert!(bytes.starts_with(b"\xEF\xBB\xBF"));
                assert!(std::str::from_utf8(&bytes[3..]).unwrap().contains("农场"));
            }
            LocalizationKnowledgeFormat::TranslationMemoryTmx => {
                assert_eq!(
                    (
                        exported.glossary_count,
                        exported.memory_count,
                        exported.style_count
                    ),
                    (0, 1, 0)
                );
            }
        }
        assert!(fs::metadata(&path).unwrap().len() > 0);
        let target = project(&format!("Target.{name}")).scope.id;
        let result = import_knowledge(ImportLocalizationKnowledgeRequest {
            job_id: uuid::Uuid::new_v4().to_string(),
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
