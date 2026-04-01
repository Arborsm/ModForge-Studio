use super::diagnostics::{missing_file_error, unsupported_project_error};
use super::schema::parse_json_file;
use super::types::{
    ContentPatcherIncludeEdge, ContentPatcherProjectSnapshot, ContentPatcherProjectSummary, ContentPatcherSourceFile,
};
use crate::pathing::clean_input_path;
use serde_json::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

fn as_non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_relative_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn normalize_include_path(from_file: &str) -> PathBuf {
    PathBuf::from(from_file.replace('\\', "/"))
}

fn collect_include_edges(
    root: &Path,
    source_rel_path: &Path,
    content: &Value,
    sources: &mut BTreeSet<String>,
    include_tree: &mut Vec<ContentPatcherIncludeEdge>,
) -> Result<(), String> {
    let Some(changes) = content.get("Changes").and_then(Value::as_array) else {
        return Ok(());
    };

    for change in changes {
        let Some(patch) = change.as_object() else {
            continue;
        };
        let is_include = patch
            .get("Action")
            .and_then(Value::as_str)
            .map(str::trim)
            .is_some_and(|value| value.eq_ignore_ascii_case("Include"));
        if !is_include {
            continue;
        }

        let Some(from_file) = as_non_empty_string(patch.get("FromFile")) else {
            continue;
        };

        let source_parent = source_rel_path.parent().unwrap_or_else(|| Path::new(""));
        let included_rel_path = source_parent.join(normalize_include_path(&from_file));
        let included_rel_string = normalize_relative_path(&included_rel_path);
        include_tree.push(ContentPatcherIncludeEdge {
            source_path: normalize_relative_path(source_rel_path),
            included_path: included_rel_string.clone(),
        });

        if !sources.insert(included_rel_string.clone()) {
            continue;
        }

        let included_abs_path = root.join(&included_rel_path);
        if !included_abs_path.is_file() {
            return Err(missing_file_error(&included_abs_path.to_string_lossy()));
        }
        let included_json = parse_json_file(&included_abs_path)?;
        collect_include_edges(root, &included_rel_path, &included_json, sources, include_tree)?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_content_patcher_project(path: String) -> Result<ContentPatcherProjectSnapshot, String> {
    let root = clean_input_path(&path);
    let manifest_path = root.join("manifest.json");
    let content_path = root.join("content.json");
    if !manifest_path.is_file() || !content_path.is_file() {
        return Err(unsupported_project_error(&root.to_string_lossy()));
    }

    let manifest = parse_json_file(&manifest_path)?;
    let content = parse_json_file(&content_path)?;

    let mut sources = BTreeSet::new();
    sources.insert("content.json".to_string());
    let mut include_tree = Vec::new();
    collect_include_edges(&root, Path::new("content.json"), &content, &mut sources, &mut include_tree)?;

    Ok(ContentPatcherProjectSnapshot {
        summary: ContentPatcherProjectSummary {
            unique_id: as_non_empty_string(manifest.get("UniqueID")),
        },
        sources: sources
            .into_iter()
            .map(|path| ContentPatcherSourceFile { path })
            .collect(),
        include_tree,
    })
}

#[cfg(test)]
mod tests {
    use super::load_content_patcher_project;
    use crate::content_patcher::test_support::{create_temp_dir, write_file};
    use std::fs;

    #[test]
    fn load_content_patcher_project_returns_include_tree_and_source_files() {
        let root = create_temp_dir("cp-project-snapshot");
        write_file(
            &root.join("manifest.json"),
            r#"{
  "Name": "Snapshot Pack",
  "UniqueID": "ModForge.SnapshotPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#,
        );
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "patches/spring.json" }
  ]
}"#,
        );
        write_file(
            &root.join("patches").join("spring.json"),
            r#"{
  "Changes": [
    { "Action": "EditData", "Target": "Data/Objects", "When": { "Season": "spring" } }
  ]
}"#,
        );

        let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
        assert_eq!(snapshot.summary.unique_id.as_deref(), Some("ModForge.SnapshotPack"));
        assert_eq!(snapshot.sources.len(), 2);
        assert_eq!(snapshot.include_tree.len(), 1);
        assert_eq!(snapshot.include_tree[0].source_path, "content.json");
        assert_eq!(snapshot.include_tree[0].included_path, "patches/spring.json");

        fs::remove_dir_all(root).expect("cleanup");
    }
}
