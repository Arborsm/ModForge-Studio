use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) use crate::domain::app_paths::{
    launcher_backup_dir, launcher_download_queue_path, launcher_image_cache_dir,
    launcher_image_failures_path, launcher_library_covers_path, launcher_library_path,
    launcher_settings_path, launcher_updates_cache_path,
};

pub(crate) fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
