use super::common::{as_non_empty_string, build_snapshot_diagnostics, content_pack_for_unique_id};
use super::diagnostics::{
    include_outside_root_error, missing_file_error, non_content_patcher_manifest_error,
    unsupported_project_error,
};
use super::schema::parse_json_file;
use super::types::{
    ContentPatcherIncludeEdge, ContentPatcherProjectSnapshot, ContentPatcherProjectSummary,
    ContentPatcherSourceFile,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

const CONTENT_PATCHER_UNIQUE_ID: &str = "Pathoschild.ContentPatcher";

pub(crate) fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_include_path(from_file: &str) -> PathBuf {
    PathBuf::from(from_file.replace('\\', "/"))
}

fn is_content_patcher_manifest(manifest: &Value) -> bool {
    content_pack_for_unique_id(manifest)
        .is_some_and(|value| value.eq_ignore_ascii_case(CONTENT_PATCHER_UNIQUE_ID))
}

fn canonicalize_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path)
        .map_err(|error| format!("Failed to resolve path {}: {error}", normalize_path(path)))
}

pub(crate) fn resolve_include_relative_path(
    source_rel_path: &Path,
    from_file: &str,
) -> Result<PathBuf, String> {
    let source_parent = source_rel_path.parent().unwrap_or_else(|| Path::new(""));
    let include_path = normalize_include_path(from_file);
    let mut normalized = PathBuf::new();

    for component in source_parent.components().chain(include_path.components()) {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(include_outside_root_error(from_file));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(include_outside_root_error(from_file));
            }
        }
    }

    Ok(normalized)
}

pub(crate) fn patch_action_is_include(patch: &Map<String, Value>) -> bool {
    patch
        .get("Action")
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|value| value.eq_ignore_ascii_case("Include"))
}

pub(crate) fn include_from_file(patch: &Map<String, Value>) -> Option<String> {
    as_non_empty_string(patch.get("FromFile"))
}

fn collect_include_edges(
    root_canonical: &Path,
    source_rel_path: &Path,
    content: &Value,
    sources: &mut BTreeMap<String, ContentPatcherSourceFile>,
    include_tree: &mut Vec<ContentPatcherIncludeEdge>,
) -> Result<(), String> {
    let Some(changes) = content.get("Changes").and_then(Value::as_array) else {
        return Ok(());
    };

    for change in changes {
        let Some(patch) = change.as_object() else {
            continue;
        };
        if !patch_action_is_include(patch) {
            continue;
        }

        let Some(from_file) = include_from_file(patch) else {
            continue;
        };

        let included_rel_path = resolve_include_relative_path(source_rel_path, &from_file)?;
        let include_candidate_abs_path = root_canonical.join(&included_rel_path);
        if !include_candidate_abs_path.is_file() {
            return Err(missing_file_error(&normalize_path(
                &include_candidate_abs_path,
            )));
        }
        let include_canonical = canonicalize_path(&include_candidate_abs_path)?;
        if !include_canonical.starts_with(root_canonical) {
            return Err(include_outside_root_error(&normalize_path(
                &include_candidate_abs_path,
            )));
        }
        let included_rel_string = normalize_relative_path(&included_rel_path);

        include_tree.push(ContentPatcherIncludeEdge {
            source_path: normalize_relative_path(source_rel_path),
            included_path: included_rel_string.clone(),
        });

        if sources.contains_key(&included_rel_string) {
            continue;
        }

        let (included_raw_json, included_json) = parse_json_file(&include_candidate_abs_path)?;
        sources.insert(
            included_rel_string.clone(),
            ContentPatcherSourceFile {
                path: included_rel_string,
                absolute_path: normalize_path(&include_canonical),
                raw_json: included_raw_json,
            },
        );

        collect_include_edges(
            root_canonical,
            &included_rel_path,
            &included_json,
            sources,
            include_tree,
        )?;
    }

    Ok(())
}

pub fn load_content_patcher_project(path: String) -> Result<ContentPatcherProjectSnapshot, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_content_patcher_project",
        (|| {
            let root = clean_input_path(&path);
            let manifest_path = root.join("manifest.json");
            let content_path = root.join("content.json");
            if !manifest_path.is_file() || !content_path.is_file() {
                return Err(unsupported_project_error(&root.to_string_lossy()));
            }

            let root_canonical = canonicalize_path(&root)?;
            let manifest_canonical = canonicalize_path(&manifest_path)?;
            let content_canonical = canonicalize_path(&content_path)?;
            let (_manifest_raw_json, manifest) = parse_json_file(&manifest_path)?;
            if !is_content_patcher_manifest(&manifest) {
                return Err(non_content_patcher_manifest_error(
                    content_pack_for_unique_id(&manifest).as_deref(),
                ));
            }
            let (content_raw_json, content) = parse_json_file(&content_path)?;
            let diagnostics = build_snapshot_diagnostics(&manifest, &content);

            let mut sources = BTreeMap::new();
            sources.insert(
                "content.json".to_string(),
                ContentPatcherSourceFile {
                    path: "content.json".to_string(),
                    absolute_path: normalize_path(&content_canonical),
                    raw_json: content_raw_json,
                },
            );
            let mut include_tree = Vec::new();
            collect_include_edges(
                &root_canonical,
                Path::new("content.json"),
                &content,
                &mut sources,
                &mut include_tree,
            )?;

            Ok(ContentPatcherProjectSnapshot {
                summary: ContentPatcherProjectSummary {
                    name: as_non_empty_string(manifest.get("Name")),
                    unique_id: as_non_empty_string(manifest.get("UniqueID")),
                    content_pack_for: content_pack_for_unique_id(&manifest),
                    absolute_path: Some(normalize_path(&root_canonical)),
                    manifest_path: Some(normalize_path(&manifest_canonical)),
                    content_path: Some(normalize_path(&content_canonical)),
                },
                sources: sources.into_values().collect(),
                include_tree,
                diagnostics,
            })
        })(),
    )
}

#[cfg(test)]
#[path = "tests/project_tests.rs"]
mod tests;
