mod embedding;
mod index;
mod model;
mod service;
mod settings;

use crate::domain::localization::operational_log::{Fields, SEMANTIC};

pub use model::{
    delete_builtin_model, download_builtin_model, inspect_model, open_builtin_model_directory,
    verify_model,
};
pub use service::{
    inspect_index, rebuild_index, run_probe, synchronize_after_local_mutation, synchronize_index,
    test_remote_profile,
};
pub use settings::{load_settings, save_settings};

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
        log::debug!(
            target: SEMANTIC,
            "{}",
            Fields::new("semantic.fallback")
                .field("retrievalMode", "lexical")
                .field("reason", "semantic-disabled")
                .field("queries", queries.len())
                .field("candidateGroups", groups.len())
        );
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
    log::debug!(
        target: SEMANTIC,
        "{}",
        Fields::new("semantic.embedding.completed")
            .optional("scope", scope_id)
            .field("queries", queries.len())
            .field("candidateGroups", groups.len())
            .field("model", &output.model_id)
            .field("modelKey", model_summary)
            .field("dimensions", output.dimensions)
            .field("elapsedMs", embedding_elapsed.as_millis())
    );
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
    log::debug!(
        target: SEMANTIC,
        "{}",
        Fields::new("semantic.knn.completed")
            .optional("scope", scope_id)
            .field("queries", queries.len())
            .field("candidateGroups", groups.len())
            .field("knnSearches", queries.len().saturating_mul(groups.len()))
            .field("elapsedMs", knn_started.elapsed().as_millis())
            .field("retrievalMode", "semantic")
    );
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
