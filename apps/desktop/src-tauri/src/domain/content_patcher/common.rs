use super::types::ContentPatcherProjectDiagnostic;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

pub(crate) fn as_non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn content_pack_for_unique_id(manifest: &Value) -> Option<String> {
    manifest
        .get("ContentPackFor")
        .and_then(Value::as_object)
        .and_then(|pack| pack.get("UniqueID"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn build_snapshot_diagnostics(
    manifest: &Value,
    content: &Value,
) -> Vec<ContentPatcherProjectDiagnostic> {
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

pub(crate) fn when_to_value(when: &BTreeMap<String, Value>) -> Value {
    Value::Object(Map::from_iter(
        when.iter().map(|(key, value)| (key.clone(), value.clone())),
    ))
}

#[cfg(test)]
#[path = "tests/common_tests.rs"]
mod tests;
