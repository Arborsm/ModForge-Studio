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
