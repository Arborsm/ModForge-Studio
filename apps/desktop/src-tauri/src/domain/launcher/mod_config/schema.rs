// Reading & parsing a mod's config: path/JSON safety, Content Patcher ConfigSchema,
// assets/options.json and config.json field construction, plus i18n / content-pack
// translation discovery for the parsed field copy.
use super::probe_merge::normalized_config_key;
use super::{CONTENT_FILE_NAME, MANIFEST_FILE_NAME};
use crate::domain::launcher::fs::read_json_file;
use crate::domain::launcher::types::{
    LauncherModConfigField, LauncherModConfigFieldType, LauncherModConfigSource,
    LauncherModConfigUiHint,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use anyhow::{Context, bail};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn object_value_case_insensitive<'a>(
    object: &'a Map<String, Value>,
    key: &str,
) -> Option<&'a Value> {
    object.get(key).or_else(|| {
        object
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
            .map(|(_, value)| value)
    })
}

pub(crate) fn canonical_mod_root(path: &str) -> anyhow::Result<PathBuf> {
    let root = clean_input_path(path);
    let canonical = root.canonicalize().with_context(|| {
        format!(
            "Failed to resolve launcher mod directory {}",
            normalize_path(&root)
        )
    })?;
    if !canonical.is_dir() {
        bail!(
            "Launcher mod path {} is not a directory.",
            normalize_path(&canonical)
        );
    }
    if !canonical.join(MANIFEST_FILE_NAME).is_file() {
        bail!(
            "Launcher mod path {} does not contain manifest.json.",
            normalize_path(&canonical)
        );
    }
    Ok(canonical)
}

pub(crate) fn child_file(root: &Path, file_name: &str) -> anyhow::Result<PathBuf> {
    let candidate = root.join(file_name);
    if let Some(parent) = candidate.parent() {
        let parent_canonical = parent.canonicalize().with_context(|| {
            format!(
                "Failed to resolve launcher mod config parent {}",
                normalize_path(parent)
            )
        })?;
        if parent_canonical != root {
            bail!("Launcher mod config path resolves outside the mod directory.");
        }
    }
    if candidate.exists() {
        let canonical = candidate.canonicalize().with_context(|| {
            format!(
                "Failed to resolve launcher mod config {}",
                normalize_path(&candidate)
            )
        })?;
        if !canonical.starts_with(root) {
            bail!("Launcher mod config path resolves outside the mod directory.");
        }
    }
    Ok(candidate)
}

pub(crate) fn json_object_or_empty(path: &Path) -> anyhow::Result<Map<String, Value>> {
    if !path.is_file() {
        return Ok(Map::new());
    }
    match read_json_file(path)? {
        Value::Object(object) => Ok(object),
        _ => {
            bail!("{} must be a JSON object.", normalize_path(path));
        }
    }
}

fn optional_json_object(path: &Path, warnings: &mut Vec<String>) -> Option<Map<String, Value>> {
    if !path.is_file() {
        return None;
    }
    match read_json_file(path) {
        Ok(Value::Object(object)) => Some(object),
        Ok(_) => {
            warnings.push(format!("{} is not a JSON object.", normalize_path(path)));
            None
        }
        Err(error) => {
            warnings.push(error.to_string());
            None
        }
    }
}

fn infer_field_type(value: &Value) -> LauncherModConfigFieldType {
    match value {
        Value::Bool(_) => LauncherModConfigFieldType::Boolean,
        Value::Number(number) if number.is_i64() || number.is_u64() => {
            LauncherModConfigFieldType::Integer
        }
        Value::Number(_) => LauncherModConfigFieldType::Number,
        Value::String(_) => LauncherModConfigFieldType::String,
        Value::Array(values) if values.iter().all(Value::is_string) => {
            LauncherModConfigFieldType::StringArray
        }
        Value::Object(_) | Value::Array(_) => LauncherModConfigFieldType::Object,
        Value::Null => LauncherModConfigFieldType::Unknown,
    }
}

fn parse_allow_values(value: Option<&Value>) -> Vec<Value> {
    match value {
        Some(Value::Array(values)) => values.clone(),
        Some(Value::String(text)) => text
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| Value::String(item.to_string()))
            .collect(),
        Some(value) => vec![value.clone()],
        None => Vec::new(),
    }
}

fn cp_schema_from(root: &Map<String, Value>) -> Option<&Map<String, Value>> {
    root.get("ConfigSchema").and_then(Value::as_object)
}

fn field_from_cp_schema(
    key: &str,
    schema_value: &Value,
    current_config: &Map<String, Value>,
) -> Option<LauncherModConfigField> {
    let schema = schema_value.as_object()?;
    let default_value = schema.get("Default").cloned();
    let current_value = object_value_case_insensitive(current_config, key)
        .cloned()
        .or_else(|| default_value.clone())
        .unwrap_or(Value::Null);
    let allow_values = parse_allow_values(schema.get("AllowValues"));
    let field_type = if schema
        .get("AllowMultiple")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        LauncherModConfigFieldType::StringArray
    } else if !allow_values.is_empty() {
        match &current_value {
            Value::Array(_) => LauncherModConfigFieldType::StringArray,
            _ => infer_field_type(&current_value),
        }
    } else {
        infer_field_type(&current_value)
    };

    Some(LauncherModConfigField {
        key: key.to_string(),
        label: schema
            .get("Name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(key)
            .to_string(),
        description: schema
            .get("Description")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        section: schema
            .get("Section")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        field_type,
        ui_hint: None,
        value: current_value,
        default_value,
        allow_values,
        allow_blank: schema
            .get("AllowBlank")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        allow_multiple: schema
            .get("AllowMultiple")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        editable: true,
        source: LauncherModConfigSource::ContentPatcher,
    })
}

pub(crate) fn fields_from_cp_schema(
    root: &Path,
    current_config: &Map<String, Value>,
    warnings: &mut Vec<String>,
) -> Vec<LauncherModConfigField> {
    let manifest_path = root.join(MANIFEST_FILE_NAME);
    let content_path = root.join(CONTENT_FILE_NAME);
    let schema = optional_json_object(&manifest_path, warnings)
        .and_then(|manifest| cp_schema_from(&manifest).cloned())
        .or_else(|| {
            optional_json_object(&content_path, warnings)
                .and_then(|content| cp_schema_from(&content).cloned())
        });

    let Some(schema) = schema else {
        return Vec::new();
    };

    schema
        .iter()
        .filter_map(|(key, value)| field_from_cp_schema(key, value, current_config))
        .collect()
}

pub(crate) fn fields_from_config_json(
    current_config: &Map<String, Value>,
    existing_keys: &BTreeSet<String>,
) -> Vec<LauncherModConfigField> {
    current_config
        .iter()
        .filter(|(key, _)| !existing_keys.contains(&normalized_config_key(key)))
        .map(|(key, value)| LauncherModConfigField {
            key: key.clone(),
            label: key.clone(),
            description: None,
            section: None,
            field_type: infer_field_type(value),
            ui_hint: None,
            value: value.clone(),
            default_value: None,
            allow_values: Vec::new(),
            allow_blank: false,
            allow_multiple: false,
            editable: true,
            source: LauncherModConfigSource::ConfigJson,
        })
        .collect()
}

fn parse_schema_default(
    value: Option<&Value>,
    field_type: &LauncherModConfigFieldType,
) -> Option<Value> {
    let value = value?;
    match field_type {
        LauncherModConfigFieldType::Boolean => match value {
            Value::Bool(_) => Some(value.clone()),
            Value::String(text) => match text.trim().to_ascii_lowercase().as_str() {
                "true" => Some(Value::Bool(true)),
                "false" => Some(Value::Bool(false)),
                _ => Some(value.clone()),
            },
            _ => Some(value.clone()),
        },
        LauncherModConfigFieldType::Integer => match value {
            Value::Number(_) => Some(value.clone()),
            Value::String(text) => text
                .trim()
                .parse::<i64>()
                .ok()
                .map(|number| Value::Number(number.into()))
                .or_else(|| Some(value.clone())),
            _ => Some(value.clone()),
        },
        LauncherModConfigFieldType::Number => match value {
            Value::Number(_) => Some(value.clone()),
            Value::String(text) => text
                .trim()
                .parse::<f64>()
                .ok()
                .and_then(serde_json::Number::from_f64)
                .map(Value::Number)
                .or_else(|| Some(value.clone())),
            _ => Some(value.clone()),
        },
        _ => Some(value.clone()),
    }
}

fn field_type_from_option_schema(
    schema_type: Option<&str>,
    default_value: Option<&Value>,
) -> LauncherModConfigFieldType {
    match schema_type
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "bool" | "boolean" if matches!(default_value, Some(Value::String(_))) => {
            LauncherModConfigFieldType::String
        }
        "bool" | "boolean" => LauncherModConfigFieldType::Boolean,
        "int" | "integer" => LauncherModConfigFieldType::Integer,
        "float" | "double" | "number" => LauncherModConfigFieldType::Number,
        "string[]" | "strings" | "string-array" | "items" | "item-list" | "itemlist"
        | "item-id-list" => LauncherModConfigFieldType::StringArray,
        "keybind-list" | "keybindlist" => LauncherModConfigFieldType::StringArray,
        "string" | "text" | "color" | "colour" | "keybind" | "key" | "item" | "item-id" => {
            LauncherModConfigFieldType::String
        }
        _ => default_value
            .map(infer_field_type)
            .unwrap_or(LauncherModConfigFieldType::Unknown),
    }
}

fn ui_hint_from_option_schema(schema_type: &str) -> Option<LauncherModConfigUiHint> {
    match schema_type.trim().to_ascii_lowercase().as_str() {
        "color" | "colour" => Some(LauncherModConfigUiHint::Color),
        "item" | "item-id" => Some(LauncherModConfigUiHint::Item),
        "items" | "item-list" | "itemlist" | "item-id-list" => {
            Some(LauncherModConfigUiHint::ItemList)
        }
        "keybind" | "key" => Some(LauncherModConfigUiHint::Keybind),
        "keybind-list" | "keybindlist" => Some(LauncherModConfigUiHint::KeybindList),
        _ => None,
    }
}

pub(crate) fn fields_from_options_schema(
    root: &Path,
    current_config: &Map<String, Value>,
    existing_keys: &BTreeSet<String>,
    translations: &ConfigTranslations,
    warnings: &mut Vec<String>,
) -> Vec<LauncherModConfigField> {
    let options_path = root.join("assets").join("options.json");
    if !options_path.is_file() {
        return Vec::new();
    }

    let parsed = match read_json_file(&options_path) {
        Ok(Value::Array(items)) => items,
        Ok(_) => {
            warnings.push(format!(
                "{} is not an options schema array.",
                normalize_path(&options_path)
            ));
            return Vec::new();
        }
        Err(error) => {
            warnings.push(error.to_string());
            return Vec::new();
        }
    };

    let mut current_section = None;
    let mut pending_subtitle = None;
    let mut fields = Vec::new();
    for item in parsed.iter().filter_map(Value::as_object) {
        let option_type = item
            .get("Type")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        let name = item
            .get("Name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if option_type.eq_ignore_ascii_case("page") {
            let page_id = item
                .get("PageID")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .or(name);
            current_section = page_id.and_then(|page_id| {
                translated_text(translations, &format!("GMCM.PageTitle.{page_id}")).or_else(|| {
                    (!page_id.chars().all(|character| character.is_ascii_digit()))
                        .then(|| humanize_config_key(page_id))
                })
            });
            pending_subtitle = None;
            continue;
        }
        if option_type.eq_ignore_ascii_case("pageLink") {
            continue;
        }
        if option_type.eq_ignore_ascii_case("subtitle") {
            pending_subtitle = name.map(|subtitle| {
                translated_text(translations, &format!("GMCM.Title.{subtitle}.Name"))
                    .unwrap_or_else(|| humanize_config_key(subtitle))
            });
            continue;
        }

        let Some(key) = name else {
            continue;
        };
        if existing_keys.contains(&normalized_config_key(key))
            || fields
                .iter()
                .any(|field: &LauncherModConfigField| field.key.eq_ignore_ascii_case(key))
        {
            continue;
        }

        let field_type = field_type_from_option_schema(Some(option_type), item.get("Default"));
        if matches!(
            field_type,
            LauncherModConfigFieldType::Unknown | LauncherModConfigFieldType::Object
        ) {
            continue;
        }

        let default_value = parse_schema_default(item.get("Default"), &field_type);
        let value = object_value_case_insensitive(current_config, key)
            .cloned()
            .or_else(|| default_value.clone())
            .unwrap_or(Value::Null);

        let mut allow_values = parse_allow_values(item.get("AllowedValues"));
        if allow_values.is_empty()
            && option_type.eq_ignore_ascii_case("bool")
            && matches!(field_type, LauncherModConfigFieldType::String)
        {
            allow_values = vec![
                Value::String("True".to_string()),
                Value::String("False".to_string()),
            ];
        }

        let option_label = translated_text(translations, &format!("GMCM.Options.{key}.Name"));
        let tooltip_key = item
            .get("ToolTipKey")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let description = tooltip_key
            .and_then(|value| translated_text(translations, value))
            .or_else(|| translated_text(translations, &format!("GMCM.Options.{key}.ToolTip")))
            .or_else(|| tooltip_key.map(ToOwned::to_owned));

        fields.push(LauncherModConfigField {
            key: key.to_string(),
            label: pending_subtitle
                .take()
                .or(option_label)
                .unwrap_or_else(|| humanize_config_key(key)),
            description,
            section: current_section.clone(),
            field_type,
            ui_hint: ui_hint_from_option_schema(option_type),
            value,
            default_value,
            allow_values,
            allow_blank: false,
            allow_multiple: false,
            editable: true,
            source: LauncherModConfigSource::DllStatic,
        });
    }

    fields
}

pub(crate) fn sorted_sources(fields: &[LauncherModConfigField]) -> Vec<LauncherModConfigSource> {
    let mut seen = BTreeSet::new();
    let mut sources = Vec::new();
    for source in fields.iter().map(|field| field.source.clone()) {
        let key = format!("{source:?}");
        if seen.insert(key) {
            sources.push(source);
        }
    }
    sources
}

pub(crate) type ConfigTranslations = BTreeMap<String, String>;

fn locale_candidates(locale: Option<&str>) -> Vec<String> {
    let normalized = locale.unwrap_or("en").trim().replace('_', "-");
    let language = normalized
        .split('-')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("en")
        .to_string();
    let mut candidates = vec!["default".to_string(), "en".to_string()];
    if language != "en" {
        candidates.push(language);
    }
    if !normalized.is_empty()
        && !candidates
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(&normalized))
    {
        candidates.push(normalized);
    }
    candidates
}

fn merge_translation_object(translations: &mut ConfigTranslations, value: &Value) {
    let Some(entries) = value.as_object() else {
        return;
    };
    for (key, value) in entries {
        if let Some(text) = value
            .as_str()
            .map(str::trim)
            .filter(|text| !text.is_empty())
        {
            translations.insert(key.clone(), text.to_string());
        }
    }
}

fn merge_local_i18n(
    root: &Path,
    locale: Option<&str>,
    translations: &mut ConfigTranslations,
    warnings: &mut Vec<String>,
) {
    let i18n_root = root.join("i18n");
    if !i18n_root.is_dir() {
        return;
    }
    for candidate in locale_candidates(locale) {
        let path = i18n_root.join(format!("{candidate}.json"));
        if !path.is_file() {
            continue;
        }
        match read_json_file(&path) {
            Ok(value) => merge_translation_object(translations, &value),
            Err(error) => warnings.push(error.to_string()),
        }
    }
}

fn nearest_mods_root(root: &Path) -> Option<PathBuf> {
    root.ancestors()
        .find(|candidate| {
            candidate
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case("mods"))
        })
        .map(Path::to_path_buf)
}

fn discover_manifest_dirs(root: &Path) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    let mut pending = vec![(root.to_path_buf(), 0usize)];
    while let Some((directory, depth)) = pending.pop() {
        if depth > 8 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        let mut has_manifest = false;
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.eq_ignore_ascii_case(MANIFEST_FILE_NAME))
            {
                has_manifest = true;
            } else if file_type.is_dir() && !file_type.is_symlink() {
                pending.push((path, depth + 1));
            }
        }
        if has_manifest {
            directories.push(directory);
        }
    }
    directories.sort();
    directories
}

fn manifest_unique_id(manifest: &Map<String, Value>) -> Option<&str> {
    object_value_case_insensitive(manifest, "UniqueID")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn manifest_depends_on(manifest: &Map<String, Value>, unique_id: &str) -> bool {
    object_value_case_insensitive(manifest, "Dependencies")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .filter_map(manifest_unique_id)
        .any(|candidate| candidate.eq_ignore_ascii_case(unique_id))
}

fn merge_content_pack_translations(
    root: &Path,
    unique_id: &str,
    locale: Option<&str>,
    translations: &mut ConfigTranslations,
    warnings: &mut Vec<String>,
) {
    let Some(mods_root) = nearest_mods_root(root) else {
        return;
    };
    let target = format!("{unique_id}/Translations");
    let candidates = locale_candidates(locale);
    let mut locale_layers = vec![ConfigTranslations::new(); candidates.len()];
    for directory in discover_manifest_dirs(&mods_root) {
        if directory == root {
            continue;
        }
        let manifest_path = directory.join(MANIFEST_FILE_NAME);
        let Ok(Value::Object(manifest)) = read_json_file(&manifest_path) else {
            continue;
        };
        if !manifest_depends_on(&manifest, unique_id) {
            continue;
        }
        let content_path = directory.join(CONTENT_FILE_NAME);
        if !content_path.is_file() {
            continue;
        }
        let parsed = match read_json_file(&content_path) {
            Ok(value) => value,
            Err(error) => {
                warnings.push(error.to_string());
                continue;
            }
        };
        for change in parsed
            .get("Changes")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_object)
        {
            let is_translation_edit = change
                .get("Action")
                .and_then(Value::as_str)
                .is_some_and(|action| action.eq_ignore_ascii_case("EditData"))
                && change
                    .get("Target")
                    .and_then(Value::as_str)
                    .is_some_and(|value| value.eq_ignore_ascii_case(&target));
            if !is_translation_edit {
                continue;
            }
            let Some(entries) = change.get("Entries").and_then(Value::as_object) else {
                continue;
            };
            for (index, candidate) in candidates.iter().enumerate() {
                if let Some(value) = object_value_case_insensitive(entries, candidate) {
                    merge_translation_object(&mut locale_layers[index], value);
                }
            }
        }
    }
    for layer in locale_layers {
        translations.extend(layer);
    }
}

pub(crate) fn load_config_translations(
    root: &Path,
    locale: Option<&str>,
    warnings: &mut Vec<String>,
) -> ConfigTranslations {
    let mut translations = ConfigTranslations::new();
    merge_local_i18n(root, locale, &mut translations, warnings);
    let manifest_path = root.join(MANIFEST_FILE_NAME);
    if let Ok(Value::Object(manifest)) = read_json_file(&manifest_path)
        && let Some(unique_id) = manifest_unique_id(&manifest)
    {
        merge_content_pack_translations(root, unique_id, locale, &mut translations, warnings);
    }
    translations
}

pub(crate) fn translated_text(translations: &ConfigTranslations, key: &str) -> Option<String> {
    translations
        .get(key)
        .or_else(|| {
            translations
                .iter()
                .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
                .map(|(_, value)| value)
        })
        .cloned()
}

pub(crate) fn looks_like_translation_key(value: &str) -> bool {
    !value.chars().any(char::is_whitespace)
        && value.contains('.')
        && value
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, '.' | '_' | '-'))
}

pub(crate) fn humanize_config_key(value: &str) -> String {
    let mut result = String::new();
    let mut previous_lowercase = false;
    for character in value.chars() {
        if matches!(character, '_' | '-') {
            if !result.ends_with(' ') {
                result.push(' ');
            }
            previous_lowercase = false;
            continue;
        }
        if character.is_uppercase() && previous_lowercase && !result.ends_with(' ') {
            result.push(' ');
        }
        previous_lowercase = character.is_lowercase() || character.is_ascii_digit();
        result.push(character);
    }
    result.trim().to_string()
}
