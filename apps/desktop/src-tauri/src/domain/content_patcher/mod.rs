use self::apply::load_target_result;
use self::assets::with_virtual_preview_assets;
use self::common::{as_non_empty_string, build_snapshot_diagnostics, content_pack_for_unique_id};
use self::plan::{build_effective_context, build_patch_plan_with_context};
use self::project::load_content_patcher_project;
use self::types::{
    ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSnapshotInput,
    ContentPatcherSourceFile, LoadContentPatcherResultAssetRequest,
    LoadContentPatcherResultAssetResult,
};
use crate::infrastructure::game_formats::json_relaxed::parse_json_str;
use anyhow::Context;
use serde_json::Value;

pub mod apply;
pub mod assets;
pub(crate) mod attached;
pub(crate) mod commands;
pub(crate) mod common;
pub mod conditions;
pub mod context;
pub mod diagnostics;
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
) -> anyhow::Result<Value> {
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
    request: &ContentPatcherSnapshotInput,
) -> anyhow::Result<ContentPatcherProjectSnapshot> {
    let manifest_json = request.manifest_json.as_deref().unwrap_or("{}");
    let content_json = request
        .content_json
        .as_deref()
        .context("Content Patcher result loading requires `content_json` when no snapshot or project path is provided.")?;
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

fn resolve_result_snapshot(
    request: &ContentPatcherSnapshotInput,
) -> anyhow::Result<ContentPatcherProjectSnapshot> {
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

pub fn load_content_patcher_result_asset(
    request: LoadContentPatcherResultAssetRequest,
) -> anyhow::Result<LoadContentPatcherResultAssetResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_content_patcher_result_asset",
        (|| {
            let context = request.context.clone().unwrap_or_default();
            let snapshot = resolve_result_snapshot(&ContentPatcherSnapshotInput {
                path: request.path.clone(),
                game_root_path: request.game_root_path.clone(),
                snapshot: request.snapshot.clone(),
                manifest_json: request.manifest_json.clone(),
                content_json: request.content_json.clone(),
                virtual_assets: request.virtual_assets.clone(),
                available_capabilities: request.available_capabilities.clone(),
                fingerprint: request.fingerprint.clone(),
                context: Some(context.clone()),
                ..Default::default()
            })?;
            let effective_context = build_effective_context(&snapshot, &context)?;
            let plan = build_patch_plan_with_context(&snapshot, &effective_context)?;
            let attached_api_registry = attached::load_attached_api_registry(None);
            with_virtual_preview_assets(request.virtual_assets.as_deref(), || {
                load_target_result(
                    &snapshot,
                    &plan,
                    &request.target,
                    &attached_api_registry,
                    &effective_context,
                    request.game_root_path.as_deref(),
                )
            })
        })(),
    )
}

#[cfg(test)]
#[path = "../../tests/unit/domain/content_patcher/result_tests.rs"]
mod tests;
