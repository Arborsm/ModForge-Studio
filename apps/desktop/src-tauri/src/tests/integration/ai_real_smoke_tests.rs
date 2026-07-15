use super::*;
use crate::domain::ai::types::{
    AiProtocol, AiTranslationCacheEntry, AiTranslationFormat, AiTranslationItem,
    CancelAiJobRequest, ReadAiTranslationCacheRequest, SaveAiProviderProfile,
};
use std::fs;
use std::sync::{Arc, Mutex};

const PROFILE_ID: &str = "modforge-kimi-real-smoke";
const ANTHROPIC_PROFILE_ID: &str = "modforge-kimi-anthropic-real-smoke";

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
