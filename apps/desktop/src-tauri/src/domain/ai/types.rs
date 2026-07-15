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
    #[serde(default)]
    pub usage_context: Option<AiUsageContext>,
    #[serde(default)]
    pub knowledge_policy: KnowledgePolicy,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePolicy {
    pub enabled: bool,
    pub use_official_corpus: bool,
    pub use_global_knowledge: bool,
    pub use_project_knowledge: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTrace {
    pub official_matches: u64,
    pub global_glossary_matches: u64,
    pub project_glossary_matches: u64,
    pub translation_memory_matches: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageContext {
    pub page_source: String,
    pub operation: String,
    #[serde(default)]
    pub scope_id: Option<String>,
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
    pub usage_record_state: String,
    pub knowledge_trace: KnowledgeTrace,
    pub knowledge_revision: String,
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
    pub provider: String,
    pub protocol: AiProtocol,
    pub base_url: String,
    pub model: String,
    pub latency_ms: u128,
    pub credential_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiProfileImportConflictPolicy {
    Overwrite,
    Copy,
    Skip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAiProfilesRequest {
    pub destination_path: String,
    #[serde(default)]
    pub profile_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAiProfilesImportRequest {
    pub source_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyAiProfilesImportRequest {
    pub source_path: String,
    pub conflict_policy: AiProfileImportConflictPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileImportPreviewEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    pub conflicts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileImportPreview {
    pub format_version: u32,
    pub credentials_excluded: bool,
    pub entries: Vec<AiProfileImportPreviewEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfileImportResult {
    pub settings: AiSettingsSnapshot,
    pub imported: u32,
    pub overwritten: u32,
    pub copied: u32,
    pub skipped: u32,
}
