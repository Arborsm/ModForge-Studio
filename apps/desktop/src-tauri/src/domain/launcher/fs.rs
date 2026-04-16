use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::game_formats::json_relaxed;
use serde_json::Value;
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

