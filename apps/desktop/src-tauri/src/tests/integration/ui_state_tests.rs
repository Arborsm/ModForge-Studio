use super::{
    AppUiAppearanceStatePatch, AppUiDiscoverToolbarState, AppUiLauncherStatePatch,
    AppUiLoadingMotionState, AppUiStatePatch, AppUiWorkbenchLocation,
    AppUiWorkspaceNavigationStatePatch, AppUiWorkspaceStatePatch,
    load_or_create_app_ui_state_at_path, patch_app_ui_state_at_path,
};
use crate::test_support::create_temp_dir;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;

#[test]
fn load_app_ui_state_creates_new_workspace_defaults() {
    let root = create_temp_dir("app-ui-state-defaults");
    let path = root.join("app/ui-state.json");
    let state = load_or_create_app_ui_state_at_path(&path).expect("load defaults");

    assert_eq!(state.workspace.location.kind, "home");
    assert!(state.workspace.location.module_id.is_none());
    assert!(state.workspace.navigation.collapsed);
    assert_eq!(state.workspace.navigation.expanded_sections, vec!["browse"]);
    assert!(state.workspace.modules.is_empty());
    assert_eq!(state.shell.app_mode, "launcher");
    assert_eq!(state.appearance.locale, "zh-CN");
    assert_eq!(state.appearance.theme_id, "neutral-tool");
    assert_eq!(state.appearance.loading_motion.style_id, "softFadeIn");
    assert!(!state.launcher.force_offline);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_round_trips_location_navigation_and_modules() {
    let root = create_temp_dir("app-ui-state-workspace-roundtrip");
    let path = root.join("app/ui-state.json");
    let mut modules = BTreeMap::new();
    modules.insert(
        "map-browser".to_string(),
        Some(json!({ "layout": { "panels": {} }, "selection": "Town" })),
    );

    patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                location: Some(AppUiWorkbenchLocation {
                    kind: "module".to_string(),
                    module_id: Some("  map-browser  ".to_string()),
                }),
                navigation: Some(AppUiWorkspaceNavigationStatePatch {
                    collapsed: Some(false),
                    expanded_sections: Some(vec![
                        "browse".to_string(),
                        "tools".to_string(),
                        "tools".to_string(),
                        "unknown".to_string(),
                    ]),
                }),
                modules: Some(modules),
            }),
            ..Default::default()
        },
    )
    .expect("patch workspace");

    let state = load_or_create_app_ui_state_at_path(&path).expect("reload workspace");
    assert_eq!(state.workspace.location.kind, "module");
    assert_eq!(
        state.workspace.location.module_id.as_deref(),
        Some("map-browser")
    );
    assert!(!state.workspace.navigation.collapsed);
    assert_eq!(
        state.workspace.navigation.expanded_sections,
        vec!["browse", "tools"]
    );
    assert_eq!(state.workspace.modules["map-browser"]["selection"], "Town");

    let saved = fs::read_to_string(&path).expect("read workspace json");
    assert!(saved.contains("\"location\""));
    assert!(saved.contains("\"navigation\""));
    assert!(saved.contains("\"modules\""));
    assert!(!saved.contains("lastLocation"));
    assert!(!saved.contains("layouts"));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patch_app_ui_state_merges_and_removes_one_module() {
    let root = create_temp_dir("app-ui-state-module-patch");
    let path = root.join("app/ui-state.json");
    let patch_modules = |entries: Vec<(&str, Option<serde_json::Value>)>| {
        entries
            .into_iter()
            .map(|(key, value)| (key.to_string(), value))
            .collect::<BTreeMap<_, _>>()
    };

    patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                modules: Some(patch_modules(vec![
                    (
                        "map-browser",
                        Some(json!({ "layout": { "panels": {} }, "selection": "Town" })),
                    ),
                    ("item-browser", Some(json!({ "query": "seed" }))),
                ])),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("seed modules");

    let state = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            workspace: Some(AppUiWorkspaceStatePatch {
                modules: Some(patch_modules(vec![
                    ("map-browser", Some(json!({ "selection": "Farm" }))),
                    ("item-browser", None),
                ])),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("patch modules");

    assert_eq!(state.workspace.modules["map-browser"]["selection"], "Farm");
    assert!(
        state.workspace.modules["map-browser"]
            .get("layout")
            .is_some()
    );
    assert!(!state.workspace.modules.contains_key("item-browser"));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn legacy_workspace_defaults_without_affecting_other_sections() {
    let root = create_temp_dir("app-ui-state-legacy-workspace");
    let path = root.join("app/ui-state.json");
    fs::create_dir_all(path.parent().expect("state parent")).expect("create state dir");
    fs::write(
        &path,
        serde_json::to_string_pretty(&json!({
            "version": 1,
            "shell": { "appMode": "workbench", "launcherPage": "library" },
            "appearance": { "locale": "en-US", "windowBorderTone": "neutral" },
            "workspace": {
                "layouts": { "legacy": { "panels": {} } },
                "lastLocation": { "workbenchRoute": "workspace", "workspaceMode": "items" },
                "sideNav": { "collapsed": false },
                "cpMaker": { "activeDraftKey": "draft-1" }
            },
            "launcher": { "forceOffline": true }
        }))
        .expect("serialize legacy state"),
    )
    .expect("write legacy state");

    let state = load_or_create_app_ui_state_at_path(&path).expect("load legacy state");
    assert_eq!(state.workspace.location.kind, "home");
    assert!(state.workspace.navigation.collapsed);
    assert_eq!(state.workspace.navigation.expanded_sections, vec!["browse"]);
    assert!(state.workspace.modules.is_empty());
    assert_eq!(state.shell.app_mode, "workbench");
    assert_eq!(state.appearance.locale, "en-US");
    assert!(state.launcher.force_offline);

    let saved = fs::read_to_string(&path).expect("read normalized state");
    assert!(!saved.contains("lastLocation"));
    assert!(!saved.contains("activeDraftKey"));
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn patches_other_sections_without_clobbering_workspace() {
    let root = create_temp_dir("app-ui-state-section-merge");
    let path = root.join("app/ui-state.json");
    let saved = patch_app_ui_state_at_path(
        &path,
        AppUiStatePatch {
            appearance: Some(AppUiAppearanceStatePatch {
                locale: Some("en-US".to_string()),
                theme_id: Some("forest".to_string()),
                window_border_tone: Some("neutral".to_string()),
                loading_motion: Some(AppUiLoadingMotionState {
                    style_id: "bounceIn".to_string(),
                    intensity_id: "strong".to_string(),
                    speed_mode: "custom".to_string(),
                    speed_id: "fast".to_string(),
                    speed_multiplier: 0.678,
                }),
                ..Default::default()
            }),
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
    .expect("patch other sections");

    assert_eq!(saved.appearance.locale, "en-US");
    assert_eq!(saved.appearance.theme_id, "forest");
    assert_eq!(saved.appearance.window_border_tone, "neutral");
    assert_eq!(saved.appearance.loading_motion.style_id, "bounceIn");
    assert_eq!(saved.appearance.loading_motion.speed_multiplier, 0.68);
    assert_eq!(saved.launcher.discover_toolbar.sort, "downloads");
    assert_eq!(saved.workspace.location.kind, "home");
    let json = fs::read_to_string(&path).expect("read state JSON");
    assert!(json.contains("\"themeId\": \"forest\""));
    assert!(json.contains("\"loadingMotion\""));
    assert!(!json.contains("accentPresetId"));
    assert!(!json.contains("windowBorderStyle"));
    fs::remove_dir_all(root).expect("cleanup");
}
