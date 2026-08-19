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
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

use crate::domain::modding::attached_api::{AttachedApiDescriptor, AttachedApiTargetDescriptor};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
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
/// (source/layout/sections). `assetSchemas` and `conditionSyntax` are realised
/// from stage 4. Other contribution types are added in later stages.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginContributions {
    pub attached_api: Option<AttachedApiContribution>,
    #[serde(default)]
    pub pages: Vec<PageContribution>,
    /// Stage 4: asset schema contributions for CP editor merging.
    #[serde(default)]
    pub asset_schemas: Vec<AssetSchemaContribution>,
    /// Stage 4: condition syntax contributions for When/GSQ editor autocomplete.
    #[serde(default)]
    pub condition_syntax: Vec<ConditionSyntaxContribution>,
    // capabilities are added in later stages;
    // serde ignores unknown keys so forward compatibility holds.
}

/// Asset schema contribution: declares asset field metadata for CP editor merging.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetSchemaContribution {
    /// Asset path pattern (e.g. "spacechase0.SpaceCore/*").
    pub asset_path: String,
    /// Field declarations for this asset type.
    #[serde(default)]
    pub fields: Vec<AssetSchemaFieldDecl>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetSchemaFieldDecl {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
}

/// Condition syntax contribution: declares condition keys for When/GSQ editor autocomplete.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConditionSyntaxContribution {
    /// Condition key namespace (e.g. "EPU").
    pub namespace: String,
    /// Declared condition keys.
    #[serde(default)]
    pub keys: Vec<ConditionSyntaxKeyDecl>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConditionSyntaxKeyDecl {
    pub key: String,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
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
    /// Stage 2: source declaration for pack entry I/O.
    #[serde(default)]
    pub source: Option<PageSourceDecl>,
    /// Stage 2: layout hint ("two-column" | "single").
    #[serde(default)]
    pub layout: Option<String>,
    /// Stage 2: grouped field descriptors.
    #[serde(default)]
    pub sections: Vec<PageSectionDecl>,
    /// Cross-field validation rules (e.g. `require-one-of` for identifier
    /// fields). Declared at the page level; forwarded to the frontend via
    /// `CompatPluginPageSummary`.
    #[serde(default)]
    pub validations: Vec<PageValidationDecl>,
}

/// `contributions.pages[].source` — declares where pack entries live.
/// v1 only implements `directory-pack`; `mod-config` and `cp-assets` are
/// reserved for future stages and rejected by the validator if encountered.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSourceDecl {
    pub kind: String,
    #[serde(default)]
    pub params: PageSourceParams,
}

/// Parameters for `directory-pack` source kind.
#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSourceParams {
    /// Entry file in each entry directory (e.g. "texture.json").
    pub entry_file: Option<String>,
    /// Optional companion image file (e.g. "texture.png").
    pub entry_image: Option<String>,
    /// Subdirectory within the mod root containing entries (e.g. "Textures").
    pub root_subdir: Option<String>,
}

/// `contributions.pages[].sections[]` — grouped field descriptors.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSectionDecl {
    pub title_key: String,
    #[serde(default)]
    pub fields: Vec<PageFieldDecl>,
}

/// A single field descriptor in a page section.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldDecl {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub label_key: Option<String>,
    pub required: Option<bool>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub interval: Option<f64>,
    pub allow_values: Option<Vec<String>>,
    #[serde(default)]
    pub validate: Vec<PageFieldValidateDecl>,
    pub visible_when: Option<PageFieldVisibleWhenDecl>,
    /// For `record-list` fields: sub-schema for each record's fields.
    #[serde(default)]
    pub fields: Vec<PageFieldDecl>,
    /// For `object` fields: sub-fields of the nested object.
    #[serde(default)]
    pub sub_fields: Vec<PageFieldDecl>,
}

/// Validation rule declaration.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldValidateDecl {
    pub kind: String,
    #[serde(default)]
    pub value: Option<serde_json::Value>,
}

/// Conditional visibility declaration.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldVisibleWhenDecl {
    pub kind: String,
    pub field: String,
    #[serde(default)]
    pub value: Option<serde_json::Value>,
    #[serde(default)]
    pub values: Option<Vec<serde_json::Value>>,
}

/// Cross-field validation rule declaration (e.g. `require-one-of` for
/// identifier fields). Declared at the page level so the frontend can enforce
/// rules that span multiple fields within the same page.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum PageValidationDecl {
    #[serde(rename = "require-one-of")]
    RequireOneOf {
        paths: Vec<String>,
        #[serde(rename = "messageKey")]
        message_key: String,
    },
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
    /// Stage 4: asset schema contributions for CP editor merging.
    pub asset_schemas: Vec<AssetSchemaWire>,
    /// Stage 4: condition syntax contributions for When/GSQ editor autocomplete.
    pub condition_syntax: Vec<ConditionSyntaxWire>,
    pub load_error: Option<String>,
    /// Code-package entry file path relative to plugin root (e.g. "index.js");
    /// null for data-pack plugins.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    /// SDK version declared in manifest (e.g. "1.0.0"); null for data-pack
    /// plugins.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdk_version: Option<String>,
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
    /// Stage 2: source declaration for pack entry I/O (null for code-package pages).
    pub source: Option<PageSourceWire>,
    /// Stage 2: layout hint.
    pub layout: Option<String>,
    /// Stage 2: grouped field descriptors.
    pub sections: Vec<PageSectionWire>,
    /// Cross-field validation rules (e.g. require-one-of for identifier
    /// fields).
    #[serde(default)]
    pub validations: Vec<CompatPluginValidationWire>,
}

/// Wire form of a cross-field validation rule (e.g. `require-one-of` for
/// identifier fields). Tagged by `kind` so the frontend can pattern-match on
/// the rule type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum CompatPluginValidationWire {
    #[serde(rename = "require-one-of")]
    RequireOneOf {
        paths: Vec<String>,
        #[serde(rename = "messageKey")]
        message_key: String,
    },
}

/// Wire form of `PageSourceDecl` (Serialize + Deserialize, since the decl only
/// derives Deserialize).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSourceWire {
    pub kind: String,
    pub params: PageSourceParamsWire,
}

/// Wire form of `PageSourceParams`.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSourceParamsWire {
    pub entry_file: Option<String>,
    pub entry_image: Option<String>,
    pub root_subdir: Option<String>,
}

/// Wire form of `PageSectionDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSectionWire {
    pub title_key: String,
    pub fields: Vec<PageFieldWire>,
}

/// Wire form of `PageFieldDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldWire {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub label_key: Option<String>,
    pub required: Option<bool>,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub interval: Option<f64>,
    pub allow_values: Option<Vec<String>>,
    pub validate: Vec<PageFieldValidateWire>,
    pub visible_when: Option<PageFieldVisibleWhenWire>,
    pub fields: Vec<PageFieldWire>,
    pub sub_fields: Vec<PageFieldWire>,
}

/// Wire form of `PageFieldValidateDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldValidateWire {
    pub kind: String,
    pub value: Option<serde_json::Value>,
}

/// Wire form of `PageFieldVisibleWhenDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageFieldVisibleWhenWire {
    pub kind: String,
    pub field: String,
    pub value: Option<serde_json::Value>,
    pub values: Option<Vec<serde_json::Value>>,
}

/// Wire form of `AssetSchemaContribution` (Serialize + Deserialize, since the
/// decl only derives Deserialize).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetSchemaWire {
    pub asset_path: String,
    pub fields: Vec<AssetSchemaFieldWire>,
}

/// Wire form of `AssetSchemaFieldDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AssetSchemaFieldWire {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
}

/// Wire form of `ConditionSyntaxContribution`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConditionSyntaxWire {
    pub namespace: String,
    pub keys: Vec<ConditionSyntaxKeyWire>,
}

/// Wire form of `ConditionSyntaxKeyDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConditionSyntaxKeyWire {
    pub key: String,
    pub label_key: Option<String>,
    pub description_key: Option<String>,
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
    let has_contrib = manifest.contributions.attached_api.is_some()
        || !manifest.contributions.pages.is_empty()
        || !manifest.contributions.asset_schemas.is_empty()
        || !manifest.contributions.condition_syntax.is_empty();
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

    // Stage 2: page descriptor validation. Each page may declare a `source`,
    // `layout` and `sections`; the source kind, field types and conditional
    // visibility are checked here. Code-package pages (no `source`) are allowed
    // and skip the source-specific checks.
    for page in &manifest.contributions.pages {
        if let Some(source) = page.source.as_ref() {
            // v1 only implements `directory-pack`; other kinds are reserved.
            if source.kind != "directory-pack" {
                return Err(format!(
                    "page {} has unsupported source kind: {} (v1 only supports directory-pack)",
                    page.id, source.kind
                ));
            }
            // directory-pack requires a non-empty entryFile.
            let entry_file = source.params.entry_file.as_deref().unwrap_or("").trim();
            if entry_file.is_empty() {
                return Err(format!(
                    "page {} source directory-pack requires non-empty params.entryFile",
                    page.id
                ));
            }
        }

        for section in &page.sections {
            for field in &section.fields {
                validate_page_field(&page.id, field)?;
            }
        }
    }

    Ok(())
}

/// Valid field types for a page field descriptor.
const VALID_FIELD_TYPES: &[&str] = &[
    "bool",
    "number",
    "text",
    "choice",
    "keybind",
    "keybind-list",
    "string-list",
    "record-list",
    "object",
];

/// Recursively validates a page field descriptor and its sub-fields.
fn validate_page_field(page_id: &str, field: &PageFieldDecl) -> Result<(), String> {
    if !VALID_FIELD_TYPES.contains(&field.field_type.as_str()) {
        return Err(format!(
            "page {} field {} has invalid type: {} (expected one of {})",
            page_id,
            field.id,
            field.field_type,
            VALID_FIELD_TYPES.join(" | ")
        ));
    }

    // record-list requires non-empty sub-fields.
    if field.field_type == "record-list" && field.fields.is_empty() {
        return Err(format!(
            "page {} field {} of type record-list must declare non-empty fields",
            page_id, field.id
        ));
    }

    // object requires non-empty subFields.
    if field.field_type == "object" && field.sub_fields.is_empty() {
        return Err(format!(
            "page {} field {} of type object must declare non-empty subFields",
            page_id, field.id
        ));
    }

    // allowValues is only valid for choice fields.
    if field.allow_values.is_some() && field.field_type != "choice" {
        return Err(format!(
            "page {} field {} declares allowValues but type is {} (allowValues requires type choice)",
            page_id, field.id, field.field_type
        ));
    }

    // visibleWhen.kind must be field-eq or field-in.
    if let Some(visible_when) = field.visible_when.as_ref() {
        if !matches!(visible_when.kind.as_str(), "field-eq" | "field-in") {
            return Err(format!(
                "page {} field {} has invalid visibleWhen.kind: {} (expected field-eq or field-in)",
                page_id, field.id, visible_when.kind
            ));
        }
    }

    // Recurse into record-list sub-fields and object sub-fields.
    for sub in &field.fields {
        validate_page_field(page_id, sub)?;
    }
    for sub in &field.sub_fields {
        validate_page_field(page_id, sub)?;
    }

    Ok(())
}

/// Process-level cache of resolved plugin roots. Set once at app startup (Tauri
/// `setup` or sidecar `run_stdio`) so that domain code without access to an
/// `AppHandle` — e.g. `load_attached_api_registry` — can still locate packaged
/// plugin directories. Falls back to the dev-build anchor when not set.
static PLUGIN_ROOTS: OnceLock<Vec<PathBuf>> = OnceLock::new();

/// Process-level cache of plugin summaries. Built once from the resolved
/// plugin roots and reused for the process lifetime. Stage 4's
/// `reload_compat_plugins` resets this cache (and the attached API registry
/// cache) via [`clear_plugin_caches`].
static CACHED_SUMMARIES: Mutex<Option<Vec<CompatPluginSummary>>> = Mutex::new(None);

/// Initializes the process-level plugin root set. Called once at app startup
/// from the Tauri `setup` hook (macOS/Windows) or the sidecar entry point
/// (Linux). Subsequent calls are no-ops — the first set wins.
///
/// Pass the full set of roots to scan (resource dir, app-data dir, etc.). The
/// dev-build anchor is added automatically by `resolve_plugin_roots` when the
/// override is `None`, so callers only need to supply the packaged paths.
pub(crate) fn set_plugin_roots(roots: Vec<PathBuf>) {
    let _ = PLUGIN_ROOTS.set(roots);
}

/// Loads plugin summaries from the resolved plugin roots, including inline i18n
/// bundles.
///
/// Summaries are cached for the process lifetime via a `Mutex<Option<>>` — the
/// first call loads from disk, subsequent calls return the cached result.
/// Stage 4's `reload_compat_plugins` resets this cache via
/// [`clear_plugin_caches`].
pub(crate) fn list_summaries(roots: &[PathBuf]) -> Vec<CompatPluginSummary> {
    let mut guard = CACHED_SUMMARIES
        .lock()
        .expect("compat plugin summaries cache mutex poisoned");
    if let Some(cached) = guard.as_ref() {
        return cached.clone();
    }
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
    let summaries = build_summaries_from_report(&report);
    *guard = Some(summaries.clone());
    summaries
}

/// Loads plugin summaries using the process-level resolved plugin roots.
/// This is the entry point for the `list_compat_plugins` host command and any
/// other caller that does not supply explicit roots.
pub(crate) fn list_summaries_from_resolved_roots() -> Vec<CompatPluginSummary> {
    list_summaries(&resolve_plugin_roots(None))
}

/// Clears all compat plugin caches: the summaries cache and the attached API
/// registry cache. Used by the stage 4 `reload_compat_plugins` host command's
/// manual reload button so that subsequent reads re-scan from disk.
pub(crate) fn clear_plugin_caches() {
    {
        let mut guard = CACHED_SUMMARIES
            .lock()
            .expect("compat plugin summaries cache mutex poisoned");
        *guard = None;
    }
    crate::domain::content_patcher::attached::clear_attached_api_cache();
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
                    source: page.source.as_ref().map(page_source_to_wire),
                    layout: page.layout.clone(),
                    sections: page.sections.iter().map(page_section_to_wire).collect(),
                    validations: page
                        .validations
                        .iter()
                        .map(page_validation_to_wire)
                        .collect(),
                })
                .collect();
            let page_ids = pages.iter().map(|page| page.id.clone()).collect();
            let asset_schemas = manifest
                .contributions
                .asset_schemas
                .iter()
                .map(asset_schema_to_wire)
                .collect();
            let condition_syntax = manifest
                .contributions
                .condition_syntax
                .iter()
                .map(condition_syntax_to_wire)
                .collect();
            CompatPluginSummary {
                id: manifest.id.clone(),
                name: manifest.name.clone(),
                format: manifest.format,
                has_code_entry: manifest.entry.is_some(),
                targets: manifest.targets.clone(),
                page_ids,
                pages,
                i18n,
                asset_schemas,
                condition_syntax,
                load_error: None,
                entry: manifest.entry.clone(),
                sdk_version: manifest.sdk_version.clone(),
            }
        })
        .collect()
}

/// Converts a `PageSourceDecl` into its serializable wire form.
fn page_source_to_wire(source: &PageSourceDecl) -> PageSourceWire {
    PageSourceWire {
        kind: source.kind.clone(),
        params: PageSourceParamsWire {
            entry_file: source.params.entry_file.clone(),
            entry_image: source.params.entry_image.clone(),
            root_subdir: source.params.root_subdir.clone(),
        },
    }
}

/// Converts a `PageSectionDecl` into its serializable wire form.
fn page_section_to_wire(section: &PageSectionDecl) -> PageSectionWire {
    PageSectionWire {
        title_key: section.title_key.clone(),
        fields: section.fields.iter().map(page_field_to_wire).collect(),
    }
}

/// Converts a `PageValidationDecl` into its serializable wire form.
fn page_validation_to_wire(validation: &PageValidationDecl) -> CompatPluginValidationWire {
    match validation {
        PageValidationDecl::RequireOneOf { paths, message_key } => {
            CompatPluginValidationWire::RequireOneOf {
                paths: paths.clone(),
                message_key: message_key.clone(),
            }
        }
    }
}

/// Converts a `PageFieldDecl` into its serializable wire form, recursing into
/// `record-list` sub-fields and `object` sub-fields.
fn page_field_to_wire(field: &PageFieldDecl) -> PageFieldWire {
    PageFieldWire {
        id: field.id.clone(),
        path: field.path.clone(),
        field_type: field.field_type.clone(),
        label_key: field.label_key.clone(),
        required: field.required,
        min: field.min,
        max: field.max,
        interval: field.interval,
        allow_values: field.allow_values.clone(),
        validate: field
            .validate
            .iter()
            .map(|v| PageFieldValidateWire {
                kind: v.kind.clone(),
                value: v.value.clone(),
            })
            .collect(),
        visible_when: field
            .visible_when
            .as_ref()
            .map(|v| PageFieldVisibleWhenWire {
                kind: v.kind.clone(),
                field: v.field.clone(),
                value: v.value.clone(),
                values: v.values.clone(),
            }),
        fields: field.fields.iter().map(page_field_to_wire).collect(),
        sub_fields: field.sub_fields.iter().map(page_field_to_wire).collect(),
    }
}

/// Converts an `AssetSchemaContribution` into its serializable wire form.
fn asset_schema_to_wire(schema: &AssetSchemaContribution) -> AssetSchemaWire {
    AssetSchemaWire {
        asset_path: schema.asset_path.clone(),
        fields: schema
            .fields
            .iter()
            .map(asset_schema_field_to_wire)
            .collect(),
    }
}

/// Converts an `AssetSchemaFieldDecl` into its serializable wire form.
fn asset_schema_field_to_wire(field: &AssetSchemaFieldDecl) -> AssetSchemaFieldWire {
    AssetSchemaFieldWire {
        id: field.id.clone(),
        path: field.path.clone(),
        field_type: field.field_type.clone(),
        label_key: field.label_key.clone(),
        description_key: field.description_key.clone(),
    }
}

/// Converts a `ConditionSyntaxContribution` into its serializable wire form.
fn condition_syntax_to_wire(syntax: &ConditionSyntaxContribution) -> ConditionSyntaxWire {
    ConditionSyntaxWire {
        namespace: syntax.namespace.clone(),
        keys: syntax
            .keys
            .iter()
            .map(condition_syntax_key_to_wire)
            .collect(),
    }
}

/// Converts a `ConditionSyntaxKeyDecl` into its serializable wire form.
fn condition_syntax_key_to_wire(key: &ConditionSyntaxKeyDecl) -> ConditionSyntaxKeyWire {
    ConditionSyntaxKeyWire {
        key: key.key.clone(),
        label_key: key.label_key.clone(),
        description_key: key.description_key.clone(),
    }
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
/// - Process-level roots set via `set_plugin_roots` at startup → those roots
///   (packaged build: resource_dir + app_data_dir; sidecar: cwd-relative).
/// - dev build → `<repo>/apps/desktop/compat-plugins/` (anchored on
///   `CARGO_MANIFEST_DIR`, which points at `apps/desktop/src-tauri`).
///
/// The process-level roots take precedence over the dev anchor so that
/// packaged builds find plugins in the bundled resource directory even when
/// the source tree happens to be present on the user's machine.
pub(crate) fn resolve_plugin_roots(plugin_root_override: Option<&str>) -> Vec<PathBuf> {
    if let Some(path) = plugin_root_override {
        return vec![PathBuf::from(path)];
    }

    // Packaged build: roots were set at app startup by the Tauri `setup` hook
    // or the sidecar entry point. This covers resource_dir and app_data_dir on
    // Tauri, and the cwd-relative resources path on the sidecar.
    if let Some(roots) = PLUGIN_ROOTS.get() {
        if !roots.is_empty() {
            return roots.clone();
        }
    }

    // Dev build anchor: CARGO_MANIFEST_DIR points at apps/desktop/src-tauri.
    let dev_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("compat-plugins");
    if dev_root.is_dir() {
        return vec![dev_root];
    }

    Vec::new()
}

// ── plugin:// protocol path resolver (stage 3) ──────────────────────────────

/// Asset extensions whitelisted for the `plugin://` protocol. Requests for
/// files outside this set are rejected with a 404.
pub(crate) const PLUGIN_ASSET_EXTENSIONS: &[&str] =
    &["js", "json", "png", "jpg", "webp", "svg", "css"];

/// Resolves a `plugin://<pluginId>/<relativePath>` URL to an absolute file
/// path.
///
/// Scans every root returned by [`resolve_plugin_roots`] for a child directory
/// named `<pluginId>`, then joins `relativePath` and lexically normalizes the
/// result. Returns `None` when:
/// - `relativePath` is absolute or UNC,
/// - `relativePath` contains a `..` segment that escapes the plugin directory,
/// - the file extension is not in [`PLUGIN_ASSET_EXTENSIONS`],
/// - no root contains a `<pluginId>` directory.
///
/// The returned path is guaranteed to start with the plugin directory; no
/// filesystem canonicalization is performed, so the file need not exist yet.
pub(crate) fn resolve_plugin_protocol_path(
    plugin_id: &str,
    relative_path: &str,
) -> Option<PathBuf> {
    resolve_plugin_protocol_path_in_roots(&resolve_plugin_roots(None), plugin_id, relative_path)
}

/// Root-scoped variant of [`resolve_plugin_protocol_path`] for unit tests that
/// need to supply explicit roots without touching the process-level
/// `PLUGIN_ROOTS` OnceLock.
fn resolve_plugin_protocol_path_in_roots(
    roots: &[PathBuf],
    plugin_id: &str,
    relative_path: &str,
) -> Option<PathBuf> {
    let cleaned_relative = clean_input_path(relative_path);

    // Reject absolute paths: leading slash (Unix-style or Windows root-relative),
    // drive letters, and UNC paths. `Path::is_absolute()` alone is insufficient
    // on Windows because `/foo` (no drive prefix) is not considered absolute.
    let cleaned_str = cleaned_relative.to_string_lossy();
    if cleaned_relative.is_absolute()
        || cleaned_str.starts_with('/')
        || cleaned_str.starts_with('\\')
    {
        return None;
    }

    // Validate extension whitelist before touching the filesystem.
    let ext = cleaned_relative
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some(e) if PLUGIN_ASSET_EXTENSIONS.contains(&e) => {}
        _ => return None,
    }

    let cleaned_id = clean_input_path(plugin_id);
    if cleaned_id.as_os_str().is_empty() {
        return None;
    }

    for root in roots {
        let plugin_dir = root.join(&cleaned_id);
        if !plugin_dir.is_dir() {
            continue;
        }

        // Lexically normalize the joined path, rejecting `..` that escapes
        // `plugin_dir` and any absolute/prefix component inside the relative
        // segment.
        let joined = plugin_dir.join(&cleaned_relative);
        let normalized = lexically_normalize_within(&joined, &plugin_dir)?;
        return Some(normalized);
    }

    None
}

/// Lexically normalizes `joined` relative to `base`, rejecting any `..`
/// segment that would escape `base`. No filesystem access is performed.
fn lexically_normalize_within(joined: &Path, base: &Path) -> Option<PathBuf> {
    let base_len = base.components().count();
    let mut normalized = base.to_path_buf();

    for component in joined.components().skip(base_len) {
        match component {
            std::path::Component::Normal(segment) => normalized.push(segment),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if normalized == *base {
                    return None;
                }
                if !normalized.pop() {
                    return None;
                }
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => return None,
        }
    }

    if normalized.starts_with(base) {
        Some(normalized)
    } else {
        None
    }
}

// ── directory-pack entry I/O (stage 2) ──────────────────────────────────────

/// One entry summary returned by `list_directory_pack_entries`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatPluginEntrySummary {
    /// Entry id (the subdirectory name under `<root_subdir>`).
    pub id: String,
    /// Absolute path to the entry's directory.
    pub entry_dir: String,
    /// Absolute path to the entry file (e.g. `texture.json`).
    pub entry_file_path: String,
    /// Absolute path to the companion image file if it exists.
    pub entry_image_path: Option<String>,
}

/// Request to read one directory-pack entry's JSON content.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadCompatPluginEntryRequest {
    /// Absolute path to the target mod's root directory.
    pub mod_root: String,
    /// Subdirectory within the mod root containing entries.
    pub root_subdir: String,
    /// Entry id (subdirectory name under `<root_subdir>`).
    pub entry_id: String,
    /// Entry file name (e.g. "texture.json").
    pub entry_file: String,
}

/// Result of reading one directory-pack entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadCompatPluginEntryResult {
    /// Absolute path to the entry file that was read.
    pub entry_file_path: String,
    /// Raw JSON content of the entry file, parsed into a `serde_json::Value`.
    pub content: serde_json::Value,
}

/// Request to write one directory-pack entry's JSON content.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteCompatPluginEntryRequest {
    /// Absolute path to the target mod's root directory.
    pub mod_root: String,
    /// Subdirectory within the mod root containing entries.
    pub root_subdir: String,
    /// Entry id (subdirectory name under `<root_subdir>`).
    pub entry_id: String,
    /// Entry file name (e.g. "texture.json").
    pub entry_file: String,
    /// JSON content to write.
    pub content: serde_json::Value,
}

/// Validates that a resolved path stays within the expected base directory.
/// Returns the canonicalized path if safe, or an error string if the path
/// escapes the base (via `..`, absolute path, or symlink escape).
fn ensure_path_within(base: &Path, resolved: &Path) -> Result<PathBuf, String> {
    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base directory {}: {e}", base.display()))?;
    let canonical_resolved = resolved
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path {}: {e}", resolved.display()))?;
    if !canonical_resolved.starts_with(&canonical_base) {
        return Err(format!(
            "Path traversal detected: {} escapes base directory {}",
            resolved.display(),
            canonical_base.display()
        ));
    }
    Ok(canonical_resolved)
}

/// Validates an entry id: must be a simple directory name (no path separators,
/// no `..`, no empty).
fn validate_entry_id(entry_id: &str) -> Result<(), String> {
    if entry_id.is_empty() {
        return Err("Entry id must not be empty".to_string());
    }
    if entry_id.contains('/') || entry_id.contains('\\') || entry_id == ".." || entry_id == "." {
        return Err(format!("Invalid entry id: {entry_id}"));
    }
    Ok(())
}

/// Validates a file name: must be a simple file name (no path separators,
/// no `..`).
fn validate_file_name(file_name: &str) -> Result<(), String> {
    if file_name.is_empty() {
        return Err("File name must not be empty".to_string());
    }
    if file_name.contains('/') || file_name.contains('\\') || file_name == ".." || file_name == "."
    {
        return Err(format!("Invalid file name: {file_name}"));
    }
    Ok(())
}

/// Lists pack entries under a directory-pack source. Scans
/// `<mod_root>/<root_subdir>` for subdirectories containing the declared entry
/// file, returning one summary per entry. Non-directory entries and
/// subdirectories without the entry file are skipped.
pub(crate) fn list_directory_pack_entries(
    request: &crate::domain::modding::commands::ListCompatPluginEntriesRequest,
) -> Vec<CompatPluginEntrySummary> {
    let mod_root = clean_input_path(&request.mod_root);
    let root_subdir = request.root_subdir.trim();
    let entry_file = request.entry_file.trim();

    if let Err(reason) = validate_file_name(entry_file) {
        log::warn!(
            target: targets::APP_UI,
            "{}",
            LogEvent::new("compatPlugin.listEntriesInvalidParams")
                .field("reason", &reason)
                .render()
        );
        return Vec::new();
    }

    let entries_dir = mod_root.join(root_subdir);
    if !entries_dir.is_dir() {
        return Vec::new();
    }

    let Ok(entries_canonical) = entries_dir.canonicalize() else {
        return Vec::new();
    };

    let mut summaries = Vec::new();
    let Ok(read_dir) = std::fs::read_dir(&entries_canonical) else {
        return Vec::new();
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let entry_id = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let entry_file_path = path.join(entry_file);
        if !entry_file_path.is_file() {
            continue;
        }
        let entry_image_path = request
            .entry_image
            .as_deref()
            .map(|img| path.join(img))
            .filter(|p| p.is_file())
            .map(|p| normalize_path(&p));
        summaries.push(CompatPluginEntrySummary {
            id: entry_id,
            entry_dir: normalize_path(&path),
            entry_file_path: normalize_path(&entry_file_path),
            entry_image_path,
        });
    }
    summaries.sort_by(|a, b| a.id.cmp(&b.id));
    summaries
}

/// Reads one directory-pack entry's JSON content. Path traversal is blocked
/// by `ensure_path_within`.
pub(crate) fn read_directory_pack_entry(
    request: ReadCompatPluginEntryRequest,
) -> Result<ReadCompatPluginEntryResult, String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_entry_id(&request.entry_id)?;
    validate_file_name(&request.entry_file)?;

    let entries_dir = mod_root.join(request.root_subdir.trim());
    let entry_file_path = entries_dir
        .join(&request.entry_id)
        .join(&request.entry_file);

    let canonical_path = ensure_path_within(&mod_root, &entry_file_path)?;

    let raw = std::fs::read_to_string(&canonical_path).map_err(|e| {
        format!(
            "Failed to read entry file {}: {e}",
            canonical_path.display()
        )
    })?;
    let content: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse entry file as JSON: {e}"))?;

    Ok(ReadCompatPluginEntryResult {
        entry_file_path: normalize_path(&canonical_path),
        content,
    })
}

/// Writes one directory-pack entry's JSON content. The write is atomic: write
/// to a temp file in the same directory, then rename. Path traversal is
/// blocked by `ensure_path_within`.
pub(crate) fn write_directory_pack_entry(
    request: WriteCompatPluginEntryRequest,
) -> Result<(), String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_entry_id(&request.entry_id)?;
    validate_file_name(&request.entry_file)?;

    let entries_dir = mod_root.join(request.root_subdir.trim());
    let entry_dir = entries_dir.join(&request.entry_id);

    // Ensure the entry directory exists.
    std::fs::create_dir_all(&entry_dir).map_err(|e| {
        format!(
            "Failed to create entry directory {}: {e}",
            entry_dir.display()
        )
    })?;

    // Validate that the entry directory stays within the mod root (path traversal
    // protection). We canonicalize the directory (which now exists) rather than
    // the file (which may not exist yet).
    let canonical_entry_dir = ensure_path_within(&mod_root, &entry_dir)?;
    let canonical_path = canonical_entry_dir.join(&request.entry_file);

    let json = serde_json::to_string_pretty(&request.content)
        .map_err(|e| format!("Failed to serialize entry content: {e}"))?;

    // Atomic write: write to temp file then rename.
    let temp_path = canonical_path.with_extension("tmp");
    std::fs::write(&temp_path, &json)
        .map_err(|e| format!("Failed to write temp file {}: {e}", temp_path.display()))?;
    std::fs::rename(&temp_path, &canonical_path).map_err(|e| {
        format!(
            "Failed to rename temp file to {}: {e}",
            canonical_path.display()
        )
    })?;

    Ok(())
}

#[cfg(test)]
#[path = "../../tests/unit/domain/modding/compat_plugin_tests.rs"]
mod tests;
