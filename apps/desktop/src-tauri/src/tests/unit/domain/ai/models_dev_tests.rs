use super::*;
use crate::domain::ai::types::{ModelsDevCatalog, ModelsDevModel, ModelsDevProvider};
use serde_json::json;

#[test]
fn parses_provider_model_and_limit_metadata() {
    let value = json!({
        "openai": {
            "name": "OpenAI",
            "models": {
                "gpt-4o": {
                    "name": "GPT-4o",
                    "limit": {"context": 128000, "output": 16384}
                },
                "gpt-4o-mini": {
                    "name": "GPT-4o mini",
                    "limit": {"context": 128000}
                },
                "o1-preview": {
                    "name": "o1 preview",
                    "limit": {"context": 128000, "output": null}
                }
            }
        },
        "anthropic": {
            "name": "Anthropic",
            "models": {
                "claude-3-5-sonnet-20241022": {
                    "name": "Claude 3.5 Sonnet",
                    "limit": {"context": 200000, "output": 8192}
                }
            }
        }
    });
    let catalog = parse_models_dev_catalog(&value).unwrap();
    assert_eq!(catalog.providers.len(), 2);
    let openai = catalog
        .providers
        .iter()
        .find(|provider| provider.id == "openai")
        .unwrap();
    assert_eq!(openai.name, "OpenAI");
    let gpt4o = openai
        .models
        .iter()
        .find(|model| model.id == "gpt-4o")
        .unwrap();
    assert_eq!(gpt4o.name.as_deref(), Some("GPT-4o"));
    assert_eq!(gpt4o.context_window_tokens, Some(128000));
    assert_eq!(gpt4o.max_output_tokens, Some(16384));
    let mini = openai
        .models
        .iter()
        .find(|model| model.id == "gpt-4o-mini")
        .unwrap();
    assert_eq!(mini.context_window_tokens, Some(128000));
    assert_eq!(mini.max_output_tokens, None);
    let o1 = openai
        .models
        .iter()
        .find(|model| model.id == "o1-preview")
        .unwrap();
    // `output: null` must not be coerced into a limit.
    assert_eq!(o1.max_output_tokens, None);
}

#[test]
fn drops_malformed_entries_and_sorts_output() {
    let value = json!({
        "zzz": {
            "name": "Zed",
            "models": {"m2": {"name": "M2", "limit": {"context": 2}}, "m1": {"name": "M1", "limit": {"context": 1}}}
        },
        "aaa": {
            "models": {"b": {"limit": {"context": 100}}, "a": {"name": "A", "limit": {"context": 50}}}
        },
        "broken": "not-an-object",
        "empty": {"name": "Empty", "models": {}}
    });
    let catalog = parse_models_dev_catalog(&value).unwrap();
    // Providers without any models are still kept; they simply surface no
    // searchable entries.
    assert_eq!(
        catalog
            .providers
            .iter()
            .map(|provider| provider.id.as_str())
            .collect::<Vec<_>>(),
        vec!["aaa", "empty", "zzz"]
    );
    let aaa = catalog
        .providers
        .iter()
        .find(|provider| provider.id == "aaa")
        .unwrap();
    // Provider without a name falls back to its id; models are sorted by id.
    assert_eq!(aaa.name, "aaa");
    assert_eq!(
        aaa.models
            .iter()
            .map(|model| model.id.as_str())
            .collect::<Vec<_>>(),
        vec!["a", "b"]
    );
}

#[test]
fn rejects_empty_and_non_object_documents() {
    assert!(parse_models_dev_catalog(&json!({})).is_err());
    assert!(parse_models_dev_catalog(&json!([])).is_err());
    assert!(parse_models_dev_catalog(&json!("catalog")).is_err());
}

#[test]
fn cached_context_window_reads_memory_cache_without_network() {
    let catalog = ModelsDevCatalog {
        fetched_at_ms: now_ms(),
        providers: vec![ModelsDevProvider {
            id: "openai".into(),
            name: "OpenAI".into(),
            models: vec![ModelsDevModel {
                id: "gpt-4o".into(),
                name: Some("GPT-4o".into()),
                context_window_tokens: Some(128000),
                max_output_tokens: Some(16384),
            }],
        }],
    };
    {
        let mut cache = memory_cache().lock().unwrap();
        *cache = Some((catalog.fetched_at_ms, catalog));
    }
    assert_eq!(cached_context_window("openai", "gpt-4o"), Some(128000));
    assert_eq!(cached_context_window("openai", "unknown"), None);
    assert_eq!(cached_context_window("unknown", "gpt-4o"), None);
    {
        let mut cache = memory_cache().lock().unwrap();
        *cache = None;
    }
}

#[test]
fn disk_cache_is_reused_until_ttl_expires() {
    let _guard = crate::test_support::process_environment_lock();
    let root = std::env::temp_dir().join(format!(
        "modforge-models-dev-cache-{}",
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let path = disk_cache_path().unwrap();
    let catalog = ModelsDevCatalog {
        fetched_at_ms: now_ms(),
        providers: vec![ModelsDevProvider {
            id: "ollama".into(),
            name: "Ollama".into(),
            models: vec![ModelsDevModel {
                id: "qwen2.5:7b".into(),
                name: None,
                context_window_tokens: Some(32768),
                max_output_tokens: None,
            }],
        }],
    };
    write_disk_cache(&path, &catalog);
    assert!(path.is_file());
    let loaded = read_disk_cache(&path).expect("fresh disk cache should load");
    assert_eq!(
        loaded.providers[0].models[0].context_window_tokens,
        Some(32768)
    );

    // An expired cache is dropped and re-fetched on the next read.
    let stale = ModelsDevCatalog {
        fetched_at_ms: now_ms() - DISK_TTL_MS - 1,
        ..catalog
    };
    write_disk_cache(&path, &stale);
    assert!(read_disk_cache(&path).is_none());
    assert!(!path.exists());

    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = std::fs::remove_dir_all(root);
}

/// Live verification that the parser still understands the current models.dev
/// document shape. Ignored by default; run with
/// `cargo test --lib domain::ai::models_dev::tests::live -- --ignored`.
#[test]
#[ignore = "fetches https://models.dev/api.json over the network"]
fn live_models_dev_catalog_parses() {
    let catalog = fetch_models_dev_catalog().expect("live models.dev fetch should parse");
    assert!(!catalog.providers.is_empty());
    let openai = catalog
        .providers
        .iter()
        .find(|provider| provider.id == "openai")
        .expect("the live catalog should contain OpenAI");
    assert!(openai.models.iter().any(|model| model.id == "gpt-4o"));
    let gpt4o = openai
        .models
        .iter()
        .find(|model| model.id == "gpt-4o")
        .unwrap();
    assert_eq!(gpt4o.context_window_tokens, Some(128000));
    assert_eq!(gpt4o.max_output_tokens, Some(16384));
}
