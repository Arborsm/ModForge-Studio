use super::{
    AppUiAppearanceStatePatch, AppUiCpMakerWorkspaceStatePatch, AppUiDiscoverToolbarState,
    AppUiLauncherStatePatch, AppUiStatePatch, AppUiWorkspaceStatePatch,
    load_or_create_app_ui_state_at_path, patch_app_ui_state_at_path,
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
    assert_eq!(state.appearance.window_border_tone, "accent");
    assert_eq!(state.appearance.window_border_weight, "standard");
    assert!(state.workspace.layouts.is_empty());
    assert_eq!(state.workspace.workspace_view_mode, "edit");
    assert_eq!(state.workspace.last_location.workbench_route, "home");
    assert_eq!(state.workspace.last_location.workspace_mode, "map");
    assert_eq!(state.workspace.last_location.workspace_view_mode, "preview");
    assert!(state.workspace.side_nav.collapsed);
    assert!(state.workspace.side_nav.browse_open);
    assert!(!state.workspace.side_nav.tools_open);
    assert!(
        state
            .workspace
            .cp_maker
            .active_generated_draft_key
            .is_none()
    );
    assert!(!state.launcher.force_offline);
    assert!(!state.launcher.force_non_premium);

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
                window_border_tone: Some("neutral".to_string()),
                window_border_weight: Some("thin".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("save appearance");
    assert_eq!(saved.appearance.locale, "en-US");
    assert_eq!(saved.appearance.window_border_tone, "neutral");
    assert_eq!(saved.appearance.window_border_weight, "thin");

    let saved = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                workspace_view_mode: Some("project".to_string()),
                cp_maker: Some(AppUiCpMakerWorkspaceStatePatch {
                    active_generated_draft_key: Some("  draft-001  ".to_string()),
                    ..Default::default()
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
    assert_eq!(patched.appearance.window_border_tone, "neutral");
    assert_eq!(patched.appearance.window_border_weight, "thin");
    assert_eq!(patched.launcher.discover_toolbar.sort, "downloads");
    assert!(patched.launcher.discover_toolbar.filters_hidden);
    assert!(!patched.launcher.force_offline);
    assert!(!patched.launcher.force_non_premium);
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
                force_non_premium: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("patch launcher force offline");

    assert!(patched.launcher.force_offline);
    assert!(patched.launcher.force_non_premium);
    assert_eq!(patched.launcher.discover_toolbar.sort, "downloads");
    assert!(patched.launcher.discover_toolbar.filters_hidden);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_persists_workbench_navigation_across_reload() {
    let root = create_temp_dir("app-ui-state-workbench-navigation");
    let path = root.join("app").join("ui-state.json");

    let patch = serde_json::from_value::<AppUiStatePatch>(json!({
        "workspace": {
            "lastLocation": {
                "workbenchRoute": "workspace",
                "workspaceMode": "items",
                "workspaceViewMode": "edit",
                "registeredWorkbenchViewId": "  i18n-generator  "
            },
            "sideNav": {
                "collapsed": false,
                "browseOpen": false,
                "toolsOpen": true,
                "devOpen": false
            }
        }
    }))
    .expect("deserialize workbench navigation patch");

    patch_app_ui_state_at_path(&path, patch).expect("patch workbench navigation");

    let reloaded = load_or_create_app_ui_state_at_path(&path).expect("reload workbench navigation");
    assert_eq!(
        reloaded.workspace.last_location.workbench_route,
        "workspace"
    );
    assert_eq!(reloaded.workspace.last_location.workspace_mode, "items");
    assert_eq!(reloaded.workspace.last_location.workspace_view_mode, "edit");
    assert_eq!(
        reloaded
            .workspace
            .last_location
            .registered_workbench_view_id
            .as_deref(),
        Some("i18n-generator")
    );
    assert!(!reloaded.workspace.side_nav.collapsed);
    assert!(!reloaded.workspace.side_nav.browse_open);
    assert!(reloaded.workspace.side_nav.tools_open);
    assert!(!reloaded.workspace.side_nav.dev_open);

    let saved = fs::read_to_string(&path).expect("read workbench navigation state");
    assert!(saved.contains("\"lastLocation\""));
    assert!(saved.contains("\"sideNav\""));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_persists_i18n_generator_session_without_source_payload() {
    let root = create_temp_dir("app-ui-state-i18n-generator");
    let path = root.join("app").join("ui-state.json");
    let patch = serde_json::from_value::<AppUiStatePatch>(json!({
        "workspace": {
            "i18nGenerator": {
                "prefix": "Example.Mod",
                "targetPrefixes": { "Data/Objects": "objects" },
                "enabledTargets": ["Data/Objects"],
                "expandedPaths": ["Data", "Data/Objects"]
            }
        }
    }))
    .expect("deserialize i18n generator patch");

    patch_app_ui_state_at_path(&path, patch).expect("patch i18n generator session");
    let reloaded =
        load_or_create_app_ui_state_at_path(&path).expect("reload i18n generator session");

    assert_eq!(reloaded.workspace.i18n_generator.prefix, "Example.Mod");
    assert_eq!(
        reloaded
            .workspace
            .i18n_generator
            .target_prefixes
            .get("Data/Objects")
            .map(String::as_str),
        Some("objects")
    );
    assert_eq!(
        reloaded.workspace.i18n_generator.enabled_targets,
        vec!["Data/Objects"]
    );
    assert_eq!(
        reloaded.workspace.i18n_generator.expanded_paths,
        vec!["Data", "Data/Objects"]
    );

    let saved = fs::read_to_string(&path).expect("read i18n generator state");
    assert!(!saved.contains("source"));
    assert!(!saved.contains("generation"));
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
fn load_app_ui_state_migrates_legacy_window_border_style() {
    let root = create_temp_dir("app-ui-state-legacy-window-border");
    let path = root.join("app").join("ui-state.json");
    fs::create_dir_all(path.parent().expect("state parent")).expect("create state dir");
    fs::write(
        &path,
        r#"{
  "version": 1,
  "appearance": {
    "locale": "en-US",
    "accentPresetId": "indigo",
    "windowBorderStyle": "subtle"
  }
}
"#,
    )
    .expect("write legacy state");

    let state = load_or_create_app_ui_state_at_path(&path).expect("load legacy state");

    assert_eq!(state.appearance.window_border_tone, "accent");
    assert_eq!(state.appearance.window_border_weight, "thin");
    let saved = fs::read_to_string(&path).expect("read migrated state");
    assert!(!saved.contains("windowBorderStyle"));
    assert!(saved.contains("windowBorderTone"));
    assert!(saved.contains("windowBorderWeight"));

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
