use super::types::{
    AiTranslationCacheEntry, AiTranslationCacheStats, ReadAiTranslationCacheRequest,
};
use crate::domain::app_paths::ai_translation_cache_path;
use anyhow::Context;
use rusqlite::{Connection, OptionalExtension, params};
use std::fs;
use std::path::{Path, PathBuf};

const MAX_SCOPE_KEY_BYTES: usize = 512;
const MAX_LOCALE_BYTES: usize = 64;
const MAX_SOURCE_HASH_BYTES: usize = 128;
const MAX_TRANSLATED_TEXT_BYTES: usize = 8 * 1024 * 1024;
const MAX_PROFILE_ID_BYTES: usize = 128;
const MAX_MODEL_ID_BYTES: usize = 256;

fn validate_field(value: &str, field: &str, max_bytes: usize) -> anyhow::Result<()> {
    if value.trim().is_empty() {
        anyhow::bail!("AI translation cache {field} cannot be empty.");
    }
    if value.len() > max_bytes {
        anyhow::bail!("AI translation cache {field} exceeds the {max_bytes} byte limit.");
    }
    Ok(())
}

fn validate_lookup(request: &ReadAiTranslationCacheRequest) -> anyhow::Result<()> {
    validate_field(&request.scope_key, "scope key", MAX_SCOPE_KEY_BYTES)?;
    validate_field(&request.target_locale, "target locale", MAX_LOCALE_BYTES)?;
    validate_field(&request.source_hash, "source hash", MAX_SOURCE_HASH_BYTES)
}

fn validate_entry(entry: &AiTranslationCacheEntry) -> anyhow::Result<()> {
    validate_lookup(&ReadAiTranslationCacheRequest {
        scope_key: entry.scope_key.clone(),
        target_locale: entry.target_locale.clone(),
        source_hash: entry.source_hash.clone(),
    })?;
    validate_field(
        &entry.translated_text,
        "translated text",
        MAX_TRANSLATED_TEXT_BYTES,
    )?;
    validate_field(
        &entry.provider_profile_id,
        "provider profile id",
        MAX_PROFILE_ID_BYTES,
    )?;
    validate_field(&entry.model, "model id", MAX_MODEL_ID_BYTES)
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path)
        .map(|metadata| metadata.len())
        .unwrap_or(0)
}

fn open_cache_at(path: &Path) -> anyhow::Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("Failed to create the AI cache directory.")?;
    }
    let connection = Connection::open(path).context("Failed to open the AI translation cache.")?;
    connection
        .execute_batch("PRAGMA journal_mode=WAL;")
        .context("Failed to configure the AI translation cache.")?;
    let version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, u32>(0))
        .context("Failed to read the AI translation cache version.")?;
    if version != 0 && version != 2 {
        anyhow::bail!(
            "AI translation cache version {version} is not supported; delete the development cache and reopen the application."
        );
    }
    if version == 0 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
         CREATE TABLE translations (
           scope_key TEXT NOT NULL,
           target_locale TEXT NOT NULL,
           source_hash TEXT NOT NULL,
           translated_text TEXT NOT NULL,
           provider_profile_id TEXT NOT NULL,
           model TEXT NOT NULL,
           updated_at_ms INTEGER NOT NULL,
           PRIMARY KEY (scope_key, target_locale)
         );
         PRAGMA user_version=2;
         COMMIT;",
            )
            .context("Failed to initialize the AI translation cache.")?;
    }
    Ok(connection)
}

fn open_cache() -> anyhow::Result<Connection> {
    open_cache_at(&ai_translation_cache_path()?)
}

fn read_from(
    connection: &Connection,
    request: &ReadAiTranslationCacheRequest,
) -> anyhow::Result<Option<AiTranslationCacheEntry>> {
    connection.query_row(
        "SELECT scope_key, target_locale, source_hash, translated_text, provider_profile_id, model, updated_at_ms
         FROM translations WHERE scope_key = ?1 AND target_locale = ?2 AND source_hash = ?3",
        params![request.scope_key, request.target_locale, request.source_hash],
        |row| Ok(AiTranslationCacheEntry {
            scope_key: row.get(0)?, target_locale: row.get(1)?, source_hash: row.get(2)?, translated_text: row.get(3)?,
            provider_profile_id: row.get(4)?, model: row.get(5)?, updated_at_ms: row.get(6)?,
        }),
    ).optional().context("Failed to read the AI translation cache.")
}

pub fn read_ai_translation_cache(
    request: ReadAiTranslationCacheRequest,
) -> anyhow::Result<Option<AiTranslationCacheEntry>> {
    validate_lookup(&request)?;
    read_from(&open_cache()?, &request)
}

fn write_to(connection: &Connection, entry: &AiTranslationCacheEntry) -> anyhow::Result<()> {
    connection.execute(
        "INSERT INTO translations(scope_key, target_locale, source_hash, translated_text, provider_profile_id, model, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(scope_key, target_locale) DO UPDATE SET source_hash=excluded.source_hash,
         translated_text=excluded.translated_text, provider_profile_id=excluded.provider_profile_id,
         model=excluded.model, updated_at_ms=excluded.updated_at_ms",
        params![entry.scope_key, entry.target_locale, entry.source_hash, entry.translated_text, entry.provider_profile_id, entry.model, entry.updated_at_ms],
    ).context("Failed to write the AI translation cache.")?;
    Ok(())
}

pub fn write_ai_translation_cache(
    entry: AiTranslationCacheEntry,
) -> anyhow::Result<AiTranslationCacheEntry> {
    validate_entry(&entry)?;
    write_to(&open_cache()?, &entry)?;
    Ok(entry)
}

fn stats_from(connection: &Connection, path: &Path) -> anyhow::Result<AiTranslationCacheStats> {
    let entry_count = connection
        .query_row("SELECT COUNT(*) FROM translations", [], |row| {
            row.get::<_, u64>(0)
        })
        .context("Failed to count AI translation cache entries.")?;
    Ok(AiTranslationCacheStats {
        entry_count,
        size_bytes: file_size(path)
            .saturating_add(file_size(&sidecar_path(path, "-wal")))
            .saturating_add(file_size(&sidecar_path(path, "-shm"))),
    })
}

pub fn get_ai_translation_cache_stats() -> anyhow::Result<AiTranslationCacheStats> {
    let path = ai_translation_cache_path()?;
    let connection = open_cache_at(&path)?;
    stats_from(&connection, &path)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/cache_tests.rs"]
mod tests;

pub fn clear_ai_translation_cache() -> anyhow::Result<AiTranslationCacheStats> {
    let path = ai_translation_cache_path()?;
    let connection = open_cache_at(&path)?;
    connection
        .execute("DELETE FROM translations", [])
        .context("Failed to clear the AI translation cache.")?;
    connection
        .execute_batch("VACUUM")
        .context("Failed to compact the AI translation cache.")?;
    drop(connection);
    get_ai_translation_cache_stats()
}
