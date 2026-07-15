use super::store::{bump_import, insert_imported_glossary, insert_imported_memory, open};
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use quick_xml::events::{BytesDecl, BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Write};
use std::path::Path;

const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgePack {
    version: u32,
    glossary: Vec<AiGlossaryEntry>,
    styles: Vec<AiStyleGuide>,
    memory: Vec<AiTranslationMemoryEntry>,
}
fn read_limited(path: &str) -> anyhow::Result<Vec<u8>> {
    let metadata =
        fs::metadata(path).context("Failed to inspect localization knowledge import.")?;
    if metadata.len() > MAX_IMPORT_BYTES {
        bail!("Localization knowledge import exceeds the 20 MB limit.")
    }
    fs::read(path).context("Failed to read localization knowledge import.")
}
fn ensure_parent(path: &str) -> anyhow::Result<()> {
    if let Some(parent) = Path::new(path).parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

pub fn import_knowledge(
    request: ImportLocalizationKnowledgeRequest,
) -> anyhow::Result<LocalizationKnowledgeTransferResult> {
    crate::domain::localization::jobs::check(&request.job_id)?;
    let bytes = read_limited(&request.source_path)?;
    let (mut glossary, mut styles, mut memory) = (Vec::new(), Vec::new(), Vec::new());
    match request.format {
        LocalizationKnowledgeFormat::KnowledgePackJson => {
            let pack: KnowledgePack =
                serde_json::from_slice(&bytes).context("Knowledge pack JSON is invalid.")?;
            if pack.version != 1 {
                bail!("Knowledge pack version is not supported.")
            }
            glossary = pack.glossary;
            styles = pack.styles;
            memory = pack.memory;
        }
        LocalizationKnowledgeFormat::GlossaryCsv => {
            let mut reader = csv::ReaderBuilder::new()
                .flexible(false)
                .from_reader(bytes.as_slice());
            for row in reader.deserialize::<CsvGlossary>() {
                let row = row.context("Glossary CSV row is invalid.")?;
                glossary.push(AiGlossaryEntry {
                    id: String::new(),
                    scope_id: request.scope_id.clone(),
                    source_locale: row.source_locale,
                    target_locale: row.target_locale,
                    source_term: row.source_term,
                    target_term: row.target_term,
                    match_mode: row.match_mode,
                    do_not_translate: row.do_not_translate,
                    notes: row.notes,
                    updated_at_ms: 0,
                });
            }
        }
        LocalizationKnowledgeFormat::TranslationMemoryTmx => {
            memory = parse_tmx(&bytes, &request.scope_id)?
        }
    }
    if glossary.len() > 10_000 || memory.len() > 100_000 {
        bail!("Imported localization knowledge exceeds the scope entry limit.")
    }
    let mut db = open()?;
    let tx = db.transaction()?;
    for entry in &mut glossary {
        crate::domain::localization::jobs::check(&request.job_id)?;
        entry.scope_id = request.scope_id.clone();
        insert_imported_glossary(&tx, entry)?;
    }
    for entry in &mut memory {
        crate::domain::localization::jobs::check(&request.job_id)?;
        entry.scope_id = request.scope_id.clone();
        insert_imported_memory(&tx, entry)?;
    }
    for style in &mut styles {
        crate::domain::localization::jobs::check(&request.job_id)?;
        style.scope_id = request.scope_id.clone();
        let encoded = serde_json::to_vec(&style)?;
        if encoded.len() > 16 * 1024 {
            bail!("Imported style guide exceeds the 16 KB limit.")
        }
        tx.execute("INSERT INTO style_guides VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(scope_id,target_locale) DO UPDATE SET tone=excluded.tone,audience=excluded.audience,formality=excluded.formality,forbidden_phrases=excluded.forbidden_phrases,preferred_phrases=excluded.preferred_phrases,rules=excluded.rules,updated_at_ms=excluded.updated_at_ms",params![style.scope_id,style.target_locale,style.tone,style.audience,style.formality,serde_json::to_string(&style.forbidden_phrases)?,serde_json::to_string(&style.preferred_phrases)?,serde_json::to_string(&style.rules)?,time::OffsetDateTime::now_utc().unix_timestamp()*1000])?;
    }
    let glossary_total: u64 = tx.query_row(
        "SELECT COUNT(*) FROM glossary_entries WHERE scope_id=?",
        [&request.scope_id],
        |row| row.get(0),
    )?;
    let memory_total: u64 = tx.query_row(
        "SELECT COUNT(*) FROM translation_memory WHERE scope_id=?",
        [&request.scope_id],
        |row| row.get(0),
    )?;
    if glossary_total > 10_000 || memory_total > 100_000 {
        bail!("Imported localization knowledge exceeds the scope entry limit.")
    }
    bump_import(&tx, &request.scope_id)?;
    tx.commit()?;
    Ok(LocalizationKnowledgeTransferResult {
        glossary_count: glossary.len() as u64,
        memory_count: memory.len() as u64,
        style_count: styles.len() as u64,
    })
}

#[derive(Serialize, Deserialize)]
struct CsvGlossary {
    source_locale: String,
    target_locale: String,
    source_term: String,
    target_term: String,
    match_mode: String,
    do_not_translate: bool,
    notes: String,
}
pub fn export_knowledge(
    request: ExportLocalizationKnowledgeRequest,
) -> anyhow::Result<LocalizationKnowledgeTransferResult> {
    ensure_parent(&request.destination_path)?;
    let db = open()?;
    let mut glossary_statement=db.prepare("SELECT id,scope_id,source_locale,target_locale,source_term,target_term,match_mode,do_not_translate,notes,updated_at_ms FROM glossary_entries WHERE scope_id=? AND (? IS NULL OR source_locale=?) AND (? IS NULL OR target_locale=?) AND (? IS NULL OR source_term LIKE '%'||?||'%' OR target_term LIKE '%'||?||'%' OR notes LIKE '%'||?||'%') ORDER BY source_term")?;
    let glossary = glossary_statement
        .query_map(
            params![
                request.scope_id,
                request.source_locale,
                request.source_locale,
                request.target_locale,
                request.target_locale,
                request.query,
                request.query,
                request.query,
                request.query
            ],
            |row| {
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
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let mut memory_statement=db.prepare("SELECT id,scope_id,source_locale,target_locale,source_text,target_text,source_kind,file_namespace,unit_key,confirmed_at_ms,use_count FROM translation_memory WHERE scope_id=? AND (? IS NULL OR source_locale=?) AND (? IS NULL OR target_locale=?) AND (? IS NULL OR source_text LIKE '%'||?||'%' OR target_text LIKE '%'||?||'%' OR file_namespace LIKE '%'||?||'%' OR unit_key LIKE '%'||?||'%') ORDER BY confirmed_at_ms DESC")?;
    let memory = memory_statement
        .query_map(
            params![
                request.scope_id,
                request.source_locale,
                request.source_locale,
                request.target_locale,
                request.target_locale,
                request.query,
                request.query,
                request.query,
                request.query,
                request.query
            ],
            |row| {
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
            },
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let mut style_statement=db.prepare("SELECT scope_id,target_locale,tone,audience,formality,forbidden_phrases,preferred_phrases,rules,updated_at_ms FROM style_guides WHERE scope_id=?")?;
    let styles = style_statement
        .query_map([&request.scope_id], |row| {
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
                rules: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
                updated_at_ms: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let counts = match request.format {
        LocalizationKnowledgeFormat::KnowledgePackJson => fs::write(
            &request.destination_path,
            serde_json::to_vec_pretty(&KnowledgePack {
                version: 1,
                glossary: glossary.clone(),
                styles: styles.clone(),
                memory: memory.clone(),
            })?,
        )
        .map(|_| (glossary.len(), memory.len(), styles.len()))?,
        LocalizationKnowledgeFormat::GlossaryCsv => {
            let mut file = fs::File::create(&request.destination_path)?;
            file.write_all(b"\xEF\xBB\xBF")?;
            let mut writer = csv::Writer::from_writer(file);
            for entry in &glossary {
                writer.serialize(CsvGlossary {
                    source_locale: entry.source_locale.clone(),
                    target_locale: entry.target_locale.clone(),
                    source_term: entry.source_term.clone(),
                    target_term: entry.target_term.clone(),
                    match_mode: entry.match_mode.clone(),
                    do_not_translate: entry.do_not_translate,
                    notes: entry.notes.clone(),
                })?;
            }
            writer.flush()?;
            (glossary.len(), 0, 0)
        }
        LocalizationKnowledgeFormat::TranslationMemoryTmx => {
            fs::write(&request.destination_path, write_tmx(&memory)?)?;
            (0, memory.len(), 0)
        }
    };
    Ok(LocalizationKnowledgeTransferResult {
        glossary_count: counts.0 as u64,
        memory_count: counts.1 as u64,
        style_count: counts.2 as u64,
    })
}

fn parse_tmx(bytes: &[u8], scope_id: &str) -> anyhow::Result<Vec<AiTranslationMemoryEntry>> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let (mut locale, mut source_locale, mut source, mut target) = (None, None, None, None);
    let mut entries = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer)? {
            Event::Start(event) if event.name().as_ref() == b"tuv" => {
                locale = event
                    .attributes()
                    .filter_map(Result::ok)
                    .find(|attr| attr.key.as_ref() == b"xml:lang" || attr.key.as_ref() == b"lang")
                    .map(|attr| String::from_utf8_lossy(attr.value.as_ref()).into_owned());
            }
            Event::Start(event) if event.name().as_ref() == b"seg" => {
                let text = reader.read_text(event.name())?.into_owned();
                if source_locale.is_none() {
                    source_locale = locale.clone();
                    source = Some(text)
                } else {
                    target = Some((locale.clone().unwrap_or_default(), text));
                }
            }
            Event::End(event) if event.name().as_ref() == b"tu" => {
                if let (Some(source_locale), Some(source), Some((target_locale, target))) =
                    (source_locale.take(), source.take(), target.take())
                {
                    entries.push(AiTranslationMemoryEntry {
                        id: String::new(),
                        scope_id: scope_id.into(),
                        source_locale,
                        target_locale,
                        source_text: source,
                        target_text: target,
                        source_kind: "imported".into(),
                        file_namespace: None,
                        unit_key: None,
                        confirmed_at_ms: 0,
                        use_count: 0,
                        similarity: 0.0,
                        score: 0.0,
                        semantic_similarity: None,
                        lexical_similarity: 0.0,
                        match_kind: "none".into(),
                        retrieval_mode: "lexical".into(),
                    });
                }
                locale = None;
            }
            Event::Eof => break,
            _ => {}
        }
        buffer.clear();
    }
    Ok(entries)
}
fn write_tmx(entries: &[AiTranslationMemoryEntry]) -> anyhow::Result<Vec<u8>> {
    let mut writer = Writer::new(Cursor::new(Vec::new()));
    writer.write_event(Event::Decl(BytesDecl::new("1.0", Some("UTF-8"), None)))?;
    let mut tmx = BytesStart::new("tmx");
    tmx.push_attribute(("version", "1.4"));
    writer.write_event(Event::Start(tmx))?;
    writer.write_event(Event::Empty(BytesStart::new("header")))?;
    writer.write_event(Event::Start(BytesStart::new("body")))?;
    for entry in entries {
        writer.write_event(Event::Start(BytesStart::new("tu")))?;
        for (locale, text) in [
            (&entry.source_locale, &entry.source_text),
            (&entry.target_locale, &entry.target_text),
        ] {
            let mut tuv = BytesStart::new("tuv");
            tuv.push_attribute(("xml:lang", locale.as_str()));
            writer.write_event(Event::Start(tuv))?;
            writer.write_event(Event::Start(BytesStart::new("seg")))?;
            writer.write_event(Event::Text(BytesText::new(text)))?;
            writer.write_event(Event::End(BytesEnd::new("seg")))?;
            writer.write_event(Event::End(BytesEnd::new("tuv")))?;
        }
        writer.write_event(Event::End(BytesEnd::new("tu")))?;
    }
    writer.write_event(Event::End(BytesEnd::new("body")))?;
    writer.write_event(Event::End(BytesEnd::new("tmx")))?;
    Ok(writer.into_inner().into_inner())
}
