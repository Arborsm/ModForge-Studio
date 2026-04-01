use super::project::resolve_include_relative_path;
use super::schema::parse_json_str;
use super::types::{ContentPatcherPatchPlan, ContentPatcherPlannedPatch, ContentPatcherProjectSnapshot};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_action(patch: &Map<String, Value>) -> String {
    patch
        .get("Action")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "Unknown".to_string())
}

fn parse_when(patch: &Map<String, Value>) -> BTreeMap<String, Value> {
    patch
        .get("When")
        .and_then(Value::as_object)
        .map(|when| when.iter().map(|(key, value)| (key.clone(), value.clone())).collect())
        .unwrap_or_default()
}

fn merge_when(inherited: &BTreeMap<String, Value>, local: &BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    let mut merged = inherited.clone();
    for (key, value) in local {
        merged.insert(key.clone(), value.clone());
    }
    merged
}

fn parse_targets(patch: &Map<String, Value>) -> Vec<String> {
    let mut targets = match patch.get("Target") {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };
    if targets.is_empty() {
        targets.push(String::new());
    }
    targets
}

fn parse_from_files(patch: &Map<String, Value>) -> Vec<Option<String>> {
    let from_files = match patch.get("FromFile") {
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![Some(trimmed.to_string())]
            }
        }
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| Some(value.to_string()))
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    if from_files.is_empty() {
        vec![None]
    } else {
        from_files
    }
}

fn parse_log_name(patch: &Map<String, Value>, action: &str, target: &str, source_index: usize) -> String {
    patch
        .get("LogName")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            if target.is_empty() {
                format!("{action} #{source_index}")
            } else {
                format!("{action} -> {target}")
            }
        })
}

fn build_patch_id(lineage: &[String], source_index: usize, target_index: usize, from_index: usize) -> String {
    format!(
        "{}:{source_index}#target:{target_index}#from:{from_index}",
        lineage.join("->")
    )
}

fn collect_patches_from_source(
    source_path: &str,
    source_values: &BTreeMap<String, Value>,
    inherited_when: &BTreeMap<String, Value>,
    lineage: &[String],
    stack: &mut BTreeSet<String>,
    patches: &mut Vec<ContentPatcherPlannedPatch>,
) -> Result<(), String> {
    if !stack.insert(source_path.to_string()) {
        return Err(format!("Include cycle detected at {source_path}"));
    }

    let source = source_values
        .get(source_path)
        .ok_or_else(|| format!("Included file not found in snapshot sources: {source_path}"))?;
    let changes = source.get("Changes").and_then(Value::as_array).cloned().unwrap_or_default();
    for (source_index, change) in changes.iter().enumerate() {
        let Some(patch) = change.as_object() else {
            continue;
        };
        let action = normalize_action(patch);
        if action.eq_ignore_ascii_case("Include") {
            let Some(from_file) = patch
                .get("FromFile")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };
            let include_rel_path = resolve_include_relative_path(Path::new(source_path), from_file)?;
            let include_rel = normalize_relative_path(&include_rel_path);
            let include_when = parse_when(patch);
            let merged_when = merge_when(inherited_when, &include_when);
            let mut include_lineage = lineage.to_vec();
            include_lineage.push(include_rel.clone());
            collect_patches_from_source(
                &include_rel,
                source_values,
                &merged_when,
                &include_lineage,
                stack,
                patches,
            )?;
            continue;
        }

        let patch_when = parse_when(patch);
        let merged_when = merge_when(inherited_when, &patch_when);
        let targets = parse_targets(patch);
        let from_files = parse_from_files(patch);

        for (target_index, target) in targets.iter().enumerate() {
            for (from_index, from_file) in from_files.iter().enumerate() {
                patches.push(ContentPatcherPlannedPatch {
                    id: build_patch_id(lineage, source_index, target_index, from_index),
                    action: action.clone(),
                    target: target.clone(),
                    log_name: parse_log_name(patch, &action, target, source_index),
                    from_file: from_file.clone(),
                    when: merged_when.clone(),
                    source_path: source_path.to_string(),
                });
            }
        }
    }

    stack.remove(source_path);
    Ok(())
}

pub fn build_patch_plan(snapshot: &ContentPatcherProjectSnapshot) -> Result<ContentPatcherPatchPlan, String> {
    let mut source_values = BTreeMap::new();
    for source in &snapshot.sources {
        let parsed = parse_json_str(&source.raw_json, &source.path)?;
        source_values.insert(source.path.clone(), parsed);
    }

    if !source_values.contains_key("content.json") {
        return Err("Snapshot sources are missing content.json.".to_string());
    }

    let mut patches = Vec::new();
    let mut stack = BTreeSet::new();
    let lineage = vec!["content.json".to_string()];
    collect_patches_from_source(
        "content.json",
        &source_values,
        &BTreeMap::new(),
        &lineage,
        &mut stack,
        &mut patches,
    )?;

    Ok(ContentPatcherPatchPlan { patches })
}

#[cfg(test)]
mod tests {
    use super::build_patch_plan;
    use crate::content_patcher::project::load_content_patcher_project;
    use crate::content_patcher::test_support::{create_temp_dir, write_file};
    use std::fs;

    #[test]
    fn build_patch_plan_flattens_includes_merges_when_and_splits_targets() {
        let root = create_temp_dir("cp-plan");
        write_file(
            &root.join("manifest.json"),
            r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "patches/spring.json",
      "When": { "Season": "spring" }
    }
  ]
}"#,
        );
        write_file(
            &root.join("patches").join("spring.json"),
            r#"{
  "Changes": [
    {
      "Action": "Load",
      "Target": [ "Maps/Town", "Maps/BusStop" ],
      "FromFile": "assets/spring.png"
    }
  ]
}"#,
        );

        let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
        let plan = build_patch_plan(&snapshot).expect("plan");

        assert_eq!(plan.patches.len(), 2);
        assert_eq!(plan.patches[0].target, "Maps/Town");
        assert_eq!(plan.patches[1].target, "Maps/BusStop");
        assert_eq!(plan.patches[0].log_name, "Load -> Maps/Town");
        assert_eq!(plan.patches[1].log_name, "Load -> Maps/BusStop");
        assert_eq!(plan.patches[0].when.get("Season").and_then(|value| value.as_str()), Some("spring"));
        assert_eq!(plan.patches[0].id, "content.json->patches/spring.json:0#target:0#from:0");

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn build_patch_plan_uses_snapshot_raw_json_without_rereading_source_files() {
        let root = create_temp_dir("cp-plan-raw-json");
        write_file(
            &root.join("manifest.json"),
            r#"{
  "Name": "Planner Pack",
  "UniqueID": "ModForge.PlannerPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    {
      "Action": "Include",
      "FromFile": "patches/spring.json",
      "When": { "Season": "spring" }
    }
  ]
}"#,
        );
        write_file(
            &root.join("patches").join("spring.json"),
            r#"{
  "Changes": [
    {
      "Action": "Load",
      "Target": [ "Maps/Town", "Maps/BusStop" ],
      "FromFile": "assets/spring.png"
    }
  ]
}"#,
        );

        let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
        fs::remove_dir_all(&root).expect("remove source files");

        let plan = build_patch_plan(&snapshot).expect("plan");
        assert_eq!(plan.patches.len(), 2);
    }
}
