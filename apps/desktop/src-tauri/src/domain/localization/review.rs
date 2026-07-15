use super::jobs;
use super::knowledge;
use super::official;
use super::types::*;
use anyhow::{Context, bail};
use regex::Regex;
use rusqlite::{OptionalExtension, params};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::OnceLock;

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp_nanos() as i64 / 1_000_000
}
pub(crate) fn text_hash(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
fn tokens(value: &str) -> Vec<String> {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(||Regex::new(r"(?x)(\{\{[^{}\r\n]+\}\}|\{[A-Za-z0-9_.:-]+\}|%(?:\d+\$)?[sdif]|\[[A-Za-z/][^\]\r\n]*\]|<[^>\r\n]+>|\^[A-Za-z0-9]+|\\[nrt])").unwrap()).find_iter(value).map(|item|item.as_str().to_string()).collect()
}

pub(crate) fn translation_validation_issues(
    items: &[(String, String, String)],
    required_terms: &BTreeMap<String, Vec<(String, String)>>,
    official_terms: &BTreeMap<String, Vec<(String, String)>>,
) -> Vec<LocalizationValidationIssue> {
    let mut issues = Vec::new();
    for (item_id, source, target) in items {
        if tokens(source) != tokens(target) {
            issues.push(LocalizationValidationIssue {
                item_id: item_id.clone(),
                category: "marker-mismatch".into(),
                source_term: None,
                expected_term: None,
            });
        }
        for (source_term, expected_term) in required_terms.get(item_id).into_iter().flatten() {
            if !target.contains(expected_term) {
                issues.push(LocalizationValidationIssue {
                    item_id: item_id.clone(),
                    category: "user-terminology".into(),
                    source_term: Some(source_term.clone()),
                    expected_term: Some(expected_term.clone()),
                });
            }
        }
        if let Some(terms) = official_terms.get(item_id) {
            for (source_term, expected_term) in terms {
                let overridden = required_terms.get(item_id).is_some_and(|values| {
                    values
                        .iter()
                        .any(|(required_source, _)| required_source == source_term)
                });
                if !overridden && !target.contains(expected_term) {
                    issues.push(LocalizationValidationIssue {
                        item_id: item_id.clone(),
                        category: "official-terminology".into(),
                        source_term: Some(source_term.clone()),
                        expected_term: Some(expected_term.clone()),
                    });
                }
            }
        }
    }
    issues
}
fn issue(
    run_id: &str,
    item: &AiReviewItem,
    severity: &str,
    category: &str,
    reason: &str,
    suggestion: Option<String>,
) -> AiReviewIssue {
    AiReviewIssue {
        id: uuid::Uuid::new_v4().to_string(),
        run_id: run_id.into(),
        unit_key: item.unit_key.clone(),
        source_hash: text_hash(&item.source_text),
        target_hash: text_hash(&item.target_text),
        severity: severity.into(),
        status: "open".into(),
        category: category.into(),
        reason: reason.into(),
        suggestion,
        source_snapshot: item.source_text.clone(),
        target_snapshot: item.target_text.clone(),
    }
}

fn expected_script(locale: &str) -> Option<&'static str> {
    let locale = locale.to_ascii_lowercase();
    if locale.starts_with("zh") || locale.starts_with("ja") {
        Some("cjk")
    } else if locale.starts_with("ko") {
        Some("hangul")
    } else if locale.starts_with("ru") {
        Some("cyrillic")
    } else {
        None
    }
}
fn has_script(value: &str, script: &str) -> bool {
    value.chars().any(|character| match script {
        "cjk" => matches!(character,'\u{3400}'..='\u{9fff}'|'\u{3040}'..='\u{30ff}'),
        "hangul" => matches!(character, '\u{ac00}'..='\u{d7af}'),
        "cyrillic" => matches!(character, '\u{0400}'..='\u{04ff}'),
        _ => false,
    })
}

pub fn local_issues(request: &AiReviewRequest, run_id: &str) -> anyhow::Result<Vec<AiReviewIssue>> {
    if request.items.len() > 10_000 {
        bail!("A review run supports at most 10,000 items.")
    }
    let mut result = Vec::new();
    let config = knowledge::load_scope(LoadLocalizationScopeRequest {
        scope_id: request.scope_id.clone(),
    })?
    .settings
    .qa_config;
    let db = knowledge::open()?;
    let mut glossary = BTreeMap::<String, (String, String, String, bool)>::new();
    for scope in [knowledge::GLOBAL_SCOPE_ID, request.scope_id.as_str()] {
        let mut statement=db.prepare("SELECT source_term,target_term,match_mode,do_not_translate FROM glossary_entries WHERE scope_id=? AND source_locale=? AND target_locale=?")?;
        for row in statement.query_map(
            params![scope, request.source_locale, request.target_locale],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )? {
            let value = row?;
            glossary.insert(value.0.trim().to_lowercase(), value);
        }
    }
    for item in &request.items {
        jobs::check(&request.job_id)?;
        if config.check_empty && item.target_text.trim().is_empty() {
            result.push(issue(
                run_id,
                item,
                "critical",
                "empty-translation",
                "local.empty",
                None,
            ));
            continue;
        }
        if tokens(&item.source_text) != tokens(&item.target_text) {
            result.push(issue(
                run_id,
                item,
                "critical",
                "marker-mismatch",
                "local.markers",
                None,
            ))
        }
        if config.check_whitespace && item.target_text.trim() != item.target_text {
            result.push(issue(
                run_id,
                item,
                "minor",
                "illegal-whitespace",
                "local.whitespace",
                Some(item.target_text.trim().to_string()),
            ))
        }
        if config.check_whitespace && item.target_text.contains("  ") {
            result.push(issue(
                run_id,
                item,
                "minor",
                "illegal-whitespace",
                "local.whitespace",
                Some(
                    item.target_text
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" "),
                ),
            ))
        }
        if config.check_line_breaks
            && item.source_text.contains('\n') != item.target_text.contains('\n')
        {
            result.push(issue(
                run_id,
                item,
                "major",
                "line-break-mismatch",
                "local.line-breaks",
                None,
            ))
        }
        let source_len = item.source_text.chars().count();
        let target_len = item.target_text.chars().count();
        if config.check_length && source_len >= 8 && target_len > source_len.saturating_mul(4) {
            result.push(issue(run_id, item, "major", "length", "local.length", None))
        }
        if config.check_language_mix
            && let Some(script) = expected_script(&request.target_locale)
        {
            if target_len >= 4 && !has_script(&item.target_text, script) {
                result.push(issue(
                    run_id,
                    item,
                    "major",
                    "language-mix",
                    "local.language",
                    None,
                ))
            }
        }
        for (normalized, (source_term, target_term, match_mode, do_not_translate)) in &glossary {
            let matched = if match_mode == "case-insensitive" {
                item.source_text.to_lowercase().contains(normalized)
            } else {
                item.source_text.contains(source_term)
            };
            let expected = if *do_not_translate {
                source_term
            } else {
                target_term
            };
            if matched && !item.target_text.contains(expected) {
                result.push(issue(
                    run_id,
                    item,
                    "major",
                    "terminology",
                    "local.user-term",
                    None,
                ));
            }
        }
        if let Ok(examples) = official::find_terms_in_text(
            &request.source_locale,
            &request.target_locale,
            &item.source_text,
        ) {
            for term in examples {
                if glossary.contains_key(&term.source_text.trim().to_lowercase()) {
                    continue;
                }
                if item.source_text.contains(&term.source_text)
                    && !item.target_text.contains(&term.target_text)
                {
                    result.push(issue(
                        run_id,
                        item,
                        "minor",
                        "terminology",
                        "local.official-term",
                        None,
                    ));
                }
            }
        }
    }
    Ok(result)
}

fn summarize(issues: &[AiReviewIssue], checked: u64) -> AiReviewSummary {
    let mut value = AiReviewSummary {
        checked,
        passed: checked.saturating_sub(
            issues
                .iter()
                .map(|issue| issue.unit_key.as_str())
                .collect::<std::collections::BTreeSet<_>>()
                .len() as u64,
        ),
        total: issues.len() as u64,
        ..Default::default()
    };
    for issue in issues {
        match issue.severity.as_str() {
            "minor" => {
                value.minor += 1;
                value.warnings += 1
            }
            "major" => {
                value.major += 1;
                value.warnings += 1
            }
            "critical" => value.critical += 1,
            _ => {}
        }
        match issue.status.as_str() {
            "open" => value.open += 1,
            "ignored" => value.ignored += 1,
            "accepted" => value.accepted += 1,
            "stale" => value.stale += 1,
            _ => {}
        }
    }
    value
}

pub fn persist(
    request: &AiReviewRequest,
    issues: Vec<AiReviewIssue>,
    status: &str,
    usage_record_state: &str,
) -> anyhow::Result<AiReviewResult> {
    let mut db = knowledge::open()?;
    let tx = db.transaction()?;
    let created = now();
    let summary = summarize(&issues, request.items.len() as u64);
    let run = AiReviewRun {
        id: issues
            .first()
            .map(|issue| issue.run_id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        scope_id: request.scope_id.clone(),
        source_locale: request.source_locale.clone(),
        target_locale: request.target_locale.clone(),
        engine: request.engine.clone(),
        status: status.into(),
        summary: summary.clone(),
        created_at_ms: created,
    };
    tx.execute("INSERT INTO review_runs(id,scope_id,source_locale,target_locale,engine,status,summary_json,created_at_ms) VALUES(?,?,?,?,?,?,?,?)",params![run.id,run.scope_id,run.source_locale,run.target_locale,run.engine,run.status,serde_json::to_string(&summary)?,created])?;
    for issue in &issues {
        tx.execute("INSERT INTO review_issues(id,run_id,unit_key,source_hash,target_hash,severity,status,category,reason,suggestion,source_snapshot,target_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",params![issue.id,issue.run_id,issue.unit_key,issue.source_hash,issue.target_hash,issue.severity,issue.status,issue.category,issue.reason,issue.suggestion,issue.source_snapshot,issue.target_snapshot])?;
    }
    tx.execute("DELETE FROM review_runs WHERE scope_id=? AND id NOT IN (SELECT id FROM review_runs WHERE scope_id=? ORDER BY created_at_ms DESC LIMIT 50)",params![request.scope_id,request.scope_id])?;
    tx.commit()?;
    Ok(AiReviewResult {
        run,
        issues,
        usage_record_state: usage_record_state.into(),
    })
}

fn run_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiReviewRun> {
    let raw: String = row.get(6)?;
    Ok(AiReviewRun {
        id: row.get(0)?,
        scope_id: row.get(1)?,
        source_locale: row.get(2)?,
        target_locale: row.get(3)?,
        engine: row.get(4)?,
        status: row.get(5)?,
        summary: serde_json::from_str(&raw).unwrap_or_default(),
        created_at_ms: row.get(7)?,
    })
}
fn issue_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiReviewIssue> {
    Ok(AiReviewIssue {
        id: row.get(0)?,
        run_id: row.get(1)?,
        unit_key: row.get(2)?,
        source_hash: row.get(3)?,
        target_hash: row.get(4)?,
        severity: row.get(5)?,
        status: row.get(6)?,
        category: row.get(7)?,
        reason: row.get(8)?,
        suggestion: row.get(9)?,
        source_snapshot: row.get(10)?,
        target_snapshot: row.get(11)?,
    })
}
pub fn list_runs(request: ListReviewRunsRequest) -> anyhow::Result<AiReviewRunPage> {
    let db = knowledge::open()?;
    let total = db.query_row(
        "SELECT COUNT(*) FROM review_runs WHERE scope_id=?",
        [&request.scope_id],
        |row| row.get(0),
    )?;
    let mut statement=db.prepare("SELECT id,scope_id,source_locale,target_locale,engine,status,summary_json,created_at_ms FROM review_runs WHERE scope_id=? ORDER BY created_at_ms DESC LIMIT ? OFFSET ?")?;
    let records = statement
        .query_map(
            params![request.scope_id, request.limit.min(100), request.offset],
            run_row,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AiReviewRunPage { records, total })
}
pub fn load_run(request: LoadReviewRunRequest) -> anyhow::Result<AiReviewResult> {
    let db = knowledge::open()?;
    let run=db.query_row("SELECT id,scope_id,source_locale,target_locale,engine,status,summary_json,created_at_ms FROM review_runs WHERE id=?",[&request.run_id],run_row).optional()?.context("Review run does not exist.")?;
    let mut statement=db.prepare("SELECT id,run_id,unit_key,source_hash,target_hash,severity,status,category,reason,suggestion,source_snapshot,target_snapshot FROM review_issues WHERE run_id=? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END,id")?;
    let issues = statement
        .query_map([&request.run_id], issue_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AiReviewResult {
        run,
        issues,
        usage_record_state: "unavailable".into(),
    })
}

pub fn update_issues(request: UpdateReviewIssuesRequest) -> anyhow::Result<AiReviewResult> {
    let mut db = knowledge::open()?;
    let tx = db.transaction()?;
    for update in request.issues {
        if !matches!(update.status.as_str(), "open" | "ignored" | "accepted") {
            bail!("Unsupported review issue status.")
        }
        let stored=tx.query_row("SELECT source_hash,target_hash,source_snapshot,suggestion FROM review_issues WHERE id=? AND run_id=?",params![update.id,request.run_id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,String>(2)?,row.get::<_,Option<String>>(3)?))).optional()?.context("Review issue does not exist.")?;
        let status = if update.status == "accepted"
            && (stored.0 != text_hash(&update.current_source_text)
                || stored.1 != text_hash(&update.current_target_text))
        {
            "stale"
        } else {
            if update.status == "accepted" {
                let suggestion = stored
                    .3
                    .as_deref()
                    .context("Review issue has no suggested revision.")?;
                if tokens(&stored.2) != tokens(suggestion) {
                    bail!("Suggested revision changes protected markers.")
                }
            }
            &update.status
        };
        tx.execute(
            "UPDATE review_issues SET status=? WHERE id=? AND run_id=?",
            params![status, update.id, request.run_id],
        )?;
    }
    let mut statement=tx.prepare("SELECT id,run_id,unit_key,source_hash,target_hash,severity,status,category,reason,suggestion,source_snapshot,target_snapshot FROM review_issues WHERE run_id=?")?;
    let issues = statement
        .query_map([&request.run_id], issue_row)?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);
    let checked = tx
        .query_row(
            "SELECT summary_json FROM review_runs WHERE id=?",
            [&request.run_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| serde_json::from_str::<AiReviewSummary>(&value).ok())
        .map(|value| value.checked)
        .unwrap_or(0);
    let summary = summarize(&issues, checked);
    tx.execute(
        "UPDATE review_runs SET summary_json=? WHERE id=?",
        params![serde_json::to_string(&summary)?, request.run_id],
    )?;
    tx.commit()?;
    load_run(LoadReviewRunRequest {
        run_id: request.run_id,
    })
}

#[cfg(test)]
pub fn run_local(request: AiReviewRequest) -> anyhow::Result<AiReviewResult> {
    let run_id = uuid::Uuid::new_v4().to_string();
    let issues = local_issues(&request, &run_id)?;
    let result = persist(&request, issues, "completed", "unavailable");
    jobs::clear(&request.job_id);
    result
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_review_tests.rs"]
mod tests;
