use crate::domain::launcher::install_manager::{
    install_staged_bundle_at_path, list_backup_sessions_at_root, restore_backup_session_at_path,
};
use crate::test_support::{create_temp_dir, write_file};
use serde_json::Value;
use std::fs;
use std::path::Path;

fn sample_manifest(unique_id: &str, name: &str, version: &str) -> String {
    format!(
        r#"{{
  "Name": "{name}",
  "Author": "ModForge",
  "Version": "{version}",
  "UniqueID": "{unique_id}"
}}"#
    )
}

fn sample_content_pack_manifest(
    unique_id: &str,
    name: &str,
    version: &str,
    content_pack_for: &str,
) -> String {
    format!(
        r#"{{
  "Name": "{name}",
  "Author": "ModForge",
  "Version": "{version}",
  "UniqueID": "{unique_id}",
  "ContentPackFor": {{
    "UniqueID": "{content_pack_for}"
  }}
}}"#
    )
}

fn read_json_file(path: &Path) -> Value {
    let content = fs::read_to_string(path).expect("read json file");
    serde_json::from_str(&content).expect("parse json file")
}

#[test]
fn install_staged_bundle_installs_multiple_mods_from_nested_roots() {
    let root = create_temp_dir("install-manager-multi-mod");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");

    write_file(
        &bundle_root.join("pack").join("Core").join("manifest.json"),
        &sample_manifest("ModForge.Core", "Core Pack", "1.0.0"),
    );
    write_file(
        &bundle_root.join("pack").join("Core").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("AddOn")
            .join("manifest.json"),
        &sample_manifest("ModForge.AddOn", "Add On", "2.0.0"),
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("AddOn")
            .join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install multiple nested mods");

    assert_eq!(result.installed_mods.len(), 2);
    assert_eq!(
        result
            .installed_mods
            .iter()
            .map(|item| item.unique_id.clone().unwrap_or_default())
            .collect::<Vec<_>>(),
        vec!["ModForge.AddOn".to_string(), "ModForge.Core".to_string()]
    );
    assert!(mods_root.join("Core").join("manifest.json").is_file());
    assert!(mods_root.join("AddOn").join("manifest.json").is_file());
    assert!(Path::new(&result.backup_path).is_dir());
    assert!(!result.upgraded);
    assert_eq!(result.previous_version, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_staged_bundle_uses_manifest_name_for_root_level_mod_folder() {
    let root = create_temp_dir("install-manager-root-level-mod");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");

    write_file(
        &bundle_root.join("manifest.json"),
        &sample_manifest("ModForge.RootLevel", "Root Level Pack", "1.0.0"),
    );
    write_file(
        &bundle_root.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install root-level mod");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(result.installed_mods[0].mod_name, "Root Level Pack");
    assert!(
        mods_root
            .join("Root Level Pack")
            .join("manifest.json")
            .is_file()
    );
    assert!(!mods_root.join("bundle").join("manifest.json").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_staged_bundle_prefers_a_non_content_pack_as_the_primary_install_result() {
    let root = create_temp_dir("install-manager-primary-selection");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");

    write_file(
        &bundle_root
            .join("translations")
            .join("AddOn")
            .join("manifest.json"),
        &sample_content_pack_manifest("ModForge.AddOn", "Add On", "2.0.0", "ModForge.Core"),
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("AddOn")
            .join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );
    write_file(
        &bundle_root.join("pack").join("Core").join("manifest.json"),
        &sample_manifest("ModForge.Core", "Core Pack", "1.0.0"),
    );
    write_file(
        &bundle_root.join("pack").join("Core").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install nested mods with content pack");

    assert_eq!(result.mod_name, "Core Pack");
    assert_eq!(result.unique_id.as_deref(), Some("ModForge.Core"));

    let backup_metadata = read_json_file(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .as_path(),
    );
    assert_eq!(
        backup_metadata.get("primaryModName"),
        Some(&Value::String("Core Pack".to_string()))
    );
    assert_eq!(
        backup_metadata.get("primaryVersion"),
        Some(&Value::String("1.0.0".to_string()))
    );
    let installed_mods = backup_metadata
        .get("installedMods")
        .and_then(Value::as_array)
        .expect("installed mods metadata");
    assert_eq!(installed_mods.len(), 2);
    assert_eq!(
        installed_mods[0].get("modName"),
        Some(&Value::String("Add On".to_string()))
    );
    assert_eq!(
        installed_mods[0].get("operation"),
        Some(&Value::String("freshInstall".to_string()))
    );
    assert_eq!(
        installed_mods[1].get("modName"),
        Some(&Value::String("Core Pack".to_string()))
    );
    assert!(backup_metadata.get("createdAtMs").is_some());

    let summaries = list_backup_sessions_at_root(&backup_root, Some(&mods_root))
        .expect("list backups with context");
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].primary_mod_name.as_deref(), Some("Core Pack"));
    assert_eq!(summaries[0].primary_version.as_deref(), Some("1.0.0"));
    assert_eq!(summaries[0].mod_count, 2);
    assert!(summaries[0].created_at_ms > 0);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_staged_bundle_preserves_config_and_existing_i18n_on_upgrade() {
    let root = create_temp_dir("install-manager-upgrade");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    let existing_root = mods_root.join("[CP] Example Pack");

    write_file(
        &existing_root.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "1.0.0"),
    );
    write_file(
        &existing_root.join("config.json"),
        r#"{"EnableFeature":true,"UserOnly":"keep-me"}"#,
    );
    write_file(
        &existing_root.join("i18n").join("default.json"),
        r#"{"Greeting":"old","UserOnly":"value"}"#,
    );
    write_file(
        &existing_root.join("i18n").join("zh.json"),
        r#"{"Greeting":"你好"}"#,
    );
    write_file(
        &existing_root.join("assets").join("keep.txt"),
        "same-content",
    );

    write_file(
        &bundle_root.join("Incoming Example").join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "2.0.0"),
    );
    write_file(
        &bundle_root.join("Incoming Example").join("config.json"),
        r#"{"EnableFeature":false,"NewDefault":"fresh"}"#,
    );
    write_file(
        &bundle_root
            .join("Incoming Example")
            .join("i18n")
            .join("default.json"),
        r#"{"Greeting":"new","NewLine":"present"}"#,
    );
    write_file(
        &bundle_root
            .join("Incoming Example")
            .join("assets")
            .join("keep.txt"),
        "same-content",
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("upgrade existing mod");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].target_path,
        existing_root.to_string_lossy().to_string()
    );
    assert!(result.upgraded);
    assert_eq!(result.previous_version.as_deref(), Some("1.0.0"));
    assert_eq!(result.version.as_deref(), Some("2.0.0"));

    let merged_config = read_json_file(&existing_root.join("config.json"));
    assert_eq!(merged_config.get("EnableFeature"), Some(&Value::Bool(true)));
    assert_eq!(
        merged_config.get("UserOnly"),
        Some(&Value::String("keep-me".to_string()))
    );
    assert_eq!(
        merged_config.get("NewDefault"),
        Some(&Value::String("fresh".to_string()))
    );

    let merged_default = read_json_file(&existing_root.join("i18n").join("default.json"));
    assert_eq!(
        merged_default.get("Greeting"),
        Some(&Value::String("old".to_string()))
    );
    assert_eq!(
        merged_default.get("UserOnly"),
        Some(&Value::String("value".to_string()))
    );
    assert_eq!(
        merged_default.get("NewLine"),
        Some(&Value::String("present".to_string()))
    );

    let zh_json = read_json_file(&existing_root.join("i18n").join("zh.json"));
    assert_eq!(
        zh_json.get("Greeting"),
        Some(&Value::String("你好".to_string()))
    );

    let backup_metadata = read_json_file(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .as_path(),
    );
    let saved_paths = backup_metadata
        .get("entries")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .and_then(|entry| entry.get("savedPaths"))
        .and_then(Value::as_array)
        .expect("saved paths");
    let saved_paths = saved_paths
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    assert!(saved_paths.contains(&"config.json"));
    assert!(saved_paths.contains(&"i18n/default.json"));
    assert!(!saved_paths.contains(&"i18n/zh.json"));
    assert!(!saved_paths.contains(&"assets/keep.txt"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_staged_bundle_merges_overlay_language_pack_and_restore_recovers_previous_state() {
    let root = create_temp_dir("install-manager-overlay-restore");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    let target_root = mods_root.join("[CP] Example Pack");

    write_file(
        &target_root.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "1.0.0"),
    );
    write_file(
        &target_root.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[{"Action":"EditData","Target":"Strings\\UI"}]}"#,
    );
    write_file(
        &target_root.join("i18n").join("default.json"),
        r#"{"Greeting":"old"}"#,
    );
    write_file(&target_root.join("assets").join("theme.png"), "old-theme");

    write_file(
        &bundle_root
            .join("translations")
            .join("[CP] Example Pack")
            .join("i18n")
            .join("zh.json"),
        r#"{"Greeting":"你好","OverlayOnly":"added"}"#,
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("[CP] Example Pack")
            .join("content.json"),
        r#"{"Format":"2.0.0","Overlay":"yes"}"#,
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("[CP] Example Pack")
            .join("assets")
            .join("theme.png"),
        "overlay-theme",
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install overlay language pack");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        list_backup_sessions_at_root(&backup_root, Some(&mods_root))
            .expect("list backups")
            .len(),
        1
    );

    let merged_content = read_json_file(&target_root.join("content.json"));
    assert_eq!(
        merged_content.get("Overlay"),
        Some(&Value::String("yes".to_string()))
    );
    assert!(merged_content.get("Changes").is_some());

    let zh_json = read_json_file(&target_root.join("i18n").join("zh.json"));
    assert_eq!(
        zh_json.get("Greeting"),
        Some(&Value::String("你好".to_string()))
    );
    assert_eq!(
        zh_json.get("OverlayOnly"),
        Some(&Value::String("added".to_string()))
    );
    assert_eq!(
        fs::read_to_string(target_root.join("assets").join("theme.png"))
            .expect("read overlay asset"),
        "overlay-theme"
    );

    let backup_metadata = read_json_file(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .as_path(),
    );
    let saved_paths = backup_metadata
        .get("entries")
        .and_then(Value::as_array)
        .and_then(|entries| entries.first())
        .and_then(|entry| entry.get("savedPaths"))
        .and_then(Value::as_array)
        .expect("saved paths");
    let saved_paths = saved_paths
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    assert!(saved_paths.contains(&"content.json"));
    assert!(saved_paths.contains(&"assets/theme.png"));
    assert!(!saved_paths.contains(&"manifest.json"));

    let restore_result =
        restore_backup_session_at_path(Path::new(&result.backup_path), Some(&mods_root))
            .expect("restore backup");
    assert_eq!(restore_result.backup_path, result.backup_path);

    let restored_content = read_json_file(&target_root.join("content.json"));
    assert_eq!(restored_content.get("Overlay"), None);
    assert!(restored_content.get("Changes").is_some());
    assert!(!target_root.join("i18n").join("zh.json").exists());
    assert_eq!(
        fs::read_to_string(target_root.join("assets").join("theme.png"))
            .expect("read restored asset"),
        "old-theme"
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn restore_recovers_preinstall_state_after_upgrade_and_overlay_on_same_target() {
    let root = create_temp_dir("install-manager-upgrade-overlay-restore");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    let target_root = mods_root.join("[CP] Example Pack");

    write_file(
        &target_root.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "1.0.0"),
    );
    write_file(
        &target_root.join("content.json"),
        r#"{"Format":"2.0.0","Source":"old","Changes":[{"Action":"EditData","Target":"Data\\Events"}]}"#,
    );
    write_file(
        &target_root.join("i18n").join("default.json"),
        r#"{"Greeting":"old"}"#,
    );

    write_file(
        &bundle_root.join("Incoming Example").join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "2.0.0"),
    );
    write_file(
        &bundle_root.join("Incoming Example").join("content.json"),
        r#"{"Format":"2.0.0","Source":"upgrade","Changes":[{"Action":"EditData","Target":"Data\\Events"}],"UpgradeOnly":"new"}"#,
    );
    write_file(
        &bundle_root
            .join("translations")
            .join("[CP] Example Pack")
            .join("content.json"),
        r#"{"Format":"2.0.0","Source":"overlay","OverlayOnly":"applied"}"#,
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install upgraded bundle with overlay");

    let installed_content = read_json_file(&target_root.join("content.json"));
    assert_eq!(
        installed_content.get("Source"),
        Some(&Value::String("overlay".to_string()))
    );
    assert_eq!(
        installed_content.get("UpgradeOnly"),
        Some(&Value::String("new".to_string()))
    );
    assert_eq!(
        installed_content.get("OverlayOnly"),
        Some(&Value::String("applied".to_string()))
    );

    restore_backup_session_at_path(Path::new(&result.backup_path), Some(&mods_root))
        .expect("restore upgraded bundle with overlay");

    let restored_content = read_json_file(&target_root.join("content.json"));
    assert_eq!(
        restored_content.get("Source"),
        Some(&Value::String("old".to_string()))
    );
    assert_eq!(restored_content.get("UpgradeOnly"), None);
    assert_eq!(restored_content.get("OverlayOnly"), None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn restore_fails_when_a_saved_backup_file_is_missing() {
    let root = create_temp_dir("install-manager-missing-backup-file");
    let bundle_root = root.join("bundle");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    let target_root = mods_root.join("[CP] Example Pack");

    write_file(
        &target_root.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "1.0.0"),
    );
    write_file(
        &target_root.join("content.json"),
        r#"{"Format":"2.0.0","Source":"old"}"#,
    );

    write_file(
        &bundle_root.join("Incoming Example").join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack", "Example Pack", "2.0.0"),
    );
    write_file(
        &bundle_root.join("Incoming Example").join("content.json"),
        r#"{"Format":"2.0.0","Source":"new"}"#,
    );

    let result = install_staged_bundle_at_path(&bundle_root, &mods_root, &backup_root)
        .expect("install upgraded bundle");
    let saved_content_backup = Path::new(&result.backup_path)
        .join("entries")
        .join("entry-01")
        .join("before")
        .join("content.json");
    fs::remove_file(&saved_content_backup).expect("remove saved content backup");

    let restore_error =
        restore_backup_session_at_path(Path::new(&result.backup_path), Some(&mods_root))
            .expect_err("reject incomplete backup restore");
    assert!(restore_error.to_string().contains("missing backup file"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn list_and_restore_backups_are_scoped_to_the_matching_mods_path() {
    let root = create_temp_dir("install-manager-backup-scope");
    let backup_root = root.join("backups");
    let mods_a = root.join("ModsA");
    let mods_b = root.join("ModsB");
    let bundle_a = root.join("bundle-a");
    let bundle_b = root.join("bundle-b");

    write_file(
        &bundle_a.join("[CP] A").join("manifest.json"),
        &sample_manifest("ModForge.A", "Pack A", "1.0.0"),
    );
    write_file(
        &bundle_a.join("[CP] A").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );
    let result_a =
        install_staged_bundle_at_path(&bundle_a, &mods_a, &backup_root).expect("install bundle a");

    write_file(
        &bundle_b.join("[CP] B").join("manifest.json"),
        &sample_manifest("ModForge.B", "Pack B", "1.0.0"),
    );
    write_file(
        &bundle_b.join("[CP] B").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );
    let result_b =
        install_staged_bundle_at_path(&bundle_b, &mods_b, &backup_root).expect("install bundle b");

    let backups_for_a =
        list_backup_sessions_at_root(&backup_root, Some(&mods_a)).expect("list backups for a");
    let backups_for_b =
        list_backup_sessions_at_root(&backup_root, Some(&mods_b)).expect("list backups for b");

    assert_eq!(backups_for_a.len(), 1);
    assert_eq!(backups_for_a[0].backup_id, result_a.backup_id);
    assert_eq!(backups_for_b.len(), 1);
    assert_eq!(backups_for_b[0].backup_id, result_b.backup_id);

    let restore_error =
        restore_backup_session_at_path(Path::new(&result_a.backup_path), Some(&mods_b))
            .expect_err("reject mismatched restore");
    assert!(restore_error.to_string().contains("belongs to modsPath"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn list_backup_sessions_supports_legacy_metadata_without_mod_context() {
    let root = create_temp_dir("install-manager-legacy-metadata");
    let backup_root = root.join("backups");
    let mods_root = root.join("Mods");
    let session_root = backup_root.join("install-1700000000000");
    fs::create_dir_all(&mods_root).expect("create mods root");
    fs::create_dir_all(&session_root).expect("create legacy backup dir");

    let legacy_metadata = format!(
        r#"{{
  "backupId": "install-1700000000000",
  "backupPath": "{}",
  "createdAtMs": 1700000000000,
  "modsPath": "{}",
  "entries": [
    {{
      "entryId": "entry-01",
      "targetPath": "{}",
      "existedBefore": true,
      "savedPaths": ["content.json"],
      "addedPaths": ["i18n/zh.json"]
    }}
  ]
}}"#,
        session_root.to_string_lossy().replace('\\', "\\\\"),
        mods_root.to_string_lossy().replace('\\', "\\\\"),
        mods_root
            .join("Example")
            .to_string_lossy()
            .replace('\\', "\\\\"),
    );
    fs::write(session_root.join("metadata.json"), legacy_metadata).expect("write legacy metadata");

    let sessions =
        list_backup_sessions_at_root(&backup_root, Some(&mods_root)).expect("list legacy backups");
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].backup_id, "install-1700000000000");
    assert_eq!(sessions[0].created_at_ms, 1700000000000);
    assert_eq!(sessions[0].primary_mod_name, None);
    assert_eq!(sessions[0].primary_version, None);
    assert_eq!(sessions[0].mod_count, 1);
    assert_eq!(sessions[0].delete_count, 1);
    assert_eq!(sessions[0].overwrite_count, 1);

    fs::remove_dir_all(root).expect("cleanup");
}
