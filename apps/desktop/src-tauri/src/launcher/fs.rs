use crate::json_relaxed;
use crate::pathing::normalize_path;
use serde_json::{Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

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

    SKIPPED_SCAN_DIRECTORIES
        .iter()
        .any(|candidate| name.eq_ignore_ascii_case(candidate))
}

pub(crate) fn discover_project_roots(path: &Path) -> Result<Vec<PathBuf>, String> {
    let scan_root = discover_mods_root(path);
    if !scan_root.exists() {
        return Ok(Vec::new());
    }

    let mut pending = vec![scan_root];
    let mut discovered = BTreeSet::new();

    while let Some(current_dir) = pending.pop() {
        if current_dir.join("manifest.json").is_file() {
            discovered.insert(normalize_path(&current_dir));
        }

        let entries = fs::read_dir(&current_dir).map_err(|error| {
            format!(
                "Failed to read launcher mods directory {}: {error}",
                normalize_path(&current_dir)
            )
        })?;

        for entry in entries {
            let entry =
                entry.map_err(|error| format!("Failed to inspect launcher mods entry: {error}"))?;
            let entry_path = entry.path();
            if !entry_path.is_dir() || should_skip_scan_dir(&entry_path) {
                continue;
            }

            pending.push(entry_path);
        }
    }

    Ok(discovered.into_iter().map(PathBuf::from).collect())
}

pub(crate) fn read_json_file(path: &Path) -> Result<Value, String> {
    json_relaxed::read_json_file(path, &format!("JSON file {}", normalize_path(path)))
        .map(|(_, value)| value)
}

pub(crate) fn sanitize_file_name(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => character,
        })
        .collect()
}

pub(crate) fn unique_path(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("archive")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    for index in 2..1000 {
        let candidate_name = if extension.is_empty() {
            format!("{stem} ({index})")
        } else {
            format!("{stem} ({index}).{extension}")
        };
        let candidate = path.with_file_name(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    path.to_path_buf()
}

pub(crate) fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Failed to create launcher backup directory {}: {error}",
            normalize_path(destination)
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        format!(
            "Failed to read launcher backup source {}: {error}",
            normalize_path(source)
        )
    })? {
        let entry =
            entry.map_err(|error| format!("Failed to inspect launcher backup entry: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory_recursive(&source_path, &destination_path)?;
            continue;
        }

        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create launcher backup parent {}: {error}",
                    normalize_path(parent)
                )
            })?;
        }
        fs::copy(&source_path, &destination_path).map_err(|error| {
            format!(
                "Failed to copy launcher backup file {} to {}: {error}",
                normalize_path(&source_path),
                normalize_path(&destination_path)
            )
        })?;
    }

    Ok(())
}

pub(crate) fn merge_json_object_files(
    source_path: &Path,
    target_path: &Path,
) -> Result<(), String> {
    let source_json = fs::read_to_string(source_path).map_err(|error| {
        format!(
            "Failed to read launcher JSON source {}: {error}",
            normalize_path(source_path)
        )
    })?;
    let target_json = fs::read_to_string(target_path).map_err(|error| {
        format!(
            "Failed to read launcher JSON target {}: {error}",
            normalize_path(target_path)
        )
    })?;

    let source_map: Map<String, Value> = serde_json::from_str(&source_json).map_err(|error| {
        format!(
            "Launcher JSON source {} is invalid: {error}",
            normalize_path(source_path)
        )
    })?;
    let mut target_map: Map<String, Value> =
        serde_json::from_str(&target_json).map_err(|error| {
            format!(
                "Launcher JSON target {} is invalid: {error}",
                normalize_path(target_path)
            )
        })?;

    for (key, value) in source_map {
        target_map.entry(key).or_insert(value);
    }

    let merged = serde_json::to_string_pretty(&target_map)
        .map_err(|error| format!("Failed to serialize merged launcher JSON: {error}"))?;
    fs::write(target_path, format!("{merged}\n")).map_err(|error| {
        format!(
            "Failed to write merged launcher JSON {}: {error}",
            normalize_path(target_path)
        )
    })?;
    Ok(())
}

pub(crate) fn move_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Failed to create launcher install directory {}: {error}",
            normalize_path(destination)
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        format!(
            "Failed to read launcher extracted directory {}: {error}",
            normalize_path(source)
        )
    })? {
        let entry = entry
            .map_err(|error| format!("Failed to inspect launcher extracted entry: {error}"))?;
        let path = entry.path();
        let target_path = destination.join(entry.file_name());
        if path.is_dir() {
            move_directory(&path, &target_path)?;
            fs::remove_dir_all(&path).map_err(|error| {
                format!(
                    "Failed to clean launcher extracted directory {}: {error}",
                    normalize_path(&path)
                )
            })?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    format!(
                        "Failed to create launcher install parent {}: {error}",
                        normalize_path(parent)
                    )
                })?;
            }
            fs::rename(&path, &target_path).or_else(|_| {
                fs::copy(&path, &target_path).map(|_| ()).map_err(|error| {
                    format!(
                        "Failed to move launcher file {} to {}: {error}",
                        normalize_path(&path),
                        normalize_path(&target_path)
                    )
                })?;
                fs::remove_file(&path).map_err(|error| {
                    format!(
                        "Failed to remove launcher temp file {}: {error}",
                        normalize_path(&path)
                    )
                })
            })?;
        }
    }

    Ok(())
}
