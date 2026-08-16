use super::schema::{bump, normalize, now, open, text_hash};
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};
use std::collections::{BTreeMap, BTreeSet};

fn memory_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiTranslationMemoryEntry> {
    Ok(AiTranslationMemoryEntry {
        id: row.get(0)?,
        scope_id: row.get(1)?,
        source_locale: row.get(2)?,
        target_locale: row.get(3)?,
        source_text: row.get(4)?,
        target_text: row.get(5)?,
        source_kind: row.get(6)?,
        file_namespace: row.get(7)?,
        unit_key: row.get(8)?,
        confirmed_at_ms: row.get(9)?,
        use_count: row.get(10)?,
        similarity: 0.0,
        score: 0.0,
        semantic_similarity: None,
        lexical_similarity: 0.0,
        match_kind: "none".into(),
        retrieval_mode: "lexical".into(),
    })
}
fn memory_lexical_score(query: &str, row: &AiTranslationMemoryEntry) -> (f64, &'static str) {
    let query = normalize(query);
    let text = normalize(&row.source_text);
    let target = normalize(&row.target_text);
    let key = row.unit_key.as_deref().map(normalize).unwrap_or_default();
    if query == text || query == target || query == key {
        return (1.0, "exact");
    }
    let boundary = |value: &str| {
        value
            .split(|character: char| !character.is_alphanumeric() && character != '_')
            .any(|token| token == query)
    };
    if boundary(&text)
        || boundary(&target)
        || boundary(&key)
        || row
            .file_namespace
            .as_deref()
            .is_some_and(|value| boundary(&normalize(value)))
    {
        return (0.9, "whole-token");
    }
    if text.contains(&query) || target.contains(&query) || key.contains(&query) {
        (0.35, "substring")
    } else {
        let score = crate::domain::localization::lexical::keyword_score(
            &query,
            &[
                &row.source_text,
                &row.target_text,
                row.unit_key.as_deref().unwrap_or_default(),
                row.file_namespace.as_deref().unwrap_or_default(),
            ],
        );
        if score > 0.0 {
            (score, "keyword")
        } else {
            (0.0, "semantic")
        }
    }
}

pub(crate) fn lexical_memory_suggestions(
    db: &Connection,
    scope_id: &str,
    source_locale: &str,
    target_locale: &str,
    query: &str,
    limit: usize,
) -> anyhow::Result<Vec<AiTranslationMemoryEntry>> {
    let mut tokens = crate::domain::localization::lexical::keywords(query);
    if tokens.is_empty() {
        tokens.push(query.trim().to_lowercase());
    }
    let mut sql = "SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count FROM translation_memory WHERE scope_id=? AND source_locale=? AND target_locale=? AND (".to_string();
    let mut values: Vec<rusqlite::types::Value> = vec![
        scope_id.to_string().into(),
        source_locale.to_string().into(),
        target_locale.to_string().into(),
    ];
    for (index, token) in tokens.iter().enumerate() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        sql.push_str("source_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(unit_key,'') LIKE ? ESCAPE '\\' COLLATE NOCASE");
        let pattern = crate::domain::localization::lexical::like_pattern(token);
        values.extend([pattern.clone().into(), pattern.into()]);
    }
    sql.push_str(") ORDER BY confirmed_at_ms DESC LIMIT 5000");
    let mut statement = db.prepare(&sql)?;
    let mut records = statement
        .query_map(params_from_iter(values), memory_row)?
        .collect::<Result<Vec<_>, _>>()?;
    for row in &mut records {
        let (score, kind) = memory_lexical_score(query, row);
        row.lexical_similarity = score;
        row.score = score;
        row.similarity = score;
        row.match_kind = kind.into();
        row.retrieval_mode = "lexical".into();
    }
    records.retain(|row| row.lexical_similarity > 0.0);
    records.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.id.cmp(&right.id))
    });
    records.truncate(limit);
    Ok(records)
}

pub fn search_memory(
    request: SearchLocalizationKnowledgeRequest,
) -> anyhow::Result<AiTranslationMemoryPage> {
    let semantic = match (request.query.as_deref(), request.source_locale.as_deref()) {
        (Some(query), Some(source)) if !query.trim().is_empty() && !source.trim().is_empty() => {
            crate::domain::localization::semantic::search_candidates(
                "translation-memory",
                Some(&request.scope_id),
                source,
                query,
                50,
            )
            .unwrap_or_default()
        }
        _ => Vec::new(),
    };
    search_memory_with_semantic(request, semantic)
}

pub(crate) fn search_memory_with_semantic(
    request: SearchLocalizationKnowledgeRequest,
    semantic: Vec<(String, String, f64)>,
) -> anyhow::Result<AiTranslationMemoryPage> {
    if request.limit == 0 || request.limit > 500 {
        bail!("Memory page size must be between 1 and 500.")
    }
    let db = open()?;
    let query = request.query.unwrap_or_default();
    let source = request.source_locale.unwrap_or_default();
    let target = request.target_locale.unwrap_or_default();
    let mut keywords = crate::domain::localization::lexical::keywords(&query);
    if keywords.is_empty() && !query.trim().is_empty() {
        keywords.push(query.trim().to_lowercase());
    }
    let mut sql = "SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count FROM translation_memory WHERE scope_id=?".to_string();
    let mut values = vec![rusqlite::types::Value::Text(request.scope_id.clone())];
    if !source.is_empty() {
        sql.push_str(" AND source_locale=?");
        values.push(source.clone().into());
    }
    if !target.is_empty() {
        sql.push_str(" AND target_locale=?");
        values.push(target.clone().into());
    }
    if !query.is_empty() {
        sql.push_str(" AND (");
        for (index, token) in keywords.iter().enumerate() {
            if index > 0 {
                sql.push_str(" OR ");
            }
            sql.push_str("source_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR target_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(unit_key,'') LIKE ? ESCAPE '\\' COLLATE NOCASE");
            let pattern = crate::domain::localization::lexical::like_pattern(token);
            values.extend([
                pattern.clone().into(),
                pattern.clone().into(),
                pattern.into(),
            ]);
        }
        sql.push(')');
    }
    sql.push_str(" ORDER BY confirmed_at_ms DESC LIMIT 5000");
    let mut statement = db.prepare(&sql)?;
    let mut records = statement
        .query_map(params_from_iter(values), memory_row)?
        .collect::<Result<Vec<_>, _>>()?;
    let semantic_by_id = semantic
        .into_iter()
        .map(|(id, fingerprint, similarity)| (id, (fingerprint, similarity)))
        .collect::<BTreeMap<_, _>>();
    let existing = records
        .iter()
        .map(|row| row.id.clone())
        .collect::<BTreeSet<_>>();
    for id in semantic_by_id.keys().filter(|id| !existing.contains(*id)) {
        if let Some(row) = db.query_row(
            "SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count
             FROM translation_memory WHERE id=? AND scope_id=? AND (?='' OR source_locale=?) AND (?='' OR target_locale=?)",
            params![id,request.scope_id,source,source,target,target], memory_row,
        ).optional()? {
            if semantic_by_id
                .get(id)
                .is_some_and(|(fingerprint, _)| fingerprint != &text_hash(&row.source_text))
            {
                continue;
            }
            records.push(row);
        }
    }
    for row in &mut records {
        let (lexical, kind) = memory_lexical_score(&query, row);
        let semantic = semantic_by_id
            .get(&row.id)
            .filter(|(fingerprint, _)| fingerprint == &text_hash(&row.source_text))
            .map(|(_, similarity)| *similarity);
        row.lexical_similarity = lexical;
        row.semantic_similarity = semantic;
        row.match_kind = kind.into();
        row.retrieval_mode = if semantic.is_some() {
            "semantic"
        } else {
            "lexical"
        }
        .into();
        row.score = if matches!(kind, "exact" | "whole-token") {
            lexical
        } else if let Some(value) = semantic.filter(|value| *value >= 0.80) {
            value * 0.8 + lexical * 0.2
        } else {
            lexical
        };
        row.similarity = row.score;
    }
    if !query.is_empty() {
        records.retain(|row| {
            row.match_kind != "semantic"
                || row.semantic_similarity.is_some_and(|value| value >= 0.80)
        });
        records.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
    }
    let total = records.len() as u64;
    let records = records
        .into_iter()
        .skip(request.offset as usize)
        .take(request.limit as usize)
        .collect();
    Ok(AiTranslationMemoryPage { records, total })
}

pub(crate) fn probe_memory_global(
    source_locale: &str,
    target_locale: &str,
    query: &str,
    semantic: Vec<(String, String, f64)>,
    limit: u32,
) -> anyhow::Result<Vec<AiTranslationMemoryEntry>> {
    if query.trim().is_empty() || limit == 0 || limit > 50 {
        bail!("Semantic memory probe requires a query and a limit between 1 and 50.");
    }
    let db = open()?;
    let mut keywords = crate::domain::localization::lexical::keywords(query);
    if keywords.is_empty() {
        keywords.push(query.trim().to_lowercase());
    }
    let mut sql = "SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count FROM translation_memory WHERE source_locale=? AND target_locale=? AND (".to_string();
    let mut values: Vec<rusqlite::types::Value> = vec![
        source_locale.to_string().into(),
        target_locale.to_string().into(),
    ];
    for (index, token) in keywords.iter().enumerate() {
        if index > 0 {
            sql.push_str(" OR ");
        }
        sql.push_str("source_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR target_text LIKE ? ESCAPE '\\' COLLATE NOCASE OR COALESCE(unit_key,'') LIKE ? ESCAPE '\\' COLLATE NOCASE");
        let pattern = crate::domain::localization::lexical::like_pattern(token);
        values.extend([
            pattern.clone().into(),
            pattern.clone().into(),
            pattern.into(),
        ]);
    }
    sql.push_str(") ORDER BY confirmed_at_ms DESC LIMIT 5000");
    let mut statement = db.prepare(&sql)?;
    let mut records = statement
        .query_map(params_from_iter(values), memory_row)?
        .collect::<Result<Vec<_>, _>>()?;
    let semantic_by_id = semantic
        .into_iter()
        .map(|(id, fingerprint, similarity)| (id, (fingerprint, similarity)))
        .collect::<BTreeMap<_, _>>();
    let existing = records
        .iter()
        .map(|row| row.id.clone())
        .collect::<BTreeSet<_>>();
    for id in semantic_by_id.keys().filter(|id| !existing.contains(*id)) {
        if let Some(row) = db
            .query_row(
                "SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count
                 FROM translation_memory WHERE id=? AND source_locale=? AND target_locale=?",
                params![id, source_locale, target_locale],
                memory_row,
            )
            .optional()?
        {
            if semantic_by_id
                .get(id)
                .is_some_and(|(fingerprint, _)| fingerprint != &text_hash(&row.source_text))
            {
                continue;
            }
            records.push(row);
        }
    }
    for row in &mut records {
        let (lexical, kind) = memory_lexical_score(query, row);
        let semantic = semantic_by_id
            .get(&row.id)
            .filter(|(fingerprint, _)| fingerprint == &text_hash(&row.source_text))
            .map(|(_, similarity)| *similarity);
        row.lexical_similarity = lexical;
        row.semantic_similarity = semantic;
        row.match_kind = kind.into();
        row.retrieval_mode = if semantic.is_some() {
            "semantic"
        } else {
            "lexical"
        }
        .into();
        row.score = if matches!(kind, "exact" | "whole-token") {
            lexical
        } else if let Some(value) = semantic.filter(|value| *value >= 0.80) {
            value * 0.8 + lexical * 0.2
        } else {
            lexical
        };
        row.similarity = row.score;
    }
    records.retain(|row| {
        row.match_kind != "semantic" || row.semantic_similarity.is_some_and(|value| value >= 0.80)
    });
    records.sort_by(|left, right| {
        right
            .score
            .total_cmp(&left.score)
            .then_with(|| left.id.cmp(&right.id))
    });
    records.truncate(limit as usize);
    Ok(records)
}

#[derive(Clone, Debug)]
pub(crate) struct SemanticMemorySource {
    pub id: String,
    pub scope_id: String,
    pub source_locale: String,
    pub text: String,
    pub context: String,
    pub fingerprint: String,
}

pub(crate) fn semantic_snapshot(
    requested_scope_ids: &[String],
) -> anyhow::Result<(String, Vec<SemanticMemorySource>)> {
    let db = open()?;
    let mut scopes = if requested_scope_ids.is_empty() {
        let mut statement = db.prepare("SELECT id FROM localization_scopes ORDER BY id")?;
        statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
    } else {
        requested_scope_ids.to_vec()
    };
    scopes.sort();
    scopes.dedup();
    let mut revisions = Vec::with_capacity(scopes.len());
    let mut records = Vec::new();
    for scope_id in scopes {
        let revision = db
            .query_row(
                "SELECT revision FROM localization_scopes WHERE id=?",
                [&scope_id],
                |row| row.get::<_, u64>(0),
            )
            .with_context(|| format!("Localization scope {scope_id} does not exist."))?;
        revisions.push(format!("{scope_id}:{revision}"));
        let mut statement = db.prepare(
            "SELECT id,source_locale,source_text,source_hash,file_namespace,unit_key
             FROM translation_memory WHERE scope_id=? ORDER BY id",
        )?;
        records.extend(
            statement
                .query_map([&scope_id], |row| {
                    let source_text: String = row.get(2)?;
                    let namespace: Option<String> = row.get(4)?;
                    let unit_key: Option<String> = row.get(5)?;
                    Ok(SemanticMemorySource {
                        id: row.get(0)?,
                        scope_id: scope_id.clone(),
                        source_locale: row.get(1)?,
                        text: source_text,
                        context: format!(
                            "File: {}\nKey: {}",
                            namespace.as_deref().unwrap_or_default(),
                            unit_key.as_deref().unwrap_or_default()
                        ),
                        fingerprint: row.get(3)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?,
        );
    }
    Ok((revisions.join("|"), records))
}

pub fn record_confirmed(request: RecordConfirmedTranslationsRequest) -> anyhow::Result<u64> {
    let mut db = open()?;
    let tx = db.transaction()?;
    tx.execute("DELETE FROM translation_memory WHERE scope_id=? AND source_kind='automatic' AND file_namespace=?",params![request.scope_id,request.file_namespace])?;
    let retained: u64 = tx.query_row(
        "SELECT COUNT(*) FROM translation_memory WHERE scope_id=?",
        [&request.scope_id],
        |row| row.get(0),
    )?;
    if retained + request.entries.len() as u64 > 100_000 {
        bail!("A localization scope supports at most 100000 memory entries.")
    }
    let count = request.entries.len() as u64;
    for entry in request.entries {
        crate::domain::localization::jobs::check(&request.job_id)?;
        tx.execute("INSERT INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms) VALUES(?,?,?,?,?,?,?,'automatic',?,?,?)",params![uuid::Uuid::new_v4().to_string(),request.scope_id,entry.source_locale,entry.target_locale,entry.source_text,entry.target_text,text_hash(&entry.source_text),entry.file_namespace,entry.unit_key,now()])?;
    }
    bump(&tx, &request.scope_id)?;
    tx.commit()?;
    Ok(count)
}
pub fn delete_memory(request: DeleteLocalizationEntriesRequest) -> anyhow::Result<u64> {
    let mut db = open()?;
    let tx = db.transaction()?;
    let mut removed = 0;
    for id in request.ids {
        removed += tx.execute(
            "DELETE FROM translation_memory WHERE id=? AND scope_id=?",
            params![id, request.scope_id],
        )?;
    }
    if removed > 0 {
        bump(&tx, &request.scope_id)?;
    }
    tx.commit()?;
    Ok(removed as u64)
}

pub fn copy_memory(request: CopyTranslationMemoryEntriesRequest) -> anyhow::Result<u64> {
    if request.source_scope_id == request.target_scope_id {
        bail!("Translation memory source and target scopes must differ.")
    }
    if request.ids.is_empty() {
        bail!("At least one translation memory entry must be selected.")
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    let target_exists: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM localization_scopes WHERE id=?)",
        [&request.target_scope_id],
        |row| row.get(0),
    )?;
    if !target_exists {
        bail!("Target localization scope does not exist.")
    }
    let current: u64 = tx.query_row(
        "SELECT COUNT(*) FROM translation_memory WHERE scope_id=?",
        [&request.target_scope_id],
        |row| row.get(0),
    )?;
    if current.saturating_add(request.ids.len() as u64) > 100_000 {
        bail!("Translation memory scope limit of 100000 entries would be exceeded.")
    }
    let mut copied = 0_u64;
    for id in &request.ids {
        let entry = tx.query_row(
            "SELECT source_locale,target_locale,source_text,target_text,source_hash,file_namespace,unit_key FROM translation_memory WHERE id=? AND scope_id=?",
            params![id, request.source_scope_id],
            |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,String>(3)?,row.get::<_,String>(4)?,row.get::<_,Option<String>>(5)?,row.get::<_,Option<String>>(6)?)),
        ).optional()?;
        let Some((
            source_locale,
            target_locale,
            source_text,
            target_text,
            source_hash,
            file_namespace,
            unit_key,
        )) = entry
        else {
            continue;
        };
        tx.execute(
            "INSERT INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count) VALUES(?,?,?,?,?,?,?,'manual',?,?,?,0) ON CONFLICT(scope_id,source_locale,target_locale,source_hash) WHERE source_kind<>'automatic' DO UPDATE SET target_text=excluded.target_text,file_namespace=excluded.file_namespace,unit_key=excluded.unit_key,confirmed_at_ms=excluded.confirmed_at_ms",
            params![uuid::Uuid::new_v4().to_string(),request.target_scope_id,source_locale,target_locale,source_text,target_text,source_hash,file_namespace,unit_key,now()],
        )?;
        copied += 1;
    }
    if copied == 0 {
        bail!("No selected translation memory entries exist in the source scope.")
    }
    bump(&tx, &request.target_scope_id)?;
    tx.commit()?;
    Ok(copied)
}

pub(crate) fn insert_imported_memory(
    tx: &Transaction<'_>,
    entry: &AiTranslationMemoryEntry,
) -> anyhow::Result<()> {
    if entry.source_locale.trim().is_empty()
        || entry.target_locale.trim().is_empty()
        || entry.source_text.trim().is_empty()
        || entry.target_text.trim().is_empty()
    {
        bail!("Imported translation memory fields cannot be empty.")
    }
    tx.execute("INSERT OR REPLACE INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count) VALUES(?,?,?,?,?,?,?,'imported',?,?,?,?)",params![uuid::Uuid::new_v4().to_string(),entry.scope_id,entry.source_locale,entry.target_locale,entry.source_text,entry.target_text,text_hash(&entry.source_text),entry.file_namespace,entry.unit_key,now(),entry.use_count])?;
    Ok(())
}
