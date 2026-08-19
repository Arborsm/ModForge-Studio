use std::fs;

use crate::domain::content_patcher::attached::load_attached_api_registry;
use crate::domain::modding::attached_api::AttachedApiRegistry;
use crate::test_support::create_temp_dir;

/// Builds a fixture plugin root containing a single ScaleUp-equivalent plugin
/// manifest, so the integration test does not depend on the real dev plugin
/// directory being present.
fn scaleup_fixture_root() -> std::path::PathBuf {
    let root = create_temp_dir("attached-api-fixture");
    let plugin_dir = root.join("arborsm.scaleup-unofficial");
    fs::create_dir_all(&plugin_dir).unwrap();
    fs::write(
        plugin_dir.join("manifest.json"),
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
}"#,
    )
    .unwrap();
    root
}

#[test]
fn load_attached_api_registry_returns_built_in_scaleup_compatibility_and_targets() {
    let fixture = scaleup_fixture_root();
    let registry = load_attached_api_registry(Some(&fixture.to_string_lossy()));

    assert_eq!(
        registry.provided_unique_ids_for("Arborsm.ScaleUpUnofficial"),
        vec![
            "Arborsm.ScaleUpUnofficial".to_string(),
            "Platonymous.ScaleUp".to_string(),
            "BleakCodex.SpritesInDetail".to_string()
        ]
    );
    assert_eq!(
        registry.infer_asset_kind("{{Platonymous.ScaleUp/Assets}}"),
        Some("json")
    );
    assert_eq!(
        registry.infer_asset_kind("Arborsm.ScaleUpUnofficial/PreviewTexture"),
        Some("image")
    );
}

#[test]
fn from_test_descriptors_registers_compatible_ids_and_asset_kinds() {
    let registry = AttachedApiRegistry::from_test_descriptors(&[(
        "Arborsm.ScaleUpUnofficial",
        &["Platonymous.ScaleUp"],
        &[("PreviewTexture", "image")],
    )]);

    assert_eq!(
        registry.provided_unique_ids_for("Arborsm.ScaleUpUnofficial"),
        vec![
            "Arborsm.ScaleUpUnofficial".to_string(),
            "Platonymous.ScaleUp".to_string()
        ]
    );
    assert_eq!(
        registry.infer_asset_kind("Arborsm.ScaleUpUnofficial/PreviewTexture"),
        Some("image")
    );
}

/// Verifies that `load_attached_api_registry(None)` resolves plugin roots from
/// the build configuration (dev anchor or packaged roots set at startup) and
/// returns the ScaleUp compatibility descriptor. This is the production code
/// path used by `scan_mods`, `scan_mod_asset_index`, `inspect_project` and
/// Content Patcher — it must not return an empty registry in any build.
#[test]
fn load_attached_api_registry_with_none_resolves_roots_and_returns_scaleup() {
    let registry = load_attached_api_registry(None);

    // The dev build anchors on CARGO_MANIFEST_DIR/../compat-plugins which
    // contains the ScaleUp plugin manifest. In a packaged build the roots are
    // set at startup via set_plugin_roots. Either way, the registry must
    // contain the ScaleUp compatibility descriptor.
    assert_eq!(
        registry.provided_unique_ids_for("Arborsm.ScaleUpUnofficial"),
        vec![
            "Arborsm.ScaleUpUnofficial".to_string(),
            "Platonymous.ScaleUp".to_string(),
            "BleakCodex.SpritesInDetail".to_string()
        ]
    );
    assert_eq!(
        registry.infer_asset_kind("{{Platonymous.ScaleUp/Assets}}"),
        Some("json")
    );
}

/// Verifies that `load_attached_api_registry(None)` caches its result for the
/// process lifetime — repeated calls return an equivalent registry without
/// re-reading from disk. This matches the previous hardcoded descriptor's
/// zero-cost repeated access and avoids a performance regression on the hot
/// mod-scan / CP paths.
#[test]
fn load_attached_api_registry_with_none_caches_result() {
    let first = load_attached_api_registry(None);
    let second = load_attached_api_registry(None);

    // Both calls must return the same ScaleUp compatibility data.
    assert_eq!(
        first.provided_unique_ids_for("Arborsm.ScaleUpUnofficial"),
        second.provided_unique_ids_for("Arborsm.ScaleUpUnofficial")
    );
    assert_eq!(
        first.infer_asset_kind("{{Platonymous.ScaleUp/Assets}}"),
        second.infer_asset_kind("{{Platonymous.ScaleUp/Assets}}")
    );
}
