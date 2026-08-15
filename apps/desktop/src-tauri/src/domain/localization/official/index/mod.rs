mod build;
mod persistence;
mod search;
mod shared;

pub use build::{inspect, rebuild_with_progress};
pub use persistence::active_revision;
pub use search::{find_prompt_examples_batch, find_terms_in_text, search};
pub(crate) use search::{
    search_with_locale_fallback, search_with_semantic, semantic_entity_snapshot, semantic_snapshot,
};
pub(crate) use shared::canonical_locale;

#[cfg(test)]
use crate::domain::app_paths::official_localization_index_path;
#[cfg(test)]
use crate::domain::localization::{jobs, types::*};
#[cfg(test)]
pub(crate) use build::{classify, extract, flatten, rebuild};
#[cfg(test)]
pub(crate) use persistence::open;
#[cfg(test)]
use rusqlite::Connection;
#[cfg(test)]
pub(crate) use search::{
    activity_semantic_alias, character_entity_id, merge_unit_entity_similarity,
};
#[cfg(test)]
pub(crate) use shared::{SCHEMA_VERSION, UnitEligibility, prompt_text_eligible};
#[cfg(test)]
use std::path::PathBuf;

#[cfg(test)]
#[path = "../../../../tests/unit/domain/official_localization_tests.rs"]
mod tests;
