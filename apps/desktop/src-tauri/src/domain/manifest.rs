use serde_json::Value;
use std::collections::BTreeSet;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManifestDependency {
    pub unique_id: String,
    pub is_required: bool,
}

pub(crate) fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn string_array_field(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned)
        .collect()
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

pub(crate) fn project_name_from_manifest(manifest: &Value, project_path: &Path) -> String {
    string_field(manifest, "Name")
        .or_else(|| {
            project_path
                .file_name()
                .and_then(|value| value.to_str())
                .map(ToOwned::to_owned)
        })
        .unwrap_or_else(|| "Unnamed Mod".to_string())
}

pub(crate) fn normalize_unique_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(crate) fn required_dependency_ids(manifest: &Value) -> Vec<String> {
    manifest_dependencies(manifest)
        .into_iter()
        .filter(|dependency| dependency.is_required)
        .map(|dependency| dependency.unique_id)
        .collect()
}

pub(crate) fn manifest_dependencies(manifest: &Value) -> Vec<ManifestDependency> {
    let mut dependencies = Vec::new();
    let mut seen = BTreeSet::new();
    for dependency in manifest
        .get("Dependencies")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let Some(object) = dependency.as_object() else {
            continue;
        };
        let Some(unique_id) = object
            .get("UniqueID")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        if seen.insert(normalize_unique_id(unique_id)) {
            dependencies.push(ManifestDependency {
                unique_id: unique_id.to_string(),
                is_required: object
                    .get("IsRequired")
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
            });
        }
    }

    dependencies
}

#[cfg(test)]
#[path = "../tests/integration/manifest_tests.rs"]
mod tests;
