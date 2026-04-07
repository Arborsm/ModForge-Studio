use super::infer_target_asset_kind;
use crate::attached_api::AttachedApiRegistry;

#[test]
fn infer_target_asset_kind_prefers_image_for_maps_target_when_action_is_edit_image() {
    let kind = infer_target_asset_kind(
        "Maps/TestTilesheet",
        &["EditImage".to_string()],
        &[Some("assets/test.png".to_string())],
        &AttachedApiRegistry::default(),
    );

    assert_eq!(kind, "image");
}

#[test]
fn infer_target_asset_kind_prefers_image_for_maps_target_when_loading_png() {
    let kind = infer_target_asset_kind(
        "Maps/TestTilesheet",
        &["Load".to_string()],
        &[Some("assets/test.png".to_string())],
        &AttachedApiRegistry::default(),
    );

    assert_eq!(kind, "image");
}

#[test]
fn infer_target_asset_kind_prefers_sidecar_registry_for_custom_targets() {
    let registry = AttachedApiRegistry::from_test_descriptors(
        &[("Arborsm.ScaleUpUnofficial", &["Arborsm.ScaleUpUnofficial"], &[("PreviewTexture", "image")])],
    );
    let kind = infer_target_asset_kind(
        "Arborsm.ScaleUpUnofficial/PreviewTexture",
        &["EditData".to_string()],
        &[None],
        &registry,
    );

    assert_eq!(kind, "image");
}
