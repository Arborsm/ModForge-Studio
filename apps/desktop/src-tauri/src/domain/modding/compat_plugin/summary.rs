//! Compat plugin summary builder: converts loaded manifests into wire-form
//! summaries and loads inline i18n bundles.

use std::path::Path;

use super::lifecycle::is_plugin_disabled;
use super::types::*;

/// Leaks a runtime string into a `&'static str` for the descriptor's static id
/// field. Plugin manifests are loaded once at startup and live for the process
/// lifetime, so this is bounded and intentional.
pub(super) fn leak_static(value: &str) -> &'static str {
    let boxed = value.to_string().into_boxed_str();
    Box::leak(boxed)
}

/// Builds summaries from an already-loaded manifest report. Extracted from
/// `list_summaries` so unit tests can exercise the summary construction and
/// i18n loading without the process-level `OnceLock` cache.
///
/// Manifest load failures (`report.errors`) are surfaced as placeholder
/// summaries carrying the failure reason in `load_error`. The placeholder uses
/// the plugin directory's file name as both `id` and `name` (the manifest could
/// not be parsed, so the canonical id is unavailable) and has empty pages /
/// i18n / schemas, so it is visible in the plugin manager's error filter and
/// error row but registers no workbench modules. Without this, manifest
/// validation failures were silently dropped and the frontend's `loadError`
/// filter / failure-count / inline-error UI was dead logic.
pub(crate) fn build_summaries_from_report(report: &PluginLoadReport) -> Vec<CompatPluginSummary> {
    let mut summaries: Vec<CompatPluginSummary> = report
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
            let capabilities = manifest.contributions.capabilities.clone();
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
                capabilities,
                load_error: None,
                entry: manifest.entry.clone(),
                styles: manifest.styles.clone(),
                sdk_version: manifest.sdk_version.clone(),
                description: manifest.description.clone(),
                author: manifest.author.clone(),
                version: manifest.version.clone(),
                category: manifest.category.clone(),
                tags: manifest.tags.clone(),
                disabled: is_plugin_disabled(&manifest.plugin_dir),
            }
        })
        .collect();

    // Append placeholder summaries for failed manifest loads so the plugin
    // manager can surface them instead of silently dropping the failure.
    for error in &report.errors {
        let dir_name = std::path::Path::new(&error.plugin_dir)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        summaries.push(CompatPluginSummary {
            id: error.plugin_id.clone().unwrap_or_else(|| dir_name.clone()),
            name: dir_name,
            format: 0,
            has_code_entry: false,
            targets: Vec::new(),
            page_ids: Vec::new(),
            pages: Vec::new(),
            i18n: PluginI18nBundle::default(),
            asset_schemas: Vec::new(),
            condition_syntax: Vec::new(),
            capabilities: Vec::new(),
            load_error: Some(error.reason.clone()),
            entry: None,
            styles: None,
            sdk_version: None,
            description: None,
            author: None,
            version: None,
            category: None,
            tags: Vec::new(),
            disabled: false,
        });
    }

    summaries
}

/// Converts a `PageSourceDecl` into its serializable wire form.
fn page_source_to_wire(source: &PageSourceDecl) -> PageSourceWire {
    PageSourceWire {
        kind: source.kind.clone(),
        params: PageSourceParamsWire {
            entry_file: source.params.entry_file.clone(),
            entry_image: source.params.entry_image.clone(),
            root_subdir: source.params.root_subdir.clone(),
            include_content_packs: source.params.include_content_packs,
        },
    }
}

/// Converts a `PageSectionDecl` into its serializable wire form.
fn page_section_to_wire(section: &PageSectionDecl) -> PageSectionWire {
    PageSectionWire {
        title_key: section.title_key.clone(),
        collapsed: section.collapsed,
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
        id_path: field.id_path.clone(),
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
