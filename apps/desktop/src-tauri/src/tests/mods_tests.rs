use super::{load_mod_project, save_mod_project, scan_mod_asset_index, scan_mod_projects, SaveModProjectRequest};
use crate::attached_api::test_support::{install_scaleup_attached_api_plugin, with_attached_api_root};
use crate::test_support::{create_temp_dir, write_file};
use std::fs;

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
    assert_eq!(projects[0].content_pack_for.as_deref(), Some("Pathoschild.ContentPatcher"));

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
    write_file(&broken_content_project.join("manifest.json"), sample_manifest());
    write_file(&broken_content_project.join("content.json"), "{ invalid");
    write_file(&valid_project.join("manifest.json"), sample_manifest());
    write_file(&valid_project.join("content.json"), sample_content());

    let projects = scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods");
    assert_eq!(projects.len(), 2);
    assert!(projects.iter().any(|project| project.absolute_path == valid_project.to_string_lossy()));
    assert!(projects.iter().any(|project| project.absolute_path == broken_content_project.to_string_lossy()));

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

    let detail = load_mod_project(project.to_string_lossy().into_owned()).expect("load relaxed mod project");
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

    let detail = load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");
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

    let detail = load_mod_project(project.to_string_lossy().into_owned()).expect("load mod project");
    assert_eq!(detail.plugin_kind, "content-patcher");
    assert_eq!(detail.capabilities.len(), 5);
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
fn save_mod_project_exports_and_preserves_other_files() {
    let root = create_temp_dir("mods-save");
    let source = root.join("SourcePack");
    let export = root.join("ExportPack");
    write_file(&source.join("manifest.json"), sample_manifest());
    write_file(&source.join("content.json"), sample_content());
    write_file(&source.join("assets").join("abigail.png"), "png-data");
    write_file(&source.join("i18n").join("default.json"), "{}");

    let request = SaveModProjectRequest {
        source_path: source.to_string_lossy().into_owned(),
        output_path: Some(export.to_string_lossy().into_owned()),
        manifest_json: sample_manifest().replace("Example Pack", "Exported Pack"),
        content_json: sample_content().replace("spring", "summer"),
    };

    let result = save_mod_project(request).expect("save mod project");
    assert_eq!(result.plugin_kind, "content-patcher");
    assert!(export.join("assets").join("abigail.png").is_file());
    assert!(export.join("i18n").join("default.json").is_file());
    let exported_manifest = fs::read_to_string(export.join("manifest.json")).expect("read manifest");
    let exported_content = fs::read_to_string(export.join("content.json")).expect("read content");
    assert!(exported_manifest.contains("Exported Pack"));
    assert!(exported_content.contains("summer"));
    assert_eq!(result.target_path, export.to_string_lossy());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_asset_index_collects_content_patcher_targets() {
    let root = create_temp_dir("mods-asset-index");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_index_content());

    let index = scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
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
fn scan_mod_asset_index_collects_targets_from_include_files() {
    let root = create_temp_dir("mods-asset-index-include");
    let project = root.join("Mods").join("ExamplePack");
    write_file(&project.join("manifest.json"), sample_manifest());
    write_file(&project.join("content.json"), sample_include_root_content());
    write_file(
        &project.join("assets").join("patches").join("items.json"),
        sample_include_child_content(),
    );

    let index = scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index");
    assert_eq!(index.mods.len(), 1);
    let mod_group = &index.mods[0];
    assert_eq!(mod_group.items.len(), 1);
    assert_eq!(mod_group.items[0].key, "(O)24");
    assert_eq!(mod_group.items[0].patch_ids, vec!["content.json->assets/patches/items.json:0"]);

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
fn scan_mod_projects_keeps_scaleup_provider_incompatible_without_sidecar_plugin() {
    let root = create_temp_dir("mods-required-dependency-scaleup-provider-without-sidecar");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    let provider = root.join("Mods").join("ScaleUpUnofficial");
    let attached_api_root = root.join("AppData").join("attached-api");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());
    write_file(&provider.join("manifest.json"), sample_scaleup_provider_manifest());

    let projects = with_attached_api_root(&attached_api_root, || {
        scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods")
    });
    let consumer_summary = projects
        .iter()
        .find(|project| project.unique_id.as_deref() == Some("ModForge.ScaleUpConsumer"))
        .expect("consumer project");
    assert_eq!(consumer_summary.status, "incompatible");
    assert_eq!(
        consumer_summary.missing_required_dependencies,
        vec!["Platonymous.ScaleUp".to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_mod_projects_treats_scaleup_unofficial_as_compatible_provider_when_sidecar_plugin_is_present() {
    let root = create_temp_dir("mods-required-dependency-scaleup-provider-sidecar");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    let provider = root.join("Mods").join("ScaleUpUnofficial");
    let attached_api_root = root.join("AppData").join("attached-api");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());
    write_file(&provider.join("manifest.json"), sample_scaleup_provider_manifest());
    install_scaleup_attached_api_plugin(&attached_api_root);

    let projects = with_attached_api_root(&attached_api_root, || {
        scan_mod_projects(root.to_string_lossy().into_owned()).expect("scan mods")
    });
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
    let attached_api_root = root.join("AppData").join("attached-api");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());

    let without_provider = with_attached_api_root(&attached_api_root, || {
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index without provider")
    });
    assert!(without_provider.mods.is_empty());

    let provider = root.join("Mods").join("ScaleUpUnofficial");
    write_file(&provider.join("manifest.json"), sample_scaleup_provider_manifest());
    install_scaleup_attached_api_plugin(&attached_api_root);

    let with_provider = with_attached_api_root(&attached_api_root, || {
        scan_mod_asset_index(root.to_string_lossy().into_owned()).expect("scan asset index with provider")
    });
    assert_eq!(with_provider.mods.len(), 1);
    assert_eq!(with_provider.mods[0].mod_id, "ModForge.ScaleUpConsumer");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_mod_project_allows_content_pack_when_scaleup_sidecar_plugin_is_present() {
    let root = create_temp_dir("mods-load-required-dependency-sidecar");
    let consumer = root.join("Mods").join("ScaleUpConsumer");
    let provider = root.join("Mods").join("ScaleUpUnofficial");
    let attached_api_root = root.join("AppData").join("attached-api");
    write_file(
        &consumer.join("manifest.json"),
        &sample_required_platonymous_dependency_manifest(),
    );
    write_file(&consumer.join("content.json"), sample_index_content());
    write_file(&provider.join("manifest.json"), sample_scaleup_provider_manifest());
    install_scaleup_attached_api_plugin(&attached_api_root);

    let detail = with_attached_api_root(&attached_api_root, || {
        load_mod_project(consumer.to_string_lossy().into_owned()).expect("sidecar plugin should satisfy dependency")
    });
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

    let error = load_mod_project(consumer.to_string_lossy().into_owned()).expect_err("missing dependency should block load");
    assert!(error.contains("Platonymous.ScaleUp"));

    fs::remove_dir_all(root).expect("cleanup");
}
