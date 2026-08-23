//! Compat plugin manifest type definitions (format 1).
//!
//! All struct/enum/type/const definitions live here so the manifest loader,
//! lifecycle, summary builder and protocol resolver can share them without
//! re-declaring wire shapes.

use serde::{Deserialize, Serialize};

use crate::domain::modding::attached_api::{AttachedApiDescriptor, AttachedApiTargetDescriptor};

use super::lifecycle::is_plugin_disabled;
use super::summary::leak_static;

/// Manifest format version. Unknown versions are rejected (rule V1).
pub(crate) const CURRENT_MANIFEST_FORMAT: u32 = 1;

/// Plugin id pattern (rule V2): lowercase alphanumeric with dots/dashes, must
/// match the directory name.
pub(super) const PLUGIN_ID_PATTERN: &str = r"^[a-z0-9][a-z0-9.-]*$";

/// Host capability id pattern (rule V8): kebab-case lowercase identifier.
/// Builtin capability ids (`plugin.id`, `host.locale`, ...) are host-internal
/// and never declared in a manifest, so dots are not allowed here.
pub(super) const CAPABILITY_ID_PATTERN: &str = r"^[a-z][a-z0-9-]*$";

/// A loaded compat plugin manifest (format 1).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CompatPluginManifest {
    pub format: u32,
    pub id: String,
    /// Display name; consumed by `CompatPluginSummary` in stage 1.
    #[allow(dead_code)]
    pub name: String,
    /// Optional human-readable description shown in the plugin manager.
    #[serde(default)]
    pub description: Option<String>,
    /// Optional author name shown in the plugin manager.
    #[serde(default)]
    pub author: Option<String>,
    /// Optional plugin version string (e.g. "1.0.0").
    #[serde(default)]
    pub version: Option<String>,
    /// Optional category for grouping in the plugin manager (e.g. "visual",
    /// "gameplay", "library").
    #[serde(default)]
    pub category: Option<String>,
    /// Optional tags for search/filter in the plugin manager.
    #[serde(default)]
    pub tags: Vec<String>,
    pub sdk_version: Option<String>,
    pub entry: Option<String>,
    /// Optional stylesheet path relative to the plugin root (e.g.
    /// "styles.css"). Code packages only: the host fetches it over the
    /// plugin:// protocol and injects it as a scoped <style> element.
    #[serde(default)]
    pub styles: Option<String>,
    pub targets: Vec<String>,
    pub contributions: CompatPluginContributions,
    /// On-disk plugin directory; set by the loader after parsing (not
    /// deserialized from JSON). Used to read i18n bundles and entry files.
    #[serde(skip)]
    pub plugin_dir: std::path::PathBuf,
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
    /// Referenced host capability ids in `contributions.capabilities`. Each id
    /// must be non-blank and match `CAPABILITY_ID_PATTERN` (rule V8); the
    /// frontend resolves declared ids against its capability registry.
    #[serde(default)]
    pub capabilities: Vec<String>,
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
    /// Whether to also aggregate entries from installed content packs whose
    /// `ContentPackFor` UniqueID targets this mod.
    #[serde(default)]
    pub include_content_packs: Option<bool>,
}

/// `contributions.pages[].sections[]` — grouped field descriptors.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSectionDecl {
    pub title_key: String,
    /// When true, the section renders collapsed by default (advanced fields).
    #[serde(default)]
    pub collapsed: Option<bool>,
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
    /// For `game-item` fields: optional secondary path that receives the picked
    /// item's unqualified id (e.g. AT's `ItemId` alongside `ItemName`).
    #[serde(default)]
    pub id_path: Option<String>,
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
    /// Referenced host capability ids declared in `contributions.capabilities`.
    /// The frontend resolves them against its capability registry; undeclared
    /// ids are invisible to a plugin's `capabilities.get`.
    #[serde(default)]
    pub capabilities: Vec<String>,
    pub load_error: Option<String>,
    /// Code-package entry file path relative to plugin root (e.g. "index.js");
    /// null for data-pack plugins.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry: Option<String>,
    /// Optional stylesheet path relative to plugin root (e.g. "styles.css");
    /// only present for code packages that declare one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub styles: Option<String>,
    /// SDK version declared in manifest (e.g. "1.0.0"); null for data-pack
    /// plugins.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdk_version: Option<String>,
    /// Optional human-readable description from the manifest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Optional author name from the manifest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    /// Optional plugin version string from the manifest.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Optional category for grouping in the plugin manager.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Optional tags for search/filter.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Whether the plugin is currently disabled (skips registration). Managed
    /// by a `.disabled` marker file in the plugin directory.
    #[serde(default)]
    pub disabled: bool,
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
    #[serde(default)]
    pub include_content_packs: Option<bool>,
}

/// Wire form of `PageSectionDecl`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PageSectionWire {
    pub title_key: String,
    #[serde(default)]
    pub collapsed: Option<bool>,
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
    /// For `game-item` fields: optional secondary path receiving the picked item's unqualified id.
    #[serde(default)]
    pub id_path: Option<String>,
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
pub(super) const SUPPORTED_LOCALES: &[&str] = &["zh-CN", "en-US"];

impl PluginLoadReport {
    /// Converts all loaded `attachedApi` contributions into descriptors for the
    /// `AttachedApiRegistry`. Invalid or missing contributions are skipped (they
    /// are already in `errors`). Disabled plugins (those with a `.disabled`
    /// marker in their directory) are also skipped so their attached API
    /// compatibility behavior does not apply while disabled.
    pub(crate) fn to_attached_api_descriptors(&self) -> Vec<AttachedApiDescriptor> {
        self.manifests
            .iter()
            .filter(|manifest| !is_plugin_disabled(&manifest.plugin_dir))
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
