mod index;

use crate::AppHandle;
use crate::domain::localization::operational_log::{KNOWLEDGE, event};
use crate::domain::localization::types::{
    AiOfficialCorpusStatus, RebuildOfficialLocalizationIndexRequest,
};

pub use index::{active_revision, find_prompt_examples_batch, find_terms_in_text, inspect, search};
pub(crate) use index::{
    canonical_locale, search_with_locale_fallback, search_with_semantic, semantic_entity_snapshot,
    semantic_snapshot,
};

pub fn rebuild_with_events(
    app: AppHandle,
    request: RebuildOfficialLocalizationIndexRequest,
) -> anyhow::Result<AiOfficialCorpusStatus> {
    index::rebuild_with_progress(request, |progress| {
        if let Err(error) = app.emit("localization://official-index-progress", progress) {
            event("official.indexProgress.emitFailed")
                .error(format!("{error}"))
                .emit_warn(KNOWLEDGE);
        }
    })
}
