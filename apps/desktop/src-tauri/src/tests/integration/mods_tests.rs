use super::{
    ContentPatcherI18nFileInput, SaveModI18nFilesRequest, inspect_mod_archive, load_mod_project,
    save_mod_i18n_files, scan_mod_asset_index, scan_mod_projects,
};
use crate::test_support::{create_temp_dir, write_file};
use std::fs;
use std::io::Write;
use zip::write::SimpleFileOptions;

fn sample_manifest() -> &'static str {
    r#"{
  "Name": "Example Pack",
  "Author": "ModForge",
  "Version": "1.0.0",
  "Description": "Test content pack",
  "UniqueID": "ModForge.ExamplePack",
  "ContentPackFor": {
    "UniqueID": "Pathoschild.ContentPatcher",
    "MinimumVersion": "2.0.0"
  }
}"#
}

#[test]
fn inspect_mod_archive_loads_one_project_without_installing_it() {
    let root = create_temp_dir("mods-inspect-archive");
    let archive_path = root.join("external-pack.zip");
    let file = fs::File::create(&archive_path).expect("create archive");
    let mut archive = zip::ZipWriter::new(file);
    archive
        .start_file("Example/manifest.json", SimpleFileOptions::default())
        .expect("manifest entry");
    archive
        .write_all(sample_manifest().as_bytes())
        .expect("manifest contents");
    archive
        .start_file("Example/content.json", SimpleFileOptions::default())
        .expect("content entry");
    archive
        .write_all(br#"{"Format":"2.7.0","Changes":[]}"#)
        .expect("content contents");
    archive.finish().expect("finish archive");

    let detail = inspect_mod_archive(archive_path.to_string_lossy().into_owned())
        .expect("inspect mod archive");
    assert_eq!(detail.summary.name, "Example Pack");
    assert_eq!(detail.summary.absolute_path, archive_path.to_string_lossy());
    assert_eq!(detail.plugin_kind, "content-patcher");
    assert!(!root.join("Example").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

fn manifest_with_unique_id_and_dependencies(unique_id: &str, dependencies: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Pack",
  "Author": "ModForge",
  "Version": "1.0.0",
  "Description": "Test content pack",
  "UniqueID": "{unique_id}",
  "ContentPackFor": {{
    "UniqueID": "Pathoschild.ContentPatcher",
    "MinimumVersion": "2.0.0"
  }},
  "Dependencies": {dependencies}
}}"#
    )
}

fn sample_scaleup_provider_manifest() -> &'static str {
    r#"{
  "Name": "ScaleUpUnofficial",
  "Author": "Arborsm, Platonymous",
  "Version": "2.6.0",
  "Description": "Allows adding higher resolution textures via ContentPatcher",
  "UniqueID": "Arborsm.ScaleUpUnofficial"
}"#
}

fn sample_required_platonymous_dependency_manifest() -> String {
    manifest_with_unique_id_and_dependencies(
        "ModForge.ScaleUpConsumer",
        r#"[
    {
      "UniqueID": "Platonymous.ScaleUp",
      "IsRequired": true
    }
  ]"#,
    )
}

fn sample_content() -> &'static str {
    r#"{
  "Format": "2.0.0",
  "ConfigSchema": {
    "EnableAltArt": {
      "AllowValues": "true, false",
      "Default": "false"
    }
  },
  "DynamicTokens": [
    {
      "Name": "FestivalMode",
      "Value": "false"
    }
  ],
  "Changes": [
    {
      "LogName": "Portrait Swap",
      "Action": "Load",
      "Target": "Portraits/Abigail",
      "FromFile": "assets/abigail.png",
      "When": {
        "Season": "spring"
      }
    },
    {
      "Action": "EditData",
      "Target": "Data/Objects"
    }
  ]
}"#
}

fn sample_index_content() -> &'static str {
    r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditMap",
      "Target": "Maps/Town"
    },
    {
      "Action": "EditData",
      "Target": "Data/Events/Town"
    },
    {
      "Action": "Load",
      "Target": [ "Characters/Abigail", "Portraits/Abigail" ]
    },
    {
      "Action": "EditData",
      "Target": "Data/Buildings",
      "Entries": {
        "Coop": {}
      }
    },
    {
      "Action": "EditData",
      "Target": "Data/Objects",
      "Entries": {
        "24": {}
      }
    }
  ]
}"#
}

fn sample_relaxed_content() -> &'static str {
    r#"{
  "Format": "2.0.0",
  // this comment is valid in real CP packs
  "Changes": [
    {
      "Action": "Load",
      "Target": "Maps/Town",
      "FromFile": "assets/town.tmx",
    },
  ],
}"#
}

fn sample_include_root_content() -> &'static str {
    r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "assets/patches/items.json"
    }
  ]
}"#
}

fn sample_include_child_content() -> &'static str {
    r#"{
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Data/Objects",
      "Entries": {
        "24": {}
      }
    }
  ]
}"#
}

#[test]
fn scan_mod_projects_detects_content_patcher_pack() {
    let root = create_temp_dir("mods-scan");
    let mods_root = root.join("Mods");
    let project = mods_root.join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].plugin_kind, "content-patcher");
    assert_eq!(projects[0].name, "Example Pack");
    assert!(!projects[0].has_i18n);
    assert_eq!(
        projects[0].content_pack_for.as_deref(),
        Some("Pathoschild.ContentPatcher")
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_detects_i18n_files() {
    let root = create_temp_dir("mods-scan-i18n");
    let mods_root = root.join("Mods");
    let project = mods_root.join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());
    write_file(
        &project.join("i18n").join("default.json"),
        r#"{
  "ui.delete": "Delete {{itemName}}?",
  "ui.save": "Save"
}"#,
    );

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].plugin_kind, "content-patcher");
    assert!(projects[0].has_i18n);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_recurses_into_nested_directories() {
    let root = create_temp_dir("mods-nested-scan");
    let project = root.join("Mods").join("Author").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].absolute_path, project.to_string_lossy());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_skips_invalid_projects_without_failing() {
    let root = create_temp_dir("mods-broken-scan");
    let broken_manifest_project = root.join("Mods").join("BrokenManifest");
    let broken_content_project = root.join("Mods").join("BrokenContent");
    let valid_project = root.join("Mods").join("ValidPack");

    write_file(&broken_manifest_project.join("manifest.json"), "{ invalid");
    write_file(
        &broken_content_project.join("manifest.json"),
        sample_manifest(),
    );
    write_file(&broken_content_project.join("content.json"), "{ invalid");
    write_file(&valid_project.join("manifest.json"), sample_manifest());
    write_file(&valid_project.join("content.json"), sample_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 2);
    assert!(
        projects
            .iter()
            .any(|project| project.absolute_path == valid_project.to_string_lossy())
    );
    assert!(
        projects
            .iter()
            .any(|project| project.absolute_path == broken_content_project.to_string_lossy())
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_accepts_mods_directory_as_input() {
    let root = create_temp_dir("mods-root-input");
    let mods_root = root.join("Mods");
    let project = mods_root.join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());

    let projects = scan_mod_projects(mods_root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].absolute_path, project.to_string_lossy());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_accepts_relaxed_json_content() {
    let root = create_temp_dir("mods-relaxed-json");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_relaxed_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].plugin_kind, "content-patcher");

    let detail =
        load_mod_project(project.to_string_lossy().into_owned()).expect("load relaxed mod project");
    assert_eq!(detail.plugin_kind, "content-patcher");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_accepts_bom_nbsp_and_raw_newlines() {
    let root = create_temp_dir("mods-relaxed-edge-cases");
    let project = root.join("ExamplePack");
    let manifest = format!("\u{feff}{}", sample_manifest());
    let nbsp = '\u{00A0}'.to_string();
    let content = format!(
        concat!(
            "{{\n",
            "\"Format\": \"2.0.0\",\n",
            "\"Changes\": [\n",
            "\t{{\n",
            "{0} {0} {0}\"Action\": \"EditData\",\n",
            "{0} {0} {0}\"Target\": \"Data/Events/Town\",\n",
            "{0} {0} {0}\"Entries\": {{\n",
            "{0} {0} {0}  \"MuseumBook\": \"Line 1\n",
            "Line 2\"\n",
            "{0} {0} {0}}}\n",
            "\t}}\n",
            "]\n",
            "}}"
        ),
        nbsp
    );

    write_file(&project.join("manifest.json"), &manifest);
    write_file(&project.join("content.json"), &content);

    let detail =
        load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");
    assert_eq!(detail.plugin_kind, "content-patcher");
    let cp = detail.content_patcher.expect("content patcher payload");
    assert_eq!(cp.change_count, 1);
    assert_eq!(cp.patches[0].target, "Data/Events/Town");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_returns_patch_summary_and_diagnostics() {
    let root = create_temp_dir("mods-load");
    let project = root.join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());

    let detail =
        load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");
    assert_eq!(detail.plugin_kind, "content-patcher");
    let cp = detail.content_patcher.expect("content patcher payload");
    assert_eq!(cp.change_count, 2);
    assert_eq!(cp.dynamic_token_count, 1);
    assert_eq!(cp.config_keys, vec!["EnableAltArt"]);
    assert_eq!(cp.patches[0].log_name, "Portrait Swap");
    assert_eq!(cp.patches[0].action, "Load");
    assert_eq!(cp.patches[1].target, "Data/Objects");
    assert!(detail.diagnostics.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_returns_i18n_files_for_non_content_patcher_mods() {
    let root = create_temp_dir("mods-load-i18n-non-cp");
    let project = root.join("SMAPIPack");
    write_file(
        &project.join("manifest.json"),
        r#"{
  "Name": "SMAPI Pack",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "ModForge.SMAPIPack",
  "EntryDll": "SMAPIPack.dll"
}"#,
    );
    write_file(
        &project.join("i18n").join("default.json"),
        r#"{
  "ui.delete": "Delete {{itemName}}?"
}"#,
    );

    let detail =
        load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");

    assert_eq!(detail.plugin_kind, "unknown");
    assert!(detail.content_patcher.is_none());
    assert!(detail.summary.has_i18n);
    assert_eq!(detail.i18n_files.len(), 1);
    assert_eq!(detail.i18n_files[0].locale, "default");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_returns_i18n_translation_files() {
    let root = create_temp_dir("mods-load-i18n");
    let project = root.join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_content());
    write_file(
        &project.join("i18n").join("default.json"),
        r#"{
  "ui.delete": "Delete {{itemName}}?",
  "ui.save": "Save"
}"#,
    );
    write_file(
        &project.join("i18n").join("zh-CN.json"),
        r#"{
  "ui.delete": "删除 {{itemName}}？"
}"#,
    );

    let detail =
        load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");
    let cp = detail.content_patcher.expect("content patcher payload");

    assert!(cp.has_i18n);
    assert_eq!(cp.i18n_files.len(), 2);
    assert_eq!(cp.i18n_files[0].locale, "default");
    assert_eq!(cp.i18n_files[0].entry_count, 2);
    assert!(cp.i18n_files[0].raw_json.contains("ui.delete"));
    assert_eq!(cp.i18n_files[1].locale, "zh-CN");
    assert_eq!(cp.i18n_files[1].entry_count, 1);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn save_mod_i18n_files_only_writes_requested_locales() {
    let root = create_temp_dir("mods-save-i18n-only-requested");
    let source = root.join("SourcePack");
    write_file(&source.join("manifest.json"), sample_manifest());
    write_file(&source.join("content.json"), sample_content());
    write_file(
        &source.join("i18n").join("default.json"),
        r#"{"ui.save":"Save"}"#,
    );
    write_file(
        &source.join("i18n").join("fr.json"),
        r#"{"ui.save":"Enregistrer"}"#,
    );

    let result = save_mod_i18n_files(SaveModI18nFilesRequest {
        source_path: source.to_string_lossy().into_owned(),
        i18n_files: vec![ContentPatcherI18nFileInput {
            locale: "default".to_string(),
            raw_json: r#"{"ui.save":"Save now"}"#.to_string(),
        }],
    })
    .expect("save requested i18n file");

    assert_eq!(result.written_locales, vec!["default"]);
    assert!(
        fs::read_to_string(source.join("i18n/default.json"))
            .expect("read default")
            .contains("Save now")
    );
    assert!(
        fs::read_to_string(source.join("i18n/fr.json"))
            .expect("read untouched locale")
            .contains("Enregistrer")
    );
    assert!(source.join("manifest.json").is_file());
    assert!(source.join("content.json").is_file());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn save_mod_i18n_files_rejects_invalid_project_locale_and_json() {
    let root = create_temp_dir("mods-save-i18n-validation");
    let non_project = root.join("NotAMod");
    fs::create_dir_all(&non_project).expect("create non-project");
    let request = |source_path: String, locale: &str, raw_json: &str| SaveModI18nFilesRequest {
        source_path,
        i18n_files: vec![ContentPatcherI18nFileInput {
            locale: locale.to_string(),
            raw_json: raw_json.to_string(),
        }],
    };

    assert!(
        save_mod_i18n_files(request(
            non_project.to_string_lossy().into_owned(),
            "default",
            "{}",
        ))
        .is_err()
    );

    let source = root.join("SourcePack");
    write_file(&source.join("manifest.json"), sample_manifest());
    write_file(&source.join("content.json"), sample_content());
    let source_path = source.to_string_lossy().into_owned();
    assert!(save_mod_i18n_files(request(source_path.clone(), "../escape", "{}")).is_err());
    assert!(save_mod_i18n_files(request(source_path, "default", "[]")).is_err());
    assert!(!root.join("escape.json").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn save_mod_i18n_files_preserves_buffers_on_write_failure() {
    let root = create_temp_dir("mods-save-i18n-write-failure");
    let source = root.join("SourcePack");
    write_file(&source.join("manifest.json"), sample_manifest());
    write_file(&source.join("content.json"), sample_content());
    write_file(&source.join("i18n"), "not a directory");

    let error = save_mod_i18n_files(SaveModI18nFilesRequest {
        source_path: source.to_string_lossy().into_owned(),
        i18n_files: vec![ContentPatcherI18nFileInput {
            locale: "default".to_string(),
            raw_json: r#"{"ui.save":"Unsaved buffer"}"#.to_string(),
        }],
    })
    .expect_err("i18n directory creation must fail");
    assert!(error.to_string().contains("i18n"));
    assert_eq!(
        fs::read_to_string(source.join("i18n")).expect("read blocker"),
        "not a directory"
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_collects_content_patcher_targets() {
    let root = create_temp_dir("mods-asset-index");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_index_content());

    let index =
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
    assert_eq!(index.mods.len(), 1);
    let mod_group = &index.mods[0];
    assert_eq!(mod_group.maps[0].key, "Content/Maps/Town.xnb");
    assert_eq!(mod_group.events[0].key, "Content/Data/Events/Town.xnb");
    assert_eq!(mod_group.characters[0].key, "Abigail");
    assert_eq!(mod_group.buildings[0].key, "Coop");
    assert_eq!(mod_group.items[0].key, "(O)24");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_merges_data_characters_target_field_into_base_character_entry() {
    let root = create_temp_dir("mods-asset-index-character-target-field");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(
        &project.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": [ "Characters/Emily", "Portraits/Emily" ]
    },
    {
      "Action": "EditData",
      "Target": "Data/Characters",
      "TargetField": [ "Emily", "Appearance" ],
      "Entries": {
        "{{ModId}}.EmilySpring": {
          "Id": "{{ModId}}.EmilySpring",
          "Condition": "SEASON spring",
          "Sprite": "Characters/Emily",
          "Portrait": "Portraits/Emily_Spring"
        }
      }
    }
  ]
}"#,
    );

    let index =
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
    let mod_group = &index.mods[0];
    assert_eq!(mod_group.characters.len(), 1);

    let emily = mod_group
        .characters
        .iter()
        .find(|reference| reference.key == "Emily")
        .expect("base Emily character entry");
    assert_eq!(
        emily.targets,
        vec![
            "Characters/Emily".to_string(),
            "Data/Characters".to_string(),
            "Portraits/Emily".to_string(),
        ]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_merges_character_variant_targets_into_base_character_entry() {
    let root = create_temp_dir("mods-asset-index-character-variant-targets");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(
        &project.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "Characters/Emily.xnb, Characters/Emily_Beach.xnb, Portraits/Emily_Spring, Portraits/Emily_Fall"
    },
    {
      "Action": "EditData",
      "Target": "Data/Characters",
      "TargetField": [ "Emily", "Appearance" ],
      "Entries": {
        "{{ModId}}.EmilySpring": {
          "Id": "{{ModId}}.EmilySpring",
          "Condition": "SEASON spring",
          "Sprite": "Characters/Emily",
          "Portrait": "Portraits/Emily_Spring"
        },
        "{{ModId}}.EmilyBeach": {
          "Id": "{{ModId}}.EmilyBeach",
          "IsIslandAttire": true,
          "Sprite": "Characters/Emily_Beach",
          "Portrait": "Portraits/Emily_Fall"
        }
      }
    }
  ]
}"#,
    );

    let index =
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
    let mod_group = &index.mods[0];
    assert_eq!(mod_group.characters.len(), 1);

    let emily = mod_group
        .characters
        .iter()
        .find(|reference| reference.key == "Emily")
        .expect("base Emily character entry");
    assert_eq!(
        emily.targets,
        vec![
            "Characters/Emily.xnb".to_string(),
            "Characters/Emily_Beach.xnb".to_string(),
            "Data/Characters".to_string(),
            "Portraits/Emily_Fall".to_string(),
            "Portraits/Emily_Spring".to_string(),
        ]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_collects_targets_from_include_files() {
    let root = create_temp_dir("mods-asset-index-include");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_include_root_content());
    write_file(
        &project.join("assets").join("patches").join("items.json"),
        sample_include_child_content(),
    );

    let index =
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
    assert_eq!(index.mods.len(), 1);
    let mod_group = &index.mods[0];
    assert_eq!(mod_group.items.len(), 1);
    assert_eq!(mod_group.items[0].key, "(O)24");
    assert_eq!(
        mod_group.items[0].patch_ids,
        vec!["content.json->assets/patches/items.json:0"]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_marks_required_dependency_content_pack_incompatible_when_missing() {
    let root = create_temp_dir("mods-required-dependency-missing");
    let project = root.join("Mods").join("ScaleUpConsumer");
    write_file(
        &project.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&project.join("content.json"), sample_index_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0].plugin_kind, "content-patcher");
    assert_eq!(projects[0].status, "incompatible");
    assert_eq!(
        projects[0].missing_required_dependencies,
        vec!["Platonymous.ScaleUp".to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_treats_scaleup_unofficial_as_compatible_provider_via_built_in_registry() {
    let root = create_temp_dir("mods-required-dependency-scaleup-provider-built-in");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    let provider = root.join("Mods").join("ScaleUpUnofficial");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());
    write_file(
        &provider.join("manifest.json"),
        sample_scaleup_provider_manifest(),
    );

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    let consumer_summary = projects
        .iter()
        .find(|project| project.unique_id.as_deref() == Some("ModForge.ScaleUpConsumer"))
        .expect("consumer project");
    assert_eq!(consumer_summary.status, "ready");
    assert!(consumer_summary.missing_required_dependencies.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_excludes_content_packs_with_missing_required_dependencies() {
    let root = create_temp_dir("mods-asset-index-required-dependency");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());

    let without_provider = scan_mod_asset_index(root.to_string_lossy().into_owned())
        .expect("scan asset index without provider");
    assert!(without_provider.mods.is_empty());

    let provider = root.join("Mods").join("ScaleUpUnofficial");
    write_file(
        &provider.join("manifest.json"),
        sample_scaleup_provider_manifest(),
    );
    let with_provider = scan_mod_asset_index(root.to_string_lossy().into_owned())
        .expect("scan asset index with provider");
    assert_eq!(with_provider.mods.len(), 1);
    assert_eq!(with_provider.mods[0].mod_id, "ModForge.ScaleUpConsumer");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_allows_content_pack_when_scaleup_provider_matches_built_in_registry() {
    let root = create_temp_dir("mods-load-required-dependency-built-in");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    let provider = root.join("Mods").join("ScaleUpUnofficial");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());
    write_file(
        &provider.join("manifest.json"),
        sample_scaleup_provider_manifest(),
    );

    let detail = load_mod_project(consumer.to_string_lossy().into_owned())
        .expect("built-in registry should satisfy dependency");
    assert_eq!(detail.summary.status, "ready");
    assert!(detail.summary.missing_required_dependencies.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_rejects_content_pack_with_missing_required_dependencies() {
    let root = create_temp_dir("mods-load-required-dependency");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());

    let error = load_mod_project(consumer.to_string_lossy().into_owned())
        .expect_err("missing dependency should block load");
    assert!(error.to_string().contains("Platonymous.ScaleUp"));

    fs::remove_dir_all(root).expect("cleanup");
}
