use self::conditions::evaluate_patch_status;
use self::context::SimulationContext;
use self::plan::build_patch_plan;
use self::project::load_content_patcher_project;
use self::schema::parse_json_str;
use self::types::{
    ContentPatcherProjectDiagnostic, ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile,
    SimulateContentPatcherRequest, SimulateContentPatcherResult,
};
use serde_json::{Map, Value};

pub mod diagnostics;
pub mod conditions;
pub mod context;
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

#[tauri::command]
pub fn simulate_content_patcher(request: SimulateContentPatcherRequest) -> Result<SimulateContentPatcherResult, String> {
    let snapshot = resolve_simulation_snapshot(&request)?;
    let plan = build_patch_plan(&snapshot)?;
    let context = request.context.unwrap_or_else(SimulationContext::default);

    let patch_statuses = plan
        .patches
        .iter()
        .map(|patch| {
            let when = btree_when_to_value(&patch.when);
            let mut status = evaluate_patch_status(&when, &context);
            status.patch_id = Some(patch.id.clone());
            status
        })
        .collect();

    Ok(SimulateContentPatcherResult {
        plan,
        patch_statuses,
        diagnostics: snapshot.diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use super::simulate_content_patcher;
    use crate::content_patcher::context::SimulationContext;
    use crate::content_patcher::types::{
        ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile, SimulateContentPatcherRequest,
    };

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
    }
}
