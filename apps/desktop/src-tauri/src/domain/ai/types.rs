use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiProtocol {
    OpenaiResponses,
    OpenaiChatCompletions,
    AnthropicMessages,
}

/// How strongly a provider can enforce structured output at the decode layer.
///
/// The product treats these as the four canonical capability levels; the
/// request builders in `providers` translate each level into the concrete wire
/// parameter (see the capability table in `presets` for per-provider sources):
///
/// - `JsonSchema`: the endpoint accepts an OpenAI-style strict JSON Schema
///   (`response_format.type = "json_schema"` for chat completions, `text.format`
///   for the Responses API). Decoding guarantees field names/types.
/// - `JsonObject`: the endpoint accepts `response_format.type = "json_object"`
///   only, which guarantees valid JSON but not the shape. The prompt must
///   contain the literal word "json" for these providers.
/// - `ToolUse`: the endpoint is Anthropic-style and forces a `tool_use` block
///   via `tool_choice`.
/// - `None`: no forcing parameter is sent; structure is requested through the
///   prompt alone (the wire stays plain text). Used for local/unknown endpoints
///   that reject `response_format` (ollama/lm-studio/custom probe first).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiStructuredOutputCapability {
    JsonSchema,
    JsonObject,
    ToolUse,
    None,
}

impl AiStructuredOutputCapability {
    /// Kebab-case wire value used in the settings snapshot and the operational
    /// ledger (`provider.attempt.structuredOutput`).
    pub fn as_str(self) -> &'static str {
        match self {
            AiStructuredOutputCapability::JsonSchema => "json-schema",
            AiStructuredOutputCapability::JsonObject => "json-object",
            AiStructuredOutputCapability::ToolUse => "tool-use",
            AiStructuredOutputCapability::None => "none",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiAuthentication {
    Bearer,
    AnthropicApiKey,
    None,
}

/// Reasoning effort dial for providers that expose a chain-of-thought strength
/// control. `None` means the provider default.
///
/// Wire values are kebab-case and documented per provider:
/// - OpenAI (chat-completions `reasoning_effort` / Responses `reasoning.effort`)
///   supports `low`/`medium`/`high`/`xhigh`/`max` (model-dependent subset; older
///   models may only accept up to `high`).
/// - DeepSeek has no effort dial in this product; thinking is a boolean toggle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ReasoningEffort {
    Low,
    Medium,
    High,
    Xhigh,
    Max,
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
    #[serde(default)]
    pub allow_insecure_http: bool,
    /// Explicit context window override in tokens. `None` inherits the model
    /// metadata or the safe default during batch budgeting.
    #[serde(default)]
    pub context_window_tokens: Option<u64>,
    /// Optional generation parameters; `None` means the provider default.
    #[serde(default)]
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub top_p: Option<f64>,
    #[serde(default)]
    pub frequency_penalty: Option<f64>,
    #[serde(default)]
    pub presence_penalty: Option<f64>,
    /// Per-batch input byte cap override for translation batching. `None`
    /// derives the budget from the context window; the value is bounded by the
    /// backend's 256 KB hard cap during validation.
    #[serde(default)]
    pub max_batch_bytes: Option<u64>,
    /// Requests provider reasoning (chain-of-thought) when the protocol and
    /// provider support it. Anthropic is not supported in the first version.
    #[serde(default)]
    pub enable_reasoning: bool,
    /// Reasoning effort dial; `None` uses the provider default.
    #[serde(default)]
    pub reasoning_effort: Option<ReasoningEffort>,
    /// Streams translation deltas over the host event channel while the batch
    /// is generated. The final result is still produced through the full
    /// parse-and-validate path, so streaming only accelerates display.
    #[serde(default)]
    pub stream_translation: bool,
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
    pub allow_insecure_http: bool,
    #[serde(default)]
    pub context_window_tokens: Option<u64>,
    #[serde(default)]
    pub max_output_tokens: Option<u64>,
    #[serde(default)]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub top_p: Option<f64>,
    #[serde(default)]
    pub frequency_penalty: Option<f64>,
    #[serde(default)]
    pub presence_penalty: Option<f64>,
    #[serde(default)]
    pub max_batch_bytes: Option<u64>,
    #[serde(default)]
    pub enable_reasoning: bool,
    #[serde(default)]
    pub reasoning_effort: Option<ReasoningEffort>,
    #[serde(default)]
    pub stream_translation: bool,
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
    /// Context window in tokens when the provider response or the models.dev
    /// catalog provides it; `None` when unknown.
    #[serde(default)]
    pub context_window_tokens: Option<u64>,
}

/// A single model inside the models.dev catalog.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelsDevModel {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub context_window_tokens: Option<u64>,
    #[serde(default)]
    pub max_output_tokens: Option<u64>,
}

/// One provider inside the models.dev catalog (e.g. `openai`, `anthropic`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelsDevProvider {
    pub id: String,
    pub name: String,
    pub models: Vec<ModelsDevModel>,
}

/// Parsed and normalized models.dev catalog with a fetch timestamp used by the
/// disk cache TTL.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelsDevCatalog {
    pub fetched_at_ms: i64,
    pub providers: Vec<ModelsDevProvider>,
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
    /// Skips the placeholder multiset comparison when validating provider
    /// output. Item id uniqueness, id/count parity and omission checks always
    /// stay enabled because the frontend reassembles chunks by id.
    #[serde(default)]
    pub skip_format_validation: bool,
    /// Per-batch input byte cap override (bounded by the 256 KB hard cap).
    #[serde(default)]
    pub max_batch_bytes: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePolicy {
    pub enabled: bool,
    pub use_official_corpus: bool,
    pub use_global_knowledge: bool,
    pub use_profile_knowledge: bool,
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
    /// Provider chain-of-thought text for this batch when reasoning was enabled
    /// and the provider returned it; `None` otherwise.
    #[serde(default)]
    pub reasoning: Option<String>,
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

/// One incremental translation delta emitted over `ai://translation-stream`
/// while a streaming batch is generated. `kind` is `content` (the translation
/// JSON text) or `reasoning` (provider chain-of-thought).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationStreamPayload {
    pub job_id: String,
    pub kind: String,
    pub delta: String,
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
    /// Provider chain-of-thought text returned by the connection probe when the
    /// profile enables reasoning; `None` otherwise.
    #[serde(default)]
    pub reasoning: Option<String>,
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
