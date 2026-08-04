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

#[test]
fn capability_table_maps_every_preset_to_a_structured_output_level() {
    use super::AiStructuredOutputCapability::{
        JsonObject, JsonSchema, None as NoStructuredOutput, ToolUse,
    };
    let by_id = provider_presets()
        .into_iter()
        .map(|preset| (preset.id, preset.structured_output))
        .collect::<std::collections::BTreeMap<_, _>>();
    let expectations = [
        // OpenAI Responses: strict JSON Schema via `text.format`.
        ("openai", JsonSchema),
        // Anthropic: forced tool_use via tool_choice.
        ("anthropic", ToolUse),
        // OpenAI-compatible endpoints documented to accept json_schema.
        ("gemini", JsonSchema),
        ("openrouter", JsonSchema),
        ("xai", JsonSchema),
        ("mistral", JsonSchema),
        // Official DeepSeek API only accepts json_object (json_schema -> 400).
        ("deepseek", JsonObject),
        // OpenAI-compatible endpoints without a confirmed json_schema mode:
        // conservative json_object forcing.
        ("groq", JsonObject),
        ("moonshot", JsonObject),
        ("qwen-cn", JsonObject),
        ("qwen-intl", JsonObject),
        ("zhipu", JsonObject),
        ("siliconflow-cn", JsonObject),
        ("siliconflow-intl", JsonObject),
        // Local/unknown endpoints probe without a forcing parameter first.
        ("ollama", NoStructuredOutput),
        ("lm-studio", NoStructuredOutput),
        ("custom", NoStructuredOutput),
    ];
    for (preset_id, expected) in expectations {
        assert_eq!(
            by_id.get(preset_id).copied(),
            Some(expected),
            "preset {preset_id} capability mismatch"
        );
    }
}
