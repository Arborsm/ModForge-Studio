use crate::domain::cp_maker::storage::{
    copy_cp_maker_draft_at_dir, delete_cp_maker_draft_at_dir, draft_file_path_at_dir,
    list_cp_maker_drafts_at_dir, load_cp_maker_draft_at_dir, save_cp_maker_draft_at_dir,
};
use crate::domain::cp_maker::types::{
    CopyCpMakerDraftRequest, CpMakerDraftErrorCode, CpMakerDraftOperation, CpMakerDraftRecord,
    CpMakerEventSourceSnapshot, CpMakerExportFingerprint, CpMakerMetadata, CpMakerOverlayTarget,
    CpMakerOverlayTargetSource,
};
use crate::test_support::create_temp_dir;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;

fn sample_draft(draft_storage_key: &str) -> CpMakerDraftRecord {
    CpMakerDraftRecord {
        draft_storage_key: draft_storage_key.to_string(),
        project_metadata: CpMakerMetadata {
            project_name: "Builder Draft".to_string(),
            project_description: "A cp-maker draft".to_string(),
            project_author: "ModForge".to_string(),
            project_version: "1.0.0".to_string(),
            project_unique_id: "ModForge.BuilderDraft".to_string(),
            game_root_path: Some("E:\\Games\\Stardew Valley".to_string()),
            content_pack_for_unique_id: "Pathoschild.ContentPatcher".to_string(),
            minimum_api_version: None,
            update_keys: Vec::new(),
        },
        overlay_targets: vec![CpMakerOverlayTarget {
            unique_id: "Pathoschild.ContentPatcher".to_string(),
            display_name: Some("Content Patcher".to_string()),
            required: false,
            source: CpMakerOverlayTargetSource::ScannedMod,
        }],
        config_schema_draft: json!({
            "Season": {
                "AllowValues": "spring, summer, fall, winter"
            }
        }),
        serialized_change_registry: json!({
            "batches": [
                {
                    "id": "batch-001",
                    "workspace": "mods",
                    "label": "Edit cp maker metadata"
                }
            ]
        }),
        dynamic_tokens: Vec::new(),
        custom_locations: Vec::new(),
        alias_token_names: BTreeMap::new(),
        event_source_snapshots_by_target: BTreeMap::from([(
            "Data/Events/Town".to_string(),
            CpMakerEventSourceSnapshot {
                raw_scripts_by_key: BTreeMap::from([(
                    "1000/f Alex 2500".to_string(),
                    "spring_day_ambient/farmer 8 12/Alex 10 11 2 Abigail 11 11 1/speak Abigail \"Hello there\""
                        .to_string(),
                )]),
            },
        )]),
        last_draft_saved_at: None,
        last_exported_at: Some(1_710_000_000_000),
        last_export_path: Some("E:\\Exports\\Builder Draft".to_string()),
        last_export_fingerprint: Some(CpMakerExportFingerprint {
            draft_fingerprint: "draft-fingerprint".to_string(),
            environment_fingerprint: "environment-fingerprint".to_string(),
            capability_fingerprint: "capability-fingerprint".to_string(),
        }),
    }
}

#[test]
fn saves_loads_and_lists_cp_maker_drafts_round_trip() {
    let root = create_temp_dir("cp-maker-round-trip");
    let draft = sample_draft("draft-001");

    let saved = save_cp_maker_draft_at_dir(&root, draft).expect("save draft");
    let loaded = load_cp_maker_draft_at_dir(&root, "draft-001").expect("load draft");
    let listed = list_cp_maker_drafts_at_dir(&root).expect("list drafts");

    assert_eq!(loaded, saved);
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].draft_storage_key, "draft-001");
    assert_eq!(listed[0].project_name, "Builder Draft");
    assert_eq!(listed[0].project_unique_id, "ModForge.BuilderDraft");
    assert_eq!(listed[0].last_draft_saved_at, saved.last_draft_saved_at);
    assert_eq!(listed[0].last_exported_at, Some(1_710_000_000_000));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn copies_cp_maker_drafts_with_a_new_storage_key() {
    let root = create_temp_dir("cp-maker-copy");
    let source =
        save_cp_maker_draft_at_dir(&root, sample_draft("draft-source")).expect("save source draft");

    let copied = copy_cp_maker_draft_at_dir(
        &root,
        CopyCpMakerDraftRequest {
            source_draft_storage_key: source.draft_storage_key.clone(),
        },
    )
    .expect("copy draft");

    assert_ne!(copied.draft_storage_key, source.draft_storage_key);
    assert_eq!(copied.project_metadata, source.project_metadata);
    assert_eq!(copied.overlay_targets, source.overlay_targets);
    assert_eq!(copied.config_schema_draft, source.config_schema_draft);
    assert_eq!(
        copied.serialized_change_registry,
        source.serialized_change_registry
    );
    assert_eq!(
        copied.event_source_snapshots_by_target,
        source.event_source_snapshots_by_target
    );
    assert!(copied.last_draft_saved_at.is_some());
    assert_eq!(copied.last_exported_at, None);
    assert_eq!(copied.last_export_path, None);
    assert_eq!(copied.last_export_fingerprint, None);

    let reloaded =
        load_cp_maker_draft_at_dir(&root, &copied.draft_storage_key).expect("load copied draft");
    assert_eq!(reloaded, copied);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn deletes_cp_maker_drafts_and_reports_missing_records_explicitly() {
    let root = create_temp_dir("cp-maker-delete");
    save_cp_maker_draft_at_dir(&root, sample_draft("draft-delete")).expect("save draft");

    delete_cp_maker_draft_at_dir(&root, "draft-delete").expect("delete draft");

    let error = load_cp_maker_draft_at_dir(&root, "draft-delete")
        .expect_err("expected deleted draft to be missing");
    assert_eq!(error.code, CpMakerDraftErrorCode::MissingRecord);
    assert_eq!(error.operation, CpMakerDraftOperation::Load);
    assert_eq!(error.draft_storage_key.as_deref(), Some("draft-delete"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn surfaces_corrupted_draft_snapshots_as_structured_errors() {
    let root = create_temp_dir("cp-maker-corrupted");
    let draft_path = draft_file_path_at_dir(&root, "draft-corrupted");
    if let Some(parent) = draft_path.parent() {
        fs::create_dir_all(parent).expect("create draft dir");
    }
    fs::write(&draft_path, "{ this is not valid json").expect("write corrupted draft");

    let error = load_cp_maker_draft_at_dir(&root, "draft-corrupted")
        .expect_err("expected corrupted draft load to fail");

    assert_eq!(error.code, CpMakerDraftErrorCode::CorruptedSnapshot);
    assert_eq!(error.operation, CpMakerDraftOperation::Load);
    assert_eq!(error.draft_storage_key.as_deref(), Some("draft-corrupted"));
    assert_eq!(
        error.path.as_deref(),
        Some(draft_path.to_string_lossy().as_ref())
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn reports_missing_cp_maker_drafts_as_structured_errors() {
    let root = create_temp_dir("cp-maker-missing");
    let draft_path = draft_file_path_at_dir(&root, "draft-missing");

    let error = load_cp_maker_draft_at_dir(&root, "draft-missing")
        .expect_err("expected missing draft load to fail");

    assert_eq!(error.code, CpMakerDraftErrorCode::MissingRecord);
    assert_eq!(error.operation, CpMakerDraftOperation::Load);
    assert_eq!(error.draft_storage_key.as_deref(), Some("draft-missing"));
    assert_eq!(
        error.path.as_deref(),
        Some(draft_path.to_string_lossy().as_ref())
    );

    fs::remove_dir_all(root).expect("cleanup");
}
