use super::schema::{GLOBAL_SCOPE_ID, bump, normalized_binding, now, open, text_hash};
use crate::domain::ai::types::KnowledgePolicy;
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};

fn scope_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiLocalizationScope> {
    Ok(AiLocalizationScope {
        id: row.get(0)?,
        kind: row.get(1)?,
        name: row.get(2)?,
        revision: row.get(3)?,
        created_at_ms: row.get(4)?,
        updated_at_ms: row.get(5)?,
        last_used_at_ms: row.get(6)?,
        bindings: Vec::new(),
    })
}

fn attach_bindings(db: &Connection, scopes: &mut [AiLocalizationScope]) -> anyhow::Result<()> {
    if scopes.is_empty() {
        return Ok(());
    }
    let placeholders = scopes.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let mut statement = db.prepare(&format!(
        "SELECT binding_kind,binding_value,scope_id FROM scope_bindings WHERE scope_id IN ({placeholders})"
    ))?;
    let rows = statement.query_map(
        params_from_iter(scopes.iter().map(|scope| scope.id.clone())),
        |row| {
            Ok((
                row.get::<_, String>(2)?,
                AiLocalizationScopeBinding {
                    kind: row.get(0)?,
                    value: row.get(1)?,
                },
            ))
        },
    )?;
    let mut bindings: std::collections::HashMap<String, Vec<AiLocalizationScopeBinding>> =
        std::collections::HashMap::new();
    for row in rows {
        let (scope_id, binding) = row?;
        bindings.entry(scope_id).or_default().push(binding);
    }
    for scope in scopes {
        scope.bindings = bindings.remove(&scope.id).unwrap_or_default();
    }
    Ok(())
}

pub fn resolve_scope(
    request: ResolveLocalizationScopeRequest,
) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    if request.binding_kind == "global" {
        return load_scope(LoadLocalizationScopeRequest {
            scope_id: GLOBAL_SCOPE_ID.into(),
        });
    }
    let (binding_kind, binding_value) =
        normalized_binding(&request.binding_kind, &request.binding_value)?;
    let mut db = open()?;
    let tx = db.transaction()?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT scope_id FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
            |row| row.get(0),
        )
        .optional()?;
    let scope_id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let timestamp = now();
    tx.execute("INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile',?,?,?,?)",params![scope_id,request.name,timestamp,timestamp,timestamp])?;
    tx.execute(
        "INSERT OR IGNORE INTO scope_bindings(binding_kind,binding_value,scope_id) VALUES(?,?,?)",
        params![binding_kind, binding_value, scope_id],
    )?;
    tx.execute(
        "INSERT OR IGNORE INTO scope_settings(scope_id) VALUES(?)",
        [&scope_id],
    )?;
    tx.execute(
        "UPDATE localization_scopes SET name=?,last_used_at_ms=? WHERE id=?",
        params![request.name, timestamp, scope_id],
    )?;
    tx.commit()?;
    load_scope(LoadLocalizationScopeRequest { scope_id })
}

pub fn initialize_plan(
    request: InitializeLocalizationPlanRequest,
) -> anyhow::Result<InitializeLocalizationPlanResult> {
    let plan_name = request.plan_name.trim();
    if plan_name.is_empty() {
        bail!("Localization plan name cannot be empty.")
    }
    if request.source_locale.trim().is_empty() || request.target_locale.trim().is_empty() {
        bail!("Localization plan locales cannot be empty.")
    }
    if request.source_locale == request.target_locale {
        bail!("Localization plan source and target locales must differ.")
    }
    if request.file_namespace.trim().is_empty() {
        bail!("Localization plan file namespace cannot be empty.")
    }
    let (binding_kind, binding_value) =
        normalized_binding(&request.binding_kind, &request.binding_value)?;
    let mut db = open()?;
    let tx = db.transaction()?;
    let existing: Option<String> = tx
        .query_row(
            "SELECT scope_id FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
            |row| row.get(0),
        )
        .optional()?;
    let created = existing.is_none();
    let scope_id = existing.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let timestamp = now();
    if created {
        tx.execute(
            "INSERT INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile',?,?,?,?)",
            params![scope_id, plan_name, timestamp, timestamp, timestamp],
        )?;
        tx.execute(
            "INSERT INTO scope_bindings(binding_kind,binding_value,scope_id) VALUES(?,?,?)",
            params![binding_kind, binding_value, scope_id],
        )?;
        tx.execute(
            "INSERT INTO scope_settings(scope_id,knowledge_enabled,use_official,use_global,use_project) VALUES(?,1,1,1,1)",
            [&scope_id],
        )?;
    } else {
        tx.execute(
            "UPDATE localization_scopes SET last_used_at_ms=? WHERE id=?",
            params![timestamp, scope_id],
        )?;
    }

    let mut imported_count = 0_u64;
    if request.import_existing {
        for entry in &request.entries {
            if entry.source_locale != request.source_locale
                || entry.target_locale != request.target_locale
                || entry.file_namespace != request.file_namespace
                || entry.source_text.trim().is_empty()
                || entry.target_text.trim().is_empty()
                || entry.unit_key.trim().is_empty()
            {
                bail!("Localization plan import contains an invalid translation entry.")
            }
        }
        tx.execute(
            "DELETE FROM translation_memory WHERE scope_id=? AND source_kind='automatic' AND file_namespace=?",
            params![scope_id, request.file_namespace],
        )?;
        let retained: u64 = tx.query_row(
            "SELECT COUNT(*) FROM translation_memory WHERE scope_id=?",
            [&scope_id],
            |row| row.get(0),
        )?;
        if retained + request.entries.len() as u64 > 100_000 {
            bail!("A localization scope supports at most 100000 memory entries.")
        }
        imported_count = request.entries.len() as u64;
        for entry in request.entries {
            crate::domain::localization::jobs::check(&request.job_id)?;
            tx.execute(
                "INSERT INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms) VALUES(?,?,?,?,?,?,?,'automatic',?,?,?)",
                params![uuid::Uuid::new_v4().to_string(),scope_id,entry.source_locale,entry.target_locale,entry.source_text,entry.target_text,text_hash(&entry.source_text),entry.file_namespace,entry.unit_key,now()],
            )?;
        }
    }
    if created || request.import_existing {
        bump(&tx, &scope_id)?;
    }
    let revision: u64 = tx.query_row(
        "SELECT revision FROM localization_scopes WHERE id=?",
        [&scope_id],
        |row| row.get(0),
    )?;
    tx.commit()?;
    Ok(InitializeLocalizationPlanResult {
        snapshot: load_scope(LoadLocalizationScopeRequest {
            scope_id: scope_id.clone(),
        })?,
        imported_count,
        knowledge_revision: format!("{scope_id}:{revision}"),
        semantic_index_state: "skipped".into(),
        semantic_index_error: None,
    })
}

pub fn create_profile(name: String) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    let name = name.trim().to_string();
    if name.is_empty() {
        bail!("Localization profile name cannot be empty.")
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    let scope_id = uuid::Uuid::new_v4().to_string();
    let timestamp = now();
    tx.execute("INSERT INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile',?,?,?,?)",params![scope_id,name,timestamp,timestamp,timestamp])?;
    tx.execute(
        "INSERT INTO scope_settings(scope_id) VALUES(?)",
        [&scope_id],
    )?;
    tx.commit()?;
    load_scope(LoadLocalizationScopeRequest { scope_id })
}

pub fn rename_profile(
    scope_id: String,
    name: String,
) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    let name = name.trim().to_string();
    if name.is_empty() {
        bail!("Localization profile name cannot be empty.")
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    let kind: String = tx
        .query_row(
            "SELECT kind FROM localization_scopes WHERE id=?",
            [&scope_id],
            |row| row.get(0),
        )
        .context("Localization scope does not exist.")?;
    if kind == "global" {
        bail!("Global localization scope cannot be renamed.")
    }
    tx.execute(
        "UPDATE localization_scopes SET name=? WHERE id=?",
        params![name, scope_id],
    )?;
    bump(&tx, &scope_id)?;
    tx.commit()?;
    load_scope(LoadLocalizationScopeRequest { scope_id })
}

pub fn delete_profile(scope_id: String) -> anyhow::Result<()> {
    let mut db = open()?;
    let tx = db.transaction()?;
    let kind: String = tx
        .query_row(
            "SELECT kind FROM localization_scopes WHERE id=?",
            [&scope_id],
            |row| row.get(0),
        )
        .context("Localization scope does not exist.")?;
    if kind == "global" {
        bail!("Global localization scope cannot be deleted.")
    }
    tx.execute("DELETE FROM localization_scopes WHERE id=?", [&scope_id])?;
    tx.commit()?;
    Ok(())
}

pub fn set_profile_binding(
    scope_id: String,
    binding_kind: String,
    binding_value: String,
) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    let (binding_kind, binding_value) = normalized_binding(&binding_kind, &binding_value)?;
    let mut db = open()?;
    let tx = db.transaction()?;
    let kind: String = tx
        .query_row(
            "SELECT kind FROM localization_scopes WHERE id=?",
            [&scope_id],
            |row| row.get(0),
        )
        .context("Localization scope does not exist.")?;
    if kind != "profile" {
        bail!("Global localization scope cannot be bound.")
    }
    let owner: Option<String> = tx
        .query_row(
            "SELECT scope_id FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
            |row| row.get(0),
        )
        .optional()?;
    if owner.as_deref() != Some(scope_id.as_str()) {
        tx.execute(
            "DELETE FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
        )?;
        tx.execute(
            "INSERT INTO scope_bindings(binding_kind,binding_value,scope_id) VALUES(?,?,?)",
            params![binding_kind, binding_value, scope_id],
        )?;
        bump(&tx, &scope_id)?;
        if let Some(owner) = owner {
            bump(&tx, &owner)?;
        }
    }
    tx.commit()?;
    load_scope(LoadLocalizationScopeRequest { scope_id })
}

pub fn remove_profile_binding(binding_kind: String, binding_value: String) -> anyhow::Result<()> {
    let (binding_kind, binding_value) = normalized_binding(&binding_kind, &binding_value)?;
    let mut db = open()?;
    let tx = db.transaction()?;
    let owner: Option<String> = tx
        .query_row(
            "SELECT scope_id FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(owner) = owner {
        tx.execute(
            "DELETE FROM scope_bindings WHERE binding_kind=? AND binding_value=?",
            params![binding_kind, binding_value],
        )?;
        bump(&tx, &owner)?;
    }
    tx.commit()?;
    Ok(())
}

pub fn list_scopes(
    request: ListLocalizationScopesRequest,
) -> anyhow::Result<AiLocalizationScopePage> {
    if request.limit == 0 || request.limit > 200 {
        bail!("Localization scope page size must be between 1 and 200.")
    }
    let db = open()?;
    let query = format!("%{}%", request.query.unwrap_or_default());
    let total=db.query_row("SELECT COUNT(*) FROM localization_scopes s WHERE s.name LIKE ? OR EXISTS(SELECT 1 FROM scope_bindings b WHERE b.scope_id=s.id AND b.binding_value LIKE ?)",params![query,query],|row|row.get(0))?;
    let mut statement=db.prepare("SELECT s.id,s.kind,s.name,s.revision,s.created_at_ms,s.updated_at_ms,s.last_used_at_ms FROM localization_scopes s WHERE s.name LIKE ? OR EXISTS(SELECT 1 FROM scope_bindings b WHERE b.scope_id=s.id AND b.binding_value LIKE ?) ORDER BY CASE WHEN s.kind='global' THEN 0 ELSE 1 END,s.last_used_at_ms DESC LIMIT ? OFFSET ?")?;
    let mut records = statement
        .query_map(
            params![query, query, request.limit, request.offset],
            scope_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    attach_bindings(&db, &mut records)?;
    Ok(AiLocalizationScopePage { records, total })
}

pub fn load_scope(
    request: LoadLocalizationScopeRequest,
) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    let db = open()?;
    let mut scope=db.query_row("SELECT id,kind,name,revision,created_at_ms,updated_at_ms,last_used_at_ms FROM localization_scopes WHERE id=?",[&request.scope_id],scope_row).context("Localization scope does not exist.")?;
    attach_bindings(&db, std::slice::from_mut(&mut scope))?;
    let settings=db.query_row("SELECT default_engine_kind,default_engine_profile_id,review_profile_id,knowledge_enabled,use_official,use_global,use_project,auto_review,qa_empty,qa_language_mix,qa_whitespace,qa_line_breaks,qa_length FROM scope_settings WHERE scope_id=?",[&request.scope_id],|row|Ok(LocalizationScopeSettings{scope_id:request.scope_id.clone(),default_engine_kind:row.get(0)?,default_engine_profile_id:row.get(1)?,review_profile_id:row.get(2)?,knowledge_policy:KnowledgePolicy{enabled:row.get(3)?,use_official_corpus:row.get(4)?,use_global_knowledge:row.get(5)?,use_profile_knowledge:row.get(6)?},auto_review:row.get(7)?,qa_config:AiQaConfig{check_empty:row.get(8)?,check_language_mix:row.get(9)?,check_whitespace:row.get(10)?,check_line_breaks:row.get(11)?,check_length:row.get(12)?}}))?;
    Ok(AiLocalizationScopeSnapshot { scope, settings })
}

pub fn save_scope_settings(
    request: SaveLocalizationScopeSettingsRequest,
) -> anyhow::Result<AiLocalizationScopeSnapshot> {
    let mut db = open()?;
    let tx = db.transaction()?;
    let value = &request.settings;
    tx.execute("UPDATE scope_settings SET default_engine_kind=?,default_engine_profile_id=?,review_profile_id=?,knowledge_enabled=?,use_official=?,use_global=?,use_project=?,auto_review=?,qa_empty=?,qa_language_mix=?,qa_whitespace=?,qa_line_breaks=?,qa_length=? WHERE scope_id=?",params![value.default_engine_kind,value.default_engine_profile_id,value.review_profile_id,value.knowledge_policy.enabled,value.knowledge_policy.use_official_corpus,value.knowledge_policy.use_global_knowledge,value.knowledge_policy.use_profile_knowledge,value.auto_review,value.qa_config.check_empty,value.qa_config.check_language_mix,value.qa_config.check_whitespace,value.qa_config.check_line_breaks,value.qa_config.check_length,value.scope_id])?;
    bump(&tx, &value.scope_id)?;
    tx.commit()?;
    load_scope(LoadLocalizationScopeRequest {
        scope_id: value.scope_id.clone(),
    })
}
