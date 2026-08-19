use super::{
    infer_target_asset_kind, load_json_patch_asset, load_map_patch_asset,
    with_virtual_preview_assets,
};
use crate::domain::content_patcher::types::{
    ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, VirtualPreviewAsset,
};
use crate::domain::modding::attached_api::AttachedApiRegistry;
use base64::Engine;
use serde_json::Value;

fn virtual_preview_asset(
    relative_path: &str,
    media_type: &str,
    bytes: &[u8],
) -> VirtualPreviewAsset {
    VirtualPreviewAsset {
        relative_path: relative_path.to_string(),
        media_type: media_type.to_string(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    }
}

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
    let registry = AttachedApiRegistry::from_test_descriptors(&[(
        "Arborsm.ScaleUpUnofficial",
        &["Arborsm.ScaleUpUnofficial"],
        &[("PreviewTexture", "image")],
    )]);
    let kind = infer_target_asset_kind(
        "Arborsm.ScaleUpUnofficial/PreviewTexture",
        &["EditData".to_string()],
        &[None],
        &registry,
    );

    assert_eq!(kind, "image");
}

#[test]
fn infer_target_asset_kind_treats_character_dialogue_and_schedules_as_data() {
    for target in [
        "Characters/Dialogue/Abigail",
        "Characters/Dialogue/Marriage/Abigail",
        "Characters/Schedules/Alex",
    ] {
        let kind = infer_target_asset_kind(
            target,
            &["EditData".to_string()],
            &[None],
            &AttachedApiRegistry::default(),
        );
        assert_eq!(kind, "json", "target {target}");
    }

    let sprite_kind = infer_target_asset_kind(
        "Characters/Abigail",
        &["EditData".to_string()],
        &[None],
        &AttachedApiRegistry::default(),
    );
    assert_eq!(sprite_kind, "image");
}

#[test]
fn load_map_patch_asset_resolves_from_file_relative_to_pack_root() {
    let snapshot = ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary::default(),
        sources: Vec::new(),
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    };

    // Content Patcher resolves patch FromFile paths relative to the content pack
    // root, even when the patch is declared inside an included file.
    let error = with_virtual_preview_assets(
        Some(&[virtual_preview_asset(
            "assets/generated/Town.tbin",
            "application/octet-stream",
            b"not-a-tbin",
        )]),
        || {
            load_map_patch_asset(&snapshot, "assets/generated/Town.tbin")
                .expect_err("virtual map parse")
        },
    );

    assert!(error.to_string().contains("File is not a tbin file."));
    assert!(!error.to_string().contains("Unable to resolve FromFile"));
    assert!(!error.to_string().contains("Failed to read map patch asset"));
}

#[test]
fn load_json_patch_asset_resolves_included_patch_from_file_from_pack_root() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-fromfile-pack-root");
    let pack_root = temp_dir.join("pack");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");
    std::fs::write(
        pack_root.join("assets").join("data.json"),
        r#"{"Value": 1}"#,
    )
    .expect("write json");

    let snapshot = ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary {
            absolute_path: Some(pack_root.to_string_lossy().into_owned()),
            ..Default::default()
        },
        sources: Vec::new(),
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    };

    // A patch declared in `patches/nested.json` uses a pack-root-relative FromFile.
    let parsed = load_json_patch_asset(&snapshot, "assets/data.json").expect("load json");
    assert_eq!(parsed.get("Value").and_then(Value::as_i64), Some(1));

    std::fs::remove_dir_all(temp_dir).expect("cleanup");
}

#[cfg(unix)]
#[test]
fn load_json_patch_asset_rejects_symlink_escape_outside_project_root() {
    use std::os::unix::fs::symlink;

    let temp_dir = std::env::temp_dir().join("modforge-cp-fromfile-symlink-escape");
    let pack_root = temp_dir.join("pack");
    let outside_root = temp_dir.join("outside");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");
    std::fs::create_dir_all(&outside_root).expect("outside dir");
    std::fs::write(outside_root.join("secret.json"), r#"{"Secret": true}"#).expect("outside json");
    symlink(
        outside_root.join("secret.json"),
        pack_root.join("assets").join("secret.json"),
    )
    .expect("symlink");

    let snapshot = ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary {
            absolute_path: Some(pack_root.to_string_lossy().into_owned()),
            ..Default::default()
        },
        sources: Vec::new(),
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    };

    let error = load_json_patch_asset(&snapshot, "assets/secret.json").expect_err("symlink escape");
    assert!(error.to_string().contains("outside the content pack root"));

    std::fs::remove_dir_all(temp_dir).expect("cleanup");
}
