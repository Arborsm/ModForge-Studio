use super::diagnostics::{
    include_outside_root_error, missing_file_error, non_content_patcher_manifest_error, unsupported_project_error,
};
use super::schema::parse_json_file;
use super::types::{
    ContentPatcherIncludeEdge, ContentPatcherProjectDiagnostic, ContentPatcherProjectSnapshot, ContentPatcherProjectSummary,
    ContentPatcherSourceFile,
};
use crate::pathing::{clean_input_path, normalize_path};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

const CONTENT_PATCHER_UNIQUE_ID: &str = "Pathoschild.ContentPatcher";

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

fn is_content_patcher_manifest(manifest: &Value) -> bool {
    content_pack_for_unique_id(manifest).is_some_and(|value| value.eq_ignore_ascii_case(CONTENT_PATCHER_UNIQUE_ID))
}

fn canonicalize_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve path {}: {error}", normalize_path(path)))
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

fn ensure_include_within_root(root_canonical: &Path, include_absolute_path: &Path) -> Result<(), String> {
    let include_canonical = canonicalize_path(include_absolute_path)?;
    if !include_canonical.starts_with(root_canonical) {
        return Err(include_outside_root_error(&normalize_path(include_absolute_path)));
    }
    Ok(())
}

fn collect_include_edges(
    root: &Path,
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
        let include_candidate_rel_path = source_parent.join(normalize_include_path(&from_file));
        let include_candidate_abs_path = root.join(&include_candidate_rel_path);
        if !include_candidate_abs_path.is_file() {
            return Err(missing_file_error(&normalize_path(&include_candidate_abs_path)));
        }
        ensure_include_within_root(root_canonical, &include_candidate_abs_path)?;
        let include_canonical = canonicalize_path(&include_candidate_abs_path)?;
        let included_rel_path = include_canonical
            .strip_prefix(root_canonical)
            .map_err(|_| include_outside_root_error(&normalize_path(&include_candidate_abs_path)))?
            .to_path_buf();
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
                absolute_path: normalize_path(&include_candidate_abs_path),
                raw_json: included_raw_json,
            },
        );

        collect_include_edges(
            root,
            root_canonical,
            &included_rel_path,
            &included_json,
            sources,
            include_tree,
        )?;
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

    let root_canonical = canonicalize_path(&root)?;
    let (_manifest_raw_json, manifest) = parse_json_file(&manifest_path)?;
    if !is_content_patcher_manifest(&manifest) {
        return Err(non_content_patcher_manifest_error(content_pack_for_unique_id(&manifest).as_deref()));
    }
    let (content_raw_json, content) = parse_json_file(&content_path)?;
    let diagnostics = build_snapshot_diagnostics(&manifest, &content);

    let mut sources = BTreeMap::new();
    sources.insert(
        "content.json".to_string(),
        ContentPatcherSourceFile {
            path: "content.json".to_string(),
            absolute_path: normalize_path(&content_path),
            raw_json: content_raw_json,
        },
    );
    let mut include_tree = Vec::new();
    collect_include_edges(
        &root,
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
            absolute_path: Some(normalize_path(&root)),
            manifest_path: Some(normalize_path(&manifest_path)),
            content_path: Some(normalize_path(&content_path)),
        },
        sources: sources.into_values().collect(),
        include_tree,
        diagnostics,
    })
}

#[cfg(test)]
mod tests {
    use super::load_content_patcher_project;
    use crate::content_patcher::test_support::{create_temp_dir, write_file};
    use std::fs;
    use std::path::Path;

    fn sample_cp_manifest() -> &'static str {
        r#"{
  "Name": "Snapshot Pack",
  "UniqueID": "ModForge.SnapshotPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
    }

    fn sample_non_cp_manifest() -> &'static str {
        r#"{
  "Name": "Not CP Pack",
  "UniqueID": "ModForge.NotCP",
  "ContentPackFor": { "UniqueID": "Some.Other.Framework" }
}"#
    }

    #[test]
    fn load_content_patcher_project_returns_include_tree_sources_and_summary_metadata() {
        let root = create_temp_dir("cp-project-snapshot");
        write_file(&root.join("manifest.json"), sample_cp_manifest());
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
        assert_eq!(snapshot.summary.name.as_deref(), Some("Snapshot Pack"));
        assert_eq!(snapshot.summary.unique_id.as_deref(), Some("ModForge.SnapshotPack"));
        assert_eq!(
            snapshot.summary.content_pack_for.as_deref(),
            Some("Pathoschild.ContentPatcher")
        );
        assert_eq!(
            snapshot.summary.absolute_path.as_deref(),
            Some(root.to_string_lossy().as_ref())
        );
        assert_eq!(
            snapshot.summary.manifest_path.as_deref(),
            Some(root.join("manifest.json").to_string_lossy().as_ref())
        );
        assert_eq!(
            snapshot.summary.content_path.as_deref(),
            Some(root.join("content.json").to_string_lossy().as_ref())
        );
        assert_eq!(snapshot.sources.len(), 2);
        assert!(
            snapshot
                .sources
                .iter()
                .any(|source| source.path == "content.json"
                    && Path::new(&source.absolute_path).ends_with(Path::new("content.json"))
                    && source.raw_json.contains("\"Format\": \"2.0.0\""))
        );
        assert!(
            snapshot
                .sources
                .iter()
                .any(|source| source.path == "patches/spring.json"
                    && Path::new(&source.absolute_path).ends_with(Path::new("patches").join("spring.json"))
                    && source.raw_json.contains("\"Action\": \"EditData\""))
        );
        assert_eq!(snapshot.include_tree.len(), 1);
        assert_eq!(snapshot.include_tree[0].source_path, "content.json");
        assert_eq!(snapshot.include_tree[0].included_path, "patches/spring.json");
        assert!(snapshot.diagnostics.is_empty());

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn load_content_patcher_project_accepts_relaxed_json_and_reports_warning_diagnostics() {
        let root = create_temp_dir("cp-project-relaxed-json");
        write_file(&root.join("manifest.json"), sample_cp_manifest());
        write_file(
            &root.join("content.json"),
            r#"{
  // valid in Content Patcher packs
  "Changes": [
    { "Action": "Include", "FromFile": "patches/spring.json", },
  ],
}"#,
        );
        write_file(
            &root.join("patches").join("spring.json"),
            r#"{
  "Changes": []
}"#,
        );

        let snapshot = load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
        assert_eq!(snapshot.include_tree.len(), 1);
        assert!(
            snapshot
                .diagnostics
                .iter()
                .any(|diag| diag.severity == "warning"
                    && diag.field.as_deref() == Some("content.Format"))
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn load_content_patcher_project_rejects_non_content_patcher_manifest() {
        let root = create_temp_dir("cp-project-non-cp");
        write_file(&root.join("manifest.json"), sample_non_cp_manifest());
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": []
}"#,
        );

        let err = load_content_patcher_project(root.to_string_lossy().into_owned()).expect_err("non-cp manifest should fail");
        assert!(err.contains("Pathoschild.ContentPatcher"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn load_content_patcher_project_rejects_include_paths_outside_project_root() {
        let root = create_temp_dir("cp-project-root-escape");
        write_file(&root.join("manifest.json"), sample_cp_manifest());
        write_file(
            &root.join("content.json"),
            r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "../outside.json" }
  ]
}"#,
        );

        let outside_path = root.parent().unwrap_or_else(|| Path::new(".")).join("outside.json");
        write_file(
            &outside_path,
            r#"{
  "Changes": []
}"#,
        );

        let err = load_content_patcher_project(root.to_string_lossy().into_owned()).expect_err("include escape should fail");
        assert!(err.contains("outside the project root"));

        if outside_path.is_file() {
            fs::remove_file(&outside_path).expect("cleanup outside");
        }
        fs::remove_dir_all(root).expect("cleanup");
    }
}
