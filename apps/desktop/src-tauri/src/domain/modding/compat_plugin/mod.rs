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
//!
//! This module is split into sub-modules:
//! - [`types`] — all struct/enum/type/const definitions.
//! - [`manifest`] — manifest loading and validation.
//! - [`lifecycle`] — root resolution, caching, disable/delete and built-in
//!   archive extraction.
//! - [`summary`] — summary construction, wire conversion and i18n loading.
//! - [`protocol`] — `plugin://` protocol path resolver.
//! - [`directory_pack`] — directory-pack entry I/O (stage 2).
//!
//! All public items are re-exported here so external callers can continue to
//! reference them as `crate::domain::modding::compat_plugin::X`.

mod directory_pack;
mod lifecycle;
mod manifest;
mod protocol;
mod summary;
mod types;

// ── re-exports: types ───────────────────────────────────────────────────────

#[allow(unused_imports)]
pub(crate) use types::{
    AssetSchemaContribution, AssetSchemaFieldDecl, AssetSchemaFieldWire, AssetSchemaWire,
    AttachedApiContribution, AttachedApiTargetDecl, CURRENT_MANIFEST_FORMAT,
    CompatPluginContributions, CompatPluginManifest, CompatPluginPageSummary, CompatPluginSummary,
    CompatPluginValidationWire, ConditionSyntaxContribution, ConditionSyntaxKeyDecl,
    ConditionSyntaxKeyWire, ConditionSyntaxWire, PageContribution, PageFieldDecl,
    PageFieldValidateDecl, PageFieldValidateWire, PageFieldVisibleWhenDecl,
    PageFieldVisibleWhenWire, PageFieldWire, PageNavigationDecl, PageSectionDecl, PageSectionWire,
    PageSourceDecl, PageSourceParams, PageSourceParamsWire, PageSourceWire, PageValidationDecl,
    PluginI18nBundle, PluginLoadError, PluginLoadReport,
};

// ── re-exports: manifest ─────────────────────────────────────────────────────

pub(crate) use manifest::load_plugin_manifests;

// ── re-exports: lifecycle ────────────────────────────────────────────────────

#[allow(unused_imports)]
pub(crate) use lifecycle::{
    clear_plugin_caches, delete_plugin, delete_plugin_in_roots, extract_builtin_plugins_if_needed,
    get_plugin_roots, is_plugin_disabled, list_summaries, list_summaries_from_resolved_roots,
    resolve_plugin_roots, set_plugin_disabled, set_plugin_disabled_in_roots, set_plugin_roots,
};

// Test-only re-exports: these private helpers are accessed by the test module
// via `super::`. A plain `use` re-export keeps them private to `compat_plugin`
// while still being visible to child modules (tests).
#[allow(unused_imports)]
use lifecycle::find_plugin_dir_in_roots;

// ── re-exports: summary ──────────────────────────────────────────────────────

#[allow(unused_imports)]
pub(crate) use summary::build_summaries_from_report;

// ── re-exports: protocol ─────────────────────────────────────────────────────

#[allow(unused_imports)]
pub(crate) use protocol::{
    PLUGIN_ASSET_EXTENSIONS, plugin_asset_content_type, resolve_plugin_protocol_path,
};

#[allow(unused_imports)]
use protocol::resolve_plugin_protocol_path_in_roots;

// ── re-exports: directory_pack ───────────────────────────────────────────────

pub(crate) use directory_pack::{
    CompatPluginEntrySummary, ReadCompatPluginEntryRequest, ReadCompatPluginEntryResult,
    WriteCompatPluginEntryRequest, list_directory_pack_entries, read_directory_pack_entry,
    write_directory_pack_entry,
};

#[cfg(test)]
#[path = "../../../tests/unit/domain/modding/compat_plugin_tests.rs"]
mod tests;
