use super::CONFIG_FILE_NAME;
use super::probe_merge::{configured_probe_paths, merge_probe_fields, normalized_config_key};
use super::schema::{
    ConfigTranslations, canonical_mod_root, child_file, fields_from_config_json,
    fields_from_cp_schema, fields_from_options_schema, humanize_config_key, json_object_or_empty,
    load_config_translations, looks_like_translation_key, sorted_sources, translated_text,
};
use crate::domain::app_paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::{
    LauncherModConfigField, LauncherModConfigFieldType, LauncherModConfigProbeStatus,
    LauncherModConfigResult, LauncherModConfigSource, LauncherModConfigUiHint,
    LoadLauncherModConfigRequest, SaveLauncherModConfigRequest,
};
use crate::infrastructure::fs::pathing::normalize_path;
use crate::support::logging::{LogEvent, targets};
use anyhow::Context;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

fn looks_like_color_literal(value: &Value) -> bool {
    match value {
        Value::Object(object) => {
            let has_channel = |name: &str| {
                object
                    .iter()
                    .any(|(key, value)| key.eq_ignore_ascii_case(name) && value.is_number())
            };
            has_channel("r") && has_channel("g") && has_channel("b")
        }
        Value::String(value) => {
            let trimmed = value.trim();
            let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
            matches!(hex.len(), 3 | 4 | 6 | 8)
                && hex.chars().all(|character| character.is_ascii_hexdigit())
                || trimmed.to_ascii_lowercase().starts_with("rgb(")
                || ["r:", "g:", "b:"]
                    .iter()
                    .all(|marker| trimmed.to_ascii_lowercase().contains(marker))
        }
        _ => false,
    }
}

fn looks_like_keybind_value(value: &Value) -> bool {
    let Value::String(value) = value else {
        return false;
    };
    let value = value.trim();
    if value.eq_ignore_ascii_case("none") || value.eq_ignore_ascii_case("sbutton.none") {
        return true;
    }
    if value.len() == 1
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return true;
    }
    let compact = value.to_ascii_lowercase().replace([' ', '-', '_'], "");
    compact.starts_with("left")
        || compact.starts_with("right")
        || compact.starts_with("numpad")
        || compact.starts_with("mouse")
        || compact.starts_with('f')
            && compact[1..]
                .chars()
                .all(|character| character.is_ascii_digit())
        || matches!(
            compact.as_str(),
            "up" | "down"
                | "left"
                | "right"
                | "space"
                | "enter"
                | "escape"
                | "tab"
                | "backspace"
                | "delete"
        )
}

fn localize_field_copy(
    fields: &mut [LauncherModConfigField],
    translations: &ConfigTranslations,
    warnings: &mut Vec<String>,
) {
    let mut unresolved = BTreeSet::new();
    for field in fields {
        if looks_like_translation_key(&field.label) {
            if let Some(label) = translated_text(translations, &field.label) {
                field.label = label;
            } else {
                unresolved.insert(field.label.clone());
                field.label = humanize_config_key(&field.key);
            }
        }

        if let Some(description) = field.description.as_deref().map(str::trim) {
            if looks_like_translation_key(description) {
                if let Some(value) = translated_text(translations, description).or_else(|| {
                    translated_text(translations, &format!("GMCM.Options.{}.ToolTip", field.key))
                }) {
                    field.description = Some(value);
                } else {
                    unresolved.insert(description.to_string());
                    field.description = None;
                }
            }
        }

        if let Some(section) = field.section.as_deref().map(str::trim) {
            let page_key = format!("GMCM.PageTitle.{section}");
            if let Some(value) = translated_text(translations, section)
                .or_else(|| translated_text(translations, &page_key))
            {
                field.section = Some(value);
            } else if section.chars().all(|character| character.is_ascii_digit()) {
                field.section = None;
            } else if looks_like_translation_key(section) {
                unresolved.insert(section.to_string());
                field.section = None;
            }
        }
    }

    if !unresolved.is_empty() {
        warnings.push(format!(
            "Unresolved config translation keys: {}",
            unresolved
                .into_iter()
                .take(12)
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
}

fn normalize_fields(mut fields: Vec<LauncherModConfigField>) -> Vec<LauncherModConfigField> {
    for field in &mut fields {
        if field.ui_hint.is_some() {
            continue;
        }

        let compact_key = field
            .key
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .flat_map(char::to_lowercase)
            .collect::<String>();
        let string_like = matches!(
            field.field_type,
            LauncherModConfigFieldType::String | LauncherModConfigFieldType::StringArray
        );
        let color_like = field.allow_values.is_empty()
            && looks_like_color_literal(&field.value)
            && matches!(
                field.field_type,
                LauncherModConfigFieldType::String | LauncherModConfigFieldType::Object
            )
            && (compact_key.ends_with("color") || compact_key.ends_with("colour"));
        let gmcm_keybind_list = field.source == LauncherModConfigSource::GenericModConfigMenu
            && matches!(field.field_type, LauncherModConfigFieldType::StringArray)
            && field.allow_values.is_empty();
        let keybind_like = string_like
            && (compact_key.contains("keybind")
                || compact_key.contains("hotkey")
                || compact_key.ends_with("keys")
                || gmcm_keybind_list
                || (compact_key.ends_with("key")
                    && (looks_like_keybind_value(&field.value)
                        || ["open", "menu", "toggle", "activate", "shortcut"]
                            .iter()
                            .any(|marker| compact_key.contains(marker)))));
        let item_like = string_like
            && (compact_key == "item"
                || compact_key == "items"
                || compact_key.ends_with("itemid")
                || compact_key.ends_with("itemids")
                || compact_key.ends_with("itemname")
                || compact_key.ends_with("itemnames"));
        let item_list_like = matches!(field.field_type, LauncherModConfigFieldType::StringArray)
            || compact_key == "items"
            || compact_key.ends_with("itemids")
            || compact_key.ends_with("itemnames");

        field.ui_hint = if color_like {
            Some(LauncherModConfigUiHint::Color)
        } else if keybind_like {
            Some(
                if matches!(field.field_type, LauncherModConfigFieldType::StringArray) {
                    LauncherModConfigUiHint::KeybindList
                } else {
                    LauncherModConfigUiHint::Keybind
                },
            )
        } else if item_like {
            Some(if item_list_like {
                LauncherModConfigUiHint::ItemList
            } else {
                LauncherModConfigUiHint::Item
            })
        } else {
            None
        };
    }

    fields.sort_by(|left, right| {
        left.section
            .cmp(&right.section)
            .then_with(|| left.label.cmp(&right.label))
            .then_with(|| left.key.cmp(&right.key))
    });
    fields
}

fn summarize_probe_diagnostics(diagnostics: Option<&Value>, key: &str) -> String {
    const ITEM_LIMIT: usize = 8;
    const CHARACTER_LIMIT: usize = 280;

    let values = diagnostics
        .and_then(|value| value.get(key))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>();
    let mut summary = values
        .iter()
        .take(ITEM_LIMIT)
        .map(|value| {
            value
                .replace(['\r', '\n'], " ")
                .chars()
                .take(CHARACTER_LIMIT)
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join(" | ");
    if values.len() > ITEM_LIMIT {
        summary.push_str(&format!(" | +{} more", values.len() - ITEM_LIMIT));
    }
    summary
}

pub fn load_launcher_mod_config(
    request: LoadLauncherModConfigRequest,
) -> anyhow::Result<LauncherModConfigResult> {
    let root = canonical_mod_root(&request.mod_path)?;
    let config_path = child_file(&root, CONFIG_FILE_NAME)?;
    let config_exists = config_path.is_file();
    let current_config = json_object_or_empty(&config_path)?;
    let mut warnings = Vec::new();
    let configured_paths = configured_probe_paths();
    let translations = load_config_translations(&root, request.locale.as_deref(), &mut warnings);

    let mut fields = fields_from_cp_schema(&root, &current_config, &mut warnings);
    let existing_keys = fields
        .iter()
        .map(|field| normalized_config_key(&field.key))
        .collect::<BTreeSet<_>>();
    fields.extend(fields_from_options_schema(
        &root,
        &current_config,
        &existing_keys,
        &translations,
        &mut warnings,
    ));
    let gmcm_parsing_enabled = launcher_settings_path()
        .ok()
        .as_deref()
        .is_none_or(gmcm_parsing_enabled_at_path);
    let (probe_status, probe_diagnostics) = if gmcm_parsing_enabled {
        merge_probe_fields(
            &root,
            configured_paths.game_path.as_deref(),
            configured_paths.mods_root.as_deref(),
            &current_config,
            &mut fields,
            &mut warnings,
        )
    } else {
        (LauncherModConfigProbeStatus::NotRun, None)
    };
    let existing_keys = fields
        .iter()
        .map(|field| normalized_config_key(&field.key))
        .collect::<BTreeSet<_>>();
    fields.extend(fields_from_config_json(&current_config, &existing_keys));
    if matches!(
        probe_status,
        LauncherModConfigProbeStatus::Unavailable
            | LauncherModConfigProbeStatus::Failed
            | LauncherModConfigProbeStatus::TimedOut
    ) && fields
        .iter()
        .any(|field| field.source == LauncherModConfigSource::ConfigJson)
    {
        warnings.push(
            "GMCM probe did not expose structured options; config.json keys were parsed as editable fallback fields."
                .to_string(),
        );
    }
    localize_field_copy(&mut fields, &translations, &mut warnings);
    let fields = normalize_fields(fields);

    let normalized_root = normalize_path(&root);
    let gmcm_field_count = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("gmcmFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let static_field_count = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("staticFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let execution_mode = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("executionMode"))
        .and_then(Value::as_str)
        .unwrap_or("not-run");
    let gmcm_detected = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("gmcmDetected"))
        .and_then(Value::as_bool)
        .map(|detected| if detected { "true" } else { "false" })
        .unwrap_or("unknown");
    let runtime_attempted = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("runtimeAttempted"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let runtime_skip_reason = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("runtimeSkipReason"))
        .and_then(Value::as_str)
        .unwrap_or("none");
    let configured_mods_root = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("configuredModsRoot"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let capture_strategy = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("captureStrategy"))
        .and_then(Value::as_str)
        .unwrap_or("none");
    let smapi_source = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("smapiSource"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let requested_smapi_version = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("requestedSmapiVersion"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let resolved_smapi_version = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("resolvedSmapiVersion"))
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let failure_stage = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("failureStage"))
        .and_then(Value::as_str)
        .unwrap_or("none");
    let inspect_duration_ms = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("inspectDurationMs"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let runtime_duration_ms = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("runtimeDurationMs"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let duration_ms = probe_diagnostics
        .as_ref()
        .and_then(|diagnostics| diagnostics.get("durationMs"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let assembly_load_notes =
        summarize_probe_diagnostics(probe_diagnostics.as_ref(), "assemblyLoadWarnings");
    let assembly_resolve_misses =
        summarize_probe_diagnostics(probe_diagnostics.as_ref(), "assemblyResolveMisses");
    if !assembly_load_notes.is_empty() || !assembly_resolve_misses.is_empty() {
        LogEvent::new("modConfig.probe.assemblyDiagnostics")
            .field("mod", &normalized_root)
            .optional("notes", Some(&assembly_load_notes))
            .optional("resolveMisses", Some(&assembly_resolve_misses))
            .emit_info(targets::LAUNCHER_MOD_CONFIG);
    }
    let load_event = LogEvent::new("modConfig.loaded")
        .field("mod", &normalized_root)
        .field("locale", request.locale.as_deref().unwrap_or("default"))
        .debug("probe", &probe_status)
        .field("executionMode", execution_mode)
        .field("gmcmDetected", gmcm_detected)
        .flag("runtimeAttempted", runtime_attempted)
        .field("runtimeSkip", runtime_skip_reason)
        .field("configuredModsRoot", configured_mods_root)
        .field("captureStrategy", capture_strategy)
        .field("smapiSource", smapi_source)
        .field("requestedSmapi", requested_smapi_version)
        .field("resolvedSmapi", resolved_smapi_version)
        .field("failureStage", failure_stage)
        .field("inspectMs", inspect_duration_ms)
        .field("runtimeMs", runtime_duration_ms)
        .field("durationMs", duration_ms)
        .count("fields", fields.len())
        .field("gmcmFields", gmcm_field_count)
        .field("staticFields", static_field_count)
        .count("translations", translations.len());
    if warnings.is_empty()
        && matches!(
            probe_status,
            LauncherModConfigProbeStatus::Succeeded | LauncherModConfigProbeStatus::NotRun
        )
    {
        load_event.emit_info(targets::LAUNCHER_MOD_CONFIG);
    } else {
        load_event
            .field("warnings", warnings.join(" | "))
            .emit_warn(targets::LAUNCHER_MOD_CONFIG);
    }

    Ok(LauncherModConfigResult {
        mod_path: normalized_root,
        config_path: normalize_path(&config_path),
        config_exists,
        schema_sources: sorted_sources(&fields),
        fields,
        warnings,
        probe_status,
        probe_diagnostics,
    })
}

pub(crate) fn gmcm_parsing_enabled_at_path(settings_path: &Path) -> bool {
    load_or_create_settings_at_path(settings_path)
        .map(|settings| settings.gmcm_parsing_enabled)
        .unwrap_or(true)
}

pub fn save_launcher_mod_config(
    request: SaveLauncherModConfigRequest,
) -> anyhow::Result<LauncherModConfigResult> {
    let SaveLauncherModConfigRequest {
        mod_path,
        locale,
        values,
    } = request;
    let root = canonical_mod_root(&mod_path)?;
    let config_path = child_file(&root, CONFIG_FILE_NAME)?;
    let mut config = json_object_or_empty(&config_path)?;
    for (key, value) in values {
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        let matching_keys = config
            .keys()
            .filter(|candidate| candidate.eq_ignore_ascii_case(key))
            .cloned()
            .collect::<Vec<_>>();
        let target_key = matching_keys
            .iter()
            .find(|candidate| candidate.as_str() == key)
            .cloned()
            .or_else(|| matching_keys.first().cloned())
            .unwrap_or_else(|| key.to_string());
        for duplicate_key in matching_keys {
            if duplicate_key != target_key {
                config.remove(&duplicate_key);
            }
        }
        config.insert(target_key, value);
    }

    let json = serde_json::to_string_pretty(&Value::Object(config))
        .context("Failed to serialize launcher mod config JSON")?;
    fs::write(&config_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher mod config {}",
            normalize_path(&config_path)
        )
    })?;

    load_launcher_mod_config(LoadLauncherModConfigRequest {
        mod_path: normalize_path(&root),
        locale,
    })
}
