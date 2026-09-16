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

// ── V5b: styles is a code-package companion (.css, exists, requires entry) ────

/// Minimal code-package manifest body with a `styles` declaration.
fn code_manifest_with_styles(styles: &str) -> String {
    format!(
        r#"{{
  "format": 1,
  "id": "arborsm.scaleup-unofficial",
  "name": "ScaleUp (Unofficial) 兼容",
  "targets": ["Arborsm.ScaleUpUnofficial"],
  "sdkVersion": "1.0.0",
  "entry": "index.js",
  "styles": "{styles}",
  "contributions": {{}}
}}"#
    )
}

#[test]
fn v5b_accepts_styles_for_code_package_and_surfaces_it() {
    let root = create_temp_dir("compat-plugin-v5b-ok");
    let dir = write_plugin(
        &root,
        "arborsm.scaleup-unofficial",
        &code_manifest_with_styles("styles.css"),
    );
    fs::write(dir.join("index.js"), "export default {};").unwrap();
    fs::write(dir.join("styles.css"), ".x { color: red; }").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
    let summaries = build_summaries_from_report(&report);
    assert_eq!(summaries[0].styles.as_deref(), Some("styles.css"));
}

#[test]
fn v5b_rejects_styles_without_code_entry() {
    let root = create_temp_dir("compat-plugin-v5b-no-entry");
    let body = valid_manifest_body().replace(
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],",
        "\"targets\": [\"Arborsm.ScaleUpUnofficial\"],\n  \"styles\": \"styles.css\",",
    );
    let dir = write_plugin(&root, "arborsm.scaleup-unofficial", &body);
    fs::write(dir.join("styles.css"), ".x {}").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(
        report.errors[0]
            .reason
            .contains("styles requires a code entry")
    );
}

#[test]
fn v5b_rejects_styles_with_wrong_extension() {
    let root = create_temp_dir("compat-plugin-v5b-ext");
    let dir = write_plugin(
        &root,
        "arborsm.scaleup-unofficial",
        &code_manifest_with_styles("styles.scss"),
    );
    fs::write(dir.join("index.js"), "export default {};").unwrap();
    fs::write(dir.join("styles.scss"), ".x {}").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(
        report.errors[0]
            .reason
            .contains("styles must be a .css file")
    );
}

#[test]
fn v5b_rejects_missing_styles_file() {
    let root = create_temp_dir("compat-plugin-v5b-missing");
    let dir = write_plugin(
        &root,
        "arborsm.scaleup-unofficial",
        &code_manifest_with_styles("styles.css"),
    );
    fs::write(dir.join("index.js"), "export default {};").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("styles file not found"));
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

#[test]
fn v6_accepts_code_entry_with_empty_contributions() {
    // A code package contributes its pages via `activate(ctx)` at runtime, so
    // `entry` + `sdkVersion` alone satisfies the non-empty contribution rule.
    let root = create_temp_dir("compat-plugin-v6-code-entry");
    let body = r#"{
  "format": 1,
  "id": "arborsm.scaleup-unofficial",
  "name": "ScaleUp (Unofficial) 兼容",
  "targets": ["Arborsm.ScaleUpUnofficial"],
  "sdkVersion": "1.0.0",
  "entry": "index.js",
  "contributions": {}
}"#;
    let dir = write_plugin(&root, "arborsm.scaleup-unofficial", body);
    fs::write(dir.join("index.js"), "export default {};").unwrap();

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
    assert!(report.manifests[0].entry.is_some());
}

// ── cross-root dedupe ─────────────────────────────────────────────────────────

#[test]
fn duplicate_plugin_id_across_roots_first_root_wins() {
    // The built-in sync copies plugins into the data dir while the dev source
    // tree is also scanned, so the same id can appear under two roots. The
    // first (highest-priority) root must win and the duplicate must not reach
    // consumers (the frontend registry rejects duplicate module ids).
    let priority_root = create_temp_dir("compat-plugin-dup-priority");
    let shadowed_root = create_temp_dir("compat-plugin-dup-shadowed");
    write_plugin(
        &priority_root,
        "arborsm.scaleup-unofficial",
        &valid_manifest_body(),
    );
    write_plugin(
        &shadowed_root,
        "arborsm.scaleup-unofficial",
        &valid_manifest_body(),
    );

    let report = load_plugin_manifests(&[priority_root.clone(), shadowed_root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
    assert_eq!(
        report.manifests[0].plugin_dir,
        priority_root.join("arborsm.scaleup-unofficial")
    );
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

// ── V8: capabilities references ─────────────────────────────────────────────

#[test]
fn v8_accepts_valid_capability_ids_and_surfaces_them() {
    let root = create_temp_dir("compat-plugin-v8-ok");
    let body = valid_manifest_body().replace(
        "\"contributions\": {\n    \"attachedApi\": {",
        "\"contributions\": {\n    \"capabilities\": [\"spritesheet-preview\"],\n    \"attachedApi\": {",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
    assert_eq!(
        report.manifests[0].contributions.capabilities,
        vec!["spritesheet-preview"]
    );
    let summaries = build_summaries_from_report(&report);
    assert_eq!(
        summaries[0].capabilities,
        vec!["spritesheet-preview".to_string()]
    );
}

#[test]
fn v8_rejects_uppercase_capability_id() {
    let root = create_temp_dir("compat-plugin-v8-uppercase");
    let body = valid_manifest_body().replace(
        "\"contributions\": {\n    \"attachedApi\": {",
        "\"contributions\": {\n    \"capabilities\": [\"SpriteSheet-Preview\"],\n    \"attachedApi\": {",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("capabilities"));
}

#[test]
fn v8_rejects_capability_id_with_dots() {
    // Builtin ids like `host.locale` are host-internal and must not be declared
    // in a manifest; dots are not part of the declared-id shape.
    let root = create_temp_dir("compat-plugin-v8-dots");
    let body = valid_manifest_body().replace(
        "\"contributions\": {\n    \"attachedApi\": {",
        "\"contributions\": {\n    \"capabilities\": [\"host.locale\"],\n    \"attachedApi\": {",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("capabilities"));
}

#[test]
fn v8_rejects_blank_capability_id() {
    let root = create_temp_dir("compat-plugin-v8-blank");
    let body = valid_manifest_body().replace(
        "\"contributions\": {\n    \"attachedApi\": {",
        "\"contributions\": {\n    \"capabilities\": [\"\"],\n    \"attachedApi\": {",
    );
    write_plugin(&root, "arborsm.scaleup-unofficial", &body);

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].reason.contains("capabilities"));
}

#[test]
fn v8_defaults_to_empty_when_absent() {
    // Manifests without a `capabilities` key load with an empty list (serde
    // default), keeping every pre-capability plugin valid.
    let root = create_temp_dir("compat-plugin-v8-absent");
    write_plugin(&root, "arborsm.scaleup-unofficial", &valid_manifest_body());

    let report = load_plugin_manifests(&[root.clone()]);

    assert_eq!(report.manifests.len(), 1);
    assert!(report.errors.is_empty());
    assert!(report.manifests[0].contributions.capabilities.is_empty());
    let summaries = build_summaries_from_report(&report);
    assert!(summaries[0].capabilities.is_empty());
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
        description: None,
        author: None,
        version: None,
        category: None,
        tags: Vec::new(),
        sdk_version: None,
        entry: None,
        styles: None,
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
            asset_schemas: Vec::new(),
            condition_syntax: Vec::new(),
            capabilities: Vec::new(),
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
        description: None,
        author: None,
        version: None,
        category: None,
        tags: Vec::new(),
        sdk_version: None,
        entry: None,
        styles: None,
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

#[test]
fn to_attached_api_descriptors_skips_disabled_plugins() {
    // A plugin with an attached API contribution and a `.disabled` marker must
    // not produce a descriptor: its compatibility behavior must not apply while
    // disabled. An enabled sibling with the same contribution must still appear.
    let root = create_temp_dir("compat-attached-disabled");
    let disabled_dir = write_plugin(
        &root,
        "arborsm.disabled-one",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.disabled-one"),
    );
    fs::write(disabled_dir.join(".disabled"), b"").unwrap();
    write_plugin(
        &root,
        "arborsm.enabled-one",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.enabled-one"),
    );

    let report = load_plugin_manifests(&[root]);
    assert_eq!(report.manifests.len(), 2);

    let descriptors = report.to_attached_api_descriptors();
    // Only the enabled plugin produces a descriptor; the disabled one is
    // skipped even though its manifest loaded successfully.
    assert_eq!(descriptors.len(), 1);
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
        "projectAccess": "read",
        "validations": [
          {
            "kind": "require-one-of",
            "paths": ["fields.id", "fields.name"],
            "messageKey": "validation.requireOneOf.idOrName"
          }
        ]
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
    assert_eq!(page.validations.len(), 1);
    match &page.validations[0] {
        crate::domain::modding::compat_plugin::CompatPluginValidationWire::RequireOneOf {
            paths,
            message_key,
        } => {
            assert_eq!(
                paths,
                &vec!["fields.id".to_string(), "fields.name".to_string()]
            );
            assert_eq!(message_key, "validation.requireOneOf.idOrName");
        }
    }
}

#[test]
fn build_summaries_forwards_include_content_packs_param() {
    let root = create_temp_dir("compat-plugin-source-include-packs");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["x"],
  "contributions": {
    "pages": [
      {
        "id": "with-packs",
        "navigation": {"section": "tools", "order": 50, "icon": "images"},
        "titleKey": "page.title",
        "presentation": "standalone",
        "projectAccess": "none",
        "source": {
          "kind": "directory-pack",
          "params": {
            "entryFile": "texture.json",
            "rootSubdir": "Textures",
            "includeContentPacks": true
          }
        }
      },
      {
        "id": "without-packs",
        "navigation": {"section": "tools", "order": 51, "icon": "images"},
        "titleKey": "page.title",
        "presentation": "standalone",
        "projectAccess": "none",
        "source": {
          "kind": "directory-pack",
          "params": {"entryFile": "texture.json"}
        }
      }
    ]
  }
}"#,
        &[("en-US", "page.title", "Main Page")],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    let summaries = build_summaries_from_report(&report);

    assert_eq!(summaries.len(), 1);
    let with_packs = summaries[0].pages[0]
        .source
        .as_ref()
        .expect("source is forwarded");
    assert_eq!(
        with_packs.params.entry_file.as_deref(),
        Some("texture.json")
    );
    assert_eq!(with_packs.params.include_content_packs, Some(true));
    let without_packs = summaries[0].pages[1]
        .source
        .as_ref()
        .expect("source is forwarded");
    assert_eq!(without_packs.params.include_content_packs, None);
}

#[test]
fn build_summaries_forwards_game_item_field_and_collapsed_section() {
    let root = create_temp_dir("compat-plugin-game-item-field");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["x"],
  "contributions": {
    "pages": [
      {
        "id": "editor",
        "navigation": {"section": "tools", "order": 50, "icon": "images"},
        "titleKey": "page.title",
        "presentation": "standalone",
        "projectAccess": "none",
        "source": {
          "kind": "directory-pack",
          "params": {"entryFile": "texture.json", "includeContentPacks": true}
        },
        "sections": [
          {
            "titleKey": "section.advanced",
            "collapsed": true,
            "fields": [
              {"id": "itemName", "path": "ItemName", "type": "game-item", "idPath": "ItemId"}
            ]
          }
        ]
      }
    ]
  }
}"#,
        &[("en-US", "page.title", "Main Page")],
    );

    let report = load_plugin_manifests(&[root.clone()]);
    assert!(
        report.errors.is_empty(),
        "manifest must load: {:?}",
        report.errors
    );
    let summaries = build_summaries_from_report(&report);

    let page = &summaries[0].pages[0];
    assert_eq!(page.sections[0].collapsed, Some(true));
    let field = &page.sections[0].fields[0];
    assert_eq!(field.field_type, "game-item");
    assert_eq!(field.id_path.as_deref(), Some("ItemId"));
}

#[test]
fn rejects_id_path_on_non_game_item_field() {
    let root = create_temp_dir("compat-plugin-id-path-misuse");
    write_plugin_with_i18n(
        &root,
        "arborsm.test",
        r#"{
  "format": 1,
  "id": "arborsm.test",
  "name": "Test",
  "targets": ["x"],
  "contributions": {
    "pages": [
      {
        "id": "editor",
        "navigation": {"section": "tools", "order": 50, "icon": "images"},
        "titleKey": "page.title",
        "presentation": "standalone",
        "projectAccess": "none",
        "source": {"kind": "directory-pack", "params": {"entryFile": "texture.json"}},
        "sections": [
          {
            "titleKey": "section.main",
            "fields": [
              {"id": "itemName", "path": "ItemName", "type": "text", "idPath": "ItemId"}
            ]
          }
        ]
      }
    ]
  }
}"#,
        &[("en-US", "page.title", "Main Page")],
    );

    let report = load_plugin_manifests(&[root.clone()]);

    assert!(report.manifests.is_empty());
    assert!(report.errors[0].reason.contains("idPath"));
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

/// Verifies that `resolve_plugin_roots(None)` returns a non-empty set even
/// when `set_plugin_roots` was never called (the unit-test process). The
/// fallback points at the platform data directory's `compat-plugins` folder —
/// in production the startup hook extracts the embedded built-in archive there
/// before any scan, so an empty result would mean the attached API registry is
/// silently empty, breaking mod compatibility analysis.
#[test]
fn resolve_plugin_roots_none_returns_non_empty_without_startup() {
    let roots = crate::domain::modding::compat_plugin::resolve_plugin_roots(None);
    assert!(
        !roots.is_empty(),
        "resolve_plugin_roots(None) returned empty — the attached API registry would be silently empty"
    );
}

// ── built-in plugin archive extraction ──────────────────────────────────────

use crate::domain::modding::compat_plugin::extract_builtin_plugins_if_needed;

/// First run: the embedded archive is extracted and the sha256 marker written.
#[test]
fn extract_builtin_plugins_extracts_archive_on_first_run() {
    let data_dir = create_temp_dir("compat-plugin-extract-first");

    let dest = extract_builtin_plugins_if_needed(&data_dir).unwrap();

    let scaleup_manifest = dest
        .join("arborsm.scaleup-unofficial")
        .join("manifest.json");
    assert!(
        scaleup_manifest.is_file(),
        "built-in ScaleUp plugin manifest missing after extraction"
    );
    assert!(dest.join(".builtin-archive-sha256").is_file());
}

/// Second run with a matching marker is a no-op: local deletions inside a
/// built-in plugin directory are left alone until the archive itself changes.
#[test]
fn extract_builtin_plugins_skips_when_marker_matches() {
    let data_dir = create_temp_dir("compat-plugin-extract-skip");
    let dest = extract_builtin_plugins_if_needed(&data_dir).unwrap();
    let manifest = dest
        .join("arborsm.scaleup-unofficial")
        .join("manifest.json");
    fs::remove_file(&manifest).unwrap();

    extract_builtin_plugins_if_needed(&data_dir).unwrap();

    assert!(
        !manifest.exists(),
        "extraction should be skipped while the marker matches the embedded archive"
    );
}

/// A stale marker (app update with a changed archive) forces a clean
/// re-extract: deleted files come back and stale leftovers are removed.
#[test]
fn extract_builtin_plugins_reextracts_when_archive_changes() {
    let data_dir = create_temp_dir("compat-plugin-extract-upgrade");
    let dest = extract_builtin_plugins_if_needed(&data_dir).unwrap();
    let manifest = dest
        .join("arborsm.scaleup-unofficial")
        .join("manifest.json");
    fs::remove_file(&manifest).unwrap();
    let stale = dest
        .join("arborsm.scaleup-unofficial")
        .join("stale-leftover.txt");
    fs::write(&stale, "from an older archive").unwrap();
    fs::write(dest.join(".builtin-archive-sha256"), "stale-marker").unwrap();

    extract_builtin_plugins_if_needed(&data_dir).unwrap();

    assert!(
        manifest.is_file(),
        "re-extraction must restore deleted files"
    );
    assert!(
        !stale.exists(),
        "re-extraction must remove leftovers from the previous archive"
    );
}

/// Plugins the user added themselves (directory names not present in the
/// embedded archive) survive a forced re-extraction.
#[test]
fn extract_builtin_plugins_preserves_user_plugins() {
    let data_dir = create_temp_dir("compat-plugin-extract-user");
    let dest = extract_builtin_plugins_if_needed(&data_dir).unwrap();
    let user_manifest = dest.join("user.custom-plugin").join("manifest.json");
    fs::create_dir_all(user_manifest.parent().unwrap()).unwrap();
    fs::write(&user_manifest, "{}").unwrap();
    fs::write(dest.join(".builtin-archive-sha256"), "stale-marker").unwrap();

    extract_builtin_plugins_if_needed(&data_dir).unwrap();

    assert!(
        user_manifest.is_file(),
        "user-added plugins must survive built-in re-extraction"
    );
}

// ── directory-pack entry I/O (stage 2) ──────────────────────────────────────

use crate::domain::modding::commands::ListCompatPluginEntriesRequest;
use crate::domain::modding::compat_plugin::{
    DeleteCompatPluginEntryRequest, ReadCompatPluginEntryRequest,
    WriteCompatPluginEntryImageRequest, WriteCompatPluginEntryRequest, delete_directory_pack_entry,
    list_directory_pack_entries, read_directory_pack_entry, write_directory_pack_entry,
    write_directory_pack_entry_image,
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
fn read_directory_pack_entry_parses_relaxed_json() {
    // Mod-authored texture.json files routinely carry comments and trailing
    // commas; reading must tolerate them like the rest of the game-format
    // parsers do.
    let relaxed = r#"{
    // item identity
    "ItemName": "Parsnip", // shown in the picker
    "Type": "Crop",
    "Keywords": ["spring", "juice",],
}"#;
    let root = create_at_mod_root("crop_a", relaxed);
    let request = ReadCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".to_string(),
        entry_id: "crop_a".to_string(),
        entry_file: "texture.json".to_string(),
    };
    let result = read_directory_pack_entry(request).unwrap();
    assert_eq!(result.content["ItemName"], "Parsnip");
    assert_eq!(result.content["Keywords"][1], "juice");
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
fn write_directory_pack_entry_rejects_root_subdir_traversal_without_side_effect() {
    // `root_subdir` is caller-supplied and unchecked by validate_entry_id /
    // validate_file_name. A `../sibling` value must be rejected BEFORE
    // create_dir_all runs, otherwise an external directory is created as a
    // side effect even though the write ultimately fails.
    let parent = create_temp_dir("compat-write-subdir-traversal-parent");
    let root = parent.join("mod");
    fs::create_dir_all(&root).unwrap();
    let sibling = parent.join("sibling");
    assert!(!sibling.exists(), "sibling must not pre-exist");

    let request = WriteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "../sibling".to_string(),
        entry_id: "crop".to_string(),
        entry_file: "texture.json".to_string(),
        content: serde_json::json!({}),
    };
    let result = write_directory_pack_entry(request);
    assert!(result.is_err());
    assert!(
        !sibling.exists(),
        "traversal must be rejected before any external directory is created"
    );
}

#[test]
fn list_directory_pack_entries_rejects_root_subdir_traversal() {
    // A `root_subdir` that escapes the mod root must not list an external
    // directory's structure.
    let parent = create_temp_dir("compat-list-subdir-traversal-parent");
    let root = parent.join("mod");
    fs::create_dir_all(&root).unwrap();
    let sibling = parent.join("sibling");
    fs::create_dir_all(sibling.join("leak")).unwrap();
    fs::write(sibling.join("leak").join("texture.json"), "{}").unwrap();

    let request = ListCompatPluginEntriesRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "../sibling".to_string(),
        entry_file: "texture.json".to_string(),
        entry_image: None,
    };
    let entries = list_directory_pack_entries(&request);
    assert!(
        entries.is_empty(),
        "traversal via root_subdir must be rejected"
    );
}

#[test]
fn delete_directory_pack_entry_removes_entry_and_rejects_missing() {
    let root = create_at_mod_root("crop_a", "{}");
    let request = DeleteCompatPluginEntryRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".into(),
        entry_id: "crop_a".into(),
    };
    delete_directory_pack_entry(request.clone()).unwrap();
    assert!(!root.join("Textures/crop_a").exists());
    assert!(delete_directory_pack_entry(request).is_err());
}

#[test]
fn write_directory_pack_entry_image_validates_and_writes() {
    let root = create_temp_dir("compat-write-image");
    let request = WriteCompatPluginEntryImageRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".into(),
        entry_id: "crop_a".into(),
        image_file: "preview.PNG".into(),
        content_base64: "iVBORw0KGgo=".into(),
    };
    write_directory_pack_entry_image(request).unwrap();
    assert_eq!(
        fs::read(root.join("Textures/crop_a/preview.PNG")).unwrap(),
        b"\x89PNG\r\n\x1a\n"
    );
    let mut invalid = WriteCompatPluginEntryImageRequest {
        mod_root: root.to_string_lossy().to_string(),
        root_subdir: "Textures".into(),
        entry_id: "crop_a".into(),
        image_file: "preview.gif".into(),
        content_base64: "bad".into(),
    };
    assert!(write_directory_pack_entry_image(invalid.clone()).is_err());
    invalid.image_file = "preview.png".into();
    assert!(write_directory_pack_entry_image(invalid).is_err());
}

#[test]
fn delete_and_image_commands_reject_traversal() {
    let root = create_temp_dir("compat-entry-safety");
    assert!(
        delete_directory_pack_entry(DeleteCompatPluginEntryRequest {
            mod_root: root.to_string_lossy().to_string(),
            root_subdir: "../outside".into(),
            entry_id: "x".into()
        })
        .is_err()
    );
    assert!(
        write_directory_pack_entry_image(WriteCompatPluginEntryImageRequest {
            mod_root: root.to_string_lossy().to_string(),
            root_subdir: "Textures".into(),
            entry_id: "..".into(),
            image_file: "x.png".into(),
            content_base64: "eA==".into()
        })
        .is_err()
    );
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
fn resolve_plugin_protocol_path_rejects_parent_dir_plugin_id() {
    // The URI handler percent-decodes `%2E%2E` to `..` before calling the
    // resolver, so the resolver must reject a literal `..` plugin id. Without
    // the `is_valid_plugin_id` guard, `root.join("..")` points at the parent
    // of the root and a whitelisted-extension file there would be readable.
    let root = create_temp_dir("compat-protocol-id-escape");
    // Place a whitelisted-extension file *outside* the plugin root, in the
    // parent directory, to prove the escape would succeed without the guard.
    let secret = root.join("secret.js");
    fs::write(&secret, "stolen").unwrap();
    // The actual plugin root is a subdirectory; `..` from inside it reaches
    // `root` where `secret.js` lives.
    let plugin_root = root.join("plugins");
    fs::create_dir_all(&plugin_root).unwrap();

    let resolved = super::resolve_plugin_protocol_path_in_roots(&[plugin_root], "..", "secret.js");
    assert!(resolved.is_none(), "`..` plugin id must be rejected");
}

#[test]
fn resolve_plugin_protocol_path_rejects_parent_dir_plugin_id_with_subpath() {
    // Variant where the traversal id carries a nested relative path that would
    // otherwise pass the within-plugin-dir lexical check because the "plugin
    // dir" itself is already outside the root.
    let root = create_temp_dir("compat-protocol-id-escape-nested");
    fs::write(root.join("leak.json"), "{}").unwrap();
    let plugin_root = root.join("plugins");
    fs::create_dir_all(&plugin_root).unwrap();

    let resolved = super::resolve_plugin_protocol_path_in_roots(&[plugin_root], "..", "leak.json");
    assert!(resolved.is_none());
}

#[test]
fn resolve_plugin_protocol_path_rejects_plugin_id_with_separator() {
    // A plugin id containing a path separator could target a nested directory
    // outside the intended single-level plugin folder. The id pattern forbids
    // separators, so this must be rejected regardless of whether the directory
    // exists.
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");
    // Build a directory that `foo/bar` would resolve to, to prove the guard
    // rejects on the id pattern, not on directory existence.
    fs::create_dir_all(root.join("foo").join("bar")).unwrap();
    fs::write(root.join("foo").join("bar").join("index.js"), "x").unwrap();

    let resolved = super::resolve_plugin_protocol_path_in_roots(&[root], "foo/bar", "index.js");
    assert!(
        resolved.is_none(),
        "plugin id with separator must be rejected"
    );
}

#[test]
fn resolve_plugin_protocol_path_rejects_current_dir_plugin_id() {
    // `.` as a plugin id would resolve the relative path against the root
    // itself rather than a plugin subdirectory, leaking sibling files.
    let root = create_temp_dir("compat-protocol-id-dot");
    fs::write(root.join("outside.js"), "leak").unwrap();

    let resolved = super::resolve_plugin_protocol_path_in_roots(&[root], ".", "outside.js");
    assert!(resolved.is_none(), "`.` plugin id must be rejected");
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

// ── strip_plugin_epoch_prefix (hot-reload cache busting) ────────────────────

#[test]
fn strip_plugin_epoch_prefix_strips_valid_epoch_segment() {
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v1/index.js"),
        "index.js"
    );
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v42/assets/ui.js"),
        "assets/ui.js"
    );
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v0/index.js"),
        "index.js"
    );
}

#[test]
fn strip_plugin_epoch_prefix_strips_only_the_leading_segment() {
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v3/sub/dir/file.js"),
        "sub/dir/file.js"
    );
    // A `__vN` segment that is not the first segment is preserved.
    assert_eq!(
        crate::strip_plugin_epoch_prefix("dir/__v1/file.js"),
        "dir/__v1/file.js"
    );
}

#[test]
fn strip_plugin_epoch_prefix_leaves_paths_without_prefix_untouched() {
    assert_eq!(crate::strip_plugin_epoch_prefix("index.js"), "index.js");
    assert_eq!(
        crate::strip_plugin_epoch_prefix("assets/ui.js"),
        "assets/ui.js"
    );
    assert_eq!(crate::strip_plugin_epoch_prefix(""), "");
}

#[test]
fn strip_plugin_epoch_prefix_rejects_forged_prefixes() {
    // `__v` with no digits is not a valid epoch prefix.
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v/index.js"),
        "__v/index.js"
    );
    // `__v` with non-digit suffix is not stripped.
    assert_eq!(
        crate::strip_plugin_epoch_prefix("__v1x/index.js"),
        "__v1x/index.js"
    );
    // Forged traversal-style prefix is left for the downstream checks to reject.
    assert_eq!(
        crate::strip_plugin_epoch_prefix("..__v1__/index.js"),
        "..__v1__/index.js"
    );
    // Empty epoch after prefix is not stripped.
    assert_eq!(crate::strip_plugin_epoch_prefix("__v/"), "__v/");
}

#[test]
fn strip_plugin_epoch_prefix_strips_epoch_with_no_trailing_path() {
    // `__v1` with no following path yields an empty relative path, which the
    // downstream resolver rejects (no whitelisted extension).
    assert_eq!(crate::strip_plugin_epoch_prefix("__v1"), "");
}

#[test]
fn resolve_plugin_protocol_path_resolves_after_epoch_strip() {
    // End-to-end: the handler strips `__v1/` then resolves the real path.
    let root = create_protocol_plugin_root("arborsm.test", "index.js", "export {};");
    let plugin_dir = root.join("arborsm.test");

    let stripped = crate::strip_plugin_epoch_prefix("__v1/index.js");
    let resolved = super::resolve_plugin_protocol_path_in_roots(&[root], "arborsm.test", &stripped);
    assert_eq!(resolved, Some(plugin_dir.join("index.js")));
}

// ── manifest metadata fields (description/author/version/category/tags) ─────

#[test]
fn manifest_parses_optional_metadata_fields() {
    let root = create_temp_dir("compat-plugin-metadata");
    write_plugin(
        &root,
        "arborsm.meta-test",
        r#"{
  "format": 1,
  "id": "arborsm.meta-test",
  "name": "Meta Test",
  "description": "A test plugin with metadata.",
  "author": "TestAuthor",
  "version": "2.1.0",
  "category": "visual",
  "tags": ["textures", "ui"],
  "targets": ["Arborsm.MetaTest"],
  "contributions": {
    "attachedApi": {
      "providerUniqueId": "Arborsm.MetaTest",
      "targets": [{ "assetPath": "Data", "assetKind": "json" }]
    }
  }
}"#,
    );

    let report = load_plugin_manifests(&[root.clone()]);
    assert_eq!(report.errors.len(), 0);
    assert_eq!(report.manifests.len(), 1);
    let m = &report.manifests[0];
    assert_eq!(
        m.description.as_deref(),
        Some("A test plugin with metadata.")
    );
    assert_eq!(m.author.as_deref(), Some("TestAuthor"));
    assert_eq!(m.version.as_deref(), Some("2.1.0"));
    assert_eq!(m.category.as_deref(), Some("visual"));
    assert_eq!(m.tags, vec!["textures", "ui"]);
}

#[test]
fn manifest_metadata_fields_default_to_none_when_absent() {
    let root = create_temp_dir("compat-plugin-no-meta");
    write_plugin(
        &root,
        "arborsm.nometa",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.nometa"),
    );

    let report = load_plugin_manifests(&[root]);
    assert_eq!(report.errors.len(), 0);
    let m = &report.manifests[0];
    assert!(m.description.is_none());
    assert!(m.author.is_none());
    assert!(m.version.is_none());
    assert!(m.category.is_none());
    assert!(m.tags.is_empty());
}

#[test]
fn build_summaries_includes_metadata_fields() {
    let root = create_temp_dir("compat-plugin-summary-meta");
    write_plugin(
        &root,
        "arborsm.sum-meta",
        r#"{
  "format": 1,
  "id": "arborsm.sum-meta",
  "name": "Summary Meta",
  "description": "desc",
  "author": "auth",
  "version": "3.0",
  "category": "gameplay",
  "tags": ["a", "b"],
  "targets": ["Arborsm.SumMeta"],
  "contributions": {
    "attachedApi": {
      "providerUniqueId": "Arborsm.SumMeta",
      "targets": [{ "assetPath": "X", "assetKind": "json" }]
    }
  }
}"#,
    );

    let report = load_plugin_manifests(&[root]);
    let summaries = build_summaries_from_report(&report);
    assert_eq!(summaries.len(), 1);
    let s = &summaries[0];
    assert_eq!(s.description.as_deref(), Some("desc"));
    assert_eq!(s.author.as_deref(), Some("auth"));
    assert_eq!(s.version.as_deref(), Some("3.0"));
    assert_eq!(s.category.as_deref(), Some("gameplay"));
    assert_eq!(s.tags, vec!["a", "b"]);
    assert!(!s.disabled);
}

// ── enable/disable (`.disabled` marker) ─────────────────────────────────────

#[test]
fn is_plugin_disabled_returns_false_without_marker() {
    let root = create_temp_dir("compat-plugin-disabled-check");
    let dir = write_plugin(
        &root,
        "arborsm.dis-check",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.dis-check"),
    );
    assert!(!super::is_plugin_disabled(&dir));
}

#[test]
fn is_plugin_disabled_returns_true_with_marker() {
    let root = create_temp_dir("compat-plugin-disabled-true");
    let dir = write_plugin(
        &root,
        "arborsm.dis-true",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.dis-true"),
    );
    fs::write(dir.join(".disabled"), b"").unwrap();
    assert!(super::is_plugin_disabled(&dir));
}

#[test]
fn build_summaries_reports_disabled_state() {
    let root = create_temp_dir("compat-plugin-summary-disabled");
    let dir = write_plugin(
        &root,
        "arborsm.dis-sum",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.dis-sum"),
    );
    fs::write(dir.join(".disabled"), b"").unwrap();

    let report = load_plugin_manifests(&[root]);
    let summaries = build_summaries_from_report(&report);
    assert!(summaries[0].disabled);
}

#[test]
fn build_summaries_surfaces_manifest_load_errors_as_placeholders() {
    // A plugin directory with an invalid manifest (malformed JSON) should
    // produce a placeholder summary carrying the failure reason in
    // `load_error`, so the plugin manager can surface it instead of silently
    // dropping the failure.
    let root = create_temp_dir("compat-summary-load-error");
    let dir = root.join("arborsm.broken");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("manifest.json"), "{ not valid json").unwrap();

    let report = load_plugin_manifests(&[root]);
    assert_eq!(report.manifests.len(), 0);
    assert_eq!(report.errors.len(), 1);

    let summaries = build_summaries_from_report(&report);
    assert_eq!(summaries.len(), 1);
    let s = &summaries[0];
    assert_eq!(s.id, "arborsm.broken");
    assert_eq!(s.name, "arborsm.broken");
    assert!(s.load_error.is_some(), "load_error must be populated");
    assert!(s.pages.is_empty());
    assert!(!s.has_code_entry);
}

#[test]
fn build_summaries_mixes_valid_and_failed_plugins() {
    let root = create_temp_dir("compat-summary-mixed");
    // Valid plugin.
    write_plugin(
        &root,
        "arborsm.good",
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", "arborsm.good"),
    );
    // Broken plugin.
    let broken_dir = root.join("arborsm.bad");
    fs::create_dir_all(&broken_dir).unwrap();
    fs::write(broken_dir.join("manifest.json"), "garbage").unwrap();

    let report = load_plugin_manifests(&[root]);
    assert_eq!(report.manifests.len(), 1);
    assert_eq!(report.errors.len(), 1);

    let summaries = build_summaries_from_report(&report);
    assert_eq!(summaries.len(), 2);
    let good = summaries.iter().find(|s| s.id == "arborsm.good").unwrap();
    assert!(good.load_error.is_none());
    let bad = summaries.iter().find(|s| s.id == "arborsm.bad").unwrap();
    assert!(bad.load_error.is_some());
}

// ── set_plugin_disabled / delete_plugin ─────────────────────────────────────

/// Helper: set up a plugin root with a single plugin and return (root, plugin_dir).
fn setup_single_plugin(test_name: &str, id: &str) -> (PathBuf, PathBuf) {
    let root = create_temp_dir(test_name);
    let dir = write_plugin(
        &root,
        id,
        &valid_manifest_body().replace("arborsm.scaleup-unofficial", id),
    );
    (root, dir)
}

#[test]
fn set_plugin_disabled_creates_marker_file() {
    let (root, dir) = setup_single_plugin("compat-toggle-disable", "arborsm.toggle1");
    let result = super::set_plugin_disabled_in_roots(&[root.clone()], "arborsm.toggle1", true);
    assert!(result.is_ok());
    assert!(dir.join(".disabled").exists());
}

#[test]
fn set_plugin_enabled_removes_marker_file() {
    let (root, dir) = setup_single_plugin("compat-toggle-enable", "arborsm.toggle2");
    fs::write(dir.join(".disabled"), b"").unwrap();
    let result = super::set_plugin_disabled_in_roots(&[root.clone()], "arborsm.toggle2", false);
    assert!(result.is_ok());
    assert!(!dir.join(".disabled").exists());
}

#[test]
fn set_plugin_enabled_is_idempotent_when_already_enabled() {
    let (root, _dir) = setup_single_plugin("compat-toggle-idempotent", "arborsm.toggle3");
    let result = super::set_plugin_disabled_in_roots(&[root.clone()], "arborsm.toggle3", false);
    assert!(result.is_ok());
}

#[test]
fn set_plugin_disabled_errors_for_unknown_plugin() {
    let root = create_temp_dir("compat-toggle-unknown");
    let result = super::set_plugin_disabled_in_roots(&[root], "arborsm.nonexistent", true);
    assert!(result.is_err());
}

#[test]
fn delete_plugin_removes_directory() {
    let (root, dir) = setup_single_plugin("compat-delete", "arborsm.delete1");
    let result = super::delete_plugin_in_roots(&[root], "arborsm.delete1");
    assert!(result.is_ok());
    assert!(!dir.exists());
}

#[test]
fn delete_plugin_errors_for_unknown_plugin() {
    let root = create_temp_dir("compat-delete-unknown");
    let result = super::delete_plugin_in_roots(&[root], "arborsm.nonexistent");
    assert!(result.is_err());
}

// ── path traversal rejection (security regression) ──────────────────────────
//
// `find_plugin_dir_in_roots` feeds the destructive `delete_plugin` / `set_plugin_disabled`
// mutations. The plugin id must be validated against `PLUGIN_ID_PATTERN` and
// the joined path lexically confined to the root, otherwise a malicious or
// malformed id could escape the plugin root (`..`) or replace the base entirely
// (absolute paths / drive letters on Windows). These cases must never reach the
// filesystem mutation.

#[test]
fn find_plugin_dir_rejects_parent_traversal() {
    let (root, _dir) = setup_single_plugin("compat-traversal-parent", "arborsm.real");
    // Place a sibling directory outside the plugin root that a `..` traversal
    // would otherwise hit.
    let outside = root
        .parent()
        .unwrap()
        .join("compat-traversal-outside-target");
    fs::create_dir_all(&outside).unwrap();
    let resolved =
        super::find_plugin_dir_in_roots(&[root.clone()], "../../compat-traversal-outside-target");
    assert!(resolved.is_none(), "parent traversal must not resolve");
    // Sanity: the legitimate id still resolves.
    assert!(super::find_plugin_dir_in_roots(&[root], "arborsm.real").is_some());
}

#[test]
fn find_plugin_dir_rejects_absolute_path() {
    let (root, _dir) = setup_single_plugin("compat-traversal-absolute", "arborsm.real");
    let abs = if cfg!(windows) {
        "C:/Windows/System32".to_string()
    } else {
        "/etc".to_string()
    };
    assert!(super::find_plugin_dir_in_roots(&[root], &abs).is_none());
}

#[test]
fn find_plugin_dir_rejects_path_separators_in_id() {
    let (root, _dir) = setup_single_plugin("compat-traversal-separators", "arborsm.real");
    assert!(super::find_plugin_dir_in_roots(&[root.clone()], "arborsm/real").is_none());
    assert!(super::find_plugin_dir_in_roots(&[root.clone()], "arborsm\\real").is_none());
}

#[test]
fn delete_plugin_rejects_traversal_without_touching_filesystem() {
    let (root, dir) = setup_single_plugin("compat-delete-traversal", "arborsm.real");
    let outside = root
        .parent()
        .unwrap()
        .join("compat-delete-traversal-outside");
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("canary.txt"), b"alive").unwrap();

    let result = super::delete_plugin_in_roots(&[root], "../../compat-delete-traversal-outside");
    assert!(result.is_err());
    // The outside directory and its canary must be untouched.
    assert!(outside.join("canary.txt").exists());
    // The legitimate plugin directory is also untouched by the rejected call.
    assert!(dir.exists());
}

#[test]
fn set_plugin_disabled_rejects_traversal_without_touching_filesystem() {
    let (root, _dir) = setup_single_plugin("compat-toggle-traversal", "arborsm.real");
    let outside = root
        .parent()
        .unwrap()
        .join("compat-toggle-traversal-outside");
    fs::create_dir_all(&outside).unwrap();

    let result =
        super::set_plugin_disabled_in_roots(&[root], "../../compat-toggle-traversal-outside", true);
    assert!(result.is_err());
    // No `.disabled` marker should appear outside the plugin root.
    assert!(!outside.join(".disabled").exists());
}
