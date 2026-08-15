use super::shared::{INDEX_OPEN_LOCK, SCHEMA_VERSION};
use crate::domain::app_paths::official_localization_index_path;
use anyhow::Context;
use rusqlite::{Connection, OptionalExtension};
use std::fs;
use std::sync::Mutex;
use std::time::Duration;

pub(crate) fn open() -> anyhow::Result<Connection> {
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
