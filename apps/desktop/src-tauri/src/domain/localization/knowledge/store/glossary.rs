use super::schema::{bump, normalize, now, open};
use crate::domain::localization::types::*;
use anyhow::bail;
use rusqlite::{OptionalExtension, Transaction, params, params_from_iter};

pub(crate) fn glossary_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiGlossaryEntry> {
    Ok(AiGlossaryEntry {
        id: row.get(0)?,
        scope_id: row.get(1)?,
        source_locale: row.get(2)?,
        target_locale: row.get(3)?,
        source_term: row.get(4)?,
        target_term: row.get(5)?,
        match_mode: row.get(6)?,
        do_not_translate: row.get(7)?,
        notes: row.get(8)?,
        updated_at_ms: row.get(9)?,
    })
}
pub fn list_glossary(
    request: SearchLocalizationKnowledgeRequest,
) -> anyhow::Result<AiGlossaryPage> {
    if request.limit == 0 || request.limit > 500 {
        bail!("Glossary page size must be between 1 and 500.")
    }
    let db = open()?;
    let mut sql = String::from("scope_id=?");
    let mut values: Vec<rusqlite::types::Value> = vec![request.scope_id.into()];
    for (column, value) in [
        ("source_locale", request.source_locale),
        ("target_locale", request.target_locale),
    ] {
        if let Some(value) = value {
            sql.push_str(&format!(" AND {column}=?"));
            values.push(value.into());
        }
    }
    if let Some(query) = request.query {
        sql.push_str(" AND (source_term LIKE ? OR target_term LIKE ? OR notes LIKE ?)");
        let query = format!("%{query}%");
        values.extend([query.clone().into(), query.clone().into(), query.into()]);
    }
    let total = db.query_row(
        &format!("SELECT COUNT(*) FROM glossary_entries WHERE {sql}"),
        params_from_iter(values.clone()),
        |row| row.get(0),
    )?;
    values.push((request.limit as i64).into());
    values.push((request.offset as i64).into());
    let mut statement=db.prepare(&format!("SELECT id,scope_id,source_locale,target_locale,source_term,target_term,match_mode,do_not_translate,notes,updated_at_ms FROM glossary_entries WHERE {sql} ORDER BY updated_at_ms DESC LIMIT ? OFFSET ?"))?;
    let records = statement
        .query_map(params_from_iter(values), glossary_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AiGlossaryPage { records, total })
}

pub fn upsert_glossary(
    request: UpsertLocalizationGlossaryEntriesRequest,
) -> anyhow::Result<AiGlossaryPage> {
    if request.entries.is_empty() {
        bail!("Glossary update cannot be empty.")
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    for entry in request.entries {
        if entry.source_term.trim().is_empty()
            || (!entry.do_not_translate && entry.target_term.trim().is_empty())
        {
            bail!("Glossary terms cannot be empty.")
        }
        if !matches!(entry.match_mode.as_str(), "exact" | "case-insensitive") {
            bail!("Glossary match mode is invalid.")
        }
        let id = if entry.id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            entry.id
        };
        tx.execute("INSERT INTO glossary_entries(id,scope_id,source_locale,target_locale,source_term,target_term,normalized_source,match_mode,do_not_translate,notes,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_id,source_locale,target_locale,normalized_source) DO UPDATE SET target_term=excluded.target_term,match_mode=excluded.match_mode,do_not_translate=excluded.do_not_translate,notes=excluded.notes,updated_at_ms=excluded.updated_at_ms",params![id,request.scope_id,entry.source_locale,entry.target_locale,entry.source_term,entry.target_term,normalize(&entry.source_term),entry.match_mode,entry.do_not_translate,entry.notes,now()])?;
    }
    let final_count: u64 = tx.query_row(
        "SELECT COUNT(*) FROM glossary_entries WHERE scope_id=?",
        [&request.scope_id],
        |row| row.get(0),
    )?;
    if final_count > 10_000 {
        bail!("A localization scope supports at most 10000 glossary entries.")
    }
    bump(&tx, &request.scope_id)?;
    tx.commit()?;
    list_glossary(SearchLocalizationKnowledgeRequest {
        scope_id: request.scope_id,
        source_locale: None,
        target_locale: None,
        query: None,
        offset: 0,
        limit: 100,
    })
}

pub fn delete_glossary(request: DeleteLocalizationEntriesRequest) -> anyhow::Result<u64> {
    let mut db = open()?;
    let tx = db.transaction()?;
    let mut removed = 0;
    for id in request.ids {
        removed += tx.execute(
            "DELETE FROM glossary_entries WHERE id=? AND scope_id=?",
            params![id, request.scope_id],
        )?;
    }
    if removed > 0 {
        bump(&tx, &request.scope_id)?;
    }
    tx.commit()?;
    Ok(removed as u64)
}

pub fn load_style(
    request: LoadLocalizationStyleGuideRequest,
) -> anyhow::Result<Option<AiStyleGuide>> {
    open()?.query_row("SELECT scope_id,target_locale,tone,audience,formality,forbidden_phrases,preferred_phrases,rules,updated_at_ms FROM style_guides WHERE scope_id=? AND target_locale=?",params![request.scope_id,request.target_locale],|row|Ok(AiStyleGuide{scope_id:row.get(0)?,target_locale:row.get(1)?,tone:row.get(2)?,audience:row.get(3)?,formality:row.get(4)?,forbidden_phrases:serde_json::from_str(&row.get::<_,String>(5)?).unwrap_or_default(),preferred_phrases:serde_json::from_str(&row.get::<_,String>(6)?).unwrap_or_default(),rules:serde_json::from_str(&row.get::<_,String>(7)?).unwrap_or_default(),updated_at_ms:row.get(8)?})).optional().map_err(Into::into)
}
pub fn save_style(mut guide: AiStyleGuide) -> anyhow::Result<AiStyleGuide> {
    let serialized = serde_json::to_vec(&guide)?;
    if serialized.len() > 16 * 1024 {
        bail!("Style guide exceeds the 16 KB limit.")
    }
    guide.updated_at_ms = now();
    let mut db = open()?;
    let tx = db.transaction()?;
    tx.execute("INSERT INTO style_guides VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_id,target_locale) DO UPDATE SET tone=excluded.tone,audience=excluded.audience,formality=excluded.formality,forbidden_phrases=excluded.forbidden_phrases,preferred_phrases=excluded.preferred_phrases,rules=excluded.rules,updated_at_ms=excluded.updated_at_ms",params![guide.scope_id,guide.target_locale,guide.tone,guide.audience,guide.formality,serde_json::to_string(&guide.forbidden_phrases)?,serde_json::to_string(&guide.preferred_phrases)?,serde_json::to_string(&guide.rules)?,guide.updated_at_ms])?;
    bump(&tx, &guide.scope_id)?;
    tx.commit()?;
    Ok(guide)
}

pub(crate) fn insert_imported_glossary(
    tx: &Transaction<'_>,
    entry: &AiGlossaryEntry,
) -> anyhow::Result<()> {
    if entry.source_term.trim().is_empty()
        || (!entry.do_not_translate && entry.target_term.trim().is_empty())
    {
        bail!("Imported glossary terms cannot be empty.")
    }
    if !matches!(entry.match_mode.as_str(), "exact" | "case-insensitive") {
        bail!("Imported glossary match mode is invalid.")
    }
    tx.execute("INSERT INTO glossary_entries(id,scope_id,source_locale,target_locale,source_term,target_term,normalized_source,match_mode,do_not_translate,notes,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_id,source_locale,target_locale,normalized_source) DO UPDATE SET target_term=excluded.target_term,match_mode=excluded.match_mode,do_not_translate=excluded.do_not_translate,notes=excluded.notes,updated_at_ms=excluded.updated_at_ms",params![uuid::Uuid::new_v4().to_string(),entry.scope_id,entry.source_locale,entry.target_locale,entry.source_term,entry.target_term,normalize(&entry.source_term),entry.match_mode,entry.do_not_translate,entry.notes,now()])?;
    Ok(())
}
