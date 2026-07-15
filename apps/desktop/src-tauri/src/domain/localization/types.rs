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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageQuery {
    pub from_ms: i64,
    pub to_ms: i64,
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
    pub error_count: u64,
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
    pub prompt_eligible: bool,
    pub fingerprint: String,
    pub similarity: f64,
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
pub struct RebindLocalizationScopeRequest {
    pub scope_id: String,
    pub binding_kind: String,
    pub binding_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadLocalizationScopeRequest {
    pub scope_id: String,
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
    pub binding_kind: Option<String>,
    pub binding_value: Option<String>,
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
