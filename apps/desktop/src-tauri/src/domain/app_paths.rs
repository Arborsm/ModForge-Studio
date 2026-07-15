use anyhow::Context;
use std::path::PathBuf;

const APP_DATA_DIR_NAME: &str = "ModForge Studio";

pub(crate) fn modforge_data_dir() -> anyhow::Result<PathBuf> {
    #[cfg(test)]
    if let Some(path) = std::env::var_os("MODFORGE_TEST_DATA_DIR") {
        return Ok(PathBuf::from(path));
    }
    dirs::config_dir()
        .map(|path| path.join(APP_DATA_DIR_NAME))
        .context("Failed to resolve the user data directory.")
}

pub(crate) fn app_ui_state_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("app").join("ui-state.json"))
}

pub(crate) fn cp_maker_drafts_dir() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("cp-maker").join("drafts"))
}

pub(crate) fn cp_maker_session_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("cp-maker").join("session.json"))
}

pub(crate) fn launcher_settings_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("settings.json"))
}

pub(crate) fn launcher_library_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("library.json"))
}

pub(crate) fn launcher_download_queue_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("downloads.json"))
}

pub(crate) fn launcher_library_covers_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("covers.json"))
}

pub(crate) fn launcher_image_failures_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("launcher")
        .join("image-failures.json"))
}

pub(crate) fn launcher_updates_cache_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("launcher")
        .join("updates-cache.json"))
}

pub(crate) fn launcher_backup_dir() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("backups"))
}

pub(crate) fn launcher_image_cache_dir() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("launcher").join("images"))
}

pub(crate) fn app_cache_dir() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("cache"))
}

pub(crate) fn app_logs_dir() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("logs"))
}

pub(crate) fn ai_settings_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("ai").join("ai-settings.json"))
}

pub(crate) fn machine_translation_settings_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("ai")
        .join("machine-translation-settings.json"))
}

pub(crate) fn ai_translation_cache_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("ai")
        .join("translation-cache.sqlite3"))
}

pub(crate) fn ai_usage_ledger_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?.join("ai").join("ai-usage.sqlite3"))
}

pub(crate) fn official_localization_index_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("ai")
        .join("official-localization.sqlite3"))
}

pub(crate) fn ai_localization_knowledge_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("ai")
        .join("ai-localization.sqlite3"))
}
