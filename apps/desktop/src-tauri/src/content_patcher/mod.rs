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
