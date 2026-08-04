use super::operational_log::{CORPUS, event};
use super::types::LocalizationCorpusWarmupStatus;
use crate::domain::localization::semantic;
use crate::domain::localization::types::AiSemanticSearchMode;

/// Warms the localization corpus that AI translation and semantic retrieval
/// depend on. Idempotent and non-destructive: it opens/creates the knowledge
/// database (schema + migrations), preloads the configured local semantic
/// embedding model and active vector generation, and verifies the official
/// corpus index exists.
///
/// Component semantics: resources that are configuration-driven but absent
/// (remote/lexical semantic modes, a local model that is not installed yet, an
/// unbuilt official index) are reported as `skipped` rather than errors. A
/// component is `failed` only when a configured resource exists but cannot be
/// loaded. A failed semantic runtime does not block translation: the
/// translation path falls back to lexical retrieval, so the corpus is
/// considered `ready` once knowledge and the official index are usable.
///
/// Callers must run this on a Host Runtime worker (never on the UI thread);
/// the local semantic model load can take a few seconds on first run.
pub fn prewarm_corpus() -> anyhow::Result<LocalizationCorpusWarmupStatus> {
    let started = std::time::Instant::now();
    event("corpus.prewarm.started").emit_info(CORPUS);

    let knowledge = match super::knowledge::open() {
        Ok(_) => "ready",
        Err(error) => {
            event("corpus.prewarm.knowledgeFailed")
                .error(format!("{error:#}"))
                .emit_error(CORPUS);
            "failed"
        }
    };

    let semantic = match semantic_component_status() {
        Ok("ready") => "ready",
        Ok(_) => "skipped",
        Err(error) => {
            event("corpus.prewarm.semanticFailed")
                .error(format!("{error:#}"))
                .emit_warn(CORPUS);
            "failed"
        }
    };

    let official = match super::official::active_revision() {
        Ok(Some(_)) => "ready",
        Ok(None) => "skipped",
        Err(error) => {
            event("corpus.prewarm.officialFailed")
                .error(format!("{error:#}"))
                .emit_warn(CORPUS);
            "failed"
        }
    };

    let ready = knowledge == "ready" && official != "failed";
    let error = if knowledge == "failed" || official == "failed" {
        Some(format!(
            "Localization corpus warmup finished with knowledge={knowledge}, semantic={semantic}, official={official}."
        ))
    } else {
        None
    };
    let status = LocalizationCorpusWarmupStatus {
        knowledge: knowledge.into(),
        semantic: semantic.into(),
        official: official.into(),
        ready,
        error,
    };
    event("corpus.prewarm.completed")
        .field("knowledge", knowledge)
        .field("semantic", semantic)
        .field("official", official)
        .field("elapsedMs", started.elapsed().as_millis())
        .emit_info(CORPUS);
    Ok(status)
}

/// Resolves the semantic warmup outcome without ever loading the local model
/// when it is not installed. Remote/lexical modes and a missing local model
/// are `skipped`; only a present-but-broken model surfaces as an error, which
/// the translation path degrades from instead of blocking on.
fn semantic_component_status() -> anyhow::Result<&'static str> {
    let configured = semantic::load_settings()?;
    match configured.mode {
        AiSemanticSearchMode::RemoteOpenai | AiSemanticSearchMode::Lexical => Ok("skipped"),
        AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx => {
            let model = semantic::inspect_model()?;
            if !model.available {
                return Ok("skipped");
            }
            semantic::prewarm()?;
            Ok("ready")
        }
    }
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_corpus_tests.rs"]
mod tests;
