use super::{
    export_content_patcher_asset, load_content_patcher_result_asset, simulate_content_patcher,
};
use crate::content_patcher::context::SimulationContext;
use crate::content_patcher::types::{
    ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile,
    ExportContentPatcherAssetRequest, LoadContentPatcherResultAssetRequest,
    SimulateContentPatcherRequest,
};
use base64::Engine;
use image::RgbaImage;
use serde_json::Value;
use std::path::PathBuf;

fn scaleup_assets_target() -> &'static str {
    "{{Arborsm.ScaleUpUnofficial/Assets}}"
}

fn real_skimpy_scaleup_pack_path() -> PathBuf {
    std::env::var_os("MODFORGE_REAL_SCALEUP_PACK_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(r"E:\SteamLibrary\steamapps\common\Stardew Valley\mods\[CP] [DDF] Skimpy VN Portraits")
        })
}

#[test]
fn simulate_content_patcher_marks_malformed_when_as_indeterminate() {
    let snapshot = ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary::default(),
        sources: vec![ContentPatcherSourceFile {
            path: "content.json".to_string(),
            absolute_path: "content.json".to_string(),
            raw_json: r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "Maps/Town",
      "When": "spring"
    }
  ]
}"#
            .to_string(),
        }],
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    };
    let request = SimulateContentPatcherRequest {
        path: None,
        game_root_path: None,
        snapshot: Some(snapshot),
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext {
            season: Some("spring".to_string()),
            ..SimulationContext::default()
        }),
    };

    let result = simulate_content_patcher(request).expect("simulation");
    let status = result.patch_statuses.first().expect("status");

    assert_eq!(status.status, "indeterminate");
    assert!(status.patch_id.is_some());
    assert!(status.reasons.iter().any(|reason| reason.contains("When")));
}

#[test]
fn simulate_content_patcher_uses_in_memory_edits_for_phase_a_statuses() {
    let request = SimulateContentPatcherRequest {
        path: None,
        game_root_path: None,
        snapshot: None,
        manifest_json: Some(
            r#"{
  "Name": "Inline Pack",
  "UniqueID": "ModForge.InlinePack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
            .to_string(),
        ),
        content_json: Some(
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Data/Objects",
      "When": { "Season": "spring" }
    }
  ]
}"#
            .to_string(),
        ),
        context: Some(SimulationContext {
            season: Some("spring".to_string()),
            ..SimulationContext::default()
        }),
    };

    let result = simulate_content_patcher(request).expect("simulate");
    assert_eq!(result.plan.patches.len(), 1);
    assert_eq!(result.patch_statuses[0].status, "applied");
    assert_eq!(result.targets.len(), 1);
    assert_eq!(result.targets[0].path, "Data/Objects");
    assert_eq!(result.targets[0].asset_kind, "json");
}

#[test]
fn simulate_content_patcher_preserves_target_order_from_plan() {
    let request = SimulateContentPatcherRequest {
        path: None,
        game_root_path: None,
        snapshot: None,
        manifest_json: Some(
            r#"{
  "Name": "Inline Pack",
  "UniqueID": "ModForge.TargetOrder",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
            .to_string(),
        ),
        content_json: Some(
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditData", "Target": "Data/Z" },
    { "Action": "EditData", "Target": "Data/A" },
    { "Action": "EditData", "Target": "Data/Z" }
  ]
}"#
            .to_string(),
        ),
        context: Some(SimulationContext::default()),
    };

    let result = simulate_content_patcher(request).expect("simulate");
    let targets = result
        .targets
        .iter()
        .map(|target| target.path.as_str())
        .collect::<Vec<_>>();
    assert_eq!(targets, vec!["Data/Z", "Data/A"]);
}

#[test]
fn simulate_content_patcher_uses_built_in_scaleup_asset_kinds() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-appdata-attached-api");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(&pack_root).expect("pack dir");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Attached Api Pack",
  "UniqueID": "ModForge.AttachedApiPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Arborsm.ScaleUpUnofficial/PreviewTexture",
      "Entries": { "example": { "Value": "preview" } }
    }
  ]
}"#,
    )
    .expect("content");

    let result = simulate_content_patcher(SimulateContentPatcherRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
    });
    let result = result.expect("simulate");

    assert_eq!(
        result.targets[0].path,
        "Arborsm.ScaleUpUnofficial/PreviewTexture"
    );
    assert_eq!(result.targets[0].asset_kind, "image");

    std::fs::remove_dir_all(temp_dir).expect("cleanup");
}

#[test]
fn load_content_patcher_result_asset_loads_scaleup_entries_from_included_file() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-scaleup-attached-assets-pack");
    let pack_root = temp_dir.join("pack");
    let scaleup_dir = pack_root.join("assets").join("Characters").join("ScaleUp");
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&scaleup_dir).expect("scaleup dir");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Skimpy Portraits Test",
  "UniqueID": "Mud.SkimpyPortraits",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.4.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "assets/Characters/ScaleUp/sprites.json"
    }
  ]
}"#,
    )
    .expect("content");
    std::fs::write(
        scaleup_dir.join("sprites.json"),
        r#"{
  "Changes": [
    {
      "Action": "EditData",
      "Target": "{{Arborsm.ScaleUpUnofficial/Assets}}",
      "Entries": {
        "BB1ScaleUp": [
          {
            "Asset": "bonus/Painting I reg",
            "Scale": 4
          },
          {
            "Target": "Characters",
            "Assets": "Emily, Emily_Beach, Emily_Swims, Emily_Winter",
            "Sprite": {
              "BreathType": "None",
              "HeadShotX": 16,
              "HeadShotY": 62
            }
          }
        ]
      }
    }
  ]
}"#,
    )
    .expect("scaleup content");

    let simulation = simulate_content_patcher(SimulateContentPatcherRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
    })
    .expect("simulate");
    let target = simulation
        .targets
        .iter()
        .find(|target| target.path == scaleup_assets_target())
        .expect("scaleup assets target");
    assert_eq!(target.asset_kind, "json");
    assert_eq!(target.result_state, "determinate");
    assert_eq!(target.touched_patch_count, 1);

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: scaleup_assets_target().to_string(),
    })
    .expect("scaleup json result");

    assert_eq!(result.target.path, scaleup_assets_target());
    assert_eq!(result.target.asset_kind, "json");
    assert_eq!(result.result.kind, "json");
    assert_eq!(result.trace.len(), 1);
    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(
        result.trace[0].source_path,
        "assets/Characters/ScaleUp/sprites.json"
    );

    let entries = result
        .result
        .json
        .as_ref()
        .and_then(|json| json.get("BB1ScaleUp"))
        .and_then(Value::as_array)
        .expect("BB1ScaleUp array");
    assert_eq!(entries.len(), 2);
    assert_eq!(
        entries[0].get("Asset").and_then(Value::as_str),
        Some("bonus/Painting I reg")
    );
    assert_eq!(entries[0].get("Scale").and_then(Value::as_i64), Some(4));
    assert_eq!(
        entries[1].get("Target").and_then(Value::as_str),
        Some("Characters")
    );
    assert_eq!(
        entries[1].get("Assets").and_then(Value::as_str),
        Some("Emily, Emily_Beach, Emily_Swims, Emily_Winter")
    );

    std::fs::remove_dir_all(temp_dir).expect("cleanup");
}

#[test]
#[ignore = "requires local Skimpy VN Portraits install"]
fn load_content_patcher_result_asset_reads_scaleup_entries_from_real_skimpy_pack() {
    let pack_root = real_skimpy_scaleup_pack_path();
    assert!(
        pack_root.join("manifest.json").is_file(),
        "missing manifest.json for real pack: {}",
        pack_root.display()
    );
    assert!(
        pack_root
            .join("assets")
            .join("Characters")
            .join("ScaleUp")
            .join("sprites.json")
            .is_file(),
        "missing scaleup sprites.json for real pack: {}",
        pack_root.display()
    );

    let simulation = simulate_content_patcher(SimulateContentPatcherRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
    })
    .expect("simulate real pack");
    let target = simulation
        .targets
        .iter()
        .find(|target| target.path == scaleup_assets_target())
        .expect("real scaleup assets target");
    assert_eq!(target.asset_kind, "json");
    assert_eq!(target.result_state, "determinate");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: scaleup_assets_target().to_string(),
    })
    .expect("real scaleup json result");

    assert_eq!(result.target.path, scaleup_assets_target());
    assert_eq!(result.target.asset_kind, "json");
    assert_eq!(result.result.kind, "json");
    assert_eq!(result.trace.len(), 1);
    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(
        result.trace[0].source_path,
        "assets/Characters/ScaleUp/sprites.json"
    );

    let entries = result
        .result
        .json
        .as_ref()
        .and_then(|json| json.get("BB1ScaleUp"))
        .and_then(Value::as_array)
        .expect("real BB1ScaleUp array");
    assert_eq!(entries.len(), 8);
    assert!(
        entries.iter().any(|entry| {
            entry.get("Asset").and_then(Value::as_str) == Some("bonus/Painting I reg")
                && entry.get("Scale").and_then(Value::as_i64) == Some(4)
        }),
        "expected painting scaleup asset entry"
    );
    assert!(
        entries.iter().any(|entry| {
            entry.get("Target").and_then(Value::as_str) == Some("Characters")
                && entry
                    .get("Assets")
                    .and_then(Value::as_str)
                    .is_some_and(|assets| assets.contains("Emily"))
        }),
        "expected character scaleup sprite entry"
    );
}

#[test]
fn load_content_patcher_result_asset_applies_edit_data_for_json_target() {
    let request = LoadContentPatcherResultAssetRequest {
        path: None,
        game_root_path: None,
        snapshot: None,
        manifest_json: Some(
            r#"{
  "Name": "Inline Pack",
  "UniqueID": "ModForge.JsonResult",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
            .to_string(),
        ),
        content_json: Some(
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "editdata",
      "Target": "Data/Objects",
      "Entries": { "24": { "Name": "Parsnip", "Price": 35 } }
    }
  ]
}"#
            .to_string(),
        ),
        context: Some(SimulationContext::default()),
        target: "Data/Objects".to_string(),
    };

    let result = load_content_patcher_result_asset(request).expect("json result");
    assert_eq!(result.target.path, "Data/Objects");
    assert_eq!(result.result.kind, "json");
    assert!(result.result.json.is_some());
    assert!(result.trace.iter().any(|entry| entry.status == "applied"));
    assert!(result.exportable);
}

#[test]
fn load_content_patcher_result_asset_applies_load_for_json_target() {
    let snapshot = ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary {
            absolute_path: Some(".".to_string()),
            ..ContentPatcherProjectSummary::default()
        },
        sources: vec![
            ContentPatcherSourceFile {
                path: "content.json".to_string(),
                absolute_path: "content.json".to_string(),
                raw_json: r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "Data/Objects",
      "FromFile": "data/objects.json"
    }
  ]
}"#
                .to_string(),
            },
            ContentPatcherSourceFile {
                path: "data/objects.json".to_string(),
                absolute_path: "data/objects.json".to_string(),
                raw_json: r#"{
  "24": { "Name": "Parsnip", "Price": 35 }
}"#
                .to_string(),
            },
        ],
        include_tree: Vec::new(),
        diagnostics: Vec::new(),
    };
    let request = LoadContentPatcherResultAssetRequest {
        path: None,
        game_root_path: None,
        snapshot: Some(snapshot),
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "Data/Objects".to_string(),
    };

    let result = load_content_patcher_result_asset(request).expect("json load result");
    let loaded = result.result.json.expect("json payload");
    assert_eq!(
        loaded
            .get("24")
            .and_then(|value| value.get("Price"))
            .and_then(|value| value.as_i64()),
        Some(35)
    );
}

#[test]
fn load_content_patcher_result_asset_uses_game_content_json_as_base() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-json-base-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("Data")).expect("game data dir");
    std::fs::create_dir_all(&pack_root).expect("pack dir");

    std::fs::write(
        game_root.join("Content").join("Data").join("Objects.json"),
        r#"{
  "24": { "Name": "Parsnip", "Price": 20, "Category": -80 }
}"#,
    )
    .expect("write base objects json");
    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Json Base Pack",
  "UniqueID": "ModForge.JsonBasePack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Data/Objects",
      "Entries": { "24": { "Price": 35 } }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "Data/Objects".to_string(),
    })
    .expect("json result");

    let loaded = result.result.json.expect("json payload");
    assert_eq!(
        loaded
            .get("24")
            .and_then(|value| value.get("Name"))
            .and_then(|value| value.as_str()),
        Some("Parsnip")
    );
    assert_eq!(
        loaded
            .get("24")
            .and_then(|value| value.get("Price"))
            .and_then(|value| value.as_i64()),
        Some(35)
    );
    assert_eq!(
        loaded
            .get("24")
            .and_then(|value| value.get("Category"))
            .and_then(|value| value.as_i64()),
        Some(-80)
    );
}

#[test]
fn load_content_patcher_result_asset_applies_target_field_entries_to_character_appearance() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-characters-target-field-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("Data")).expect("game data dir");
    std::fs::create_dir_all(&pack_root).expect("pack dir");

    std::fs::write(
        game_root
            .join("Content")
            .join("Data")
            .join("Characters.json"),
        r#"{
  "Emily": {
    "DisplayName": "Emily",
    "TextureName": "Emily",
    "Appearance": [
      {
        "Id": "Vanilla.EmilyWinter",
        "Condition": "SEASON winter",
        "Sprite": "Characters/Emily",
        "Portrait": "Portraits/Emily_Winter",
        "Precedence": -100
      }
    ]
  }
}"#,
    )
    .expect("write base characters json");
    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Character TargetField Pack",
  "UniqueID": "ModForge.CharacterTargetFieldPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Data/Characters",
      "TargetField": ["Emily", "Appearance"],
      "Entries": {
        "ModForge.EmilySpring": {
          "Id": "ModForge.EmilySpring",
          "Condition": "SEASON spring",
          "Sprite": "Characters/Emily",
          "Portrait": "Portraits/Emily_Spring",
          "Precedence": -1200
        }
      }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "Data/Characters".to_string(),
    })
    .expect("characters result");

    let loaded = result.result.json.expect("json payload");
    let appearance = loaded
        .get("Emily")
        .and_then(|value| value.get("Appearance"))
        .and_then(Value::as_array)
        .expect("appearance array");

    assert_eq!(appearance.len(), 2);
    assert!(appearance
        .iter()
        .any(|entry| { entry.get("Id").and_then(Value::as_str) == Some("Vanilla.EmilyWinter") }));
    assert!(appearance.iter().any(|entry| {
        entry.get("Id").and_then(Value::as_str) == Some("ModForge.EmilySpring")
            && entry.get("Portrait").and_then(Value::as_str) == Some("Portraits/Emily_Spring")
    }));
}

#[test]
fn export_content_patcher_asset_writes_json_result() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-json-export");
    std::fs::create_dir_all(&temp_dir).expect("temp dir");

    let request = ExportContentPatcherAssetRequest {
        path: None,
        game_root_path: None,
        snapshot: None,
        manifest_json: Some(
            r#"{
  "Name": "Inline Pack",
  "UniqueID": "ModForge.JsonExport",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
            .to_string(),
        ),
        content_json: Some(
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditData", "Target": "Data/Objects", "Entries": { "24": { "Price": 35 } } }
  ]
}"#
            .to_string(),
        ),
        context: Some(SimulationContext::default()),
        target: "Data/Objects".to_string(),
        output_path: temp_dir
            .join("Data-Objects.json")
            .to_string_lossy()
            .into_owned(),
    };

    let result = export_content_patcher_asset(request).expect("json export");
    assert_eq!(result.format, "json");
    assert!(std::fs::read_to_string(&result.output_path)
        .unwrap()
        .contains("\"24\""));
}

#[test]
fn export_content_patcher_asset_rejects_indeterminate_target() {
    let request = ExportContentPatcherAssetRequest {
        path: None,
        game_root_path: None,
        snapshot: None,
        manifest_json: Some(
            r#"{
  "Name": "Inline Pack",
  "UniqueID": "ModForge.IndeterminateExport",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
            .to_string(),
        ),
        content_json: Some(
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditData",
      "Target": "Data/Objects",
      "Entries": { "24": { "Price": 35 } },
      "When": { "HasMod": "Some.Unknown.Mod" }
    }
  ]
}"#
            .to_string(),
        ),
        context: Some(SimulationContext::default()),
        target: "Data/Objects".to_string(),
        output_path: std::env::temp_dir()
            .join("blocked.json")
            .to_string_lossy()
            .into_owned(),
    };

    let error = export_content_patcher_asset(request).expect_err("blocked export");
    assert!(error.contains("indeterminate"));
}

#[test]
fn load_content_patcher_result_asset_returns_image_data_url() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-pack");
    std::fs::create_dir_all(temp_dir.join("assets")).expect("image assets dir");
    let image_path = temp_dir.join("assets").join("crops.png");
    let image = RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    image.save(&image_path).expect("write png");
    std::fs::write(
        temp_dir.join("manifest.json"),
        r#"{
  "Name": "Image Pack",
  "UniqueID": "ModForge.ImagePack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        temp_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/crops",
      "FromFile": "assets/crops.png"
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "TileSheets/crops".to_string(),
    })
    .expect("image result");

    assert_eq!(result.result.kind, "image");
    assert!(result
        .result
        .image_data_url
        .as_deref()
        .is_some_and(|value| value.starts_with("data:image/png;base64,")));
    assert!(result.exportable);
}

#[test]
fn load_content_patcher_result_asset_uses_game_content_image_as_base() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-base-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("TileSheets"))
        .expect("game content dir");
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

    let base_path = game_root
        .join("Content")
        .join("TileSheets")
        .join("crops.png");
    let overlay_path = pack_root.join("assets").join("overlay.png");

    let mut base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 255, 255]));
    base.put_pixel(3, 3, image::Rgba([0, 255, 0, 255]));
    base.save(&base_path).expect("write base png");

    let overlay = RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    overlay.save(&overlay_path).expect("write overlay png");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Image Base Pack",
  "UniqueID": "ModForge.ImageBasePack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/crops",
      "FromFile": "assets/overlay.png",
      "ToArea": [1, 1, 2, 2]
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        target: "TileSheets/crops".to_string(),
    })
    .expect("image result");

    let data_url = result
        .result
        .image_data_url
        .clone()
        .expect("image data url");
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("png data url");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode png");
    let image = image::load_from_memory(&decoded)
        .expect("load png")
        .to_rgba8();

    assert_eq!(image.width(), 4);
    assert_eq!(image.height(), 4);
    assert_eq!(image.get_pixel(0, 0).0, [0, 0, 255, 255]);
    assert_eq!(image.get_pixel(1, 1).0, [255, 0, 0, 255]);
    assert_eq!(image.get_pixel(3, 3).0, [0, 255, 0, 255]);

    let result_value = serde_json::to_value(&result.result).expect("serialize result asset");
    let original_data_url = result_value
        .get("originalImageDataUrl")
        .and_then(serde_json::Value::as_str)
        .expect("original image data url");
    let original_source = result_value
        .get("originalImageSource")
        .and_then(serde_json::Value::as_str)
        .expect("original image source");
    let original_encoded = original_data_url
        .strip_prefix("data:image/png;base64,")
        .expect("original png data url");
    let original_decoded = base64::engine::general_purpose::STANDARD
        .decode(original_encoded)
        .expect("decode original png");
    let original_image = image::load_from_memory(&original_decoded)
        .expect("load original png")
        .to_rgba8();

    assert_eq!(original_image.width(), 4);
    assert_eq!(original_image.height(), 4);
    assert_eq!(original_image.get_pixel(0, 0).0, [0, 0, 255, 255]);
    assert_eq!(original_image.get_pixel(1, 1).0, [0, 0, 255, 255]);
    assert_eq!(original_image.get_pixel(3, 3).0, [0, 255, 0, 255]);
    assert!(original_source.contains("Content/TileSheets/crops.png"));
}

#[test]
fn load_content_patcher_result_asset_accepts_object_areas_without_explicit_x() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-area-object-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("TileSheets"))
        .expect("game content dir");
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

    let base_path = game_root
        .join("Content")
        .join("TileSheets")
        .join("Objects_2.png");
    let overlay_path = pack_root.join("assets").join("artifact.png");

    let base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 255, 255]));
    base.save(&base_path).expect("write base png");

    let mut overlay = RgbaImage::from_pixel(2, 2, image::Rgba([0, 0, 0, 0]));
    overlay.put_pixel(0, 0, image::Rgba([255, 0, 0, 255]));
    overlay.save(&overlay_path).expect("write overlay png");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Image Area Object Pack",
  "UniqueID": "ModForge.ImageAreaObjectPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/Objects_2",
      "FromFile": "assets/artifact.png",
      "FromArea": { "Y": 0, "Width": 1, "Height": 1 },
      "ToArea": { "Y": 1 }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        target: "TileSheets/Objects_2".to_string(),
    })
    .expect("image result");

    let data_url = result
        .result
        .image_data_url
        .clone()
        .expect("image data url");
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("png data url");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode png");
    let image = image::load_from_memory(&decoded)
        .expect("load png")
        .to_rgba8();

    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(image.get_pixel(0, 1).0, [255, 0, 0, 255]);
}

#[test]
fn load_content_patcher_result_asset_accepts_stringified_object_area_numbers() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-area-string-object-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("TileSheets"))
        .expect("game content dir");
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

    let base_path = game_root
        .join("Content")
        .join("TileSheets")
        .join("Objects_2.png");
    let overlay_path = pack_root.join("assets").join("artifact.png");

    let base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 255, 255]));
    base.save(&base_path).expect("write base png");

    let overlay = RgbaImage::from_pixel(1, 1, image::Rgba([255, 0, 0, 255]));
    overlay.save(&overlay_path).expect("write overlay png");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Image Area String Object Pack",
  "UniqueID": "ModForge.ImageAreaStringObjectPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/Objects_2",
      "FromFile": "assets/artifact.png",
      "ToArea": { "X": "1", "Y": "2", "Width": "1", "Height": "1" }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        target: "TileSheets/Objects_2".to_string(),
    })
    .expect("image result");

    let data_url = result
        .result
        .image_data_url
        .clone()
        .expect("image data url");
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("png data url");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode png");
    let image = image::load_from_memory(&decoded)
        .expect("load png")
        .to_rgba8();

    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(image.get_pixel(1, 2).0, [255, 0, 0, 255]);
}

#[test]
fn load_content_patcher_result_asset_uses_config_schema_defaults_for_when_conditions() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-config-default-when-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("TileSheets"))
        .expect("game content dir");
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

    let base_path = game_root
        .join("Content")
        .join("TileSheets")
        .join("Objects_2.png");
    let overlay_path = pack_root.join("assets").join("wine.png");

    let base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 255, 255]));
    base.save(&base_path).expect("write base png");

    let overlay = RgbaImage::from_pixel(1, 1, image::Rgba([255, 0, 0, 255]));
    overlay.save(&overlay_path).expect("write overlay png");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Config Default Pack",
  "UniqueID": "ModForge.ConfigDefaultPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "ConfigSchema": {
    "Wine": { "Default": "True" }
  },
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/Objects_2",
      "FromFile": "assets/wine.png",
      "ToArea": [0, 0, 1, 1],
      "When": { "Wine": "True" }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        target: "TileSheets/Objects_2".to_string(),
    })
    .expect("image result");

    let data_url = result
        .result
        .image_data_url
        .clone()
        .expect("image data url");
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("png data url");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode png");
    let image = image::load_from_memory(&decoded)
        .expect("load png")
        .to_rgba8();

    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0, 255]);
}

#[test]
fn load_content_patcher_result_asset_applies_image_patch_when_has_file_condition_matches() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-has-file-when-pack");
    let game_root = temp_dir.join("game");
    let pack_root = temp_dir.join("pack");
    std::fs::create_dir_all(game_root.join("Content").join("TileSheets"))
        .expect("game content dir");
    std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

    let base_path = game_root
        .join("Content")
        .join("TileSheets")
        .join("Objects_2.png");
    let overlay_path = pack_root.join("assets").join("node.png");

    let base = RgbaImage::from_pixel(4, 4, image::Rgba([0, 0, 255, 255]));
    base.save(&base_path).expect("write base png");

    let overlay = RgbaImage::from_pixel(1, 1, image::Rgba([255, 0, 0, 255]));
    overlay.save(&overlay_path).expect("write overlay png");

    std::fs::write(
        pack_root.join("manifest.json"),
        r#"{
  "Name": "Has File Pack",
  "UniqueID": "ModForge.HasFilePack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "EditImage",
      "Target": "TileSheets/Objects_2",
      "FromFile": "assets/node.png",
      "ToArea": [1, 0, 1, 1],
      "When": { "HasFile:assets/node.png": "true" }
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(pack_root.to_string_lossy().into_owned()),
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        game_root_path: Some(game_root.to_string_lossy().into_owned()),
        target: "TileSheets/Objects_2".to_string(),
    })
    .expect("image result");

    let data_url = result
        .result
        .image_data_url
        .clone()
        .expect("image data url");
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .expect("png data url");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("decode png");
    let image = image::load_from_memory(&decoded)
        .expect("load png")
        .to_rgba8();

    assert_eq!(result.trace[0].status, "applied");
    assert_eq!(image.get_pixel(1, 0).0, [255, 0, 0, 255]);
}

#[test]
fn load_content_patcher_result_asset_describes_blank_original_fallback_for_missing_base_image() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-fallback-pack");
    std::fs::create_dir_all(temp_dir.join("assets")).expect("image assets dir");
    let image_path = temp_dir.join("assets").join("crops.png");
    let image = RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    image.save(&image_path).expect("write png");
    std::fs::write(
        temp_dir.join("manifest.json"),
        r#"{
  "Name": "Image Pack",
  "UniqueID": "ModForge.ImageFallbackPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        temp_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "TileSheets/crops",
      "FromFile": "assets/crops.png"
    }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "TileSheets/crops".to_string(),
    })
    .expect("image result");

    let result_value = serde_json::to_value(&result.result).expect("serialize result asset");
    let original_source = result_value
        .get("originalImageSource")
        .and_then(serde_json::Value::as_str)
        .expect("original image source");

    assert!(original_source.contains("transparent fallback"));
}

#[test]
fn simulate_and_load_result_resolve_target_and_from_file_tokens_for_image_targets() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-token-target-pack");
    std::fs::create_dir_all(temp_dir.join("assets")).expect("image assets dir");
    let image_path = temp_dir.join("assets").join("spring_town.png");
    let image = RgbaImage::from_pixel(2, 2, image::Rgba([0, 255, 0, 255]));
    image.save(&image_path).expect("write png");
    std::fs::write(
        temp_dir.join("manifest.json"),
        r#"{
  "Name": "Token Pack",
  "UniqueID": "ModForge.TokenPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        temp_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "TileSheets/{{Season}}_town",
      "FromFile": "assets/{{TargetWithoutPath}}.png"
    }
  ]
}"#,
    )
    .expect("content");

    let context = SimulationContext {
        season: Some("spring".to_string()),
        ..SimulationContext::default()
    };

    let simulation = simulate_content_patcher(SimulateContentPatcherRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(context.clone()),
    })
    .expect("simulation");

    assert_eq!(simulation.targets[0].path, "TileSheets/spring_town");
    assert_eq!(
        simulation.plan.patches[0].from_file.as_deref(),
        Some("assets/spring_town.png")
    );

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(context),
        target: "TileSheets/spring_town".to_string(),
    })
    .expect("image result");

    assert_eq!(result.result.kind, "image");
    assert!(result
        .result
        .image_data_url
        .as_deref()
        .is_some_and(|value| value.starts_with("data:image/png;base64,")));
}

#[test]
fn export_content_patcher_asset_writes_png_result() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-image-export");
    std::fs::create_dir_all(temp_dir.join("assets")).expect("image assets dir");
    let image_path = temp_dir.join("assets").join("crops.png");
    let image = RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
    image.save(&image_path).expect("write png");
    std::fs::write(
        temp_dir.join("manifest.json"),
        r#"{
  "Name": "Image Pack",
  "UniqueID": "ModForge.ImageExport",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        temp_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Load",
      "Target": "TileSheets/crops",
      "FromFile": "assets/crops.png"
    }
  ]
}"#,
    )
    .expect("content");

    let result = export_content_patcher_asset(ExportContentPatcherAssetRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "TileSheets/crops".to_string(),
        output_path: temp_dir
            .join("TileSheets-crops.png")
            .to_string_lossy()
            .into_owned(),
    })
    .expect("png export");

    let bytes = std::fs::read(&result.output_path).expect("png bytes");
    assert_eq!(result.format, "png");
    assert!(bytes.starts_with(&[137, 80, 78, 71]));
}

#[test]
fn load_content_patcher_result_asset_returns_map_debug_summary() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-map-pack");
    std::fs::create_dir_all(&temp_dir).expect("temp dir");
    std::fs::write(
        temp_dir.join("manifest.json"),
        r#"{
  "Name": "Map Pack",
  "UniqueID": "ModForge.MapPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        temp_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditMap", "Target": "Maps/Town", "MapProperties": { "Music": "spring" } }
  ]
}"#,
    )
    .expect("content");

    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: Some(temp_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "Maps/Town".to_string(),
    })
    .expect("map result");

    assert_eq!(result.result.kind, "map");
    assert!(result.result.json.is_some());
    let map_debug = result.result.map_debug.expect("map debug");
    assert!(map_debug.get("layers").is_some());
    assert!(map_debug.get("warps").is_some());
}

#[test]
fn export_content_patcher_asset_writes_map_debug_json_snapshot() {
    let temp_dir = std::env::temp_dir().join("modforge-cp-map-export");
    std::fs::create_dir_all(&temp_dir).expect("temp dir");
    let pack_dir = temp_dir.join("pack");
    std::fs::create_dir_all(&pack_dir).expect("pack dir");
    std::fs::write(
        pack_dir.join("manifest.json"),
        r#"{
  "Name": "Map Pack",
  "UniqueID": "ModForge.MapPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
    )
    .expect("manifest");
    std::fs::write(
        pack_dir.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "EditMap", "Target": "Maps/Town", "MapProperties": { "Music": "spring" } }
  ]
}"#,
    )
    .expect("content");

    let result = export_content_patcher_asset(ExportContentPatcherAssetRequest {
        path: Some(pack_dir.to_string_lossy().into_owned()),
        game_root_path: None,
        snapshot: None,
        manifest_json: None,
        content_json: None,
        context: Some(SimulationContext::default()),
        target: "Maps/Town".to_string(),
        output_path: temp_dir
            .join("Maps-Town.debug.json")
            .to_string_lossy()
            .into_owned(),
    })
    .expect("map export");

    assert_eq!(result.format, "map-debug-json");
    assert!(std::fs::read_to_string(&result.output_path)
        .unwrap()
        .contains("\"layers\""));
}
