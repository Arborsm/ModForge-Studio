use super::build::looks_like_internal_value;
use super::persistence::{active_revision, open};
use super::shared::{
    LOCALES, canonical_locale, hex, is_default_locale, semantic_fingerprint, semantic_identity,
};
use crate::domain::localization::types::*;
use crate::infrastructure::fs::pathing::normalize_separators;
use anyhow::{Context, bail};
use rusqlite::{params, params_from_iter, types::Value as SqlValue};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

fn lexical_score(query: &str, row: &AiOfficialUnit) -> (f64, &'static str) {
    let query = query.trim().to_lowercase();
    let text = row.source_text.trim().to_lowercase();
    let key = row.unit_key.trim().to_lowercase();
    if query == text || query == key {
        return (1.0, "exact");
    }
    let is_boundary = |value: &str| {
        value
            .split(|character: char| !character.is_alphanumeric() && character != '_')
            .any(|token| token == query)
    };
    if is_boundary(&text) || is_boundary(&key) || is_boundary(&row.asset_path.to_lowercase()) {
        return (0.9, "whole-token");
    }
    if text.contains(&query) || key.contains(&query) {
        return (0.35, "substring");
    }
    let score = crate::domain::localization::lexical::keyword_score(
        &query,
        &[&row.source_text, &row.unit_key, &row.asset_path],
    );
    if score > 0.0 {
        (score, "keyword")
    } else {
        (0.0, "semantic")
    }
}

pub(crate) fn merge_unit_entity_similarity(unit: Option<f64>, entity: Option<f64>) -> Option<f64> {
    match (unit, entity) {
        (Some(unit), Some(entity)) if entity > unit => Some(entity * 0.7 + unit * 0.3),
        (Some(unit), Some(_)) => Some(unit),
        (None, Some(entity)) => Some(entity),
        (unit, entity) => unit.or(entity),
    }
}

fn is_internal_structured_record(row: &AiOfficialUnit) -> bool {
    row.unit_kind == "structured-record"
        && row.asset_path.to_ascii_lowercase().contains("data/")
        && looks_like_internal_value(&row.source_text)
}

pub fn search(request: SearchOfficialLocalizationRequest) -> anyhow::Result<AiOfficialSearchPage> {
    search_with_semantic(request, None)
}

pub(crate) fn search_with_semantic(
    request: SearchOfficialLocalizationRequest,
    semantic_groups: Option<Vec<Vec<(String, String, f64)>>>,
) -> anyhow::Result<AiOfficialSearchPage> {
    if request.limit == 0 || request.limit > 200 {
        bail!("Official corpus page size must be between 1 and 200.");
    }
    if request.query.trim().is_empty() {
        return Ok(AiOfficialSearchPage {
            records: Vec::new(),
            total: 0,
        });
    }
    let connection = open()?;
    let active: String = connection
        .query_row(
            "SELECT id FROM official_generations WHERE active=1",
            [],
            |row| row.get(0),
        )
        .context("The official localization index has not been built.")?;
    let map_row = |row: &rusqlite::Row<'_>| {
        Ok(AiOfficialUnit {
            id: row.get(0)?,
            source_locale: request.source_locale.clone(),
            target_locale: request.target_locale.clone(),
            source_text: row.get(1)?,
            target_text: row.get(2)?,
            asset_path: row.get(3)?,
            unit_key: row.get(4)?,
            unit_kind: row.get(5)?,
            searchable: row.get(6)?,
            semantic_eligible: row.get(7)?,
            prompt_eligible: row.get(8)?,
            fingerprint: row.get(9)?,
            similarity: 0.0,
            score: 0.0,
            semantic_similarity: None,
            lexical_similarity: 0.0,
            match_kind: "none".into(),
            retrieval_mode: "lexical".into(),
        })
    };
    let literal_scan = request.allow_literal_scan && request.query.trim().chars().count() < 3;
    let mut rows = if literal_scan {
        let mut statement = connection.prepare(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_units u
             JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             WHERE u.generation_id=?3 AND u.searchable=1 AND instr(lower(s.text),lower(?4))>0
               AND (?5 IS NULL OR a.category=?5)
               AND (?6 IS NULL OR u.unit_kind=?6)
               AND (?7=0 OR u.prompt_eligible=1)
             ORDER BY u.id LIMIT 1000",
        )?;
        statement
            .query_map(
                params![
                    request.source_locale,
                    request.target_locale,
                    active,
                    request.query.trim(),
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only,
                ],
                map_row,
            )?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        let fts_query = crate::domain::localization::lexical::fts_or_query(&request.query)
            .unwrap_or_else(|| format!("\"{}\"", request.query.replace('"', "\"\"")));
        let mut statement = connection.prepare(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_texts_fts f
             JOIN official_texts s ON s.id=f.rowid
             JOIN official_units u ON u.id=s.unit_id
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?1
             WHERE f.text MATCH ?2 AND (?3 IN ('','default') OR s.locale=?3) AND u.generation_id=?4 AND u.searchable=1
               AND (?5 IS NULL OR a.category=?5)
               AND (?6 IS NULL OR u.unit_kind=?6)
               AND (?7=0 OR u.prompt_eligible=1)
             LIMIT 1000",
        )?;
        statement
            .query_map(
                params![
                    request.target_locale,
                    fts_query,
                    request.source_locale,
                    active,
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only,
                ],
                map_row,
            )?
            .collect::<Result<Vec<_>, _>>()?
    };
    let mut semantic_groups = semantic_groups.unwrap_or_else(|| {
        match crate::domain::localization::semantic::search_candidate_groups(
            &[("official", 1_000), ("official-entity", 20)],
            None,
            "en-US",
            &request.query,
        ) {
            Ok(groups) => groups,
            Err(error) => {
                crate::domain::localization::operational_log::event("semantic.fallback")
                    .field("retrievalMode", "lexical")
                    .field(
                        "reason",
                        crate::domain::localization::operational_log::failure_category(&error),
                    )
                    .field("queries", 1)
                    .field("candidateGroups", 2)
                    .emit_debug(crate::domain::localization::operational_log::SEMANTIC);
                Vec::new()
            }
        }
    });
    let entity_semantic = semantic_groups.pop().unwrap_or_default();
    let semantic = semantic_groups.pop().unwrap_or_default();
    let semantic_by_id = semantic
        .into_iter()
        .map(|(id, fingerprint, similarity)| (id, (fingerprint, similarity)))
        .collect::<BTreeMap<_, _>>();
    let entity_semantic = entity_semantic
        .into_iter()
        .filter(|(_, _, similarity)| *similarity >= 0.80)
        .map(|(id, _, similarity)| (id, similarity))
        .collect::<BTreeMap<_, _>>();
    let existing = rows
        .iter()
        .map(|row| semantic_identity(&row.asset_path, &row.unit_key))
        .collect::<BTreeSet<_>>();
    let missing_semantic_ids = semantic_by_id
        .keys()
        .filter(|id| !existing.contains(*id))
        .cloned()
        .collect::<Vec<_>>();
    for source_ids in missing_semantic_ids.chunks(400) {
        let placeholders = (7..7 + source_ids.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
             FROM official_units u
             JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
             JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
             JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
             WHERE u.generation_id=?3 AND u.searchable=1 AND u.semantic_eligible=1
               AND (?4 IS NULL OR a.category=?4) AND (?5 IS NULL OR u.unit_kind=?5)
               AND (?6=0 OR u.prompt_eligible=1) AND u.semantic_id IN ({placeholders})"
        );
        let mut values = vec![
            SqlValue::Text(request.source_locale.clone()),
            SqlValue::Text(request.target_locale.clone()),
            SqlValue::Text(active.clone()),
            request
                .asset_category
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
            request
                .unit_kind
                .clone()
                .map(SqlValue::Text)
                .unwrap_or(SqlValue::Null),
            SqlValue::Integer(request.prompt_eligible_only.into()),
        ];
        values.extend(source_ids.iter().cloned().map(SqlValue::Text));
        let mut statement = connection.prepare(&sql)?;
        let candidates = statement
            .query_map(params_from_iter(values.iter()), map_row)?
            .collect::<Result<Vec<_>, _>>()?;
        for row in candidates {
            let source_id = semantic_identity(&row.asset_path, &row.unit_key);
            if semantic_by_id
                .get(&source_id)
                .is_some_and(|(fingerprint, _)| {
                    fingerprint
                        != &semantic_fingerprint(
                            &row.asset_path,
                            &row.unit_key,
                            &row.unit_kind,
                            &row.source_text,
                        )
                })
            {
                continue;
            }
            rows.push(row);
        }
    }
    let mut existing = rows
        .iter()
        .map(|row| semantic_identity(&row.asset_path, &row.unit_key))
        .collect::<BTreeSet<_>>();
    let mut entity_statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
         FROM official_units u
         JOIN official_texts s ON s.unit_id=u.id AND (?1 IN ('','default') OR s.locale=?1)
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
         JOIN official_assets a ON a.generation_id=u.generation_id AND a.path=u.asset_path AND a.locale=s.locale
         WHERE LOWER(u.asset_path)=?3 AND u.generation_id=?4 AND u.searchable=1 AND (?5 IS NULL OR a.category=?5)
           AND (?6 IS NULL OR u.unit_kind=?6) AND (?7=0 OR u.prompt_eligible=1)"
    )?;
    for entity_id in entity_semantic.keys() {
        let Some(name) = entity_id.strip_prefix("character:") else {
            continue;
        };
        let asset_path = format!("characters/dialogue/{name}.xnb");
        let candidates = entity_statement
            .query_map(
                params![
                    request.source_locale,
                    request.target_locale,
                    asset_path,
                    active,
                    request.asset_category,
                    request.unit_kind,
                    request.prompt_eligible_only
                ],
                |row| {
                    Ok(AiOfficialUnit {
                        id: row.get(0)?,
                        source_locale: request.source_locale.clone(),
                        target_locale: request.target_locale.clone(),
                        source_text: row.get(1)?,
                        target_text: row.get(2)?,
                        asset_path: row.get(3)?,
                        unit_key: row.get(4)?,
                        unit_kind: row.get(5)?,
                        searchable: row.get(6)?,
                        semantic_eligible: row.get(7)?,
                        prompt_eligible: row.get(8)?,
                        fingerprint: row.get(9)?,
                        similarity: 0.0,
                        score: 0.0,
                        semantic_similarity: None,
                        lexical_similarity: 0.0,
                        match_kind: "none".into(),
                        retrieval_mode: "lexical".into(),
                    })
                },
            )?
            .collect::<Result<Vec<_>, _>>()?;
        for row in candidates {
            if existing.insert(semantic_identity(&row.asset_path, &row.unit_key)) {
                rows.push(row);
            }
        }
    }
    for row in &mut rows {
        let (lexical, match_kind) = lexical_score(&request.query, row);
        let unit_semantic = semantic_by_id
            .get(&semantic_identity(&row.asset_path, &row.unit_key))
            .filter(|(fingerprint, _)| {
                fingerprint
                    == &semantic_fingerprint(
                        &row.asset_path,
                        &row.unit_key,
                        &row.unit_kind,
                        &row.source_text,
                    )
            })
            .map(|(_, similarity)| *similarity);
        let entity_semantic =
            character_entity_id(&row.asset_path).and_then(|id| entity_semantic.get(&id).copied());
        let semantic = merge_unit_entity_similarity(unit_semantic, entity_semantic);
        let strong_lexical_match = matches!(match_kind, "exact" | "whole-token");
        row.lexical_similarity = lexical;
        row.semantic_similarity = (!strong_lexical_match).then_some(semantic).flatten();
        let semantic_entity_match = !strong_lexical_match
            && entity_semantic.is_some_and(|entity| unit_semantic.is_none_or(|unit| entity > unit));
        row.match_kind = if semantic_entity_match {
            "semantic-entity"
        } else {
            match_kind
        }
        .into();
        row.retrieval_mode = if strong_lexical_match {
            "lexical"
        } else if semantic.is_some() {
            "semantic"
        } else {
            "lexical"
        }
        .into();
        row.score = if matches!(match_kind, "exact" | "whole-token") {
            lexical
        } else if let Some(semantic) = semantic.filter(|value| *value >= 0.80) {
            semantic * 0.8 + lexical * 0.2
        } else {
            lexical
        };
        row.similarity = row.score;
    }
    rows.retain(|row| {
        !is_internal_structured_record(row)
            && (matches!(row.match_kind.as_str(), "exact" | "whole-token")
                || row.semantic_similarity.is_some_and(|value| value >= 0.80)
                || row.lexical_similarity > 0.0)
    });
    rows.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.id.cmp(&right.id))
    });
    let total = rows.len() as u64;
    let records = rows
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect();
    Ok(AiOfficialSearchPage { records, total })
}

/// Search official text when the mod source is `default`.
///
/// SMAPI treats `default.json` as a final fallback, so its contents may be in
/// any language. Try every indexed game locale for lexical retrieval; use the
/// normal semantic candidates for English, whose vectors are the canonical
/// official source vectors.
pub(crate) fn search_with_locale_fallback(
    request: SearchOfficialLocalizationRequest,
    semantic_groups: Option<Vec<Vec<(String, String, f64)>>>,
) -> anyhow::Result<AiOfficialSearchPage> {
    if !is_default_locale(&request.source_locale) {
        return search_with_semantic(request, semantic_groups);
    }
    // `default` is intentionally treated as a wildcard source locale. The
    // lexical SQL path filters all indexed source locales in one connection;
    // this avoids reopening the database once per language for every entry.
    let mut request = request;
    request.source_locale = "default".into();
    search_with_semantic(request, Some(vec![Vec::new(), Vec::new()]))
}

#[derive(Clone, Debug)]
pub(crate) struct SemanticOfficialSource {
    pub id: String,
    pub text: String,
    pub context: String,
    pub fingerprint: String,
}

#[derive(Clone, Debug)]
pub(crate) struct SemanticOfficialEntity {
    pub id: String,
    pub text: String,
    pub context: String,
    pub fingerprint: String,
}

pub(crate) fn character_entity_id(asset_path: &str) -> Option<String> {
    let normalized = normalize_separators(asset_path);
    let lower = normalized.to_ascii_lowercase();
    let prefix = "characters/dialogue/";
    let start = lower.find(prefix)? + prefix.len();
    let name = normalized.get(start..)?.strip_suffix(".xnb")?;
    (!name.is_empty()).then(|| format!("character:{}", name.to_ascii_lowercase()))
}

pub(crate) fn activity_semantic_alias(activity: &str) -> Option<String> {
    let value = match activity {
        "sleep" | "work" | "sit" | "bed" | "stand" => return None,
        "guitar" => "guitar music musician band 吉他 音乐 乐队",
        "skateboarding" => "skateboard skateboarding 滑板",
        "gameboy" => "handheld video games gaming 掌机 电子游戏",
        "pool" => "pool billiards 台球",
        "football" => "football sports 橄榄球 运动",
        "lift_weights" => "weightlifting fitness exercise 举重 健身 锻炼",
        "jumprope" => "jump rope exercise 跳绳 运动",
        "paint" | "painting" => "painting art painter 绘画 艺术 画家",
        "read" | "reading" => "reading books 阅读 读书",
        "dance" => "dance dancing 舞蹈 跳舞",
        "drink" => "drinking alcohol 喝酒",
        "garden" => "gardening flowers 园艺 花卉",
        "tinker" => "engineering inventing machines 工程 发明 机械",
        "play" => "playing games 玩耍 游戏",
        _ => return Some(activity.replace('_', " ")),
    };
    Some(value.into())
}

pub(crate) fn semantic_entity_snapshot() -> anyhow::Result<Vec<SemanticOfficialEntity>> {
    let connection = open()?;
    let Some(revision) = active_revision()? else {
        return Ok(Vec::new());
    };
    let mut statement = connection.prepare(
        "SELECT u.asset_path,t.text FROM official_units u
         JOIN official_texts t ON t.unit_id=u.id AND t.locale='en-US'
         WHERE u.generation_id=? AND u.unit_kind='schedule' ORDER BY u.asset_path",
    )?;
    let mut activities = BTreeMap::<String, BTreeSet<String>>::new();
    for row in statement.query_map([&revision], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })? {
        let (asset_path, text) = row?;
        let normalized = normalize_separators(&asset_path);
        let name = normalized
            .rsplit('/')
            .next()
            .and_then(|value| value.strip_suffix(".xnb"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if name.is_empty() || name == "template" {
            continue;
        }
        let prefix = format!("{name}_");
        for token in
            text.split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        {
            if let Some(activity) = token.to_ascii_lowercase().strip_prefix(&prefix) {
                if !activity.is_empty() {
                    activities
                        .entry(name.clone())
                        .or_default()
                        .insert(activity.to_string());
                }
            }
        }
    }
    Ok(activities
        .into_iter()
        .filter(|(_, activities)| !activities.is_empty())
        .filter_map(|(name, activities)| {
            let activities = activities
                .into_iter()
                .filter_map(|activity| activity_semantic_alias(&activity))
                .collect::<Vec<_>>()
                .join("; ");
            if activities.is_empty() {
                return None;
            }
            let text = format!("Character {name}. Activities and interests: {activities}.");
            let id = format!("character:{name}");
            Some(SemanticOfficialEntity {
                fingerprint: hex(Sha256::digest(text.as_bytes())),
                id,
                context: "Official character schedule activity profile".into(),
                text,
            })
        })
        .collect())
}

pub(crate) fn semantic_snapshot() -> anyhow::Result<(Option<String>, Vec<SemanticOfficialSource>)> {
    let connection = open()?;
    let Some(revision) = active_revision()? else {
        return Ok((None, Vec::new()));
    };
    let mut statement = connection.prepare(
        "SELECT u.semantic_id,u.asset_path,u.unit_key,u.unit_kind,t.text,u.semantic_fingerprint
         FROM official_units u JOIN official_texts t ON t.unit_id=u.id AND t.locale='en-US'
         WHERE u.generation_id=? AND u.semantic_eligible=1 ORDER BY u.id",
    )?;
    let records = statement
        .query_map([&revision], |row| {
            let asset: String = row.get(1)?;
            let key: String = row.get(2)?;
            let kind: String = row.get(3)?;
            let source: String = row.get(4)?;
            Ok(SemanticOfficialSource {
                id: row.get(0)?,
                text: source,
                context: format!("Type: {kind}\nAsset: {asset}\nKey: {key}"),
                fingerprint: row.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok((Some(revision), records))
}

pub fn find_prompt_examples_batch(
    source_locale: &str,
    target_locale: &str,
    queries: &[String],
) -> anyhow::Result<Vec<Vec<AiOfficialUnit>>> {
    let source_locale = if is_default_locale(source_locale) {
        source_locale.to_string()
    } else {
        canonical_locale(source_locale)
    };
    let target_locale = canonical_locale(target_locale);
    let semantic = if is_default_locale(&source_locale) {
        queries
            .iter()
            .map(|_| vec![Vec::new(), Vec::new()])
            .collect()
    } else {
        crate::domain::localization::semantic::search_candidate_groups_batch(
            &[("official", 1_000), ("official-entity", 20)],
            None,
            &source_locale,
            queries,
        )
        .unwrap_or_else(|error| {
            crate::domain::localization::operational_log::event("semantic.fallback")
                .field("retrievalMode", "lexical")
                .field(
                    "reason",
                    crate::domain::localization::operational_log::failure_category(&error),
                )
                .field("queries", queries.len())
                .field("candidateGroups", 2)
                .emit_debug(crate::domain::localization::operational_log::SEMANTIC);
            queries
                .iter()
                .map(|_| vec![Vec::new(), Vec::new()])
                .collect()
        })
    };
    queries
        .iter()
        .zip(semantic)
        .map(|(query, groups)| {
            Ok(search_with_locale_fallback(
                SearchOfficialLocalizationRequest {
                    source_locale: source_locale.to_string(),
                    target_locale: target_locale.clone(),
                    query: query.clone(),
                    asset_category: None,
                    unit_kind: None,
                    prompt_eligible_only: true,
                    allow_literal_scan: false,
                    offset: 0,
                    limit: 5,
                },
                Some(groups),
            )?
            .records)
        })
        .collect()
}

pub fn find_terms_in_text(
    source_locale: &str,
    target_locale: &str,
    source_text: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    if is_default_locale(source_locale) {
        let mut terms = Vec::new();
        let mut seen = BTreeSet::new();
        for locale in std::iter::once("en-US").chain(LOCALES.iter().copied()) {
            for term in find_terms_in_text_for_locale(locale, target_locale, source_text)? {
                if seen.insert((term.asset_path.clone(), term.unit_key.clone())) {
                    terms.push(term);
                }
            }
        }
        terms.sort_by(|left, right| {
            right
                .source_text
                .chars()
                .count()
                .cmp(&left.source_text.chars().count())
        });
        return Ok(terms);
    }
    find_terms_in_text_for_locale(&canonical_locale(source_locale), target_locale, source_text)
}

fn find_terms_in_text_for_locale(
    source_locale: &str,
    target_locale: &str,
    source_text: &str,
) -> anyhow::Result<Vec<AiOfficialUnit>> {
    let target_locale = canonical_locale(target_locale);
    let connection = open()?;
    let active =
        active_revision()?.context("The official localization index has not been built.")?;
    let mut statement = connection.prepare(
        "SELECT u.id,s.text,t.text,u.asset_path,u.unit_key,u.unit_kind,u.searchable,u.semantic_eligible,u.prompt_eligible,u.fingerprint
         FROM official_units u
         JOIN official_texts s ON s.unit_id=u.id AND s.locale=?1
         JOIN official_texts t ON t.unit_id=u.id AND t.locale=?2
         WHERE u.generation_id=?3 AND u.unit_kind='term' AND u.prompt_eligible=1
           AND instr(lower(?4),lower(s.text))>0
         ORDER BY length(s.text) DESC,u.id
         LIMIT 50",
    )?;
    statement
        .query_map(
            params![&source_locale, &target_locale, active, source_text],
            |row| {
                Ok(AiOfficialUnit {
                    id: row.get(0)?,
                    source_locale: source_locale.to_string(),
                    target_locale: target_locale.to_string(),
                    source_text: row.get(1)?,
                    target_text: row.get(2)?,
                    asset_path: row.get(3)?,
                    unit_key: row.get(4)?,
                    unit_kind: row.get(5)?,
                    searchable: row.get(6)?,
                    semantic_eligible: row.get(7)?,
                    prompt_eligible: row.get(8)?,
                    fingerprint: row.get(9)?,
                    similarity: 1.0,
                    score: 1.0,
                    semantic_similarity: None,
                    lexical_similarity: 1.0,
                    match_kind: "exact".into(),
                    retrieval_mode: "lexical".into(),
                })
            },
        )?
        .collect::<Result<Vec<_>, _>>()
        .map_err(Into::into)
}
