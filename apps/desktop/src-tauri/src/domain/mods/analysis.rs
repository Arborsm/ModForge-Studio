//! Content Patcher project analysis and the public scan/load entry points for
//! the `mods` domain.
//!
//! Split out of `mods/mod.rs` (god file) — keep call sites unchanged via the
//! `pub(crate) use` re-exports in `mod.rs`.

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

use super::asset_index::{ModAssetIndex, build_mod_asset_index_group};
use super::discovery::{
    ProjectCompatibility, array_field, collect_available_mod_ids, collect_scanned_projects,
    discover_project_roots, evaluate_project_compatibility, object_field, read_json_file,
};
use super::i18n::{
    ContentPatcherI18nFile, SaveModI18nFilesRequest, SaveModI18nFilesResult, has_i18n_files,
    i18n_entry_count_for_project, read_i18n_files, write_i18n_files,
};
use crate::domain::content_patcher::attached::load_attached_api_registry;
use crate::domain::manifest::{
    content_pack_for_unique_id, project_name_from_manifest, string_array_field, string_field,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path, normalize_separators};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProjectSummary {
    pub id: String,
    pub name: String,
    pub author: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
    pub unique_id: Option<String>,
    pub content_pack_for: Option<String>,
    pub folder_name: String,
    pub absolute_path: String,
    pub manifest_path: String,
    pub content_path: Option<String>,
    pub plugin_kind: String,
    pub status: String,
    pub missing_required_dependencies: Vec<String>,
    pub has_i18n: bool,
    pub i18n_entry_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProjectDiagnostic {
    pub severity: String,
    pub message: String,
    pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherPatchSummary {
    pub id: String,
    pub index: usize,
    pub action: String,
    pub target: String,
    pub from_file: Option<String>,
    pub log_name: String,
    pub when_keys: Vec<String>,
    pub has_when: bool,
    pub update_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherProjectData {
    pub manifest_path: String,
    pub content_path: String,
    pub manifest_json: String,
    pub content_json: String,
    pub format: Option<String>,
    pub change_count: usize,
    pub include_count: usize,
    pub dynamic_token_count: usize,
    pub config_keys: Vec<String>,
    pub has_i18n: bool,
    pub i18n_files: Vec<ContentPatcherI18nFile>,
    pub patches: Vec<ContentPatcherPatchSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProjectDetail {
    pub plugin_kind: String,
    pub summary: ModProjectSummary,
    pub diagnostics: Vec<ModProjectDiagnostic>,
    pub content_patcher: Option<ContentPatcherProjectData>,
    pub i18n_files: Vec<ContentPatcherI18nFile>,
}

fn build_patch_summary(index: usize, patch: &Map<String, Value>) -> ContentPatcherPatchSummary {
    let action = patch
        .get("Action")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Unknown")
        .to_string();
    let target = match patch.get("Target") {
        Some(Value::String(value)) => value.trim().to_string(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(", "),
        _ => String::new(),
    };
    let from_file = patch
        .get("FromFile")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let log_name = patch
        .get("LogName")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            if target.is_empty() {
                format!("{action} #{index}")
            } else {
                format!("{action} -> {target}")
            }
        });
    let mut when_keys = object_field(&Value::Object(patch.clone()), "When")
        .map(|when| when.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    when_keys.sort();
    let update_keys = string_array_field(&Value::Object(patch.clone()), "Update");

    ContentPatcherPatchSummary {
        id: format!("patch:{index}"),
        index,
        action,
        target,
        from_file,
        log_name,
        when_keys: when_keys.clone(),
        has_when: !when_keys.is_empty(),
        update_keys,
    }
}

fn collect_patch_summaries(content: &Value) -> Vec<ContentPatcherPatchSummary> {
    array_field(content, "Changes")
        .map(|changes| {
            changes
                .iter()
                .enumerate()
                .filter_map(|(index, change)| {
                    change
                        .as_object()
                        .map(|patch| build_patch_summary(index, patch))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn build_diagnostics(manifest: &Value, content: &Value, is_cp: bool) -> Vec<ModProjectDiagnostic> {
    let mut diagnostics = Vec::new();

    for field in ["Name", "Author", "Version", "UniqueID"] {
        if string_field(manifest, field).is_none() {
            diagnostics.push(ModProjectDiagnostic {
                severity: "warning".to_string(),
                message: format!("manifest.json is missing {field}."),
                field: Some(format!("manifest.{field}")),
            });
        }
    }

    if !is_cp {
        diagnostics.push(ModProjectDiagnostic {
            severity: "error".to_string(),
            message: "This project is not recognized as a Content Patcher content pack yet."
                .to_string(),
            field: Some("manifest.ContentPackFor".to_string()),
        });
        return diagnostics;
    }

    if content_pack_for_unique_id(manifest).is_none() {
        diagnostics.push(ModProjectDiagnostic {
            severity: "warning".to_string(),
            message: "manifest.json does not declare ContentPackFor.UniqueID. Detection fell back to content.json structure.".to_string(),
            field: Some("manifest.ContentPackFor".to_string()),
        });
    }

    if string_field(content, "Format").is_none() {
        diagnostics.push(ModProjectDiagnostic {
            severity: "warning".to_string(),
            message: "content.json is missing Format.".to_string(),
            field: Some("content.Format".to_string()),
        });
    }

    let Some(changes) = array_field(content, "Changes") else {
        diagnostics.push(ModProjectDiagnostic {
            severity: "error".to_string(),
            message: "content.json is missing a Changes array.".to_string(),
            field: Some("content.Changes".to_string()),
        });
        return diagnostics;
    };

    if changes.is_empty() {
        diagnostics.push(ModProjectDiagnostic {
            severity: "warning".to_string(),
            message: "content.json has an empty Changes array.".to_string(),
            field: Some("content.Changes".to_string()),
        });
    }

    for (index, change) in changes.iter().enumerate() {
        let Some(patch) = change.as_object() else {
            diagnostics.push(ModProjectDiagnostic {
                severity: "warning".to_string(),
                message: format!("Patch #{index} is not a JSON object."),
                field: Some(format!("content.Changes[{index}]")),
            });
            continue;
        };

        if patch
            .get("Action")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
        {
            diagnostics.push(ModProjectDiagnostic {
                severity: "warning".to_string(),
                message: format!("Patch #{index} is missing Action."),
                field: Some(format!("content.Changes[{index}].Action")),
            });
        }

        if patch.get("Target").is_none() {
            diagnostics.push(ModProjectDiagnostic {
                severity: "warning".to_string(),
                message: format!("Patch #{index} is missing Target."),
                field: Some(format!("content.Changes[{index}].Target")),
            });
        }
    }

    diagnostics
}

fn build_project_summary(
    project_path: &Path,
    manifest_path: &Path,
    manifest: &Value,
    content_path: Option<&Path>,
    compatibility: &ProjectCompatibility,
) -> ModProjectSummary {
    let folder_name = project_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    ModProjectSummary {
        id: normalize_separators(&normalize_path(project_path)),
        name: project_name_from_manifest(manifest, project_path),
        author: string_field(manifest, "Author"),
        version: string_field(manifest, "Version"),
        description: string_field(manifest, "Description"),
        unique_id: string_field(manifest, "UniqueID"),
        content_pack_for: content_pack_for_unique_id(manifest),
        folder_name,
        absolute_path: normalize_path(project_path),
        manifest_path: normalize_path(manifest_path),
        content_path: content_path.map(normalize_path),
        plugin_kind: if compatibility.is_content_patcher {
            "content-patcher"
        } else {
            "unknown"
        }
        .to_string(),
        status: compatibility.status.clone(),
        missing_required_dependencies: compatibility.missing_required_dependencies.clone(),
        has_i18n: has_i18n_files(project_path),
        i18n_entry_count: i18n_entry_count_for_project(project_path),
    }
}

fn build_content_patcher_data(
    project_path: &Path,
    manifest_path: &Path,
    content_path: &Path,
    manifest_json: String,
    content_json: String,
    content: &Value,
) -> anyhow::Result<ContentPatcherProjectData> {
    let config_keys = object_field(content, "ConfigSchema")
        .map(|schema| {
            let mut keys = schema.keys().cloned().collect::<Vec<_>>();
            keys.sort();
            keys
        })
        .unwrap_or_default();

    let i18n_files = read_i18n_files(project_path)?;

    Ok(ContentPatcherProjectData {
        manifest_path: normalize_path(manifest_path),
        content_path: normalize_path(content_path),
        manifest_json,
        content_json,
        format: string_field(content, "Format"),
        change_count: array_field(content, "Changes")
            .map(Vec::len)
            .unwrap_or_default(),
        include_count: array_field(content, "Include")
            .map(Vec::len)
            .unwrap_or_default(),
        dynamic_token_count: array_field(content, "DynamicTokens")
            .map(Vec::len)
            .unwrap_or_default(),
        config_keys,
        has_i18n: !i18n_files.is_empty(),
        i18n_files,
        patches: collect_patch_summaries(content),
    })
}

fn ensure_project_root(path: &Path) -> anyhow::Result<PathBuf> {
    if path.join("manifest.json").is_file() {
        return Ok(path.to_path_buf());
    }

    Err(anyhow::anyhow!(
        "No manifest.json was found in {}",
        normalize_path(path)
    ))
}

pub(crate) fn canonical_mod_project_root(source_path: &str) -> anyhow::Result<PathBuf> {
    let project_root = ensure_project_root(&clean_input_path(source_path))?;
    project_root.canonicalize().with_context(|| {
        format!(
            "Failed to resolve source mod directory {}",
            normalize_path(&project_root)
        )
    })
}

fn infer_mods_scan_root(project_path: &Path) -> PathBuf {
    for ancestor in project_path.ancestors() {
        if ancestor
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("Mods"))
        {
            return ancestor.to_path_buf();
        }
    }

    project_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_path.to_path_buf())
}

pub(crate) fn scan_mod_projects(root_path: String) -> anyhow::Result<Vec<ModProjectSummary>> {
    let root = clean_input_path(&root_path);
    let project_roots = discover_project_roots(&root)?;
    if project_roots.is_empty() {
        return Ok(Vec::new());
    }

    let scanned_projects = collect_scanned_projects(project_roots);
    let attached_api_registry = load_attached_api_registry(None);
    let available_mod_ids = collect_available_mod_ids(&scanned_projects, &attached_api_registry);
    let mut projects = Vec::new();
    for project in &scanned_projects {
        let compatibility = evaluate_project_compatibility(
            &project.manifest,
            project.content.as_ref(),
            &available_mod_ids,
        );
        projects.push(build_project_summary(
            &project.project_path,
            &project.manifest_path,
            &project.manifest,
            project.content_path.as_deref(),
            &compatibility,
        ));
    }

    projects.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.absolute_path.cmp(&right.absolute_path))
    });
    Ok(projects)
}

pub(crate) fn scan_mod_asset_index(root_path: String) -> anyhow::Result<ModAssetIndex> {
    let root = clean_input_path(&root_path);
    let project_roots = discover_project_roots(&root)?;
    let scanned_projects = collect_scanned_projects(project_roots);
    let attached_api_registry = load_attached_api_registry(None);
    let available_mod_ids = collect_available_mod_ids(&scanned_projects, &attached_api_registry);
    let mut mods = Vec::new();

    for project in &scanned_projects {
        let Some(content) = project.content.as_ref() else {
            continue;
        };
        let compatibility =
            evaluate_project_compatibility(&project.manifest, Some(content), &available_mod_ids);
        if let Some(group) = build_mod_asset_index_group(
            &project.project_path,
            &project.manifest,
            content,
            &compatibility,
        ) {
            let has_entries = !group.maps.is_empty()
                || !group.events.is_empty()
                || !group.characters.is_empty()
                || !group.buildings.is_empty()
                || !group.items.is_empty();
            if has_entries {
                mods.push(group);
            }
        }
    }

    mods.sort_by(|left, right| {
        left.mod_name
            .cmp(&right.mod_name)
            .then_with(|| left.mod_path.cmp(&right.mod_path))
    });
    Ok(ModAssetIndex { mods })
}

pub(crate) fn load_mod_project(path: String) -> anyhow::Result<ModProjectDetail> {
    let project_path = ensure_project_root(&clean_input_path(&path))?;
    let manifest_path = project_path.join("manifest.json");
    let content_path = project_path.join("content.json");

    let (_manifest_json, manifest) = read_json_file(&manifest_path)?;
    let content = if content_path.is_file() {
        read_json_file(&content_path).map(|(_, value)| value).ok()
    } else {
        None
    };
    let content_ref = content.as_ref();

    let scan_root = infer_mods_scan_root(&project_path);
    let discovered_projects = collect_scanned_projects(discover_project_roots(&scan_root)?);
    let attached_api_registry = load_attached_api_registry(None);
    let available_mod_ids = collect_available_mod_ids(&discovered_projects, &attached_api_registry);
    let compatibility = evaluate_project_compatibility(&manifest, content_ref, &available_mod_ids);
    let is_cp = compatibility.is_content_patcher;
    let diagnostics = build_diagnostics(
        &manifest,
        content_ref.unwrap_or(&Value::Object(Map::new())),
        is_cp,
    );

    let i18n_files = read_i18n_files(&project_path)?;

    if !is_cp {
        return Ok(ModProjectDetail {
            plugin_kind: "unknown".to_string(),
            summary: build_project_summary(
                &project_path,
                &manifest_path,
                &manifest,
                content_path.is_file().then_some(&content_path),
                &compatibility,
            ),
            diagnostics,
            content_patcher: None,
            i18n_files,
        });
    }

    if compatibility.status == "incompatible" {
        bail!(
            "This content pack is missing required dependencies: {}",
            compatibility.missing_required_dependencies.join(", ")
        );
    }

    let content_value = content_ref.as_ref().ok_or_else(|| {
        anyhow::anyhow!(
            "No content.json was found in {}",
            normalize_path(&project_path)
        )
    })?;

    Ok(ModProjectDetail {
        plugin_kind: "content-patcher".to_string(),
        summary: build_project_summary(
            &project_path,
            &manifest_path,
            &manifest,
            Some(&content_path),
            &compatibility,
        ),
        diagnostics,
        content_patcher: Some(build_content_patcher_data(
            &project_path,
            &manifest_path,
            &content_path,
            serde_json::to_string_pretty(&manifest)
                .with_context(|| format!("Failed to serialize manifest.json"))?,
            serde_json::to_string_pretty(content_value)
                .with_context(|| format!("Failed to serialize content.json"))?,
            content_value,
        )?),
        i18n_files,
    })
}

pub(crate) fn inspect_mod_archive(path: String) -> anyhow::Result<ModProjectDetail> {
    let archive_path = clean_input_path(&path);
    if !archive_path.is_file() {
        return Err(anyhow::anyhow!(
            "Mod archive {} does not exist.",
            normalize_path(&archive_path)
        ));
    }

    crate::domain::launcher::archive::with_expanded_archive(&archive_path, |expanded_root| {
        let project_roots = discover_project_roots(expanded_root)?;
        if project_roots.len() != 1 {
            return Err(anyhow::anyhow!(
                "Expected one mod project in {}, found {}.",
                normalize_path(&archive_path),
                project_roots.len()
            ));
        }
        let project_root = project_roots.into_iter().next().expect("length checked");
        let mut detail = load_mod_project(normalize_path(&project_root))?;
        detail.summary.absolute_path = normalize_path(&archive_path);
        detail.summary.folder_name = archive_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        Ok(detail)
    })
}

pub(crate) fn save_mod_i18n_files(
    request: SaveModI18nFilesRequest,
) -> anyhow::Result<SaveModI18nFilesResult> {
    let canonical_source = canonical_mod_project_root(&request.source_path)?;
    let written_locales = write_i18n_files(&canonical_source, request.i18n_files)?;

    Ok(SaveModI18nFilesResult {
        source_path: normalize_path(&canonical_source),
        written_locales,
    })
}
