use super::fs::read_json_file;
use super::paths::launcher_settings_path;
use super::settings::load_or_create_settings_at_path;
use super::types::{
    LauncherGmcmProbeDiagnosticStatus, LauncherGmcmProbeDiagnosticsResult, LauncherModConfigField,
    LauncherModConfigFieldType, LauncherModConfigProbeStatus, LauncherModConfigResult,
    LauncherModConfigSource, LauncherModConfigUiHint, LoadLauncherModConfigRequest,
    SaveLauncherModConfigRequest,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const CONFIG_FILE_NAME: &str = "config.json";
const MANIFEST_FILE_NAME: &str = "manifest.json";
const CONTENT_FILE_NAME: &str = "content.json";
const GMCM_INSPECT_CHILD_TIMEOUT: Duration = Duration::from_millis(1_000);
const GMCM_INSPECT_PARENT_TIMEOUT: Duration = Duration::from_millis(1_500);
const GMCM_RUNTIME_CHILD_TIMEOUT: Duration = Duration::from_millis(3_000);
const GMCM_RUNTIME_PARENT_TIMEOUT: Duration = Duration::from_millis(3_500);
const GMCM_PROBE_OUTPUT_LIMIT: u64 = 4 * 1024 * 1024;
static GMCM_PROBE_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

type ConfigTranslations = BTreeMap<String, String>;

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

fn object_value_case_insensitive<'a>(
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

fn load_config_translations(
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

fn translated_text(translations: &ConfigTranslations, key: &str) -> Option<String> {
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

fn looks_like_translation_key(value: &str) -> bool {
    !value.chars().any(char::is_whitespace)
        && value.contains('.')
        && value
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, '.' | '_' | '-'))
}

fn humanize_config_key(value: &str) -> String {
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

fn canonical_mod_root(path: &str) -> anyhow::Result<PathBuf> {
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

fn child_file(root: &Path, file_name: &str) -> anyhow::Result<PathBuf> {
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

fn json_object_or_empty(path: &Path) -> anyhow::Result<Map<String, Value>> {
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

fn fields_from_cp_schema(
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

fn fields_from_config_json(
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

fn fields_from_options_schema(
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

fn sorted_sources(fields: &[LauncherModConfigField]) -> Vec<LauncherModConfigSource> {
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

fn dotnet_executable_name() -> &'static str {
    if cfg!(windows) {
        "dotnet.exe"
    } else {
        "dotnet"
    }
}

fn resolve_dotnet_host_path(
    configured_path: Option<std::ffi::OsString>,
    search_path: Option<std::ffi::OsString>,
    home_dir: Option<PathBuf>,
) -> PathBuf {
    if let Some(path) = configured_path
        .map(PathBuf::from)
        .filter(|path| path.is_file())
    {
        return path;
    }

    let executable_name = dotnet_executable_name();
    if let Some(path) = search_path.as_deref().and_then(|paths| {
        std::env::split_paths(paths)
            .map(|root| root.join(executable_name))
            .find(|path| path.is_file())
    }) {
        return path;
    }

    let mut candidates = Vec::new();
    if let Some(home_dir) = home_dir {
        candidates.push(home_dir.join(".dotnet").join(executable_name));
    }
    if cfg!(target_os = "linux") {
        candidates.push(PathBuf::from("/usr/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/snap/bin/dotnet"));
    }
    if cfg!(target_os = "macos") {
        candidates.push(PathBuf::from("/opt/homebrew/bin/dotnet"));
        candidates.push(PathBuf::from("/usr/local/bin/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/dotnet"));
        candidates.push(PathBuf::from("/usr/local/share/dotnet/x64/dotnet"));
    }

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from(executable_name))
}

fn dotnet_host_path() -> PathBuf {
    resolve_dotnet_host_path(
        std::env::var_os("MODFORGE_DOTNET_PATH"),
        std::env::var_os("PATH"),
        dirs::home_dir(),
    )
}

fn probe_assembly_path() -> Option<PathBuf> {
    std::env::var_os("MODFORGE_GMCM_PROBE_PATH")
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .or_else(|| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(Path::to_path_buf))?;
            let probe_file_name = "modforge-gmcm-probe.dll";
            [
                exe_dir.join(probe_file_name),
                exe_dir.join("gmcm-probe").join(probe_file_name),
                exe_dir
                    .parent()
                    .unwrap_or(&exe_dir)
                    .join("release")
                    .join("gmcm-probe")
                    .join(probe_file_name),
                exe_dir
                    .join("resources")
                    .join("gmcm-probe")
                    .join(probe_file_name),
                exe_dir.join("bin").join("gmcm-probe").join(probe_file_name),
            ]
            .into_iter()
            .find(|path| path.is_file())
        })
}

fn parse_dotnet_runtime_lines(stdout: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn has_net6_runtime(runtimes: &[String]) -> bool {
    runtimes
        .iter()
        .any(|runtime| runtime.starts_with("Microsoft.NETCore.App 6."))
}

pub fn load_launcher_gmcm_probe_diagnostics() -> LauncherGmcmProbeDiagnosticsResult {
    let probe_assembly_path = probe_assembly_path();
    let dotnet_path = dotnet_host_path();
    let dotnet_output = Command::new(&dotnet_path).arg("--list-runtimes").output();
    let mut warnings = Vec::new();
    let mut repair_actions = Vec::new();

    if probe_assembly_path.is_none() {
        warnings.push("probe-assembly-missing".to_string());
        repair_actions.push("rebuild-or-reinstall-probe".to_string());
    }

    let (dotnet_available, installed_runtimes) = match dotnet_output {
        Ok(output) if output.status.success() => (true, parse_dotnet_runtime_lines(&output.stdout)),
        Ok(output) => {
            warnings.push("dotnet-runtime-list-failed".to_string());
            if !output.stderr.is_empty() {
                warnings.push(
                    String::from_utf8_lossy(&output.stderr)
                        .trim()
                        .chars()
                        .take(240)
                        .collect(),
                );
            }
            repair_actions.push("install-dotnet-6-runtime".to_string());
            (false, Vec::new())
        }
        Err(error) => {
            warnings.push("dotnet-host-missing".to_string());
            warnings.push(error.to_string());
            repair_actions.push("install-dotnet-6-runtime".to_string());
            repair_actions.push("set-modforge-dotnet-path".to_string());
            (false, Vec::new())
        }
    };

    let net6_runtime_available = has_net6_runtime(&installed_runtimes);
    if dotnet_available && !net6_runtime_available {
        warnings.push("net6-runtime-missing".to_string());
        repair_actions.push("install-dotnet-6-runtime".to_string());
    }

    let status = if probe_assembly_path.is_some() && dotnet_available && net6_runtime_available {
        LauncherGmcmProbeDiagnosticStatus::Ready
    } else if probe_assembly_path.is_some() || dotnet_available {
        LauncherGmcmProbeDiagnosticStatus::Warning
    } else {
        LauncherGmcmProbeDiagnosticStatus::Unavailable
    };

    let result = LauncherGmcmProbeDiagnosticsResult {
        status,
        probe_assembly_path: probe_assembly_path.map(|path| normalize_path(&path)),
        dotnet_path: normalize_path(&dotnet_path),
        dotnet_available,
        net6_runtime_available,
        installed_runtimes,
        warnings,
        repair_actions,
    };

    match result.status {
        // A healthy probe reports nothing actionable and is re-run whenever the
        // config panel opens, so it stays out of the default terminal.
        LauncherGmcmProbeDiagnosticStatus::Ready => LogEvent::new("gmcmProbe.diagnostics")
            .debug("status", &result.status)
            .optional("probeAssembly", result.probe_assembly_path.as_deref())
            .field("dotnetPath", &result.dotnet_path)
            .count("runtimes", result.installed_runtimes.len())
            .emit_debug(targets::LAUNCHER_GMCM_PROBE),
        LauncherGmcmProbeDiagnosticStatus::Warning
        | LauncherGmcmProbeDiagnosticStatus::Unavailable => LogEvent::new("gmcmProbe.diagnostics")
            .debug("status", &result.status)
            .optional("probeAssembly", result.probe_assembly_path.as_deref())
            .field("dotnetPath", &result.dotnet_path)
            .flag("dotnetAvailable", result.dotnet_available)
            .flag("net6RuntimeAvailable", result.net6_runtime_available)
            .count("runtimes", result.installed_runtimes.len())
            .field("warnings", result.warnings.join(","))
            .field("repairActions", result.repair_actions.join(","))
            .emit_warn(targets::LAUNCHER_GMCM_PROBE),
    }

    result
}

fn field_type_from_probe(value: &str) -> LauncherModConfigFieldType {
    match value {
        "boolean" => LauncherModConfigFieldType::Boolean,
        "integer" => LauncherModConfigFieldType::Integer,
        "number" => LauncherModConfigFieldType::Number,
        "string-array" => LauncherModConfigFieldType::StringArray,
        "object" => LauncherModConfigFieldType::Object,
        "string" => LauncherModConfigFieldType::String,
        _ => LauncherModConfigFieldType::Unknown,
    }
}

fn ui_hint_from_probe(value: &str) -> Option<LauncherModConfigUiHint> {
    match value {
        "color" => Some(LauncherModConfigUiHint::Color),
        "item" => Some(LauncherModConfigUiHint::Item),
        "item-list" => Some(LauncherModConfigUiHint::ItemList),
        "keybind" => Some(LauncherModConfigUiHint::Keybind),
        "keybind-list" => Some(LauncherModConfigUiHint::KeybindList),
        _ => None,
    }
}

struct ProbeTempDirectory {
    path: PathBuf,
}

impl ProbeTempDirectory {
    fn create() -> anyhow::Result<Self> {
        let base = std::env::temp_dir();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        for _ in 0..32 {
            let sequence = GMCM_PROBE_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = base.join(format!(
                "modforge-gmcm-probe-{}-{timestamp}-{sequence}",
                std::process::id()
            ));
            match fs::create_dir(&path) {
                Ok(()) => return Ok(Self { path }),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => {
                    return Err(error).with_context(|| {
                        format!(
                            "Failed to create GMCM probe temp directory {}",
                            normalize_path(&path)
                        )
                    });
                }
            }
        }
        bail!("Failed to allocate a unique GMCM probe temp directory after 32 attempts")
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ProbeTempDirectory {
    fn drop(&mut self) {
        for attempt in 0..4 {
            match fs::remove_dir_all(&self.path) {
                Ok(()) => return,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
                Err(_) if attempt < 3 => thread::sleep(Duration::from_millis(10)),
                Err(_) => return,
            }
        }
    }
}

#[cfg(windows)]
mod probe_job {
    use anyhow::Context;
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;

    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

    #[repr(C)]
    struct JobObjectBasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    struct JobObjectExtendedLimitInformation {
        basic_limit_information: JobObjectBasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        #[link_name = "CreateJobObjectW"]
        fn create_job_object_w(attributes: *const c_void, name: *const u16) -> *mut c_void;
        #[link_name = "SetInformationJobObject"]
        fn set_information_job_object(
            job: *mut c_void,
            information_class: i32,
            information: *const c_void,
            information_length: u32,
        ) -> i32;
        #[link_name = "AssignProcessToJobObject"]
        fn assign_process_to_job_object(job: *mut c_void, process: *mut c_void) -> i32;
        #[link_name = "TerminateJobObject"]
        fn terminate_job_object(job: *mut c_void, exit_code: u32) -> i32;
        #[link_name = "WaitForSingleObject"]
        fn wait_for_single_object(handle: *mut c_void, milliseconds: u32) -> u32;
        #[link_name = "CloseHandle"]
        fn close_handle(handle: *mut c_void) -> i32;
    }

    const WAIT_FOR_PROCESSES_TIMEOUT_MS: u32 = 5_000;

    pub(super) struct ProbeJob {
        handle: *mut c_void,
    }

    impl ProbeJob {
        pub(super) fn new() -> anyhow::Result<Self> {
            let handle = unsafe { create_job_object_w(std::ptr::null(), std::ptr::null()) };
            if handle.is_null() {
                return Err(std::io::Error::last_os_error())
                    .context("Failed to create GMCM probe Windows Job Object");
            }

            let mut information: JobObjectExtendedLimitInformation = unsafe { std::mem::zeroed() };
            information.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = unsafe {
                set_information_job_object(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    std::ptr::from_ref(&information).cast(),
                    std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
                )
            };
            if configured == 0 {
                let error = std::io::Error::last_os_error();
                unsafe {
                    close_handle(handle);
                }
                return Err(error).context("Failed to configure GMCM probe Windows Job Object");
            }

            Ok(Self { handle })
        }

        pub(super) fn assign(&self, child: &Child) -> anyhow::Result<()> {
            let assigned =
                unsafe { assign_process_to_job_object(self.handle, child.as_raw_handle().cast()) };
            if assigned == 0 {
                return Err(std::io::Error::last_os_error())
                    .context("Failed to assign GMCM probe to Windows Job Object");
            }
            Ok(())
        }

        pub(super) fn terminate(&self) {
            unsafe {
                terminate_job_object(self.handle, 1);
            }
            // TerminateJobObject starts termination asynchronously. Wait until the job is
            // signaled so its processes no longer hold the probe working directory.
            unsafe {
                let _ = wait_for_single_object(self.handle, WAIT_FOR_PROCESSES_TIMEOUT_MS);
            }
        }
    }

    impl Drop for ProbeJob {
        fn drop(&mut self) {
            unsafe {
                close_handle(self.handle);
            }
        }
    }
}

#[cfg(unix)]
unsafe extern "C" {
    #[link_name = "kill"]
    fn libc_kill(process_id: i32, signal: i32) -> i32;
}

struct ProbeProcessOwner {
    #[cfg(windows)]
    job: probe_job::ProbeJob,
    #[cfg(unix)]
    process_group_id: Option<i32>,
    terminated: bool,
}

impl ProbeProcessOwner {
    fn new() -> anyhow::Result<Self> {
        Ok(Self {
            #[cfg(windows)]
            job: probe_job::ProbeJob::new()?,
            #[cfg(unix)]
            process_group_id: None,
            terminated: false,
        })
    }

    fn attach(&mut self, child: &Child) -> anyhow::Result<()> {
        #[cfg(windows)]
        self.job.assign(child)?;
        #[cfg(unix)]
        {
            self.process_group_id =
                Some(i32::try_from(child.id()).context("GMCM probe process ID exceeded i32")?);
        }
        #[cfg(not(any(windows, unix)))]
        let _ = child;
        Ok(())
    }

    fn terminate_owned_processes(&self) {
        #[cfg(windows)]
        self.job.terminate();
        #[cfg(unix)]
        if let Some(process_group_id) = self.process_group_id {
            unsafe {
                libc_kill(-process_group_id, 9);
            }
        }
    }

    fn terminate_and_wait(&mut self, child: &mut Child) {
        if !self.terminated {
            self.terminate_owned_processes();
        }
        let _ = child.kill();
        let _ = child.wait();
        self.terminated = true;
    }
}

impl Drop for ProbeProcessOwner {
    fn drop(&mut self) {
        if !self.terminated {
            self.terminate_owned_processes();
        }
    }
}

fn ensure_probe_output_within_limit(
    mode: &str,
    stdout_path: &Path,
    stderr_path: &Path,
) -> anyhow::Result<()> {
    let stdout_size = fs::metadata(stdout_path)
        .with_context(|| {
            format!(
                "Failed to inspect GMCM probe output {}",
                normalize_path(stdout_path)
            )
        })?
        .len();
    let stderr_size = fs::metadata(stderr_path)
        .with_context(|| {
            format!(
                "Failed to inspect GMCM probe output {}",
                normalize_path(stderr_path)
            )
        })?
        .len();
    if stdout_size > GMCM_PROBE_OUTPUT_LIMIT || stderr_size > GMCM_PROBE_OUTPUT_LIMIT {
        bail!(
            "GMCM {mode} probe output exceeded the {}-byte per-stream limit (stdout={stdout_size}, stderr={stderr_size}).",
            GMCM_PROBE_OUTPUT_LIMIT
        );
    }
    Ok(())
}

fn run_probe_with_timeout(
    probe_assembly_path: &Path,
    root: &Path,
    game_path: Option<&Path>,
    mode: &str,
    child_timeout: Duration,
    parent_timeout: Duration,
) -> anyhow::Result<Option<Output>> {
    let temp_dir = ProbeTempDirectory::create()?;
    let stdout_path = temp_dir.path().join("stdout.json");
    let stderr_path = temp_dir.path().join("stderr.log");
    let stdout_file = fs::File::create(&stdout_path).with_context(|| {
        format!(
            "Failed to create GMCM probe stdout file {}",
            normalize_path(&stdout_path)
        )
    })?;
    let stderr_file = fs::File::create(&stderr_path).with_context(|| {
        format!(
            "Failed to create GMCM probe stderr file {}",
            normalize_path(&stderr_path)
        )
    })?;
    let dotnet_path = dotnet_host_path();
    let mut command = Command::new(&dotnet_path);
    command
        .arg(probe_assembly_path)
        .arg("--mod-path")
        .arg(root)
        .arg("--mode")
        .arg(mode)
        .arg("--timeout-ms")
        .arg(child_timeout.as_millis().to_string())
        .current_dir(temp_dir.path())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));
    if let Some(game_path) = game_path {
        command.arg("--game-path").arg(game_path);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut process_owner = ProbeProcessOwner::new()?;
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return Err(error).with_context(|| {
                format!(
                    "Failed to start GMCM probe {} with dotnet host {}",
                    normalize_path(probe_assembly_path),
                    normalize_path(&dotnet_path)
                )
            });
        }
    };
    if let Err(error) = process_owner.attach(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    let started_at = Instant::now();
    loop {
        let status = match child.try_wait() {
            Ok(status) => status,
            Err(error) => {
                process_owner.terminate_and_wait(&mut child);
                return Err(error).context("Failed to poll GMCM probe process");
            }
        };
        if let Err(error) = ensure_probe_output_within_limit(mode, &stdout_path, &stderr_path) {
            process_owner.terminate_and_wait(&mut child);
            return Err(error);
        }
        if let Some(status) = status {
            // The root process may exit while a mod-created descendant remains alive.
            // Terminate the owned job/process group before reading or deleting its output files.
            process_owner.terminate_and_wait(&mut child);
            ensure_probe_output_within_limit(mode, &stdout_path, &stderr_path)?;
            let stdout = read_probe_output_file(&stdout_path);
            let stderr = read_probe_output_file(&stderr_path);
            return match (stdout, stderr) {
                (Ok(stdout), Ok(stderr)) => Ok(Some(Output {
                    status,
                    stdout,
                    stderr,
                })),
                (Err(error), _) | (_, Err(error)) => Err(error),
            };
        }
        if started_at.elapsed() >= parent_timeout {
            process_owner.terminate_and_wait(&mut child);
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn read_probe_output_file(path: &Path) -> anyhow::Result<Vec<u8>> {
    let file = fs::File::open(path)
        .with_context(|| format!("Failed to open GMCM probe output {}", normalize_path(path)))?;
    let mut output = Vec::new();
    file.take(GMCM_PROBE_OUTPUT_LIMIT.saturating_add(1))
        .read_to_end(&mut output)
        .with_context(|| format!("Failed to read GMCM probe output {}", normalize_path(path)))?;
    if output.len() as u64 > GMCM_PROBE_OUTPUT_LIMIT {
        bail!(
            "GMCM probe output {} exceeded the {}-byte limit.",
            normalize_path(path),
            GMCM_PROBE_OUTPUT_LIMIT
        );
    }
    Ok(output)
}

fn manifest_entry_dll(root: &Path) -> Option<PathBuf> {
    let Value::Object(manifest) = read_json_file(&root.join(MANIFEST_FILE_NAME)).ok()? else {
        return None;
    };
    let relative = object_value_case_insensitive(&manifest, "EntryDll")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    let relative = Path::new(relative);
    if relative.is_absolute() {
        return None;
    }
    let candidate = root.join(relative).canonicalize().ok()?;
    (candidate.starts_with(root)
        && candidate.is_file()
        && candidate
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("dll")))
    .then_some(candidate)
}

fn mod_has_probe_dll(root: &Path) -> bool {
    if manifest_entry_dll(root).is_some() {
        return true;
    }
    root.read_dir()
        .map(|entries| {
            entries.filter_map(Result::ok).any(|entry| {
                entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"))
            })
        })
        .unwrap_or(false)
}

#[derive(Debug)]
struct ProbePayload {
    result: Map<String, Value>,
    duration_ms: u64,
    stderr: Option<String>,
    process_succeeded: bool,
}

#[derive(Debug)]
enum ProbeAttempt {
    Completed(ProbePayload),
    TimedOut { duration_ms: u64 },
    Failed { message: String, duration_ms: u64 },
}

fn elapsed_millis(started_at: Instant) -> u64 {
    started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

fn run_probe_mode(
    probe_assembly_path: &Path,
    root: &Path,
    game_path: Option<&Path>,
    mode: &str,
    child_timeout: Duration,
    parent_timeout: Duration,
) -> ProbeAttempt {
    let started_at = Instant::now();
    match run_probe_with_timeout(
        probe_assembly_path,
        root,
        game_path,
        mode,
        child_timeout,
        parent_timeout,
    ) {
        Ok(Some(output)) => {
            let duration_ms = elapsed_millis(started_at);
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            match serde_json::from_slice::<Value>(&output.stdout) {
                Ok(Value::Object(result)) => ProbeAttempt::Completed(ProbePayload {
                    result,
                    duration_ms,
                    stderr: (!stderr.is_empty()).then_some(stderr),
                    process_succeeded: output.status.success(),
                }),
                _ => ProbeAttempt::Failed {
                    message: format!("GMCM {mode} probe returned invalid JSON."),
                    duration_ms,
                },
            }
        }
        Ok(None) => ProbeAttempt::TimedOut {
            duration_ms: elapsed_millis(started_at),
        },
        Err(error) => ProbeAttempt::Failed {
            message: format!("GMCM {mode} probe failed: {error}"),
            duration_ms: elapsed_millis(started_at),
        },
    }
}

fn probe_diagnostics(payload: &ProbePayload) -> Option<&Map<String, Value>> {
    payload.result.get("diagnostics").and_then(Value::as_object)
}

fn probe_status(payload: &ProbePayload) -> &str {
    payload
        .result
        .get("probeStatus")
        .and_then(Value::as_str)
        .unwrap_or("failed")
}

fn probe_gmcm_field_count(payload: &ProbePayload) -> u64 {
    let reported = probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("gmcmFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let actual = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| {
            field.get("source").and_then(Value::as_str) == Some("generic-mod-config-menu")
        })
        .count() as u64;
    reported.max(actual)
}

fn probe_static_field_count(payload: &ProbePayload) -> u64 {
    let reported = probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("staticFieldsCaptured"))
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let actual = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| field.get("source").and_then(Value::as_str) == Some("dll-static"))
        .count() as u64;
    reported.max(actual)
}

fn probe_gmcm_detected(payload: &ProbePayload) -> Option<bool> {
    if probe_gmcm_field_count(payload) > 0 {
        return Some(true);
    }
    probe_diagnostics(payload)
        .and_then(|diagnostics| diagnostics.get("gmcmDetected"))
        .and_then(Value::as_bool)
        .or_else(|| payload.result.get("gmcmDetected").and_then(Value::as_bool))
}

fn probe_static_field_keys(payload: &ProbePayload) -> BTreeSet<String> {
    payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|field| field.get("source").and_then(Value::as_str) == Some("dll-static"))
        .filter_map(|field| field.get("key").and_then(Value::as_str))
        .map(normalized_config_key)
        .collect()
}

fn probe_warning_messages(payload: &ProbePayload, mode: &str) -> Vec<String> {
    let mut messages = payload
        .result
        .get("warnings")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    if !payload.process_succeeded
        && let Some(stderr) = payload.stderr.as_deref()
    {
        messages.push(format!("GMCM {mode} probe stderr: {stderr}"));
    }
    messages
}

fn push_unique_warnings(warnings: &mut Vec<String>, messages: impl IntoIterator<Item = String>) {
    for message in messages {
        if !warnings.contains(&message) {
            warnings.push(message);
        }
    }
}

fn normalized_config_key(key: &str) -> String {
    key.trim().to_ascii_lowercase()
}

fn is_valid_probe_field_key(key: &str) -> bool {
    let key = key.trim();
    !key.is_empty()
        && key.len() <= 160
        && !key
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
}

fn merge_probe_payload_fields(
    payload: &ProbePayload,
    current_config: &Map<String, Value>,
    fields: &mut Vec<LauncherModConfigField>,
    include_static_fields: bool,
) {
    let mut probe_fields = payload
        .result
        .get("fields")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .filter(|field| {
            include_static_fields
                || field.get("source").and_then(Value::as_str) == Some("generic-mod-config-menu")
        })
        .collect::<Vec<_>>();
    probe_fields.sort_by_key(|field| {
        field.get("source").and_then(Value::as_str) != Some("generic-mod-config-menu")
    });
    for field in probe_fields {
        let Some(key) = field
            .get("key")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| is_valid_probe_field_key(value))
        else {
            continue;
        };
        if fields
            .iter()
            .any(|existing| existing.key.eq_ignore_ascii_case(key))
        {
            continue;
        }
        let default_value = field.get("defaultValue").cloned();
        let current_config_value = current_config
            .iter()
            .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
            .map(|(_, value)| value.clone());
        let has_current_config_key = current_config_value.is_some();
        let current_value = current_config_value
            .or_else(|| default_value.clone())
            .unwrap_or(Value::Null);
        let source = match field.get("source").and_then(Value::as_str) {
            Some("generic-mod-config-menu") => LauncherModConfigSource::GenericModConfigMenu,
            _ => LauncherModConfigSource::DllStatic,
        };
        let can_match_existing_config_key = field
            .get("canMatchExistingConfigKey")
            .and_then(Value::as_bool)
            .unwrap_or(true);
        let editable = source != LauncherModConfigSource::GenericModConfigMenu
            || field
                .get("storageKeyReliable")
                .and_then(Value::as_bool)
                .unwrap_or(true)
            || can_match_existing_config_key && has_current_config_key;
        // A GMCM field ID without a verified storage key must not enter direct edits or reset-all.
        let exposed_default_value = editable.then_some(default_value).flatten();
        fields.push(LauncherModConfigField {
            key: key.to_string(),
            label: field
                .get("label")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(key)
                .to_string(),
            description: field
                .get("description")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            section: field
                .get("section")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned),
            field_type: field_type_from_probe(
                field
                    .get("fieldType")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
            ),
            ui_hint: field
                .get("uiHint")
                .and_then(Value::as_str)
                .and_then(ui_hint_from_probe),
            value: current_value,
            default_value: exposed_default_value,
            allow_values: field
                .get("allowValues")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default(),
            allow_blank: field
                .get("allowBlank")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            allow_multiple: field
                .get("allowMultiple")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            editable,
            source,
        });
    }
}

fn merge_diagnostic_array(target: &mut Map<String, Value>, key: &str, incoming: &[Value]) {
    let values = target
        .entry(key.to_string())
        .or_insert_with(|| Value::Array(Vec::new()));
    let Some(values) = values.as_array_mut() else {
        return;
    };
    for value in incoming {
        if !values.contains(value) {
            values.push(value.clone());
        }
    }
}

fn merge_probe_diagnostic_values(target: &mut Map<String, Value>, source: &Map<String, Value>) {
    const ARRAY_KEYS: &[&str] = &[
        "gameAssembliesResolved",
        "assemblyLoadWarnings",
        "dependencyAssembliesResolved",
        "assemblyResolveMisses",
        "assemblyReferences",
        "registrationCandidates",
    ];
    for (key, value) in source {
        if ARRAY_KEYS.contains(&key.as_str())
            && let Some(incoming) = value.as_array()
        {
            merge_diagnostic_array(target, key, incoming);
            continue;
        }
        if matches!(
            key.as_str(),
            "dllsScanned" | "smapiModsFound" | "gmcmFieldsCaptured" | "staticFieldsCaptured"
        ) && let Some(incoming) = value.as_u64()
        {
            let current = target.get(key).and_then(Value::as_u64).unwrap_or(0);
            target.insert(key.clone(), Value::from(current.max(incoming)));
            continue;
        }
        target.insert(key.clone(), value.clone());
    }
}

fn merged_probe_diagnostics(
    inspect: Option<&ProbePayload>,
    runtime: Option<&ProbePayload>,
    gmcm_detected: Option<bool>,
    runtime_attempted: bool,
    runtime_skip_reason: Option<&str>,
    failure_stage: Option<&str>,
    clear_failure_stage: bool,
) -> Value {
    let mut diagnostics = Map::new();
    if let Some(source) = inspect.and_then(probe_diagnostics) {
        merge_probe_diagnostic_values(&mut diagnostics, source);
    }
    if let Some(source) = runtime.and_then(probe_diagnostics) {
        merge_probe_diagnostic_values(&mut diagnostics, source);
    }

    let inspect_duration_ms = inspect.map(|payload| payload.duration_ms).unwrap_or(0);
    let runtime_duration_ms = runtime.map(|payload| payload.duration_ms).unwrap_or(0);
    diagnostics.insert(
        "executionMode".to_string(),
        Value::String(if runtime_attempted {
            "inspect+runtime".to_string()
        } else {
            "inspect".to_string()
        }),
    );
    diagnostics.insert(
        "runtimeAttempted".to_string(),
        Value::Bool(runtime_attempted),
    );
    if let Some(gmcm_detected) = gmcm_detected {
        diagnostics.insert("gmcmDetected".to_string(), Value::Bool(gmcm_detected));
    }
    if let Some(reason) = runtime_skip_reason {
        diagnostics.insert(
            "runtimeSkipReason".to_string(),
            Value::String(reason.to_string()),
        );
    }
    if let Some(stage) = failure_stage {
        let stage_has_specific_detail = match stage {
            "runtime" => runtime
                .and_then(probe_diagnostics)
                .and_then(|source| source.get("failureStage"))
                .is_some_and(Value::is_string),
            "inspect" => inspect
                .and_then(probe_diagnostics)
                .and_then(|source| source.get("failureStage"))
                .is_some_and(Value::is_string),
            _ => false,
        };
        if !stage_has_specific_detail {
            diagnostics.insert("failureStage".to_string(), Value::String(stage.to_string()));
        }
    }
    if clear_failure_stage {
        diagnostics.remove("failureStage");
    }
    diagnostics.insert(
        "inspectDurationMs".to_string(),
        Value::from(inspect_duration_ms),
    );
    diagnostics.insert(
        "runtimeDurationMs".to_string(),
        Value::from(runtime_duration_ms),
    );
    diagnostics.insert(
        "durationMs".to_string(),
        Value::from(inspect_duration_ms.saturating_add(runtime_duration_ms)),
    );
    Value::Object(diagnostics)
}

fn launcher_probe_status(
    runtime_attempted: bool,
    runtime_attempt: Option<&ProbeAttempt>,
    gmcm_detected: Option<bool>,
) -> LauncherModConfigProbeStatus {
    if !runtime_attempted {
        return LauncherModConfigProbeStatus::NotRun;
    }
    match runtime_attempt {
        Some(ProbeAttempt::TimedOut { .. }) => LauncherModConfigProbeStatus::TimedOut,
        Some(ProbeAttempt::Failed { .. }) | None => LauncherModConfigProbeStatus::Failed,
        Some(ProbeAttempt::Completed(payload))
            if probe_gmcm_field_count(payload) > 0
                && payload.process_succeeded
                && probe_status(payload) == "succeeded" =>
        {
            LauncherModConfigProbeStatus::Succeeded
        }
        Some(ProbeAttempt::Completed(payload)) => match probe_status(payload) {
            "timed-out" => LauncherModConfigProbeStatus::TimedOut,
            "failed" => LauncherModConfigProbeStatus::Failed,
            _ if !payload.process_succeeded => LauncherModConfigProbeStatus::Failed,
            _ if gmcm_detected == Some(true) => LauncherModConfigProbeStatus::Unavailable,
            _ => LauncherModConfigProbeStatus::NotRun,
        },
    }
}

fn merge_probe_fields(
    root: &Path,
    game_path: Option<&Path>,
    configured_mods_root: Option<&Path>,
    current_config: &Map<String, Value>,
    fields: &mut Vec<LauncherModConfigField>,
    warnings: &mut Vec<String>,
) -> (LauncherModConfigProbeStatus, Option<Value>) {
    if !mod_has_probe_dll(root) {
        return (LauncherModConfigProbeStatus::NotRun, None);
    }

    let Some(probe_assembly_path) = probe_assembly_path() else {
        warnings.push(
            "GMCM probe is not bundled yet; falling back to Content Patcher/config.json parsing."
                .to_string(),
        );
        return (LauncherModConfigProbeStatus::Unavailable, None);
    };

    let explicit_schema_keys = fields
        .iter()
        .map(|field| normalized_config_key(&field.key))
        .collect::<BTreeSet<_>>();
    let inspect_attempt = run_probe_mode(
        &probe_assembly_path,
        root,
        game_path,
        "inspect",
        GMCM_INSPECT_CHILD_TIMEOUT,
        GMCM_INSPECT_PARENT_TIMEOUT,
    );
    let inspect = match &inspect_attempt {
        ProbeAttempt::Completed(payload) => Some(payload),
        _ => None,
    };
    let inspect_detected = inspect.and_then(probe_gmcm_detected);
    let inspected_static_keys = inspect.map(probe_static_field_keys).unwrap_or_default();
    let schema_complete = !current_config.is_empty()
        && !explicit_schema_keys.is_empty()
        && current_config
            .keys()
            .all(|key| explicit_schema_keys.contains(&normalized_config_key(key)))
        && !inspected_static_keys.is_empty()
        && inspected_static_keys.is_subset(&explicit_schema_keys);
    let inspect_failed =
        inspect.is_some_and(|payload| matches!(probe_status(payload), "failed" | "timed-out"));
    let runtime_allowed = configured_mods_root
        .is_some_and(|mods_root| root != mods_root && root.starts_with(mods_root));
    let runtime_skip_reason = if !runtime_allowed {
        Some("outside-configured-mods-root")
    } else if inspect_detected == Some(true) {
        None
    } else if schema_complete {
        Some("schema-complete")
    } else if inspect_detected == Some(false) && !inspect_failed {
        Some("gmcm-not-detected")
    } else {
        None
    };
    let runtime_attempted = runtime_skip_reason.is_none();
    let runtime_attempt = runtime_attempted.then(|| {
        run_probe_mode(
            &probe_assembly_path,
            root,
            game_path,
            "runtime",
            GMCM_RUNTIME_CHILD_TIMEOUT,
            GMCM_RUNTIME_PARENT_TIMEOUT,
        )
    });
    let runtime = runtime_attempt.as_ref().and_then(|attempt| match attempt {
        ProbeAttempt::Completed(payload) => Some(payload),
        _ => None,
    });
    let runtime_detected = runtime.and_then(probe_gmcm_detected);
    let gmcm_detected = if runtime_detected == Some(true) || inspect_detected == Some(true) {
        Some(true)
    } else {
        runtime_detected.or(inspect_detected)
    };

    let runtime_has_authoritative_gmcm = runtime.is_some_and(|payload| {
        probe_gmcm_field_count(payload) > 0
            && payload.process_succeeded
            && probe_status(payload) == "succeeded"
    });

    // Runtime fields are merged first so real GMCM metadata wins over inspect's static shape.
    // A successful runtime capture also suppresses inspect-only static members, whose CLR names
    // may differ from the serialized GMCM storage keys. Config-only values are added below as the
    // config.json fallback instead of showing duplicate controls.
    if let Some(runtime) = runtime {
        merge_probe_payload_fields(runtime, current_config, fields, true);
    }
    if let Some(inspect) = inspect {
        merge_probe_payload_fields(
            inspect,
            current_config,
            fields,
            !runtime_has_authoritative_gmcm,
        );
    }

    let runtime_gmcm_fields = runtime.map(probe_gmcm_field_count).unwrap_or(0);
    let status = launcher_probe_status(runtime_attempted, runtime_attempt.as_ref(), gmcm_detected);

    let failure_stage = if status == LauncherModConfigProbeStatus::Succeeded {
        None
    } else {
        match runtime_attempt.as_ref() {
            Some(ProbeAttempt::TimedOut { .. }) => Some("runtime-timeout"),
            Some(ProbeAttempt::Failed { .. }) => Some("runtime-launch"),
            Some(ProbeAttempt::Completed(payload))
                if matches!(probe_status(payload), "failed" | "timed-out") =>
            {
                Some("runtime")
            }
            _ => match &inspect_attempt {
                ProbeAttempt::TimedOut { .. } => Some("inspect-timeout"),
                ProbeAttempt::Failed { .. } => Some("inspect-launch"),
                ProbeAttempt::Completed(payload)
                    if matches!(probe_status(payload), "failed" | "timed-out") =>
                {
                    Some("inspect")
                }
                _ => None,
            },
        }
    };

    if status == LauncherModConfigProbeStatus::Succeeded {
        if let Some(runtime) = runtime {
            push_unique_warnings(warnings, probe_warning_messages(runtime, "runtime"));
        }
    } else if runtime_attempted {
        match &inspect_attempt {
            ProbeAttempt::Completed(payload) => {
                push_unique_warnings(warnings, probe_warning_messages(payload, "inspect"));
            }
            ProbeAttempt::TimedOut { .. } => {
                push_unique_warnings(warnings, ["GMCM inspect probe timed out.".to_string()])
            }
            ProbeAttempt::Failed { message, .. } => {
                push_unique_warnings(warnings, [message.clone()]);
            }
        }
        if let Some(runtime_attempt) = runtime_attempt.as_ref() {
            match runtime_attempt {
                ProbeAttempt::Completed(payload) => {
                    push_unique_warnings(warnings, probe_warning_messages(payload, "runtime"));
                }
                ProbeAttempt::TimedOut { .. } => {
                    push_unique_warnings(warnings, ["GMCM runtime probe timed out.".to_string()])
                }
                ProbeAttempt::Failed { message, .. } => {
                    push_unique_warnings(warnings, [message.clone()]);
                }
            }
        }
    } else {
        match &inspect_attempt {
            ProbeAttempt::Completed(payload) => {
                push_unique_warnings(warnings, probe_warning_messages(payload, "inspect"));
            }
            ProbeAttempt::TimedOut { .. } => {
                push_unique_warnings(warnings, ["GMCM inspect probe timed out.".to_string()]);
            }
            ProbeAttempt::Failed { message, .. } => {
                push_unique_warnings(warnings, [message.clone()]);
            }
        }
    }

    let inspect_duration_ms = match &inspect_attempt {
        ProbeAttempt::Completed(payload) => payload.duration_ms,
        ProbeAttempt::TimedOut { duration_ms } | ProbeAttempt::Failed { duration_ms, .. } => {
            *duration_ms
        }
    };
    let runtime_duration_ms = match runtime_attempt.as_ref() {
        Some(ProbeAttempt::Completed(payload)) => payload.duration_ms,
        Some(ProbeAttempt::TimedOut { duration_ms })
        | Some(ProbeAttempt::Failed { duration_ms, .. }) => *duration_ms,
        None => 0,
    };
    let mut diagnostics = merged_probe_diagnostics(
        inspect,
        runtime,
        gmcm_detected,
        runtime_attempted,
        runtime_skip_reason,
        failure_stage,
        status == LauncherModConfigProbeStatus::Succeeded,
    );
    if let Some(diagnostics) = diagnostics.as_object_mut() {
        if let Some(mods_root) = configured_mods_root {
            diagnostics.insert(
                "configuredModsRoot".to_string(),
                Value::String(normalize_path(mods_root)),
            );
        }
        diagnostics.insert(
            "inspectDurationMs".to_string(),
            Value::from(inspect_duration_ms),
        );
        diagnostics.insert(
            "runtimeDurationMs".to_string(),
            Value::from(runtime_duration_ms),
        );
        diagnostics.insert(
            "durationMs".to_string(),
            Value::from(inspect_duration_ms.saturating_add(runtime_duration_ms)),
        );
        diagnostics.insert(
            "gmcmFieldsCaptured".to_string(),
            Value::from(runtime_gmcm_fields),
        );
        let static_fields = inspect
            .map(probe_static_field_count)
            .unwrap_or(0)
            .max(runtime.map(probe_static_field_count).unwrap_or(0));
        diagnostics.insert(
            "staticFieldsCaptured".to_string(),
            Value::from(static_fields),
        );
    }

    (status, Some(diagnostics))
}

struct ConfiguredProbePaths {
    game_path: Option<PathBuf>,
    mods_root: Option<PathBuf>,
}

fn canonical_existing_directory(path: PathBuf) -> Option<PathBuf> {
    path.canonicalize().ok().filter(|path| path.is_dir())
}

fn configured_probe_paths() -> ConfiguredProbePaths {
    let game_override = std::env::var_os("MODFORGE_GMCM_PROBE_GAME_PATH")
        .map(PathBuf::from)
        .and_then(canonical_existing_directory);
    let mods_override = std::env::var_os("MODFORGE_GMCM_PROBE_MODS_PATH")
        .map(PathBuf::from)
        .and_then(canonical_existing_directory);
    let settings = (game_override.is_none() || mods_override.is_none())
        .then(|| {
            launcher_settings_path()
                .ok()
                .and_then(|path| load_or_create_settings_at_path(&path).ok())
        })
        .flatten();
    let game_path = game_override.or_else(|| {
        settings
            .as_ref()
            .and_then(|settings| settings.game_path.as_deref())
            .map(clean_input_path)
            .and_then(canonical_existing_directory)
    });
    let mods_root = mods_override
        .or_else(|| {
            settings
                .as_ref()
                .and_then(|settings| settings.mods_path.as_deref())
                .map(clean_input_path)
                .and_then(canonical_existing_directory)
        })
        .or_else(|| {
            game_path
                .as_ref()
                .map(|game_path| game_path.join("Mods"))
                .and_then(canonical_existing_directory)
        });
    ConfiguredProbePaths {
        game_path,
        mods_root,
    }
}

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

fn gmcm_parsing_enabled_at_path(settings_path: &Path) -> bool {
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

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/mod_config_tests.rs"]
mod tests;
