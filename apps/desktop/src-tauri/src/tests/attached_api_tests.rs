use crate::domain::content_patcher::attached::load_attached_api_registry;
use crate::domain::modding::attached_api as domain_attached_api;
use crate::domain::modding::attached_api::AttachedApiRegistry;

#[test]
fn load_attached_api_registry_returns_built_in_scaleup_compatibility_and_targets() {
    let registry = load_attached_api_registry(None);

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

#[test]
fn domain_attached_api_registry_preserves_existing_registration_behavior() {
    let registry = domain_attached_api::AttachedApiRegistry::from_test_descriptors(&[(
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
