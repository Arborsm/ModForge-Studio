use super::super::assets::{crop_image_area, expand_image_to_fit, load_image_patch_asset};
use super::super::schema::coerce_u32;
use super::super::types::ContentPatcherProjectSnapshot;
use image::RgbaImage;
use serde_json::Value;

#[derive(Clone, Copy)]
struct AreaDefaults {
    x: Option<u32>,
    y: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
}

impl AreaDefaults {
    fn source() -> Self {
        Self {
            x: Some(0),
            y: Some(0),
            width: None,
            height: None,
        }
    }

    fn destination(width: u32, height: u32) -> Self {
        Self {
            x: Some(0),
            y: Some(0),
            width: Some(width),
            height: Some(height),
        }
    }
}

fn contains_unresolved_token(text: &str) -> bool {
    text.contains("{{") && text.contains("}}")
}

fn parse_object_area(
    values: &serde_json::Map<String, Value>,
    defaults: AreaDefaults,
) -> Result<(u32, u32, u32, u32), String> {
    let read = |key: &str, default: Option<u32>| -> Result<u32, String> {
        match values.get(key) {
            Some(value) => {
                if let Value::String(text) = value {
                    if contains_unresolved_token(text) {
                        return Err(format!("Image area `{key}` contains an unresolved token."));
                    }
                }
                coerce_u32(value)
                    .ok_or_else(|| format!("Image area `{key}` must be an unsigned integer."))
            }
            None => default.ok_or_else(|| format!("Image area object is missing `{key}`.")),
        }
    };

    Ok((
        read("X", defaults.x)?,
        read("Y", defaults.y)?,
        read("Width", defaults.width)?,
        read("Height", defaults.height)?,
    ))
}

fn parse_area_value(
    value: Option<&Value>,
    defaults: AreaDefaults,
) -> Result<Option<(u32, u32, u32, u32)>, String> {
    let Some(value) = value else {
        return Ok(None);
    };

    match value {
        Value::Array(values) if values.len() == 4 => {
            let numbers = values
                .iter()
                .map(|entry| {
                    if let Value::String(text) = entry {
                        if contains_unresolved_token(text) {
                            return Err("Image area array contains an unresolved token.".to_string());
                        }
                    }
                    coerce_u32(entry).ok_or_else(|| {
                        "Image area array values must be unsigned integers.".to_string()
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Some((numbers[0], numbers[1], numbers[2], numbers[3])))
        }
        Value::String(text) => {
            if contains_unresolved_token(text) {
                return Err("Image area string contains an unresolved token.".to_string());
            }
            let parts = text
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(|part| {
                    if contains_unresolved_token(part) {
                        return Err("Image area string contains an unresolved token.".to_string());
                    }
                    part.parse::<u32>()
                        .map_err(|err| format!("Invalid image area segment `{part}`: {err}"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if parts.len() != 4 {
                return Err(
                    "Image area string must contain four comma-separated integers.".to_string(),
                );
            }
            Ok(Some((parts[0], parts[1], parts[2], parts[3])))
        }
        Value::Object(values) => Ok(Some(parse_object_area(values, defaults)?)),
        _ => Err("Image area must be an array, object, or comma-separated string.".to_string()),
    }
}

fn apply_replace(base: &mut RgbaImage, source: &RgbaImage, to_x: u32, to_y: u32) {
    for (x, y, pixel) in source.enumerate_pixels() {
        base.put_pixel(to_x + x, to_y + y, *pixel);
    }
}

fn apply_mask(base: &mut RgbaImage, source: &RgbaImage, to_x: u32, to_y: u32) {
    for (x, y, mask_pixel) in source.enumerate_pixels() {
        let bx = to_x + x;
        let by = to_y + y;
        if bx >= base.width() || by >= base.height() {
            continue;
        }
        let mut target_pixel = *base.get_pixel(bx, by);
        let mask_alpha = f32::from(mask_pixel[3]) / 255.0;
        let new_alpha = (f32::from(target_pixel[3]) * (1.0 - mask_alpha)).round() as u8;
        target_pixel[3] = new_alpha;
        base.put_pixel(bx, by, target_pixel);
    }
}

pub fn apply_edit_image_patch(
    snapshot: &ContentPatcherProjectSnapshot,
    base: &mut RgbaImage,
    patch: &serde_json::Map<String, Value>,
    source_path: &str,
) -> Result<String, String> {
    let from_file = patch
        .get("FromFile")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "EditImage patch is missing a FromFile value.".to_string())?;

    let mut source = load_image_patch_asset(snapshot, source_path, from_file)?;
    if let Some((x, y, width, height)) =
        parse_area_value(patch.get("FromArea"), AreaDefaults::source())?
    {
        source = crop_image_area(&source, x, y, width, height)?;
    }

    let (to_x, to_y, _, _) = parse_area_value(
        patch.get("ToArea"),
        AreaDefaults::destination(source.width(), source.height()),
    )?
    .unwrap_or((0, 0, source.width(), source.height()));
    let required_width = to_x
        .checked_add(source.width())
        .ok_or_else(|| "Image destination width overflowed.".to_string())?;
    let required_height = to_y
        .checked_add(source.height())
        .ok_or_else(|| "Image destination height overflowed.".to_string())?;
    expand_image_to_fit(base, required_width, required_height);

    let mode = patch
        .get("PatchMode")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("Replace");

    if mode.eq_ignore_ascii_case("Replace") {
        apply_replace(base, &source, to_x, to_y);
    } else if mode.eq_ignore_ascii_case("Mask") {
        apply_mask(base, &source, to_x, to_y);
    } else {
        image::imageops::overlay(base, &source, i64::from(to_x), i64::from(to_y));
    }

    Ok(format!(
        "applied {} image {}x{} at {},{}",
        mode,
        source.width(),
        source.height(),
        to_x,
        to_y
    ))
}

#[cfg(test)]
mod tests {
    use super::apply_edit_image_patch;
    use super::super::super::assets::{encode_image_png, with_virtual_preview_assets};
    use super::super::super::types::{ContentPatcherProjectSnapshot, VirtualPreviewAsset};
    use base64::Engine;
    use image::RgbaImage;
    use serde_json::{json, Map, Value};

    fn empty_snapshot() -> ContentPatcherProjectSnapshot {
        ContentPatcherProjectSnapshot {
            summary: Default::default(),
            sources: Vec::new(),
            include_tree: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn patch_from(obj: serde_json::Value) -> Map<String, Value> {
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
        assert!(masked[3] < 255, "expected alpha reduction, got {}", masked[3]);
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
}
