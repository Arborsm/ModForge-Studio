use super::{load_or_create_settings_at_path, normalize_settings, save_settings_at_path};
use crate::domain::launcher::types::LauncherSettings;
use crate::test_support::create_temp_dir;
use std::fs;

#[test]
fn launcher_settings_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-settings");
    let settings_path = root.join("launcher").join("settings.json");

    let default_settings = load_or_create_settings_at_path(&settings_path).expect("load defaults");
    assert_eq!(default_settings, LauncherSettings::default());
    assert!(settings_path.is_file());

    let saved_settings = LauncherSettings {
        game_path: Some(r"C:\Games\Stardew Valley".to_string()),
        mods_path: Some(r"C:\Games\Stardew Valley\Mods".to_string()),
        download_path: Some(r"C:\Users\Example\Downloads\ModForge Studio".to_string()),
        nexus_api_key: Some("nexus-key".to_string()),
        auto_install_downloads: true,
        keep_downloaded_archives: true,
        auto_check_mod_updates: false,
    };
    save_settings_at_path(&settings_path, &saved_settings).expect("save settings");

    let reloaded = load_or_create_settings_at_path(&settings_path).expect("reload settings");
    assert_eq!(reloaded, normalize_settings(saved_settings));

    fs::remove_dir_all(root).expect("cleanup");
}
