//! Compat plugin manifest loader and validator (format 1).
//!
//! Scans plugin roots for `manifest.json` files, parses and validates each
//! against the 9-rule table, and returns a report of successful manifests plus
//! per-plugin errors. A bad plugin never affects other plugins.

use std::path::{Path, PathBuf};

use crate::support::logging::event::LogEvent;
use crate::support::logging::event::targets;

use super::types::{
    CAPABILITY_ID_PATTERN, CURRENT_MANIFEST_FORMAT, CompatPluginManifest, PLUGIN_ID_PATTERN,
    PageFieldDecl, PluginLoadError, PluginLoadReport,
};

/// Loads and validates all `manifest.json` files found under the given roots.
///
/// Each root is scanned for immediate child directories containing a
/// `manifest.json`. A parse or validation failure for one plugin is recorded in
/// `errors` and does not affect the others. The same plugin id appearing in
/// multiple roots is deduplicated: the first (highest-priority) root wins and
/// later duplicates are logged with `compatPlugin.duplicateId`.
pub(crate) fn load_plugin_manifests(roots: &[PathBuf]) -> PluginLoadReport {
    let mut report = PluginLoadReport::default();
    let id_re = regex::Regex::new(PLUGIN_ID_PATTERN).expect("plugin id regex is valid");
    let capability_id_re =
        regex::Regex::new(CAPABILITY_ID_PATTERN).expect("capability id regex is valid");
    // Roots are priority-ordered (user data dir first, bundled source tree
    // second); the same plugin id can appear in multiple roots (e.g. the
    // built-in sync copies plugins into the data dir while the dev source
    // tree is also scanned). First occurrence wins; later duplicates are
    // skipped so consumers never see the same plugin twice.
    let mut seen_ids = std::collections::HashSet::new();

    for root in roots {
        let entries = match std::fs::read_dir(root) {
            Ok(entries) => entries,
            Err(error) => {
                LogEvent::new("compatPlugin.scanRoot")
                    .field("root", root.display())
                    .field("error", error.to_string())
                    .emit_warn(targets::APP_UI);
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
            match load_single_manifest(&manifest_path, &path, &id_re, &capability_id_re) {
                Ok(manifest) => {
                    if !seen_ids.insert(manifest.id.clone()) {
                        LogEvent::new("compatPlugin.duplicateId")
                            .field("pluginDir", plugin_dir)
                            .field("pluginId", manifest.id)
                            .emit_warn(targets::APP_UI);
                        continue;
                    }
                    report.manifests.push(manifest);
                }
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
    capability_id_re: &regex::Regex,
) -> Result<CompatPluginManifest, String> {
    let raw = std::fs::read_to_string(manifest_path)
        .map_err(|error| format!("read manifest.json failed: {error}"))?;
    let mut manifest: CompatPluginManifest = serde_json::from_str(&raw)
        .map_err(|error| format!("parse manifest.json failed: {error}"))?;
    validate_manifest(&manifest, plugin_dir, id_re, capability_id_re)?;
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
    capability_id_re: &regex::Regex,
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

    // V5b: styles is a code-package companion: it requires a code entry, must
    // be a .css file and must exist inside the plugin directory.
    if let Some(styles) = manifest.styles.as_deref() {
        if !has_entry {
            return Err("styles requires a code entry (entry + sdkVersion)".to_string());
        }
        if Path::new(styles).extension().and_then(|ext| ext.to_str()) != Some("css") {
            return Err(format!("styles must be a .css file: {styles}"));
        }
        let styles_path = plugin_dir.join(styles);
        if !styles_path.is_file() {
            return Err(format!("styles file not found: {styles}"));
        }
    }

    // V6: at least one contribution channel non-empty. A code entry counts on
    // its own: code packages register pages via `activate(ctx)` at runtime, so
    // their manifest legitimately has no `contributions` keys (and must NOT
    // re-declare pages — the frontend skips manifest pages for code plugins to
    // avoid double registration).
    let has_contrib = has_entry
        || manifest.contributions.attached_api.is_some()
        || !manifest.contributions.pages.is_empty()
        || !manifest.contributions.asset_schemas.is_empty()
        || !manifest.contributions.condition_syntax.is_empty()
        || !manifest.contributions.capabilities.is_empty();
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

    // V8: capabilities references — each declared id must be non-blank and a
    // valid kebab-case lowercase identifier. The frontend resolves declared ids
    // against its capability registry, so a typo or an out-of-registry id must
    // fail at scan time instead of silently returning undefined at runtime.
    if manifest
        .contributions
        .capabilities
        .iter()
        .any(|id| !capability_id_re.is_match(id))
    {
        return Err(
            "capabilities must be a list of non-empty kebab-case lowercase ids".to_string(),
        );
    }

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
    "game-item",
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

    // idPath is only valid for game-item fields.
    if field.id_path.is_some() && field.field_type != "game-item" {
        return Err(format!(
            "page {} field {} declares idPath but type is {} (idPath requires type game-item)",
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
