use std::path::PathBuf;

const APP_DATA_DIR_NAME: &str = "ModForge Studio";

pub(crate) fn modforge_data_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|path| path.join(APP_DATA_DIR_NAME))
        .ok_or_else(|| "Failed to resolve the user data directory.".to_string())
}

pub(crate) fn app_ui_state_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("app").join("ui-state.json"))
}

pub(crate) fn cp_maker_drafts_dir() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("cp-maker").join("drafts"))
}

pub(crate) fn launcher_settings_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("settings.json"))
}

pub(crate) fn launcher_library_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("library.json"))
}

pub(crate) fn launcher_download_queue_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("downloads.json"))
}

pub(crate) fn launcher_library_covers_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("covers.json"))
}

pub(crate) fn launcher_updates_cache_path() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?
        .join("launcher")
        .join("updates-cache.json"))
}

pub(crate) fn launcher_backup_dir() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("backups"))
}

pub(crate) fn launcher_image_cache_dir() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("launcher").join("images"))
}

pub(crate) fn app_cache_dir() -> Result<PathBuf, String> {
    Ok(modforge_data_dir()?.join("cache"))
}
