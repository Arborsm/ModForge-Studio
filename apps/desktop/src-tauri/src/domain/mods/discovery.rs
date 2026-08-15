//! Directory scanning & discovery for mod projects, plus the shared low-level
//! helpers (JSON field access, relaxed JSON reads, scan logging) used by the
//! other `mods` submodules.
//!
//! Split out of `mods/mod.rs` (god file) — keep call sites unchanged via the
//! `pub(crate) use` re-exports in `mod.rs`.

use anyhow::Context;
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::manifest::{
    content_pack_for_unique_id, normalize_unique_id, required_dependency_ids, string_field,
};
use crate::domain::modding::attached_api::AttachedApiRegistry;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::game_formats::json_relaxed;
use crate::support::logging::{LogEvent, targets};

const CONTENT_PATCHER_UNIQUE_ID: &str = "Pathoschild.ContentPatcher";
const SKIPPED_SCAN_DIRECTORIES: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".idea",
    ".vs",
    "__MACOSX",
    "node_modules",
    "target",
    "bin",
    "obj",
];

#[derive(Debug)]
pub(crate) struct ScannedProject {
    pub(crate) project_path: PathBuf,
    pub(crate) manifest_path: PathBuf,
    pub(crate) manifest: Value,
    pub(crate) content_path: Option<PathBuf>,
    pub(crate) content: Option<Value>,
}

#[derive(Debug, Clone)]
pub(crate) struct ProjectCompatibility {
    pub(crate) is_content_patcher: bool,
    pub(crate) status: String,
    pub(crate) missing_required_dependencies: Vec<String>,
}

pub(crate) fn object_field<'a>(value: &'a Value, key: &str) -> Option<&'a Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

pub(crate) fn array_field<'a>(value: &'a Value, key: &str) -> Option<&'a Vec<Value>> {
    value.get(key).and_then(Value::as_array)
}

fn is_content_patcher_manifest(manifest: &Value) -> bool {
    content_pack_for_unique_id(manifest)
        .is_some_and(|value| value.eq_ignore_ascii_case(CONTENT_PATCHER_UNIQUE_ID))
}

fn discover_mods_root(path: &Path) -> PathBuf {
    let mods_root = path.join("Mods");
    if mods_root.is_dir() {
        mods_root
    } else {
        path.to_path_buf()
    }
}

fn should_skip_scan_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    name.starts_with('.')
        || SKIPPED_SCAN_DIRECTORIES
            .iter()
            .any(|candidate| name.eq_ignore_ascii_case(candidate))
}

pub(crate) fn discover_project_roots(path: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let scan_root = discover_mods_root(path);
    if !scan_root.exists() {
        return Ok(Vec::new());
    }

    let mut pending = vec![scan_root.clone()];
    let mut discovered = BTreeSet::new();

    while let Some(current_dir) = pending.pop() {
        if current_dir.join("manifest.json").is_file() {
            discovered.insert(normalize_path(&current_dir));
        }

        let entries = fs::read_dir(&current_dir).with_context(|| {
            format!(
                "Failed to read mods directory {}",
                normalize_path(&current_dir)
            )
        })?;

        for entry in entries {
            let entry = entry.with_context(|| format!("Failed to inspect mods directory entry"))?;
            let entry_path = entry.path();
            if !entry_path.is_dir() || should_skip_scan_dir(&entry_path) {
                continue;
            }

            pending.push(entry_path);
        }
    }

    Ok(discovered.into_iter().map(PathBuf::from).collect())
}

pub(crate) fn read_json_file(path: &Path) -> anyhow::Result<(String, Value)> {
    json_relaxed::read_json_file_labeled(path)
}

pub(crate) fn log_scan_skip(path: &Path, error: &impl std::fmt::Display) {
    LogEvent::new("mods.scan.fileSkipped")
        .path("path", path)
        .error(error)
        .emit_debug(targets::ASSETS);
}

// Content Patcher detection lives here (rather than in `analysis`) because it
// is only consumed by `evaluate_project_compatibility` during the scan pass.
fn is_content_patcher_project(manifest: &Value, content: &Value) -> bool {
    is_content_patcher_manifest(manifest) || array_field(content, "Changes").is_some()
}

pub(crate) fn collect_scanned_projects(project_roots: Vec<PathBuf>) -> Vec<ScannedProject> {
    let mut projects = Vec::new();

    for project_path in project_roots {
        let manifest_path = project_path.join("manifest.json");
        let manifest = match read_json_file(&manifest_path) {
            Ok((_, manifest)) => manifest,
            Err(error) => {
                log_scan_skip(&manifest_path, &error);
                continue;
            }
        };
        let content_path = project_path.join("content.json");
        let content = if content_path.is_file() {
            match read_json_file(&content_path) {
                Ok((_, content)) => Some(content),
                Err(error) => {
                    log_scan_skip(&content_path, &error);
                    None
                }
            }
        } else {
            None
        };

        projects.push(ScannedProject {
            project_path,
            manifest_path,
            manifest,
            content_path: content_path.is_file().then_some(content_path),
            content,
        });
    }

    projects
}

pub(crate) fn collect_available_mod_ids(
    projects: &[ScannedProject],
    attached_api_registry: &AttachedApiRegistry,
) -> BTreeSet<String> {
    let mut available = BTreeSet::new();

    for project in projects {
        let Some(unique_id) = string_field(&project.manifest, "UniqueID") else {
            continue;
        };
        available.insert(normalize_unique_id(&unique_id));
        for provided in attached_api_registry.provided_unique_ids_for(&unique_id) {
            available.insert(normalize_unique_id(&provided));
        }
    }

    available
}

pub(crate) fn evaluate_project_compatibility(
    manifest: &Value,
    content: Option<&Value>,
    available_mod_ids: &BTreeSet<String>,
) -> ProjectCompatibility {
    let is_content_patcher = is_content_patcher_manifest(manifest)
        || content.is_some_and(|content| is_content_patcher_project(manifest, content));

    if !is_content_patcher {
        return ProjectCompatibility {
            is_content_patcher: false,
            status: "unsupported".to_string(),
            missing_required_dependencies: Vec::new(),
        };
    }

    let missing_required_dependencies = required_dependency_ids(manifest)
        .into_iter()
        .filter(|dependency| !available_mod_ids.contains(&normalize_unique_id(dependency)))
        .collect::<Vec<_>>();

    let status = if missing_required_dependencies.is_empty() {
        "ready".to_string()
    } else {
        "incompatible".to_string()
    };

    ProjectCompatibility {
        is_content_patcher: true,
        status,
        missing_required_dependencies,
    }
}
