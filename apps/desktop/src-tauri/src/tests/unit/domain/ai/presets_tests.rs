use super::*;

#[test]
fn gemini_uses_google_openai_compatibility_endpoint() {
    let preset = provider_presets()
        .into_iter()
        .find(|preset| preset.id == "gemini")
        .unwrap();
    assert_eq!(preset.protocol, AiProtocol::OpenaiChatCompletions);
    assert_eq!(preset.authentication, AiAuthentication::Bearer);
    assert_eq!(
        preset.base_url,
        "https://generativelanguage.googleapis.com/v1beta/openai"
    );
    assert!(
        provider_presets()
            .iter()
            .all(|preset| !preset.id.contains("generate-content"))
    );
}

#[test]
fn contains_the_supported_provider_catalog_without_model_defaults() {
    let ids = provider_presets()
        .into_iter()
        .map(|preset| preset.id)
        .collect::<std::collections::BTreeSet<_>>();
    for id in [
        "openai",
        "anthropic",
        "gemini",
        "deepseek",
        "openrouter",
        "xai",
        "mistral",
        "groq",
        "moonshot",
        "qwen-cn",
        "qwen-intl",
        "zhipu",
        "siliconflow-cn",
        "siliconflow-intl",
        "ollama",
        "lm-studio",
        "custom",
    ] {
        assert!(ids.contains(id), "missing preset {id}");
    }
}
