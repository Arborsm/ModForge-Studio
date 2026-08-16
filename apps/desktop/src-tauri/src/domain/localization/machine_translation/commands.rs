use crate::AppHandle;
use crate::domain::localization::types::{
    MachineTranslateBatchRequest, MachineTranslateBatchResult, MachineTranslationLanguage,
    MachineTranslationProfileRequest, MachineTranslationProfileTestResult,
    MachineTranslationSettingsSnapshot, SaveMachineTranslationSettingsRequest,
};
use host_command_macros::host_command;

#[host_command(io, resources(MachineTranslationSettings), wrap(ai))]
pub async fn load_machine_translation_settings(
    app: AppHandle,
) -> Result<MachineTranslationSettingsSnapshot, String> {
    crate::domain::localization::machine_translation::load()
}

#[host_command(mutation, resources(MachineTranslationSettings), wrap(ai))]
pub async fn save_machine_translation_settings(
    app: AppHandle,
    request: SaveMachineTranslationSettingsRequest,
) -> Result<MachineTranslationSettingsSnapshot, String> {
    crate::domain::localization::machine_translation::save(request)
}

#[host_command(network, wrap(ai))]
pub async fn list_machine_translation_languages(
    app: AppHandle,
    request: MachineTranslationProfileRequest,
) -> Result<Vec<MachineTranslationLanguage>, String> {
    crate::domain::localization::machine_translation::list_languages(request)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn test_machine_translation_profile(
    app: AppHandle,
    request: MachineTranslationProfileRequest,
) -> Result<MachineTranslationProfileTestResult, String> {
    crate::domain::localization::orchestrator::test_machine_translation_profile(request)
}

#[host_command(network, pool(ai), wrap(ai))]
pub async fn translate_machine_translation_batch(
    app: AppHandle,
    request: MachineTranslateBatchRequest,
) -> Result<MachineTranslateBatchResult, String> {
    crate::domain::localization::orchestrator::translate_machine_batch(request)
}
