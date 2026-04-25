use super::types::{
    CopyGeneratedProjectDraftRequest, GeneratedProjectDraftError, GeneratedProjectDraftErrorCode,
    GeneratedProjectDraftOperation, GeneratedProjectDraftRecord, GeneratedProjectDraftSummary,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

pub fn list_generated_project_drafts_at_dir(
    drafts_dir: &Path,
) -> Result<Vec<GeneratedProjectDraftSummary>, GeneratedProjectDraftError> {
    if !drafts_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(drafts_dir).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ListFailed,
            GeneratedProjectDraftOperation::List,
            format!("Failed to read generated-project drafts directory: {error}"),
        )
        .with_path(drafts_dir.display().to_string())
    })?;

    let mut drafts = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|error| {
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::ListFailed,
                GeneratedProjectDraftOperation::List,
                format!("Failed to read generated-project draft directory entry: {error}"),
            )
            .with_path(drafts_dir.display().to_string())
        })?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }

        let Some(file_stem) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };

        let draft = read_draft_record_from_path(
            &path,
            file_stem,
            GeneratedProjectDraftOperation::List,
        )?;
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

pub fn load_generated_project_draft_at_dir(
    drafts_dir: &Path,
    draft_storage_key: &str,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    validate_draft_storage_key(draft_storage_key, GeneratedProjectDraftOperation::Load)?;
    let draft_path = draft_file_path_at_dir(drafts_dir, draft_storage_key);
    if !draft_path.is_file() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::MissingRecord,
                GeneratedProjectDraftOperation::Load,
                "Generated-project draft record was not found.",
            )
            .with_draft_storage_key(draft_storage_key)
            .with_path(draft_path.display().to_string()),
        );
    }

    read_draft_record_from_path(
        &draft_path,
        draft_storage_key,
        GeneratedProjectDraftOperation::Load,
    )
}

pub fn save_generated_project_draft_at_dir(
    drafts_dir: &Path,
    draft: GeneratedProjectDraftRecord,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let normalized = normalize_draft_record(draft, GeneratedProjectDraftOperation::Save)?;
    fs::create_dir_all(drafts_dir).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::WriteFailed,
            GeneratedProjectDraftOperation::Save,
            format!("Failed to create generated-project drafts directory: {error}"),
        )
        .with_draft_storage_key(normalized.draft_storage_key.clone())
        .with_path(drafts_dir.display().to_string())
    })?;

    let draft_path = draft_file_path_at_dir(drafts_dir, &normalized.draft_storage_key);
    let temp_path = drafts_dir.join(format!("{}.tmp", Uuid::new_v4()));
    let json = serde_json::to_string_pretty(&normalized).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::WriteFailed,
            GeneratedProjectDraftOperation::Save,
            format!("Failed to serialize generated-project draft JSON: {error}"),
        )
        .with_draft_storage_key(normalized.draft_storage_key.clone())
        .with_path(draft_path.display().to_string())
    })?;

    fs::write(&temp_path, format!("{json}\n")).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::WriteFailed,
            GeneratedProjectDraftOperation::Save,
            format!("Failed to write generated-project draft JSON: {error}"),
        )
        .with_draft_storage_key(normalized.draft_storage_key.clone())
        .with_path(temp_path.display().to_string())
    })?;

    fs::rename(&temp_path, &draft_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::WriteFailed,
            GeneratedProjectDraftOperation::Save,
            format!("Failed to finalize generated-project draft JSON: {error}"),
        )
        .with_draft_storage_key(normalized.draft_storage_key.clone())
        .with_path(draft_path.display().to_string())
    })?;

    Ok(normalized)
}

pub fn delete_generated_project_draft_at_dir(
    drafts_dir: &Path,
    draft_storage_key: &str,
) -> Result<(), GeneratedProjectDraftError> {
    validate_draft_storage_key(draft_storage_key, GeneratedProjectDraftOperation::Delete)?;
    let draft_path = draft_file_path_at_dir(drafts_dir, draft_storage_key);
    if !draft_path.is_file() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::MissingRecord,
                GeneratedProjectDraftOperation::Delete,
                "Generated-project draft record was not found.",
            )
            .with_draft_storage_key(draft_storage_key)
            .with_path(draft_path.display().to_string()),
        );
    }

    fs::remove_file(&draft_path).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::DeleteFailed,
            GeneratedProjectDraftOperation::Delete,
            format!("Failed to delete generated-project draft JSON: {error}"),
        )
        .with_draft_storage_key(draft_storage_key)
        .with_path(draft_path.display().to_string())
    })
}

pub fn copy_generated_project_draft_at_dir(
    drafts_dir: &Path,
    request: CopyGeneratedProjectDraftRequest,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let source = load_generated_project_draft_at_dir(drafts_dir, &request.source_draft_storage_key)
        .map_err(|error| {
            if error.operation == GeneratedProjectDraftOperation::Load {
                GeneratedProjectDraftError {
                    operation: GeneratedProjectDraftOperation::Copy,
                    ..error
                }
            } else {
                error
            }
        })?;

    let copied = GeneratedProjectDraftRecord {
        draft_storage_key: next_generated_project_draft_storage_key(drafts_dir),
        last_draft_saved_at: None,
        last_exported_at: None,
        last_export_path: None,
        last_export_fingerprint: None,
        ..source
    };

    save_generated_project_draft_at_dir(drafts_dir, copied).map_err(|error| {
        if error.operation == GeneratedProjectDraftOperation::Save {
            GeneratedProjectDraftError {
                operation: GeneratedProjectDraftOperation::Copy,
                ..error
            }
        } else {
            error
        }
    })
}

pub fn draft_file_path_at_dir(drafts_dir: &Path, draft_storage_key: &str) -> PathBuf {
    drafts_dir.join(format!("{draft_storage_key}.json"))
}

fn current_time_millis(
    operation: GeneratedProjectDraftOperation,
    draft_storage_key: &str,
    path: &Path,
) -> Result<i64, GeneratedProjectDraftError> {
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::WriteFailed,
            operation,
            format!("Failed to compute generated-project draft timestamp: {error}"),
        )
        .with_draft_storage_key(draft_storage_key)
        .with_path(path.display().to_string())
    })?;

    Ok(duration.as_millis().min(i64::MAX as u128) as i64)
}

fn normalize_draft_record(
    mut draft: GeneratedProjectDraftRecord,
    operation: GeneratedProjectDraftOperation,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    validate_draft_storage_key(&draft.draft_storage_key, operation)?;

    if !draft.config_schema_draft.is_object() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                operation,
                "Generated-project draft configSchemaDraft must be a JSON object.",
            )
            .with_draft_storage_key(draft.draft_storage_key.clone()),
        );
    }

    if !draft.serialized_change_registry.is_object() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                operation,
                "Generated-project draft serializedChangeRegistry must be a JSON object.",
            )
            .with_draft_storage_key(draft.draft_storage_key.clone()),
        );
    }

    for overlay_target in &draft.overlay_targets {
        if overlay_target.unique_id.trim().is_empty() {
            return Err(
                GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::InvalidDraft,
                    operation,
                    "Generated-project draft overlayTargets entries must include a uniqueId.",
                )
                .with_draft_storage_key(draft.draft_storage_key.clone()),
            );
        }
    }

    if draft.project_metadata.content_pack_for_unique_id.trim().is_empty() {
        draft.project_metadata.content_pack_for_unique_id =
            "Pathoschild.ContentPatcher".to_string();
    }

    let draft_path = draft_file_path_at_dir(Path::new(""), &draft.draft_storage_key);
    draft.last_draft_saved_at = Some(current_time_millis(
        operation,
        &draft.draft_storage_key,
        &draft_path,
    )?);

    Ok(draft)
}

fn read_draft_record_from_path(
    path: &Path,
    draft_storage_key: &str,
    operation: GeneratedProjectDraftOperation,
) -> Result<GeneratedProjectDraftRecord, GeneratedProjectDraftError> {
    let content = fs::read_to_string(path).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::ReadFailed,
            operation,
            format!("Failed to read generated-project draft JSON: {error}"),
        )
        .with_draft_storage_key(draft_storage_key)
        .with_path(path.display().to_string())
    })?;

    let draft = serde_json::from_str::<GeneratedProjectDraftRecord>(&content).map_err(|error| {
        GeneratedProjectDraftError::new(
            GeneratedProjectDraftErrorCode::CorruptedSnapshot,
            operation,
            format!("Generated-project draft JSON could not be parsed: {error}"),
        )
        .with_draft_storage_key(draft_storage_key)
        .with_path(path.display().to_string())
    })?;

    if draft.draft_storage_key != draft_storage_key {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::CorruptedSnapshot,
                operation,
                "Generated-project draft JSON key does not match the requested draftStorageKey.",
            )
            .with_draft_storage_key(draft_storage_key)
            .with_path(path.display().to_string()),
        );
    }

    if !draft.config_schema_draft.is_object() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::CorruptedSnapshot,
                operation,
                "Generated-project draft configSchemaDraft must be a JSON object.",
            )
            .with_draft_storage_key(draft_storage_key)
            .with_path(path.display().to_string()),
        );
    }

    if !draft.serialized_change_registry.is_object() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::CorruptedSnapshot,
                operation,
                "Generated-project draft serializedChangeRegistry must be a JSON object.",
            )
            .with_draft_storage_key(draft_storage_key)
            .with_path(path.display().to_string()),
        );
    }

    for overlay_target in &draft.overlay_targets {
        if overlay_target.unique_id.trim().is_empty() {
            return Err(
                GeneratedProjectDraftError::new(
                    GeneratedProjectDraftErrorCode::CorruptedSnapshot,
                    operation,
                    "Generated-project draft overlayTargets entries must include a uniqueId.",
                )
                .with_draft_storage_key(draft_storage_key)
                .with_path(path.display().to_string()),
            );
        }
    }

    Ok(draft)
}

fn validate_draft_storage_key(
    draft_storage_key: &str,
    operation: GeneratedProjectDraftOperation,
) -> Result<(), GeneratedProjectDraftError> {
    let trimmed = draft_storage_key.trim();
    if trimmed.is_empty() {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                operation,
                "Generated-project draftStorageKey must not be empty.",
            )
            .with_draft_storage_key(draft_storage_key),
        );
    }

    let is_safe = trimmed
        .chars()
        .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'));

    if !is_safe {
        return Err(
            GeneratedProjectDraftError::new(
                GeneratedProjectDraftErrorCode::InvalidDraft,
                operation,
                "Generated-project draftStorageKey must be a safe path segment.",
            )
            .with_draft_storage_key(draft_storage_key),
        );
    }

    Ok(())
}

fn next_generated_project_draft_storage_key(drafts_dir: &Path) -> String {
    loop {
        let candidate = Uuid::new_v4().to_string();
        if !draft_file_path_at_dir(drafts_dir, &candidate).exists() {
            return candidate;
        }
    }
}
