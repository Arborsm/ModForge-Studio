use self::apply::load_target_result;
use self::assets::infer_target_asset_kind;
use self::common::{
    as_non_empty_string, build_snapshot_diagnostics, content_pack_for_unique_id, when_to_value,
};
use self::conditions::evaluate_patch_status;
use self::context::SimulationContext;
use self::export::write_result_asset;
use self::plan::{build_effective_context, build_patch_plan_with_context};
use self::project::load_content_patcher_project;
use self::schema::parse_json_str;
use self::types::{
    ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile,
    ContentPatcherTargetSummary, ExportContentPatcherAssetRequest, ExportContentPatcherAssetResult,
    LoadContentPatcherResultAssetRequest, LoadContentPatcherResultAssetResult,
    SimulateContentPatcherRequest, SimulateContentPatcherResult,
};
use crate::domain::modding::attached_api::AttachedApiRegistry;
use serde_json::Value;
use std::collections::BTreeMap;

pub mod apply;
pub mod assets;
pub(crate) mod attached;
pub(crate) mod common;
pub mod conditions;
pub mod context;
pub mod diagnostics;
pub mod export;
pub(crate) mod patch_fields;
pub mod plan;
pub mod project;
pub mod schema;
pub mod tokens;
pub mod types;

fn content_source_index(snapshot: &ContentPatcherProjectSnapshot) -> Option<usize> {
    snapshot
        .sources
        .iter()
        .position(|source| source.path == "content.json")
}

fn snapshot_content_path(snapshot: &ContentPatcherProjectSnapshot) -> String {
    snapshot
        .summary
        .content_path
        .clone()
        .or_else(|| {
            content_source_index(snapshot)
                .map(|index| snapshot.sources[index].absolute_path.clone())
        })
        .unwrap_or_else(|| "content.json".to_string())
}

fn apply_inline_manifest(
    snapshot: &mut ContentPatcherProjectSnapshot,
    manifest_json: &str,
) -> Result<Value, String> {
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

fn build_inline_snapshot(
    request: &SimulateContentPatcherRequest,
) -> Result<ContentPatcherProjectSnapshot, String> {
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

fn resolve_simulation_snapshot(
    request: &SimulateContentPatcherRequest,
) -> Result<ContentPatcherProjectSnapshot, String> {
    let mut snapshot = if let Some(snapshot) = request.snapshot.clone() {
        snapshot
    } else if let Some(path) = request
        .path
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    {
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
                !matches!(
                    diag.field.as_deref(),
                    Some("content.Format") | Some("content.Changes")
                )
            });
            snapshot.diagnostics.extend(
                build_snapshot_diagnostics(&Value::Null, content_value)
                    .into_iter()
                    .filter(|diag| {
                        matches!(
                            diag.field.as_deref(),
                            Some("content.Format") | Some("content.Changes")
                        )
                    }),
            );
        } else if request.manifest_json.is_some() {
            snapshot.diagnostics.retain(|diag| {
                !matches!(
                    diag.field.as_deref(),
                    Some("manifest.Name") | Some("manifest.UniqueID")
                )
            });
            snapshot.diagnostics.extend(
                build_snapshot_diagnostics(manifest_value, &Value::Null)
                    .into_iter()
                    .filter(|diag| {
                        matches!(
                            diag.field.as_deref(),
                            Some("manifest.Name") | Some("manifest.UniqueID")
                        )
                    }),
            );
        }
    }

    Ok(snapshot)
}

fn build_target_summaries(
    plan: &types::ContentPatcherPatchPlan,
    patch_statuses: &[types::ContentPatcherPatchStatus],
    attached_api_registry: &AttachedApiRegistry,
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
        grouped.entry(patch.target.clone()).or_default().push((
            patch.id.clone(),
            patch.action.clone(),
            status,
        ));
    }

    target_order
        .into_iter()
        .map(|target| {
            let patch_rows = grouped.remove(&target).unwrap_or_default();
            let actions = patch_rows
                .iter()
                .map(|row| row.1.clone())
                .collect::<Vec<_>>();
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
                asset_kind: infer_target_asset_kind(
                    &target,
                    &actions,
                    &from_files,
                    attached_api_registry,
                ),
                touched_patch_count: patch_rows.len(),
                result_state,
                patch_ids: patch_rows.into_iter().map(|row| row.0).collect(),
            }
        })
        .collect()
}

pub fn simulate_content_patcher(
    request: SimulateContentPatcherRequest,
) -> Result<SimulateContentPatcherResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "simulate_content_patcher",
        (|| {
            let snapshot = resolve_simulation_snapshot(&request)?;
            let context = request.context.unwrap_or_else(SimulationContext::default);
            let effective_context = build_effective_context(&snapshot, &context)?;
            let plan = build_patch_plan_with_context(&snapshot, &effective_context)?;
            let project_root_path = snapshot.summary.absolute_path.as_deref();
            let attached_api_registry = attached::load_attached_api_registry(None);

            let patch_statuses = plan
                .patches
                .iter()
                .map(|patch| {
                    let when = when_to_value(&patch.when);
                    let mut status =
                        evaluate_patch_status(&when, &effective_context, project_root_path);
                    status.patch_id = Some(patch.id.clone());
                    status
                })
                .collect::<Vec<_>>();
            let targets = build_target_summaries(&plan, &patch_statuses, &attached_api_registry);

            Ok(SimulateContentPatcherResult {
                plan,
                targets,
                patch_statuses,
                diagnostics: snapshot.diagnostics,
            })
        })(),
    )
}

pub fn load_content_patcher_result_asset(
    request: LoadContentPatcherResultAssetRequest,
) -> Result<LoadContentPatcherResultAssetResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_content_patcher_result_asset",
        (|| {
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
            let attached_api_registry = attached::load_attached_api_registry(None);
            load_target_result(
                &snapshot,
                &plan,
                &request.target,
                &attached_api_registry,
                &effective_context,
                request.game_root_path.as_deref(),
            )
        })(),
    )
}

pub fn export_content_patcher_asset(
    request: ExportContentPatcherAssetRequest,
) -> Result<ExportContentPatcherAssetResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "export_content_patcher_asset",
        (|| {
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
        })(),
    )
}

#[cfg(test)]
#[path = "tests/mod_tests.rs"]
mod tests;
