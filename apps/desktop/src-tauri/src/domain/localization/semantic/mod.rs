mod embedding;
mod index;
mod model;
mod service;
mod settings;

use crate::domain::localization::operational_log::{SEMANTIC, event};
use anyhow::Context;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock, mpsc};
use std::time::Duration;

pub use model::{
    download_builtin_model, inspect_model, open_builtin_model_directory, verify_model,
};
pub use service::{
    inspect_index, rebuild_index, run_probe, synchronize_after_local_mutation, synchronize_index,
    test_remote_profile,
};
pub fn load_settings()
-> anyhow::Result<crate::domain::localization::types::AiSemanticSettingsSnapshot> {
    let mut snapshot = settings::load_settings()?;
    let runtime = embedding::execution_runtime_status(snapshot.execution_preference);
    snapshot.active_execution_provider = runtime.active_provider;
    snapshot.execution_fallback_reason = runtime.fallback_reason;
    Ok(snapshot)
}

pub fn save_settings(
    request: crate::domain::localization::types::SaveAiSemanticSettingsRequest,
) -> anyhow::Result<crate::domain::localization::types::AiSemanticSettingsSnapshot> {
    settings::save_settings(request)?;
    release_runtime()?;
    load_settings()
}

const IDLE_RELEASE_DELAY: Duration = Duration::from_secs(5 * 60);

#[derive(Default)]
struct RuntimeLeases {
    ids: HashSet<String>,
    release_generation: u64,
}

fn runtime_leases() -> &'static Mutex<RuntimeLeases> {
    static VALUE: OnceLock<Mutex<RuntimeLeases>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(RuntimeLeases::default()))
}

fn idle_release_sender() -> anyhow::Result<&'static mpsc::Sender<Option<u64>>> {
    static VALUE: OnceLock<Result<mpsc::Sender<Option<u64>>, String>> = OnceLock::new();
    match VALUE.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<Option<u64>>();
        std::thread::Builder::new()
            .name("semantic-runtime-idle-release".into())
            .spawn(move || {
                let mut scheduled = None;
                loop {
                    let received = match scheduled {
                        Some(_) => receiver.recv_timeout(IDLE_RELEASE_DELAY),
                        None => receiver
                            .recv()
                            .map_err(|_| mpsc::RecvTimeoutError::Disconnected),
                    };
                    match received {
                        Ok(next) => scheduled = next,
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            let generation = scheduled.take();
                            let should_release = runtime_leases()
                                .lock()
                                .map(|leases| {
                                    leases.ids.is_empty()
                                        && generation == Some(leases.release_generation)
                                })
                                .unwrap_or(false);
                            if should_release {
                                if let Err(error) = release_runtime() {
                                    event("semantic.runtime.idleReleaseFailed")
                                        .error(format!("{error:#}"))
                                        .emit_warn(SEMANTIC);
                                }
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            })
            .map_err(|error| error.to_string())?;
        Ok(sender)
    }) {
        Ok(sender) => Ok(sender),
        Err(error) => anyhow::bail!("Semantic runtime idle release worker failed: {error}"),
    }
}

/// Releases the in-process ONNX session and vector generation cache.
pub fn release_runtime() -> anyhow::Result<()> {
    embedding::release_local_model()?;
    index::release_cache();
    Ok(())
}

/// Marks a translation workflow as active and warms its local semantic runtime.
pub fn acquire_runtime(lease_id: String) -> anyhow::Result<()> {
    let lease_id = lease_id.trim();
    if lease_id.is_empty() || lease_id.len() > 128 {
        anyhow::bail!("Semantic runtime lease id must contain between 1 and 128 bytes.");
    }
    {
        let mut leases = runtime_leases()
            .lock()
            .map_err(|_| anyhow::anyhow!("Semantic runtime lease state is unavailable."))?;
        leases.ids.insert(lease_id.into());
        leases.release_generation = leases.release_generation.wrapping_add(1);
    }
    idle_release_sender()?
        .send(None)
        .map_err(|_| anyhow::anyhow!("Semantic runtime idle release worker is unavailable."))?;
    prewarm()
}

/// Releases a workflow lease and unloads the runtime after five idle minutes.
pub fn release_runtime_lease(lease_id: String) -> anyhow::Result<()> {
    let generation = {
        let mut leases = runtime_leases()
            .lock()
            .map_err(|_| anyhow::anyhow!("Semantic runtime lease state is unavailable."))?;
        leases.ids.remove(lease_id.trim());
        leases.release_generation = leases.release_generation.wrapping_add(1);
        if !leases.ids.is_empty() {
            return Ok(());
        }
        leases.release_generation
    };
    idle_release_sender()?
        .send(Some(generation))
        .map_err(|_| anyhow::anyhow!("Semantic runtime idle release worker is unavailable."))?;
    Ok(())
}

pub fn delete_builtin_model(
    request: crate::domain::localization::types::DeleteAiSemanticModelRequest,
) -> anyhow::Result<crate::domain::localization::types::AiSemanticModelStatus> {
    release_runtime()?;
    model::delete_builtin_model(request)
}

/// Loads the configured local embedding runtime and active vector generation
/// without issuing a user-visible search. Remote and lexical modes are skipped.
pub fn prewarm() -> anyhow::Result<()> {
    let configured = settings::load_settings()?;
    if !matches!(
        configured.mode,
        crate::domain::localization::types::AiSemanticSearchMode::Builtin
            | crate::domain::localization::types::AiSemanticSearchMode::LocalOnnx
    ) {
        return Ok(());
    }
    let output = service::embed_recorded(
        &["localization".into()],
        embedding::EmbeddingPurpose::Query,
        "semantic-prewarm",
        &uuid::Uuid::new_v4().to_string(),
        None,
    )?;
    let model_key = service::generation_model_key(&output.model_key);
    index::prewarm(&model_key)
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticBenchmarkSample {
    pub model_id: String,
    pub execution_provider: Option<String>,
    pub embedding_ms: f64,
    pub knn_ms: f64,
    pub total_ms: f64,
    pub official_matches: usize,
    pub entity_matches: usize,
}

/// Measure one real semantic query using the configured embedding engine and
/// active sqlite-vec generation. This is intended for local diagnostics and
/// performance scripts, not application request handling.
pub fn benchmark_query(
    query: &str,
    source_locale: &str,
) -> anyhow::Result<SemanticBenchmarkSample> {
    let query = query.trim();
    if query.is_empty() {
        anyhow::bail!("Semantic benchmark query cannot be empty.");
    }
    let total_started = std::time::Instant::now();
    let embedding_started = std::time::Instant::now();
    let output = service::embed_recorded(
        &[query.to_string()],
        embedding::EmbeddingPurpose::Query,
        "semantic-benchmark",
        &uuid::Uuid::new_v4().to_string(),
        None,
    )?;
    let embedding_ms = embedding_started.elapsed().as_secs_f64() * 1_000.0;
    let vector = output
        .vectors
        .first()
        .context("Semantic benchmark did not return a query vector.")?;
    let active = index::active_generation_identity()?
        .context("Semantic benchmark requires an active vector generation.")?;
    if active.dimensions as usize != vector.len() {
        anyhow::bail!("Active semantic index dimensions do not match the query model.");
    }
    let knn_started = std::time::Instant::now();
    let official = index::search(
        &active.model_key,
        "official",
        None,
        source_locale,
        vector,
        1_000,
    )?;
    let entities = index::search(
        &active.model_key,
        "official-entity",
        None,
        source_locale,
        vector,
        20,
    )?;
    let knn_ms = knn_started.elapsed().as_secs_f64() * 1_000.0;
    let total_ms = total_started.elapsed().as_secs_f64() * 1_000.0;
    let settings = load_settings()?;
    Ok(SemanticBenchmarkSample {
        model_id: output.model_id,
        execution_provider: settings.active_execution_provider,
        embedding_ms,
        knn_ms,
        total_ms,
        official_matches: official.len(),
        entity_matches: entities.len(),
    })
}

pub(crate) fn search_candidates(
    source_kind: &str,
    scope_id: Option<&str>,
    source_locale: &str,
    query: &str,
    limit: u32,
) -> anyhow::Result<Vec<(String, String, f64)>> {
    Ok(
        search_candidate_groups(&[(source_kind, limit)], scope_id, source_locale, query)?
            .pop()
            .unwrap_or_default(),
    )
}

pub(crate) fn search_candidate_groups(
    groups: &[(&str, u32)],
    scope_id: Option<&str>,
    source_locale: &str,
    query: &str,
) -> anyhow::Result<Vec<Vec<(String, String, f64)>>> {
    Ok(
        search_candidate_groups_batch(groups, scope_id, source_locale, &[query.to_string()])?
            .pop()
            .unwrap_or_else(|| groups.iter().map(|_| Vec::new()).collect()),
    )
}

pub(crate) fn search_scoped_candidate_groups(
    groups: &[(&str, Option<&str>, &str, u32)],
    query: &str,
) -> anyhow::Result<Vec<Vec<(String, String, f64)>>> {
    if groups.is_empty() {
        return Ok(Vec::new());
    }
    if load_settings()?.mode == crate::domain::localization::types::AiSemanticSearchMode::Lexical {
        return Ok(groups.iter().map(|_| Vec::new()).collect());
    }
    let output = service::embed_recorded(
        &[query.to_string()],
        embedding::EmbeddingPurpose::Query,
        "semantic-query",
        &uuid::Uuid::new_v4().to_string(),
        None,
    )?;
    let model_key = service::generation_model_key(&output.model_key);
    let vector = output
        .vectors
        .first()
        .context("Semantic query embedding did not return a vector.")?;
    groups
        .iter()
        .map(|(source_kind, scope_id, source_locale, limit)| {
            Ok(index::search(
                &model_key,
                source_kind,
                *scope_id,
                *source_locale,
                vector,
                *limit,
            )?
            .into_iter()
            .map(|item| (item.source_id, item.source_fingerprint, item.similarity))
            .collect())
        })
        .collect()
}

pub(crate) fn search_candidate_groups_batch(
    groups: &[(&str, u32)],
    scope_id: Option<&str>,
    source_locale: &str,
    queries: &[String],
) -> anyhow::Result<Vec<Vec<Vec<(String, String, f64)>>>> {
    if queries.is_empty() {
        return Ok(Vec::new());
    }
    if load_settings()?.mode == crate::domain::localization::types::AiSemanticSearchMode::Lexical {
        event("semantic.fallback")
            .field("retrievalMode", "lexical")
            .field("reason", "semantic-disabled")
            .field("queries", queries.len())
            .field("candidateGroups", groups.len())
            .emit_debug(SEMANTIC);
        return Ok(queries
            .iter()
            .map(|_| groups.iter().map(|_| Vec::new()).collect())
            .collect());
    }
    let embedding_started = std::time::Instant::now();
    let output = service::embed_recorded(
        queries,
        embedding::EmbeddingPurpose::Query,
        "semantic-query",
        &uuid::Uuid::new_v4().to_string(),
        scope_id,
    )?;
    let embedding_elapsed = embedding_started.elapsed();
    let model_key = service::generation_model_key(&output.model_key);
    let model_summary = model_key.chars().take(20).collect::<String>();
    event("semantic.embedding.completed")
        .optional("scope", scope_id)
        .field("queries", queries.len())
        .field("candidateGroups", groups.len())
        .field("model", &output.model_id)
        .field("modelKey", model_summary)
        .field("dimensions", output.dimensions)
        .field("elapsedMs", embedding_elapsed.as_millis())
        .emit_debug(SEMANTIC);
    let knn_started = std::time::Instant::now();
    let matches = search_candidate_groups_batch_with(
        groups,
        queries,
        || Ok((model_key, output.vectors)),
        |model_key, source_kind, vector, limit| {
            index::search(
                model_key,
                source_kind,
                scope_id,
                source_locale,
                vector,
                limit,
            )
        },
    )?;
    event("semantic.knn.completed")
        .optional("scope", scope_id)
        .field("queries", queries.len())
        .field("candidateGroups", groups.len())
        .field("knnSearches", queries.len().saturating_mul(groups.len()))
        .field("elapsedMs", knn_started.elapsed().as_millis())
        .field("retrievalMode", "semantic")
        .emit_debug(SEMANTIC);
    Ok(matches)
}

fn search_candidate_groups_batch_with<E, S>(
    groups: &[(&str, u32)],
    queries: &[String],
    embed_queries: E,
    search: S,
) -> anyhow::Result<Vec<Vec<Vec<(String, String, f64)>>>>
where
    E: FnOnce() -> anyhow::Result<(String, Vec<Vec<f32>>)>,
    S: Fn(&str, &str, &[f32], u32) -> anyhow::Result<Vec<index::SemanticMatch>>,
{
    let (model_key, vectors) = embed_queries()?;
    if vectors.len() != queries.len() {
        anyhow::bail!("Semantic query embeddings do not align with the requested texts.");
    }
    vectors
        .iter()
        .map(|vector| {
            groups
                .iter()
                .map(|(source_kind, limit)| {
                    Ok(search(&model_key, source_kind, vector, *limit)?
                        .into_iter()
                        .map(|item| (item.source_id, item.source_fingerprint, item.similarity))
                        .collect())
                })
                .collect()
        })
        .collect()
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_group_tests.rs"]
mod tests;
