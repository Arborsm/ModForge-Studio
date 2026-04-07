use super::{load_attached_api_registry, AttachedApiRegistry};
use crate::attached_api::test_support::install_scaleup_attached_api_plugin;
use crate::test_support::create_temp_dir;
use std::fs;

#[test]
fn load_attached_api_registry_discovers_sidecar_plugin_compatibility_and_targets() {
    let root = create_temp_dir("attached-api-registry");
    install_scaleup_attached_api_plugin(&root);

    let registry = load_attached_api_registry(Some(&root.to_string_lossy()));

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

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn from_test_descriptors_registers_compatible_ids_and_asset_kinds() {
    let registry = AttachedApiRegistry::from_test_descriptors(
        &[("Arborsm.ScaleUpUnofficial", &["Platonymous.ScaleUp"], &[("PreviewTexture", "image")])],
    );

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
