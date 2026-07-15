use super::types::*;
use crate::domain::app_paths::ai_usage_ledger_path;
use anyhow::{Context, bail};
use rusqlite::{Connection, params, params_from_iter};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::{OnceLock, mpsc};
use std::time::{Duration, Instant};

enum WriterMessage {
    Record(AiUsageEvent, mpsc::Sender<anyhow::Result<()>>),
    Barrier(mpsc::Sender<anyhow::Result<()>>),
}
static WRITER: OnceLock<mpsc::SyncSender<WriterMessage>> = OnceLock::new();

fn open() -> anyhow::Result<Connection> {
    let path = ai_usage_ledger_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("Failed to create the AI usage directory.")?;
    }
    let connection = Connection::open(path).context("Failed to open the AI usage ledger.")?;
    connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS usage_events(
        id INTEGER PRIMARY KEY, occurred_at_ms INTEGER NOT NULL, job_id TEXT NOT NULL, attempt INTEGER NOT NULL,
        page_source TEXT NOT NULL, operation TEXT NOT NULL, engine_kind TEXT NOT NULL, profile_id TEXT,
        provider TEXT NOT NULL, model TEXT, scope_id TEXT, succeeded INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
        failure_category TEXT, request_items INTEGER NOT NULL, request_characters INTEGER NOT NULL,
        response_characters INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cached_tokens INTEGER,
        reasoning_tokens INTEGER, billed_characters INTEGER, usage_source TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_events_time ON usage_events(occurred_at_ms);
      CREATE INDEX IF NOT EXISTS usage_events_profile ON usage_events(profile_id, occurred_at_ms);
      CREATE INDEX IF NOT EXISTS usage_events_model ON usage_events(model, occurred_at_ms);
      CREATE INDEX IF NOT EXISTS usage_events_operation ON usage_events(operation, occurred_at_ms);
      CREATE INDEX IF NOT EXISTS usage_events_scope ON usage_events(scope_id, occurred_at_ms);")
        .context("Failed to initialize the AI usage ledger.")?;
    let schema_version: u32 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let has_daily = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='usage_daily')",
        [],
        |row| row.get::<_, bool>(0),
    )?;
    if schema_version < 2 && has_daily {
        connection.execute_batch(
            "ALTER TABLE usage_daily RENAME TO usage_daily_v1;
             CREATE TABLE usage_daily(
               date TEXT NOT NULL, engine_kind TEXT NOT NULL, profile_id TEXT NOT NULL DEFAULT '',
               model TEXT NOT NULL DEFAULT '', operation TEXT NOT NULL, scope_id TEXT NOT NULL DEFAULT '',
               input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cached_tokens INTEGER NOT NULL,
               reasoning_tokens INTEGER NOT NULL, billed_characters INTEGER NOT NULL,
               request_characters INTEGER NOT NULL, response_characters INTEGER NOT NULL, requests INTEGER NOT NULL,
               failures INTEGER NOT NULL, unavailable_usage_requests INTEGER NOT NULL,
               PRIMARY KEY(date, engine_kind, profile_id, model, operation, scope_id));
             INSERT INTO usage_daily(date,engine_kind,profile_id,model,operation,scope_id,input_tokens,output_tokens,cached_tokens,reasoning_tokens,billed_characters,request_characters,response_characters,requests,failures,unavailable_usage_requests)
               SELECT date,engine_kind,profile_id,'',operation,scope_id,input_tokens,output_tokens,cached_tokens,reasoning_tokens,billed_characters,request_characters,response_characters,requests,failures,unavailable_usage_requests FROM usage_daily_v1;
             DROP TABLE usage_daily_v1;",
        )?;
    }
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_daily(
           date TEXT NOT NULL, engine_kind TEXT NOT NULL, profile_id TEXT NOT NULL DEFAULT '',
           model TEXT NOT NULL DEFAULT '', operation TEXT NOT NULL, scope_id TEXT NOT NULL DEFAULT '',
           input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cached_tokens INTEGER NOT NULL,
           reasoning_tokens INTEGER NOT NULL, billed_characters INTEGER NOT NULL,
           request_characters INTEGER NOT NULL, response_characters INTEGER NOT NULL, requests INTEGER NOT NULL,
           failures INTEGER NOT NULL, unavailable_usage_requests INTEGER NOT NULL,
           PRIMARY KEY(date, engine_kind, profile_id, model, operation, scope_id));
         PRAGMA user_version=2;",
    )?;
    Ok(connection)
}

fn insert(connection: &Connection, event: &AiUsageEvent) -> anyhow::Result<()> {
    connection
        .execute(
            "INSERT INTO usage_events(occurred_at_ms,job_id,attempt,page_source,operation,engine_kind,profile_id,provider,model,scope_id,succeeded,latency_ms,failure_category,request_items,request_characters,response_characters,input_tokens,output_tokens,cached_tokens,reasoning_tokens,billed_characters,usage_source)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
            params![
                event.occurred_at_ms,
                event.job_id,
                event.attempt,
                event.page_source,
                event.operation,
                event.engine_kind,
                event.profile_id,
                event.provider,
                event.model,
                event.scope_id,
                event.succeeded,
                event.latency_ms,
                event.failure_category,
                event.request_items,
                event.request_characters,
                event.response_characters,
                event.input_tokens,
                event.output_tokens,
                event.cached_tokens,
                event.reasoning_tokens,
                event.billed_characters,
                event.usage_source
            ],
        )
        .context("Failed to record AI usage.")?;
    Ok(())
}

fn retention_cutoff_ms() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp() * 1000 - 90 * 24 * 60 * 60 * 1000
}

fn compact_expired(connection: &mut Connection) -> anyhow::Result<u64> {
    let cutoff = retention_cutoff_ms();
    let tx = connection.transaction()?;
    tx.execute("INSERT INTO usage_daily SELECT date(occurred_at_ms/1000,'unixepoch'),engine_kind,COALESCE(profile_id,''),COALESCE(model,''),operation,COALESCE(scope_id,''),COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(cached_tokens),0),COALESCE(SUM(reasoning_tokens),0),COALESCE(SUM(billed_characters),0),SUM(request_characters),SUM(response_characters),COUNT(*),SUM(NOT succeeded),SUM(usage_source='unavailable') FROM usage_events WHERE occurred_at_ms < ? GROUP BY 1,2,3,4,5,6 ON CONFLICT(date,engine_kind,profile_id,model,operation,scope_id) DO UPDATE SET input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens,cached_tokens=cached_tokens+excluded.cached_tokens,reasoning_tokens=reasoning_tokens+excluded.reasoning_tokens,billed_characters=billed_characters+excluded.billed_characters,request_characters=request_characters+excluded.request_characters,response_characters=response_characters+excluded.response_characters,requests=requests+excluded.requests,failures=failures+excluded.failures,unavailable_usage_requests=unavailable_usage_requests+excluded.unavailable_usage_requests",[cutoff])?;
    let removed = tx.execute(
        "DELETE FROM usage_events WHERE occurred_at_ms < ?",
        [cutoff],
    )?;
    tx.commit()?;
    Ok(removed as u64)
}

fn writer() -> &'static mpsc::SyncSender<WriterMessage> {
    WRITER.get_or_init(|| {
        let (sender, receiver) = mpsc::sync_channel(128);
        std::thread::Builder::new()
            .name("ai-usage-ledger".into())
            .spawn(move || {
                let mut connection = open();
                if let Ok(db) = connection.as_mut()
                    && let Err(error) = compact_expired(db)
                {
                    log::warn!("Failed to apply AI usage retention at writer startup: {error:#}");
                }
                let mut last_retention = Instant::now();
                while let Ok(message) = receiver.recv() {
                    match message {
                        WriterMessage::Record(event, ack) => {
                            if last_retention.elapsed() >= Duration::from_secs(24 * 60 * 60) {
                                if let Ok(db) = connection.as_mut()
                                    && let Err(error) = compact_expired(db)
                                {
                                    log::warn!(
                                        "Failed to apply scheduled AI usage retention: {error:#}"
                                    );
                                }
                                last_retention = Instant::now();
                            }
                            let result = connection
                                .as_ref()
                                .map_err(|e| anyhow::anyhow!("{e:#}"))
                                .and_then(|db| insert(db, &event));
                            let _ = ack.send(result);
                        }
                        WriterMessage::Barrier(ack) => {
                            let result = connection
                                .as_ref()
                                .map(|_| ())
                                .map_err(|e| anyhow::anyhow!("{e:#}"));
                            let _ = ack.send(result);
                        }
                    }
                    if connection.is_err() {
                        connection = open();
                    }
                }
            })
            .expect("AI usage ledger writer must start");
        sender
    })
}

pub fn record_usage(event: AiUsageEvent) -> anyhow::Result<()> {
    let (ack_tx, ack_rx) = mpsc::channel();
    writer()
        .send(WriterMessage::Record(event, ack_tx))
        .context("AI usage writer is unavailable.")?;
    ack_rx
        .recv()
        .context("AI usage writer stopped unexpectedly.")?
}

fn barrier() -> anyhow::Result<()> {
    let (ack_tx, ack_rx) = mpsc::channel();
    writer()
        .send(WriterMessage::Barrier(ack_tx))
        .context("AI usage writer is unavailable.")?;
    ack_rx
        .recv()
        .context("AI usage writer stopped unexpectedly.")?
}

fn filters(query: &AiUsageQuery) -> (String, Vec<rusqlite::types::Value>) {
    let mut sql = String::from("occurred_at_ms >= ? AND occurred_at_ms < ?");
    let mut values = vec![query.from_ms.into(), query.to_ms.into()];
    for (column, value) in [
        ("profile_id", &query.profile_id),
        ("model", &query.model),
        ("operation", &query.operation),
        ("engine_kind", &query.engine_kind),
        ("scope_id", &query.scope_id),
    ] {
        if let Some(value) = value {
            sql.push_str(&format!(" AND {column} = ?"));
            values.push(value.clone().into());
        }
    }
    if let Some(value) = query.succeeded {
        sql.push_str(" AND succeeded = ?");
        values.push(value.into());
    }
    (sql, values)
}

fn validate_query(query: &AiUsageQuery) -> anyhow::Result<()> {
    if query.from_ms >= query.to_ms {
        bail!("AI usage range must have an end after its start.");
    }
    if query.limit == 0 || query.limit > 500 {
        bail!("AI usage page size must be between 1 and 500.");
    }
    Ok(())
}

pub fn query_records(query: AiUsageQuery) -> anyhow::Result<AiUsageRecordPage> {
    validate_query(&query)?;
    barrier()?;
    let db = open()?;
    let (where_sql, values) = filters(&query);
    let total = db.query_row(
        &format!("SELECT COUNT(*) FROM usage_events WHERE {where_sql}"),
        params_from_iter(values.clone()),
        |row| row.get(0),
    )?;
    let mut page_values = values;
    page_values.push((query.limit as i64).into());
    page_values.push((query.offset as i64).into());
    let mut statement = db.prepare(&format!("SELECT occurred_at_ms,job_id,attempt,page_source,operation,engine_kind,profile_id,provider,model,scope_id,succeeded,latency_ms,failure_category,request_items,request_characters,response_characters,input_tokens,output_tokens,cached_tokens,reasoning_tokens,billed_characters,usage_source FROM usage_events WHERE {where_sql} ORDER BY occurred_at_ms DESC,id DESC LIMIT ? OFFSET ?"))?;
    let records = statement
        .query_map(params_from_iter(page_values), |r| {
            Ok(AiUsageEvent {
                occurred_at_ms: r.get(0)?,
                job_id: r.get(1)?,
                attempt: r.get(2)?,
                page_source: r.get(3)?,
                operation: r.get(4)?,
                engine_kind: r.get(5)?,
                profile_id: r.get(6)?,
                provider: r.get(7)?,
                model: r.get(8)?,
                scope_id: r.get(9)?,
                succeeded: r.get(10)?,
                latency_ms: r.get(11)?,
                failure_category: r.get(12)?,
                request_items: r.get(13)?,
                request_characters: r.get(14)?,
                response_characters: r.get(15)?,
                input_tokens: r.get(16)?,
                output_tokens: r.get(17)?,
                cached_tokens: r.get(18)?,
                reasoning_tokens: r.get(19)?,
                billed_characters: r.get(20)?,
                usage_source: r.get(21)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AiUsageRecordPage { records, total })
}

pub fn query_summary(query: AiUsageQuery) -> anyhow::Result<AiUsageSummary> {
    validate_query(&query)?;
    barrier()?;
    let db = open()?;
    let (where_sql, values) = filters(&query);
    let mut totals=db.query_row(&format!("SELECT COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(cached_tokens),0),COALESCE(SUM(reasoning_tokens),0),COALESCE(SUM(billed_characters),0),COALESCE(SUM(request_characters),0),COALESCE(SUM(response_characters),0),COUNT(*),COALESCE(SUM(NOT succeeded),0),COALESCE(SUM(usage_source='unavailable'),0) FROM usage_events WHERE {where_sql}"),params_from_iter(values.clone()),totals_from_row)?;
    let mut statement=db.prepare(&format!("SELECT date(occurred_at_ms/1000,'unixepoch'),engine_kind,profile_id,operation,scope_id,COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(cached_tokens),0),COALESCE(SUM(reasoning_tokens),0),COALESCE(SUM(billed_characters),0),COALESCE(SUM(request_characters),0),COALESCE(SUM(response_characters),0),COUNT(*),COALESCE(SUM(NOT succeeded),0),COALESCE(SUM(usage_source='unavailable'),0) FROM usage_events WHERE {where_sql} GROUP BY 1,2,3,4,5 ORDER BY 1 DESC"))?;
    let event_daily = statement
        .query_map(params_from_iter(values), |r| {
            Ok(AiUsageDailySummary {
                date: r.get(0)?,
                engine_kind: r.get(1)?,
                profile_id: r.get(2)?,
                operation: r.get(3)?,
                scope_id: r.get(4)?,
                totals: totals_from_row_offset(r, 5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut merged = BTreeMap::new();
    for row in event_daily {
        merged.insert(daily_key(&row), row);
    }
    if query.succeeded.is_none() {
        let (daily_where, daily_values) = daily_filters(&query);
        let mut statement = db.prepare(&format!("SELECT date,engine_kind,NULLIF(profile_id,''),operation,NULLIF(scope_id,''),SUM(input_tokens),SUM(output_tokens),SUM(cached_tokens),SUM(reasoning_tokens),SUM(billed_characters),SUM(request_characters),SUM(response_characters),SUM(requests),SUM(failures),SUM(unavailable_usage_requests) FROM usage_daily WHERE {daily_where} GROUP BY date,engine_kind,profile_id,operation,scope_id"))?;
        let archived = statement
            .query_map(params_from_iter(daily_values), |r| {
                Ok(AiUsageDailySummary {
                    date: r.get(0)?,
                    engine_kind: r.get(1)?,
                    profile_id: r.get(2)?,
                    operation: r.get(3)?,
                    scope_id: r.get(4)?,
                    totals: totals_from_row_offset(r, 5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        for row in archived {
            add_totals(&mut totals, &row.totals);
            let key = daily_key(&row);
            if let Some(existing) = merged.get_mut(&key) {
                add_totals(&mut existing.totals, &row.totals);
            } else {
                merged.insert(key, row);
            }
        }
    }
    let mut daily = merged.into_values().collect::<Vec<_>>();
    daily.sort_by(|left, right| right.date.cmp(&left.date));
    Ok(AiUsageSummary { totals, daily })
}

fn daily_filters(query: &AiUsageQuery) -> (String, Vec<rusqlite::types::Value>) {
    let mut sql =
        String::from("date >= date(?/1000,'unixepoch') AND date < date(?/1000,'unixepoch')");
    let mut values = vec![query.from_ms.into(), query.to_ms.into()];
    for (column, value) in [
        ("profile_id", &query.profile_id),
        ("model", &query.model),
        ("operation", &query.operation),
        ("engine_kind", &query.engine_kind),
        ("scope_id", &query.scope_id),
    ] {
        if let Some(value) = value {
            sql.push_str(&format!(" AND {column} = ?"));
            values.push(value.clone().into());
        }
    }
    (sql, values)
}

fn daily_key(
    row: &AiUsageDailySummary,
) -> (String, String, Option<String>, String, Option<String>) {
    (
        row.date.clone(),
        row.engine_kind.clone(),
        row.profile_id.clone(),
        row.operation.clone(),
        row.scope_id.clone(),
    )
}

fn add_totals(target: &mut AiUsageTotals, value: &AiUsageTotals) {
    target.input_tokens += value.input_tokens;
    target.output_tokens += value.output_tokens;
    target.cached_tokens += value.cached_tokens;
    target.reasoning_tokens += value.reasoning_tokens;
    target.billed_characters += value.billed_characters;
    target.request_characters += value.request_characters;
    target.response_characters += value.response_characters;
    target.requests += value.requests;
    target.failures += value.failures;
    target.unavailable_usage_requests += value.unavailable_usage_requests;
}

fn totals_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiUsageTotals> {
    totals_from_row_offset(row, 0)
}
fn totals_from_row_offset(r: &rusqlite::Row<'_>, i: usize) -> rusqlite::Result<AiUsageTotals> {
    Ok(AiUsageTotals {
        input_tokens: r.get(i)?,
        output_tokens: r.get(i + 1)?,
        cached_tokens: r.get(i + 2)?,
        reasoning_tokens: r.get(i + 3)?,
        billed_characters: r.get(i + 4)?,
        request_characters: r.get(i + 5)?,
        response_characters: r.get(i + 6)?,
        requests: r.get(i + 7)?,
        failures: r.get(i + 8)?,
        unavailable_usage_requests: r.get(i + 9)?,
    })
}

fn csv(value: impl AsRef<str>) -> String {
    format!("\"{}\"", value.as_ref().replace('"', "\"\""))
}
pub fn export_usage(request: AiUsageExportRequest) -> anyhow::Result<u64> {
    let mut query = request.query;
    query.offset = 0;
    query.limit = 500;
    let mut rows = Vec::new();
    loop {
        let page = query_records(query.clone())?;
        let count = page.records.len();
        rows.extend(page.records);
        if count < query.limit as usize {
            break;
        }
        query.offset += query.limit;
    }
    let mut output = String::from(
        "occurred_at_ms,job_id,attempt,page_source,operation,engine_kind,profile_id,provider,model,scope_id,succeeded,latency_ms,failure_category,request_items,request_characters,response_characters,input_tokens,output_tokens,cached_tokens,reasoning_tokens,billed_characters,usage_source\n",
    );
    for e in &rows {
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            e.occurred_at_ms,
            csv(&e.job_id),
            e.attempt,
            csv(&e.page_source),
            csv(&e.operation),
            csv(&e.engine_kind),
            csv(e.profile_id.as_deref().unwrap_or("")),
            csv(&e.provider),
            csv(e.model.as_deref().unwrap_or("")),
            csv(e.scope_id.as_deref().unwrap_or("")),
            e.succeeded,
            e.latency_ms,
            csv(e.failure_category.as_deref().unwrap_or("")),
            e.request_items,
            e.request_characters,
            e.response_characters,
            e.input_tokens.map_or(String::new(), |v| v.to_string()),
            e.output_tokens.map_or(String::new(), |v| v.to_string()),
            e.cached_tokens.map_or(String::new(), |v| v.to_string()),
            e.reasoning_tokens.map_or(String::new(), |v| v.to_string()),
            e.billed_characters.map_or(String::new(), |v| v.to_string()),
            csv(&e.usage_source)
        ));
    }
    let path = Path::new(&request.destination_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, output).context("Failed to export AI usage CSV.")?;
    Ok(rows.len() as u64)
}

pub fn clear_usage(request: AiUsageClearRequest) -> anyhow::Result<AiUsageClearResult> {
    barrier()?;
    let mut db = open()?;
    let tx = db.transaction()?;
    match request.mode {
        AiUsageClearMode::DetailOlderThan90Days => {
            drop(tx);
            let removed = compact_expired(&mut db)?;
            Ok(AiUsageClearResult {
                removed_events: removed,
                removed_daily_rows: 0,
            })
        }
        AiUsageClearMode::All => {
            let events = tx.execute("DELETE FROM usage_events", [])?;
            let daily = tx.execute("DELETE FROM usage_daily", [])?;
            tx.commit()?;
            Ok(AiUsageClearResult {
                removed_events: events as u64,
                removed_daily_rows: daily as u64,
            })
        }
    }
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_usage_tests.rs"]
mod tests;
