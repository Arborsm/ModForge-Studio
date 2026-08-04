use super::*;
use crate::domain::ai::types::{
    AiProtocol, AiTranslationCacheEntry, AiTranslationFormat, AiTranslationItem,
    CancelAiJobRequest, ReadAiTranslationCacheRequest, SaveAiProviderProfile,
};
use std::fs;
use std::sync::{Arc, Mutex};

const PROFILE_ID: &str = "modforge-kimi-real-smoke";
const ANTHROPIC_PROFILE_ID: &str = "modforge-kimi-anthropic-real-smoke";
static LOCALIZATION_LOGS: Mutex<Vec<String>> = Mutex::new(Vec::new());

struct LocalizationLogCapture;
static LOCALIZATION_LOG_CAPTURE: LocalizationLogCapture = LocalizationLogCapture;

impl log::Log for LocalizationLogCapture {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.target().starts_with("Localization")
    }

    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            LOCALIZATION_LOGS.lock().unwrap().push(format!(
                "{} {}",
                record.target(),
                record.args()
            ));
        }
    }

    fn flush(&self) {}
}

struct SmokeCleanup {
    root: std::path::PathBuf,
}

impl Drop for SmokeCleanup {
    fn drop(&mut self) {
        let _ = save_ai_settings(SaveAiSettingsRequest {
            default_profile_id: None,
            profiles: Vec::new(),
        });
        let _ = fs::remove_dir_all(&self.root);
        unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    }
}

fn translation_item(id: &str, text: &str) -> AiTranslationItem {
    AiTranslationItem {
        id: id.into(),
        text: text.into(),
        format: AiTranslationFormat::StardewI18n,
        context: Some(format!("Real Kimi smoke item {id}")),
    }
}

#[test]
#[ignore = "requires MODFORGE_KIMI_API_KEY and makes real Kimi API requests"]
fn kimi_real_backend_flow() {
    LOCALIZATION_LOGS.lock().unwrap().clear();
    let _ = log::set_logger(&LOCALIZATION_LOG_CAPTURE);
    log::set_max_level(log::LevelFilter::Debug);
    let key = std::env::var("MODFORGE_KIMI_API_KEY")
        .expect("MODFORGE_KIMI_API_KEY must be provided for the ignored real smoke test");
    assert!(!key.trim().is_empty());
    let root = std::env::temp_dir().join(format!(
        "modforge-kimi-real-smoke-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let _cleanup = SmokeCleanup { root: root.clone() };

    let profile = SaveAiProviderProfile {
        id: PROFILE_ID.into(),
        name: "Kimi real smoke".into(),
        preset_id: "moonshot".into(),
        protocol: AiProtocol::OpenaiChatCompletions,
        base_url: "https://api.kimi.com/coding/v1".into(),
        model: "kimi-for-coding".into(),
        credential_environment: None,
        allow_insecure_http: false,
        context_window_tokens: Some(128_000),
        max_output_tokens: None,
        temperature: None,
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        max_batch_bytes: None,
        enable_reasoning: false,
        reasoning_effort: None,
        stream_translation: false,
        api_key: Some(key.clone()),
        clear_api_key: false,
    };
    let anthropic_profile = SaveAiProviderProfile {
        id: ANTHROPIC_PROFILE_ID.into(),
        name: "Kimi Anthropic real smoke".into(),
        preset_id: "anthropic".into(),
        protocol: AiProtocol::AnthropicMessages,
        base_url: "https://api.kimi.com/coding/v1".into(),
        model: "kimi-for-coding".into(),
        credential_environment: None,
        allow_insecure_http: false,
        context_window_tokens: None,
        max_output_tokens: Some(4_096),
        temperature: Some(0.3),
        top_p: None,
        frequency_penalty: None,
        presence_penalty: None,
        max_batch_bytes: None,
        enable_reasoning: false,
        reasoning_effort: None,
        stream_translation: false,
        api_key: Some(key.clone()),
        clear_api_key: false,
    };
    let snapshot = save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: Some(PROFILE_ID.into()),
        profiles: vec![profile.clone(), anthropic_profile.clone()],
    })
    .expect("saving the Kimi profile should succeed");
    assert_eq!(snapshot.default_profile_id.as_deref(), Some(PROFILE_ID));
    assert_eq!(snapshot.profiles.len(), 2);
    assert!(snapshot.profiles[0].key_configured);
    assert_eq!(
        snapshot.profiles[0].resolved_credential_source.as_deref(),
        Some("keychain")
    );
    let settings_text = fs::read_to_string(root.join("ai").join("ai-settings.json")).unwrap();
    assert!(!settings_text.contains(&key));
    let keep_key_snapshot = save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: Some(PROFILE_ID.into()),
        profiles: vec![
            SaveAiProviderProfile {
                api_key: None,
                ..profile.clone()
            },
            SaveAiProviderProfile {
                api_key: None,
                ..anthropic_profile.clone()
            },
        ],
    })
    .expect("saving a blank key patch should preserve the credential");
    assert_eq!(
        keep_key_snapshot.profiles[0]
            .resolved_credential_source
            .as_deref(),
        Some("keychain")
    );

    let models = list_ai_models(AiProfileRequest {
        profile_id: PROFILE_ID.into(),
    })
    .expect("Kimi model listing should succeed");
    assert!(models.iter().any(|model| model.id == "kimi-for-coding"));

    let probe = test_ai_profile(AiProfileRequest {
        profile_id: PROFILE_ID.into(),
    })
    .expect("Kimi connection test should succeed");
    assert_eq!(probe.model, "kimi-for-coding");
    let anthropic_probe = test_ai_profile(AiProfileRequest {
        profile_id: ANTHROPIC_PROFILE_ID.into(),
    })
    .expect("Kimi Anthropic-compatible connection test should succeed");
    assert_eq!(anthropic_probe.model, "kimi-for-coding");

    let events = Arc::new(Mutex::new(Vec::new()));
    let event_sink = Arc::clone(&events);
    let app = crate::AppHandle::sidecar(move |event, payload| {
        event_sink
            .lock()
            .unwrap()
            .push((event.to_string(), payload));
        Ok(())
    });
    let single = translate_ai_batch(
        app.clone(),
        AiTranslateBatchRequest {
            job_id: "kimi-real-single".into(),
            profile_id: None,
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![translation_item(
                "single",
                "Welcome to Pelican Town, {{player}}!",
            )],
            usage_context: None,
            knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
            skip_format_validation: false,
            max_batch_bytes: None,
        },
    )
    .expect("single Kimi translation should succeed");
    assert_eq!(single.items.len(), 1);
    assert!(single.items[0].translated_text.contains("{{player}}"));
    let anthropic_single = translate_ai_batch(
        app.clone(),
        AiTranslateBatchRequest {
            job_id: "kimi-anthropic-real-single".into(),
            profile_id: Some(ANTHROPIC_PROFILE_ID.into()),
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![translation_item(
                "anthropic-single",
                "The Community Center needs {{count}} apples.",
            )],
            usage_context: None,
            knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
            skip_format_validation: false,
            max_batch_bytes: None,
        },
    )
    .expect("Kimi Anthropic-compatible translation should succeed");
    assert!(
        anthropic_single.items[0]
            .translated_text
            .contains("{{count}}")
    );

    let batch = translate_ai_batch(
        app,
        AiTranslateBatchRequest {
            job_id: "kimi-real-batch".into(),
            profile_id: Some(PROFILE_ID.into()),
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![
                translation_item("greeting", "Good morning, $0."),
                translation_item("quest", "Bring {{count}} parsnips to the Community Center."),
                translation_item("weather", "It will rain tomorrow."),
            ],
            usage_context: None,
            knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
            skip_format_validation: false,
            max_batch_bytes: None,
        },
    )
    .expect("batched Kimi translation should succeed");
    assert_eq!(batch.items.len(), 3);
    assert!(
        batch
            .items
            .iter()
            .find(|item| item.id == "greeting")
            .unwrap()
            .translated_text
            .contains("$0")
    );
    assert!(
        batch
            .items
            .iter()
            .find(|item| item.id == "quest")
            .unwrap()
            .translated_text
            .contains("{{count}}")
    );
    assert!(events.lock().unwrap().iter().any(|(event, payload)| {
        event == "ai://translation-progress" && payload["state"] == "completed"
    }));

    let private_marker = "PRIVATE_KIMI_LOG_BODY_MARKER";
    let operational = crate::domain::localization::orchestrator::translate_ai_batch(
        crate::AppHandle::sidecar(|_, _| Ok(())),
        AiTranslateBatchRequest {
            job_id: "kimi-operational-log".into(),
            profile_id: Some(PROFILE_ID.into()),
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![translation_item("private", private_marker)],
            usage_context: None,
            knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
            skip_format_validation: false,
            max_batch_bytes: None,
        },
    )
    .expect("Kimi operational logging translation should succeed");
    assert_eq!(operational.items.len(), 1);
    let logs = LOCALIZATION_LOGS.lock().unwrap().join("\n");
    for required in [
        "Localization.Translation",
        "translation.started",
        "job=kimi-operational-log",
        "profile=modforge-kimi-real-smoke",
        "model=kimi-for-coding",
        "items=1",
        "latencyMs=",
        "inputTokens=",
        "translation.completed",
    ] {
        assert!(
            logs.contains(required),
            "missing operational log field {required}"
        );
    }
    assert!(!logs.contains(private_marker));
    assert!(!logs.contains(&key));

    let cancel_job = jobs::AiJobGuard::register("kimi-real-cancel").unwrap();
    cancel_ai_job(CancelAiJobRequest {
        job_id: "kimi-real-cancel".into(),
    })
    .unwrap();
    assert!(
        cancel_job
            .check()
            .unwrap_err()
            .to_string()
            .contains("cancelled")
    );

    let cache_entry = AiTranslationCacheEntry {
        scope_key: "real-smoke:mod:description".into(),
        target_locale: "zh-Hans".into(),
        source_hash: "real-smoke-source-hash".into(),
        translated_text: single.items[0].translated_text.clone(),
        provider_profile_id: PROFILE_ID.into(),
        model: single.model,
        updated_at_ms: 1,
    };
    write_ai_translation_cache(cache_entry.clone()).unwrap();
    let cached = read_ai_translation_cache(ReadAiTranslationCacheRequest {
        scope_key: cache_entry.scope_key,
        target_locale: cache_entry.target_locale,
        source_hash: cache_entry.source_hash,
    })
    .unwrap()
    .expect("written translation should be cached");
    assert_eq!(cached.translated_text, cache_entry.translated_text);
    assert_eq!(get_ai_translation_cache_stats().unwrap().entry_count, 1);
    assert_eq!(clear_ai_translation_cache().unwrap().entry_count, 0);

    let cleared_key_snapshot = save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: Some(PROFILE_ID.into()),
        profiles: vec![
            SaveAiProviderProfile {
                api_key: None,
                clear_api_key: true,
                ..profile
            },
            SaveAiProviderProfile {
                api_key: None,
                clear_api_key: true,
                ..anthropic_profile
            },
        ],
    })
    .expect("explicitly clearing the Kimi credential should succeed");
    assert!(!cleared_key_snapshot.profiles[0].key_configured);
    assert!(settings::keychain_password(PROFILE_ID).is_none());
    assert!(settings::keychain_password(ANTHROPIC_PROFILE_ID).is_none());

    save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: None,
        profiles: Vec::new(),
    })
    .expect("removing the real smoke profile should succeed");
    assert!(load_ai_settings().unwrap().profiles.is_empty());
    assert!(settings::keychain_password(PROFILE_ID).is_none());
    assert!(settings::keychain_password(ANTHROPIC_PROFILE_ID).is_none());
}

/// The user's real DeepSeek profile id (preset `deepseek`, model
/// `deepseek-v4-flash`, `https://api.deepseek.com`); its API key is read from
/// the Windows keychain so the smoke test drives the real credential without
/// any secret being embedded in the repo or the test logs.
const REAL_DEEPSEEK_PROFILE_ID: &str = "ae8e94ef-6bc5-4a3f-bda8-a9b38b09a2c9";
const DEEPSEEK_SMOKE_PROFILE_ID: &str = "modforge-deepseek-real-smoke";
const DEEPSEEK_SMOKE_KEY_ENV: &str = "MODFORGE_TEST_DEEPSEEK_KEY";

struct DeepSeekSmokeCleanup {
    root: std::path::PathBuf,
}

impl Drop for DeepSeekSmokeCleanup {
    fn drop(&mut self) {
        let _ = save_ai_settings(SaveAiSettingsRequest {
            default_profile_id: None,
            profiles: Vec::new(),
        });
        let _ = fs::remove_dir_all(&self.root);
        unsafe {
            std::env::remove_var("MODFORGE_TEST_DATA_DIR");
            std::env::remove_var(DEEPSEEK_SMOKE_KEY_ENV);
        }
    }
}

#[test]
#[ignore = "requires the real DeepSeek key in the Windows keychain and makes real DeepSeek API requests"]
fn deepseek_real_backend_json_object_flow() {
    let key = settings::keychain_password(REAL_DEEPSEEK_PROFILE_ID)
        .expect("the real DeepSeek profile credential must be in the Windows keychain");
    let root = std::env::temp_dir().join(format!(
        "modforge-deepseek-real-smoke-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    ));
    unsafe {
        std::env::set_var("MODFORGE_TEST_DATA_DIR", &root);
        std::env::set_var(DEEPSEEK_SMOKE_KEY_ENV, &key);
    }
    let _cleanup = DeepSeekSmokeCleanup { root: root.clone() };

    let snapshot = save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: Some(DEEPSEEK_SMOKE_PROFILE_ID.into()),
        profiles: vec![SaveAiProviderProfile {
            id: DEEPSEEK_SMOKE_PROFILE_ID.into(),
            name: "DeepSeek real smoke".into(),
            preset_id: "deepseek".into(),
            protocol: AiProtocol::OpenaiChatCompletions,
            base_url: "https://api.deepseek.com".into(),
            model: "deepseek-v4-flash".into(),
            credential_environment: Some(DEEPSEEK_SMOKE_KEY_ENV.into()),
            allow_insecure_http: false,
            context_window_tokens: Some(64_000),
            max_output_tokens: None,
            temperature: None,
            top_p: None,
            frequency_penalty: None,
            presence_penalty: None,
            max_batch_bytes: None,
            enable_reasoning: false,
            reasoning_effort: None,
            stream_translation: false,
            api_key: None,
            clear_api_key: false,
        }],
    })
    .expect("saving the DeepSeek smoke profile should succeed");
    assert_eq!(
        snapshot.default_profile_id.as_deref(),
        Some(DEEPSEEK_SMOKE_PROFILE_ID)
    );
    assert_eq!(
        snapshot
            .presets
            .iter()
            .find(|preset| preset.id == "deepseek")
            .expect("deepseek preset must be in the snapshot")
            .structured_output,
        crate::domain::ai::types::AiStructuredOutputCapability::JsonObject
    );

    // Drive the provider layer directly (the sidecar host runtime) with the
    // user's real DeepSeek credentials. The deepseek preset forces
    // `response_format.type = "json_object"`, so success without any
    // structured-output degradation proves the endpoint accepts json_object.
    let profile = crate::domain::ai::settings::resolve_profile(Some(DEEPSEEK_SMOKE_PROFILE_ID))
        .expect("resolving the DeepSeek smoke profile should succeed");
    let job = crate::domain::ai::jobs::AiJobGuard::register("deepseek-real-json-object").unwrap();
    let mut attempts = Vec::new();
    let (items, _reasoning) = crate::domain::ai::providers::translate_observed(
        &profile,
        &crate::domain::ai::types::AiTranslateBatchRequest {
            job_id: "deepseek-real-json-object".into(),
            profile_id: Some(DEEPSEEK_SMOKE_PROFILE_ID.into()),
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![
                AiTranslationItem {
                    id: "greeting".into(),
                    text: "Welcome to Pelican Town, {{player}}!".into(),
                    format: AiTranslationFormat::StardewI18n,
                    context: Some("DeepSeek real smoke greeting".into()),
                },
                AiTranslationItem {
                    id: "quest".into(),
                    text: "Bring {0} parsnips to the Community Center, %s.".into(),
                    format: AiTranslationFormat::StardewI18n,
                    context: Some("DeepSeek real smoke quest".into()),
                },
            ],
            usage_context: None,
            knowledge_policy: crate::domain::ai::types::KnowledgePolicy::default(),
            skip_format_validation: false,
            max_batch_bytes: None,
        },
        &job,
        &mut |attempt| attempts.push(attempt),
        &mut |_| {},
    )
    .expect("the DeepSeek json_object batch should translate successfully");
    assert_eq!(items.len(), 2);
    let greeting = items.iter().find(|item| item.id == "greeting").unwrap();
    let quest = items.iter().find(|item| item.id == "quest").unwrap();
    assert!(
        greeting.translated_text.contains("{{player}}"),
        "placeholder must survive the round trip: {}",
        greeting.translated_text
    );
    assert!(
        quest.translated_text.contains("{0}") && quest.translated_text.contains("%s"),
        "placeholders must survive the round trip: {}",
        quest.translated_text
    );
    for item in &items {
        assert!(
            !item.translated_text.contains('⟦'),
            "sentinel tokens must be restored: {}",
            item.translated_text
        );
    }
    // The batch actually translated: the greeting is no longer English.
    assert!(
        !greeting.translated_text.contains("Welcome to Pelican Town"),
        "the batch must actually translate: {}",
        greeting.translated_text
    );
    // Every provider attempt was forced with json_object (no 400 degradation
    // chain fired, otherwise `structured_output` would read "none").
    assert!(
        attempts
            .iter()
            .all(|attempt| attempt.structured_output.as_deref() == Some("json-object")),
        "deepseek attempts must carry json-object forcing: {attempts:?}"
    );
    // The connection test (one more real call) resolves through the same path.
    let probe = test_ai_profile(crate::domain::ai::types::AiProfileRequest {
        profile_id: DEEPSEEK_SMOKE_PROFILE_ID.into(),
    })
    .expect("the DeepSeek connection test should succeed");
    assert_eq!(probe.model, "deepseek-v4-flash");
}
