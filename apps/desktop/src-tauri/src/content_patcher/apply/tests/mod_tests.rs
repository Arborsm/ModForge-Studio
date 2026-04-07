use super::{load_target_base_with, LoadedTargetBase};
use crate::content_patcher::assets::{LoadedBaseImageAsset, LoadedMapAsset};
use crate::content_patcher::types::ContentPatcherMapDebugSummary;
use crate::tbin::MapDocument;
use image::RgbaImage;
use serde_json::json;
use std::cell::Cell;
use std::collections::HashMap;

fn empty_map_document() -> MapDocument {
    MapDocument {
        name: "Test".to_string(),
        format: "xnb".to_string(),
        source_path: "Content/Maps/Test.xnb".to_string(),
        relative_path: "Content/Maps/Test.xnb".to_string(),
        width: 0,
        height: 0,
        tile_width: 16,
        tile_height: 16,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        properties: HashMap::new(),
        tilesets: Vec::new(),
        layers: Vec::new(),
        object_groups: Vec::new(),
    }
}

#[test]
fn load_target_base_only_loads_image_state_for_image_targets() {
    let json_calls = Cell::new(0);
    let image_calls = Cell::new(0);
    let map_calls = Cell::new(0);

    let loaded = load_target_base_with(
        "image",
        "Portraits/Shane",
        Some("E:\\Game"),
        |_, _| {
            json_calls.set(json_calls.get() + 1);
            json!({})
        },
        |_, _| {
            image_calls.set(image_calls.get() + 1);
            LoadedBaseImageAsset {
                image: RgbaImage::from_pixel(1, 1, image::Rgba([0, 0, 0, 0])),
                source: "Game content".to_string(),
            }
        },
        |_, _| {
            map_calls.set(map_calls.get() + 1);
            LoadedMapAsset {
                document: empty_map_document(),
                debug: ContentPatcherMapDebugSummary::default(),
            }
        },
    );

    assert!(matches!(loaded, LoadedTargetBase::Image { .. }));
    assert_eq!(json_calls.get(), 0);
    assert_eq!(image_calls.get(), 1);
    assert_eq!(map_calls.get(), 0);
}
