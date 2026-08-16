use super::persistence::open;
use super::shared::{
    EXTRACTOR_VERSION, LOCALES, UnitEligibility, hex, semantic_fingerprint, semantic_identity,
};
use crate::domain::assets::validate_game_directory;
use crate::domain::launcher::updates::read_windows_file_version;
use crate::domain::localization::{jobs, types::*};
use crate::infrastructure::fs::pathing::normalize_separators;
use crate::infrastructure::game_formats::xnb::read_xnb_from_path;
use anyhow::{Context, bail};
use rusqlite::{OptionalExtension, params};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

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

pub(crate) struct ExtractedUnit {
    pub(crate) key: String,
    pub(crate) text: String,
    pub(crate) kind: &'static str,
    pub(crate) eligibility: UnitEligibility,
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
                normalize_separators(&logical.to_string_lossy()),
                (*locale).into(),
            );
        }
    }
    (
        normalize_separators(&path.to_string_lossy()),
        "en-US".into(),
    )
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

pub(crate) fn classify(asset_path: &str) -> (&'static str, UnitEligibility) {
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

pub(crate) fn looks_like_internal_value(text: &str) -> bool {
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

pub(crate) fn extract(asset_path: &str, value: &Value) -> anyhow::Result<Vec<ExtractedUnit>> {
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
pub(crate) fn flatten(value: &Value, key: &str, output: &mut Vec<(String, String)>) {
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
pub(crate) fn rebuild(
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
