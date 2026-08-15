//! Localization knowledge SQLite store.
//!
//! Formerly a single ~1.6k-line god file; the implementation now lives in the
//! sibling submodules (`schema`, `scopes`, `glossary`, `memory`) and is
//! re-exported here so existing call sites (`crate::domain::localization::
//! knowledge::store::*` and `knowledge::*` via `pub use store::*`) stay
//! unchanged.

mod glossary;
mod memory;
mod schema;
mod scopes;

// Scope lifecycle, bindings and settings.
pub use scopes::{
    create_profile, delete_profile, initialize_plan, list_scopes, load_scope,
    remove_profile_binding, rename_profile, resolve_scope, save_scope_settings,
    set_profile_binding,
};

// Glossary and style guide entry read/write.
pub use glossary::{delete_glossary, list_glossary, load_style, save_style, upsert_glossary};

// Translation memory entry read/write/query.
pub use memory::{copy_memory, delete_memory, record_confirmed, search_memory};

// Crate-internal surface reused by the localization domain and the knowledge
// import/export seam (`exchange.rs`).
pub(crate) use glossary::insert_imported_glossary;
// `SemanticMemorySource` is only reachable through `semantic_snapshot`'s return
// type, so it is never named directly; the re-export keeps the historical
// `store::SemanticMemorySource` path available.
#[allow(unused_imports)]
pub(crate) use memory::{
    SemanticMemorySource, insert_imported_memory, probe_memory_global, search_memory_with_semantic,
    semantic_snapshot,
};
pub(crate) use schema::{GLOBAL_SCOPE_ID, bump_import, open};

use crate::domain::ai::types::KnowledgePolicy;
use crate::domain::localization::types::*;
use glossary::glossary_row;
use memory::lexical_memory_suggestions;
use rusqlite::{OptionalExtension, params};
use schema::normalize;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Default)]
pub(crate) struct TranslationKnowledge {
    pub exact: BTreeMap<String, String>,
    pub contexts: BTreeMap<String, String>,
    pub required_terms: BTreeMap<String, Vec<(String, String)>>,
    pub trace: crate::domain::ai::types::KnowledgeTrace,
    pub revision: String,
}

pub fn inspect_context(
    request: InspectLocalizationContextRequest,
) -> anyhow::Result<LocalizationContextInspection> {
    if request.source_text.trim().is_empty() {
        return Ok(LocalizationContextInspection {
            glossary: Vec::new(),
            memory: Vec::new(),
            official: Vec::new(),
            style: None,
            knowledge_revision: String::new(),
            trace: LocalizationContextTrace::default(),
        });
    }
    let mut scope_ids = Vec::new();
    if request.knowledge_policy.enabled && request.knowledge_policy.use_profile_knowledge {
        scope_ids.push(request.scope_id.clone());
    }
    if request.knowledge_policy.enabled && request.knowledge_policy.use_global_knowledge {
        scope_ids.push(GLOBAL_SCOPE_ID.into());
    }
    let normalized_source = normalize(&request.source_text);
    let mut glossary = Vec::new();
    let mut memory = Vec::new();
    let mut style = None;
    let mut trace = LocalizationContextTrace::default();
    trace.official_indexed = crate::domain::localization::official::active_revision()
        .ok()
        .flatten()
        .is_some();
    let official_source_locale =
        crate::domain::localization::official::canonical_locale(&request.source_locale);
    let official_target_locale =
        crate::domain::localization::official::canonical_locale(&request.target_locale);
    let needs_semantic = request.knowledge_policy.enabled
        && (!scope_ids.is_empty()
            || (request.knowledge_policy.use_official_corpus && request.game_directory.is_some()));
    let use_official_semantic = request.knowledge_policy.enabled
        && request.knowledge_policy.use_official_corpus
        && request.game_directory.is_some()
        && !official_source_locale.is_empty();
    let mut semantic_requests: Vec<(&str, Option<&str>, &str, u32)> = Vec::new();
    if use_official_semantic {
        semantic_requests.extend([
            ("official", None, official_source_locale.as_str(), 1_000),
            ("official-entity", None, official_source_locale.as_str(), 20),
        ]);
    }
    let memory_group_offset = semantic_requests.len();
    semantic_requests.extend(scope_ids.iter().map(|scope_id| {
        (
            "translation-memory",
            Some(scope_id.as_str()),
            request.source_locale.as_str(),
            50,
        )
    }));
    let semantic_groups = if needs_semantic {
        crate::domain::localization::semantic::search_scoped_candidate_groups(
            &semantic_requests,
            &request.source_text,
        )
        .unwrap_or_else(|_| semantic_requests.iter().map(|_| Vec::new()).collect())
    } else {
        semantic_requests.iter().map(|_| Vec::new()).collect()
    };
    for (scope_index, scope_id) in scope_ids.iter().enumerate().rev() {
        let page = list_glossary(SearchLocalizationKnowledgeRequest {
            scope_id: scope_id.clone(),
            source_locale: Some(request.source_locale.clone()),
            target_locale: Some(request.target_locale.clone()),
            query: None,
            offset: 0,
            limit: 500,
        })?;
        for entry in page.records.into_iter().filter(|entry| {
            let term = normalize(&entry.source_term);
            !term.is_empty() && normalized_source.contains(&term)
        }) {
            if scope_id == GLOBAL_SCOPE_ID {
                trace.global_glossary_matches += 1;
            } else {
                trace.profile_glossary_matches += 1;
            }
            glossary.push(entry);
        }
        let page = search_memory_with_semantic(
            SearchLocalizationKnowledgeRequest {
                scope_id: scope_id.clone(),
                source_locale: Some(request.source_locale.clone()),
                target_locale: Some(request.target_locale.clone()),
                query: Some(request.source_text.clone()),
                offset: 0,
                limit: 5,
            },
            semantic_groups[memory_group_offset + scope_index].clone(),
        )?;
        trace.translation_memory_matches += page.records.len() as u64;
        memory.extend(page.records);
        if let Some(candidate) = load_style(LoadLocalizationStyleGuideRequest {
            scope_id: scope_id.clone(),
            target_locale: request.target_locale.clone(),
        })? {
            style = Some(merge_style_guides(style, candidate));
        }
    }
    memory.sort_by(|left, right| right.score.total_cmp(&left.score));
    memory.truncate(5);
    glossary.truncate(20);
    let official = if request.knowledge_policy.enabled
        && request.knowledge_policy.use_official_corpus
        && request.game_directory.is_some()
    {
        crate::domain::localization::official::search_with_locale_fallback(
            SearchOfficialLocalizationRequest {
                source_locale: if request.source_locale.trim().is_empty()
                    || request.source_locale.eq_ignore_ascii_case("default")
                {
                    request.source_locale.clone()
                } else {
                    official_source_locale
                },
                target_locale: official_target_locale,
                query: request.source_text.clone(),
                asset_category: None,
                unit_kind: None,
                prompt_eligible_only: true,
                allow_literal_scan: false,
                offset: 0,
                limit: 5,
            },
            use_official_semantic
                .then(|| vec![semantic_groups[0].clone(), semantic_groups[1].clone()]),
        )
        .map(|page| page.records)
        .unwrap_or_default()
    } else {
        Vec::new()
    };
    trace.official_matches = official.len() as u64;
    let db = open()?;
    let mut revisions = Vec::new();
    for scope_id in &scope_ids {
        if let Some(revision) = db
            .query_row(
                "SELECT revision FROM localization_scopes WHERE id=?",
                [scope_id],
                |row| row.get::<_, u64>(0),
            )
            .optional()?
        {
            revisions.push(format!("{scope_id}:{revision}"));
        }
    }
    Ok(LocalizationContextInspection {
        glossary,
        memory,
        official,
        style,
        knowledge_revision: revisions.join("|"),
        trace,
    })
}

fn merge_style_guides(base: Option<AiStyleGuide>, candidate: AiStyleGuide) -> AiStyleGuide {
    let Some(mut effective) = base else {
        return candidate;
    };
    if !candidate.tone.trim().is_empty() {
        effective.tone = candidate.tone;
    }
    if !candidate.audience.trim().is_empty() {
        effective.audience = candidate.audience;
    }
    if !candidate.formality.trim().is_empty() {
        effective.formality = candidate.formality;
    }
    if !candidate.forbidden_phrases.is_empty() {
        effective.forbidden_phrases = candidate.forbidden_phrases;
    }
    if !candidate.preferred_phrases.is_empty() {
        effective.preferred_phrases = candidate.preferred_phrases;
    }
    if !candidate.rules.is_empty() {
        effective.rules = candidate.rules;
    }
    effective.scope_id = candidate.scope_id;
    effective.updated_at_ms = effective.updated_at_ms.max(candidate.updated_at_ms);
    effective
}

pub(crate) fn resolve_translation_knowledge(
    scope_id: Option<&str>,
    policy: &KnowledgePolicy,
    source_locale: &str,
    target_locale: &str,
    items: &[crate::domain::ai::types::AiTranslationItem],
) -> anyhow::Result<TranslationKnowledge> {
    if !policy.enabled {
        return Ok(TranslationKnowledge::default());
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    let mut scope_ids = Vec::new();
    if policy.use_profile_knowledge {
        if let Some(scope_id) = scope_id {
            scope_ids.push(scope_id.to_string());
        }
    }
    if policy.use_global_knowledge {
        scope_ids.push(GLOBAL_SCOPE_ID.into());
    }
    let mut exact = BTreeMap::new();
    let mut contexts = BTreeMap::new();
    let mut required_terms = BTreeMap::<String, Vec<(String, String)>>::new();
    let mut trace = crate::domain::ai::types::KnowledgeTrace::default();
    for item in items {
        for scope in &scope_ids {
            let hit:Option<(String,String)>=tx.query_row("SELECT id,target_text FROM translation_memory WHERE scope_id=? AND source_locale=? AND target_locale=? AND source_text=? ORDER BY confirmed_at_ms DESC LIMIT 1",params![scope,source_locale,target_locale,item.text],|row|Ok((row.get(0)?,row.get(1)?))).optional()?;
            if let Some((id, target)) = hit {
                tx.execute(
                    "UPDATE translation_memory SET use_count=use_count+1 WHERE id=?",
                    [id],
                )?;
                exact.insert(item.id.clone(), target);
                trace.translation_memory_matches += 1;
                break;
            }
        }
    }
    let mut memory_suggestions = BTreeMap::<String, Vec<AiTranslationMemoryEntry>>::new();
    for item in items.iter().filter(|item| !exact.contains_key(&item.id)) {
        let mut suggestions = Vec::new();
        let mut seen = BTreeSet::new();
        for scope in &scope_ids {
            for row in
                lexical_memory_suggestions(&tx, scope, source_locale, target_locale, &item.text, 3)?
            {
                if seen.insert(normalize(&row.source_text)) {
                    suggestions.push(row);
                }
            }
        }
        suggestions.sort_by(|left, right| right.score.total_cmp(&left.score));
        suggestions.truncate(3);
        if !suggestions.is_empty() {
            trace.translation_memory_matches += suggestions.len() as u64;
            memory_suggestions.insert(item.id.clone(), suggestions);
        }
    }
    let mut glossary: BTreeMap<String, AiGlossaryEntry> = BTreeMap::new();
    for scope in scope_ids.iter().rev() {
        let mut statement=tx.prepare("SELECT id,scope_id,source_locale,target_locale,source_term,target_term,match_mode,do_not_translate,notes,updated_at_ms FROM glossary_entries WHERE scope_id=? AND source_locale=? AND target_locale=?")?;
        for entry in
            statement.query_map(params![scope, source_locale, target_locale], glossary_row)?
        {
            let entry = entry?;
            glossary.insert(normalize(&entry.source_term), entry);
        }
    }
    for item in items {
        if exact.contains_key(&item.id) {
            continue;
        }
        let mut matches = Vec::new();
        for entry in glossary.values() {
            let matched = if entry.match_mode == "case-insensitive" {
                item.text
                    .to_lowercase()
                    .contains(&entry.source_term.to_lowercase())
            } else {
                item.text.contains(&entry.source_term)
            };
            if matched {
                let expected = if entry.do_not_translate {
                    entry.source_term.clone()
                } else {
                    entry.target_term.clone()
                };
                required_terms
                    .entry(item.id.clone())
                    .or_default()
                    .push((entry.source_term.clone(), expected));
                matches.push(format!(
                    "{} => {}{}",
                    entry.source_term,
                    if entry.do_not_translate {
                        entry.source_term.as_str()
                    } else {
                        entry.target_term.as_str()
                    },
                    if entry.notes.is_empty() {
                        String::new()
                    } else {
                        format!(" ({})", entry.notes)
                    }
                ));
                if entry.scope_id == GLOBAL_SCOPE_ID {
                    trace.global_glossary_matches += 1
                } else {
                    trace.project_glossary_matches += 1
                }
            }
        }
        if !matches.is_empty() {
            contexts.insert(
                item.id.clone(),
                format!("Required glossary:\n{}", matches.join("\n")),
            );
        }
        if let Some(suggestions) = memory_suggestions.get(&item.id) {
            let summary = suggestions
                .iter()
                .map(|row| format!("{} => {}", row.source_text, row.target_text))
                .collect::<Vec<_>>()
                .join("\n");
            contexts
                .entry(item.id.clone())
                .and_modify(|value| {
                    value.push_str(&format!("\nTranslation memory suggestions:\n{summary}"))
                })
                .or_insert_with(|| format!("Translation memory suggestions:\n{summary}"));
        }
    }
    let mut style: Option<AiStyleGuide> = None;
    for style_scope in scope_ids.iter().rev() {
        let candidate = tx
            .query_row(
                "SELECT scope_id,target_locale,tone,audience,formality,forbidden_phrases,preferred_phrases,rules,updated_at_ms FROM style_guides WHERE scope_id=? AND target_locale=?",
                params![style_scope, target_locale],
                |row| {
                    Ok(AiStyleGuide {
                        scope_id: row.get(0)?,
                        target_locale: row.get(1)?,
                        tone: row.get(2)?,
                        audience: row.get(3)?,
                        formality: row.get(4)?,
                        forbidden_phrases: serde_json::from_str(&row.get::<_, String>(5)?)
                            .unwrap_or_default(),
                        preferred_phrases: serde_json::from_str(&row.get::<_, String>(6)?)
                            .unwrap_or_default(),
                        rules: serde_json::from_str(&row.get::<_, String>(7)?)
                            .unwrap_or_default(),
                        updated_at_ms: row.get(8)?,
                    })
                },
            )
            .optional()?;
        if let Some(candidate) = candidate {
            if let Some(effective) = style.as_mut() {
                if !candidate.tone.trim().is_empty() {
                    effective.tone = candidate.tone
                }
                if !candidate.audience.trim().is_empty() {
                    effective.audience = candidate.audience
                }
                if !candidate.formality.trim().is_empty() {
                    effective.formality = candidate.formality
                }
                if !candidate.forbidden_phrases.is_empty() {
                    effective.forbidden_phrases = candidate.forbidden_phrases
                }
                if !candidate.preferred_phrases.is_empty() {
                    effective.preferred_phrases = candidate.preferred_phrases
                }
                if !candidate.rules.is_empty() {
                    effective.rules = candidate.rules
                }
                effective.scope_id = candidate.scope_id;
                effective.updated_at_ms = effective.updated_at_ms.max(candidate.updated_at_ms);
            } else {
                style = Some(candidate)
            }
        }
    }
    if let Some(style) = style {
        let summary = serde_json::to_string(
            &serde_json::json!({"tone":style.tone,"audience":style.audience,"formality":style.formality,"forbiddenPhrases":style.forbidden_phrases,"preferredPhrases":style.preferred_phrases,"rules":style.rules}),
        )?;
        for item in items {
            if !exact.contains_key(&item.id) {
                contexts
                    .entry(item.id.clone())
                    .and_modify(|value| value.push_str(&format!("\nStyle guide: {summary}")))
                    .or_insert_with(|| format!("Style guide: {summary}"));
            }
        }
    }
    let mut revisions = Vec::new();
    for scope in &scope_ids {
        if let Some(revision) = tx
            .query_row(
                "SELECT revision FROM localization_scopes WHERE id=?",
                [scope],
                |row| row.get::<_, u64>(0),
            )
            .optional()?
        {
            revisions.push(format!("{scope}:{revision}"));
        }
    }
    tx.commit()?;
    Ok(TranslationKnowledge {
        exact,
        contexts,
        required_terms,
        trace,
        revision: revisions.join("|"),
    })
}
