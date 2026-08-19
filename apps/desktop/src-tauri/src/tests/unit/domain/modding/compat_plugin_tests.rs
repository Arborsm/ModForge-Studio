//! Unit tests for the compat plugin manifest loader and validator (format 1).
//!
//! Covers the 9-rule validation table with positive and negative samples, plus
//! the bad-file isolation guarantee (one bad plugin does not affect a good
//! sibling).

use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::modding::compat_plugin::{
    AttachedApiContribution, AttachedApiTargetDecl, CompatPluginContributions,
    CompatPluginManifest, PluginLoadReport, load_plugin_manifests,
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
        },
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
    };
    let report = PluginLoadReport {
        manifests: vec![manifest],
        errors: Vec::new(),
    };

    let descriptors = report.to_attached_api_descriptors();

    assert!(descriptors.is_empty());
}
