use crate::domain::app_paths::ai_localization_knowledge_path;
use anyhow::{Context, bail};
use rusqlite::{Connection, Transaction, params};
use sha2::{Digest, Sha256};
use std::fs;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub(crate) const GLOBAL_SCOPE_ID: &str = "00000000-0000-0000-0000-000000000001";
const EXAMPLE_SCOPE_ID: &str = "00000000-0000-0000-0000-000000000002";
static KNOWLEDGE_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
pub(crate) fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() * 1000
}
pub(crate) fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}
pub(crate) fn text_hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub(crate) fn normalized_binding(kind: &str, value: &str) -> anyhow::Result<(String, String)> {
    let kind = kind.trim();
    let value = value.trim();
    if value.is_empty() {
        bail!("Localization scope binding cannot be empty.")
    }
    let normalized = match kind {
        "project-unique-id" | "installed-mod" => value.to_lowercase(),
        "draft-key" => value.to_string(),
        "canonical-path-hash" => {
            let canonical = fs::canonicalize(value)
                .with_context(|| format!("Failed to resolve localization project path {value}."))?;
            let mut path = canonical.to_string_lossy().replace('\\', "/");
            if cfg!(windows) {
                path.make_ascii_lowercase();
            }
            text_hash(&path)
        }
        _ => bail!("Unsupported localization scope binding kind."),
    };
    Ok((kind.to_string(), normalized))
}

pub(crate) fn open() -> anyhow::Result<Connection> {
    let _guard = KNOWLEDGE_OPEN_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = ai_localization_knowledge_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut connection =
        Connection::open(path).context("Failed to open localization knowledge.")?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .context("Failed to configure localization knowledge busy timeout.")?;
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS localization_scopes(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,last_used_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scope_bindings(binding_kind TEXT NOT NULL,binding_value TEXT NOT NULL,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,UNIQUE(binding_kind,binding_value));
CREATE TABLE IF NOT EXISTS scope_settings(scope_id TEXT PRIMARY KEY REFERENCES localization_scopes(id) ON DELETE CASCADE,default_engine_kind TEXT,default_engine_profile_id TEXT,review_profile_id TEXT,knowledge_enabled INTEGER NOT NULL DEFAULT 0,use_official INTEGER NOT NULL DEFAULT 1,use_global INTEGER NOT NULL DEFAULT 1,use_project INTEGER NOT NULL DEFAULT 1,auto_review INTEGER NOT NULL DEFAULT 0,qa_empty INTEGER NOT NULL DEFAULT 1,qa_language_mix INTEGER NOT NULL DEFAULT 1,qa_whitespace INTEGER NOT NULL DEFAULT 1,qa_line_breaks INTEGER NOT NULL DEFAULT 1,qa_length INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS glossary_entries(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,source_term TEXT NOT NULL,target_term TEXT NOT NULL,normalized_source TEXT NOT NULL,match_mode TEXT NOT NULL,do_not_translate INTEGER NOT NULL,notes TEXT NOT NULL,updated_at_ms INTEGER NOT NULL,UNIQUE(scope_id,source_locale,target_locale,normalized_source));
CREATE INDEX IF NOT EXISTS glossary_scope ON glossary_entries(scope_id,source_locale,target_locale);
CREATE TABLE IF NOT EXISTS style_guides(scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,target_locale TEXT NOT NULL,tone TEXT NOT NULL,audience TEXT NOT NULL,formality TEXT NOT NULL,forbidden_phrases TEXT NOT NULL,preferred_phrases TEXT NOT NULL,rules TEXT NOT NULL,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(scope_id,target_locale));
CREATE TABLE IF NOT EXISTS translation_memory(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,source_text TEXT NOT NULL,target_text TEXT NOT NULL,source_hash TEXT NOT NULL,source_kind TEXT NOT NULL,file_namespace TEXT,unit_key TEXT,confirmed_at_ms INTEGER NOT NULL,use_count INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS tm_auto_unique ON translation_memory(scope_id,source_locale,target_locale,file_namespace,unit_key) WHERE source_kind='automatic';
CREATE UNIQUE INDEX IF NOT EXISTS tm_manual_unique ON translation_memory(scope_id,source_locale,target_locale,source_hash) WHERE source_kind<>'automatic';
CREATE INDEX IF NOT EXISTS tm_scope ON translation_memory(scope_id,source_locale,target_locale,confirmed_at_ms);
CREATE TABLE IF NOT EXISTS review_runs(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,engine TEXT NOT NULL,status TEXT NOT NULL,summary_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS review_issues(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,unit_key TEXT NOT NULL,source_hash TEXT NOT NULL,target_hash TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,suggestion TEXT,source_snapshot TEXT NOT NULL,target_snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);")?;
    for migration in [
        "ALTER TABLE scope_settings ADD COLUMN qa_empty INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_language_mix INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_whitespace INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_line_breaks INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_length INTEGER NOT NULL DEFAULT 1",
    ] {
        if let Err(error) = connection.execute(migration, []) {
            if !error.to_string().contains("duplicate column name") {
                return Err(error.into());
            }
        }
    }
    let timestamp = now();
    connection.execute(
        "UPDATE localization_scopes SET kind='profile' WHERE kind='project'",
        [],
    )?;
    connection.execute("INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'global','Global knowledge',?,?,?)",params![GLOBAL_SCOPE_ID,timestamp,timestamp,timestamp])?;
    connection.execute(
        "INSERT OR IGNORE INTO scope_settings(scope_id) VALUES(?)",
        [GLOBAL_SCOPE_ID],
    )?;
    let schema_version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if schema_version < 1 {
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile','示例项目',?,?,?)",
            params![EXAMPLE_SCOPE_ID, timestamp, timestamp, timestamp],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO scope_settings(scope_id,knowledge_enabled,use_official,use_global,use_project) VALUES(?,1,1,1,1)",
            [EXAMPLE_SCOPE_ID],
        )?;
        tx.execute_batch("PRAGMA user_version=1;")?;
        tx.commit()?;
    }
    let example_seeded: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM knowledge_metadata WHERE key='example-project-v2')",
        [],
        |row| row.get(0),
    )?;
    if !example_seeded {
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile','示例项目',?,?,?)",
            params![EXAMPLE_SCOPE_ID, timestamp, timestamp, timestamp],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO scope_settings(scope_id) VALUES(?)",
            [EXAMPLE_SCOPE_ID],
        )?;
        {
            tx.execute(
                "UPDATE localization_scopes SET revision=revision+1,updated_at_ms=? WHERE id=?",
                params![timestamp, EXAMPLE_SCOPE_ID],
            )?;
            tx.execute(
                "UPDATE scope_settings SET knowledge_enabled=1,use_official=1,use_global=1,use_project=1,auto_review=1,qa_empty=1,qa_language_mix=1,qa_whitespace=1,qa_line_breaks=1,qa_length=1 WHERE scope_id=?",
                [EXAMPLE_SCOPE_ID],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO scope_bindings(binding_kind,binding_value,scope_id) VALUES('project-unique-id','modforge.example.localization',?)",
                [EXAMPLE_SCOPE_ID],
            )?;
            for (id, source, target, mode, do_not_translate, notes) in [
                (
                    "example-glossary-1",
                    "Pelican Town",
                    "鹈鹕镇",
                    "exact",
                    false,
                    "示例地名术语",
                ),
                (
                    "example-glossary-2",
                    "Stardew Valley",
                    "星露谷物语",
                    "case-insensitive",
                    true,
                    "品牌名保持统一",
                ),
            ] {
                tx.execute(
                    "INSERT OR IGNORE INTO glossary_entries(id,scope_id,source_locale,target_locale,source_term,target_term,normalized_source,match_mode,do_not_translate,notes,updated_at_ms) VALUES(?,?,'en-US','zh-CN',?,?,?,?,?,?,?)",
                    params![id,EXAMPLE_SCOPE_ID,source,target,normalize(source),mode,do_not_translate,notes,timestamp],
                )?;
            }
            for (id, source, target, namespace, key, use_count) in [
                (
                    "example-memory-1",
                    "Welcome to Pelican Town!",
                    "欢迎来到鹈鹕镇！",
                    "i18n/zh-CN.json",
                    "welcome.town",
                    3,
                ),
                (
                    "example-memory-2",
                    "The valley looks beautiful today.",
                    "今天的山谷真美。",
                    "i18n/zh-CN.json",
                    "dialogue.valley",
                    1,
                ),
            ] {
                tx.execute(
                    "INSERT OR IGNORE INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count) VALUES(?,?,'en-US','zh-CN',?,?,?,'manual',?,?,?,?)",
                    params![id,EXAMPLE_SCOPE_ID,source,target,text_hash(source),namespace,key,timestamp,use_count],
                )?;
            }
            tx.execute(
                "INSERT OR IGNORE INTO style_guides(scope_id,target_locale,tone,audience,formality,forbidden_phrases,preferred_phrases,rules,updated_at_ms) VALUES(?,'zh-CN','自然、温暖、简洁','星露谷物语玩家','半正式',?,?,?,?)",
                params![EXAMPLE_SCOPE_ID,serde_json::to_string(&vec!["机翻腔", "过度书面化"] )?,serde_json::to_string(&vec!["自然口语", "角色语气一致"] )?,serde_json::to_string(&vec!["保留所有占位符和控制标记", "地名与人物名优先使用官方译名", "对话避免逐字直译"] )?,timestamp],
            )?;
        }
        tx.execute(
            "INSERT INTO knowledge_metadata(key,value) VALUES('example-project-v2',?)",
            [timestamp.to_string()],
        )?;
        tx.execute_batch("PRAGMA user_version=2;")?;
        tx.commit()?;
    }
    Ok(connection)
}

pub(crate) fn bump(tx: &Transaction<'_>, scope_id: &str) -> anyhow::Result<()> {
    if tx.execute(
        "UPDATE localization_scopes SET revision=revision+1,updated_at_ms=? WHERE id=?",
        params![now(), scope_id],
    )? != 1
    {
        bail!("Localization scope does not exist.")
    }
    Ok(())
}

pub(crate) fn bump_import(tx: &Transaction<'_>, scope_id: &str) -> anyhow::Result<()> {
    bump(tx, scope_id)
}
