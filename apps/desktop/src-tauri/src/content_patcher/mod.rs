use self::conditions::evaluate_patch_status;
use self::context::SimulationContext;
use self::plan::build_patch_plan;
use self::project::load_content_patcher_project;
use self::types::{SimulateContentPatcherRequest, SimulateContentPatcherResult};
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

fn resolve_simulation_snapshot(request: &SimulateContentPatcherRequest) -> Result<types::ContentPatcherProjectSnapshot, String> {
    if let Some(snapshot) = request.snapshot.clone() {
        return Ok(snapshot);
    }

    if let Some(path) = request.path.as_deref().map(str::trim).filter(|path| !path.is_empty()) {
        return load_content_patcher_project(path.to_string());
    }

    Err("simulate_content_patcher requires either `snapshot` or `path`.".to_string())
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
}
