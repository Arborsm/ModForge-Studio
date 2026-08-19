//! Compat plugin manifest model, validation and loader (format 1).
//!
//! A compat plugin is a directory under a plugin root containing a `manifest.json`
//! that declares which mods it provides compatibility for and what contributions
//! it makes. Format 1 only realises the `attachedApi` contribution type; later
//! stages add `pages`, `capabilities`, `assetSchemas` and `conditionSyntax`.
//!
//! The loader scans one or more plugin roots, parses each `manifest.json`,
//! validates it against the 9-rule table (see `validate_manifest`) and returns a
//! report of successful manifests plus per-plugin errors. A bad plugin never
//! affects other plugins.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::domain::modding::attached_api::{AttachedApiDescriptor, AttachedApiTargetDescriptor};
use crate::support::logging::event::LogEvent;
use crate::support::logging::event::targets;

/// Manifest format version. Unknown versions are rejected (rule V1).
pub(crate) const CURRENT_MANIFEST_FORMAT: u32 = 1;

/// Plugin id pattern (rule V2): lowercase alphanumeric with dots/dashes, must
/// match the directory name.
const PLUGIN_ID_PATTERN: &str = r"^[a-z0-9][a-z0-9.-]*$";

/// A loaded compat plugin manifest (format 1).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginManifest {
    pub format: u32,
    pub id: String,
    /// Display name; consumed by `CompatPluginSummary` in stage 1.
    #[allow(dead_code)]
    pub name: String,
    pub sdk_version: Option<String>,
    pub entry: Option<String>,
    pub targets: Vec<String>,
    pub contributions: CompatPluginContributions,
    /// On-disk plugin directory; set by the loader after parsing (not
    /// deserialized from JSON). Used to read i18n bundles and entry files.
    #[serde(skip)]
    pub plugin_dir: PathBuf,
}

/// Contribution container. `attachedApi` is realised from format 1; `pages`
/// is realised from stage 1 (navigation metadata) and extended in stage 2
/// (source/layout/sections). Other contribution types are added in later stages.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginContributions {
    pub attached_api: Option<AttachedApiContribution>,
    #[serde(default)]
    pub pages: Vec<PageContribution>,
    // capabilities / assetSchemas / conditionSyntax are added in later stages;
    // serde ignores unknown keys so forward compatibility holds.
}

/// `contributions.attachedApi` entry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AttachedApiContribution {
    pub provider_unique_id: String,
    #[serde(default)]
    pub provided_unique_ids: Vec<String>,
    #[serde(default)]
    pub targets: Vec<AttachedApiTargetDecl>,
}

/// Asset target inside an `attachedApi` contribution.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AttachedApiTargetDecl {
    pub asset_path: String,
    pub asset_kind: String,
}

/// Navigation metadata for a page contribution (used in stage 1 to build
/// workbench sidebar entries).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageNavigationDecl {
    pub section: String,
    pub order: i32,
    pub icon: String,
}

/// `contributions.pages[]` entry. Stage 1 realises navigation metadata
/// (`id`, `navigation`, `titleKey`, `presentation`, `projectAccess`); stage 2
/// extends with `source`, `layout` and `sections` (ignored by serde until then).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageContribution {
    pub id: String,
    pub navigation: PageNavigationDecl,
    pub title_key: String,
    #[serde(default = "default_presentation")]
    #[allow(dead_code)]
    pub presentation: String,
    #[serde(default = "default_project_access")]
    #[allow(dead_code)]
    pub project_access: String,
}

fn default_presentation() -> String {
    "standalone".to_string()
}

fn default_project_access() -> String {
    "none".to_string()
}

/// Result of loading all plugin manifests from one or more roots.
#[derive(Debug, Default, Clone)]
pub(crate) struct PluginLoadReport {
    pub manifests: Vec<CompatPluginManifest>,
    pub errors: Vec<PluginLoadError>,
}

/// A per-plugin load failure.
#[derive(Debug, Clone)]
pub(crate) struct PluginLoadError {
    pub plugin_dir: String,
    /// Plugin id if it could be parsed before the failure; populated from
    /// stage 1 onwards when the summary surface needs it.
    #[allow(dead_code)]
    pub plugin_id: Option<String>,
    pub reason: String,
}

/// Wire type returned by `list_compat_plugins`. Frontend uses this to build
/// workbench registrations and populate the plugin locale store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginSummary {
    pub id: String,
    pub name: String,
    pub format: u32,
    pub has_code_entry: bool,
    pub targets: Vec<String>,
    pub page_ids: Vec<String>,
    pub pages: Vec<CompatPluginPageSummary>,
    pub i18n: PluginI18nBundle,
    pub load_error: Option<String>,
}

/// Page descriptor included in `CompatPluginSummary`, carrying the
/// navigation-relevant fields the frontend needs to build a
/// `WorkbenchModuleRegistration`. Stage 2 extends the on-disk page descriptor
/// with `source`, `layout` and `sections`; those are not forwarded here yet.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginPageSummary {
    pub id: String,
    pub section: String,
    pub order: i32,
    pub icon: String,
    pub title_key: String,
    pub presentation: String,
    pub project_access: String,
}

/// Inline i18n bundles keyed by locale code. Each locale maps to a flat
/// `key → value` record loaded from the plugin's `i18n/<locale>.json`.
pub(crate) type PluginI18nBundle =
    std::collections::BTreeMap<String, std::collections::BTreeMap<String, String>>;

/// Supported locales for inline i18n loading. Matches the frontend `LocaleCode`.
const SUPPORTED_LOCALES: &[&str] = &["zh-CN", "en-US"];

impl PluginLoadReport {
    /// Converts all loaded `attachedApi` contributions into descriptors for the
    /// `AttachedApiRegistry`. Invalid or missing contributions are skipped (they
    /// are already in `errors`).
    pub(crate) fn to_attached_api_descriptors(&self) -> Vec<AttachedApiDescriptor> {
        self.manifests
            .iter()
            .filter_map(|manifest| manifest.contributions.attached_api.as_ref())
            .map(|contribution| AttachedApiDescriptor {
                provider_unique_id: leak_static(&contribution.provider_unique_id),
                provided_unique_ids: contribution.provided_unique_ids.clone(),
                targets: contribution
                    .targets
                    .iter()
                    .map(|target| AttachedApiTargetDescriptor {
                        asset_path: target.asset_path.clone(),
                        asset_kind: target.asset_kind.clone(),
                    })
                    .collect(),
            })
            .collect()
    }
}

/// Leaks a runtime string into a `&'static str` for the descriptor's static id
/// field. Plugin manifests are loaded once at startup and live for the process
/// lifetime, so this is bounded and intentional.
fn leak_static(value: &str) -> &'static str {
    let boxed = value.to_string().into_boxed_str();
    Box::leak(boxed)
}

/// Loads and validates all `manifest.json` files found under the given roots.
///
/// Each root is scanned for immediate child directories containing a
/// `manifest.json`. A parse or validation failure for one plugin is recorded in
/// `errors` and does not affect the others.
pub(crate) fn load_plugin_manifests(roots: &[PathBuf]) -> PluginLoadReport {
    let mut report = PluginLoadReport::default();
    let id_re = regex::Regex::new(PLUGIN_ID_PATTERN).expect("plugin id regex is valid");

    for root in roots {
        let entries = match std::fs::read_dir(root) {
            Ok(entries) => entries,
            Err(error) => {
                log::warn!(
                    target: targets::APP_UI,
                    "{}",
                    LogEvent::new("compatPlugin.scanRoot")
                        .field("root", root.display())
                        .field("error", error.to_string())
                        .render()
                );
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let manifest_path = path.join("manifest.json");
            if !manifest_path.is_file() {
                continue;
            }

            let plugin_dir = path.display().to_string();
            match load_single_manifest(&manifest_path, &path, &id_re) {
                Ok(manifest) => report.manifests.push(manifest),
                Err(reason) => report.errors.push(PluginLoadError {
                    plugin_dir,
                    plugin_id: None,
                    reason,
                }),
            }
        }
    }

    report
}

/// Parses and validates a single `manifest.json`.
fn load_single_manifest(
    manifest_path: &Path,
    plugin_dir: &Path,
    id_re: &regex::Regex,
) -> Result<CompatPluginManifest, String> {
    let raw = std::fs::read_to_string(manifest_path)
        .map_err(|error| format!("read manifest.json failed: {error}"))?;
    let mut manifest: CompatPluginManifest = serde_json::from_str(&raw)
        .map_err(|error| format!("parse manifest.json failed: {error}"))?;
    validate_manifest(&manifest, plugin_dir, id_re)?;
    manifest.plugin_dir = plugin_dir.to_path_buf();
    Ok(manifest)
}

/// Runs the 9-rule validation table against a parsed manifest.
///
/// Rules V1–V8 reject the plugin on failure; V9 only warns. The directory name
/// is checked against the manifest `id` (rule V2).
fn validate_manifest(
    manifest: &CompatPluginManifest,
    plugin_dir: &Path,
    id_re: &regex::Regex,
) -> Result<(), String> {
    // V1: format version
    if manifest.format != CURRENT_MANIFEST_FORMAT {
        return Err(format!(
            "unknown manifest version: {} (expected {})",
            manifest.format, CURRENT_MANIFEST_FORMAT
        ));
    }

    // V2: id pattern + directory match
    let dir_name = plugin_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if !id_re.is_match(&manifest.id) {
        return Err(format!("invalid plugin id: {}", manifest.id));
    }
    if manifest.id != dir_name {
        return Err(format!(
            "plugin id {} does not match directory name {}",
            manifest.id, dir_name
        ));
    }

    // V3: targets non-empty, each non-blank
    if manifest.targets.is_empty()
        || manifest
            .targets
            .iter()
            .any(|target| target.trim().is_empty())
    {
        return Err("targets must be a non-empty list of non-blank UniqueIDs".to_string());
    }

    // V4: entry and sdkVersion must both be present or both absent
    let has_entry = manifest.entry.is_some();
    let has_sdk = manifest.sdk_version.is_some();
    if has_entry != has_sdk {
        return Err("entry and sdkVersion must both be present or both absent".to_string());
    }

    // V5: entry file exists and is .js (only when entry is declared)
    if let Some(entry) = manifest.entry.as_deref() {
        if Path::new(entry).extension().and_then(|ext| ext.to_str()) != Some("js") {
            return Err(format!("entry must be a .js file: {entry}"));
        }
        let entry_path = plugin_dir.join(entry);
        if !entry_path.is_file() {
            return Err(format!("entry file not found: {entry}"));
        }
    }

    // V6: at least one contribution key non-empty
    let has_contrib =
        manifest.contributions.attached_api.is_some() || !manifest.contributions.pages.is_empty();
    if !has_contrib {
        return Err("contributions must declare at least one non-empty key".to_string());
    }

    // V7: attachedApi providerUniqueId non-empty; assetKind in {json,image,map}
    if let Some(attached) = manifest.contributions.attached_api.as_ref() {
        if attached.provider_unique_id.trim().is_empty() {
            return Err("attachedApi.providerUniqueId must be non-empty".to_string());
        }
        for target in &attached.targets {
            if !matches!(
                target.asset_kind.trim().to_ascii_lowercase().as_str(),
                "json" | "image" | "map"
            ) {
                return Err(format!(
                    "attachedApi target has invalid assetKind: {}",
                    target.asset_kind
                ));
            }
        }
    }

    // V8: capabilities references (stage 1+; no capabilities field yet, skip)
    // V9: unknown top-level fields — warn only, do not reject (SMAPI ExtraFields
    // tolerance). serde already ignores unknown keys during deserialization, so
    // there is nothing to do here for now.

    Ok(())
}

/// Loads plugin summaries from the given roots, including inline i18n bundles.
///
/// Summaries are cached for the process lifetime via a `OnceLock` — the first
/// call loads from disk, subsequent calls return the cached result. Stage 4's
/// `reload_compat_plugins` will reset this cache.
pub(crate) fn list_summaries(roots: &[PathBuf]) -> Vec<CompatPluginSummary> {
    static CACHE: OnceLock<Vec<CompatPluginSummary>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let report = load_plugin_manifests(roots);
            for error in &report.errors {
                log::warn!(
                    target: targets::APP_UI,
                    "{}",
                    LogEvent::new("compatPlugin.loadError")
                        .field("pluginDir", &error.plugin_dir)
                        .field("reason", &error.reason)
                        .render()
                );
            }
            build_summaries_from_report(&report)
        })
        .clone()
}

/// Builds summaries from an already-loaded manifest report. Extracted from
/// `list_summaries` so unit tests can exercise the summary construction and
/// i18n loading without the process-level `OnceLock` cache.
pub(crate) fn build_summaries_from_report(report: &PluginLoadReport) -> Vec<CompatPluginSummary> {
    report
        .manifests
        .iter()
        .map(|manifest| {
            let i18n = load_plugin_i18n(&manifest.plugin_dir);
            let pages: Vec<CompatPluginPageSummary> = manifest
                .contributions
                .pages
                .iter()
                .map(|page| CompatPluginPageSummary {
                    id: page.id.clone(),
                    section: page.navigation.section.clone(),
                    order: page.navigation.order,
                    icon: page.navigation.icon.clone(),
                    title_key: page.title_key.clone(),
                    presentation: page.presentation.clone(),
                    project_access: page.project_access.clone(),
                })
                .collect();
            let page_ids = pages.iter().map(|page| page.id.clone()).collect();
            CompatPluginSummary {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                format: manifest.format,
                has_code_entry: manifest.entry.is_some(),
                targets: manifest.targets.clone(),
                page_ids,
                pages,
                i18n,
                load_error: None,
            }
        })
        .collect()
}

/// Reads `i18n/<locale>.json` for each supported locale from the plugin
/// directory. Missing files or parse failures produce an empty bundle for that
/// locale (not an error — i18n is optional).
fn load_plugin_i18n(plugin_dir: &Path) -> PluginI18nBundle {
    let mut bundle = PluginI18nBundle::new();
    let i18n_dir = plugin_dir.join("i18n");
    for locale in SUPPORTED_LOCALES {
        let path = i18n_dir.join(format!("{locale}.json"));
        let entries = match std::fs::read_to_string(&path) {
            Ok(raw) => serde_json::from_str::<std::collections::BTreeMap<String, String>>(&raw)
                .unwrap_or_default(),
            Err(_) => std::collections::BTreeMap::new(),
        };
        if !entries.is_empty() {
            bundle.insert((*locale).to_string(), entries);
        }
    }
    bundle
}

/// Resolves the plugin roots to scan for the current build configuration.
///
/// - `plugin_root_override = Some(path)` → only that path (tests / dev debug).
/// - dev build → `<repo>/apps/desktop/compat-plugins/` (anchored on
///   `CARGO_MANIFEST_DIR`, which points at `apps/desktop/src-tauri`).
/// - packaged build → `<resource_dir>/compat-plugins/` + `<app_data_dir>/compat-plugins/`
///   (user directory, may be empty). Resolved lazily by callers that have access
///   to a Tauri `AppHandle`; the pure-Rust entry point only handles the override
///   and dev cases.
pub(crate) fn resolve_plugin_roots(plugin_root_override: Option<&str>) -> Vec<PathBuf> {
    if let Some(path) = plugin_root_override {
        return vec![PathBuf::from(path)];
    }

    // Dev build anchor: CARGO_MANIFEST_DIR points at apps/desktop/src-tauri.
    let dev_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("compat-plugins");
    if dev_root.is_dir() {
        return vec![dev_root];
    }

    // Packaged build: resource_dir / app_data_dir are resolved by the Tauri
    // command wrapper (stage 1) which has access to AppHandle. The pure-Rust
    // loader returns empty here when no dev directory exists.
    Vec::new()
}

#[cfg(test)]
#[path = "../../tests/unit/domain/modding/compat_plugin_tests.rs"]
mod tests;
