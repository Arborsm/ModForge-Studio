use crate::domain::app_paths::localization_semantic_index_path;
use crate::domain::localization::types::AiSemanticIndexStatus;
use anyhow::bail;
use rusqlite::{Connection, params};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::sync::{Arc, Mutex, Once, OnceLock};
use std::time::Duration;

const SCHEMA_VERSION: u32 = 2;

#[derive(Clone, Debug)]
pub struct SemanticVectorRecord {
    pub source_kind: String,
    pub source_id: String,
    pub source_fingerprint: String,
    pub scope_id: Option<String>,
    pub source_locale: String,
    pub vector: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SemanticMatch {
    pub source_id: String,
    pub source_fingerprint: String,
    pub similarity: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ActiveGeneration {
    pub id: String,
    pub model_key: String,
    pub model_id: String,
    pub dimensions: u32,
    pub fingerprints: BTreeMap<(String, String), (String, Option<String>)>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ActiveGenerationIdentity {
    pub id: String,
    pub model_key: String,
    pub model_id: String,
    pub dimensions: u32,
}

#[derive(Debug)]
struct CachedVector {
    source_id: String,
    source_fingerprint: String,
    vector: Vec<f32>,
    norm: f32,
}

type VectorGroupKey = (String, Option<String>, String);

#[derive(Debug)]
struct CachedGeneration {
    id: String,
    model_key: String,
    dimensions: u32,
    groups: HashMap<VectorGroupKey, Vec<CachedVector>>,
}

fn vector_cache() -> &'static Mutex<Option<Arc<CachedGeneration>>> {
    static VALUE: OnceLock<Mutex<Option<Arc<CachedGeneration>>>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(None))
}

fn invalidate_vector_cache() {
    if let Ok(mut cached) = vector_cache().lock() {
        *cached = None;
    }
}

pub fn release_cache() -> bool {
    vector_cache()
        .lock()
        .map(|mut cached| cached.take().is_some())
        .unwrap_or(false)
}

fn register_sqlite_vec() {
    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| unsafe {
        rusqlite::ffi::sqlite3_auto_extension(Some(std::mem::transmute(
            sqlite_vec::sqlite3_vec_init as *const (),
        )));
    });
}

fn open() -> anyhow::Result<Connection> {
    static OPEN_LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    let _guard = OPEN_LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    register_sqlite_vec();
    let path = localization_semantic_index_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let existed = path.exists();
    let mut connection = Connection::open(&path)?;
    connection.busy_timeout(Duration::from_secs(5))?;
    let version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if existed && version != SCHEMA_VERSION {
        drop(connection);
        for candidate in [
            path.clone(),
            path.with_extension("sqlite3-wal"),
            path.with_extension("sqlite3-shm"),
        ] {
            if candidate.exists() {
                fs::remove_file(candidate)?;
            }
        }
        connection = Connection::open(&path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
    }
    connection.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS semantic_generations(
           id TEXT PRIMARY KEY, model_key TEXT NOT NULL, model_id TEXT NOT NULL,
           dimensions INTEGER NOT NULL, official_revision TEXT, knowledge_revision TEXT,
           created_at_ms INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 0);
         CREATE TABLE IF NOT EXISTS semantic_vectors(
           id INTEGER PRIMARY KEY, generation_id TEXT NOT NULL REFERENCES semantic_generations(id) ON DELETE CASCADE,
           source_kind TEXT NOT NULL, source_id TEXT NOT NULL, source_fingerprint TEXT NOT NULL,
           scope_id TEXT, source_locale TEXT NOT NULL, embedding BLOB NOT NULL,
           UNIQUE(generation_id,source_kind,source_id));
         CREATE INDEX IF NOT EXISTS semantic_vectors_lookup
           ON semantic_vectors(generation_id,source_kind,scope_id,source_locale);
         PRAGMA user_version=2;",
    )?;
    Ok(connection)
}

fn vector_blob(vector: &[f32]) -> Vec<u8> {
    vector
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn vector_from_blob(blob: Vec<u8>, dimensions: u32) -> anyhow::Result<Vec<f32>> {
    if blob.len() != dimensions as usize * size_of::<f32>() {
        bail!("Stored semantic vector has incompatible dimensions.");
    }
    Ok(blob
        .chunks_exact(size_of::<f32>())
        .map(|bytes| f32::from_le_bytes(bytes.try_into().expect("f32 byte width")))
        .collect())
}

fn cached_generation(model_key: &str) -> anyhow::Result<Option<Arc<CachedGeneration>>> {
    if let Some(cached) = vector_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .as_ref()
        .filter(|cached| cached.model_key == model_key)
        .cloned()
    {
        return Ok(Some(cached));
    }

    let connection = open()?;
    let identity = connection
        .query_row(
            "SELECT id,dimensions FROM semantic_generations WHERE active=1 AND model_key=?",
            [model_key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?)),
        )
        .optional()?;
    let Some((generation_id, dimensions)) = identity else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT source_kind,source_id,source_fingerprint,scope_id,source_locale,embedding
         FROM semantic_vectors WHERE generation_id=?",
    )?;
    let mut groups: HashMap<VectorGroupKey, Vec<CachedVector>> = HashMap::new();
    for row in statement.query_map([&generation_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Vec<u8>>(5)?,
        ))
    })? {
        let (source_kind, source_id, source_fingerprint, scope_id, source_locale, blob) = row?;
        let vector = vector_from_blob(blob, dimensions)?;
        let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
        if !norm.is_finite() || norm <= f32::EPSILON {
            bail!("Stored semantic vector cannot be normalized.");
        }
        groups
            .entry((source_kind, scope_id, source_locale))
            .or_default()
            .push(CachedVector {
                source_id,
                source_fingerprint,
                vector,
                norm,
            });
    }
    let loaded = Arc::new(CachedGeneration {
        id: generation_id,
        model_key: model_key.into(),
        dimensions,
        groups,
    });
    let mut cache = vector_cache()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if cache
        .as_ref()
        .is_some_and(|current| current.id != loaded.id)
        || cache.is_none()
    {
        *cache = Some(loaded.clone());
    }
    Ok(Some(
        cache
            .as_ref()
            .filter(|current| current.model_key == model_key)
            .cloned()
            .unwrap_or(loaded),
    ))
}

pub fn prewarm(model_key: &str) -> anyhow::Result<()> {
    let _ = cached_generation(model_key)?;
    Ok(())
}

pub fn replace_generation(
    model_key: &str,
    model_id: &str,
    dimensions: u32,
    official_revision: Option<&str>,
    knowledge_revision: Option<&str>,
    records: &[SemanticVectorRecord],
) -> anyhow::Result<String> {
    if dimensions == 0
        || records.iter().any(|record| {
            record.vector.len() != dimensions as usize
                || record.vector.iter().any(|value| !value.is_finite())
        })
    {
        bail!("Semantic vector generation contains invalid dimensions or values.");
    }
    let mut connection = open()?;
    let transaction = connection.transaction()?;
    let generation = uuid::Uuid::new_v4().to_string();
    transaction.execute(
        "INSERT INTO semantic_generations(id,model_key,model_id,dimensions,official_revision,knowledge_revision,created_at_ms) VALUES(?,?,?,?,?,?,?)",
        params![generation,model_key,model_id,dimensions,official_revision,knowledge_revision,time::OffsetDateTime::now_utc().unix_timestamp()*1000],
    )?;
    for record in records {
        transaction.execute(
            "INSERT INTO semantic_vectors(generation_id,source_kind,source_id,source_fingerprint,scope_id,source_locale,embedding) VALUES(?,?,?,?,?,?,?)",
            params![generation,record.source_kind,record.source_id,record.source_fingerprint,record.scope_id,record.source_locale,vector_blob(&record.vector)],
        )?;
    }
    transaction.execute(
        "UPDATE semantic_generations SET active=0 WHERE active=1",
        [],
    )?;
    transaction.execute(
        "UPDATE semantic_generations SET active=1 WHERE id=?",
        [&generation],
    )?;
    transaction.execute(
        "DELETE FROM semantic_generations WHERE id<>?",
        [&generation],
    )?;
    transaction.commit()?;
    invalidate_vector_cache();
    Ok(generation)
}

pub fn active_generation() -> anyhow::Result<Option<ActiveGeneration>> {
    let connection = open()?;
    let identity = connection
        .query_row(
            "SELECT id,model_key,model_id,dimensions FROM semantic_generations WHERE active=1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, u32>(3)?,
                ))
            },
        )
        .optional()?;
    let Some((id, model_key, model_id, dimensions)) = identity else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT source_kind,source_id,source_fingerprint,scope_id FROM semantic_vectors WHERE generation_id=?",
    )?;
    let fingerprints = statement
        .query_map([&id], |row| {
            Ok((
                (row.get::<_, String>(0)?, row.get::<_, String>(1)?),
                (row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?),
            ))
        })?
        .collect::<Result<BTreeMap<_, _>, _>>()?;
    Ok(Some(ActiveGeneration {
        id,
        model_key,
        model_id,
        dimensions,
        fingerprints,
    }))
}

pub fn active_generation_identity() -> anyhow::Result<Option<ActiveGenerationIdentity>> {
    open()?
        .query_row(
            "SELECT id,model_key,model_id,dimensions FROM semantic_generations WHERE active=1",
            [],
            |row| {
                Ok(ActiveGenerationIdentity {
                    id: row.get(0)?,
                    model_key: row.get(1)?,
                    model_id: row.get(2)?,
                    dimensions: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(Into::into)
}

pub fn synchronize_generation(
    generation: &ActiveGeneration,
    official_revision: Option<&str>,
    knowledge_revision: &str,
    scope_ids: &[String],
    current_records: &[SemanticVectorRecord],
    changed_records: &[SemanticVectorRecord],
) -> anyhow::Result<()> {
    if changed_records.iter().any(|record| {
        record.vector.len() != generation.dimensions as usize
            || record.vector.iter().any(|value| !value.is_finite())
    }) {
        bail!("Semantic synchronization contains invalid dimensions or values.");
    }
    let mut connection = open()?;
    let transaction = connection.transaction()?;
    let current_id: Option<String> = transaction
        .query_row(
            "SELECT id FROM semantic_generations WHERE active=1 AND model_key=? AND model_id=? AND dimensions=?",
            params![generation.model_key, generation.model_id, generation.dimensions],
            |row| row.get(0),
        )
        .optional()?;
    if current_id.as_deref() != Some(generation.id.as_str()) {
        bail!("The active semantic generation changed while synchronization was running.");
    }
    let current_ids = current_records
        .iter()
        .map(|record| (record.source_kind.as_str(), record.source_id.as_str()))
        .collect::<BTreeSet<_>>();
    for ((kind, source_id), (_, scope_id)) in &generation.fingerprints {
        let in_reconciled_scope = kind == "official"
            || (kind != "official"
                && (scope_ids.is_empty()
                    || scope_id
                        .as_ref()
                        .is_some_and(|scope| scope_ids.contains(scope))));
        if in_reconciled_scope && !current_ids.contains(&(kind.as_str(), source_id.as_str())) {
            transaction.execute(
                "DELETE FROM semantic_vectors WHERE generation_id=? AND source_kind=? AND source_id=?",
                params![generation.id, kind, source_id],
            )?;
        }
    }
    for record in changed_records {
        transaction.execute(
            "INSERT INTO semantic_vectors(generation_id,source_kind,source_id,source_fingerprint,scope_id,source_locale,embedding) VALUES(?,?,?,?,?,?,?)
             ON CONFLICT(generation_id,source_kind,source_id) DO UPDATE SET source_fingerprint=excluded.source_fingerprint,scope_id=excluded.scope_id,source_locale=excluded.source_locale,embedding=excluded.embedding",
            params![generation.id,record.source_kind,record.source_id,record.source_fingerprint,record.scope_id,record.source_locale,vector_blob(&record.vector)],
        )?;
    }
    transaction.execute(
        "UPDATE semantic_generations SET official_revision=?,knowledge_revision=? WHERE id=?",
        params![official_revision, knowledge_revision, generation.id],
    )?;
    transaction.commit()?;
    invalidate_vector_cache();
    Ok(())
}

pub fn search(
    model_key: &str,
    source_kind: &str,
    scope_id: Option<&str>,
    source_locale: &str,
    query: &[f32],
    limit: u32,
) -> anyhow::Result<Vec<SemanticMatch>> {
    if query.is_empty() || query.iter().any(|value| !value.is_finite()) {
        bail!("Semantic query vector is invalid.");
    }
    if limit == 0 || limit > 1_000 {
        bail!("Semantic search limit must be between 1 and 1000.");
    }
    let Some(generation) = cached_generation(model_key)? else {
        return Ok(Vec::new());
    };
    if query.len() != generation.dimensions as usize {
        bail!("Semantic query dimensions do not match the active index.");
    }
    let query_norm = query.iter().map(|value| value * value).sum::<f32>().sqrt();
    if !query_norm.is_finite() || query_norm <= f32::EPSILON {
        bail!("Semantic query vector cannot be normalized.");
    }
    let mut matches = generation
        .groups
        .iter()
        .filter(|((kind, candidate_scope, locale), _)| {
            kind == source_kind
                && locale == source_locale
                && scope_id.is_none_or(|scope| candidate_scope.as_deref() == Some(scope))
        })
        .flat_map(|(_, vectors)| vectors)
        .map(|candidate| {
            let dot = candidate
                .vector
                .iter()
                .zip(query)
                .map(|(left, right)| left * right)
                .sum::<f32>();
            SemanticMatch {
                source_id: candidate.source_id.clone(),
                source_fingerprint: candidate.source_fingerprint.clone(),
                similarity: (dot / (candidate.norm * query_norm)) as f64,
            }
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        right
            .similarity
            .total_cmp(&left.similarity)
            .then_with(|| left.source_id.cmp(&right.source_id))
    });
    matches.truncate(limit as usize);
    Ok(matches)
}

pub fn inspect(
    expected_model_id: Option<&str>,
    expected_model_key_suffix: Option<&str>,
    scope_ids: &[String],
    source_records: &[SemanticVectorRecord],
) -> anyhow::Result<AiSemanticIndexStatus> {
    let connection = open()?;
    let active = connection
        .query_row(
            "SELECT id,model_key,model_id,dimensions,official_revision,knowledge_revision,
                    (SELECT COUNT(*) FROM semantic_vectors WHERE generation_id=semantic_generations.id)
             FROM semantic_generations WHERE active=1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?,
                row.get::<_, u32>(3)?, row.get::<_, Option<String>>(4)?, row.get::<_, Option<String>>(5)?,
                row.get::<_, u64>(6)?)),
        )
        .optional()?;
    let Some((
        generation_id,
        model_key,
        model_id,
        dimensions,
        stored_official,
        stored_knowledge,
        indexed_records,
    )) = active
    else {
        return Ok(AiSemanticIndexStatus {
            available: false,
            retrieval_mode: "lexical".into(),
            generation_id: None,
            model_id: None,
            dimensions: None,
            official_revision: None,
            knowledge_revision: None,
            indexed_records: 0,
            source_records: source_records.len() as u64,
            pending_records: source_records.len() as u64,
            coverage_percentage: if source_records.is_empty() {
                100.0
            } else {
                0.0
            },
            stale: false,
        });
    };
    let stale = expected_model_id.is_some_and(|expected| expected != model_id)
        || expected_model_key_suffix.is_some_and(|suffix| !model_key.ends_with(suffix));
    let current = source_records
        .iter()
        .map(|record| {
            (
                (
                    record.source_kind.as_str(),
                    record.source_id.as_str(),
                    record.scope_id.as_deref(),
                    record.source_locale.as_str(),
                ),
                record.source_fingerprint.as_str(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut stored = BTreeSet::new();
    let mut statement = connection.prepare(
        "SELECT source_kind,source_id,scope_id,source_locale,source_fingerprint
         FROM semantic_vectors WHERE generation_id=?",
    )?;
    for row in statement.query_map([&generation_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
        ))
    })? {
        let (kind, id, scope, locale, fingerprint) = row?;
        stored.insert((kind, id, scope, locale, fingerprint));
    }
    let covered = if stale {
        0
    } else {
        current
            .iter()
            .filter(|((kind, id, scope, locale), fingerprint)| {
                stored.contains(&(
                    (*kind).to_string(),
                    (*id).to_string(),
                    scope.map(str::to_string),
                    (*locale).to_string(),
                    (**fingerprint).to_string(),
                ))
            })
            .count() as u64
    };
    let source_count = source_records.len() as u64;
    let current_keys = source_records
        .iter()
        .map(|record| {
            (
                record.source_kind.as_str(),
                record.source_id.as_str(),
                record.scope_id.as_deref(),
                record.source_locale.as_str(),
            )
        })
        .collect::<BTreeSet<_>>();
    let orphaned = if stale {
        0
    } else {
        stored
            .iter()
            .filter(|(kind, id, scope, locale, _)| {
                let relevant = kind == "official"
                    || kind == "official-entity"
                    || (scope_ids.is_empty()
                        || scope
                            .as_ref()
                            .is_some_and(|scope| scope_ids.contains(scope)));
                relevant
                    && !current_keys.contains(&(
                        kind.as_str(),
                        id.as_str(),
                        scope.as_deref(),
                        locale.as_str(),
                    ))
            })
            .count() as u64
    };
    let pending = source_count.saturating_sub(covered) + orphaned;
    let coverage_denominator = source_count + orphaned;
    Ok(AiSemanticIndexStatus {
        available: covered > 0,
        retrieval_mode: if covered == 0 {
            "lexical"
        } else if pending > 0 {
            "partial"
        } else {
            "semantic"
        }
        .into(),
        generation_id: Some(generation_id),
        model_id: Some(model_id),
        dimensions: Some(dimensions),
        official_revision: stored_official,
        knowledge_revision: stored_knowledge,
        indexed_records: covered.min(indexed_records),
        source_records: source_count,
        pending_records: pending,
        coverage_percentage: if coverage_denominator == 0 {
            100.0
        } else {
            covered as f64 * 100.0 / coverage_denominator as f64
        },
        stale,
    })
}

use rusqlite::OptionalExtension;

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_index_tests.rs"]
mod tests;
