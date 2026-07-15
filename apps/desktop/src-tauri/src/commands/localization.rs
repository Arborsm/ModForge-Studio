use crate::domain::localization::types::*;
use crate::support::logging::DebugLoggingState;
use crate::{AppHandle, AppRuntime};
use serde_json::json;
use tauri::State;

macro_rules! execute {
    ($app:expr,$debug:expr,$name:ident,$args:expr) => {
        crate::commands::runtime::execute_tauri_command(
            AppHandle::from_tauri($app),
            $debug.inner().clone(),
            crate::host_command_name!($name),
            $args,
        )
        .await
    };
}

#[tauri::command]
pub async fn translate_localization_batch(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: LocalizationTranslateBatchRequest,
) -> Result<LocalizationTranslateBatchResult, String> {
    execute!(
        app,
        debug,
        translate_localization_batch,
        json!({"request":request})
    )
}

#[tauri::command]
pub async fn inspect_official_localization_index(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: InspectOfficialLocalizationIndexRequest,
) -> Result<AiOfficialCorpusStatus, String> {
    execute!(
        app,
        debug,
        inspect_official_localization_index,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn rebuild_official_localization_index(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: RebuildOfficialLocalizationIndexRequest,
) -> Result<AiOfficialCorpusStatus, String> {
    execute!(
        app,
        debug,
        rebuild_official_localization_index,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn search_official_localization(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SearchOfficialLocalizationRequest,
) -> Result<AiOfficialSearchPage, String> {
    execute!(
        app,
        debug,
        search_official_localization,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn cancel_localization_job(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    job_id: String,
) -> Result<(), String> {
    execute!(app, debug, cancel_localization_job, json!({"jobId":job_id}))
}

#[tauri::command]
pub async fn resolve_localization_scope(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ResolveLocalizationScopeRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    execute!(
        app,
        debug,
        resolve_localization_scope,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn rebind_localization_scope(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: RebindLocalizationScopeRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    execute!(
        app,
        debug,
        rebind_localization_scope,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn list_localization_scopes(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ListLocalizationScopesRequest,
) -> Result<AiLocalizationScopePage, String> {
    execute!(
        app,
        debug,
        list_localization_scopes,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn load_localization_scope(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: LoadLocalizationScopeRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    execute!(
        app,
        debug,
        load_localization_scope,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn save_localization_scope_settings(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SaveLocalizationScopeSettingsRequest,
) -> Result<AiLocalizationScopeSnapshot, String> {
    execute!(
        app,
        debug,
        save_localization_scope_settings,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn list_localization_glossary_entries(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SearchLocalizationKnowledgeRequest,
) -> Result<AiGlossaryPage, String> {
    execute!(
        app,
        debug,
        list_localization_glossary_entries,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn upsert_localization_glossary_entries(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: UpsertLocalizationGlossaryEntriesRequest,
) -> Result<AiGlossaryPage, String> {
    execute!(
        app,
        debug,
        upsert_localization_glossary_entries,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn delete_localization_glossary_entries(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: DeleteLocalizationEntriesRequest,
) -> Result<u64, String> {
    execute!(
        app,
        debug,
        delete_localization_glossary_entries,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn load_localization_style_guide(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: LoadLocalizationStyleGuideRequest,
) -> Result<Option<AiStyleGuide>, String> {
    execute!(
        app,
        debug,
        load_localization_style_guide,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn save_localization_style_guide(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    guide: AiStyleGuide,
) -> Result<AiStyleGuide, String> {
    execute!(
        app,
        debug,
        save_localization_style_guide,
        json!({"guide":guide})
    )
}
#[tauri::command]
pub async fn search_translation_memory(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: SearchLocalizationKnowledgeRequest,
) -> Result<AiTranslationMemoryPage, String> {
    execute!(
        app,
        debug,
        search_translation_memory,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn record_confirmed_translations(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: RecordConfirmedTranslationsRequest,
) -> Result<u64, String> {
    execute!(
        app,
        debug,
        record_confirmed_translations,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn delete_translation_memory_entries(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: DeleteLocalizationEntriesRequest,
) -> Result<u64, String> {
    execute!(
        app,
        debug,
        delete_translation_memory_entries,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn copy_translation_memory_entries(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: CopyTranslationMemoryEntriesRequest,
) -> Result<u64, String> {
    execute!(
        app,
        debug,
        copy_translation_memory_entries,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn import_localization_knowledge(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ImportLocalizationKnowledgeRequest,
) -> Result<LocalizationKnowledgeTransferResult, String> {
    execute!(
        app,
        debug,
        import_localization_knowledge,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn export_localization_knowledge(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ExportLocalizationKnowledgeRequest,
) -> Result<LocalizationKnowledgeTransferResult, String> {
    execute!(
        app,
        debug,
        export_localization_knowledge,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn review_localization_batch(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: AiReviewRequest,
) -> Result<AiReviewResult, String> {
    execute!(
        app,
        debug,
        review_localization_batch,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn list_localization_review_runs(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: ListReviewRunsRequest,
) -> Result<AiReviewRunPage, String> {
    execute!(
        app,
        debug,
        list_localization_review_runs,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn load_localization_review_run(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: LoadReviewRunRequest,
) -> Result<AiReviewResult, String> {
    execute!(
        app,
        debug,
        load_localization_review_run,
        json!({"request":request})
    )
}
#[tauri::command]
pub async fn update_localization_review_issues(
    app: tauri::AppHandle<AppRuntime>,
    debug: State<'_, DebugLoggingState>,
    request: UpdateReviewIssuesRequest,
) -> Result<AiReviewResult, String> {
    execute!(
        app,
        debug,
        update_localization_review_issues,
        json!({"request":request})
    )
}
