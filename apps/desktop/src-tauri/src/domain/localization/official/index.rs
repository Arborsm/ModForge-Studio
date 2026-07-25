use crate::domain::app_paths::official_localization_index_path;
use crate::domain::assets::validate_game_directory;
use crate::domain::launcher::updates::read_windows_file_version;
use crate::domain::localization::{jobs, types::*};
use crate::infrastructure::game_formats::xnb::read_xnb_from_path;
use anyhow::{Context, bail};
use rusqlite::{Connection, OptionalExtension, params, params_from_iter, types::Value as SqlValue};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const LOCALES: &[&str] = &[
    "de-DE", "es-ES", "fr-FR", "hu-HU", "it-IT", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "tr-TR",
    "zh-CN", "zh-TW",
];
const EXTRACTOR_VERSION: &str = "17";
const SCHEMA_VERSION: u32 = 5;
static INDEX_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Convert a Stardew/SMAPI locale identifier to the region-qualified locale
/// used by the official game-content index.
///
/// Mod i18n files intentionally keep their original names (`default`, `zh`,
/// etc.). This conversion is only for official corpus and semantic-index
/// lookups; unknown custom locales are preserved so they cannot accidentally
/// match another language.
pub(crate) fn canonical_locale(locale: &str) -> String {
    let trimmed = locale.trim();
    let normalized = trimmed.replace('_', "-").to_ascii_lowercase();
    let canonical = match normalized.as_str() {
        // `default` is SMAPI's final fallback file, not a language. Keep it
        // unresolved so callers can choose a language-aware fallback strategy.
        "" | "default" => "",
        "en" | "en-us" => "en-US",
        "zh" | "zh-cn" => "zh-CN",
        "ja" | "ja-jp" => "ja-JP",
        "ru" | "ru-ru" => "ru-RU",
        "pt" | "pt-br" => "pt-BR",
        "es" | "es-es" => "es-ES",
        "de" | "de-de" => "de-DE",
        "th" | "th-th" => "th-TH",
        "fr" | "fr-fr" => "fr-FR",
        "ko" | "ko-kr" => "ko-KR",
        "it" | "it-it" => "it-IT",
        "tr" | "tr-tr" => "tr-TR",
        "hu" | "hu-hu" => "hu-HU",
        _ => return trimmed.to_string(),
    };
    canonical.to_string()
}

fn is_default_locale(locale: &str) -> bool {
    let normalized = locale.trim().replace('_', "-").to_ascii_lowercase();
    normalized.is_empty() || normalized == "default"
}

#[derive(Clone)]
struct SourceFile {
    path: PathBuf,
    asset_path: String,
    locale: String,
    fingerprint: String,
}

#[derive(Default)]
struct UnitGroup {
    kind: String,
    eligibility: UnitEligibility,
    texts: BTreeMap<String, String>,
}

struct ExtractedUnit {
    key: String,
    text: String,
    kind: &'static str,
    eligibility: UnitEligibility,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct UnitEligibility {
    searchable: bool,
    semantic_eligible: bool,
    prompt_eligible: bool,
}

impl UnitEligibility {
    const SEARCHABLE_ONLY: Self = Self {
        searchable: true,
        semantic_eligible: false,
        prompt_eligible: false,
    };
    const PROMPT_SAFE: Self = Self {
        searchable: true,
        semantic_eligible: true,
        prompt_eligible: true,
    };

    fn for_source(self, source: &str) -> Self {
        let semantic_eligible = self.semantic_eligible && semantic_text_eligible(source);
        let prompt_eligible =
            self.prompt_eligible && semantic_eligible && prompt_text_eligible(source);
        Self {
            searchable: self.searchable,
            semantic_eligible,
            prompt_eligible,
        }
    }
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    let mut output = String::with_capacity(bytes.as_ref().len() * 2);
    for byte in bytes.as_ref() {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

fn semantic_identity(asset_path: &str, unit_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(asset_path.as_bytes());
    hasher.update([0]);
    hasher.update(unit_key.as_bytes());
    hex(hasher.finalize())
}

fn semantic_fingerprint(asset_path: &str, unit_key: &str, kind: &str, source: &str) -> String {
    let mut hasher = Sha256::new();
    for value in [asset_path, unit_key, kind, source] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hex(hasher.finalize())
}

fn prompt_text_eligible(source: &str) -> bool {
    let trimmed = source.trim();
    if trimmed.is_empty()
        || (trimmed.starts_with("??") && trimmed.ends_with("??"))
        || trimmed.chars().count() > 8_192
    {
        return false;
    }
    trimmed
        .chars()
        .filter(|character| character.is_alphabetic())
        .count()
        >= 4
}

fn semantic_text_eligible(source: &str) -> bool {
    let trimmed = source.trim();
    !trimmed.is_empty()
        && trimmed.chars().count() <= 8_192
        && trimmed
            .chars()
            .filter(|character| character.is_alphabetic())
            .count()
            >= 2
}

fn open() -> anyhow::Result<Connection> {
    let _guard = INDEX_OPEN_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = official_localization_index_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let existed = path.exists();
    let mut connection =
        Connection::open(&path).context("Failed to open the official localization index.")?;
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    let schema_version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let schema_objects: u32 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE name IN ('official_generations','official_assets','official_units','official_texts','official_texts_fts')",
        [],
        |row| row.get(0),
    )?;
    if existed && (schema_version != SCHEMA_VERSION || schema_objects != 5) {
        drop(connection);
        for candidate in [
            path.clone(),
            path.with_extension("sqlite3-wal"),
            path.with_extension("sqlite3-shm"),
        ] {
            if candidate.exists() {
                fs::remove_file(&candidate).with_context(|| {
                    format!(
                        "Failed to discard obsolete official localization index {}.",
                        candidate.display()
                    )
                })?;
            }
        }
        connection = Connection::open(&path)
            .context("Failed to recreate the official localization index.")?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    }
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS official_generations(
           id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, game_directory TEXT NOT NULL,
           game_version TEXT, created_at_ms INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0,
           error_count INTEGER NOT NULL DEFAULT 0);
         CREATE TABLE IF NOT EXISTS official_assets(
           id INTEGER PRIMARY KEY, generation_id TEXT NOT NULL, path TEXT NOT NULL,
           locale TEXT NOT NULL, category TEXT NOT NULL, fingerprint TEXT NOT NULL,
           UNIQUE(generation_id, path, locale));
         CREATE TABLE IF NOT EXISTS official_units(
           id INTEGER PRIMARY KEY, generation_id TEXT NOT NULL, asset_path TEXT NOT NULL,
           unit_key TEXT NOT NULL, unit_kind TEXT NOT NULL, context TEXT NOT NULL,
           searchable INTEGER NOT NULL, semantic_eligible INTEGER NOT NULL, prompt_eligible INTEGER NOT NULL,
           fingerprint TEXT NOT NULL, semantic_id TEXT NOT NULL, semantic_fingerprint TEXT NOT NULL,
           UNIQUE(generation_id, asset_path, unit_key), UNIQUE(generation_id, semantic_id));
         CREATE TABLE IF NOT EXISTS official_texts(
           id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES official_units(id) ON DELETE CASCADE,
           locale TEXT NOT NULL, text TEXT NOT NULL, text_hash TEXT NOT NULL, UNIQUE(unit_id, locale));
         CREATE VIRTUAL TABLE IF NOT EXISTS official_texts_fts
           USING fts5(text, content='official_texts', content_rowid='id', tokenize='trigram');
         PRAGMA user_version=5;",
    )?;
    Ok(connection)
}

fn localized_asset_path(path: &Path) -> (String, String) {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    for locale in LOCALES {
        let suffix = format!(".{locale}.xnb");
        if let Some(base) = name.strip_suffix(&suffix) {
            let mut logical = path.to_path_buf();
            logical.set_file_name(format!("{base}.xnb"));
            return (
                logical.to_string_lossy().replace('\\', "/"),
                (*locale).into(),
            );
        }
    }
    (path.to_string_lossy().replace('\\', "/"), "en-US".into())
}

fn scan_files(root: &Path, job_id: Option<&str>) -> anyhow::Result<(Vec<SourceFile>, String)> {
    let mut pending = vec![root.to_path_buf()];
    let mut paths = Vec::new();
    while let Some(directory) = pending.pop() {
        if let Some(job_id) = job_id {
            jobs::check(job_id)?;
        }
        for entry in fs::read_dir(&directory)
            .with_context(|| format!("Failed to read {}", directory.display()))?
        {
            let entry = entry?;
            let file_type = entry.file_type()?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                pending.push(entry.path());
                continue;
            }
            if file_type.is_file()
                && entry
                    .path()
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.eq_ignore_ascii_case("xnb"))
            {
                let is_font_asset = entry
                    .path()
                    .strip_prefix(root)
                    .ok()
                    .and_then(|path| path.components().next())
                    .is_some_and(|component| {
                        component
                            .as_os_str()
                            .to_string_lossy()
                            .eq_ignore_ascii_case("fonts")
                    });
                if is_font_asset {
                    continue;
                }
                paths.push(entry.path());
            }
        }
    }
    paths.sort();
    let mut index_fingerprint = Sha256::new();
    index_fingerprint.update(EXTRACTOR_VERSION.as_bytes());
    if let Some(game_directory) = root.parent() {
        if let Some(version) = ["Stardew Valley.dll", "Stardew Valley.exe"]
            .iter()
            .find_map(|name| read_windows_file_version(&game_directory.join(name)))
        {
            index_fingerprint.update(version.as_bytes());
        }
    }
    let mut files = Vec::with_capacity(paths.len());
    for path in paths {
        let relative = path
            .strip_prefix(root)
            .context("Official asset escaped the game content root.")?;
        let metadata = fs::metadata(&path)?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_millis())
            .unwrap_or(0);
        let (asset_path, locale) = localized_asset_path(relative);
        let fingerprint = hex(Sha256::digest(
            format!("{asset_path}\0{locale}\0{}\0{modified}", metadata.len()).as_bytes(),
        ));
        index_fingerprint.update(fingerprint.as_bytes());
        files.push(SourceFile {
            path,
            asset_path,
            locale,
            fingerprint,
        });
    }
    Ok((files, hex(index_fingerprint.finalize())))
}

fn classify(asset_path: &str) -> (&'static str, UnitEligibility) {
    let lower = asset_path.to_ascii_lowercase();
    if lower.starts_with("events/")
        || lower.contains("/events/")
        || lower.starts_with("movies/")
        || lower.contains("/movies/")
    {
        ("event-script", UnitEligibility::SEARCHABLE_ONLY)
    } else if lower.starts_with("data/") || lower.contains("/data/") {
        ("structured-record", UnitEligibility::SEARCHABLE_ONLY)
    } else if lower.starts_with("characters/dialogue/") || lower.contains("/characters/dialogue/") {
        ("dialogue", UnitEligibility::PROMPT_SAFE)
    } else if lower.starts_with("characters/schedules/") || lower.contains("/characters/schedules/")
    {
        ("schedule", UnitEligibility::SEARCHABLE_ONLY)
    } else if lower.starts_with("strings/") || lower.contains("/strings/") {
        if lower.contains("name") {
            ("term", UnitEligibility::PROMPT_SAFE)
        } else {
            ("plain-text", UnitEligibility::PROMPT_SAFE)
        }
    } else {
        ("opaque", UnitEligibility::SEARCHABLE_ONLY)
    }
}

fn normalized_field_name(key: &str) -> String {
    key.rsplit('/')
        .find(|segment| !segment.chars().all(|character| character.is_ascii_digit()))
        .unwrap_or(key)
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_visible_text_field(field: &str) -> bool {
    matches!(
        field,
        "displayname"
            | "description"
            | "dialogue"
            | "text"
            | "message"
            | "title"
            | "tooltip"
            | "question"
            | "response"
            | "greeting"
            | "label"
            | "flavortext"
            | "objective"
            | "summary"
            | "caption"
            | "dialogues"
            | "messages"
            | "questions"
            | "responses"
            | "greetings"
            | "labels"
            | "texts"
            | "titles"
            | "descriptions"
    ) || field.ends_with("displayname")
        || field.ends_with("description")
        || field.ends_with("dialogue")
        || field.ends_with("tooltip")
}

fn is_internal_field(field: &str) -> bool {
    matches!(
        field,
        "name"
            | "internalname"
            | "mappath"
            | "texture"
            | "asset"
            | "type"
            | "class"
            | "id"
            | "itemid"
            | "qualifieditemid"
            | "condition"
            | "conditions"
            | "query"
            | "music"
            | "musicid"
            | "sound"
            | "soundid"
            | "key"
            | "action"
            | "command"
            | "mailflag"
            | "location"
            | "sprite"
    ) || field.ends_with("internalname")
        || field.ends_with("mappath")
        || field.ends_with("texture")
        || field.ends_with("asset")
        || field.ends_with("condition")
        || field.ends_with("query")
        || field.ends_with("itemid")
        || field.ends_with("musicid")
        || field.ends_with("soundid")
        || field.ends_with("id")
        || field.ends_with("path")
        || field.ends_with("type")
        || field.ends_with("class")
        || field.ends_with("name") && !field.ends_with("displayname")
}

fn looks_like_internal_value(text: &str) -> bool {
    let trimmed = text.trim();
    let lower = trimmed.to_ascii_lowercase();
    if trimmed.contains('\\')
        || lower.ends_with(".xnb")
        || ["maps/", "characters/", "tilesheets/", "data/", "strings/"]
            .iter()
            .any(|prefix| lower.starts_with(prefix))
        || (trimmed.starts_with('(')
            && trimmed.find(')').is_some_and(|index| {
                trimmed[index + 1..]
                    .chars()
                    .all(|value| value.is_ascii_digit())
            }))
    {
        return true;
    }
    let condition_markers = [
        "==",
        "!=",
        ">=",
        "<=",
        "&&",
        "||",
        "has_",
        "player_",
        "location_",
    ];
    if condition_markers
        .iter()
        .any(|marker| lower.contains(marker))
    {
        return true;
    }
    let tokens = trimmed.split_whitespace().collect::<Vec<_>>();
    let numeric_tokens = tokens
        .iter()
        .filter(|token| token.parse::<f64>().is_ok())
        .count();
    let code_tokens = tokens
        .iter()
        .filter(|token| {
            token.len() <= 3
                && token
                    .chars()
                    .all(|character| character.is_ascii_uppercase())
                && token
                    .chars()
                    .any(|character| character.is_ascii_alphabetic())
        })
        .count();
    if (tokens.len() >= 8 && numeric_tokens >= 4 && numeric_tokens * 100 / tokens.len() >= 35)
        || (code_tokens >= 2 && numeric_tokens >= 3)
    {
        return true;
    }
    false
}

fn looks_like_natural_language(text: &str) -> bool {
    let trimmed = text.trim();
    !looks_like_internal_value(trimmed)
        && (trimmed.split_whitespace().count() >= 3
            || trimmed.chars().any(|character| {
                matches!(
                    character,
                    '.' | ',' | '!' | '?' | ';' | '。' | '，' | '！' | '？'
                )
            }))
}

fn leaf_eligibility(
    asset_path: &str,
    key: &str,
    text: &str,
    default: UnitEligibility,
) -> UnitEligibility {
    let lower_asset = asset_path.to_ascii_lowercase();
    if !(lower_asset.starts_with("data/") || lower_asset.contains("/data/")) {
        return default;
    }
    let field = normalized_field_name(key);
    if is_internal_field(&field) || looks_like_internal_value(text) {
        return UnitEligibility::SEARCHABLE_ONLY;
    }
    if is_visible_text_field(&field) || looks_like_natural_language(text) {
        return UnitEligibility::PROMPT_SAFE;
    }
    UnitEligibility::SEARCHABLE_ONLY
}

fn extract(asset_path: &str, value: &Value) -> anyhow::Result<Vec<ExtractedUnit>> {
    let (default_kind, default_eligibility) = classify(asset_path);
    if default_kind == "event-script" {
        return Ok(crate::domain::event_script::extract_visible_text(value)?
            .into_iter()
            .map(|(key, text)| ExtractedUnit {
                key,
                text,
                kind: "event-script",
                eligibility: UnitEligibility::SEARCHABLE_ONLY,
            })
            .collect());
    }
    if let Some(document) =
        crate::domain::localization::structured_translation::parse(asset_path, value)?
    {
        let mut units = document
            .corpus_units()
            .iter()
            .map(|unit| ExtractedUnit {
                key: unit.id.clone(),
                text: unit.text.clone(),
                kind: unit.kind,
                eligibility: if unit.prompt_eligible {
                    UnitEligibility::PROMPT_SAFE
                } else {
                    UnitEligibility::SEARCHABLE_ONLY
                },
            })
            .collect::<Vec<_>>();
        if let Some(records) = value.as_object() {
            for (key, value) in records {
                let Some(text) = value
                    .as_str()
                    .filter(|text| crate::domain::event_script::looks_like_event_script(text))
                else {
                    continue;
                };
                units.extend(
                    crate::domain::event_script::extract_visible_text_from_script(key, text)
                        .into_iter()
                        .map(|(key, text)| ExtractedUnit {
                            key,
                            text,
                            kind: "event-script",
                            eligibility: UnitEligibility::SEARCHABLE_ONLY,
                        }),
                );
            }
        }
        return Ok(units);
    }
    let mut units = Vec::new();
    flatten_classified(
        asset_path,
        value,
        "",
        default_kind,
        default_eligibility,
        &mut units,
    );
    Ok(units)
}

fn flatten_classified(
    asset_path: &str,
    value: &Value,
    key: &str,
    default_kind: &'static str,
    default_eligibility: UnitEligibility,
    output: &mut Vec<ExtractedUnit>,
) {
    match value {
        Value::String(text) if crate::domain::event_script::looks_like_event_script(text) => {
            let unit_key = if key.is_empty() { "$" } else { key };
            output.extend(
                crate::domain::event_script::extract_visible_text_from_script(unit_key, text)
                    .into_iter()
                    .map(|(key, text)| ExtractedUnit {
                        key,
                        text,
                        kind: "event-script",
                        eligibility: UnitEligibility::SEARCHABLE_ONLY,
                    }),
            );
        }
        Value::String(text)
            if crate::domain::localization::structured_translation::has_dialogue_protocol(text) =>
        {
            let unit_key = if key.is_empty() { "$" } else { key };
            output.extend(
                crate::domain::localization::structured_translation::dialogue_units(
                    unit_key, text, "dialogue", true,
                )
                .into_iter()
                .map(|unit| ExtractedUnit {
                    key: unit.id,
                    text: unit.text,
                    kind: unit.kind,
                    eligibility: if unit.prompt_eligible {
                        UnitEligibility::PROMPT_SAFE
                    } else {
                        UnitEligibility::SEARCHABLE_ONLY
                    },
                }),
            );
        }
        Value::String(text) => {
            if indexable_leaf_text(text) {
                output.push(ExtractedUnit {
                    key: if key.is_empty() {
                        "$".into()
                    } else {
                        key.into()
                    },
                    text: text.clone(),
                    kind: default_kind,
                    eligibility: leaf_eligibility(asset_path, key, text, default_eligibility),
                });
            }
        }
        Value::Array(values) => {
            for (index, value) in values.iter().enumerate() {
                flatten_classified(
                    asset_path,
                    value,
                    &format!("{key}/{index}"),
                    default_kind,
                    default_eligibility,
                    output,
                );
            }
        }
        Value::Object(values) => {
            for (name, value) in values {
                let next = if key.is_empty() {
                    name.clone()
                } else {
                    format!("{key}/{name}")
                };
                flatten_classified(
                    asset_path,
                    value,
                    &next,
                    default_kind,
                    default_eligibility,
                    output,
                );
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

fn asset_category(asset_path: &str) -> &str {
    asset_path.split('/').next().unwrap_or(asset_path)
}

#[cfg(test)]
fn flatten(value: &Value, key: &str, output: &mut Vec<(String, String)>) {
    match value {
        Value::String(text) => {
            if indexable_leaf_text(text) {
                output.push((
                    if key.is_empty() {
                        "$".into()
                    } else {
                        key.into()
                    },
                    text.clone(),
                ));
            }
        }
        Value::Array(values) => {
            for (index, value) in values.iter().enumerate() {
                flatten(value, &format!("{key}/{index}"), output);
            }
        }
        Value::Object(values) => {
            for (name, value) in values {
                let next = if key.is_empty() {
                    name.clone()
                } else {
                    format!("{key}/{name}")
                };
                flatten(value, &next, output);
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

fn indexable_leaf_text(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() || trimmed.chars().count() > 8_192 {
        return false;
    }
    let looks_like_encoded_binary = trimmed.len() >= 256
        && trimmed.len().is_multiple_of(4)
        && trimmed
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'='));
    !looks_like_encoded_binary
}

fn validated_root(game_directory: &str) -> anyhow::Result<PathBuf> {
    validate_game_directory(game_directory.to_string())?;
    let root = Path::new(game_directory).join("Content");
    if !root.is_dir() {
        bail!("The selected game directory does not contain the game Content directory.");
    }
    root.canonicalize()
        .context("Failed to resolve the game content directory.")
}

fn game_version(game_directory: &str) -> Option<String> {
    ["Stardew Valley.dll", "Stardew Valley.exe"]
        .iter()
        .find_map(|name| read_windows_file_version(&Path::new(game_directory).join(name)))
}

pub fn inspect(
    request: InspectOfficialLocalizationIndexRequest,
) -> anyhow::Result<AiOfficialCorpusStatus> {
    let root = validated_root(&request.game_directory)?;
    let (_, fingerprint) = scan_files(&root, None)?;
    let connection = open()?;
    let active = connection.query_row(
        "SELECT id,fingerprint,game_version,created_at_ms,error_count FROM official_generations WHERE active=1",
        [], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,Option<String>>(2)?,row.get::<_,i64>(3)?,row.get::<_,u64>(4)?)),
    ).optional()?;
    let (language_count, unit_count, semantic_eligible_count) = if let Some((id, ..)) = &active {
        (
            connection.query_row("SELECT COUNT(DISTINCT t.locale) FROM official_texts t JOIN official_units u ON u.id=t.unit_id WHERE u.generation_id=?", [id], |row| row.get(0))?,
            connection.query_row("SELECT COUNT(*) FROM official_units WHERE generation_id=?", [id], |row| row.get(0))?,
            connection.query_row("SELECT COUNT(*) FROM official_units WHERE generation_id=? AND semantic_eligible=1", [id], |row| row.get(0))?,
        )
    } else {
        (0, 0, 0)
    };
    Ok(AiOfficialCorpusStatus {
        indexed: active.is_some(),
        stale: active
            .as_ref()
            .is_some_and(|(_, stored, ..)| stored != &fingerprint),
        game_directory: request.game_directory.clone(),
        game_version: active
            .as_ref()
            .and_then(|(_, _, value, _, _)| value.clone())
            .or_else(|| game_version(&request.game_directory)),
        fingerprint,
        revision: active.as_ref().map(|(id, ..)| id.clone()),
        updated_at_ms: active.as_ref().map(|(_, _, _, value, _)| *value),
        language_count,
        unit_count,
        semantic_eligible_count,
        error_count: active.map(|(_, _, _, _, value)| value).unwrap_or(0),
    })
}

#[cfg(test)]
pub fn rebuild(
    request: RebuildOfficialLocalizationIndexRequest,
) -> anyhow::Result<AiOfficialCorpusStatus> {
    rebuild_with_progress(request, |_| {})
}

pub fn rebuild_with_progress(
    request: RebuildOfficialLocalizationIndexRequest,
    mut progress: impl FnMut(AiOfficialIndexProgress),
) -> anyhow::Result<AiOfficialCorpusStatus> {
    let root = validated_root(&request.game_directory)?;
    jobs::clear(&request.job_id);
    let result = (|| {
        let (files, fingerprint) = scan_files(&root, Some(&request.job_id))?;
        let total = files.len() as u64;
        progress(AiOfficialIndexProgress {
            job_id: request.job_id.clone(),
            phase: "parsing".into(),
            completed: 0,
            total,
        });
        let generation = uuid::Uuid::new_v4().to_string();
        let mut groups: BTreeMap<(String, String), UnitGroup> = BTreeMap::new();
        let mut error_count = 0_u64;
        for (index, file) in files.iter().enumerate() {
            jobs::check(&request.job_id)?;
            let value = match read_xnb_from_path(&file.path) {
                Ok(xnb) => xnb.content.to_json(),
                Err(_) => {
                    error_count += 1;
                    progress(AiOfficialIndexProgress {
                        job_id: request.job_id.clone(),
                        phase: "parsing".into(),
                        completed: index as u64 + 1,
                        total,
                    });
                    continue;
                }
            };
            let units = match extract(&file.asset_path, &value) {
                Ok(extracted) => extracted,
                Err(_) => {
                    error_count += 1;
                    progress(AiOfficialIndexProgress {
                        job_id: request.job_id.clone(),
                        phase: "parsing".into(),
                        completed: index as u64 + 1,
                        total,
                    });
                    continue;
                }
            };
            for unit in units {
                let group = groups
                    .entry((file.asset_path.clone(), unit.key))
                    .or_default();
                if file.locale == "en-US" || group.texts.is_empty() {
                    group.kind = unit.kind.into();
                    group.eligibility = unit.eligibility;
                }
                group.texts.insert(file.locale.clone(), unit.text);
            }
            progress(AiOfficialIndexProgress {
                job_id: request.job_id.clone(),
                phase: "parsing".into(),
                completed: index as u64 + 1,
                total,
            });
        }
        let mut connection = open()?;
        progress(AiOfficialIndexProgress {
            job_id: request.job_id.clone(),
            phase: "committing".into(),
            completed: total,
            total,
        });
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO official_generations(id,fingerprint,game_directory,game_version,created_at_ms,error_count) VALUES(?,?,?,?,?,?)",
            params![generation, fingerprint, request.game_directory, game_version(&request.game_directory), time::OffsetDateTime::now_utc().unix_timestamp() * 1000, error_count],
        )?;
        for file in &files {
            transaction.execute("INSERT INTO official_assets(generation_id,path,locale,category,fingerprint) VALUES(?,?,?,?,?)", params![generation,file.asset_path,file.locale,asset_category(&file.asset_path),file.fingerprint])?;
        }
        for ((asset_path, unit_key), group) in groups {
            jobs::check(&request.job_id)?;
            if !group.texts.contains_key("en-US") {
                continue;
            }
            let mut hasher = Sha256::new();
            hasher.update(asset_path.as_bytes());
            hasher.update([0]);
            hasher.update(unit_key.as_bytes());
            for (locale, text) in &group.texts {
                hasher.update(locale.as_bytes());
                hasher.update([0]);
                hasher.update(text.as_bytes());
            }
            let unit_fingerprint = hex(hasher.finalize());
            let semantic_id = semantic_identity(&asset_path, &unit_key);
            let source = group.texts.get("en-US").cloned().unwrap_or_default();
            let eligibility = group.eligibility.for_source(&source);
            let semantic_fingerprint =
                semantic_fingerprint(&asset_path, &unit_key, &group.kind, &source);
            transaction.execute(
                "INSERT INTO official_units(generation_id,asset_path,unit_key,unit_kind,context,searchable,semantic_eligible,prompt_eligible,fingerprint,semantic_id,semantic_fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                params![generation,asset_path,unit_key,group.kind,format!("{asset_path}#{unit_key}"),eligibility.searchable,eligibility.semantic_eligible,eligibility.prompt_eligible,unit_fingerprint,semantic_id,semantic_fingerprint],
            )?;
            let unit_id = transaction.last_insert_rowid();
            for (locale, text) in group.texts {
                transaction.execute(
                    "INSERT INTO official_texts(unit_id,locale,text,text_hash) VALUES(?,?,?,?)",
                    params![unit_id, locale, text, hex(Sha256::digest(text.as_bytes()))],
                )?;
                let text_id = transaction.last_insert_rowid();
                transaction.execute(
                    "INSERT INTO official_texts_fts(rowid,text) VALUES(?,?)",
                    params![text_id, text],
                )?;
            }
        }
        transaction.execute(
            "UPDATE official_generations SET active=0 WHERE active=1",
            [],
        )?;
        transaction.execute(
            "UPDATE official_generations SET active=1 WHERE id=?",
            [&generation],
        )?;
        transaction.execute("DELETE FROM official_texts_fts WHERE rowid IN (SELECT t.id FROM official_texts t JOIN official_units u ON u.id=t.unit_id WHERE u.generation_id<>?)", [&generation])?;
        transaction.execute("DELETE FROM official_texts WHERE unit_id IN (SELECT id FROM official_units WHERE generation_id<>?)", [&generation])?;
        transaction.execute(
            "DELETE FROM official_units WHERE generation_id<>?",
            [&generation],
        )?;
        transaction.execute(
            "DELETE FROM official_assets WHERE generation_id<>?",
            [&generation],
        )?;
        transaction.execute(
            "DELETE FROM official_generations WHERE id<>?",
            [&generation],
        )?;
        transaction.commit()?;
        inspect(InspectOfficialLocalizationIndexRequest {
            game_directory: request.game_directory.clone(),
        })
    })();
    jobs::clear(&request.job_id);
    result
}

fn lexical_score(query: &str, row: &AiOfficialUnit) -> (f64, &'static str) {
    let query = query.trim().to_lowercase();
    let text = row.source_text.trim().to_lowercase();
    let key = row.unit_key.trim().to_lowercase();
    if query == text || query == key {
        return (1.0, "exact");
    }
    let is_boundary = |value: &str| {
        value
            .split(|character: char| !character.is_alphanumeric() && character != '_')
            .any(|token| token == query)
    };
    if is_boundary(&text) || is_boundary(&key) || is_boundary(&row.asset_path.to_lowercase()) {
        return (0.9, "whole-token");
    }
    if text.contains(&query) || key.contains(&query) {
        return (0.35, "substring");
    }
    let score = crate::domain::localization::lexical::keyword_score(
        &query,
        &[&row.source_text, &row.unit_key, &row.asset_path],
    );
    if score > 0.0 {
        (score, "keyword")
    } else {
        (0.0, "semantic")
    }
}

fn merge_unit_entity_similarity(unit: Option<f64>, entity: Option<f64>) -> Option<f64> {
    match (unit, entity) {
        (Some(unit), Some(entity)) if entity > unit => Some(entity * 0.7 + unit * 0.3),
        (Some(unit), Some(_)) => Some(unit),
        (None, Some(entity)) => Some(entity),
        (unit, entity) => unit.or(entity),
    }
}

fn is_internal_structured_record(row: &AiOfficialUnit) -> bool {
    row.unit_kind == "structured-record"
        && row.asset_path.to_ascii_lowercase().contains("data/")
        && looks_like_internal_value(&row.source_text)
}

pub fn search(request: SearchOfficialLocalizationRequest) -> anyhow::Result<AiOfficialSearchPage> {
    search_with_semantic(request, None)
}

pub(crate) fn search_with_semantic(
    request: SearchOfficialLocalizationRequest,
    semantic_groups: Option<Vec<Vec<(String, String, f64)>>>,
) -> anyhow::Result<AiOfficialSearchPage> {
    if request.limit == 0 || request.limit > 200 {
        bail!("Official corpus page size must be between 1 and 200.");
    }
    if request.query.trim().is_empty() {
        return Ok(AiOfficialSearchPage {
            records: Vec::new(),
            total: 0,
        });
    }
    let connection = open()?;
    let active: String = connection
        .query_row(
            "SELECT id FROM official_generations WHERE active=1",
            [],
            |row| row.get(0),
        )
        .context("The official localization index has not been built.")?;
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(AiOfficialUnit {
            id: row.get(0)?,
            source_locale: request.source_locale.clone(),
            target_locale: request.target_locale.clone(),
            source_text: row.get(1)?,
            target_text: row.get(2)?,
            asset_path: row.get(3)?,
            unit_key: row.get(4)?,
            unit_kind: row.get(5)?,
            searchable: row.get(6)?,
            semantic_eligible: row.get(7)?,
            prompt_eligible: row.get(8)?,
            fingerprint: row.get(9)?,
            similarity: 0.0,
            score: 0.0,
            semantic_similarity: None,
            lexical_similarity: 0.0,
            match_kind: "none".into(),
            retrieval_mode: "lexical".into(),
        })
    };
    let literal_scan = request.allow_literal_scan && request.query.trim().chars().count() < 3;
    let mut rows = if literal_scan {
        let mut statement = connection.prepare(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_units u
             JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             WHERE u.generation_id=?3 AND u.searchable=1 AND instr(lower(s.text),lower(?4))>0
               AND (?5 IS NULL OR a.category=?5)
               AND (?6 IS NULL OR u.unit_kind=?6)
               AND (?7=0 OR u.prompt_eligible=1)
             ORDER BY u.id LIMIT 1000",
        )?;
        statement
            .query_map(
                params![
                    request.source_locale,
                    request.target_locale,
                    active,
                    request.query.trim(),
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only,
                ],
                map_row,
            )?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let fts_query = crate::domain::localization::lexical::fts_or_query(&request.query)
            .unwrap_or_else(|| format!("\"{}\"", request.query.replace('"', "\"\"")));
        let mut statement = connection.prepare(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_texts_fts f
             JOIN official_texts s ON s.id=f.rowid
             JOIN official_units u ON u.id=s.unit_id
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?1
             WHERE f.text MATCH ?2 AND (?3 IN ('','default') OR s.locale=?3) AND u.generation_id=?4 AND u.searchable=1
               AND (?5 IS NULL OR a.category=?5)
               AND (?6 IS NULL OR u.unit_kind=?6)
               AND (?7=0 OR u.prompt_eligible=1)
             LIMIT 1000",
        )?;
        statement
            .query_map(
                params![
                    request.target_locale,
                    fts_query,
                    request.source_locale,
                    active,
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only,
                ],
                map_row,
            )?
            .collect::<Result<Vec<_>, _>>()?
    };
    let mut semantic_groups = semantic_groups.unwrap_or_else(|| {
        match crate::domain::localization::semantic::search_candidate_groups(
            &[("official", 1_000), ("official-entity", 20)],
            None,
            "en-US",
            &request.query,
        ) {
            Ok(groups) => groups,
            Err(error) => {
                crate::domain::localization::operational_log::event("semantic.fallback")
                    .field("retrievalMode", "lexical")
                    .field(
                        "reason",
                        crate::domain::localization::operational_log::failure_category(&error),
                    )
                    .field("queries", 1)
                    .field("candidateGroups", 2)
                    .emit_debug(crate::domain::localization::operational_log::SEMANTIC);
                Vec::new()
            }
        }
    });
    let entity_semantic = semantic_groups.pop().unwrap_or_default();
    let semantic = semantic_groups.pop().unwrap_or_default();
    let semantic_by_id = semantic
        .into_iter()
        .map(|(id, fingerprint, similarity)| (id, (fingerprint, similarity)))
        .collect::<BTreeMap<_, _>>();
    let entity_semantic = entity_semantic
        .into_iter()
        .filter(|(_, _, similarity)| *similarity >= 0.80)
        .map(|(id, _, similarity)| (id, similarity))
        .collect::<BTreeMap<_, _>>();
    let existing = rows
        .iter()
        .map(|row| semantic_identity(&row.asset_path, &row.unit_key))
        .collect::<BTreeSet<_>>();
    let missing_semantic_ids = semantic_by_id
        .keys()
        .filter(|id| !existing.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    for source_ids in missing_semantic_ids.chunks(400) {
        let placeholders = (7..7 + source_ids.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_units u
             JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             WHERE u.generation_id=?3 AND u.searchable=1 AND u.semantic_eligible=1
               AND (?4 IS NULL OR a.category=?4) AND (?5 IS NULL OR u.unit_kind=?5)
               AND (?6=0 OR u.prompt_eligible=1) AND u.semantic_id IN ({placeholders})"
        );
        let mut values = vec![
            SqlValue::Text(request.source_locale.clone()),
            SqlValue::Text(request.target_locale.clone()),
            SqlValue::Text(active.clone()),
            request
                .asset_category
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
            request
                .unit_kind
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
            SqlValue::Integer(request.prompt_eligible_only.into()),
        ];
        values.extend(source_ids.iter().cloned().map(SqlValue::Text));
        let mut statement = connection.prepare(&sql)?;
        let candidates = statement
            .query_map(params_from_iter(values.iter()), map_row)?
            .collect::<Result<Vec<_>, _>>()?;
        for row in candidates {
            let source_id = semantic_identity(&row.asset_path, &row.unit_key);
            if semantic_by_id
                .get(&source_id)
                .is_some_and(|(fingerprint, _)| {
                    fingerprint
                        != &semantic_fingerprint(
                            &row.asset_path,
                            &row.unit_key,
                            &row.unit_kind,
                            &row.source_text,
                        )
                })
            {
                continue;
            }
            rows.push(row);
        }
    }
    let mut existing = rows
        .iter()
        .map(|row| semantic_identity(&row.asset_path, &row.unit_key))
        .collect::<BTreeSet<_>>();
    let mut entity_statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
         FROM official_units u
         JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
         JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
         WHERE LOWER(u.asset_path)=?3 AND u.generation_id=?4 AND u.searchable=1 AND (?5 IS NULL OR a.category=?5)
           AND (?6 IS NULL OR u.unit_kind=?6) AND (?7=0 OR u.prompt_eligible=1)"
    )?;
    for entity_id in entity_semantic.keys() {
        let Some(name) = entity_id.strip_prefix("character:") else {
            continue;
        };
        let asset_path = format!("characters/dialogue/{name}.xnb");
        let candidates = entity_statement
            .query_map(
                params![
                    request.source_locale,
                    request.target_locale,
                    asset_path,
                    active,
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only
                ],
                |row| {
                    Ok(AiOfficialUnit {
                        id: row.get(0)?,
                        source_locale: request.source_locale.clone(),
                        target_locale: request.target_locale.clone(),
                        source_text: row.get(1)?,
                        target_text: row.get(2)?,
                        asset_path: row.get(3)?,
                        unit_key: row.get(4)?,
                        unit_kind: row.get(5)?,
                        searchable: row.get(6)?,
                        semantic_eligible: row.get(7)?,
                        prompt_eligible: row.get(8)?,
                        fingerprint: row.get(9)?,
                        similarity: 0.0,
                        score: 0.0,
                        semantic_similarity: None,
                        lexical_similarity: 0.0,
                        match_kind: "none".into(),
                        retrieval_mode: "lexical".into(),
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        for row in candidates {
            if existing.insert(semantic_identity(&row.asset_path, &row.unit_key)) {
                rows.push(row);
            }
        }
    }
    for row in &mut rows {
        let (lexical, match_kind) = lexical_score(&request.query, row);
        let unit_semantic = semantic_by_id
            .get(&semantic_identity(&row.asset_path, &row.unit_key))
            .filter(|(fingerprint, _)| {
                fingerprint
                    == &semantic_fingerprint(
                        &row.asset_path,
                        &row.unit_key,
                        &row.unit_kind,
                        &row.source_text,
                    )
            })
            .map(|(_, similarity)| *similarity);
        let entity_semantic =
            character_entity_id(&row.asset_path).and_then(|id| entity_semantic.get(&id).copied());
        let semantic = merge_unit_entity_similarity(unit_semantic, entity_semantic);
        let strong_lexical_match = matches!(match_kind, "exact" | "whole-token");
        row.lexical_similarity = lexical;
        row.semantic_similarity = (!strong_lexical_match).then_some(semantic).flatten();
        let semantic_entity_match = !strong_lexical_match
            && entity_semantic.is_some_and(|entity| unit_semantic.is_none_or(|unit| entity > unit));
        row.match_kind = if semantic_entity_match {
            "semantic-entity"
        } else {
            match_kind
        }
        .into();
        row.retrieval_mode = if strong_lexical_match {
            "lexical"
        } else if semantic.is_some() {
            "semantic"
        } else {
            "lexical"
        }
        .into();
        row.score = if matches!(match_kind, "exact" | "whole-token") {
            lexical
        } else if let Some(semantic) = semantic.filter(|value| *value >= 0.80) {
            semantic * 0.8 + lexical * 0.2
        } else {
            lexical
        };
        row.similarity = row.score;
    }
    rows.retain(|row| {
        !is_internal_structured_record(row)
            && (matches!(row.match_kind.as_str(), "exact" | "whole-token")
                || row.semantic_similarity.is_some_and(|value| value >= 0.80)
                || row.lexical_similarity > 0.0)
    });
    rows.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.id.cmp(&right.id))
    });
    let total = rows.len() as u64;
    let records = rows
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect();
    Ok(AiOfficialSearchPage { records, total })
}

/// Search official text when the mod source is `default`.
///
/// SMAPI treats `default.json` as a final fallback, so its contents may be in
/// any language. Try every indexed game locale for lexical retrieval; use the
/// normal semantic candidates for English, whose vectors are the canonical
/// official source vectors.
pub(crate) fn search_with_locale_fallback(
    request: SearchOfficialLocalizationRequest,
    semantic_groups: Option<Vec<Vec<(String, String, f64)>>>,
) -> anyhow::Result<AiOfficialSearchPage> {
    if !is_default_locale(&request.source_locale) {
        return search_with_semantic(request, semantic_groups);
    }
    // `default` is intentionally treated as a wildcard source locale. The
    // lexical SQL path filters all indexed source locales in one connection;
    // this avoids reopening the database once per language for every entry.
    let mut request = request;
    request.source_locale = "default".into();
    search_with_semantic(request, Some(vec![Vec::new(), Vec::new()]))
}

pub fn active_revision() -> anyhow::Result<Option<String>> {
    open()?
        .query_row(
            "SELECT id FROM official_generations WHERE active=1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(Into::into)
}

#[derive(Clone, Debug)]
pub(crate) struct SemanticOfficialSource {
    pub id: String,
    pub text: String,
    pub context: String,
    pub fingerprint: String,
}

#[derive(Clone, Debug)]
pub(crate) struct SemanticOfficialEntity {
    pub id: String,
    pub text: String,
    pub context: String,
    pub fingerprint: String,
}

fn character_entity_id(asset_path: &str) -> Option<String> {
    let normalized = asset_path.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();
    let prefix = "characters/dialogue/";
    let start = lower.find(prefix)? + prefix.len();
    let name = normalized.get(start..)?.strip_suffix(".xnb")?;
    (!name.is_empty()).then(|| format!("character:{}", name.to_ascii_lowercase()))
}

fn activity_semantic_alias(activity: &str) -> Option<String> {
    let value = match activity {
        "sleep" | "work" | "sit" | "bed" | "stand" => return None,
        "guitar" => "guitar music musician band 吉他 音乐 乐队",
        "skateboarding" => "skateboard skateboarding 滑板",
        "gameboy" => "handheld video games gaming 掌机 电子游戏",
        "pool" => "pool billiards 台球",
        "football" => "football sports 橄榄球 运动",
        "lift_weights" => "weightlifting fitness exercise 举重 健身 锻炼",
        "jumprope" => "jump rope exercise 跳绳 运动",
        "paint" | "painting" => "painting art painter 绘画 艺术 画家",
        "read" | "reading" => "reading books 阅读 读书",
        "dance" => "dance dancing 舞蹈 跳舞",
        "drink" => "drinking alcohol 喝酒",
        "garden" => "gardening flowers 园艺 花卉",
        "tinker" => "engineering inventing machines 工程 发明 机械",
        "play" => "playing games 玩耍 游戏",
        _ => return Some(activity.replace('_', " ")),
    };
    Some(value.into())
}

pub(crate) fn semantic_entity_snapshot() -> anyhow::Result<Vec<SemanticOfficialEntity>> {
    let connection = open()?;
    let Some(revision) = active_revision()? else {
        return Ok(Vec::new());
    };
    let mut statement = connection.prepare(
        "SELECT u.asset_path,t.text FROM official_units u
         JOIN official_texts t ON t.unit_id=u.id AND t.locale='en-US'
         WHERE u.generation_id=? AND u.unit_kind='schedule' ORDER BY u.asset_path",
    )?;
    let mut activities = BTreeMap::<String, BTreeSet<String>>::new();
    for row in statement.query_map([&revision], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })? {
        let (asset_path, text) = row?;
        let normalized = asset_path.replace('\\', "/");
        let name = normalized
            .rsplit('/')
            .next()
            .and_then(|value| value.strip_suffix(".xnb"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if name.is_empty() || name == "template" {
            continue;
        }
        let prefix = format!("{name}_");
        for token in
            text.split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        {
            if let Some(activity) = token.to_ascii_lowercase().strip_prefix(&prefix) {
                if !activity.is_empty() {
                    activities
                        .entry(name.clone())
                        .or_default()
                        .insert(activity.to_string());
                }
            }
        }
    }
    Ok(activities
        .into_iter()
        .filter(|(_, activities)| !activities.is_empty())
        .filter_map(|(name, activities)| {
            let activities = activities
                .into_iter()
                .filter_map(|activity| activity_semantic_alias(&activity))
                .collect::<Vec<_>>()
                .join("; ");
            if activities.is_empty() {
                return None;
            }
            let text = format!("Character {name}. Activities and interests: {activities}.");
            let id = format!("character:{name}");
            Some(SemanticOfficialEntity {
                fingerprint: hex(Sha256::digest(text.as_bytes())),
                id,
                context: "Official character schedule activity profile".into(),
                text,
            })
        })
        .collect())
}

pub(crate) fn semantic_snapshot() -> anyhow::Result<(Option<String>, Vec<SemanticOfficialSource>)> {
    let connection = open()?;
    let Some(revision) = active_revision()? else {
        return Ok((None, Vec::new()));
    };
    let mut statement = connection.prepare(
        "SELECT u.semantic_id,u.asset_path,u.unit_key,u.unit_kind,t.text,u.semantic_fingerprint
         FROM official_units u JOIN official_texts t ON t.unit_id=u.id AND t.locale='en-US'
         WHERE u.generation_id=? AND u.semantic_eligible=1 ORDER BY u.id",
    )?;
    let records = statement
        .query_map([&revision], |row| {
            let asset: String = row.get(1)?;
            let key: String = row.get(2)?;
            let kind: String = row.get(3)?;
            let source: String = row.get(4)?;
            Ok(SemanticOfficialSource {
                id: row.get(0)?,
                text: source,
                context: format!("Type: {kind}\nAsset: {asset}\nKey: {key}"),
                fingerprint: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok((Some(revision), records))
}

pub fn find_prompt_examples_batch(
    source_locale: &str,
    target_locale: &str,
    queries: &[String],
) -> anyhow::Result<Vec<Vec<AiOfficialUnit>>> {
    let source_locale = if is_default_locale(source_locale) {
        source_locale.to_string()
    } else {
        canonical_locale(source_locale)
    };
    let target_locale = canonical_locale(target_locale);
    let semantic = if is_default_locale(&source_locale) {
        queries
            .iter()
            .map(|_| vec![Vec::new(), Vec::new()])
            .collect()
    } else {
        crate::domain::localization::semantic::search_candidate_groups_batch(
            &[("official", 1_000), ("official-entity", 20)],
            None,
            &source_locale,
            queries,
        )
        .unwrap_or_else(|error| {
            crate::domain::localization::operational_log::event("semantic.fallback")
                .field("retrievalMode", "lexical")
                .field(
                    "reason",
                    crate::domain::localization::operational_log::failure_category(&error),
                )
                .field("queries", queries.len())
                .field("candidateGroups", 2)
                .emit_debug(crate::domain::localization::operational_log::SEMANTIC);
            queries
                .iter()
                .map(|_| vec![Vec::new(), Vec::new()])
                .collect()
        })
    };
    queries
        .iter()
        .zip(semantic)
        .map(|(query, groups)| {
            Ok(search_with_locale_fallback(
                SearchOfficialLocalizationRequest {
                    source_locale: source_locale.to_string(),
                    target_locale: target_locale.clone(),
                    query: query.clone(),
                    asset_category: None,
                    unit_kind: None,
                    prompt_eligible_only: true,
                    allow_literal_scan: false,
                    offset: 0,
                    limit: 5,
                },
                Some(groups),
            )?
            .records)
        })
        .collect()
}

pub fn find_terms_in_text(
    source_locale: &str,
    target_locale: &str,
    source_text: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    if is_default_locale(source_locale) {
        let mut terms = Vec::new();
        let mut seen = BTreeSet::new();
        for locale in std::iter::once("en-US").chain(LOCALES.iter().copied()) {
            for term in find_terms_in_text_for_locale(locale, target_locale, source_text)? {
                if seen.insert((term.asset_path.clone(), term.unit_key.clone())) {
                    terms.push(term);
                }
            }
        }
        terms.sort_by(|left, right| {
            right
                .source_text
                .chars()
                .count()
                .cmp(&left.source_text.chars().count())
        });
        return Ok(terms);
    }
    find_terms_in_text_for_locale(&canonical_locale(source_locale), target_locale, source_text)
}

fn find_terms_in_text_for_locale(
    source_locale: &str,
    target_locale: &str,
    source_text: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    let target_locale = canonical_locale(target_locale);
    let connection = open()?;
    let active =
        active_revision()?.context("The official localization index has not been built.")?;
    let mut statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
         FROM official_units u
         JOIN official_texts s ON s.unit_id=u.id AND s.locale=?1
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
         WHERE u.generation_id=?3 AND u.unit_kind='term' AND u.prompt_eligible=1
           AND instr(lower(?4),lower(s.text))>0
         ORDER BY length(s.text) DESC,u.id
         LIMIT 50",
    )?;
    statement
        .query_map(
            params![&source_locale, &target_locale, active, source_text],
            |row| {
                Ok(AiOfficialUnit {
                    id: row.get(0)?,
                    source_locale: source_locale.to_string(),
                    target_locale: target_locale.to_string(),
                    source_text: row.get(1)?,
                    target_text: row.get(2)?,
                    asset_path: row.get(3)?,
                    unit_key: row.get(4)?,
                    unit_kind: row.get(5)?,
                    searchable: row.get(6)?,
                    semantic_eligible: row.get(7)?,
                    prompt_eligible: row.get(8)?,
                    fingerprint: row.get(9)?,
                    similarity: 1.0,
                    score: 1.0,
                    semantic_similarity: None,
                    lexical_similarity: 1.0,
                    match_kind: "exact".into(),
                    retrieval_mode: "lexical".into(),
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()
        .map_err(Into::into)
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/official_localization_tests.rs"]
mod tests;
