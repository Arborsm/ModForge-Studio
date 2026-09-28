//! i18n file parsing and writing for mod projects.
//!
//! Split out of `mods/mod.rs` (god file) — keep call sites unchanged via the
//! `pub(crate) use` re-exports in `mod.rs`.

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;

use super::discovery::read_json_file;
use crate::infrastructure::fs::pathing::normalize_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherI18nFile {
    pub locale: String,
    pub path: String,
    pub relative_path: String,
    pub raw_json: String,
    pub entry_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherI18nFileInput {
    pub locale: String,
    pub raw_json: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModI18nFilesRequest {
    pub source_path: String,
    pub i18n_files: Vec<ContentPatcherI18nFileInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModI18nFilesResult {
    pub source_path: String,
    pub written_locales: Vec<String>,
}

fn i18n_entry_count(value: &Value) -> usize {
    value
        .as_object()
        .map(|entries| {
            entries
                .iter()
                .filter(|(_, value)| value.is_string())
                .count()
        })
        .unwrap_or_default()
}

pub(crate) fn i18n_entry_count_for_project(project_path: &Path) -> usize {
    let i18n_dir = project_path.join("i18n");
    if !i18n_dir.is_dir() {
        return 0;
    }

    let entries = match fs::read_dir(&i18n_dir) {
        Ok(entries) => entries,
        Err(_) => return 0,
    };

    let mut count = 0;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        {
            continue;
        }
        if locale_from_i18n_path(&path).is_none() {
            continue;
        }
        let (_, parsed) = match read_json_file(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        count += i18n_entry_count(&parsed);
    }

    count
}

fn locale_from_i18n_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_i18n_locale(locale: &str) -> anyhow::Result<String> {
    let trimmed = locale.trim();
    if trimmed.is_empty() {
        bail!("i18n locale cannot be empty.");
    }

    let valid = trimmed
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_');
    if !valid || trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        bail!("Invalid i18n locale name: {trimmed}");
    }

    Ok(trimmed.to_string())
}

pub(crate) fn has_i18n_files(project_path: &Path) -> bool {
    let i18n_dir = project_path.join("i18n");
    if !i18n_dir.is_dir() {
        return false;
    }

    let entries = match fs::read_dir(&i18n_dir) {
        Ok(entries) => entries,
        Err(_) => return false,
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
            && locale_from_i18n_path(&path).is_some()
        {
            return true;
        }
    }

    false
}

pub(crate) fn read_i18n_files(project_path: &Path) -> anyhow::Result<Vec<ContentPatcherI18nFile>> {
    let i18n_dir = project_path.join("i18n");
    if !i18n_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&i18n_dir).with_context(|| {
        format!(
            "Failed to read i18n directory {}",
            normalize_path(&i18n_dir)
        )
    })?;

    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect i18n entry"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("json"))
        {
            continue;
        }

        let locale = match locale_from_i18n_path(&path) {
            Some(locale) => locale,
            None => continue,
        };
        let (raw_json, parsed) = read_json_file(&path)?;
        files.push(ContentPatcherI18nFile {
            locale,
            path: normalize_path(&path),
            relative_path: format!(
                "i18n/{}",
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or_default()
            ),
            raw_json: serde_json::to_string_pretty(&parsed)
                .map(|value| format!("{value}\n"))
                .unwrap_or(raw_json),
            entry_count: i18n_entry_count(&parsed),
        });
    }

    files.sort_by(|left, right| {
        let left_default = left.locale.eq_ignore_ascii_case("default");
        let right_default = right.locale.eq_ignore_ascii_case("default");
        right_default
            .cmp(&left_default)
            .then_with(|| left.locale.cmp(&right.locale))
    });
    Ok(files)
}

pub(crate) fn write_i18n_files(
    project_path: &Path,
    files: Vec<ContentPatcherI18nFileInput>,
) -> anyhow::Result<Vec<String>> {
    let mut i18n_payloads = Vec::new();
    let mut written_locales = Vec::new();
    for file in files {
        let locale = normalize_i18n_locale(&file.locale)?;
        let parsed: Value = serde_json::from_str(&file.raw_json)
            .with_context(|| format!("i18n/{locale}.json is not valid JSON"))?;
        if !parsed.is_object() {
            bail!("i18n/{locale}.json must contain a JSON object.");
        }
        let pretty = serde_json::to_string_pretty(&parsed)
            .with_context(|| format!("Failed to format i18n/{locale}.json"))?;
        i18n_payloads.push((locale, pretty));
    }

    if !i18n_payloads.is_empty() {
        let i18n_dir = project_path.join("i18n");
        fs::create_dir_all(&i18n_dir).with_context(|| {
            format!(
                "Failed to create i18n directory {}",
                normalize_path(&i18n_dir)
            )
        })?;
        for (locale, pretty) in i18n_payloads {
            let path = i18n_dir.join(format!("{locale}.json"));
            fs::write(&path, format!("{pretty}\n"))
                .with_context(|| format!("Failed to write {}", normalize_path(&path)))?;
            written_locales.push(locale);
        }
    }
    Ok(written_locales)
}
