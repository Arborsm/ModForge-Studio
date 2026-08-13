use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageEvent {
    pub occurred_at_ms: i64,
    pub job_id: String,
    pub attempt: u32,
    pub page_source: String,
    pub operation: String,
    pub engine_kind: String,
    pub profile_id: Option<String>,
    pub provider: String,
    pub model: Option<String>,
    pub scope_id: Option<String>,
    pub succeeded: bool,
    pub latency_ms: u64,
    pub failure_category: Option<String>,
    pub request_items: u64,
    pub request_characters: u64,
    pub response_characters: u64,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_tokens: Option<u64>,
    pub reasoning_tokens: Option<u64>,
    pub billed_characters: Option<u64>,
    pub usage_source: String,
    #[serde(default)]
    pub job_succeeded: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageQuery {
    pub from_ms: i64,
    pub to_ms: i64,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub failure_category: Option<String>,
    #[serde(default)]
    pub usage_facet: Option<String>,
    pub profile_id: Option<String>,
    pub model: Option<String>,
    pub operation: Option<String>,
    pub engine_kind: Option<String>,
    pub scope_id: Option<String>,
    pub succeeded: Option<bool>,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_page_size")]
    pub limit: u32,
}

fn default_page_size() -> u32 {
    100
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageTotals {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub billed_characters: u64,
    pub request_characters: u64,
    pub response_characters: u64,
    pub requests: u64,
    pub failures: u64,
    pub unavailable_usage_requests: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageDailySummary {
    pub date: String,
    pub engine_kind: String,
    pub profile_id: Option<String>,
    pub operation: String,
    pub scope_id: Option<String>,
    pub totals: AiUsageTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageSummary {
    pub totals: AiUsageTotals,
    pub daily: Vec<AiUsageDailySummary>,
    pub diagnostics: AiUsageDiagnostics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageProviderModelSummary {
    pub provider: String,
    pub model: Option<String>,
    pub attempts: u64,
    pub failures: u64,
    pub average_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageFailureCategorySummary {
    pub category: String,
    pub attempts: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageDiagnostics {
    pub average_latency_ms: f64,
    pub p95_latency_ms: u64,
    pub attempt_success_rate: f64,
    pub jobs: u64,
    pub successful_jobs: u64,
    pub job_success_rate: f64,
    pub cache_eligible_requests: u64,
    pub cache_hit_requests: u64,
    pub cache_hit_rate: f64,
    pub token_unavailable_requests: u64,
    pub detail_from_ms: i64,
    pub detail_complete: bool,
    pub provider_models: Vec<AiUsageProviderModelSummary>,
    pub failure_categories: Vec<AiUsageFailureCategorySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageRecordPage {
    pub records: Vec<AiUsageEvent>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageExportRequest {
    pub query: AiUsageQuery,
    pub destination_path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiUsageClearMode {
    DetailOlderThan90Days,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageClearRequest {
    pub mode: AiUsageClearMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageClearResult {
    pub removed_events: u64,
    pub removed_daily_rows: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectOfficialLocalizationIndexRequest {
    pub game_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildOfficialLocalizationIndexRequest {
    pub job_id: String,
    pub game_directory: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOfficialIndexProgress {
    pub job_id: String,
    pub phase: String,
    pub completed: u64,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchOfficialLocalizationRequest {
    pub source_locale: String,
    pub target_locale: String,
    pub query: String,
    pub asset_category: Option<String>,
    pub unit_kind: Option<String>,
    pub prompt_eligible_only: bool,
    #[serde(default)]
    pub allow_literal_scan: bool,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_page_size")]
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOfficialCorpusStatus {
    pub indexed: bool,
    pub stale: bool,
    pub game_directory: String,
    pub game_version: Option<String>,
    pub fingerprint: String,
    pub revision: Option<String>,
    pub updated_at_ms: Option<i64>,
    pub language_count: u64,
    pub unit_count: u64,
    pub semantic_eligible_count: u64,
    pub error_count: u64,
}

/// Component-level readiness of the localization corpus that AI translation
/// depends on. Each component is one of `ready` (initialized and usable),
/// `skipped` (not applicable for the current configuration), or `failed`
/// (initialization attempted but errored; the frontend should surface retry).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationCorpusWarmupStatus {
    pub knowledge: String,
    pub semantic: String,
    pub official: String,
    pub ready: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOfficialUnit {
    pub id: i64,
    pub source_locale: String,
    pub target_locale: String,
    pub source_text: String,
    pub target_text: String,
    pub asset_path: String,
    pub unit_key: String,
    pub unit_kind: String,
    pub searchable: bool,
    pub semantic_eligible: bool,
    pub prompt_eligible: bool,
    pub fingerprint: String,
    pub similarity: f64,
    pub score: f64,
    pub semantic_similarity: Option<f64>,
    pub lexical_similarity: f64,
    pub match_kind: String,
    pub retrieval_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOfficialSearchPage {
    pub records: Vec<AiOfficialUnit>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveLocalizationScopeRequest {
    pub binding_kind: String,
    pub binding_value: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeLocalizationPlanRequest {
    pub job_id: String,
    pub binding_kind: String,
    pub binding_value: String,
    pub plan_name: String,
    pub source_locale: String,
    pub target_locale: String,
    pub file_namespace: String,
    pub import_existing: bool,
    pub entries: Vec<ConfirmedTranslation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitializeLocalizationPlanResult {
    pub snapshot: AiLocalizationScopeSnapshot,
    pub imported_count: u64,
    pub knowledge_revision: String,
    pub semantic_index_state: String,
    pub semantic_index_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectLocalizationContextRequest {
    pub scope_id: String,
    pub source_locale: String,
    pub target_locale: String,
    pub source_text: String,
    pub unit_key: Option<String>,
    pub game_directory: Option<String>,
    pub knowledge_policy: crate::domain::ai::types::KnowledgePolicy,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationContextTrace {
    pub official_indexed: bool,
    pub official_matches: u64,
    pub global_glossary_matches: u64,
    pub profile_glossary_matches: u64,
    pub translation_memory_matches: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationContextInspection {
    pub glossary: Vec<AiGlossaryEntry>,
    pub memory: Vec<AiTranslationMemoryEntry>,
    pub official: Vec<AiOfficialUnit>,
    pub style: Option<AiStyleGuide>,
    pub knowledge_revision: String,
    pub trace: LocalizationContextTrace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLocalizationScopeRequest {
    pub scope_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLocalizationScopeBinding {
    pub kind: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLocalizationScope {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub revision: u64,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub last_used_at_ms: i64,
    pub bindings: Vec<AiLocalizationScopeBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationScopeSettings {
    pub scope_id: String,
    pub default_engine_kind: Option<String>,
    pub default_engine_profile_id: Option<String>,
    pub review_profile_id: Option<String>,
    pub knowledge_policy: crate::domain::ai::types::KnowledgePolicy,
    pub auto_review: bool,
    #[serde(default)]
    pub qa_config: AiQaConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiQaConfig {
    pub check_empty: bool,
    pub check_language_mix: bool,
    pub check_whitespace: bool,
    pub check_line_breaks: bool,
    pub check_length: bool,
}
impl Default for AiQaConfig {
    fn default() -> Self {
        Self {
            check_empty: true,
            check_language_mix: true,
            check_whitespace: true,
            check_line_breaks: true,
            check_length: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLocalizationScopeSnapshot {
    pub scope: AiLocalizationScope,
    pub settings: LocalizationScopeSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLocalizationScopeSettingsRequest {
    pub settings: LocalizationScopeSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListLocalizationScopesRequest {
    pub query: Option<String>,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_page_size")]
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLocalizationScopePage {
    pub records: Vec<AiLocalizationScope>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGlossaryEntry {
    pub id: String,
    pub scope_id: String,
    pub source_locale: String,
    pub target_locale: String,
    pub source_term: String,
    pub target_term: String,
    pub match_mode: String,
    pub do_not_translate: bool,
    pub notes: String,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertLocalizationGlossaryEntriesRequest {
    pub scope_id: String,
    pub entries: Vec<AiGlossaryEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteLocalizationEntriesRequest {
    pub scope_id: String,
    pub ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyTranslationMemoryEntriesRequest {
    pub source_scope_id: String,
    pub target_scope_id: String,
    pub ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchLocalizationKnowledgeRequest {
    pub scope_id: String,
    pub source_locale: Option<String>,
    pub target_locale: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_page_size")]
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGlossaryPage {
    pub records: Vec<AiGlossaryEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStyleGuide {
    pub scope_id: String,
    pub target_locale: String,
    pub tone: String,
    pub audience: String,
    pub formality: String,
    pub forbidden_phrases: Vec<String>,
    pub preferred_phrases: Vec<String>,
    pub rules: Vec<String>,
    pub updated_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLocalizationStyleGuideRequest {
    pub scope_id: String,
    pub target_locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationMemoryEntry {
    pub id: String,
    pub scope_id: String,
    pub source_locale: String,
    pub target_locale: String,
    pub source_text: String,
    pub target_text: String,
    pub source_kind: String,
    pub file_namespace: Option<String>,
    pub unit_key: Option<String>,
    pub confirmed_at_ms: i64,
    pub use_count: u64,
    pub similarity: f64,
    pub score: f64,
    pub semantic_similarity: Option<f64>,
    pub lexical_similarity: f64,
    pub match_kind: String,
    pub retrieval_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTranslationMemoryPage {
    pub records: Vec<AiTranslationMemoryEntry>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmedTranslation {
    pub source_locale: String,
    pub target_locale: String,
    pub source_text: String,
    pub target_text: String,
    pub file_namespace: String,
    pub unit_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordConfirmedTranslationsRequest {
    pub job_id: String,
    pub scope_id: String,
    pub file_namespace: String,
    pub entries: Vec<ConfirmedTranslation>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LocalizationKnowledgeFormat {
    KnowledgePackJson,
    GlossaryCsv,
    TranslationMemoryTmx,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLocalizationKnowledgeRequest {
    pub job_id: String,
    pub scope_id: String,
    pub source_path: String,
    pub format: LocalizationKnowledgeFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportLocalizationKnowledgeRequest {
    pub scope_id: String,
    pub destination_path: String,
    pub format: LocalizationKnowledgeFormat,
    pub source_locale: Option<String>,
    pub target_locale: Option<String>,
    #[serde(default)]
    pub query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationKnowledgeTransferResult {
    pub glossary_count: u64,
    pub memory_count: u64,
    pub style_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MachineTranslationProtocol {
    Deepl,
    GoogleBasicV2,
    MicrosoftV3,
    BaiduGeneral,
    TencentTmt,
    LibreTranslate,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationCapability {
    pub languages_dynamic: bool,
    pub max_item_characters: u64,
    pub max_batch_characters: u64,
    pub supports_html: bool,
    pub supports_glossary: bool,
    pub usage_capability: String,
    pub authentication: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationPreset {
    pub id: String,
    pub name: String,
    pub protocol: MachineTranslationProtocol,
    pub base_url: String,
    pub credential_fields: Vec<String>,
    pub capability: MachineTranslationCapability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationProfile {
    pub id: String,
    pub name: String,
    pub preset_id: String,
    pub protocol: MachineTranslationProtocol,
    pub base_url: String,
    pub region: Option<String>,
    pub enabled: bool,
    pub default_source_locale: Option<String>,
    pub default_target_locale: Option<String>,
    pub credential_environments: std::collections::BTreeMap<String, String>,
    pub credential_sources: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationSettingsSnapshot {
    pub version: u32,
    pub default_profile_id: Option<String>,
    pub profiles: Vec<MachineTranslationProfile>,
    pub presets: Vec<MachineTranslationPreset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMachineTranslationProfile {
    pub id: String,
    pub name: String,
    pub preset_id: String,
    pub protocol: MachineTranslationProtocol,
    pub base_url: String,
    pub region: Option<String>,
    pub enabled: bool,
    pub default_source_locale: Option<String>,
    pub default_target_locale: Option<String>,
    #[serde(default)]
    pub credential_environments: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub credentials: std::collections::BTreeMap<String, String>,
    #[serde(default)]
    pub clear_credentials: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMachineTranslationSettingsRequest {
    pub default_profile_id: Option<String>,
    pub profiles: Vec<SaveMachineTranslationProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationProfileRequest {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationLanguage {
    pub code: String,
    pub name: String,
    pub supports_source: bool,
    pub supports_target: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationProfileTestResult {
    pub latency_ms: u128,
    pub detected_language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationItem {
    pub id: String,
    pub text: String,
    pub format: crate::domain::ai::types::AiTranslationFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslateBatchRequest {
    pub job_id: String,
    pub profile_id: Option<String>,
    pub source_locale: Option<String>,
    pub target_locale: String,
    pub items: Vec<MachineTranslationItem>,
    pub usage_context: Option<crate::domain::ai::types::AiUsageContext>,
    #[serde(default)]
    pub knowledge_policy: crate::domain::ai::types::KnowledgePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslationResultItem {
    pub id: String,
    pub translated_text: String,
    pub detected_language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineTranslateBatchResult {
    pub job_id: String,
    pub profile_id: String,
    pub items: Vec<MachineTranslationResultItem>,
    pub validation_issues: Vec<LocalizationValidationIssue>,
    pub usage_record_state: String,
    pub knowledge_trace: crate::domain::ai::types::KnowledgeTrace,
    pub knowledge_revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationEngineRef {
    pub kind: String,
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationTranslateBatchRequest {
    pub job_id: String,
    pub engine: LocalizationEngineRef,
    pub source_locale: Option<String>,
    pub target_locale: String,
    pub items: Vec<crate::domain::ai::types::AiTranslationItem>,
    pub usage_context: Option<crate::domain::ai::types::AiUsageContext>,
    #[serde(default)]
    pub knowledge_policy: crate::domain::ai::types::KnowledgePolicy,
    /// Per-batch input byte cap override forwarded to the AI provider request;
    /// `None` derives the budget from the context window.
    #[serde(default)]
    pub max_batch_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationTranslationResultItem {
    pub id: String,
    pub translated_text: String,
    pub detected_language: Option<String>,
    pub skipped_same_language: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationValidationIssue {
    pub item_id: String,
    pub category: String,
    pub source_term: Option<String>,
    pub expected_term: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationTranslateBatchResult {
    pub job_id: String,
    pub engine: LocalizationEngineRef,
    pub model: Option<String>,
    pub items: Vec<LocalizationTranslationResultItem>,
    pub validation_issues: Vec<LocalizationValidationIssue>,
    pub usage_record_state: String,
    pub knowledge_trace: crate::domain::ai::types::KnowledgeTrace,
    pub knowledge_revision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewItem {
    pub unit_key: String,
    pub source_text: String,
    pub target_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewRequest {
    pub job_id: String,
    pub scope_id: String,
    pub source_locale: String,
    pub target_locale: String,
    pub mode: String,
    pub profile_id: Option<String>,
    pub run_ai: bool,
    pub engine: String,
    pub items: Vec<AiReviewItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewIssue {
    pub id: String,
    pub run_id: String,
    pub unit_key: String,
    pub source_hash: String,
    pub target_hash: String,
    pub severity: String,
    pub status: String,
    pub category: String,
    pub reason: String,
    pub suggestion: Option<String>,
    pub source_snapshot: String,
    pub target_snapshot: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct AiReviewSummary {
    pub checked: u64,
    pub passed: u64,
    pub warnings: u64,
    pub total: u64,
    pub minor: u64,
    pub major: u64,
    pub critical: u64,
    pub open: u64,
    pub ignored: u64,
    pub accepted: u64,
    pub stale: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewRun {
    pub id: String,
    pub scope_id: String,
    pub source_locale: String,
    pub target_locale: String,
    pub engine: String,
    pub status: String,
    pub summary: AiReviewSummary,
    pub created_at_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewResult {
    pub run: AiReviewRun,
    pub issues: Vec<AiReviewIssue>,
    pub usage_record_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListReviewRunsRequest {
    pub scope_id: String,
    pub offset: u32,
    pub limit: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewRunPage {
    pub records: Vec<AiReviewRun>,
    pub total: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReviewRunRequest {
    pub run_id: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReviewIssueStatus {
    pub id: String,
    pub status: String,
    pub current_source_text: String,
    pub current_target_text: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateReviewIssuesRequest {
    pub run_id: String,
    pub issues: Vec<UpdateReviewIssueStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiSemanticSearchMode {
    Lexical,
    Builtin,
    LocalOnnx,
    RemoteOpenai,
}

impl Default for AiSemanticSearchMode {
    fn default() -> Self {
        Self::Builtin
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "kebab-case")]
pub enum AiSemanticExecutionPreference {
    #[default]
    Auto,
    Cpu,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticRemoteProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub dimensions: Option<u32>,
    pub credential_environment: Option<String>,
    pub key_configured: bool,
    pub resolved_credential_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSemanticRemoteProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub dimensions: Option<u32>,
    pub credential_environment: Option<String>,
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticSettingsSnapshot {
    pub mode: AiSemanticSearchMode,
    pub execution_preference: AiSemanticExecutionPreference,
    pub active_execution_provider: Option<String>,
    pub execution_fallback_reason: Option<String>,
    pub local_model_directory: Option<String>,
    pub active_remote_profile_id: Option<String>,
    pub remote_profiles: Vec<AiSemanticRemoteProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiSemanticSettingsRequest {
    pub mode: AiSemanticSearchMode,
    #[serde(default)]
    pub execution_preference: AiSemanticExecutionPreference,
    pub local_model_directory: Option<String>,
    pub active_remote_profile_id: Option<String>,
    pub remote_profiles: Vec<SaveAiSemanticRemoteProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticModelStatus {
    pub mode: AiSemanticSearchMode,
    pub available: bool,
    pub downloaded: bool,
    pub model_id: Option<String>,
    pub revision: Option<String>,
    pub dimensions: Option<u32>,
    pub model_path: Option<String>,
    pub cache_bytes: u64,
    pub unavailable_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyAiSemanticModelRequest {
    pub mode: AiSemanticSearchMode,
    pub model_id: Option<String>,
    pub local_model_directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticVerifiedFile {
    pub relative_path: String,
    pub size_bytes: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticModelVerification {
    pub mode: AiSemanticSearchMode,
    pub model_id: String,
    pub dimensions: u32,
    pub pooling: String,
    pub normalized: bool,
    pub fingerprint: String,
    pub verified_at_ms: i64,
    pub files: Vec<AiSemanticVerifiedFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeAiSemanticSearchRequest {
    pub query: String,
    pub source_locale: String,
    pub target_locale: String,
    #[serde(default = "default_semantic_probe_limit")]
    pub limit: u32,
}

fn default_semantic_probe_limit() -> u32 {
    10
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticProbeMatch {
    pub source_kind: String,
    pub source_id: String,
    pub source_text: String,
    pub target_text: String,
    pub context: String,
    pub score: f64,
    pub semantic_similarity: Option<f64>,
    pub lexical_similarity: f64,
    pub match_kind: String,
    pub retrieval_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticProbeResult {
    pub query: String,
    pub retrieval_mode: String,
    pub elapsed_ms: u64,
    pub total_candidates: u64,
    pub records: Vec<AiSemanticProbeMatch>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadAiSemanticModelRequest {
    pub job_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAiSemanticModelRequest {
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticProgress {
    pub job_id: String,
    pub model_id: String,
    pub kind: String,
    pub phase: String,
    pub current_file: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub bytes_per_second: Option<u64>,
    pub file_index: u32,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticIndexStatus {
    pub available: bool,
    pub retrieval_mode: String,
    pub generation_id: Option<String>,
    pub model_id: Option<String>,
    pub dimensions: Option<u32>,
    pub official_revision: Option<String>,
    pub knowledge_revision: Option<String>,
    pub indexed_records: u64,
    pub source_records: u64,
    pub pending_records: u64,
    pub coverage_percentage: f64,
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildAiSemanticIndexRequest {
    pub job_id: String,
    #[serde(default)]
    pub scope_ids: Vec<String>,
    #[serde(default)]
    pub confirm_remote_upload: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestAiSemanticRemoteProfileRequest {
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSemanticConnectionTestResult {
    pub model: String,
    pub dimensions: u32,
    pub latency_ms: u64,
}
