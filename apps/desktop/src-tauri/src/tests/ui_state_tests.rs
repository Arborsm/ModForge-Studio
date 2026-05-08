use super::{
    load_or_create_app_ui_state_at_path, patch_app_ui_state_at_path, AppUiAppearanceStatePatch,
    AppUiDiscoverToolbarState, AppUiCpMakerWorkspaceStatePatch, AppUiLauncherStatePatch,
    AppUiStatePatch, AppUiWorkspaceStatePatch,
};
use crate::test_support::create_temp_dir;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;

#[test]
fn load_app_ui_state_creates_defaults_when_file_is_missing() {
    let root = create_temp_dir("app-ui-state-defaults");
    let path = root.join("app").join("ui-state.json");

    let state = load_or_create_app_ui_state_at_path(&path).expect("load defaults");

    assert_eq!(state.version, 1);
    assert_eq!(state.shell.app_mode, "launcher");
    assert_eq!(state.shell.launcher_page, "library");
    assert_eq!(state.appearance.locale, "zh-CN");
    assert_eq!(state.appearance.accent_preset_id, "indigo");
    assert!(state.workspace.layouts.is_empty());
    assert_eq!(state.workspace.workspace_view_mode, "edit");
    assert!(
        state
            .workspace
            .cp_maker
            .active_generated_draft_key
            .is_none()
    );
    assert!(!state.launcher.force_offline);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_merges_sections_without_clobbering_existing_values() {
    let root = create_temp_dir("app-ui-state-merge");
    let path = root.join("app").join("ui-state.json");

    let saved = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            appearance: Some(AppUiAppearanceStatePatch {
                locale: Some("en-US".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("save appearance");
    assert_eq!(saved.appearance.locale, "en-US");

    let saved = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                workspace_view_mode: Some("project".to_string()),
                cp_maker: Some(AppUiCpMakerWorkspaceStatePatch {
                    active_generated_draft_key: Some("  draft-001  ".to_string()),
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("save workspace cp-maker metadata");
    assert_eq!(saved.workspace.workspace_view_mode, "project");
    assert_eq!(
        saved
            .workspace
            .cp_maker
            .active_generated_draft_key
            .as_deref(),
        Some("draft-001")
    );

    let patched = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            launcher: Some(AppUiLauncherStatePatch {
                discover_toolbar: Some(AppUiDiscoverToolbarState {
                    sort: "downloads".to_string(),
                    ascending: true,
                    time_range: "month".to_string(),
                    page_size: 40,
                    filters_hidden: true,
                }),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("patch launcher");

    assert_eq!(patched.appearance.locale, "en-US");
    assert_eq!(patched.launcher.discover_toolbar.sort, "downloads");
    assert!(patched.launcher.discover_toolbar.filters_hidden);
    assert!(!patched.launcher.force_offline);
    assert_eq!(patched.workspace.workspace_view_mode, "project");
    assert_eq!(
        patched
            .workspace
            .cp_maker
            .active_generated_draft_key
            .as_deref(),
        Some("draft-001")
    );

    let mut layouts = BTreeMap::new();
    layouts.insert(
        "modforge:workspace-layout:v11:mods:cp-maker-builder".to_string(),
        Some(json!({
            "panels": {}
        })),
    );
    let patched = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                layouts: Some(layouts),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("patch workspace layouts");
    assert_eq!(patched.workspace.workspace_view_mode, "project");
    assert_eq!(
        patched
            .workspace
            .cp_maker
            .active_generated_draft_key
            .as_deref(),
        Some("draft-001")
    );

    let patched = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            launcher: Some(AppUiLauncherStatePatch {
                force_offline: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("patch launcher force offline");

    assert!(patched.launcher.force_offline);
    assert_eq!(patched.launcher.discover_toolbar.sort, "downloads");
    assert!(patched.launcher.discover_toolbar.filters_hidden);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_app_ui_state_discards_non_session_cp_maker_payloads() {
    let root = create_temp_dir("app-ui-state-cp-maker-workspace");
    let path = root.join("app").join("ui-state.json");

    fs::create_dir_all(path.parent().expect("app dir")).expect("create app dir");
    fs::write(
        &path,
        serde_json::to_string_pretty(&json!({
            "version": 1,
            "shell": {},
            "appearance": {},
            "workspace": {
                "layouts": {},
                "workspaceViewMode": "project",
                "cpMaker": {
                    "activeGeneratedDraftKey": "  draft-002  ",
                    "projectMetadata": {
                        "projectName": "Should be discarded"
                    },
                    "serializedChangeRegistry": {
                        "ops": []
                    }
                }
            },
            "launcher": {}
        }))
        .expect("serialize raw state"),
    )
    .expect("write raw state");

    let state = load_or_create_app_ui_state_at_path(&path).expect("load sanitized state");
    assert_eq!(state.workspace.workspace_view_mode, "project");
    assert_eq!(
        state
            .workspace
            .cp_maker
            .active_generated_draft_key
            .as_deref(),
        Some("draft-002")
    );

    let saved = fs::read_to_string(&path).expect("read sanitized file");
    assert!(!saved.contains("projectMetadata"));
    assert!(!saved.contains("serializedChangeRegistry"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_updates_and_removes_workspace_layout_entries() {
    let root = create_temp_dir("app-ui-state-layouts");
    let path = root.join("app").join("ui-state.json");
    let layout_key = "modforge:workspace-layout:v11:map".to_string();
    let mut layouts = BTreeMap::new();
    layouts.insert(
        layout_key.clone(),
        Some(json!({
            "panels": {},
            "slots": {},
            "chrome": {},
            "presets": {}
        })),
    );

    let saved = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                layouts: Some(layouts),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("save layouts");
    assert!(saved.workspace.layouts.contains_key(&layout_key));

    let mut removals = BTreeMap::new();
    removals.insert(layout_key.clone(), None);
    let patched = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                layouts: Some(removals),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("remove layout");

    assert!(!patched.workspace.layouts.contains_key(&layout_key));

    fs::remove_dir_all(root).expect("cleanup");
}
