use libloading::Library;
use serde::Deserialize;
use std::collections::{BTreeMap, BTreeSet};
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
const ATTACHED_API_PLUGIN_SYMBOL_V1: &[u8] = b"modforge_attached_api_get_descriptor_json_v1\0";
const ATTACHED_API_PLUGIN_STEM_MARKER: &str = "modforge-attached-api";

#[derive(Debug, Clone, Default)]
pub(crate) struct AttachedApiRegistry {
    provided_unique_ids_by_provider: BTreeMap<String, Vec<String>>,
    target_asset_kinds: BTreeMap<String, String>,
}

impl AttachedApiRegistry {
    pub(crate) fn provided_unique_ids_for(&self, provider_unique_id: &str) -> Vec<String> {
        self.provided_unique_ids_by_provider
            .get(&normalize_unique_id(provider_unique_id))
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn infer_asset_kind(&self, target: &str) -> Option<&str> {
        let normalized_target = normalize_attached_api_target(target);
        if normalized_target.is_empty() {
            return None;
        }

        self.target_asset_kinds
            .get(&normalized_target)
            .map(String::as_str)
    }

    fn register_entry(&mut self, provider_unique_id: &str, provides_unique_ids: &[String], targets: &[AttachedApiTargetDescriptor]) {
        let provider_key = normalize_unique_id(provider_unique_id);
        if provider_key.is_empty() {
            return;
        }

        let mut seen_ids = BTreeSet::new();
        let mut registered_ids = Vec::new();
        for unique_id in std::iter::once(provider_unique_id).chain(provides_unique_ids.iter().map(String::as_str)) {
            let trimmed = unique_id.trim();
            if trimmed.is_empty() {
                continue;
            }
            if seen_ids.insert(normalize_unique_id(trimmed)) {
                registered_ids.push(trimmed.to_string());
            }
        }

        if registered_ids.is_empty() {
            return;
        }

        let entry = self
            .provided_unique_ids_by_provider
            .entry(provider_key)
            .or_default();
        for unique_id in &registered_ids {
            let normalized = normalize_unique_id(unique_id);
            if !entry.iter().any(|existing| normalize_unique_id(existing) == normalized) {
                entry.push(unique_id.clone());
            }
        }

        for target in targets {
            let asset_path = normalize_asset_path(&target.asset_path);
            let asset_kind = normalize_asset_kind(&target.asset_kind);
            if asset_path.is_empty() || asset_kind.is_empty() {
                continue;
            }

            for unique_id in &registered_ids {
                self.target_asset_kinds
                    .insert(normalize_attached_api_target(&format!("{unique_id}/{asset_path}")), asset_kind.clone());
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn from_test_descriptors(
        descriptors: &[(&str, &[&str], &[(&str, &str)])],
    ) -> Self {
        let mut registry = Self::default();
        for (provider_unique_id, provided_unique_ids, targets) in descriptors {
            let target_descriptors = targets
                .iter()
                .map(|(asset_path, asset_kind)| AttachedApiTargetDescriptor {
                    asset_path: (*asset_path).to_string(),
                    asset_kind: (*asset_kind).to_string(),
                })
                .collect::<Vec<_>>();
            registry.register_entry(
                provider_unique_id,
                &provided_unique_ids.iter().map(|value| (*value).to_string()).collect::<Vec<_>>(),
                &target_descriptors,
            );
        }

        registry
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachedApiPluginDescriptor {
    schema_version: u32,
    #[serde(default)]
    module: Option<AttachedApiModuleDescriptor>,
    #[serde(default)]
    entries: Vec<AttachedApiEntryDescriptor>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachedApiModuleDescriptor {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachedApiEntryDescriptor {
    #[serde(default)]
    provider_unique_id: Option<String>,
    #[serde(default)]
    provides_unique_ids: Vec<String>,
    #[serde(default)]
    targets: Vec<AttachedApiTargetDescriptor>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AttachedApiTargetDescriptor {
    asset_path: String,
    asset_kind: String,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct AttachedApiDescriptorJsonV1 {
    json_ptr: *const u8,
    json_len: usize,
}

type AttachedApiDescriptorFnV1 = unsafe extern "C" fn() -> AttachedApiDescriptorJsonV1;

fn normalize_unique_id(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn normalize_asset_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn normalize_asset_kind(kind: &str) -> String {
    match kind.trim().to_ascii_lowercase().as_str() {
        "json" | "image" | "map" => kind.trim().to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn normalize_attached_api_target(target: &str) -> String {
    let trimmed = target.trim();
    let unwrapped = trimmed
        .strip_prefix("{{")
        .and_then(|value| value.strip_suffix("}}"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(trimmed);

    unwrapped
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
        .to_ascii_lowercase()
}

fn library_extension() -> &'static str {
    if cfg!(target_os = "windows") {
        "dll"
    } else if cfg!(target_os = "macos") {
        "dylib"
    } else {
        "so"
    }
}

fn should_skip_scan_dir(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    name.starts_with('.') || SKIPPED_SCAN_DIRECTORIES.iter().any(|candidate| name.eq_ignore_ascii_case(candidate))
}

fn attached_api_root_dir() -> PathBuf {
    if let Ok(value) = std::env::var("MODFORGE_ATTACHED_API_DIR") {
        return PathBuf::from(value);
    }

    if let Ok(value) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(value).join("ModForge Studio").join("attached-api");
    }

    if let Ok(value) = std::env::var("XDG_DATA_HOME") {
        return PathBuf::from(value).join("modforge-studio").join("attached-api");
    }

    if let Ok(value) = std::env::var("HOME") {
        return PathBuf::from(value)
            .join(".local")
            .join("share")
            .join("modforge-studio")
            .join("attached-api");
    }

    std::env::temp_dir().join("modforge-studio-attached-api")
}

fn discover_plugin_candidates(plugin_root: &Path) -> Result<Vec<PathBuf>, String> {
    if !plugin_root.exists() {
        return Ok(Vec::new());
    }

    let mut pending = vec![plugin_root.to_path_buf()];
    let mut candidates = Vec::new();
    while let Some(current_dir) = pending.pop() {
        let entries = fs::read_dir(&current_dir)
            .map_err(|error| format!("Failed to read attached API plugin directory {}: {error}", current_dir.display()))?;

        for entry in entries {
            let entry = entry.map_err(|error| format!("Failed to inspect attached API plugin entry: {error}"))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                if should_skip_scan_dir(&entry_path) {
                    continue;
                }
                pending.push(entry_path);
                continue;
            }

            if is_attached_api_plugin_candidate(&entry_path) {
                candidates.push(entry_path);
            }
        }
    }

    candidates.sort();
    Ok(candidates)
}

fn parse_plugin_descriptor_json(
    plugin_path: &Path,
    descriptor_json: &str,
    registry: &mut AttachedApiRegistry,
) -> Result<(), String> {
    let descriptor: AttachedApiPluginDescriptor =
        serde_json::from_str(descriptor_json).map_err(|error| format!("Invalid attached API plugin JSON in {}: {error}", plugin_path.display()))?;
    if descriptor.schema_version != 1 {
        return Err(format!(
            "Unsupported attached API plugin schema version {} in {}.",
            descriptor.schema_version,
            plugin_path.display()
        ));
    }

    validate_plugin_module(plugin_path, descriptor.module.as_ref())?;

    for entry in descriptor.entries {
        let Some(provider_unique_id) = entry
            .provider_unique_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
        else {
            log::warn!(
                "Skipping attached API plugin entry in {} because providerUniqueId is missing.",
                plugin_path.display()
            );
            continue;
        };

        registry.register_entry(&provider_unique_id, &entry.provides_unique_ids, &entry.targets);
    }

    Ok(())
}

fn validate_plugin_module(
    plugin_path: &Path,
    module: Option<&AttachedApiModuleDescriptor>,
) -> Result<(), String> {
    let Some(module) = module else {
        return Err(format!(
            "Attached API plugin {} is missing module declaration.",
            plugin_path.display()
        ));
    };

    let module_id = module
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Attached API plugin {} is missing module.id.", plugin_path.display()))?;

    module
        .version
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Attached API plugin {} module {module_id} is missing module.version.",
                plugin_path.display()
            )
        })?;

    Ok(())
}

unsafe fn read_plugin_descriptor_json(plugin_path: &Path) -> Result<String, String> {
    let library = unsafe { Library::new(plugin_path) }
        .map_err(|error| format!("Failed to load attached API plugin {}: {error}", plugin_path.display()))?;
    let get_descriptor = unsafe { library.get::<AttachedApiDescriptorFnV1>(ATTACHED_API_PLUGIN_SYMBOL_V1) }
        .map_err(|error| format!("Attached API plugin {} is missing the v1 export: {error}", plugin_path.display()))?;
    let descriptor = unsafe { get_descriptor() };
    if descriptor.json_ptr.is_null() || descriptor.json_len == 0 {
        return Err(format!(
            "Attached API plugin {} returned an empty descriptor payload.",
            plugin_path.display()
        ));
    }

    let bytes = unsafe { std::slice::from_raw_parts(descriptor.json_ptr, descriptor.json_len) };
    let json = std::str::from_utf8(bytes)
        .map_err(|error| format!("Attached API plugin {} returned invalid UTF-8: {error}", plugin_path.display()))?
        .to_string();
    drop(library);
    Ok(json)
}

fn is_attached_api_plugin_candidate(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(library_extension()))
        && path
            .file_stem()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.to_ascii_lowercase().contains(ATTACHED_API_PLUGIN_STEM_MARKER))
}

pub(crate) fn load_attached_api_registry(plugin_root_override: Option<&str>) -> AttachedApiRegistry {
    let plugin_root = plugin_root_override
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(attached_api_root_dir);
    let plugin_candidates = match discover_plugin_candidates(&plugin_root) {
        Ok(plugin_candidates) => plugin_candidates,
        Err(error) => {
            log::warn!("{error}");
            return AttachedApiRegistry::default();
        }
    };

    let mut registry = AttachedApiRegistry::default();
    for plugin_path in plugin_candidates {
        let descriptor_json = match unsafe { read_plugin_descriptor_json(&plugin_path) } {
            Ok(descriptor_json) => descriptor_json,
            Err(error) => {
                log::warn!("{error}");
                continue;
            }
        };

        if let Err(error) = parse_plugin_descriptor_json(&plugin_path, &descriptor_json, &mut registry) {
            log::warn!("{error}");
        }
    }

    registry
}

#[cfg(test)]
#[path = "tests/attached_api_test_support.rs"]
pub(crate) mod test_support;

#[cfg(test)]
#[path = "tests/attached_api_tests.rs"]
mod tests;
