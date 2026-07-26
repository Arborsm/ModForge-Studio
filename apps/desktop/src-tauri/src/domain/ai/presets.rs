use super::types::{AiAuthentication, AiProtocol, AiProviderPreset, AiStructuredOutputCapability};

fn preset(
    id: &str,
    name: &str,
    protocol: AiProtocol,
    base_url: &str,
    environment: Option<&str>,
    requires_api_key: bool,
    supports_model_listing: bool,
    structured_output: AiStructuredOutputCapability,
) -> AiProviderPreset {
    let authentication = if !requires_api_key {
        AiAuthentication::None
    } else if protocol == AiProtocol::AnthropicMessages {
        AiAuthentication::AnthropicApiKey
    } else {
        AiAuthentication::Bearer
    };
    AiProviderPreset {
        id: id.into(),
        name: name.into(),
        protocol,
        base_url: base_url.into(),
        credential_environment: environment.map(str::to_string),
        requires_api_key,
        authentication,
        supports_model_listing,
        structured_output,
    }
}

pub(crate) fn provider_presets() -> Vec<AiProviderPreset> {
    use AiProtocol::{AnthropicMessages, OpenaiChatCompletions, OpenaiResponses};
    use AiStructuredOutputCapability::{AnthropicTool, JsonObject, JsonSchema, StrictJsonPrompt};
    vec![
        preset(
            "openai",
            "OpenAI",
            OpenaiResponses,
            "https://api.openai.com/v1",
            Some("OPENAI_API_KEY"),
            true,
            true,
            JsonSchema,
        ),
        preset(
            "anthropic",
            "Anthropic",
            AnthropicMessages,
            "https://api.anthropic.com/v1",
            Some("ANTHROPIC_API_KEY"),
            true,
            true,
            AnthropicTool,
        ),
        preset(
            "gemini",
            "Google Gemini",
            OpenaiChatCompletions,
            "https://generativelanguage.googleapis.com/v1beta/openai",
            Some("GEMINI_API_KEY"),
            true,
            true,
            JsonSchema,
        ),
        preset(
            "deepseek",
            "DeepSeek",
            OpenaiChatCompletions,
            "https://api.deepseek.com",
            Some("DEEPSEEK_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "openrouter",
            "OpenRouter",
            OpenaiChatCompletions,
            "https://openrouter.ai/api/v1",
            Some("OPENROUTER_API_KEY"),
            true,
            true,
            JsonSchema,
        ),
        preset(
            "xai",
            "xAI",
            OpenaiChatCompletions,
            "https://api.x.ai/v1",
            Some("XAI_API_KEY"),
            true,
            true,
            JsonSchema,
        ),
        preset(
            "mistral",
            "Mistral AI",
            OpenaiChatCompletions,
            "https://api.mistral.ai/v1",
            Some("MISTRAL_API_KEY"),
            true,
            true,
            JsonSchema,
        ),
        preset(
            "groq",
            "Groq",
            OpenaiChatCompletions,
            "https://api.groq.com/openai/v1",
            Some("GROQ_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "moonshot",
            "Moonshot / Kimi",
            OpenaiChatCompletions,
            "https://api.moonshot.cn/v1",
            Some("MOONSHOT_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "qwen-cn",
            "Qwen (China)",
            OpenaiChatCompletions,
            "https://dashscope.aliyuncs.com/compatible-mode/v1",
            Some("DASHSCOPE_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "qwen-intl",
            "Qwen (International)",
            OpenaiChatCompletions,
            "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
            Some("DASHSCOPE_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "zhipu",
            "Zhipu GLM",
            OpenaiChatCompletions,
            "https://open.bigmodel.cn/api/paas/v4",
            Some("ZHIPU_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "siliconflow-cn",
            "SiliconFlow (China)",
            OpenaiChatCompletions,
            "https://api.siliconflow.cn/v1",
            Some("SILICONFLOW_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "siliconflow-intl",
            "SiliconFlow (International)",
            OpenaiChatCompletions,
            "https://api.siliconflow.com/v1",
            Some("SILICONFLOW_API_KEY"),
            true,
            true,
            JsonObject,
        ),
        preset(
            "ollama",
            "Ollama",
            OpenaiChatCompletions,
            "http://127.0.0.1:11434/v1",
            None,
            false,
            true,
            JsonObject,
        ),
        preset(
            "lm-studio",
            "LM Studio",
            OpenaiChatCompletions,
            "http://127.0.0.1:1234/v1",
            None,
            false,
            true,
            JsonSchema,
        ),
        preset(
            "custom",
            "Custom",
            OpenaiChatCompletions,
            "https://",
            None,
            true,
            false,
            StrictJsonPrompt,
        ),
    ]
}

pub(crate) fn provider_preset(id: &str) -> Option<AiProviderPreset> {
    provider_presets()
        .into_iter()
        .find(|preset| preset.id == id)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/presets_tests.rs"]
mod tests;
