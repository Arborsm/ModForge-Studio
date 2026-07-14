use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiProtocol {
    OpenaiResponses,
    OpenaiChatCompletions,
    AnthropicMessages,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiStructuredOutputCapability {
    JsonSchema,
    JsonObject,
    StrictJsonPrompt,
    AnthropicTool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiAuthentication {
    Bearer,
    AnthropicApiKey,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderPreset {
    pub id: String,
    pub name: String,
    pub protocol: AiProtocol,
    pub base_url: String,
    pub credential_environment: Option<String>,
    pub requires_api_key: bool,
    pub authentication: AiAuthentication,
    pub supports_model_listing: bool,
    pub structured_output: AiStructuredOutputCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderProfile {
    pub id: String,
    pub name: String,
    pub preset_id: String,
    pub protocol: AiProtocol,
    pub base_url: String,
    pub model: String,
    pub credential_environment: Option<String>,
    pub key_configured: bool,
    pub resolved_credential_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsSnapshot {
    pub version: u32,
    pub default_profile_id: Option<String>,
    pub profiles: Vec<AiProviderProfile>,
    pub presets: Vec<AiProviderPreset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiProviderProfile {
    pub id: String,
    pub name: String,
    pub preset_id: String,
    pub protocol: AiProtocol,
    pub base_url: String,
    pub model: String,
    pub credential_environment: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSettingsRequest {
    pub default_profile_id: Option<String>,
    pub profiles: Vec<SaveAiProviderProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileRequest {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelInfo {
    pub id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiTranslationFormat {
    PlainText,
    NexusBbcodeText,
    StardewI18n,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationItem {
    pub id: String,
    pub text: String,
    pub format: AiTranslationFormat,
    #[serde(default)]
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslateBatchRequest {
    pub job_id: String,
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub source_locale: Option<String>,
    pub target_locale: String,
    pub items: Vec<AiTranslationItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationResultItem {
    pub id: String,
    pub translated_text: String,
    pub detected_language: Option<String>,
    pub skipped_same_language: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslateBatchResult {
    pub job_id: String,
    pub profile_id: String,
    pub model: String,
    pub items: Vec<AiTranslationResultItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelAiJobRequest {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationProgressPayload {
    pub job_id: String,
    pub completed: usize,
    pub total: usize,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAiTranslationCacheRequest {
    pub scope_key: String,
    pub target_locale: String,
    pub source_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationCacheEntry {
    pub scope_key: String,
    pub target_locale: String,
    pub source_hash: String,
    pub translated_text: String,
    pub provider_profile_id: String,
    pub model: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationCacheStats {
    pub entry_count: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileTestResult {
    pub model: String,
    pub latency_ms: u128,
}
