use self::apply::load_target_result;
use self::assets::infer_target_asset_kind;
use self::conditions::evaluate_patch_status;
use self::context::SimulationContext;
use self::export::write_result_asset;
use self::plan::{build_effective_context, build_patch_plan_with_context};
use self::project::load_content_patcher_project;
use self::schema::parse_json_str;
use self::types::{
    ContentPatcherProjectDiagnostic, ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile,
    ContentPatcherTargetSummary, ExportContentPatcherAssetRequest, ExportContentPatcherAssetResult,
    LoadContentPatcherResultAssetRequest, LoadContentPatcherResultAssetResult, SimulateContentPatcherRequest,
    SimulateContentPatcherResult,
};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub mod apply;
pub mod assets;
pub mod diagnostics;
pub mod conditions;
pub mod context;
pub mod export;
pub(crate) mod patch_fields;
pub mod plan;
pub mod project;
pub mod schema;
pub mod tokens;
pub mod types;

#[cfg(test)]
pub mod test_support;

fn as_non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn content_pack_for_unique_id(manifest: &Value) -> Option<String> {
    manifest
        .get("ContentPackFor")
        .and_then(Value::as_object)
        .and_then(|pack| pack.get("UniqueID"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn build_snapshot_diagnostics(manifest: &Value, content: &Value) -> Vec<ContentPatcherProjectDiagnostic> {
    let mut diagnostics = Vec::new();
    if as_non_empty_string(manifest.get("Name")).is_none() {
        diagnostics.push(ContentPatcherProjectDiagnostic {
            severity: "warning".to_string(),
            message: "manifest.json is missing Name.".to_string(),
            field: Some("manifest.Name".to_string()),
        });
    }

    if as_non_empty_string(manifest.get("UniqueID")).is_none() {
        diagnostics.push(ContentPatcherProjectDiagnostic {
            severity: "warning".to_string(),
            message: "manifest.json is missing UniqueID.".to_string(),
            field: Some("manifest.UniqueID".to_string()),
        });
    }

    if as_non_empty_string(content.get("Format")).is_none() {
        diagnostics.push(ContentPatcherProjectDiagnostic {
            severity: "warning".to_string(),
            message: "content.json is missing Format.".to_string(),
            field: Some("content.Format".to_string()),
        });
    }

    if content.get("Changes").and_then(Value::as_array).is_none() {
        diagnostics.push(ContentPatcherProjectDiagnostic {
            severity: "warning".to_string(),
            message: "content.json is missing a Changes array.".to_string(),
            field: Some("content.Changes".to_string()),
        });
    }

    diagnostics
}

fn content_source_index(snapshot: &ContentPatcherProjectSnapshot) -> Option<usize> {
    snapshot.sources.iter().position(|source| source.path == "content.json")
}

fn snapshot_content_path(snapshot: &ContentPatcherProjectSnapshot) -> String {
    snapshot
        .summary
        .content_path
        .clone()
        .or_else(|| content_source_index(snapshot).map(|index| snapshot.sources[index].absolute_path.clone()))
        .unwrap_or_else(|| "content.json".to_string())
}

fn apply_inline_manifest(snapshot: &mut ContentPatcherProjectSnapshot, manifest_json: &str) -> Result<Value, String> {
    let manifest = parse_json_str(manifest_json, "manifest.json")?;
    snapshot.summary.name = as_non_empty_string(manifest.get("Name"));
    snapshot.summary.unique_id = as_non_empty_string(manifest.get("UniqueID"));
    snapshot.summary.content_pack_for = content_pack_for_unique_id(&manifest);
    Ok(manifest)
}

fn apply_inline_content(snapshot: &mut ContentPatcherProjectSnapshot, content_json: &str) {
    let content_path = snapshot_content_path(snapshot);
    let root_source = ContentPatcherSourceFile {
        path: "content.json".to_string(),
        absolute_path: content_path,
        raw_json: content_json.to_string(),
    };

    if let Some(index) = content_source_index(snapshot) {
        snapshot.sources[index] = root_source;
    } else {
        snapshot.sources.push(root_source);
    }
}

fn build_inline_snapshot(request: &SimulateContentPatcherRequest) -> Result<ContentPatcherProjectSnapshot, String> {
    let manifest_json = request.manifest_json.as_deref().unwrap_or("{}");
    let content_json = request
        .content_json
        .as_deref()
        .ok_or_else(|| "simulate_content_patcher requires `content_json` when no `snapshot` or `path` is provided.".to_string())?;
    let manifest = parse_json_str(manifest_json, "manifest.json")?;
    let content = parse_json_str(content_json, "content.json")?;

    Ok(ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary {
            name: as_non_empty_string(manifest.get("Name")),
            unique_id: as_non_empty_string(manifest.get("UniqueID")),
            content_pack_for: content_pack_for_unique_id(&manifest),
            absolute_path: None,
            manifest_path: None,
            content_path: None,
        },
        sources: vec![ContentPatcherSourceFile {
            path: "content.json".to_string(),
            absolute_path: "content.json".to_string(),
            raw_json: content_json.to_string(),
        }],
        include_tree: Vec::new(),
        diagnostics: build_snapshot_diagnostics(&manifest, &content),
    })
}

fn resolve_simulation_snapshot(request: &SimulateContentPatcherRequest) -> Result<ContentPatcherProjectSnapshot, String> {
    let mut snapshot = if let Some(snapshot) = request.snapshot.clone() {
        snapshot
    } else if let Some(path) = request.path.as_deref().map(str::trim).filter(|path| !path.is_empty()) {
        load_content_patcher_project(path.to_string())?
    } else {
        return build_inline_snapshot(request);
    };

    if request.manifest_json.is_none() && request.content_json.is_none() {
        return Ok(snapshot);
    }

    let manifest = if let Some(manifest_json) = request.manifest_json.as_deref() {
        apply_inline_manifest(&mut snapshot, manifest_json)?
    } else {
        Value::Null
    };

    let content = if let Some(content_json) = request.content_json.as_deref() {
        let parsed = parse_json_str(content_json, "content.json")?;
        apply_inline_content(&mut snapshot, content_json);
        parsed
    } else {
        Value::Null
    };

    if request.manifest_json.is_some() || request.content_json.is_some() {
        let manifest_value = if request.manifest_json.is_some() {
            &manifest
        } else {
            &Value::Null
        };
        let content_value = if request.content_json.is_some() {
            &content
        } else {
            &Value::Null
        };

        if request.manifest_json.is_some() && request.content_json.is_some() {
            snapshot.diagnostics = build_snapshot_diagnostics(manifest_value, content_value);
        } else if request.content_json.is_some() {
            snapshot.diagnostics.retain(|diag| {
                !matches!(diag.field.as_deref(), Some("content.Format") | Some("content.Changes"))
            });
            snapshot.diagnostics.extend(build_snapshot_diagnostics(&Value::Null, content_value).into_iter().filter(|diag| {
                matches!(diag.field.as_deref(), Some("content.Format") | Some("content.Changes"))
            }));
        } else if request.manifest_json.is_some() {
            snapshot.diagnostics.retain(|diag| {
                !matches!(diag.field.as_deref(), Some("manifest.Name") | Some("manifest.UniqueID"))
            });
            snapshot.diagnostics.extend(build_snapshot_diagnostics(manifest_value, &Value::Null).into_iter().filter(|diag| {
                matches!(diag.field.as_deref(), Some("manifest.Name") | Some("manifest.UniqueID"))
            }));
        }
    }

    Ok(snapshot)
}

fn btree_when_to_value(when: &std::collections::BTreeMap<String, Value>) -> Value {
    Value::Object(Map::from_iter(when.iter().map(|(key, value)| (key.clone(), value.clone()))))
}

fn build_target_summaries(
    plan: &types::ContentPatcherPatchPlan,
    patch_statuses: &[types::ContentPatcherPatchStatus],
) -> Vec<ContentPatcherTargetSummary> {
    let mut grouped = BTreeMap::<String, Vec<(String, String, String)>>::new();
    let mut target_order = Vec::new();
    for (index, patch) in plan.patches.iter().enumerate() {
        if patch.target.trim().is_empty() {
            continue;
        }
        if !grouped.contains_key(&patch.target) {
            target_order.push(patch.target.clone());
        }
        let status = patch_statuses
            .get(index)
            .map(|status| status.status.clone())
            .unwrap_or_else(|| "indeterminate".to_string());
        grouped.entry(patch.target.clone()).or_default().push((patch.id.clone(), patch.action.clone(), status));
    }

    target_order
        .into_iter()
        .map(|target| {
            let patch_rows = grouped.remove(&target).unwrap_or_default();
            let actions = patch_rows.iter().map(|row| row.1.clone()).collect::<Vec<_>>();
            let from_files = plan
                .patches
                .iter()
                .filter(|patch| patch.target == target)
                .map(|patch| patch.from_file.clone())
                .collect::<Vec<_>>();
            let result_state = if patch_rows.iter().any(|row| row.2 == "error") {
                "error".to_string()
            } else if patch_rows.iter().any(|row| row.2 == "indeterminate") {
                "indeterminate".to_string()
            } else {
                "determinate".to_string()
            };
            ContentPatcherTargetSummary {
                path: target.clone(),
                asset_kind: infer_target_asset_kind(&target, &actions, &from_files),
                touched_patch_count: patch_rows.len(),
                result_state,
                patch_ids: patch_rows.into_iter().map(|row| row.0).collect(),
            }
        })
        .collect()
}

#[tauri::command]
pub fn simulate_content_patcher(request: SimulateContentPatcherRequest) -> Result<SimulateContentPatcherResult, String> {
    let snapshot = resolve_simulation_snapshot(&request)?;
    let context = request.context.unwrap_or_else(SimulationContext::default);
    let effective_context = build_effective_context(&snapshot, &context)?;
    let plan = build_patch_plan_with_context(&snapshot, &effective_context)?;
    let project_root_path = snapshot.summary.absolute_path.as_deref();

    let patch_statuses = plan
        .patches
        .iter()
        .map(|patch| {
            let when = btree_when_to_value(&patch.when);
            let mut status = evaluate_patch_status(&when, &effective_context, project_root_path);
            status.patch_id = Some(patch.id.clone());
            status
        })
        .collect::<Vec<_>>();
    let targets = build_target_summaries(&plan, &patch_statuses);

    Ok(SimulateContentPatcherResult {
        plan,
        targets,
        patch_statuses,
        diagnostics: snapshot.diagnostics,
    })
}

#[tauri::command]
pub fn load_content_patcher_result_asset(
    request: LoadContentPatcherResultAssetRequest,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    let context = request.context.clone().unwrap_or_default();
    let snapshot = resolve_simulation_snapshot(&SimulateContentPatcherRequest {
        path: request.path.clone(),
        game_root_path: request.game_root_path.clone(),
        snapshot: request.snapshot.clone(),
        manifest_json: request.manifest_json.clone(),
        content_json: request.content_json.clone(),
        context: Some(context.clone()),
    })?;
    let effective_context = build_effective_context(&snapshot, &context)?;
    let plan = build_patch_plan_with_context(&snapshot, &effective_context)?;
    load_target_result(
        &snapshot,
        &plan,
        &request.target,
        &effective_context,
        request.game_root_path.as_deref(),
    )
}

#[tauri::command]
pub fn export_content_patcher_asset(
    request: ExportContentPatcherAssetRequest,
) -> Result<ExportContentPatcherAssetResult, String> {
    let target = request.target.clone();
    let output_path = request.output_path.clone();
    let result = load_content_patcher_result_asset(LoadContentPatcherResultAssetRequest {
        path: request.path,
        game_root_path: request.game_root_path,
        snapshot: request.snapshot,
        manifest_json: request.manifest_json,
        content_json: request.content_json,
        context: request.context,
        target: target.clone(),
    })?;

    if !result.exportable {
        return Err(format!(
            "Target `{target}` is {} and cannot be exported.",
            result.target.result_state
        ));
    }

    write_result_asset(&target, &output_path, &result.result)
}

#[cfg(test)]
mod tests {
    use super::{export_content_patcher_asset, load_content_patcher_result_asset, simulate_content_patcher};
    use base64::Engine;
    use crate::content_patcher::context::SimulationContext;
    use crate::content_patcher::types::{
        ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile, ExportContentPatcherAssetRequest,
        LoadContentPatcherResultAssetRequest, SimulateContentPatcherRequest,
    };
    use image::RgbaImage;

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
        let targets = result.targets.iter().map(|target| target.path.as_str()).collect::<Vec<_>>();
        assert_eq!(targets, vec!["Data/Z", "Data/A"]);
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
        assert_eq!(loaded.get("24").and_then(|value| value.get("Price")).and_then(|value| value.as_i64()), Some(35));
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
            output_path: temp_dir.join("Data-Objects.json").to_string_lossy().into_owned(),
        };

        let result = export_content_patcher_asset(request).expect("json export");
        assert_eq!(result.format, "json");
        assert!(std::fs::read_to_string(&result.output_path).unwrap().contains("\"24\""));
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
            output_path: std::env::temp_dir().join("blocked.json").to_string_lossy().into_owned(),
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
        assert!(
            result
                .result
                .image_data_url
                .as_deref()
                .is_some_and(|value| value.starts_with("data:image/png;base64,"))
        );
        assert!(result.exportable);
    }

    #[test]
    fn load_content_patcher_result_asset_uses_game_content_image_as_base() {
        let temp_dir = std::env::temp_dir().join("modforge-cp-image-base-pack");
        let game_root = temp_dir.join("game");
        let pack_root = temp_dir.join("pack");
        std::fs::create_dir_all(game_root.join("Content").join("TileSheets")).expect("game content dir");
        std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

        let base_path = game_root.join("Content").join("TileSheets").join("crops.png");
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
        let image = image::load_from_memory(&decoded).expect("load png").to_rgba8();

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
        std::fs::create_dir_all(game_root.join("Content").join("TileSheets")).expect("game content dir");
        std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

        let base_path = game_root.join("Content").join("TileSheets").join("Objects_2.png");
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
        let image = image::load_from_memory(&decoded).expect("load png").to_rgba8();

        assert_eq!(result.trace[0].status, "applied");
        assert_eq!(image.get_pixel(0, 1).0, [255, 0, 0, 255]);
    }

    #[test]
    fn load_content_patcher_result_asset_accepts_stringified_object_area_numbers() {
        let temp_dir = std::env::temp_dir().join("modforge-cp-image-area-string-object-pack");
        let game_root = temp_dir.join("game");
        let pack_root = temp_dir.join("pack");
        std::fs::create_dir_all(game_root.join("Content").join("TileSheets")).expect("game content dir");
        std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

        let base_path = game_root.join("Content").join("TileSheets").join("Objects_2.png");
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
        let image = image::load_from_memory(&decoded).expect("load png").to_rgba8();

        assert_eq!(result.trace[0].status, "applied");
        assert_eq!(image.get_pixel(1, 2).0, [255, 0, 0, 255]);
    }

    #[test]
    fn load_content_patcher_result_asset_uses_config_schema_defaults_for_when_conditions() {
        let temp_dir = std::env::temp_dir().join("modforge-cp-config-default-when-pack");
        let game_root = temp_dir.join("game");
        let pack_root = temp_dir.join("pack");
        std::fs::create_dir_all(game_root.join("Content").join("TileSheets")).expect("game content dir");
        std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

        let base_path = game_root.join("Content").join("TileSheets").join("Objects_2.png");
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
        let image = image::load_from_memory(&decoded).expect("load png").to_rgba8();

        assert_eq!(result.trace[0].status, "applied");
        assert_eq!(image.get_pixel(0, 0).0, [255, 0, 0, 255]);
    }

    #[test]
    fn load_content_patcher_result_asset_applies_image_patch_when_has_file_condition_matches() {
        let temp_dir = std::env::temp_dir().join("modforge-cp-has-file-when-pack");
        let game_root = temp_dir.join("game");
        let pack_root = temp_dir.join("pack");
        std::fs::create_dir_all(game_root.join("Content").join("TileSheets")).expect("game content dir");
        std::fs::create_dir_all(pack_root.join("assets")).expect("pack assets dir");

        let base_path = game_root.join("Content").join("TileSheets").join("Objects_2.png");
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
        let image = image::load_from_memory(&decoded).expect("load png").to_rgba8();

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
        assert!(
            result
                .result
                .image_data_url
                .as_deref()
                .is_some_and(|value| value.starts_with("data:image/png;base64,"))
        );
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
            output_path: temp_dir.join("TileSheets-crops.png").to_string_lossy().into_owned(),
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
            output_path: temp_dir.join("Maps-Town.debug.json").to_string_lossy().into_owned(),
        })
        .expect("map export");

        assert_eq!(result.format, "map-debug-json");
        assert!(std::fs::read_to_string(&result.output_path).unwrap().contains("\"layers\""));
    }
}
