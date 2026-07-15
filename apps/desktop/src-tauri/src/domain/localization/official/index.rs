use crate::domain::app_paths::official_localization_index_path;
use crate::domain::assets::validate_game_directory;
use crate::domain::launcher::updates::read_windows_file_version;
use crate::domain::localization::{jobs, types::*};
use crate::infrastructure::game_formats::xnb::read_xnb_from_path;
use anyhow::{Context, bail};
use rusqlite::{Connection, OptionalExtension, params};
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
const EXTRACTOR_VERSION: &str = "3";
const SCHEMA_VERSION: u32 = 3;
static INDEX_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

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
    prompt_eligible: bool,
    texts: BTreeMap<String, String>,
}

fn hex(bytes: impl AsRef<[u8]>) -> String {
    let mut output = String::with_capacity(bytes.as_ref().len() * 2);
    for byte in bytes.as_ref() {
        let _ = write!(output, "{byte:02x}");
    }
    output
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
           unit_key TEXT NOT NULL, unit_kind TEXT NOT NULL, context TEXT NOT NULL, prompt_eligible INTEGER NOT NULL,
           fingerprint TEXT NOT NULL, UNIQUE(generation_id, asset_path, unit_key));
         CREATE TABLE IF NOT EXISTS official_texts(
           id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES official_units(id) ON DELETE CASCADE,
           locale TEXT NOT NULL, text TEXT NOT NULL, text_hash TEXT NOT NULL, UNIQUE(unit_id, locale));
         CREATE VIRTUAL TABLE IF NOT EXISTS official_texts_fts
           USING fts5(text, content='official_texts', content_rowid='id', tokenize='trigram');
         PRAGMA user_version=3;",
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

fn classify(asset_path: &str) -> (&'static str, bool) {
    let lower = asset_path.to_ascii_lowercase();
    if lower.starts_with("events/")
        || lower.contains("/events/")
        || lower.starts_with("movies/")
        || lower.contains("/movies/")
    {
        ("event-script", false)
    } else if lower.starts_with("strings/") || lower.contains("/strings/") {
        if lower.contains("name") || lower.ends_with("strings/characters.xnb") {
            ("term", true)
        } else {
            ("plain-text", true)
        }
    } else if lower.contains("dialogue") || lower.contains("characters") {
        ("dialogue", true)
    } else if lower.starts_with("data/") || lower.contains("/data/") {
        ("structured-record", false)
    } else {
        ("opaque", false)
    }
}

fn extract(asset_path: &str, value: &Value) -> (Vec<(String, String)>, &'static str, bool) {
    let (kind, prompt_eligible) = classify(asset_path);
    if prompt_eligible {
        let mut texts = Vec::new();
        flatten(value, "", &mut texts);
        return (texts, kind, true);
    }
    let mut ignored_texts = Vec::new();
    flatten(value, "", &mut ignored_texts);
    let text = match value {
        Value::String(value) => value.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    };
    (vec![("$".into(), text)], kind, false)
}

fn asset_category(asset_path: &str) -> &str {
    asset_path.split('/').next().unwrap_or(asset_path)
}

fn flatten(value: &Value, key: &str, output: &mut Vec<(String, String)>) {
    match value {
        Value::String(text) => {
            output.push((key.to_string(), text.clone()));
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
    let (language_count, unit_count) = if let Some((id, ..)) = &active {
        (
            connection.query_row("SELECT COUNT(DISTINCT t.locale) FROM official_texts t JOIN official_units u ON u.id=t.unit_id WHERE u.generation_id=?", [id], |row| row.get(0))?,
            connection.query_row("SELECT COUNT(*) FROM official_units WHERE generation_id=?", [id], |row| row.get(0))?,
        )
    } else {
        (0, 0)
    };
    Ok(AiOfficialCorpusStatus {
        indexed: active.is_some(),
        stale: active
            .as_ref()
            .is_some_and(|(_, stored, ..)| stored != &fingerprint),
        game_directory: request.game_directory,
        game_version: active
            .as_ref()
            .and_then(|(_, _, value, _, _)| value.clone()),
        fingerprint,
        revision: active.as_ref().map(|(id, ..)| id.clone()),
        updated_at_ms: active.as_ref().map(|(_, _, _, value, _)| *value),
        language_count,
        unit_count,
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
            let (texts, kind, prompt_eligible) = extract(&file.asset_path, &value);
            for (key, text) in texts {
                let group = groups.entry((file.asset_path.clone(), key)).or_default();
                group.kind = kind.into();
                group.prompt_eligible = prompt_eligible;
                group.texts.insert(file.locale.clone(), text);
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
            transaction.execute(
                "INSERT INTO official_units(generation_id,asset_path,unit_key,unit_kind,context,prompt_eligible,fingerprint) VALUES(?,?,?,?,?,?,?)",
                params![generation,asset_path,unit_key,group.kind,format!("{asset_path}#{unit_key}"),group.prompt_eligible,unit_fingerprint],
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

fn similarity(left: &str, right: &str) -> f64 {
    if left == right {
        return 1.0;
    }
    let left = left.to_lowercase().chars().collect::<BTreeSet<_>>();
    let right = right.to_lowercase().chars().collect::<BTreeSet<_>>();
    let union = left.union(&right).count();
    if union == 0 {
        0.0
    } else {
        left.intersection(&right).count() as f64 / union as f64
    }
}

pub fn search(request: SearchOfficialLocalizationRequest) -> anyhow::Result<AiOfficialSearchPage> {
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
    let fts_query = format!("\"{}\"", request.query.replace('"', "\"\""));
    let mut statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.prompt_eligible,u.fingerprint
         FROM official_texts_fts f
         JOIN official_texts s ON s.id=f.rowid
         JOIN official_units u ON u.id=s.unit_id
         JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?1
         WHERE f.text MATCH ?2 AND s.locale=?3 AND u.generation_id=?4
           AND (?5 IS NULL OR a.category=?5)
           AND (?6 IS NULL OR u.unit_kind=?6)
           AND (?7=0 OR u.prompt_eligible=1)
         LIMIT 50",
    )?;
    let mut rows = statement
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
                    prompt_eligible: row.get(6)?,
                    fingerprint: row.get(7)?,
                    similarity: 0.0,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    for row in &mut rows {
        row.similarity = similarity(&request.query, &row.source_text);
    }
    rows.sort_by(|left, right| right.similarity.total_cmp(&left.similarity));
    rows.retain(|row| row.similarity >= 0.78);
    let total = rows.len() as u64;
    let records = rows
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect();
    Ok(AiOfficialSearchPage { records, total })
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

pub fn find_prompt_examples(
    source_locale: &str,
    target_locale: &str,
    query: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    Ok(search(SearchOfficialLocalizationRequest {
        source_locale: source_locale.into(),
        target_locale: target_locale.into(),
        query: query.into(),
        asset_category: None,
        unit_kind: None,
        prompt_eligible_only: true,
        offset: 0,
        limit: 5,
    })?
    .records)
}

pub fn find_terms_in_text(
    source_locale: &str,
    target_locale: &str,
    source_text: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    let connection = open()?;
    let active =
        active_revision()?.context("The official localization index has not been built.")?;
    let mut statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.prompt_eligible,u.fingerprint
         FROM official_units u
         JOIN official_texts s ON s.unit_id=u.id AND s.locale=?1
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
         WHERE u.generation_id=?3 AND u.unit_kind='term'
           AND instr(lower(?4),lower(s.text))>0
         ORDER BY length(s.text) DESC,u.id
         LIMIT 50",
    )?;
    statement
        .query_map(
            params![source_locale, target_locale, active, source_text],
            |row| {
                Ok(AiOfficialUnit {
                    id: row.get(0)?,
                    source_locale: source_locale.into(),
                    target_locale: target_locale.into(),
                    source_text: row.get(1)?,
                    target_text: row.get(2)?,
                    asset_path: row.get(3)?,
                    unit_key: row.get(4)?,
                    unit_kind: row.get(5)?,
                    prompt_eligible: row.get(6)?,
                    fingerprint: row.get(7)?,
                    similarity: 1.0,
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()
        .map_err(Into::into)
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/official_localization_tests.rs"]
mod tests;
