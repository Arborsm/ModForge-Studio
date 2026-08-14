use crate::AppHandle;
use crate::domain::localization::types::{
    AiGlossaryPage, AiLocalizationScopePage, AiLocalizationScopeSnapshot, AiOfficialCorpusStatus,
    AiOfficialSearchPage, AiReviewRequest, AiReviewResult, AiReviewRunPage,
    AiSemanticConnectionTestResult, AiSemanticIndexStatus, AiSemanticModelStatus,
    AiSemanticModelVerification, AiSemanticProbeResult, AiSemanticSettingsSnapshot, AiStyleGuide,
    AiTranslationMemoryPage, AiUsageClearRequest, AiUsageClearResult, AiUsageExportRequest,
    AiUsageQuery, AiUsageRecordPage, AiUsageSummary, CopyTranslationMemoryEntriesRequest,
    DeleteAiSemanticModelRequest, DeleteLocalizationEntriesRequest, DownloadAiSemanticModelRequest,
    ExportLocalizationKnowledgeRequest, ImportLocalizationKnowledgeRequest,
    InitializeLocalizationPlanRequest, InitializeLocalizationPlanResult,
    InspectLocalizationContextRequest, InspectOfficialLocalizationIndexRequest,
    ListLocalizationScopesRequest, ListReviewRunsRequest, LoadLocalizationScopeRequest,
    LoadLocalizationStyleGuideRequest, LoadReviewRunRequest, LocalizationContextInspection,
    LocalizationCorpusWarmupStatus, LocalizationEngineRef, LocalizationKnowledgeTransferResult,
    LocalizationTranslateBatchRequest, LocalizationTranslateBatchResult,
    ProbeAiSemanticSearchRequest, RebuildAiSemanticIndexRequest,
    RebuildOfficialLocalizationIndexRequest, RecordConfirmedTranslationsRequest,
    ResolveLocalizationScopeRequest, SaveAiSemanticSettingsRequest,
    SaveLocalizationScopeSettingsRequest, SearchLocalizationKnowledgeRequest,
    SearchOfficialLocalizationRequest, TestAiSemanticRemoteProfileRequest,
    UpdateReviewIssuesRequest, UpsertLocalizationGlossaryEntriesRequest,
    VerifyAiSemanticModelRequest,
};
use host_command_macros::host_command;

#[host_command(io, resources(LocalizationSettings), wrap(ai))]
pub async fn load_localization_default_engine(
    app: AppHandle,
) -> Result<Option<LocalizationEngineRef>, String> {
    crate::domain::localization::settings::load_default_engine()
}

// Only the resources the warmup mutates or must serialize against:
// knowledge DB migrations and the official index. The semantic
// warm phase reads settings/model state atomically and warms
// caches with their own internal locks, so it must not hold the
// semantic status locks while the (potentially slow) local model
// loads — otherwise every status query queues behind the warmup.
#[host_command(
    io,
    pool(semantic_search),
    resources(AiLocalizationKnowledge, AiOfficialLocalizationIndex),
    wrap(ai)
)]
pub async fn prewarm_localization_corpus(
    app: AppHandle,
) -> Result<LocalizationCorpusWarmupStatus, String> {
    crate::domain::localization::corpus::prewarm_corpus()
}

#[host_command(
    mutation,
    resources(LocalizationSettings, AiSettings, MachineTranslationSettings),
    wrap(ai)
)]
pub async fn save_localization_default_engine(
    app: AppHandle,
    engine: LocalizationEngineRef,
) -> Result<LocalizationEngineRef, String> {
    crate::domain::localization::settings::save_default_engine(engine)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn translate_localization_batch(
    app: AppHandle,
    request: LocalizationTranslateBatchRequest,
) -> Result<LocalizationTranslateBatchResult, String> {
    crate::domain::localization::orchestrator::translate_localization_batch(app, request)
}

#[host_command(io, resources(AiSemanticSettings), wrap(ai))]
pub async fn load_localization_semantic_settings(
    app: AppHandle,
) -> Result<AiSemanticSettingsSnapshot, String> {
    crate::domain::localization::semantic::load_settings()
}

#[host_command(
    mutation,
    resources(AiSemanticSettings, AiSemanticModel, AiSemanticIndex),
    wrap(ai)
)]
pub async fn save_localization_semantic_settings(
    app: AppHandle,
    request: SaveAiSemanticSettingsRequest,
) -> Result<AiSemanticSettingsSnapshot, String> {
    crate::domain::localization::semantic::save_settings(request)
}

#[host_command(io, resources(AiSemanticSettings, AiSemanticModel), wrap(ai))]
pub async fn inspect_localization_semantic_model(
    app: AppHandle,
) -> Result<AiSemanticModelStatus, String> {
    crate::domain::localization::semantic::inspect_model()
}

#[host_command(io, resources(AiSemanticSettings, AiSemanticModel), wrap(ai))]
pub async fn verify_localization_semantic_model(
    app: AppHandle,
    request: VerifyAiSemanticModelRequest,
) -> Result<AiSemanticModelVerification, String> {
    crate::domain::localization::semantic::verify_model(request)
}

#[host_command(
    network,
    pool(semantic_search),
    resources(
        AiSemanticSettings,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex,
        AiLocalizationKnowledge
    ),
    wrap(ai)
)]
pub async fn probe_localization_semantic_search(
    app: AppHandle,
    request: ProbeAiSemanticSearchRequest,
) -> Result<AiSemanticProbeResult, String> {
    crate::domain::localization::semantic::run_probe(request)
}

#[host_command(network, resources(AiSemanticModel), wrap(ai))]
pub async fn download_localization_semantic_model(
    app: AppHandle,
    request: DownloadAiSemanticModelRequest,
) -> Result<AiSemanticModelStatus, String> {
    crate::domain::localization::semantic::download_builtin_model(app, request)
}

#[host_command(mutation, resources(AiSemanticModel, AiSemanticIndex), wrap(ai))]
pub async fn delete_localization_semantic_model(
    app: AppHandle,
    request: DeleteAiSemanticModelRequest,
) -> Result<AiSemanticModelStatus, String> {
    crate::domain::localization::semantic::delete_builtin_model(request)
}

#[host_command(control, wrap(ai))]
pub async fn open_localization_semantic_model_directory(
    app: AppHandle,
    request: DeleteAiSemanticModelRequest,
) -> Result<(), String> {
    crate::domain::localization::semantic::open_builtin_model_directory(request)
}

#[host_command(io, wrap(ai))]
pub async fn inspect_localization_semantic_index(
    app: AppHandle,
    scope_ids: Vec<String>,
) -> Result<AiSemanticIndexStatus, String> {
    crate::domain::localization::semantic::inspect_index(&scope_ids)
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiSemanticModel,
        AiSemanticIndex,
        AiLocalizationKnowledge,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn rebuild_localization_semantic_index(
    app: AppHandle,
    request: RebuildAiSemanticIndexRequest,
) -> Result<AiSemanticIndexStatus, String> {
    crate::domain::localization::semantic::rebuild_index(app, request)
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiSemanticModel,
        AiSemanticIndex,
        AiLocalizationKnowledge,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn sync_localization_semantic_index(
    app: AppHandle,
    request: RebuildAiSemanticIndexRequest,
) -> Result<AiSemanticIndexStatus, String> {
    crate::domain::localization::semantic::synchronize_index(app, request)
}

#[host_command(network, resources(AiSemanticSettings, AiSemanticModel), wrap(ai))]
pub async fn test_localization_semantic_remote_profile(
    app: AppHandle,
    request: TestAiSemanticRemoteProfileRequest,
) -> Result<AiSemanticConnectionTestResult, String> {
    crate::domain::localization::semantic::test_remote_profile(request)
}

#[host_command(io, resources(AiOfficialLocalizationIndex), wrap(ai))]
pub async fn inspect_official_localization_index(
    app: AppHandle,
    request: InspectOfficialLocalizationIndexRequest,
) -> Result<AiOfficialCorpusStatus, String> {
    crate::domain::localization::official::inspect(request)
}

#[host_command(
    mutation,
    pool(official_indexing),
    resources(AiOfficialLocalizationIndex),
    wrap(ai)
)]
pub async fn rebuild_official_localization_index(
    app: AppHandle,
    request: RebuildOfficialLocalizationIndexRequest,
) -> Result<AiOfficialCorpusStatus, String> {
    crate::domain::localization::official::rebuild_with_events(app, request)
}

#[host_command(io, resources(AiOfficialLocalizationIndex), wrap(ai))]
pub async fn search_official_localization(
    app: AppHandle,
    request: SearchOfficialLocalizationRequest,
) -> Result<AiOfficialSearchPage, String> {
    crate::domain::localization::official::search(request)
}

#[host_command(control, wrap(ai))]
pub async fn cancel_localization_job(app: AppHandle, job_id: String) -> Result<(), String> {
    crate::domain::localization::jobs::cancel(&job_id)
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiLocalizationKnowledge,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn initialize_localization_plan(
    app: AppHandle,
    request: InitializeLocalizationPlanRequest,
) -> Result<InitializeLocalizationPlanResult, String> {
    (|| {
        let job_id = request.job_id.clone();
        let mut result = crate::domain::localization::knowledge::initialize_plan(request)?;
        match crate::domain::localization::semantic::synchronize_after_local_mutation(
            app,
            job_id,
            vec![result.snapshot.scope.id.clone()],
        ) {
            Ok(true) => result.semantic_index_state = "synced".into(),
            Ok(false) => result.semantic_index_state = "skipped".into(),
            Err(error) => {
                result.semantic_index_state = "failed".into();
                result.semantic_index_error = Some(error.to_string());
            }
        }
        Ok(result)
    })()
}

#[host_command(
    io,
    resources(
        AiLocalizationKnowledge,
        AiSemanticSettings,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn inspect_localization_context(
    app: AppHandle,
    request: InspectLocalizationContextRequest,
) -> Result<LocalizationContextInspection, String> {
    crate::domain::localization::knowledge::inspect_context(request)
}

// No resource locks: lease bookkeeping has its own mutex and the
// warm below only populates internal caches (embedding session,
// vector generation) that carry their own synchronization. Taking
// the semantic settings/model/index locks here would stall the
// fast status queries (settings tab, readiness banners) behind a
// multi-second ONNX runtime load.
#[host_command(io, pool(semantic_search), wrap(ai))]
pub async fn acquire_localization_semantic_runtime(
    app: AppHandle,
    lease_id: String,
) -> Result<(), String> {
    crate::domain::localization::semantic::acquire_runtime(lease_id)
}

#[host_command(io, wrap(ai))]
pub async fn release_localization_semantic_runtime(
    app: AppHandle,
    lease_id: String,
) -> Result<(), String> {
    crate::domain::localization::semantic::release_runtime_lease(lease_id)
}

#[host_command(mutation, resources(AiSemanticModel, AiSemanticIndex), wrap(ai))]
pub async fn unload_localization_semantic_runtime(app: AppHandle) -> Result<(), String> {
    crate::domain::localization::semantic::release_runtime()
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn resolve_localization_scope(
    app: AppHandle,
    request: ResolveLocalizationScopeRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::resolve_scope(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn create_localization_profile(
    app: AppHandle,
    name: String,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::create_profile(name)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn rename_localization_profile(
    app: AppHandle,
    scope_id: String,
    name: String,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::rename_profile(scope_id, name)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn delete_localization_profile(app: AppHandle, scope_id: String) -> Result<(), String> {
    crate::domain::localization::knowledge::delete_profile(scope_id)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn set_localization_profile_binding(
    app: AppHandle,
    scope_id: String,
    binding_kind: String,
    binding_value: String,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::set_profile_binding(
        scope_id,
        binding_kind,
        binding_value,
    )
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn remove_localization_profile_binding(
    app: AppHandle,
    binding_kind: String,
    binding_value: String,
) -> Result<(), String> {
    crate::domain::localization::knowledge::remove_profile_binding(binding_kind, binding_value)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn list_localization_scopes(
    app: AppHandle,
    request: ListLocalizationScopesRequest,
) -> Result<AiLocalizationScopePage, String> {
    crate::domain::localization::knowledge::list_scopes(request)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn load_localization_scope(
    app: AppHandle,
    request: LoadLocalizationScopeRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::load_scope(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn save_localization_scope_settings(
    app: AppHandle,
    request: SaveLocalizationScopeSettingsRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    crate::domain::localization::knowledge::save_scope_settings(request)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn list_localization_glossary_entries(
    app: AppHandle,
    request: SearchLocalizationKnowledgeRequest,
) -> Result<AiGlossaryPage, String> {
    crate::domain::localization::knowledge::list_glossary(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn upsert_localization_glossary_entries(
    app: AppHandle,
    request: UpsertLocalizationGlossaryEntriesRequest,
) -> Result<AiGlossaryPage, String> {
    crate::domain::localization::knowledge::upsert_glossary(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn delete_localization_glossary_entries(
    app: AppHandle,
    request: DeleteLocalizationEntriesRequest,
) -> Result<u64, String> {
    crate::domain::localization::knowledge::delete_glossary(request)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn load_localization_style_guide(
    app: AppHandle,
    request: LoadLocalizationStyleGuideRequest,
) -> Result<Option<AiStyleGuide>, String> {
    crate::domain::localization::knowledge::load_style(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn save_localization_style_guide(
    app: AppHandle,
    guide: AiStyleGuide,
) -> Result<AiStyleGuide, String> {
    crate::domain::localization::knowledge::save_style(guide)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn search_translation_memory(
    app: AppHandle,
    request: SearchLocalizationKnowledgeRequest,
) -> Result<AiTranslationMemoryPage, String> {
    crate::domain::localization::knowledge::search_memory(request)
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiLocalizationKnowledge,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn record_confirmed_translations(
    app: AppHandle,
    request: RecordConfirmedTranslationsRequest,
) -> Result<u64, String> {
    (|| {
        let job_id = request.job_id.clone();
        let scope_id = request.scope_id.clone();
        let count = crate::domain::localization::knowledge::record_confirmed(request)?;
        crate::domain::localization::semantic::synchronize_after_local_mutation(
            app,
            job_id,
            vec![scope_id],
        )?;
        Ok(count)
    })()
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiLocalizationKnowledge,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn delete_translation_memory_entries(
    app: AppHandle,
    request: DeleteLocalizationEntriesRequest,
) -> Result<u64, String> {
    (|| {
        let scope_id = request.scope_id.clone();
        let count = crate::domain::localization::knowledge::delete_memory(request)?;
        if count > 0 {
            crate::domain::localization::semantic::synchronize_after_local_mutation(
                app,
                uuid::Uuid::new_v4().to_string(),
                vec![scope_id],
            )?;
        }
        Ok(count)
    })()
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiLocalizationKnowledge,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn copy_translation_memory_entries(
    app: AppHandle,
    request: CopyTranslationMemoryEntriesRequest,
) -> Result<u64, String> {
    (|| {
        let scope_id = request.target_scope_id.clone();
        let count = crate::domain::localization::knowledge::copy_memory(request)?;
        crate::domain::localization::semantic::synchronize_after_local_mutation(
            app,
            uuid::Uuid::new_v4().to_string(),
            vec![scope_id],
        )?;
        Ok(count)
    })()
}

#[host_command(
    mutation,
    pool(semantic_indexing),
    resources(
        AiLocalizationKnowledge,
        AiSemanticModel,
        AiSemanticIndex,
        AiOfficialLocalizationIndex
    ),
    wrap(ai)
)]
pub async fn import_localization_knowledge(
    app: AppHandle,
    request: ImportLocalizationKnowledgeRequest,
) -> Result<LocalizationKnowledgeTransferResult, String> {
    (|| {
        let job_id = request.job_id.clone();
        let scope_id = request.scope_id.clone();
        let result = crate::domain::localization::knowledge::import_knowledge(request)?;
        crate::domain::localization::semantic::synchronize_after_local_mutation(
            app,
            job_id,
            vec![scope_id],
        )?;
        Ok(result)
    })()
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn export_localization_knowledge(
    app: AppHandle,
    request: ExportLocalizationKnowledgeRequest,
) -> Result<LocalizationKnowledgeTransferResult, String> {
    crate::domain::localization::knowledge::export_knowledge(request)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn review_localization_batch(
    app: AppHandle,
    request: AiReviewRequest,
) -> Result<AiReviewResult, String> {
    crate::domain::localization::orchestrator::review_batch(request)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn list_localization_review_runs(
    app: AppHandle,
    request: ListReviewRunsRequest,
) -> Result<AiReviewRunPage, String> {
    crate::domain::localization::review::list_runs(request)
}

#[host_command(io, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn load_localization_review_run(
    app: AppHandle,
    request: LoadReviewRunRequest,
) -> Result<AiReviewResult, String> {
    crate::domain::localization::review::load_run(request)
}

#[host_command(mutation, resources(AiLocalizationKnowledge), wrap(ai))]
pub async fn update_localization_review_issues(
    app: AppHandle,
    request: UpdateReviewIssuesRequest,
) -> Result<AiReviewResult, String> {
    crate::domain::localization::review::update_issues(request)
}

#[host_command(io, resources(AiUsageLedger), wrap(ai))]
pub async fn query_ai_usage_summary(
    app: AppHandle,
    request: AiUsageQuery,
) -> Result<AiUsageSummary, String> {
    crate::domain::localization::usage::query_summary(request)
}

#[host_command(io, resources(AiUsageLedger), wrap(ai))]
pub async fn query_ai_usage_records(
    app: AppHandle,
    request: AiUsageQuery,
) -> Result<AiUsageRecordPage, String> {
    crate::domain::localization::usage::query_records(request)
}

#[host_command(mutation, resources(AiUsageLedger), wrap(ai))]
pub async fn export_ai_usage(app: AppHandle, request: AiUsageExportRequest) -> Result<u64, String> {
    crate::domain::localization::usage::export_usage(request)
}

#[host_command(mutation, resources(AiUsageLedger), wrap(ai))]
pub async fn clear_ai_usage(
    app: AppHandle,
    request: AiUsageClearRequest,
) -> Result<AiUsageClearResult, String> {
    crate::domain::localization::usage::clear_usage(request)
}
