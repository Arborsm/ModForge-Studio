use crate::AppHandle;
use crate::domain;
use crate::domain::ai::types::{
    AiModelInfo, AiProfileImportPreview, AiProfileImportResult, AiProfileRequest,
    AiProfileTestResult, AiSettingsSnapshot, AiTranslateBatchRequest, AiTranslateBatchResult,
    AiTranslationCacheEntry, AiTranslationCacheStats, ApplyAiProfilesImportRequest,
    CancelAiJobRequest, ExportAiProfilesRequest, ModelsDevCatalog, PreviewAiProfilesImportRequest,
    ReadAiTranslationCacheRequest, SaveAiSettingsRequest,
};
use host_command_macros::host_command;

#[host_command(io, resources(AiSettings), wrap(ai))]
pub async fn load_ai_settings(app: AppHandle) -> Result<AiSettingsSnapshot, String> {
    domain::ai::load_settings_for_command()
}

#[host_command(mutation, resources(AiSettings), wrap(ai))]
pub async fn save_ai_settings(
    app: AppHandle,
    request: SaveAiSettingsRequest,
) -> Result<AiSettingsSnapshot, String> {
    domain::ai::save_settings_for_command(request)
}

#[host_command(io, resources(AiSettings, FileExport), wrap(ai))]
pub async fn export_ai_profiles(
    app: AppHandle,
    request: ExportAiProfilesRequest,
) -> Result<u32, String> {
    domain::ai::export_profiles(request)
}

#[host_command(io, resources(AiSettings), wrap(ai))]
pub async fn preview_ai_profiles_import(
    app: AppHandle,
    request: PreviewAiProfilesImportRequest,
) -> Result<AiProfileImportPreview, String> {
    domain::ai::preview_profiles_import(request)
}

#[host_command(mutation, resources(AiSettings), wrap(ai))]
pub async fn apply_ai_profiles_import(
    app: AppHandle,
    request: ApplyAiProfilesImportRequest,
) -> Result<AiProfileImportResult, String> {
    domain::ai::apply_profiles_import(request)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn list_ai_models(
    app: AppHandle,
    request: AiProfileRequest,
) -> Result<Vec<AiModelInfo>, String> {
    domain::ai::list_ai_models(request)
}

#[host_command(network, wrap(ai))]
pub async fn fetch_ai_models_dev_catalog(app: AppHandle) -> Result<ModelsDevCatalog, String> {
    domain::ai::fetch_models_dev_catalog()
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn test_ai_profile(
    app: AppHandle,
    request: AiProfileRequest,
) -> Result<AiProfileTestResult, String> {
    domain::localization::orchestrator::test_ai_profile(request)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn translate_ai_batch(
    app: AppHandle,
    request: AiTranslateBatchRequest,
) -> Result<AiTranslateBatchResult, String> {
    domain::localization::orchestrator::translate_ai_batch(app, request)
}

#[host_command(control, wrap(ai))]
pub async fn cancel_ai_job(app: AppHandle, request: CancelAiJobRequest) -> Result<(), String> {
    domain::ai::cancel_ai_job(request)
}

#[host_command(io, resources(AiTranslationCache), wrap(ai))]
pub async fn read_ai_translation_cache(
    app: AppHandle,
    request: ReadAiTranslationCacheRequest,
) -> Result<Option<AiTranslationCacheEntry>, String> {
    domain::ai::read_ai_translation_cache(request)
}

#[host_command(mutation, resources(AiTranslationCache), wrap(ai))]
pub async fn write_ai_translation_cache(
    app: AppHandle,
    entry: AiTranslationCacheEntry,
) -> Result<AiTranslationCacheEntry, String> {
    domain::ai::write_ai_translation_cache(entry)
}

#[host_command(io, resources(AiTranslationCache), wrap(ai))]
pub async fn get_ai_translation_cache_stats(
    app: AppHandle,
) -> Result<AiTranslationCacheStats, String> {
    domain::ai::get_ai_translation_cache_stats()
}

#[host_command(mutation, resources(AiTranslationCache), wrap(ai))]
pub async fn clear_ai_translation_cache(app: AppHandle) -> Result<AiTranslationCacheStats, String> {
    domain::ai::clear_ai_translation_cache()
}
