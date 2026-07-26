use crate::domain::ai::types::KnowledgePolicy;
use crate::domain::app_paths::ai_localization_knowledge_path;
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use rusqlite::{Connection, OptionalExtension, Transaction, params, params_from_iter};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

pub(crate) const GLOBAL_SCOPE_ID: &str = "00000000-0000-0000-0000-000000000001";
const EXAMPLE_SCOPE_ID: &str = "00000000-0000-0000-0000-000000000002";
static KNOWLEDGE_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
#[derive(Default)]
pub(crate) struct TranslationKnowledge {
    pub exact: BTreeMap<String, String>,
    pub contexts: BTreeMap<String, String>,
    pub required_terms: BTreeMap<String, Vec<(String, String)>>,
    pub trace: crate::domain::ai::types::KnowledgeTrace,
    pub revision: String,
}
fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() * 1000
}
fn normalize(value: &str) -> String {
    value.trim().to_lowercase()
}
fn text_hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn normalized_binding(kind: &str, value: &str) -> anyhow::Result<(String, String)> {
    let kind = kind.trim();
    let value = value.trim();
    if value.is_empty() {
        bail!("Localization scope binding cannot be empty.")
    }
    let normalized = match kind {
        "project-unique-id" | "installed-mod" => value.to_lowercase(),
        "draft-key" => value.to_string(),
        "canonical-path-hash" => {
            let canonical = fs::canonicalize(value)
                .with_context(|| format!("Failed to resolve localization project path {value}."))?;
            let mut path = canonical.to_string_lossy().replace('\\', "/");
            if cfg!(windows) {
                path.make_ascii_lowercase();
            }
            text_hash(&path)
        }
        _ => bail!("Unsupported localization scope binding kind."),
    };
    Ok((kind.to_string(), normalized))
}

pub(crate) fn open() -> anyhow::Result<Connection> {
    let _guard = KNOWLEDGE_OPEN_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = ai_localization_knowledge_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut connection =
        Connection::open(path).context("Failed to open localization knowledge.")?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .context("Failed to configure localization knowledge busy timeout.")?;
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS localization_scopes(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at_ms INTEGER NOT NULL,updated_at_ms INTEGER NOT NULL,last_used_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scope_bindings(binding_kind TEXT NOT NULL,binding_value TEXT NOT NULL,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,UNIQUE(binding_kind,binding_value));
CREATE TABLE IF NOT EXISTS scope_settings(scope_id TEXT PRIMARY KEY REFERENCES localization_scopes(id) ON DELETE CASCADE,default_engine_kind TEXT,default_engine_profile_id TEXT,review_profile_id TEXT,knowledge_enabled INTEGER NOT NULL DEFAULT 0,use_official INTEGER NOT NULL DEFAULT 1,use_global INTEGER NOT NULL DEFAULT 1,use_project INTEGER NOT NULL DEFAULT 1,auto_review INTEGER NOT NULL DEFAULT 0,qa_empty INTEGER NOT NULL DEFAULT 1,qa_language_mix INTEGER NOT NULL DEFAULT 1,qa_whitespace INTEGER NOT NULL DEFAULT 1,qa_line_breaks INTEGER NOT NULL DEFAULT 1,qa_length INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS glossary_entries(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,source_term TEXT NOT NULL,target_term TEXT NOT NULL,normalized_source TEXT NOT NULL,match_mode TEXT NOT NULL,do_not_translate INTEGER NOT NULL,notes TEXT NOT NULL,updated_at_ms INTEGER NOT NULL,UNIQUE(scope_id,source_locale,target_locale,normalized_source));
CREATE INDEX IF NOT EXISTS glossary_scope ON glossary_entries(scope_id,source_locale,target_locale);
CREATE TABLE IF NOT EXISTS style_guides(scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,target_locale TEXT NOT NULL,tone TEXT NOT NULL,audience TEXT NOT NULL,formality TEXT NOT NULL,forbidden_phrases TEXT NOT NULL,preferred_phrases TEXT NOT NULL,rules TEXT NOT NULL,updated_at_ms INTEGER NOT NULL,PRIMARY KEY(scope_id,target_locale));
CREATE TABLE IF NOT EXISTS translation_memory(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL REFERENCES localization_scopes(id) ON DELETE CASCADE,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,source_text TEXT NOT NULL,target_text TEXT NOT NULL,source_hash TEXT NOT NULL,source_kind TEXT NOT NULL,file_namespace TEXT,unit_key TEXT,confirmed_at_ms INTEGER NOT NULL,use_count INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS tm_auto_unique ON translation_memory(scope_id,source_locale,target_locale,file_namespace,unit_key) WHERE source_kind='automatic';
CREATE UNIQUE INDEX IF NOT EXISTS tm_manual_unique ON translation_memory(scope_id,source_locale,target_locale,source_hash) WHERE source_kind<>'automatic';
CREATE INDEX IF NOT EXISTS tm_scope ON translation_memory(scope_id,source_locale,target_locale,confirmed_at_ms);
CREATE TABLE IF NOT EXISTS review_runs(id TEXT PRIMARY KEY,scope_id TEXT NOT NULL,source_locale TEXT NOT NULL,target_locale TEXT NOT NULL,engine TEXT NOT NULL,status TEXT NOT NULL,summary_json TEXT NOT NULL,created_at_ms INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS review_issues(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,unit_key TEXT NOT NULL,source_hash TEXT NOT NULL,target_hash TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,suggestion TEXT,source_snapshot TEXT NOT NULL,target_snapshot TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS knowledge_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);")?;
    for migration in [
        "ALTER TABLE scope_settings ADD COLUMN qa_empty INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_language_mix INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_whitespace INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_line_breaks INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE scope_settings ADD COLUMN qa_length INTEGER NOT NULL DEFAULT 1",
    ] {
        if let Err(error) = connection.execute(migration, []) {
            if !error.to_string().contains("duplicate column name") {
                return Err(error.into());
            }
        }
    }
    let timestamp = now();
    connection.execute(
        "UPDATE localization_scopes SET kind='profile' WHERE kind='project'",
        [],
    )?;
    connection.execute("INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'global','Global knowledge',?,?,?)",params![GLOBAL_SCOPE_ID,timestamp,timestamp,timestamp])?;
    connection.execute(
        "INSERT OR IGNORE INTO scope_settings(scope_id) VALUES(?)",
        [GLOBAL_SCOPE_ID],
    )?;
    let schema_version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if schema_version < 1 {
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile','示例项目',?,?,?)",
            params![EXAMPLE_SCOPE_ID, timestamp, timestamp, timestamp],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO scope_settings(scope_id,knowledge_enabled,use_official,use_global,use_project) VALUES(?,1,1,1,1)",
            [EXAMPLE_SCOPE_ID],
        )?;
        tx.execute_batch("PRAGMA user_version=1;")?;
        tx.commit()?;
    }
    let example_seeded: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM knowledge_metadata WHERE key='example-project-v2')",
        [],
        |row| row.get(0),
    )?;
    if !example_seeded {
        let tx = connection.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO localization_scopes(id,kind,name,created_at_ms,updated_at_ms,last_used_at_ms) VALUES(?,'profile','示例项目',?,?,?)",
            params![EXAMPLE_SCOPE_ID, timestamp, timestamp, timestamp],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO scope_settings(scope_id) VALUES(?)",
            [EXAMPLE_SCOPE_ID],
        )?;
        {
            tx.execute(
                "UPDATE localization_scopes SET revision=revision+1,updated_at_ms=? WHERE id=?",
                params![timestamp, EXAMPLE_SCOPE_ID],
            )?;
            tx.execute(
                "UPDATE scope_settings SET knowledge_enabled=1,use_official=1,use_global=1,use_project=1,auto_review=1,qa_empty=1,qa_language_mix=1,qa_whitespace=1,qa_line_breaks=1,qa_length=1 WHERE scope_id=?",
                [EXAMPLE_SCOPE_ID],
            )?;
            tx.execute(
                "INSERT OR IGNORE INTO scope_bindings(binding_kind,binding_value,scope_id) VALUES('project-unique-id','modforge.example.localization',?)",
                [EXAMPLE_SCOPE_ID],
            )?;
            for (id, source, target, mode, do_not_translate, notes) in [
                (
                    "example-glossary-1",
                    "Pelican Town",
                    "鹈鹕镇",
                    "exact",
                    false,
                    "示例地名术语",
                ),
                (
                    "example-glossary-2",
                    "Stardew Valley",
                    "星露谷物语",
                    "case-insensitive",
                    true,
                    "品牌名保持统一",
                ),
            ] {
                tx.execute(
                    "INSERT OR IGNORE INTO glossary_entries(id,scope_id,source_locale,target_locale,source_term,target_term,normalized_source,match_mode,do_not_translate,notes,updated_at_ms) VALUES(?,?,'en-US','zh-CN',?,?,?,?,?,?,?)",
                    params![id,EXAMPLE_SCOPE_ID,source,target,normalize(source),mode,do_not_translate,notes,timestamp],
                )?;
            }
            for (id, source, target, namespace, key, use_count) in [
                (
                    "example-memory-1",
                    "Welcome to Pelican Town!",
                    "欢迎来到鹈鹕镇！",
                    "i18n/zh-CN.json",
                    "welcome.town",
                    3,
                ),
                (
                    "example-memory-2",
                    "The valley looks beautiful today.",
                    "今天的山谷真美。",
                    "i18n/zh-CN.json",
                    "dialogue.valley",
                    1,
                ),
            ] {
                tx.execute(
                    "INSERT OR IGNORE INTO translation_memory(id,scope_id,source_locale,target_locale,source_text,target_text,source_hash,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count) VALUES(?,?,'en-US','zh-CN',?,?,?,'manual',?,?,?,?)",
                    params![id,EXAMPLE_SCOPE_ID,source,target,text_hash(source),namespace,key,timestamp,use_count],
                )?;
            }
            tx.execute(
                "INSERT OR IGNORE INTO style_guides(scope_id,target_locale,tone,audience,formality,forbidden_phrases,preferred_phrases,rules,updated_at_ms) VALUES(?,'zh-CN','自然、温暖、简洁','星露谷物语玩家','半正式',?,?,?,?)",
                params![EXAMPLE_SCOPE_ID,serde_json::to_string(&vec!["机翻腔", "过度书面化"] )?,serde_json::to_string(&vec!["自然口语", "角色语气一致"] )?,serde_json::to_string(&vec!["保留所有占位符和控制标记", "地名与人物名优先使用官方译名", "对话避免逐字直译"] )?,timestamp],
            )?;
        }
        tx.execute(
            "INSERT INTO knowledge_metadata(key,value) VALUES('example-project-v2',?)",
            [timestamp.to_string()],
        )?;
        tx.execute_batch("PRAGMA user_version=2;")?;
        tx.commit()?;
    }
    Ok(connection)
}

fn bump(tx: &Transaction<'_>, scope_id: &str) -> anyhow::Result<()> {
    if tx.execute(
        "UPDATE localization_scopes SET revision=revision+1,updated_at_ms=? WHERE id=?",
        params![now(), scope_id],
    )? != 1
    {
        bail!("Localization scope does not exist.")
    }
    Ok(())
}
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

fn glossary_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiGlossaryEntry> {
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

fn lexical_memory_suggestions(
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
pub(crate) fn bump_import(tx: &Transaction<'_>, scope_id: &str) -> anyhow::Result<()> {
    bump(tx, scope_id)
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
