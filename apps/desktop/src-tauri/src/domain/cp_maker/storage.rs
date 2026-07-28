use super::types::{CopyCpMakerDraftRequest, CpMakerDraftRecord, CpMakerDraftSummary};
use crate::infrastructure::text_encoding::read_text_file;
use anyhow::{Context, bail};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub fn list_cp_maker_drafts_at_dir(drafts_dir: &Path) -> anyhow::Result<Vec<CpMakerDraftSummary>> {
    if !drafts_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(drafts_dir).with_context(|| {
        format!(
            "Failed to read cp-maker drafts directory [path={}]",
            drafts_dir.display()
        )
    })?;

    let mut drafts = Vec::new();

    for entry in entries {
        let entry = entry.with_context(|| {
            format!(
                "Failed to read cp-maker draft directory entry [path={}]",
                drafts_dir.display()
            )
        })?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let Some(file_stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };

        let draft = read_draft_record_from_path(&path, file_stem)?;
        drafts.push(draft.summary());
    }

    drafts.sort_by(|left, right| {
        let left_name = left.project_name.to_lowercase();
        let right_name = right.project_name.to_lowercase();
        left_name
            .cmp(&right_name)
            .then_with(|| left.draft_storage_key.cmp(&right.draft_storage_key))
    });

    Ok(drafts)
}

pub fn load_cp_maker_draft_at_dir(
    drafts_dir: &Path,
    draft_storage_key: &str,
) -> anyhow::Result<CpMakerDraftRecord> {
    validate_draft_storage_key(draft_storage_key)?;
    let draft_path = draft_file_path_at_dir(drafts_dir, draft_storage_key);
    if !draft_path.is_file() {
        bail!(
            "Cp-maker draft record was not found. [draftStorageKey={}] [path={}]",
            draft_storage_key,
            draft_path.display()
        );
    }

    read_draft_record_from_path(&draft_path, draft_storage_key)
}

pub fn save_cp_maker_draft_at_dir(
    drafts_dir: &Path,
    draft: CpMakerDraftRecord,
) -> anyhow::Result<CpMakerDraftRecord> {
    let normalized = normalize_draft_record(draft)?;
    fs::create_dir_all(drafts_dir).with_context(|| {
        format!(
            "Failed to create cp-maker drafts directory [draftStorageKey={}] [path={}]",
            normalized.draft_storage_key,
            drafts_dir.display()
        )
    })?;

    let draft_path = draft_file_path_at_dir(drafts_dir, &normalized.draft_storage_key);
    let temp_path = drafts_dir.join(format!("{}.tmp", Uuid::new_v4()));
    let json = serde_json::to_string_pretty(&normalized).with_context(|| {
        format!(
            "Failed to serialize cp-maker draft JSON [draftStorageKey={}] [path={}]",
            normalized.draft_storage_key,
            draft_path.display()
        )
    })?;

    fs::write(&temp_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write cp-maker draft JSON [draftStorageKey={}] [path={}]",
            normalized.draft_storage_key,
            temp_path.display()
        )
    })?;

    fs::rename(&temp_path, &draft_path).with_context(|| {
        let _ = fs::remove_file(&temp_path);
        format!(
            "Failed to finalize cp-maker draft JSON [draftStorageKey={}] [path={}]",
            normalized.draft_storage_key,
            draft_path.display()
        )
    })?;

    Ok(normalized)
}

pub fn delete_cp_maker_draft_at_dir(
    drafts_dir: &Path,
    draft_storage_key: &str,
) -> anyhow::Result<()> {
    validate_draft_storage_key(draft_storage_key)?;
    let draft_path = draft_file_path_at_dir(drafts_dir, draft_storage_key);
    if !draft_path.is_file() {
        bail!(
            "Cp-maker draft record was not found. [draftStorageKey={}] [path={}]",
            draft_storage_key,
            draft_path.display()
        );
    }

    fs::remove_file(&draft_path).with_context(|| {
        format!(
            "Failed to delete cp-maker draft JSON [draftStorageKey={}] [path={}]",
            draft_storage_key,
            draft_path.display()
        )
    })
}

pub fn copy_cp_maker_draft_at_dir(
    drafts_dir: &Path,
    request: CopyCpMakerDraftRequest,
) -> anyhow::Result<CpMakerDraftRecord> {
    let source = load_cp_maker_draft_at_dir(drafts_dir, &request.source_draft_storage_key)?;

    let copied = CpMakerDraftRecord {
        draft_storage_key: next_cp_maker_draft_storage_key(drafts_dir),
        last_draft_saved_at: None,
        last_exported_at: None,
        last_export_path: None,
        last_export_fingerprint: None,
        ..source
    };

    save_cp_maker_draft_at_dir(drafts_dir, copied)
}

pub fn draft_file_path_at_dir(drafts_dir: &Path, draft_storage_key: &str) -> PathBuf {
    drafts_dir.join(format!("{draft_storage_key}.json"))
}

fn current_time_millis(draft_storage_key: &str, path: &Path) -> anyhow::Result<i64> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .with_context(|| {
            format!(
                "Failed to compute cp-maker draft timestamp [draftStorageKey={}] [path={}]",
                draft_storage_key,
                path.display()
            )
        })?;

    Ok(duration.as_millis().min(i64::MAX as u128) as i64)
}

fn normalize_draft_record(mut draft: CpMakerDraftRecord) -> anyhow::Result<CpMakerDraftRecord> {
    validate_draft_storage_key(&draft.draft_storage_key)?;

    if !draft.config_schema_draft.is_object() {
        bail!(
            "Cp-maker draft configSchemaDraft must be a JSON object. [draftStorageKey={}]",
            draft.draft_storage_key
        );
    }

    if !draft.serialized_change_registry.is_object() {
        bail!(
            "Cp-maker draft serializedChangeRegistry must be a JSON object. [draftStorageKey={}]",
            draft.draft_storage_key
        );
    }

    if draft
        .project_metadata
        .content_pack_for_unique_id
        .trim()
        .is_empty()
    {
        draft.project_metadata.content_pack_for_unique_id =
            "Pathoschild.ContentPatcher".to_string();
    }

    let draft_path = draft_file_path_at_dir(Path::new(""), &draft.draft_storage_key);
    draft.last_draft_saved_at = Some(current_time_millis(&draft.draft_storage_key, &draft_path)?);

    Ok(draft)
}

fn read_draft_record_from_path(
    path: &Path,
    draft_storage_key: &str,
) -> anyhow::Result<CpMakerDraftRecord> {
    let content = read_text_file(path).with_context(|| {
        format!(
            "Failed to read cp-maker draft JSON [draftStorageKey={}] [path={}]",
            draft_storage_key,
            path.display()
        )
    })?;

    let draft = serde_json::from_str::<CpMakerDraftRecord>(&content).with_context(|| {
        format!(
            "Cp-maker draft JSON could not be parsed [draftStorageKey={}] [path={}]",
            draft_storage_key,
            path.display()
        )
    })?;

    if draft.draft_storage_key != draft_storage_key {
        bail!(
            "Cp-maker draft JSON key does not match the requested draftStorageKey. [draftStorageKey={}] [path={}]",
            draft_storage_key,
            path.display()
        );
    }

    if !draft.config_schema_draft.is_object() {
        bail!(
            "Cp-maker draft configSchemaDraft must be a JSON object. [draftStorageKey={}] [path={}]",
            draft_storage_key,
            path.display()
        );
    }

    if !draft.serialized_change_registry.is_object() {
        bail!(
            "Cp-maker draft serializedChangeRegistry must be a JSON object. [draftStorageKey={}] [path={}]",
            draft_storage_key,
            path.display()
        );
    }

    Ok(draft)
}

fn validate_draft_storage_key(draft_storage_key: &str) -> anyhow::Result<()> {
    let trimmed = draft_storage_key.trim();
    if trimmed.is_empty() {
        bail!(
            "Cp-maker draftStorageKey must not be empty. [draftStorageKey={}]",
            draft_storage_key
        );
    }

    let is_safe = trimmed
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'));

    if !is_safe {
        bail!(
            "Cp-maker draftStorageKey must be a safe path segment. [draftStorageKey={}]",
            draft_storage_key
        );
    }

    Ok(())
}

fn next_cp_maker_draft_storage_key(drafts_dir: &Path) -> String {
    loop {
        let candidate = Uuid::new_v4().to_string();
        if !draft_file_path_at_dir(drafts_dir, &candidate).exists() {
            return candidate;
        }
    }
}
