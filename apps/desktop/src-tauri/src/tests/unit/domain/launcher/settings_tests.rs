use super::{
    default_download_path, load_or_create_settings_at_path, merge_launcher_settings,
    normalize_settings, save_settings_at_path,
};
use crate::domain::launcher::types::{
    LauncherSettings, NullablePatch, SaveLauncherSettingsRequest,
};
use crate::test_support::create_temp_dir;
use std::fs;

#[test]
fn launcher_settings_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-settings");
    let settings_path = root.join("launcher").join("settings.json");

    let default_settings = load_or_create_settings_at_path(&settings_path).expect("load defaults");
    assert_eq!(
        default_settings.download_path,
        default_download_path().map(|path| path.to_string_lossy().to_string())
    );
    assert_eq!(
        default_settings.game_path,
        LauncherSettings::default().game_path
    );
    assert_eq!(
        default_settings.mods_path,
        LauncherSettings::default().mods_path
    );
    assert!(settings_path.is_file());

    let saved_settings = LauncherSettings {
        game_path: Some(r"C:\Games\Stardew Valley".to_string()),
        mods_path: Some(r"C:\Games\Stardew Valley\Mods".to_string()),
        download_path: Some(r"C:\Users\Example\Downloads\ModForge Studio".to_string()),
        nexus_api_key: Some("nexus-key".to_string()),
        auto_install_downloads: true,
        keep_downloaded_archives: true,
        auto_check_mod_updates: false,
        gmcm_parsing_enabled: false,
    };
    save_settings_at_path(&settings_path, &saved_settings).expect("save settings");

    let reloaded = load_or_create_settings_at_path(&settings_path).expect("reload settings");
    assert_eq!(reloaded, normalize_settings(saved_settings));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_settings_default_gmcm_parsing_to_enabled_and_persist_opt_out() {
    let legacy: LauncherSettings =
        serde_json::from_str(r#"{"autoInstallDownloads":false}"#).expect("legacy settings");
    assert!(legacy.gmcm_parsing_enabled);

    let disabled = merge_launcher_settings(
        legacy,
        serde_json::from_str(r#"{"gmcmParsingEnabled":false}"#).expect("GMCM setting patch"),
    );
    assert!(!disabled.gmcm_parsing_enabled);
}

#[test]
fn launcher_settings_backfills_missing_download_path_from_system_downloads() {
    let settings = normalize_settings(LauncherSettings {
        download_path: None,
        ..LauncherSettings::default()
    });

    assert_eq!(
        settings.download_path,
        default_download_path().map(|path| path.to_string_lossy().to_string())
    );
}

#[test]
fn save_launcher_settings_request_distinguishes_missing_null_and_value_api_key() {
    let omitted: SaveLauncherSettingsRequest = serde_json::from_str("{}").expect("omitted key");
    assert_eq!(omitted.nexus_api_key, NullablePatch::Missing);

    let null: SaveLauncherSettingsRequest =
        serde_json::from_str(r#"{"nexusApiKey":null}"#).expect("null key");
    assert_eq!(null.nexus_api_key, NullablePatch::Null);

    let value: SaveLauncherSettingsRequest =
        serde_json::from_str(r#"{"nexusApiKey":"updated-key"}"#).expect("value key");
    assert_eq!(
        value.nexus_api_key,
        NullablePatch::Value("updated-key".to_string())
    );
}

#[test]
fn merge_launcher_settings_clears_preserves_and_updates_api_key() {
    let existing = LauncherSettings {
        nexus_api_key: Some("existing-key".to_string()),
        ..LauncherSettings::default()
    };

    let preserved = merge_launcher_settings(
        existing.clone(),
        serde_json::from_str("{}").expect("omitted key request"),
    );
    assert_eq!(preserved.nexus_api_key.as_deref(), Some("existing-key"));

    let cleared = merge_launcher_settings(
        existing.clone(),
        serde_json::from_str(r#"{"nexusApiKey":null}"#).expect("null key request"),
    );
    assert_eq!(cleared.nexus_api_key, None);

    let updated = normalize_settings(merge_launcher_settings(
        existing,
        serde_json::from_str(r#"{"nexusApiKey":" updated-key "}"#).expect("value key request"),
    ));
    assert_eq!(updated.nexus_api_key.as_deref(), Some("updated-key"));
}
