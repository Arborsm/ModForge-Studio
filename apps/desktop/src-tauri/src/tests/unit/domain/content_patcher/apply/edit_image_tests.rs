use super::super::super::assets::{encode_image_png, with_virtual_preview_assets};
use super::super::super::types::{ContentPatcherProjectSnapshot, VirtualPreviewAsset};
use super::apply_edit_image_patch;
use base64::Engine;
use image::RgbaImage;
use serde_json::{Map, Value, json};

fn empty_snapshot() -> ContentPatcherProjectSnapshot {
    ContentPatcherProjectSnapshot {
        summary: Default::default(),
        sources: Vec::new(),
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    }
}

fn patch_from(obj: Value) -> Map<String, Value> {
    obj.as_object().unwrap().clone()
}

fn image_to_virtual_asset(image: &RgbaImage, relative_path: &str) -> VirtualPreviewAsset {
    let bytes = encode_image_png(image).unwrap();
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    VirtualPreviewAsset {
        relative_path: relative_path.to_string(),
        media_type: "image/png".to_string(),
        bytes_base64: base64,
    }
}

#[test]
fn apply_mask_reduces_alpha() {
    // Base image: 4x4 fully opaque white
    let mut base = RgbaImage::from_pixel(4, 4, image::Rgba([255, 255, 255, 255]));
    // Mask image: 2x2 with alpha=128 (semi-transparent black)
    let mask = RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 128]));

    let asset = image_to_virtual_asset(&mask, "assets/mask.png");
    let snapshot = empty_snapshot();
    let patch = patch_from(json!({
        "FromFile": "assets/mask.png",
        "PatchMode": "Mask",
        "ToArea": { "X": 1, "Y": 1 }
    }));

    let result = with_virtual_preview_assets(Some(&[asset]), || {
        apply_edit_image_patch(&snapshot, &mut base, &patch, "content.json")
    });
    assert!(result.is_ok(), "{result:?}");

    // Pixel (0,0) should be untouched (outside mask area)
    let untouched = base.get_pixel(0, 0);
    assert_eq!(untouched[3], 255);

    // Pixel (1,1) should have reduced alpha: 255 * (1 - 128/255) ≈ 127
    let masked = base.get_pixel(1, 1);
    assert!(
        masked[3] < 255,
        "expected alpha reduction, got {}",
        masked[3]
    );
    assert!(masked[3] > 0, "expected non-zero alpha, got {}", masked[3]);
}

#[test]
fn apply_replace_overwrites_pixels() {
    let mut base = RgbaImage::from_pixel(4, 4, image::Rgba([255, 0, 0, 255]));
    let source = RgbaImage::from_pixel(2, 2, image::Rgba([0, 255, 0, 255]));

    let asset = image_to_virtual_asset(&source, "assets/green.png");
    let snapshot = empty_snapshot();
    let patch = patch_from(json!({
        "FromFile": "assets/green.png",
        "PatchMode": "Replace",
        "ToArea": { "X": 0, "Y": 0 }
    }));

    let result = with_virtual_preview_assets(Some(&[asset]), || {
        apply_edit_image_patch(&snapshot, &mut base, &patch, "content.json")
    });
    assert!(result.is_ok(), "{result:?}");

    // (0,0) should be green
    assert_eq!(base.get_pixel(0, 0), &image::Rgba([0, 255, 0, 255]));
    // (3,3) should remain red
    assert_eq!(base.get_pixel(3, 3), &image::Rgba([255, 0, 0, 255]));
}

#[test]
fn apply_overlay_blends_pixels() {
    let mut base = RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    let source = RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 255, 128]));

    let asset = image_to_virtual_asset(&source, "assets/blue.png");
    let snapshot = empty_snapshot();
    let patch = patch_from(json!({
        "FromFile": "assets/blue.png",
        "PatchMode": "Overlay"
    }));

    let result = with_virtual_preview_assets(Some(&[asset]), || {
        apply_edit_image_patch(&snapshot, &mut base, &patch, "content.json")
    });
    assert!(result.is_ok(), "{result:?}");

    // After overlay, pixel should be blended (not pure red or pure blue)
    let blended = base.get_pixel(0, 0);
    assert_ne!(blended[0], 255, "red should be blended");
    assert_ne!(blended[2], 255, "blue should be blended");
}

#[test]
fn default_patch_mode_is_replace() {
    let mut base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 0, 255]));
    let source = RgbaImage::from_pixel(1, 1, image::Rgba([255, 255, 255, 255]));

    let asset = image_to_virtual_asset(&source, "assets/white.png");
    let snapshot = empty_snapshot();
    // No PatchMode specified
    let patch = patch_from(json!({
        "FromFile": "assets/white.png"
    }));

    let result = with_virtual_preview_assets(Some(&[asset]), || {
        apply_edit_image_patch(&snapshot, &mut base, &patch, "content.json")
    });
    assert!(result.is_ok(), "{result:?}");
    assert_eq!(base.get_pixel(0, 0), &image::Rgba([255, 255, 255, 255]));
}
