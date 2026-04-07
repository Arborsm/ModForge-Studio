use super::context::SimulationContext;
use super::patch_fields::{parse_from_file_values, parse_target_values};
use super::project::{
    include_from_file, normalize_relative_path, patch_action_is_include, resolve_include_relative_path,
};
use super::schema::parse_json_str;
use super::tokens::INVALID_WHEN_TOKEN;
use super::types::{ContentPatcherPatchPlan, ContentPatcherPlannedPatch, ContentPatcherProjectSnapshot};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone, Default)]
struct PatchFieldContext {
    target: Option<String>,
    from_file: Option<String>,
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
    match patch.get("When") {
        Some(Value::Object(when)) => when.iter().map(|(key, value)| (key.clone(), value.clone())).collect(),
        Some(value) => {
            let mut unresolved = BTreeMap::new();
            unresolved.insert(INVALID_WHEN_TOKEN.to_string(), value.clone());
            unresolved
        }
        None => BTreeMap::new(),
    }
}

fn merge_when(inherited: &BTreeMap<String, Value>, local: &BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    let mut merged = inherited.clone();
    for (key, value) in local {
        merged.insert(key.clone(), value.clone());
    }
    merged
}

fn parse_config_defaults(root: &Value) -> BTreeMap<String, Value> {
    root.get("ConfigSchema")
        .and_then(Value::as_object)
        .map(|schema| {
            schema
                .iter()
                .filter_map(|(key, field)| {
                    field
                        .as_object()
                        .and_then(|field| field.get("Default"))
                        .map(|value| (key.clone(), value.clone()))
                })
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default()
}

fn with_config_defaults(context: &SimulationContext, root: &Value) -> SimulationContext {
    let mut config = parse_config_defaults(root);
    for (key, value) in &context.config {
        config.insert(key.clone(), value.clone());
    }

    SimulationContext {
        season: context.season.clone(),
        weather: context.weather.clone(),
        config,
        installed_mods: context.installed_mods.clone(),
        custom_tokens: context.custom_tokens.clone(),
    }
}

pub fn build_effective_context(
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> Result<SimulationContext, String> {
    let root_source = snapshot
        .sources
        .iter()
        .find(|source| source.path == "content.json")
        .ok_or_else(|| "Snapshot sources are missing content.json.".to_string())?;
    let parsed_root = parse_json_str(&root_source.raw_json, &root_source.path)?;
    Ok(with_config_defaults(context, &parsed_root))
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

fn token_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn find_named_context_value(values: &BTreeMap<String, Value>, token_name: &str) -> Option<String> {
    values
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(token_name))
        .and_then(|(_, value)| token_value_to_string(value))
}

fn target_path_only(target: &str) -> String {
    let segments = target
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.len() <= 1 {
        String::new()
    } else {
        segments[..segments.len() - 1].join("/")
    }
}

fn target_without_path(target: &str) -> String {
    target
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or(target)
        .to_string()
}

fn resolve_template_tokens<F>(template: &str, mut resolver: F) -> String
where
    F: FnMut(&str) -> Option<String>,
{
    let mut resolved = String::with_capacity(template.len());
    let mut remainder = template;

    loop {
        let Some(start) = remainder.find("{{") else {
            resolved.push_str(remainder);
            break;
        };

        resolved.push_str(&remainder[..start]);
        let token_source = &remainder[start + 2..];
        let Some(end) = token_source.find("}}") else {
            resolved.push_str(&remainder[start..]);
            break;
        };

        let token = &token_source[..end];
        if let Some(value) = resolver(token.trim()) {
            resolved.push_str(&value);
        } else {
            resolved.push_str("{{");
            resolved.push_str(token);
            resolved.push_str("}}");
        }

        remainder = &token_source[end + 2..];
    }

    resolved
}

fn template_references_token(template: &str, token_name: &str) -> bool {
    let mut remainder = template;

    loop {
        let Some(start) = remainder.find("{{") else {
            return false;
        };
        let token_source = &remainder[start + 2..];
        let Some(end) = token_source.find("}}") else {
            return false;
        };
        if token_source[..end].trim().eq_ignore_ascii_case(token_name) {
            return true;
        }
        remainder = &token_source[end + 2..];
    }
}

fn resolve_patch_token(
    token_name: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    fields: &PatchFieldContext,
    allow_target_tokens: bool,
    allow_from_file_tokens: bool,
) -> Option<String> {
    if allow_target_tokens {
        if token_name.eq_ignore_ascii_case("Target") {
            return fields.target.clone();
        }
        if token_name.eq_ignore_ascii_case("TargetPathOnly") {
            return fields.target.as_deref().map(target_path_only);
        }
        if token_name.eq_ignore_ascii_case("TargetWithoutPath") {
            return fields.target.as_deref().map(target_without_path);
        }
    }

    if allow_from_file_tokens && token_name.eq_ignore_ascii_case("FromFile") {
        return fields.from_file.clone();
    }

    if token_name.eq_ignore_ascii_case("ModId") {
        return snapshot.summary.unique_id.clone();
    }
    if token_name.eq_ignore_ascii_case("Season") {
        return context.season.clone();
    }
    if token_name.eq_ignore_ascii_case("Weather") {
        return context.weather.clone();
    }

    find_named_context_value(&context.custom_tokens, token_name)
        .or_else(|| find_named_context_value(&context.config, token_name))
}

fn resolve_target_string(
    template: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    from_file: Option<&str>,
) -> String {
    resolve_template_tokens(template, |token_name| {
        resolve_patch_token(
            token_name,
            snapshot,
            context,
            &PatchFieldContext {
                from_file: from_file.map(ToOwned::to_owned),
                ..PatchFieldContext::default()
            },
            false,
            true,
        )
    })
}

fn resolve_from_file_string(
    template: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    target: Option<&str>,
) -> String {
    resolve_template_tokens(template, |token_name| {
        resolve_patch_token(
            token_name,
            snapshot,
            context,
            &PatchFieldContext {
                target: target.map(ToOwned::to_owned),
                ..PatchFieldContext::default()
            },
            true,
            false,
        )
    })
}

fn resolve_patch_paths(
    raw_target: &str,
    raw_from_file: Option<&str>,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> (String, Option<String>) {
    let base_target = resolve_target_string(raw_target, snapshot, context, None);
    let base_from_file = raw_from_file.map(|value| resolve_from_file_string(value, snapshot, context, None));

    let final_from_file = if template_references_token(raw_target, "FromFile") {
        let first_target = resolve_target_string(&base_target, snapshot, context, base_from_file.as_deref());
        base_from_file.map(|value| resolve_from_file_string(&value, snapshot, context, Some(&first_target)))
    } else {
        base_from_file.map(|value| resolve_from_file_string(&value, snapshot, context, Some(&base_target)))
    };

    let final_target = resolve_target_string(&base_target, snapshot, context, final_from_file.as_deref());
    (final_target, final_from_file)
}

fn collect_patches_from_source(
    source_path: &str,
    source_values: &BTreeMap<String, Value>,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
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
        if patch_action_is_include(patch) {
            let Some(from_file) = include_from_file(patch) else {
                continue;
            };
            let include_rel_path = resolve_include_relative_path(Path::new(source_path), &from_file)?;
            let include_rel = normalize_relative_path(&include_rel_path);
            let include_when = parse_when(patch);
            let merged_when = merge_when(inherited_when, &include_when);
            let mut include_lineage = lineage.to_vec();
            include_lineage.push(format!("{include_rel}#include:{source_index}"));
            collect_patches_from_source(
                &include_rel,
                source_values,
                snapshot,
                context,
                &merged_when,
                &include_lineage,
                stack,
                patches,
            )?;
            continue;
        }

        let patch_when = parse_when(patch);
        let merged_when = merge_when(inherited_when, &patch_when);
        let targets = parse_target_values(patch);
        let from_files = parse_from_file_values(patch);

        for (target_index, raw_target) in targets.iter().enumerate() {
            for (from_index, raw_from_file) in from_files.iter().enumerate() {
                let (target, from_file) =
                    resolve_patch_paths(raw_target, raw_from_file.as_deref(), snapshot, context);
                patches.push(ContentPatcherPlannedPatch {
                    id: build_patch_id(lineage, source_index, target_index, from_index),
                    action: action.clone(),
                    target: target.clone(),
                    log_name: parse_log_name(patch, &action, &target, source_index),
                    from_file,
                    when: merged_when.clone(),
                    source_path: source_path.to_string(),
                });
            }
        }
    }

    stack.remove(source_path);
    Ok(())
}

#[allow(dead_code)]
pub fn build_patch_plan(snapshot: &ContentPatcherProjectSnapshot) -> Result<ContentPatcherPatchPlan, String> {
    build_patch_plan_with_context(snapshot, &SimulationContext::default())
}

pub fn build_patch_plan_with_context(
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> Result<ContentPatcherPatchPlan, String> {
    let mut source_values = BTreeMap::new();
    for source in &snapshot.sources {
        let parsed = parse_json_str(&source.raw_json, &source.path)?;
        source_values.insert(source.path.clone(), parsed);
    }

    let root_source = source_values
        .get("content.json")
        .ok_or_else(|| "Snapshot sources are missing content.json.".to_string())?;
    let effective_context = with_config_defaults(context, root_source);

    let mut patches = Vec::new();
    let mut stack = BTreeSet::new();
    let lineage = vec!["content.json".to_string()];
    collect_patches_from_source(
        "content.json",
        &source_values,
        snapshot,
        &effective_context,
        &BTreeMap::new(),
        &lineage,
        &mut stack,
        &mut patches,
    )?;

    Ok(ContentPatcherPatchPlan { patches })
}

#[cfg(test)]
#[path = "tests/plan_tests.rs"]
mod tests;
