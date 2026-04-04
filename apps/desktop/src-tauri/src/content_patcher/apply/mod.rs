use super::assets::{
    image_to_data_url, infer_target_asset_kind, load_base_image_asset, load_base_json_asset, load_base_map_debug_asset,
};
use super::conditions::evaluate_patch_status;
use super::context::SimulationContext;
use super::patch_fields::{parse_from_file_values, parse_target_values};
use super::schema::parse_json_str;
use super::types::{
    ContentPatcherPatchPlan, ContentPatcherPlannedPatch, ContentPatcherProjectDiagnostic, ContentPatcherProjectSnapshot,
    ContentPatcherResultAsset, ContentPatcherTargetSummary, ContentPatcherTraceEntry, LoadContentPatcherResultAssetResult,
};
use serde_json::{Map, Value};

pub mod edit_data;
pub mod edit_image;
pub mod edit_map;
pub mod load;

fn btree_when_to_value(when: &std::collections::BTreeMap<String, Value>) -> Value {
    Value::Object(Map::from_iter(when.iter().map(|(key, value)| (key.clone(), value.clone()))))
}

fn parse_patch_indices(patch_id: &str) -> Result<(usize, usize, usize), String> {
    let (source_and_lineage, target_part) = patch_id
        .rsplit_once("#target:")
        .ok_or_else(|| format!("Unexpected patch id format: {patch_id}"))?;
    let (target_index_text, from_part) = target_part
        .split_once("#from:")
        .ok_or_else(|| format!("Unexpected patch id format: {patch_id}"))?;
    let source_index_text = source_and_lineage
        .rsplit_once(':')
        .map(|(_, index)| index)
        .ok_or_else(|| format!("Unexpected patch id format: {patch_id}"))?;

    let source_index = source_index_text
        .parse::<usize>()
        .map_err(|err| format!("Invalid source index in patch id `{patch_id}`: {err}"))?;
    let target_index = target_index_text
        .parse::<usize>()
        .map_err(|err| format!("Invalid target index in patch id `{patch_id}`: {err}"))?;
    let from_index = from_part
        .parse::<usize>()
        .map_err(|err| format!("Invalid from index in patch id `{patch_id}`: {err}"))?;
    Ok((source_index, target_index, from_index))
}

fn parse_patch_map(snapshot: &ContentPatcherProjectSnapshot, patch: &ContentPatcherPlannedPatch) -> Result<Map<String, Value>, String> {
    let source = snapshot
        .sources
        .iter()
        .find(|source| source.path == patch.source_path)
        .ok_or_else(|| format!("Patch source `{}` is missing from snapshot.", patch.source_path))?;
    let source_json = parse_json_str(&source.raw_json, &source.path)?;
    let changes = source_json
        .get("Changes")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("Source `{}` is missing a Changes array.", source.path))?;
    let (source_index, target_index, from_index) = parse_patch_indices(&patch.id)?;
    let raw_patch = changes
        .get(source_index)
        .and_then(Value::as_object)
        .ok_or_else(|| format!("Patch `{}` could not be resolved from source index.", patch.id))?;

    if target_index >= parse_target_values(raw_patch).len() {
        return Err(format!("Patch `{}` target index is out of bounds.", patch.id));
    }
    if from_index >= parse_from_file_values(raw_patch).len() {
        return Err(format!("Patch `{}` from-file index is out of bounds.", patch.id));
    }

    let mut resolved_patch = raw_patch.clone();
    if patch.target.trim().is_empty() {
        resolved_patch.remove("Target");
    } else {
        resolved_patch.insert("Target".to_string(), Value::String(patch.target.clone()));
    }

    if let Some(from_file) = &patch.from_file {
        resolved_patch.insert("FromFile".to_string(), Value::String(from_file.clone()));
    } else {
        resolved_patch.remove("FromFile");
    }

    Ok(resolved_patch)
}

fn reason_summary(status: &str, reasons: &[String]) -> String {
    if !reasons.is_empty() {
        return reasons.join("; ");
    }
    match status {
        "applied" => "Conditions matched.".to_string(),
        "skipped" => "Conditions did not match.".to_string(),
        "indeterminate" => "Condition state is indeterminate.".to_string(),
        _ => String::new(),
    }
}

pub fn load_target_result(
    snapshot: &ContentPatcherProjectSnapshot,
    plan: &ContentPatcherPatchPlan,
    target: &str,
    context: &SimulationContext,
    game_root_path: Option<&str>,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    let target_patches = plan
        .patches
        .iter()
        .filter(|patch| patch.target == target)
        .cloned()
        .collect::<Vec<_>>();
    if target_patches.is_empty() {
        return Err(format!("Target `{target}` was not found in the simulation plan."));
    }

    let actions = target_patches.iter().map(|patch| patch.action.clone()).collect::<Vec<_>>();
    let from_files = target_patches.iter().map(|patch| patch.from_file.clone()).collect::<Vec<_>>();
    let asset_kind = infer_target_asset_kind(target, &actions, &from_files);
    let mut trace = Vec::new();
    let mut diagnostics = snapshot.diagnostics.clone();
    let mut has_apply_error = false;
    let mut has_indeterminate = false;
    let mut result_json = load_base_json_asset(target);
    let base_image = load_base_image_asset(target, game_root_path);
    let mut result_image = base_image.image.clone();
    let original_image = base_image.image;
    let mut result_map = load_base_map_debug_asset(target);
    let project_root_path = snapshot.summary.absolute_path.as_deref();

    for patch in &target_patches {
        let when = btree_when_to_value(&patch.when);
        let mut status = evaluate_patch_status(&when, context, project_root_path);
        status.patch_id = Some(patch.id.clone());

        let mut entry_status = status.status.clone();
        let mut entry_reason = reason_summary(&status.status, &status.reasons);
        let mut change_summary = "no change".to_string();
        let mut entry_diagnostics = Vec::new();

        if status.status == "indeterminate" {
            has_indeterminate = true;
        }

        if status.status == "applied" {
            let parsed_patch = parse_patch_map(snapshot, patch)?;
            let apply_result = match asset_kind.as_str() {
                "json" => {
                    if patch.action.eq_ignore_ascii_case("EditData") {
                        edit_data::apply_edit_data_patch(&mut result_json, &parsed_patch)
                    } else if patch.action.eq_ignore_ascii_case("Load") {
                        let from_file = patch.from_file.as_deref().ok_or_else(|| {
                            format!("Load patch `{}` is missing a FromFile value.", patch.id)
                        })?;
                        load::apply_load_patch(snapshot, &mut result_json, &patch.source_path, from_file)
                    } else {
                        Err(format!(
                            "Action `{}` is not supported for JSON target loading in this phase.",
                            patch.action
                        ))
                    }
                }
                "image" => {
                    if patch.action.eq_ignore_ascii_case("EditImage") {
                        edit_image::apply_edit_image_patch(snapshot, &mut result_image, &parsed_patch, &patch.source_path)
                    } else if patch.action.eq_ignore_ascii_case("Load") {
                        let from_file = patch.from_file.as_deref().ok_or_else(|| {
                            format!("Load patch `{}` is missing a FromFile value.", patch.id)
                        })?;
                        let loaded = super::assets::load_image_patch_asset(snapshot, &patch.source_path, from_file)?;
                        result_image = loaded;
                        Ok(format!("replaced target with `{from_file}`"))
                    } else {
                        Err(format!(
                            "Action `{}` is not supported for image target loading in this phase.",
                            patch.action
                        ))
                    }
                }
                "map" => {
                    if patch.action.eq_ignore_ascii_case("EditMap") {
                        edit_map::apply_edit_map_patch(&mut result_map, &parsed_patch)
                    } else if patch.action.eq_ignore_ascii_case("Load") {
                        let from_file = patch.from_file.as_deref().ok_or_else(|| {
                            format!("Load patch `{}` is missing a FromFile value.", patch.id)
                        })?;
                        result_map = super::assets::load_map_patch_asset(snapshot, &patch.source_path, from_file)?;
                        Ok(format!("replaced target with `{from_file}`"))
                    } else {
                        Err(format!(
                            "Action `{}` is not supported for map target loading in this phase.",
                            patch.action
                        ))
                    }
                }
                unsupported => Err(format!(
                    "Target `{target}` resolved to unsupported asset kind `{unsupported}`."
                )),
            };

            match apply_result {
                Ok(summary) => {
                    change_summary = summary;
                }
                Err(err) => {
                    has_apply_error = true;
                    entry_status = "error".to_string();
                    entry_reason = err.clone();
                    change_summary = "no change".to_string();
                    let diagnostic = ContentPatcherProjectDiagnostic {
                        severity: "error".to_string(),
                        message: err,
                        field: Some(format!("patch.{}", patch.id)),
                    };
                    entry_diagnostics.push(diagnostic.clone());
                    diagnostics.push(diagnostic);
                }
            }
        }

        trace.push(ContentPatcherTraceEntry {
            patch_id: patch.id.clone(),
            log_name: patch.log_name.clone(),
            action: patch.action.clone(),
            source_path: patch.source_path.clone(),
            status: entry_status,
            reason_summary: entry_reason,
            change_summary,
            diagnostics: entry_diagnostics,
        });
    }

    let result_kind = asset_kind.clone();
    let result_state = if has_apply_error {
        "error".to_string()
    } else if has_indeterminate {
        "indeterminate".to_string()
    } else {
        "determinate".to_string()
    };
    let exportable = result_state == "determinate";

    Ok(LoadContentPatcherResultAssetResult {
        target: ContentPatcherTargetSummary {
            path: target.to_string(),
            asset_kind,
            touched_patch_count: target_patches.len(),
            result_state,
            patch_ids: target_patches.iter().map(|patch| patch.id.clone()).collect(),
        },
        trace,
        result: if result_kind == "image" {
            ContentPatcherResultAsset {
                kind: "image".to_string(),
                json: None,
                image_data_url: Some(image_to_data_url(&result_image)?),
                original_image_data_url: Some(image_to_data_url(&original_image)?),
                original_image_source: Some(base_image.source),
                map_debug: None,
            }
        } else if result_kind == "map" {
            ContentPatcherResultAsset {
                kind: "map".to_string(),
                json: None,
                image_data_url: None,
                original_image_data_url: None,
                original_image_source: None,
                map_debug: Some(
                    serde_json::to_value(&result_map)
                        .map_err(|err| format!("Failed to serialize map debug summary: {err}"))?,
                ),
            }
        } else {
            ContentPatcherResultAsset {
                kind: "json".to_string(),
                json: Some(result_json),
                image_data_url: None,
                original_image_data_url: None,
                original_image_source: None,
                map_debug: None,
            }
        },
        diagnostics,
        exportable,
    })
}
