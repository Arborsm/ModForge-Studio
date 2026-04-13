use crate::domain::modding::attached_api::{AttachedApiDescriptor, AttachedApiTargetDescriptor};

/// Built-in attached registration for ScaleUp compatibility.
pub(crate) fn descriptor() -> AttachedApiDescriptor {
    AttachedApiDescriptor {
        provider_unique_id: "Arborsm.ScaleUpUnofficial",
        provided_unique_ids: vec![
            "Platonymous.ScaleUp".to_string(),
            "BleakCodex.SpritesInDetail".to_string(),
        ],
        targets: vec![
            AttachedApiTargetDescriptor {
                asset_path: "Assets".to_string(),
                asset_kind: "json".to_string(),
            },
            AttachedApiTargetDescriptor {
                asset_path: "PreviewTexture".to_string(),
                asset_kind: "image".to_string(),
            },
        ],
    }
}
