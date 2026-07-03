use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::domain::content_patcher::attached::load_attached_api_registry;
use crate::domain::manifest::{
    content_pack_for_unique_id, normalize_unique_id, project_name_from_manifest,
    required_dependency_ids, string_array_field, string_field,
};
use crate::domain::modding::attached_api::AttachedApiRegistry;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::game_formats::json_relaxed;

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

#[derive(Debug, Clone, Serialize)]
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProjectDiagnostic {
    pub severity: String,
    pub message: String,
    pub field: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherI18nFile {
    pub locale: String,
    pub path: String,
    pub relative_path: String,
    pub raw_json: String,
    pub entry_count: usize,
}

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProjectDetail {
    pub plugin_kind: String,
    pub capabilities: Vec<String>,
    pub summary: ModProjectSummary,
    pub diagnostics: Vec<ModProjectDiagnostic>,
    pub content_patcher: Option<ContentPatcherProjectData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModProjectRequest {
    pub source_path: String,
    pub output_path: Option<String>,
    #[serde(default)]
    pub overwrite_existing_export: bool,
    pub manifest_json: String,
    pub content_json: String,
    #[serde(default)]
    pub i18n_files: Vec<ContentPatcherI18nFileInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPatcherI18nFileInput {
    pub locale: String,
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveModProjectResult {
    pub plugin_kind: String,
    pub target_path: String,
    pub manifest_path: String,
    pub content_path: String,
    pub diagnostics: Vec<ModProjectDiagnostic>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetReference {
    pub key: String,
    pub label: String,
    pub targets: Vec<String>,
    pub patch_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetIndexGroup {
    pub mod_id: String,
    pub mod_name: String,
    pub mod_path: String,
    pub plugin_kind: String,
    pub maps: Vec<ModAssetReference>,
    pub events: Vec<ModAssetReference>,
    pub characters: Vec<ModAssetReference>,
    pub buildings: Vec<ModAssetReference>,
    pub items: Vec<ModAssetReference>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModAssetIndex {
    pub mods: Vec<ModAssetIndexGroup>,
}

#[derive(Debug, Default)]
struct ModAssetReferenceAccumulator {
    label: String,
    targets: BTreeSet<String>,
    patch_ids: BTreeSet<String>,
}

#[derive(Debug, Default)]
struct ModAssetGroupAccumulator {
    maps: BTreeMap<String, ModAssetReferenceAccumulator>,
    events: BTreeMap<String, ModAssetReferenceAccumulator>,
    characters: BTreeMap<String, ModAssetReferenceAccumulator>,
    buildings: BTreeMap<String, ModAssetReferenceAccumulator>,
    items: BTreeMap<String, ModAssetReferenceAccumulator>,
}

#[derive(Debug)]
struct ScannedProject {
    project_path: PathBuf,
    manifest_path: PathBuf,
    manifest: Value,
    content_path: Option<PathBuf>,
    content: Option<Value>,
}

#[derive(Debug, Clone)]
struct ProjectCompatibility {
    is_content_patcher: bool,
    status: String,
    missing_required_dependencies: Vec<String>,
}

fn object_field<'a>(value: &'a Value, key: &str) -> Option<&'a Map<String, Value>> {
    value.get(key).and_then(Value::as_object)
}

fn array_field<'a>(value: &'a Value, key: &str) -> Option<&'a Vec<Value>> {
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

fn discover_project_roots(path: &Path) -> Result<Vec<PathBuf>, String> {
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

        let entries = fs::read_dir(&current_dir).map_err(|error| {
            format!(
                "Failed to read mods directory {}: {error}",
                normalize_path(&current_dir)
            )
        })?;

        for entry in entries {
            let entry = entry
                .map_err(|error| format!("Failed to inspect mods directory entry: {error}"))?;
            let entry_path = entry.path();
            if !entry_path.is_dir() || should_skip_scan_dir(&entry_path) {
                continue;
            }

            pending.push(entry_path);
        }
    }

    Ok(discovered.into_iter().map(PathBuf::from).collect())
}

fn read_json_file(path: &Path) -> Result<(String, Value), String> {
    json_relaxed::read_json_file(path, &format!("JSON file {}", normalize_path(path)))
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

fn locale_from_i18n_path(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn normalize_i18n_locale(locale: &str) -> Result<String, String> {
    let trimmed = locale.trim();
    if trimmed.is_empty() {
        return Err("i18n locale cannot be empty.".to_string());
    }

    let valid = trimmed
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || value == '-' || value == '_');
    if !valid || trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err(format!("Invalid i18n locale name: {trimmed}"));
    }

    Ok(trimmed.to_string())
}

fn read_i18n_files(project_path: &Path) -> Result<Vec<ContentPatcherI18nFile>, String> {
    let i18n_dir = project_path.join("i18n");
    if !i18n_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let entries = fs::read_dir(&i18n_dir).map_err(|error| {
        format!(
            "Failed to read i18n directory {}: {error}",
            normalize_path(&i18n_dir)
        )
    })?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to inspect i18n entry: {error}"))?;
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

fn log_scan_skip(error: &str) {
    log::debug!("{error}");
}

fn is_content_patcher_project(manifest: &Value, content: &Value) -> bool {
    is_content_patcher_manifest(manifest) || array_field(content, "Changes").is_some()
}

fn collect_scanned_projects(project_roots: Vec<PathBuf>) -> Vec<ScannedProject> {
    let mut projects = Vec::new();

    for project_path in project_roots {
        let manifest_path = project_path.join("manifest.json");
        let manifest = match read_json_file(&manifest_path) {
            Ok((_, manifest)) => manifest,
            Err(error) => {
                log_scan_skip(&error);
                continue;
            }
        };
        let content_path = project_path.join("content.json");
        let content = if content_path.is_file() {
            match read_json_file(&content_path) {
                Ok((_, content)) => Some(content),
                Err(error) => {
                    log_scan_skip(&error);
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

fn collect_available_mod_ids(
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

fn evaluate_project_compatibility(
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
        id: normalize_path(project_path).replace('\\', "/"),
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
    }
}

fn build_content_patcher_data(
    project_path: &Path,
    manifest_path: &Path,
    content_path: &Path,
    manifest_json: String,
    content_json: String,
    content: &Value,
) -> Result<ContentPatcherProjectData, String> {
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

fn target_values(patch: &Map<String, Value>) -> Vec<String> {
    match patch.get("Target") {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn normalize_target_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    normalized
        .strip_prefix("Content/")
        .unwrap_or(&normalized)
        .to_string()
}

fn build_content_asset_key(target: &str) -> String {
    format!("Content/{}.xnb", normalize_target_path(target))
}

fn target_leaf_name(target: &str) -> String {
    let normalized = normalize_target_path(target);
    normalized
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(&normalized)
        .to_string()
}

fn normalize_item_reference_key(raw_key: &str, prefix: &str) -> String {
    let trimmed = raw_key.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with('(') {
        trimmed.to_string()
    } else {
        format!("{prefix}{trimmed}")
    }
}

fn add_mod_asset_reference(
    collection: &mut BTreeMap<String, ModAssetReferenceAccumulator>,
    key: String,
    label: String,
    target: &str,
    patch_id: &str,
) {
    if key.trim().is_empty() {
        return;
    }

    let entry = collection
        .entry(key)
        .or_insert_with(|| ModAssetReferenceAccumulator {
            label: label.clone(),
            ..ModAssetReferenceAccumulator::default()
        });
    if entry.label.trim().is_empty() {
        entry.label = label;
    }
    entry.targets.insert(normalize_target_path(target));
    entry.patch_ids.insert(patch_id.to_string());
}

fn content_patcher_item_prefix(target: &str) -> Option<&'static str> {
    let normalized = normalize_target_path(target).to_ascii_lowercase();
    match normalized.as_str() {
        "data/objects" | "data/crops" | "data/fish" => Some("(O)"),
        "data/bigcraftables" => Some("(BC)"),
        "data/weapons" => Some("(W)"),
        "data/tools" => Some("(T)"),
        "data/shirts" => Some("(S)"),
        "data/pants" => Some("(P)"),
        "data/trinkets" => Some("(TR)"),
        "data/hats" => Some("(H)"),
        "data/boots" => Some("(B)"),
        "data/furniture" => Some("(F)"),
        _ => None,
    }
}

fn content_patcher_target_field_first_key(patch: &Map<String, Value>) -> Option<String> {
    match patch.get("TargetField") {
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Some(Value::Array(segments)) => segments
            .first()
            .and_then(Value::as_str)
            .map(str::trim)
            .and_then(|value| {
                if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                }
            }),
        _ => None,
    }
}

fn strip_xnb_extension(value: &str) -> &str {
    value
        .strip_suffix(".xnb")
        .or_else(|| value.strip_suffix(".XNB"))
        .unwrap_or(value)
}

fn collect_known_character_keys(patches: &[FlattenedContentPatcherPatch]) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();

    for flattened_patch in patches {
        for target in target_values(&flattened_patch.patch) {
            let normalized_target = normalize_target_path(&target);
            if !normalized_target.eq_ignore_ascii_case("Data/Characters") {
                continue;
            }

            if let Some(character_key) =
                content_patcher_target_field_first_key(&flattened_patch.patch)
            {
                keys.insert(character_key);
                continue;
            }

            if let Some(entries) =
                object_field(&Value::Object(flattened_patch.patch.clone()), "Entries")
            {
                for key in entries.keys() {
                    let trimmed = key.trim();
                    if !trimmed.is_empty() {
                        keys.insert(trimmed.to_string());
                    }
                }
            }
        }
    }

    keys
}

fn resolve_character_reference_key(
    target: &str,
    known_character_keys: &BTreeSet<String>,
) -> String {
    let leaf = target_leaf_name(target);
    let normalized_leaf = strip_xnb_extension(leaf.trim());
    if normalized_leaf.is_empty() {
        return String::new();
    }

    let normalized_leaf_lower = normalized_leaf.to_ascii_lowercase();
    let mut best_match: Option<(usize, &String)> = None;
    for key in known_character_keys {
        let trimmed = key.trim();
        if trimmed.is_empty() {
            continue;
        }

        let normalized_key_lower = trimmed.to_ascii_lowercase();
        if normalized_leaf_lower == normalized_key_lower
            || normalized_leaf_lower.starts_with(&format!("{normalized_key_lower}_"))
        {
            let candidate = (trimmed.len(), key);
            if best_match.is_none_or(|current| candidate.0 > current.0) {
                best_match = Some(candidate);
            }
        }
    }

    best_match
        .map(|(_, key)| key.clone())
        .unwrap_or_else(|| normalized_leaf.to_string())
}

fn collect_content_patcher_target_references(
    target: &str,
    patch: &Map<String, Value>,
    patch_id: &str,
    known_character_keys: &BTreeSet<String>,
    accumulator: &mut ModAssetGroupAccumulator,
) {
    let normalized_target = normalize_target_path(target);
    let normalized_target_lower = normalized_target.to_ascii_lowercase();

    if normalized_target_lower.starts_with("maps/") {
        let label = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.maps,
            build_content_asset_key(&normalized_target),
            label,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower.starts_with("data/events/") {
        let label = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.events,
            build_content_asset_key(&normalized_target),
            label,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower == "data/characters" {
        if let Some(character_key) = content_patcher_target_field_first_key(patch) {
            add_mod_asset_reference(
                &mut accumulator.characters,
                character_key.clone(),
                character_key,
                &normalized_target,
                patch_id,
            );
            return;
        }

        if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
            for key in entries.keys() {
                let key = key.trim();
                add_mod_asset_reference(
                    &mut accumulator.characters,
                    key.to_string(),
                    key.to_string(),
                    &normalized_target,
                    patch_id,
                );
            }
        }
        return;
    }

    if normalized_target_lower.starts_with("characters/")
        || normalized_target_lower.starts_with("portraits/")
    {
        let key = resolve_character_reference_key(&normalized_target, known_character_keys);
        add_mod_asset_reference(
            &mut accumulator.characters,
            key.clone(),
            key,
            &normalized_target,
            patch_id,
        );
        return;
    }

    if normalized_target_lower == "data/buildings" {
        if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
            for key in entries.keys() {
                let key = key.trim();
                add_mod_asset_reference(
                    &mut accumulator.buildings,
                    key.to_string(),
                    key.to_string(),
                    &normalized_target,
                    patch_id,
                );
            }
        }
        return;
    }

    if normalized_target_lower.starts_with("buildings/") {
        let key = target_leaf_name(&normalized_target);
        add_mod_asset_reference(
            &mut accumulator.buildings,
            key.clone(),
            key,
            &normalized_target,
            patch_id,
        );
        return;
    }

    let Some(item_prefix) = content_patcher_item_prefix(&normalized_target) else {
        return;
    };

    if let Some(entries) = object_field(&Value::Object(patch.clone()), "Entries") {
        for key in entries.keys() {
            let normalized_key = normalize_item_reference_key(key, item_prefix);
            if normalized_key.is_empty() {
                continue;
            }

            add_mod_asset_reference(
                &mut accumulator.items,
                normalized_key.clone(),
                normalized_key,
                &normalized_target,
                patch_id,
            );
        }
    }
}

#[derive(Debug, Clone)]
struct FlattenedContentPatcherPatch {
    id: String,
    patch: Map<String, Value>,
}

fn merge_when_conditions(parent_when: Option<&Map<String, Value>>, patch: &mut Map<String, Value>) {
    let Some(parent_when) = parent_when else {
        return;
    };
    if parent_when.is_empty() {
        return;
    }

    let mut merged_when = parent_when.clone();
    if let Some(existing_when) = patch.get("When").and_then(Value::as_object) {
        for (key, value) in existing_when {
            merged_when.insert(key.clone(), value.clone());
        }
    }

    patch.insert("When".to_string(), Value::Object(merged_when));
}

fn combine_when_conditions(
    parent_when: Option<&Map<String, Value>>,
    current_when: Option<&Map<String, Value>>,
) -> Option<Map<String, Value>> {
    match (parent_when, current_when) {
        (None, None) => None,
        (Some(parent), None) => Some(parent.clone()),
        (None, Some(current)) => Some(current.clone()),
        (Some(parent), Some(current)) => {
            let mut combined = parent.clone();
            for (key, value) in current {
                combined.insert(key.clone(), value.clone());
            }
            Some(combined)
        }
    }
}

fn collect_flattened_content_patcher_patches(
    content: &Value,
    base_dir: &Path,
    source_label: &str,
    inherited_when: Option<Map<String, Value>>,
    include_stack: &mut Vec<String>,
) -> Vec<FlattenedContentPatcherPatch> {
    let mut patches = Vec::new();

    for (index, change) in array_field(content, "Changes")
        .into_iter()
        .flat_map(|changes| changes.iter().enumerate())
    {
        let Some(patch_object) = change.as_object() else {
            continue;
        };

        let action = patch_object
            .get("Action")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or_default();

        if action.eq_ignore_ascii_case("Include") {
            let Some(from_file) = patch_object
                .get("FromFile")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                continue;
            };

            if from_file.contains("{{") {
                continue;
            }

            let include_path = base_dir.join(from_file.replace('\\', "/"));
            let include_key = normalize_path(&include_path).to_ascii_lowercase();
            if include_stack.contains(&include_key) {
                continue;
            }

            let included_content = match read_json_file(&include_path) {
                Ok((_, included_content)) => included_content,
                Err(error) => {
                    log_scan_skip(&error);
                    continue;
                }
            };

            let inherited = combine_when_conditions(
                inherited_when.as_ref(),
                patch_object.get("When").and_then(Value::as_object),
            );
            let next_source_label = format!("{source_label}->{from_file}");
            include_stack.push(include_key);
            patches.extend(collect_flattened_content_patcher_patches(
                &included_content,
                include_path.parent().unwrap_or(base_dir),
                &next_source_label,
                inherited,
                include_stack,
            ));
            include_stack.pop();
            continue;
        }

        let mut patch = patch_object.clone();
        merge_when_conditions(inherited_when.as_ref(), &mut patch);
        patches.push(FlattenedContentPatcherPatch {
            id: format!("{source_label}:{index}"),
            patch,
        });
    }

    patches
}

fn finalize_mod_asset_references(
    collection: BTreeMap<String, ModAssetReferenceAccumulator>,
) -> Vec<ModAssetReference> {
    collection
        .into_iter()
        .map(|(key, entry)| ModAssetReference {
            key,
            label: if entry.label.trim().is_empty() {
                String::new()
            } else {
                entry.label
            },
            targets: entry.targets.into_iter().collect(),
            patch_ids: entry.patch_ids.into_iter().collect(),
        })
        .collect()
}

fn build_mod_asset_index_group(
    project_path: &Path,
    manifest: &Value,
    content: &Value,
    compatibility: &ProjectCompatibility,
) -> Option<ModAssetIndexGroup> {
    if !compatibility.is_content_patcher || compatibility.status != "ready" {
        return None;
    }

    let mut accumulator = ModAssetGroupAccumulator::default();
    let mut include_stack = Vec::new();
    let flattened_patches = collect_flattened_content_patcher_patches(
        content,
        project_path,
        "content.json",
        None,
        &mut include_stack,
    );
    let known_character_keys = collect_known_character_keys(&flattened_patches);
    for flattened_patch in flattened_patches {
        for target in target_values(&flattened_patch.patch) {
            collect_content_patcher_target_references(
                &target,
                &flattened_patch.patch,
                &flattened_patch.id,
                &known_character_keys,
                &mut accumulator,
            );
        }
    }

    Some(ModAssetIndexGroup {
        mod_id: string_field(manifest, "UniqueID")
            .unwrap_or_else(|| normalize_path(project_path).replace('\\', "/")),
        mod_name: project_name_from_manifest(manifest, project_path),
        mod_path: normalize_path(project_path),
        plugin_kind: "content-patcher".to_string(),
        maps: finalize_mod_asset_references(accumulator.maps),
        events: finalize_mod_asset_references(accumulator.events),
        characters: finalize_mod_asset_references(accumulator.characters),
        buildings: finalize_mod_asset_references(accumulator.buildings),
        items: finalize_mod_asset_references(accumulator.items),
    })
}

fn content_patcher_capabilities() -> Vec<String> {
    ["import", "edit", "save", "export", "validate"]
        .into_iter()
        .map(ToOwned::to_owned)
        .collect()
}

fn ensure_project_root(path: &Path) -> Result<PathBuf, String> {
    if path.join("manifest.json").is_file() {
        return Ok(path.to_path_buf());
    }

    Err(format!(
        "No manifest.json was found in {}",
        normalize_path(path)
    ))
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

fn remove_dir_contents(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(path).map_err(|error| {
        format!(
            "Failed to read target directory {}: {error}",
            normalize_path(path)
        )
    })? {
        let entry =
            entry.map_err(|error| format!("Failed to inspect target directory entry: {error}"))?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            fs::remove_dir_all(&entry_path).map_err(|error| {
                format!(
                    "Failed to remove directory {}: {error}",
                    normalize_path(&entry_path)
                )
            })?;
        } else {
            fs::remove_file(&entry_path).map_err(|error| {
                format!(
                    "Failed to remove file {}: {error}",
                    normalize_path(&entry_path)
                )
            })?;
        }
    }

    Ok(())
}

fn directory_has_entries(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let mut entries = fs::read_dir(path).map_err(|error| {
        format!(
            "Failed to read target directory {}: {error}",
            normalize_path(path)
        )
    })?;
    Ok(entries
        .next()
        .transpose()
        .map_err(|error| {
            format!(
                "Failed to inspect target directory {}: {error}",
                normalize_path(path)
            )
        })?
        .is_some())
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| {
        format!(
            "Failed to create directory {}: {error}",
            normalize_path(target)
        )
    })?;

    for entry in fs::read_dir(source).map_err(|error| {
        format!(
            "Failed to read source directory {}: {error}",
            normalize_path(source)
        )
    })? {
        let entry =
            entry.map_err(|error| format!("Failed to inspect source directory entry: {error}"))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if source_path.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| {
                format!(
                    "Failed to copy {} to {}: {error}",
                    normalize_path(&source_path),
                    normalize_path(&target_path)
                )
            })?;
        }
    }

    Ok(())
}

pub(crate) fn scan_mod_projects(root_path: String) -> Result<Vec<ModProjectSummary>, String> {
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

pub(crate) fn scan_mod_asset_index(root_path: String) -> Result<ModAssetIndex, String> {
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

pub(crate) fn load_mod_project(path: String) -> Result<ModProjectDetail, String> {
    let project_path = ensure_project_root(&clean_input_path(&path))?;
    let manifest_path = project_path.join("manifest.json");
    let content_path = project_path.join("content.json");
    if !content_path.is_file() {
        return Err(format!(
            "No content.json was found in {}",
            normalize_path(&project_path)
        ));
    }

    let (_manifest_json, manifest) = read_json_file(&manifest_path)?;
    let (_content_json, content) = read_json_file(&content_path)?;
    let scan_root = infer_mods_scan_root(&project_path);
    let discovered_projects = collect_scanned_projects(discover_project_roots(&scan_root)?);
    let attached_api_registry = load_attached_api_registry(None);
    let available_mod_ids = collect_available_mod_ids(&discovered_projects, &attached_api_registry);
    let compatibility =
        evaluate_project_compatibility(&manifest, Some(&content), &available_mod_ids);
    let is_cp = compatibility.is_content_patcher;
    let diagnostics = build_diagnostics(&manifest, &content, is_cp);
    if !is_cp {
        return Ok(ModProjectDetail {
            plugin_kind: "unknown".to_string(),
            capabilities: Vec::new(),
            summary: build_project_summary(
                &project_path,
                &manifest_path,
                &manifest,
                Some(&content_path),
                &compatibility,
            ),
            diagnostics,
            content_patcher: None,
        });
    }

    if compatibility.status == "incompatible" {
        return Err(format!(
            "This content pack is missing required dependencies: {}",
            compatibility.missing_required_dependencies.join(", ")
        ));
    }

    Ok(ModProjectDetail {
        plugin_kind: "content-patcher".to_string(),
        capabilities: content_patcher_capabilities(),
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
                .map_err(|error| format!("Failed to serialize manifest.json: {error}"))?,
            serde_json::to_string_pretty(&content)
                .map_err(|error| format!("Failed to serialize content.json: {error}"))?,
            &content,
        )?),
    })
}

pub(crate) fn save_mod_project(
    request: SaveModProjectRequest,
) -> Result<SaveModProjectResult, String> {
    let source_path = ensure_project_root(&clean_input_path(&request.source_path))?;
    let target_path = request
        .output_path
        .as_deref()
        .map(clean_input_path)
        .filter(|path| !normalize_path(path).trim().is_empty())
        .unwrap_or_else(|| source_path.clone());

    let manifest: Value = serde_json::from_str(&request.manifest_json)
        .map_err(|error| format!("manifest.json is not valid JSON: {error}"))?;
    let content: Value = serde_json::from_str(&request.content_json)
        .map_err(|error| format!("content.json is not valid JSON: {error}"))?;
    let is_cp = is_content_patcher_project(&manifest, &content);
    let diagnostics = build_diagnostics(&manifest, &content, is_cp);
    if !is_cp {
        return Err("Only Content Patcher projects can be saved right now.".to_string());
    }

    let canonical_source = source_path.canonicalize().map_err(|error| {
        format!(
            "Failed to resolve source mod directory {}: {error}",
            normalize_path(&source_path)
        )
    })?;
    let canonical_target_parent = target_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|error| {
            format!(
                "Failed to resolve export parent directory {}: {error}",
                normalize_path(target_path.parent().unwrap_or_else(|| Path::new(".")))
            )
        })?;
    let canonical_target = if target_path.exists() {
        target_path.canonicalize().map_err(|error| {
            format!(
                "Failed to resolve export directory {}: {error}",
                normalize_path(&target_path)
            )
        })?
    } else {
        canonical_target_parent.join(
            target_path
                .file_name()
                .ok_or_else(|| "Export target must include a directory name.".to_string())?,
        )
    };
    let source_is_target = canonical_source == canonical_target;

    if !source_is_target {
        if canonical_target.starts_with(&canonical_source) {
            return Err(
                "Export target cannot be nested inside the source mod directory.".to_string(),
            );
        }
        if canonical_source.starts_with(&canonical_target) {
            return Err(
                "Export target cannot be the source mod directory's parent or ancestor."
                    .to_string(),
            );
        }

        fs::create_dir_all(&target_path).map_err(|error| {
            format!(
                "Failed to create export directory {}: {error}",
                normalize_path(&target_path)
            )
        })?;
        if directory_has_entries(&target_path)? {
            if !request.overwrite_existing_export {
                return Err(format!(
                    "Export target {} is not empty. Choose an empty folder or confirm overwrite.",
                    normalize_path(&target_path)
                ));
            }
            remove_dir_contents(&target_path)?;
        }
        copy_dir_recursive(&source_path, &target_path)?;
    }

    let manifest_path = target_path.join("manifest.json");
    let content_path = target_path.join("content.json");
    let manifest_pretty = serde_json::to_string_pretty(&manifest)
        .map_err(|error| format!("Failed to format manifest.json: {error}"))?;
    let content_pretty = serde_json::to_string_pretty(&content)
        .map_err(|error| format!("Failed to format content.json: {error}"))?;
    let mut i18n_payloads = Vec::new();
    for file in request.i18n_files {
        let locale = normalize_i18n_locale(&file.locale)?;
        let parsed: Value = serde_json::from_str(&file.raw_json)
            .map_err(|error| format!("i18n/{locale}.json is not valid JSON: {error}"))?;
        if !parsed.is_object() {
            return Err(format!("i18n/{locale}.json must contain a JSON object."));
        }
        let pretty = serde_json::to_string_pretty(&parsed)
            .map_err(|error| format!("Failed to format i18n/{locale}.json: {error}"))?;
        i18n_payloads.push((locale, pretty));
    }

    fs::write(&manifest_path, format!("{manifest_pretty}\n")).map_err(|error| {
        format!(
            "Failed to write {}: {error}",
            normalize_path(&manifest_path)
        )
    })?;
    fs::write(&content_path, format!("{content_pretty}\n"))
        .map_err(|error| format!("Failed to write {}: {error}", normalize_path(&content_path)))?;
    if !i18n_payloads.is_empty() {
        let i18n_dir = target_path.join("i18n");
        fs::create_dir_all(&i18n_dir).map_err(|error| {
            format!(
                "Failed to create i18n directory {}: {error}",
                normalize_path(&i18n_dir)
            )
        })?;
        for (locale, pretty) in i18n_payloads {
            let path = i18n_dir.join(format!("{locale}.json"));
            fs::write(&path, format!("{pretty}\n"))
                .map_err(|error| format!("Failed to write {}: {error}", normalize_path(&path)))?;
        }
    }

    Ok(SaveModProjectResult {
        plugin_kind: "content-patcher".to_string(),
        target_path: normalize_path(&target_path),
        manifest_path: normalize_path(&manifest_path),
        content_path: normalize_path(&content_path),
        diagnostics,
    })
}

#[cfg(test)]
#[path = "../tests/mods_tests.rs"]
mod tests;
