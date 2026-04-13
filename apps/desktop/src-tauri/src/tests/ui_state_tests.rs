use super::{
    load_or_create_app_ui_state_at_path, patch_app_ui_state_at_path, AppUiAppearanceStatePatch,
    AppUiDiscoverToolbarState, AppUiLauncherStatePatch, AppUiStatePatch, AppUiWorkspaceStatePatch,
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
            }),
            ..Default::default()
        },
    )
    .expect("remove layout");

    assert!(!patched.workspace.layouts.contains_key(&layout_key));

    fs::remove_dir_all(root).expect("cleanup");
}
