//! Unit tests for the compat plugin manifest loader and validator (format 1).
//!
//! Covers the 9-rule validation table with positive and negative samples, plus
//! the bad-file isolation guarantee (one bad plugin does not affect a good
//! sibling).

use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::modding::compat_plugin::{
    AttachedApiContribution, AttachedApiTargetDecl, CompatPluginContributions,
    CompatPluginManifest, PluginLoadReport, build_summaries_from_report, load_plugin_manifests,
};
use crate::test_support::create_temp_dir;

/// Writes a manifest.json with the given body into a child directory of `root`
/// named after the id, returning the plugin directory path.
fn write_plugin(root: &Path, id: &str, body: &str) -> PathBuf {
    let dir = root.join(id);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("manifest.json"), body).unwrap();
    dir
}

/// A minimal valid manifest body for the ScaleUp-equivalent plugin.
fn valid_manifest_body() -> String {
    r#"{
  "format": 1,
  "id": "arborsm.scaleup-unofficial",
  "name": "ScaleUp (Unofficial) 兼容",
  "targets": ["Arborsm.ScaleUpUnofficial"],
  "contributions": {
    "attachedApi": {
      "providerUniqueId": "Arborsm.ScaleUpUnofficial",
      "providedUniqueIds": ["Platonymous.ScaleUp", "BleakCodex.SpritesInDetail"],
      "targets": [
        { "assetPath": "Assets", "assetKind": "json" },
        { "assetPath": "PreviewTexture", "assetKind": "image" }
      ]
    }
  }
}"#
    .to_string()
}

// ── V1: format version ──────────────────────────────────────────────────────

#[test]
fn v1_rejects_unknown_manifest_version() {
    let root = create_temp_dir("compat-plugin-v1-unknown");
    let body = valid_manifest_body().replace("\"format\": 1", "\"format\": 99");
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("unknown manifest version"));
}

#[test]
fn v1_accepts_current_manifest_version() {
    let root = create_temp_dir("compat-plugin-v1-current");
    write_plugin(&root, "arborsm.scaleup-unofficial", &valid_manifest_body());

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
}

// ── V2: id pattern + directory match ─────────────────────────────────────────

#[test]
fn v2_rejects_id_not_matching_directory_name() {
    let root = create_temp_dir("compat-plugin-v2-mismatch");
    let body = valid_manifest_body().replace(
        "\"id\": \"arborsm.scaleup-unofficial\"",
        "\"id\": \"something.else\"",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(
        report.errors[0]
            .reason
            .contains("does not match directory name")
    );
}

#[test]
fn v2_rejects_invalid_id_pattern_uppercase() {
    let root = create_temp_dir("compat-plugin-v2-uppercase");
    let body = valid_manifest_body().replace(
        "\"id\": \"arborsm.scaleup-unofficial\"",
        "\"id\": \"Arborsm.ScaleUp\"",
    );
    write_plugin(&root, "Arborsm.ScaleUp", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("invalid plugin id"));
}

// ── V3: targets non-empty ────────────────────────────────────────────────────

#[test]
fn v3_rejects_empty_targets() {
    let root = create_temp_dir("compat-plugin-v3-empty");
    let body = valid_manifest_body().replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"]",
        "\"targets\": []",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("targets"));
}

#[test]
fn v3_rejects_blank_target_entry() {
    let root = create_temp_dir("compat-plugin-v3-blank");
    let body = valid_manifest_body().replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"]",
        "\"targets\": [\"   \"]",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("targets"));
}

// ── V4: entry / sdkVersion co-occurrence ─────────────────────────────────────

#[test]
fn v4_rejects_entry_without_sdk_version() {
    let root = create_temp_dir("compat-plugin-v4-entry-no-sdk");
    let mut body = valid_manifest_body();
    body = body.replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"entry\": \"index.js\",",
    );
    let dir = write_plugin(&root, "arborsm.scaleup-unofficial", &body);
    fs::write(dir.join("index.js"), "export {};").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("sdkVersion"));
}

#[test]
fn v4_rejects_sdk_version_without_entry() {
    let root = create_temp_dir("compat-plugin-v4-sdk-no-entry");
    let body = valid_manifest_body().replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"sdkVersion\": \"1\",",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("sdkVersion"));
}

// ── V5: entry file exists and is .js ─────────────────────────────────────────

#[test]
fn v5_rejects_entry_with_wrong_extension() {
    let root = create_temp_dir("compat-plugin-v5-ext");
    let mut body = valid_manifest_body();
    body = body.replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"sdkVersion\": \"1\",\n  \"entry\": \"index.ts\",",
    );
    let dir = write_plugin(&root, "arborsm.scaleup-unofficial", &body);
    fs::write(dir.join("index.ts"), "export {};").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains(".js"));
}

#[test]
fn v5_rejects_missing_entry_file() {
    let root = create_temp_dir("compat-plugin-v5-missing");
    let mut body = valid_manifest_body();
    body = body.replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"sdkVersion\": \"1\",\n  \"entry\": \"index.js\",",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("entry file not found"));
}

// ── V6: at least one contribution key non-empty ──────────────────────────────

#[test]
fn v6_rejects_empty_contributions() {
    let root = create_temp_dir("compat-plugin-v6-empty");
    let body = valid_manifest_body().replace(
        "\"contributions\": {\n    \"attachedApi\": {",
        "\"contributions\": {\n    \"attachedApi\": null,\n    \"unused\": {",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("contributions"));
}

// ── V7: attachedApi providerUniqueId + assetKind ─────────────────────────────

#[test]
fn v7_rejects_blank_provider_unique_id() {
    let root = create_temp_dir("compat-plugin-v7-blank-provider");
    let body = valid_manifest_body().replace(
        "\"providerUniqueId\": \"Arborsm.ScaleUpUnofficial\"",
        "\"providerUniqueId\": \"\"",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("providerUniqueId"));
}

#[test]
fn v7_rejects_invalid_asset_kind() {
    let root = create_temp_dir("compat-plugin-v7-bad-kind");
    let body =
        valid_manifest_body().replace("\"assetKind\": \"image\"", "\"assetKind\": \"audio\"");
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("assetKind"));
}

#[test]
fn v7_accepts_all_valid_asset_kinds() {
    let root = create_temp_dir("compat-plugin-v7-map-kind");
    let body = valid_manifest_body().replace(
        "{ \"assetPath\": \"PreviewTexture\", \"assetKind\": \"image\" }",
        "{ \"assetPath\": \"Map\", \"assetKind\": \"map\" }",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
}

// ── V9: unknown top-level fields warn only ───────────────────────────────────

#[test]
fn v9_tolerates_unknown_top_level_field() {
    let root = create_temp_dir("compat-plugin-v9-unknown");
    let body = valid_manifest_body().replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"author\": \"Arborsm\",",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
}

// ── Bad-file isolation ────────────────────────────────────────────────────────

#[test]
fn bad_plugin_does_not_block_good_sibling() {
    let root = create_temp_dir("compat-plugin-isolation");
    write_plugin(
        &root,
        "arborsm.bad-plugin",
        r#"{"format": 99, "id": "arborsm.bad-plugin", "name": "Bad", "targets": ["x"], "contributions": {"attachedApi": {"providerUniqueId": "x"}}}"#,
    );
    write_plugin(
        &root,
        "arborsm.good-plugin",
        r#"{"format": 1, "id": "arborsm.good-plugin", "name": "Good", "targets": ["x"], "contributions": {"attachedApi": {"providerUniqueId": "x"}}}"#,
    );

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert_eq!(report.manifests[0].id, "arborsm.good-plugin");
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].plugin_dir.contains("arborsm.bad-plugin"));
}

#[test]
fn malformed_json_is_isolated() {
    let root = create_temp_dir("compat-plugin-malformed");
    let dir = root.join("arborsm.broken");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("manifest.json"), "{ not valid json").unwrap();
    write_plugin(
        &root,
        "arborsm.good-plugin",
        r#"{"format": 1, "id": "arborsm.good-plugin", "name": "Good", "targets": ["x"], "contributions": {"attachedApi": {"providerUniqueId": "x"}}}"#,
    );

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("parse"));
}

// ── Descriptor conversion ────────────────────────────────────────────────────

#[test]
fn to_attached_api_descriptors_converts_loaded_manifests() {
    let manifest = CompatPluginManifest {
        format: 1,
        id: "arborsm.scaleup-unofficial".to_string(),
        name: "ScaleUp".to_string(),
        sdk_version: None,
        entry: None,
        targets: vec!["Arborsm.ScaleUpUnofficial".to_string()],
        contributions: CompatPluginContributions {
            attached_api: Some(AttachedApiContribution {
                provider_unique_id: "Arborsm.ScaleUpUnofficial".to_string(),
                provided_unique_ids: vec!["Platonymous.ScaleUp".to_string()],
                targets: vec![AttachedApiTargetDecl {
                    asset_path: "Assets".to_string(),
                    asset_kind: "json".to_string(),
                }],
            }),
            pages: Vec::new(),
        },
        plugin_dir: std::path::PathBuf::new(),
    };
    let report = PluginLoadReport {
        manifests: vec![manifest],
        errors: Vec::new(),
    };

    let descriptors = report.to_attached_api_descriptors();

    assert_eq!(descriptors.len(), 1);
    assert_eq!(
        descriptors[0].provider_unique_id,
        "Arborsm.ScaleUpUnofficial"
    );
    assert_eq!(
        descriptors[0].provided_unique_ids,
        vec!["Platonymous.ScaleUp"]
    );
    assert_eq!(descriptors[0].targets.len(), 1);
    assert_eq!(descriptors[0].targets[0].asset_path, "Assets");
    assert_eq!(descriptors[0].targets[0].asset_kind, "json");
}

#[test]
fn to_attached_api_descriptors_skips_manifests_without_attached_api() {
    let manifest = CompatPluginManifest {
        format: 1,
        id: "arborsm.no-api".to_string(),
        name: "NoApi".to_string(),
        sdk_version: None,
        entry: None,
        targets: vec!["x".to_string()],
        contributions: CompatPluginContributions::default(),
        plugin_dir: std::path::PathBuf::new(),
    };
    let report = PluginLoadReport {
        manifests: vec![manifest],
        errors: Vec::new(),
    };

    let descriptors = report.to_attached_api_descriptors();

    assert!(descriptors.is_empty());
}

// ── Summary construction & i18n loading ──────────────────────────────────────

/// Writes a manifest.json and optional i18n files into a child directory of
/// `root` named after the id, returning the plugin directory path.
fn write_plugin_with_i18n(
    root: &Path,
    id: &str,
    manifest_body: &str,
    i18n_entries: &[(&str, &str, &str)],
) -> PathBuf {
    let dir = write_plugin(root, id, manifest_body);
    if !i18n_entries.is_empty() {
        let i18n_dir = dir.join("i18n");
        fs::create_dir_all(&i18n_dir).unwrap();
        // Group by locale
        let mut by_locale: std::collections::BTreeMap<&str, Vec<(&str, &str)>> =
            std::collections::BTreeMap::new();
        for (locale, key, value) in i18n_entries {
            by_locale.entry(locale).or_default().push((key, value));
        }
        for (locale, entries) in &by_locale {
            let json = entries
                .iter()
                .map(|(k, v)| format!("\"{}\": \"{}\"", k, v))
                .collect::<Vec<_>>()
                .join(", ");
            fs::write(
                i18n_dir.join(format!("{locale}.json")),
                format!("{{ {json} }}"),
            )
            .unwrap();
        }
    }
    dir
}

#[test]
fn build_summaries_extracts_basic_fields() {
    let root = create_temp_dir("compat-plugin-summary-basic");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["SomeMod"],
  "contributions": {
    "attachedApi": {
      "providerUniqueId": "SomeMod",
      "providedUniqueIds": ["OtherMod"],
      "targets": [{"assetPath": "Assets", "assetKind": "json"}]
    }
  }
}"#,
        &[],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    assert!(report.errors.is_empty(), "errors: {:?}", report.errors);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].id, "arborsm.test");
    assert_eq!(summaries[0].name, "Test");
    assert_eq!(summaries[0].format, 1);
    assert!(!summaries[0].has_code_entry);
    assert_eq!(summaries[0].targets, vec!["SomeMod"]);
    assert!(summaries[0].page_ids.is_empty());
    assert!(summaries[0].pages.is_empty());
    assert!(summaries[0].i18n.is_empty());
    assert!(summaries[0].load_error.is_none());
}

#[test]
fn build_summaries_loads_i18n_bundles() {
    let root = create_temp_dir("compat-plugin-summary-i18n");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["x"],
  "contributions": {"attachedApi": {"providerUniqueId": "x"}}
}"#,
        &[
            ("zh-CN", "page.title", "测试页面"),
            ("en-US", "page.title", "Test Page"),
        ],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 1);
    let i18n = &summaries[0].i18n;
    assert_eq!(
        i18n.get("zh-CN").unwrap().get("page.title").unwrap(),
        "测试页面"
    );
    assert_eq!(
        i18n.get("en-US").unwrap().get("page.title").unwrap(),
        "Test Page"
    );
}

#[test]
fn build_summaries_handles_missing_i18n_dir() {
    let root = create_temp_dir("compat-plugin-summary-no-i18n");
    write_plugin(
        &root,
        "arborsm.test",
        r#"{"format": 1, "id": "arborsm.test", "name": "Test", "targets": ["x"], "contributions": {"attachedApi": {"providerUniqueId": "x"}}}"#,
    );

    let report = load_plugin_manifests(&[root.clone()]);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 1);
    assert!(summaries[0].i18n.is_empty());
}

#[test]
fn build_summaries_extracts_page_descriptors() {
    let root = create_temp_dir("compat-plugin-summary-pages");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["x"],
  "contributions": {
    "attachedApi": {"providerUniqueId": "x"},
    "pages": [
      {
        "id": "main-page",
        "navigation": {"section": "tools", "order": 50, "icon": "images"},
        "titleKey": "page.title",
        "presentation": "standalone",
        "projectAccess": "read"
      }
    ]
  }
}"#,
        &[("en-US", "page.title", "Main Page")],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].page_ids, vec!["main-page"]);
    assert_eq!(summaries[0].pages.len(), 1);
    let page = &summaries[0].pages[0];
    assert_eq!(page.id, "main-page");
    assert_eq!(page.section, "tools");
    assert_eq!(page.order, 50);
    assert_eq!(page.icon, "images");
    assert_eq!(page.title_key, "page.title");
    assert_eq!(page.presentation, "standalone");
    assert_eq!(page.project_access, "read");
}

#[test]
fn build_summaries_handles_multiple_plugins() {
    let root = create_temp_dir("compat-plugin-summary-multi");
    write_plugin_with_i18n(
        &root,
        "arborsm.plugin-a",
        r#"{"format": 1, "id": "arborsm.plugin-a", "name": "A", "targets": ["x"], "contributions": {"attachedApi": {"providerUniqueId": "x"}}}"#,
        &[("en-US", "a.title", "A Title")],
    );
    write_plugin_with_i18n(
        &root,
        "arborsm.plugin-b",
        r#"{"format": 1, "id": "arborsm.plugin-b", "name": "B", "targets": ["y"], "contributions": {"attachedApi": {"providerUniqueId": "y"}}}"#,
        &[("en-US", "b.title", "B Title")],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 2);
    let ids: Vec<&str> = summaries.iter().map(|s| s.id.as_str()).collect();
    assert!(ids.contains(&"arborsm.plugin-a"));
    assert!(ids.contains(&"arborsm.plugin-b"));
}

// ── resolve_plugin_roots: override, packaged and dev paths ───────────────────

#[test]
fn resolve_plugin_roots_override_takes_precedence() {
    let roots =
        crate::domain::modding::compat_plugin::resolve_plugin_roots(Some("/nonexistent/override"));
    assert_eq!(roots.len(), 1);
    assert_eq!(roots[0], std::path::PathBuf::from("/nonexistent/override"));
}

/// Verifies that `resolve_plugin_roots(None)` returns a non-empty set in the
/// dev build (anchored on CARGO_MANIFEST_DIR/../compat-plugins) or when
/// packaged roots have been set via `set_plugin_roots`. This is the production
/// path — an empty result would mean the attached API registry is silently
/// empty, breaking mod compatibility analysis.
#[test]
fn resolve_plugin_roots_none_returns_non_empty_in_dev_build() {
    let roots = crate::domain::modding::compat_plugin::resolve_plugin_roots(None);
    // In the dev build the compat-plugins directory exists under
    // apps/desktop/compat-plugins. In a packaged build, set_plugin_roots would
    // have been called at startup. Either way, the result must be non-empty
    // for the ScaleUp plugin to be discoverable.
    assert!(
        !roots.is_empty(),
        "resolve_plugin_roots(None) returned empty — packaged builds would silently lose the attached API registry"
    );
}

// ── directory-pack entry I/O (stage 2) ──────────────────────────────────────

use crate::domain::modding::commands::ListCompatPluginEntriesRequest;
use crate::domain::modding::compat_plugin::{
    ReadCompatPluginEntryRequest, WriteCompatPluginEntryRequest, list_directory_pack_entries,
    read_directory_pack_entry, write_directory_pack_entry,
};

/// Creates a temp mod root with a `Textures/<entry_id>/texture.json` structure
/// mimicking Alternative Textures' directory layout.
fn create_at_mod_root(entry_id: &str, json_content: &str) -> PathBuf {
    let root = create_temp_dir("compat-directory-pack");
    let textures_dir = root.join("Textures").join(entry_id);
    fs::create_dir_all(&textures_dir).unwrap();
    fs::write(textures_dir.join("texture.json"), json_content).unwrap();
    root
}

#[test]
fn list_directory_pack_entries_finds_entries_with_entry_file() {
    let root = create_temp_dir("compat-list-entries");
    let textures = root.join("Textures");
    fs::create_dir_all(textures.join("crop_a")).unwrap();
    fs::write(textures.join("crop_a").join("texture.json"), "{}").unwrap();
    fs::create_dir_all(textures.join("crop_b")).unwrap();
    fs::write(textures.join("crop_b").join("texture.json"), "{}").unwrap();
    // Directory without entry file should be skipped
    fs::create_dir_all(textures.join("empty_dir")).unwrap();
    // Non-directory file should be skipped
    fs::write(textures.join("readme.txt"), "hello").unwrap();

    let request = ListCompatPluginEntriesRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_file: "texture.json".to_string(),
        entry_image: None,
    };
    let entries = list_directory_pack_entries(&request);
    let ids: Vec<&str> = entries.iter().map(|e| e.id.as_str()).collect();
    assert!(ids.contains(&"crop_a"));
    assert!(ids.contains(&"crop_b"));
    assert!(!ids.contains(&"empty_dir"));
    assert_eq!(entries.len(), 2);
}

#[test]
fn list_directory_pack_entries_returns_empty_for_missing_subdir() {
    let root = create_temp_dir("compat-list-missing-subdir");
    let request = ListCompatPluginEntriesRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Nonexistent".to_string(),
        entry_file: "texture.json".to_string(),
        entry_image: None,
    };
    let entries = list_directory_pack_entries(&request);
    assert!(entries.is_empty());
}

#[test]
fn list_directory_pack_entries_detects_companion_image() {
    let root = create_temp_dir("compat-list-with-image");
    let textures = root.join("Textures");
    let entry_dir = textures.join("crop_a");
    fs::create_dir_all(&entry_dir).unwrap();
    fs::write(entry_dir.join("texture.json"), "{}").unwrap();
    fs::write(entry_dir.join("texture.png"), b"\x89PNG").unwrap();

    let request = ListCompatPluginEntriesRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_file: "texture.json".to_string(),
        entry_image: Some("texture.png".to_string()),
    };
    let entries = list_directory_pack_entries(&request);
    assert_eq!(entries.len(), 1);
    assert!(entries[0].entry_image_path.is_some());
}

#[test]
fn read_directory_pack_entry_returns_parsed_json() {
    let root = create_at_mod_root("crop_a", r#"{"ItemName": "Parsnip", "Type": "Crop"}"#);
    let request = ReadCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "crop_a".to_string(),
        entry_file: "texture.json".to_string(),
    };
    let result = read_directory_pack_entry(request).unwrap();
    assert_eq!(result.content["ItemName"], "Parsnip");
    assert_eq!(result.content["Type"], "Crop");
}

#[test]
fn read_directory_pack_entry_rejects_path_traversal() {
    let root = create_at_mod_root("crop_a", "{}");
    let request = ReadCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "..".to_string(),
        entry_file: "texture.json".to_string(),
    };
    let result = read_directory_pack_entry(request);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("Invalid entry id"));
}

#[test]
fn read_directory_pack_entry_rejects_absolute_entry_id() {
    let root = create_at_mod_root("crop_a", "{}");
    let request = ReadCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "/etc/passwd".to_string(),
        entry_file: "texture.json".to_string(),
    };
    let result = read_directory_pack_entry(request);
    assert!(result.is_err());
}

#[test]
fn write_directory_pack_entry_creates_new_entry() {
    let root = create_temp_dir("compat-write-new");
    let content = serde_json::json!({"ItemName": "Cauliflower", "Type": "Crop"});
    let request = WriteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "new_crop".to_string(),
        entry_file: "texture.json".to_string(),
        content: content.clone(),
    };
    write_directory_pack_entry(request).unwrap();

    let written =
        fs::read_to_string(root.join("Textures").join("new_crop").join("texture.json")).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
    assert_eq!(parsed["ItemName"], "Cauliflower");
}

#[test]
fn write_directory_pack_entry_overwrites_existing() {
    let root = create_at_mod_root("crop_a", r#"{"ItemName": "Old"}"#);
    let request = WriteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "crop_a".to_string(),
        entry_file: "texture.json".to_string(),
        content: serde_json::json!({"ItemName": "New"}),
    };
    write_directory_pack_entry(request).unwrap();

    let written =
        fs::read_to_string(root.join("Textures").join("crop_a").join("texture.json")).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&written).unwrap();
    assert_eq!(parsed["ItemName"], "New");
}

#[test]
fn write_directory_pack_entry_rejects_path_traversal() {
    let root = create_temp_dir("compat-write-traversal");
    let request = WriteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "..".to_string(),
        entry_file: "texture.json".to_string(),
        content: serde_json::json!({}),
    };
    let result = write_directory_pack_entry(request);
    assert!(result.is_err());
}

#[test]
fn write_then_read_roundtrip_preserves_data() {
    let root = create_temp_dir("compat-write-read-roundtrip");
    let content = serde_json::json!({
        "ItemName": "Melon",
        "Type": "Crop",
        "Variations": 4,
        "Seasons": ["summer"],
        "ChanceWeight": 0.5
    });
    let write_request = WriteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "melon".to_string(),
        entry_file: "texture.json".to_string(),
        content: content.clone(),
    };
    write_directory_pack_entry(write_request).unwrap();

    let read_request = ReadCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "melon".to_string(),
        entry_file: "texture.json".to_string(),
    };
    let result = read_directory_pack_entry(read_request).unwrap();
    assert_eq!(result.content, content);
}

// ── resolve_plugin_protocol_path (stage 3) ──────────────────────────────────

/// Creates a temp plugin root containing a single plugin directory named `id`
/// with the given relative file already written to disk, returning the root.
fn create_protocol_plugin_root(id: &str, relative_file: &str, content: &str) -> PathBuf {
    let root = create_temp_dir("compat-protocol");
    let plugin_dir = root.join(id);
    let file_path = plugin_dir.join(relative_file);
    fs::create_dir_all(file_path.parent().unwrap()).unwrap();
    fs::write(&file_path, content).unwrap();
    root
}

#[test]
fn resolve_plugin_protocol_path_resolves_normal_path() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");
    let plugin_dir = root.join("arborsm.test");

    let resolved =
        super::resolve_plugin_protocol_path_in_roots(&[root.clone()], "arborsm.test", "index.js");
    assert_eq!(resolved, Some(plugin_dir.join("index.js")));
}

#[test]
fn resolve_plugin_protocol_path_resolves_nested_subdirectory() {
    let root = create_protocol_plugin_root("arborsm.test", "assets/icon.png", "png-bytes");
    let plugin_dir = root.join("arborsm.test");

    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.test",
        "assets/icon.png",
    );
    assert_eq!(resolved, Some(plugin_dir.join("assets").join("icon.png")));
}

#[test]
fn resolve_plugin_protocol_path_rejects_traversal_escape() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");

    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.test",
        "../secret.js",
    );
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_rejects_deep_traversal_escape() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");

    // `foo/../../bar.js` escapes the plugin dir after the second `..`.
    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.test",
        "foo/../../bar.js",
    );
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_allows_traversal_within_plugin_dir() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");
    // `sub/../index.js` stays inside the plugin dir and should resolve.
    let plugin_dir = root.join("arborsm.test");

    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.test",
        "sub/../index.js",
    );
    assert_eq!(resolved, Some(plugin_dir.join("index.js")));
}

#[test]
fn resolve_plugin_protocol_path_rejects_absolute_path() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");

    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.test",
        "/etc/passwd.js",
    );
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_rejects_non_whitelisted_extension() {
    let root = create_protocol_plugin_root("arborsm.test", "readme.txt", "hello");

    let resolved =
        super::resolve_plugin_protocol_path_in_roots(&[root.clone()], "arborsm.test", "readme.txt");
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_rejects_missing_extension() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");
    fs::write(root.join("arborsm.test").join("README"), "hello").unwrap();

    let resolved = super::resolve_plugin_protocol_path_in_roots(&[root], "arborsm.test", "README");
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_rejects_unknown_plugin_id() {
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");

    let resolved = super::resolve_plugin_protocol_path_in_roots(
        &[root.clone()],
        "arborsm.nonexistent",
        "index.js",
    );
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_accepts_all_whitelisted_extensions() {
    let root = create_temp_dir("compat-protocol-all-exts");
    let plugin_dir = root.join("arborsm.test");
    fs::create_dir_all(&plugin_dir).unwrap();

    for ext in ["js", "json", "png", "jpg", "webp", "svg", "css"] {
        let file_name = format!("asset.{ext}");
        fs::write(plugin_dir.join(&file_name), "content").unwrap();
        let resolved = super::resolve_plugin_protocol_path_in_roots(
            &[root.clone()],
            "arborsm.test",
            &file_name,
        );
        assert!(resolved.is_some(), "extension .{ext} should be whitelisted");
    }
}
