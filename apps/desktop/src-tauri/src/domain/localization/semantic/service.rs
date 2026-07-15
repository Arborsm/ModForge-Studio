use super::{embedding, index, settings};
use crate::AppHandle;
use crate::domain::localization::operational_log::{Fields, SEMANTIC};
use crate::domain::localization::types::{
    AiSemanticIndexStatus, AiSemanticProbeMatch, AiSemanticProbeResult, AiSemanticProgress,
    AiSemanticSearchMode, AiUsageEvent, ProbeAiSemanticSearchRequest,
    RebuildAiSemanticIndexRequest, SearchOfficialLocalizationRequest,
};
use crate::domain::localization::{jobs, knowledge, official};
use anyhow::{Context, bail};

const BATCH_SIZE: usize = 32;
const EMBEDDING_TEMPLATE_VERSION: &str = "template-v3";
const PRIMARY_WEIGHT: f32 = 0.98;
const CONTEXT_WEIGHT: f32 = 0.02;

fn require_remote_upload_confirmation(
    mode: &AiSemanticSearchMode,
    confirmed: bool,
    operation: &str,
) -> anyhow::Result<()> {
    if mode == &AiSemanticSearchMode::RemoteOpenai && !confirmed {
        bail!("Remote semantic {operation} requires explicit upload confirmation.");
    }
    Ok(())
}

pub(crate) fn generation_model_key(model_key: &str) -> String {
    format!("{model_key}:{EMBEDDING_TEMPLATE_VERSION}")
}

pub(crate) fn embed_recorded(
    texts: &[String],
    purpose: embedding::EmbeddingPurpose,
    operation: &str,
    job_id: &str,
    scope_id: Option<&str>,
) -> anyhow::Result<embedding::EmbeddingOutput> {
    let configured = settings::load_settings()?;
    let started = std::time::Instant::now();
    let result = embedding::embed(texts, purpose);
    if configured.mode == AiSemanticSearchMode::RemoteOpenai {
        let profile_id = configured.active_remote_profile_id.clone();
        let (model, input_tokens, succeeded) = match &result {
            Ok(output) => (Some(output.model_id.clone()), output.input_tokens, true),
            Err(_) => (
                configured
                    .remote_profiles
                    .iter()
                    .find(|profile| Some(&profile.id) == profile_id.as_ref())
                    .map(|profile| profile.model.clone()),
                None,
                false,
            ),
        };
        let event = remote_usage_event(
            texts,
            operation,
            job_id,
            scope_id,
            profile_id,
            model,
            input_tokens,
            succeeded,
            started.elapsed(),
        );
        if let Err(error) = crate::domain::localization::usage::record_usage(event) {
            log::warn!("Failed to record remote semantic embedding usage: {error:#}");
        }
    }
    result
}

#[allow(clippy::too_many_arguments)]
fn remote_usage_event(
    texts: &[String],
    operation: &str,
    job_id: &str,
    scope_id: Option<&str>,
    profile_id: Option<String>,
    model: Option<String>,
    input_tokens: Option<u64>,
    succeeded: bool,
    latency: std::time::Duration,
) -> AiUsageEvent {
    AiUsageEvent {
        occurred_at_ms: time::OffsetDateTime::now_utc().unix_timestamp() * 1000,
        job_id: job_id.into(),
        attempt: 1,
        page_source: "localization-semantic".into(),
        operation: operation.into(),
        engine_kind: "embedding".into(),
        profile_id,
        provider: "openai-compatible".into(),
        model,
        scope_id: scope_id.map(Into::into),
        succeeded,
        latency_ms: latency.as_millis().min(u64::MAX as u128) as u64,
        failure_category: (!succeeded).then(|| "provider".into()),
        request_items: texts.len() as u64,
        request_characters: texts.iter().map(|text| text.chars().count() as u64).sum(),
        response_characters: 0,
        input_tokens,
        output_tokens: None,
        cached_tokens: None,
        reasoning_tokens: None,
        billed_characters: None,
        usage_source: if input_tokens.is_some() {
            "provider-reported"
        } else {
            "unavailable"
        }
        .into(),
        job_succeeded: None,
    }
}

pub fn test_remote_profile(
    request: crate::domain::localization::types::TestAiSemanticRemoteProfileRequest,
) -> anyhow::Result<crate::domain::localization::types::AiSemanticConnectionTestResult> {
    let configured = settings::load_settings()?;
    if configured.mode != AiSemanticSearchMode::RemoteOpenai
        || configured.active_remote_profile_id.as_deref() != Some(&request.profile_id)
    {
        bail!("Save and activate the remote semantic profile before testing it.");
    }
    let started = std::time::Instant::now();
    let output = embed_recorded(
        &["semantic connection test".into()],
        embedding::EmbeddingPurpose::Query,
        "semantic-query",
        &uuid::Uuid::new_v4().to_string(),
        None,
    )?;
    Ok(
        crate::domain::localization::types::AiSemanticConnectionTestResult {
            model: output.model_id,
            dimensions: output.dimensions,
            latency_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        },
    )
}

struct Sources {
    official_revision: Option<String>,
    knowledge_revision: String,
    records: Vec<index::SemanticVectorRecord>,
    primary_texts: Vec<String>,
    context_texts: Vec<String>,
}

fn snapshot(scope_ids: &[String]) -> anyhow::Result<Sources> {
    let (official_revision, official) = official::semantic_snapshot()?;
    let official_entities = official::semantic_entity_snapshot()?;
    let (knowledge_revision, memory) = knowledge::semantic_snapshot(scope_ids)?;
    let mut records = Vec::with_capacity(official.len() + official_entities.len() + memory.len());
    let mut primary_texts = Vec::with_capacity(records.capacity());
    let mut context_texts = Vec::with_capacity(records.capacity());
    for source in official {
        records.push(index::SemanticVectorRecord {
            source_kind: "official".into(),
            source_id: source.id,
            source_fingerprint: source.fingerprint,
            scope_id: None,
            source_locale: "en-US".into(),
            vector: Vec::new(),
        });
        primary_texts.push(source.text);
        context_texts.push(source.context);
    }
    for source in official_entities {
        records.push(index::SemanticVectorRecord {
            source_kind: "official-entity".into(),
            source_id: source.id,
            source_fingerprint: source.fingerprint,
            scope_id: None,
            source_locale: "en-US".into(),
            vector: Vec::new(),
        });
        primary_texts.push(source.text);
        context_texts.push(source.context);
    }
    for source in memory {
        records.push(index::SemanticVectorRecord {
            source_kind: "translation-memory".into(),
            source_id: source.id,
            source_fingerprint: source.fingerprint,
            scope_id: Some(source.scope_id),
            source_locale: source.source_locale,
            vector: Vec::new(),
        });
        primary_texts.push(source.text);
        context_texts.push(source.context);
    }
    Ok(Sources {
        official_revision,
        knowledge_revision,
        records,
        primary_texts,
        context_texts,
    })
}

fn merge_vectors(primary: Vec<f32>, context: Vec<f32>) -> anyhow::Result<Vec<f32>> {
    if primary.len() != context.len() || primary.is_empty() {
        bail!("Semantic source and context embeddings have incompatible dimensions.");
    }
    let mut merged = primary
        .into_iter()
        .zip(context)
        .map(|(source, metadata)| source * PRIMARY_WEIGHT + metadata * CONTEXT_WEIGHT)
        .collect::<Vec<_>>();
    let norm = merged.iter().map(|value| value * value).sum::<f32>().sqrt();
    if !norm.is_finite() || norm <= f32::EPSILON {
        bail!("Semantic source embedding could not be normalized.");
    }
    for value in &mut merged {
        *value /= norm;
    }
    Ok(merged)
}

pub fn inspect_index(scope_ids: &[String]) -> anyhow::Result<AiSemanticIndexStatus> {
    let source = snapshot(scope_ids)?;
    let settings = settings::load_settings()?;
    if settings.mode == AiSemanticSearchMode::Lexical {
        return index::inspect(None, None, scope_ids, &source.records);
    }
    let expected_model_id = match settings.mode {
        AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx => {
            super::model::inspect_model()?
                .model_id
                .or_else(|| Some("__unavailable_semantic_model__".into()))
        }
        AiSemanticSearchMode::RemoteOpenai => settings
            .remote_profiles
            .iter()
            .find(|profile| Some(&profile.id) == settings.active_remote_profile_id.as_ref())
            .map(|profile| profile.model.clone())
            .or_else(|| Some("__unavailable_semantic_model__".into())),
        AiSemanticSearchMode::Lexical => None,
    };
    index::inspect(
        expected_model_id.as_deref(),
        Some(&format!(":{EMBEDDING_TEMPLATE_VERSION}")),
        scope_ids,
        &source.records,
    )
}

pub fn run_probe(request: ProbeAiSemanticSearchRequest) -> anyhow::Result<AiSemanticProbeResult> {
    let query = request.query.trim();
    if query.is_empty() || query.chars().count() > 2_000 {
        bail!("Semantic search probe query must contain between 1 and 2000 characters.");
    }
    if request.limit == 0 || request.limit > 50 {
        bail!("Semantic search probe limit must be between 1 and 50.");
    }
    let started = std::time::Instant::now();
    let groups = super::search_candidate_groups(
        &[
            ("official", 1_000),
            ("official-entity", 20),
            ("translation-memory", 100),
        ],
        None,
        &request.source_locale,
        query,
    )?;
    let mut warnings = Vec::new();
    let official = official::search_with_semantic(
        SearchOfficialLocalizationRequest {
            source_locale: request.source_locale.clone(),
            target_locale: request.target_locale.clone(),
            query: query.into(),
            asset_category: None,
            unit_kind: None,
            prompt_eligible_only: false,
            offset: 0,
            limit: 50,
        },
        Some(vec![groups[0].clone(), groups[1].clone()]),
    )
    .map(|page| page.records)
    .unwrap_or_else(|error| {
        warnings.push(format!("Official corpus: {error:#}"));
        Vec::new()
    });
    let memory = crate::domain::localization::knowledge::probe_memory_global(
        &request.source_locale,
        &request.target_locale,
        query,
        groups[2].clone(),
        50,
    )?;
    let mut records = official
        .into_iter()
        .map(|row| AiSemanticProbeMatch {
            source_kind: "official".into(),
            source_id: row.id.to_string(),
            source_text: row.source_text,
            target_text: row.target_text,
            context: format!("{} · {}", row.asset_path, row.unit_key),
            score: row.score,
            semantic_similarity: row.semantic_similarity,
            lexical_similarity: row.lexical_similarity,
            match_kind: row.match_kind,
            retrieval_mode: row.retrieval_mode,
        })
        .chain(memory.into_iter().map(|row| {
            AiSemanticProbeMatch {
                source_kind: "translation-memory".into(),
                source_id: row.id,
                source_text: row.source_text,
                target_text: row.target_text,
                context: [Some(row.scope_id), row.file_namespace, row.unit_key]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" · "),
                score: row.score,
                semantic_similarity: row.semantic_similarity,
                lexical_similarity: row.lexical_similarity,
                match_kind: row.match_kind,
                retrieval_mode: row.retrieval_mode,
            }
        }))
        .collect::<Vec<_>>();
    records.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.source_kind.cmp(&right.source_kind))
            .then_with(|| left.source_id.cmp(&right.source_id))
    });
    let total_candidates = records.len() as u64;
    records.truncate(request.limit as usize);
    let semantic_count = records
        .iter()
        .filter(|record| record.semantic_similarity.is_some())
        .count();
    let retrieval_mode = if semantic_count == 0 {
        "lexical"
    } else if semantic_count == records.len() {
        "semantic"
    } else {
        "partial"
    };
    Ok(AiSemanticProbeResult {
        query: query.into(),
        retrieval_mode: retrieval_mode.into(),
        elapsed_ms: started.elapsed().as_millis().min(u64::MAX as u128) as u64,
        total_candidates,
        records,
        warnings,
    })
}

pub fn rebuild_index(
    app: AppHandle,
    request: RebuildAiSemanticIndexRequest,
) -> anyhow::Result<AiSemanticIndexStatus> {
    let started = std::time::Instant::now();
    let configured = settings::load_settings()?;
    if configured.mode == AiSemanticSearchMode::Lexical {
        bail!("Semantic indexing requires a configured semantic model.");
    }
    require_remote_upload_confirmation(
        &configured.mode,
        request.confirm_remote_upload,
        "indexing",
    )?;
    jobs::clear(&request.job_id);
    log::info!(
        target: SEMANTIC,
        "{}",
        Fields::new("index.rebuild.started")
            .field("job", &request.job_id)
            .field("mode", format!("{:?}", configured.mode))
            .field("scopes", request.scope_ids.len())
            .field("operation", "semantic-index")
    );
    let result = (|| {
        let mut source = snapshot(&request.scope_ids)?;
        if source.records.is_empty() {
            bail!("There are no official or translation-memory records to index.");
        }
        let total = source.records.len();
        let mut identity = None;
        for (batch_index, texts) in source.primary_texts.chunks(BATCH_SIZE).enumerate() {
            jobs::check(&request.job_id)?;
            let primary = embed_recorded(
                texts,
                embedding::EmbeddingPurpose::Passage,
                "semantic-index",
                &request.job_id,
                None,
            )?;
            let context = embed_recorded(
                &source.context_texts
                    [batch_index * BATCH_SIZE..batch_index * BATCH_SIZE + texts.len()],
                embedding::EmbeddingPurpose::Passage,
                "semantic-index",
                &request.job_id,
                None,
            )?;
            if primary.model_key != context.model_key
                || primary.dimensions != context.dimensions
                || primary.vectors.len() != context.vectors.len()
            {
                bail!("Semantic model identity changed while embedding source context.");
            }
            let generation_key = generation_model_key(&primary.model_key);
            if let Some((key, dimensions)) = &identity {
                if key != &generation_key || *dimensions != primary.dimensions {
                    bail!("Semantic model identity changed while indexing.");
                }
            } else {
                identity = Some((generation_key, primary.dimensions));
            }
            let start = batch_index * BATCH_SIZE;
            for (offset, (source_vector, context_vector)) in
                primary.vectors.into_iter().zip(context.vectors).enumerate()
            {
                source.records[start + offset].vector =
                    merge_vectors(source_vector, context_vector)?;
            }
            let completed = (start + texts.len()) as u64;
            let _ = app.emit(
                "localization://semantic-progress",
                AiSemanticProgress {
                    job_id: request.job_id.clone(),
                    model_id: primary.model_id.clone(),
                    kind: "index".into(),
                    phase: "embedding".into(),
                    current_file: format!("records {completed}/{total}"),
                    downloaded_bytes: completed,
                    total_bytes: total as u64,
                    percentage: completed as f64 * 100.0 / total as f64,
                    bytes_per_second: None,
                    file_index: completed as u32,
                    file_count: total as u32,
                },
            );
        }
        let current = snapshot(&request.scope_ids)?;
        if current.official_revision != source.official_revision
            || current.knowledge_revision != source.knowledge_revision
        {
            bail!("Localization sources changed while semantic indexing was running.");
        }
        let (model_key, dimensions) = identity.context("Semantic model returned no embeddings.")?;
        let model_id = match configured.mode {
            AiSemanticSearchMode::RemoteOpenai => configured
                .remote_profiles
                .iter()
                .find(|profile| Some(&profile.id) == configured.active_remote_profile_id.as_ref())
                .map(|profile| profile.model.clone())
                .context("The active remote semantic profile does not exist.")?,
            AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx => {
                super::model::inspect_model()?
                    .model_id
                    .context("Semantic model id is missing.")?
            }
            AiSemanticSearchMode::Lexical => unreachable!(),
        };
        index::replace_generation(
            &model_key,
            &model_id,
            dimensions,
            source.official_revision.as_deref(),
            Some(&source.knowledge_revision),
            &source.records,
        )?;
        index::inspect(
            Some(&model_id),
            Some(&format!(":{EMBEDDING_TEMPLATE_VERSION}")),
            &request.scope_ids,
            &source.records,
        )
    })();
    jobs::clear(&request.job_id);
    if let Ok(status) = &result {
        log::info!(
            target: SEMANTIC,
            "{}",
            Fields::new("index.rebuild.completed")
                .field("job", &request.job_id)
                .optional("model", status.model_id.as_deref())
                .field("indexed", status.indexed_records)
                .field("sources", status.source_records)
                .field("coverage", status.coverage_percentage)
                .field("elapsedMs", started.elapsed().as_millis())
        );
    }
    result
}

pub fn synchronize_index(
    app: AppHandle,
    request: RebuildAiSemanticIndexRequest,
) -> anyhow::Result<AiSemanticIndexStatus> {
    let started = std::time::Instant::now();
    let configured = settings::load_settings()?;
    if configured.mode == AiSemanticSearchMode::Lexical {
        bail!("Semantic synchronization requires a configured semantic model.");
    }
    require_remote_upload_confirmation(
        &configured.mode,
        request.confirm_remote_upload,
        "synchronization",
    )?;
    jobs::clear(&request.job_id);
    log::info!(
        target: SEMANTIC,
        "{}",
        Fields::new("index.sync.started")
            .field("job", &request.job_id)
            .field("mode", format!("{:?}", configured.mode))
            .field("scopes", request.scope_ids.len())
            .field("operation", "semantic-index")
    );
    let result = (|| {
        let mut source = snapshot(&request.scope_ids)?;
        let active = index::active_generation()?.context(
            "There is no compatible semantic generation to synchronize. Rebuild the index first.",
        )?;
        let expected_model_id = match configured.mode {
            AiSemanticSearchMode::RemoteOpenai => configured
                .remote_profiles
                .iter()
                .find(|profile| Some(&profile.id) == configured.active_remote_profile_id.as_ref())
                .map(|profile| profile.model.clone())
                .context("The active remote semantic profile does not exist.")?,
            AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx => {
                super::model::inspect_model()?
                    .model_id
                    .context("Semantic model id is missing.")?
            }
            AiSemanticSearchMode::Lexical => unreachable!(),
        };
        if active.model_id != expected_model_id
            || !active
                .model_key
                .ends_with(&format!(":{EMBEDDING_TEMPLATE_VERSION}"))
        {
            bail!("The active semantic generation is incompatible with the configured model.");
        }
        let changed = source
            .records
            .iter()
            .enumerate()
            .filter(|(_, record)| {
                active
                    .fingerprints
                    .get(&(record.source_kind.clone(), record.source_id.clone()))
                    .map(|(fingerprint, _)| fingerprint)
                    != Some(&record.source_fingerprint)
            })
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        let total = changed.len();
        for (batch_index, changed_indices) in changed.chunks(BATCH_SIZE).enumerate() {
            jobs::check(&request.job_id)?;
            let primary_texts = changed_indices
                .iter()
                .map(|index| source.primary_texts[*index].clone())
                .collect::<Vec<_>>();
            let context_texts = changed_indices
                .iter()
                .map(|index| source.context_texts[*index].clone())
                .collect::<Vec<_>>();
            let primary = embed_recorded(
                &primary_texts,
                embedding::EmbeddingPurpose::Passage,
                "semantic-index",
                &request.job_id,
                None,
            )?;
            let context = embed_recorded(
                &context_texts,
                embedding::EmbeddingPurpose::Passage,
                "semantic-index",
                &request.job_id,
                None,
            )?;
            let generation_key = generation_model_key(&primary.model_key);
            if generation_key != active.model_key
                || primary.model_key != context.model_key
                || primary.dimensions != active.dimensions
                || context.dimensions != active.dimensions
                || primary.vectors.len() != changed_indices.len()
                || context.vectors.len() != changed_indices.len()
            {
                bail!("Semantic model identity changed while synchronizing.");
            }
            for (offset, source_index) in changed_indices.iter().enumerate() {
                source.records[*source_index].vector = merge_vectors(
                    primary.vectors[offset].clone(),
                    context.vectors[offset].clone(),
                )?;
            }
            let completed = ((batch_index + 1) * BATCH_SIZE).min(total) as u64;
            let _ = app.emit(
                "localization://semantic-progress",
                AiSemanticProgress {
                    job_id: request.job_id.clone(),
                    model_id: expected_model_id.clone(),
                    kind: "index".into(),
                    phase: "synchronizing".into(),
                    current_file: format!("records {completed}/{total}"),
                    downloaded_bytes: completed,
                    total_bytes: total as u64,
                    percentage: if total == 0 {
                        100.0
                    } else {
                        completed as f64 * 100.0 / total as f64
                    },
                    bytes_per_second: None,
                    file_index: completed as u32,
                    file_count: total as u32,
                },
            );
        }
        let current = snapshot(&request.scope_ids)?;
        if current.official_revision != source.official_revision
            || current.knowledge_revision != source.knowledge_revision
        {
            bail!("Localization sources changed while semantic synchronization was running.");
        }
        let synchronized_records = source
            .records
            .iter()
            .cloned()
            .filter(|record| !record.vector.is_empty())
            .collect::<Vec<_>>();
        index::synchronize_generation(
            &active,
            source.official_revision.as_deref(),
            &source.knowledge_revision,
            &request.scope_ids,
            &source.records,
            &synchronized_records,
        )?;
        inspect_index(&request.scope_ids)
    })();
    jobs::clear(&request.job_id);
    if let Ok(status) = &result {
        log::info!(
            target: SEMANTIC,
            "{}",
            Fields::new("index.sync.completed")
                .field("job", &request.job_id)
                .optional("model", status.model_id.as_deref())
                .field("indexed", status.indexed_records)
                .field("sources", status.source_records)
                .field("pending", status.pending_records)
                .field("elapsedMs", started.elapsed().as_millis())
        );
    }
    result
}

pub fn synchronize_after_local_mutation(
    app: AppHandle,
    job_id: String,
    scope_ids: Vec<String>,
) -> anyhow::Result<()> {
    let configured = settings::load_settings()?;
    if !matches!(
        configured.mode,
        AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx
    ) || index::active_generation()?.is_none()
    {
        return Ok(());
    }
    let model = super::model::inspect_model()?;
    if !model.available {
        return Ok(());
    }
    let status = inspect_index(&scope_ids)?;
    if status.stale {
        return Ok(());
    }
    synchronize_index(
        app,
        RebuildAiSemanticIndexRequest {
            job_id,
            scope_ids,
            confirm_remote_upload: false,
        },
    )?;
    Ok(())
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_service_tests.rs"]
mod tests;
