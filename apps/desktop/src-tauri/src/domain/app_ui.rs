use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};

use crate::domain::app_paths::app_ui_state_path;
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::Context;

static APP_UI_STATE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_app_ui_state_file() -> MutexGuard<'static, ()> {
    match APP_UI_STATE_FILE_LOCK.get_or_init(|| Mutex::new(())).lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            LogEvent::new("appUi.lock.poisoned")
                .field("resource", "app-ui-state-file")
                .emit_error(targets::APP_UI);
            poisoned.into_inner()
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiState {
    #[serde(default = "default_app_ui_state_version")]
    pub(crate) version: u32,
    #[serde(default)]
    pub(crate) shell: AppUiShellState,
    #[serde(default)]
    pub(crate) appearance: AppUiAppearanceState,
    #[serde(default)]
    pub(crate) workspace: AppUiWorkspaceState,
    #[serde(default)]
    pub(crate) launcher: AppUiLauncherState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiShellState {
    #[serde(default = "default_app_mode")]
    pub(crate) app_mode: String,
    #[serde(default = "default_launcher_page")]
    pub(crate) launcher_page: String,
    #[serde(default)]
    pub(crate) debug_enabled: bool,
    #[serde(default = "default_notification_sound_enabled")]
    pub(crate) notification_sound_enabled: bool,
    #[serde(default = "default_window_close_behavior")]
    pub(crate) window_close_behavior: String,
    #[serde(default)]
    pub(crate) remember_close_choice: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiAppearanceState {
    #[serde(default = "default_locale")]
    pub(crate) locale: String,
    #[serde(default = "default_theme_id")]
    pub(crate) theme_id: String,
    #[serde(default = "default_window_border_tone")]
    pub(crate) window_border_tone: String,
    #[serde(default = "default_window_border_weight")]
    pub(crate) window_border_weight: String,
    #[serde(default)]
    pub(crate) recent_game_directories: Vec<String>,
    #[serde(default)]
    pub(crate) player_appearance: AppUiPlayerAppearanceState,
    #[serde(default)]
    pub(crate) loading_motion: AppUiLoadingMotionState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiLoadingMotionState {
    #[serde(default = "default_loading_motion_style")]
    pub(crate) style_id: String,
    #[serde(default = "default_loading_motion_intensity")]
    pub(crate) intensity_id: String,
    #[serde(default = "default_loading_motion_speed_mode")]
    pub(crate) speed_mode: String,
    #[serde(default = "default_loading_motion_speed")]
    pub(crate) speed_id: String,
    #[serde(default = "default_loading_motion_speed_multiplier")]
    pub(crate) speed_multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiPlayerAppearanceState {
    #[serde(default)]
    pub(crate) profiles: Vec<Value>,
    #[serde(default)]
    pub(crate) active_profile_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkspaceState {
    #[serde(default)]
    pub(crate) location: AppUiWorkbenchLocation,
    #[serde(default)]
    pub(crate) navigation: AppUiWorkspaceNavigationState,
    #[serde(default)]
    pub(crate) expert_mode: bool,
    #[serde(default)]
    pub(crate) modules: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkbenchLocation {
    #[serde(default)]
    pub(crate) kind: String,
    #[serde(default)]
    pub(crate) module_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkspaceNavigationState {
    #[serde(default = "default_side_nav_collapsed")]
    pub(crate) collapsed: bool,
    #[serde(default = "default_expanded_navigation_sections")]
    pub(crate) expanded_sections: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiLauncherState {
    #[serde(default)]
    pub(crate) discover_toolbar: AppUiDiscoverToolbarState,
    #[serde(default)]
    pub(crate) force_offline: bool,
    #[serde(default)]
    pub(crate) force_non_premium: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiDiscoverToolbarState {
    #[serde(default = "default_discover_sort")]
    pub(crate) sort: String,
    #[serde(default)]
    pub(crate) ascending: bool,
    #[serde(default = "default_discover_time_range")]
    pub(crate) time_range: String,
    #[serde(default = "default_discover_page_size")]
    pub(crate) page_size: u32,
    #[serde(default)]
    pub(crate) filters_hidden: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiStatePatch {
    #[serde(default)]
    pub(crate) shell: Option<AppUiShellState>,
    #[serde(default)]
    pub(crate) appearance: Option<AppUiAppearanceStatePatch>,
    #[serde(default)]
    pub(crate) workspace: Option<AppUiWorkspaceStatePatch>,
    #[serde(default)]
    pub(crate) launcher: Option<AppUiLauncherStatePatch>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiAppearanceStatePatch {
    #[serde(default)]
    pub(crate) locale: Option<String>,
    #[serde(default)]
    pub(crate) theme_id: Option<String>,
    #[serde(default)]
    pub(crate) window_border_tone: Option<String>,
    #[serde(default)]
    pub(crate) window_border_weight: Option<String>,
    #[serde(default)]
    pub(crate) recent_game_directories: Option<Vec<String>>,
    #[serde(default)]
    pub(crate) player_appearance: Option<AppUiPlayerAppearanceState>,
    #[serde(default)]
    pub(crate) loading_motion: Option<AppUiLoadingMotionState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkspaceStatePatch {
    #[serde(default)]
    pub(crate) location: Option<AppUiWorkbenchLocation>,
    #[serde(default)]
    pub(crate) navigation: Option<AppUiWorkspaceNavigationStatePatch>,
    #[serde(default)]
    pub(crate) expert_mode: Option<bool>,
    #[serde(default)]
    pub(crate) modules: Option<BTreeMap<String, Option<Value>>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkspaceNavigationStatePatch {
    #[serde(default)]
    pub(crate) collapsed: Option<bool>,
    #[serde(default)]
    pub(crate) expanded_sections: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiLauncherStatePatch {
    #[serde(default)]
    pub(crate) discover_toolbar: Option<AppUiDiscoverToolbarState>,
    #[serde(default)]
    pub(crate) force_offline: Option<bool>,
    #[serde(default)]
    pub(crate) force_non_premium: Option<bool>,
}

fn default_app_ui_state_version() -> u32 {
    1
}

fn default_app_mode() -> String {
    "launcher".to_string()
}

fn default_launcher_page() -> String {
    "library".to_string()
}

fn default_notification_sound_enabled() -> bool {
    true
}

fn default_window_close_behavior() -> String {
    "quit".to_string()
}

fn default_locale() -> String {
    "zh-CN".to_string()
}

fn default_theme_id() -> String {
    "neutral-tool".to_string()
}

fn default_loading_motion_style() -> String {
    "softFadeIn".to_string()
}

fn default_loading_motion_intensity() -> String {
    "standard".to_string()
}

fn default_loading_motion_speed_mode() -> String {
    "preset".to_string()
}

fn default_loading_motion_speed() -> String {
    "standard".to_string()
}

fn default_loading_motion_speed_multiplier() -> f64 {
    1.0
}

fn default_window_border_tone() -> String {
    "accent".to_string()
}

fn default_window_border_weight() -> String {
    "standard".to_string()
}

fn default_side_nav_collapsed() -> bool {
    true
}

fn default_expanded_navigation_sections() -> Vec<String> {
    vec!["browse".to_string()]
}

fn default_discover_sort() -> String {
    "newest".to_string()
}

fn default_discover_time_range() -> String {
    "all".to_string()
}

fn default_discover_page_size() -> u32 {
    20
}

impl Default for AppUiState {
    fn default() -> Self {
        Self {
            version: default_app_ui_state_version(),
            shell: AppUiShellState::default(),
            appearance: AppUiAppearanceState::default(),
            workspace: AppUiWorkspaceState::default(),
            launcher: AppUiLauncherState::default(),
        }
    }
}

impl Default for AppUiShellState {
    fn default() -> Self {
        Self {
            app_mode: default_app_mode(),
            launcher_page: default_launcher_page(),
            debug_enabled: false,
            notification_sound_enabled: default_notification_sound_enabled(),
            window_close_behavior: default_window_close_behavior(),
            remember_close_choice: false,
        }
    }
}

impl Default for AppUiAppearanceState {
    fn default() -> Self {
        Self {
            locale: default_locale(),
            theme_id: default_theme_id(),
            window_border_tone: default_window_border_tone(),
            window_border_weight: default_window_border_weight(),
            recent_game_directories: Vec::new(),
            player_appearance: AppUiPlayerAppearanceState::default(),
            loading_motion: AppUiLoadingMotionState::default(),
        }
    }
}

impl Default for AppUiLoadingMotionState {
    fn default() -> Self {
        Self {
            style_id: default_loading_motion_style(),
            intensity_id: default_loading_motion_intensity(),
            speed_mode: default_loading_motion_speed_mode(),
            speed_id: default_loading_motion_speed(),
            speed_multiplier: default_loading_motion_speed_multiplier(),
        }
    }
}

impl Default for AppUiWorkspaceState {
    fn default() -> Self {
        Self {
            location: AppUiWorkbenchLocation {
                kind: "home".to_string(),
                module_id: None,
            },
            navigation: AppUiWorkspaceNavigationState::default(),
            expert_mode: false,
            modules: BTreeMap::new(),
        }
    }
}

impl Default for AppUiWorkspaceNavigationState {
    fn default() -> Self {
        Self {
            collapsed: default_side_nav_collapsed(),
            expanded_sections: default_expanded_navigation_sections(),
        }
    }
}

impl Default for AppUiDiscoverToolbarState {
    fn default() -> Self {
        Self {
            sort: default_discover_sort(),
            ascending: false,
            time_range: default_discover_time_range(),
            page_size: default_discover_page_size(),
            filters_hidden: false,
        }
    }
}

fn normalize_app_mode(value: &str) -> String {
    match value.trim() {
        "workbench" => "workbench".to_string(),
        "launcher" => "launcher".to_string(),
        _ => default_app_mode(),
    }
}

fn normalize_launcher_page(value: &str) -> String {
    match value.trim() {
        "library" => "library".to_string(),
        "discover" => "discover".to_string(),
        "updates" => "updates".to_string(),
        "debug" | "settings" => "debug".to_string(),
        _ => default_launcher_page(),
    }
}

fn normalize_locale(value: &str) -> String {
    match value.trim() {
        "en-US" => "en-US".to_string(),
        "zh-CN" => "zh-CN".to_string(),
        _ => default_locale(),
    }
}

fn normalize_theme_id(value: &str) -> String {
    match value.trim() {
        "neutral-tool" | "warm-paper" | "slate-blue" | "forest" | "twilight" | "stardew-wood"
        | "crimson" | "blossom" => value.trim().to_string(),
        _ => default_theme_id(),
    }
}

fn normalize_window_border_tone(value: &str) -> String {
    match value.trim() {
        "accent" | "neutral" => value.trim().to_string(),
        _ => default_window_border_tone(),
    }
}

fn normalize_window_border_weight(value: &str) -> String {
    match value.trim() {
        "standard" | "thin" | "none" => value.trim().to_string(),
        _ => default_window_border_weight(),
    }
}

fn normalize_window_close_behavior(value: &str) -> String {
    match value.trim() {
        "minimizeToTray" => "minimizeToTray".to_string(),
        _ => default_window_close_behavior(),
    }
}

fn normalize_loading_motion(state: AppUiLoadingMotionState) -> AppUiLoadingMotionState {
    let style_id = match state.style_id.trim() {
        "bounceIn" | "layeredFadeIn" | "slideInPush" | "softFadeIn" | "quietSimplify" => {
            state.style_id.trim().to_string()
        }
        _ => default_loading_motion_style(),
    };
    let intensity_id = match state.intensity_id.trim() {
        "light" | "standard" | "strong" => state.intensity_id.trim().to_string(),
        _ => default_loading_motion_intensity(),
    };
    let speed_mode = match state.speed_mode.trim() {
        "custom" => "custom".to_string(),
        _ => default_loading_motion_speed_mode(),
    };
    let speed_id = match state.speed_id.trim() {
        "slow" | "standard" | "fast" => state.speed_id.trim().to_string(),
        _ => default_loading_motion_speed(),
    };
    let speed_multiplier = if speed_mode == "custom" {
        if state.speed_multiplier.is_finite() {
            (state.speed_multiplier.clamp(0.25, 3.0) * 100.0).round() / 100.0
        } else {
            default_loading_motion_speed_multiplier()
        }
    } else {
        match speed_id.as_str() {
            "slow" => 1.3,
            "fast" => 0.72,
            _ => default_loading_motion_speed_multiplier(),
        }
    };
    AppUiLoadingMotionState {
        style_id,
        intensity_id,
        speed_mode,
        speed_id,
        speed_multiplier,
    }
}

fn normalize_discover_sort(value: &str) -> String {
    match value.trim() {
        "newest" | "updated" | "trending" | "downloads" | "endorsements" | "name" => {
            value.trim().to_string()
        }
        _ => default_discover_sort(),
    }
}

fn normalize_discover_time_range(value: &str) -> String {
    match value.trim() {
        "all" | "day" | "week" | "month" | "year" => value.trim().to_string(),
        _ => default_discover_time_range(),
    }
}

fn normalize_discover_page_size(value: u32) -> u32 {
    match value {
        20 | 40 | 80 => value,
        _ => default_discover_page_size(),
    }
}

fn normalize_string_vec(values: Vec<String>) -> Vec<String> {
    values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect()
}

fn normalize_player_appearance(state: AppUiPlayerAppearanceState) -> AppUiPlayerAppearanceState {
    let profiles = state
        .profiles
        .into_iter()
        .filter(|value| value.is_object())
        .collect::<Vec<_>>();
    let active_profile_id = state
        .active_profile_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    AppUiPlayerAppearanceState {
        profiles,
        active_profile_id,
    }
}

fn normalize_workspace_modules(modules: BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    modules
        .into_iter()
        .filter_map(|(key, value)| {
            let trimmed_key = key.trim().to_string();
            if trimmed_key.is_empty() || !value.is_object() {
                return None;
            }
            Some((trimmed_key, value))
        })
        .collect()
}

fn normalize_workspace(state: AppUiWorkspaceState) -> AppUiWorkspaceState {
    let module_id = state
        .location
        .module_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let location = if state.location.kind.trim() == "module" && module_id.is_some() {
        AppUiWorkbenchLocation {
            kind: "module".to_string(),
            module_id,
        }
    } else {
        AppUiWorkbenchLocation {
            kind: "home".to_string(),
            module_id: None,
        }
    };
    let mut expanded_sections = Vec::new();
    for section in state.navigation.expanded_sections {
        let section = section.trim();
        if matches!(section, "browse" | "authoring" | "tools" | "development")
            && !expanded_sections.iter().any(|current| current == section)
        {
            expanded_sections.push(section.to_string());
        }
    }
    AppUiWorkspaceState {
        location,
        navigation: AppUiWorkspaceNavigationState {
            collapsed: state.navigation.collapsed,
            expanded_sections,
        },
        expert_mode: state.expert_mode,
        modules: normalize_workspace_modules(state.modules),
    }
}

fn normalize_app_ui_state(state: AppUiState) -> AppUiState {
    AppUiState {
        version: default_app_ui_state_version(),
        shell: AppUiShellState {
            app_mode: normalize_app_mode(&state.shell.app_mode),
            launcher_page: normalize_launcher_page(&state.shell.launcher_page),
            debug_enabled: state.shell.debug_enabled,
            notification_sound_enabled: state.shell.notification_sound_enabled,
            window_close_behavior: normalize_window_close_behavior(
                &state.shell.window_close_behavior,
            ),
            remember_close_choice: state.shell.remember_close_choice,
        },
        appearance: AppUiAppearanceState {
            locale: normalize_locale(&state.appearance.locale),
            theme_id: normalize_theme_id(&state.appearance.theme_id),
            window_border_tone: normalize_window_border_tone(&state.appearance.window_border_tone),
            window_border_weight: normalize_window_border_weight(
                &state.appearance.window_border_weight,
            ),
            recent_game_directories: normalize_string_vec(state.appearance.recent_game_directories),
            player_appearance: normalize_player_appearance(state.appearance.player_appearance),
            loading_motion: normalize_loading_motion(state.appearance.loading_motion),
        },
        workspace: normalize_workspace(state.workspace),
        launcher: AppUiLauncherState {
            discover_toolbar: AppUiDiscoverToolbarState {
                sort: normalize_discover_sort(&state.launcher.discover_toolbar.sort),
                ascending: state.launcher.discover_toolbar.ascending,
                time_range: normalize_discover_time_range(
                    &state.launcher.discover_toolbar.time_range,
                ),
                page_size: normalize_discover_page_size(state.launcher.discover_toolbar.page_size),
                filters_hidden: state.launcher.discover_toolbar.filters_hidden,
            },
            force_offline: state.launcher.force_offline,
            force_non_premium: state.launcher.force_non_premium,
        },
    }
}

fn save_app_ui_state_at_path_unlocked(path: &Path, state: &AppUiState) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create app UI state directory {}",
                parent.display()
            )
        })?;
    }
    let normalized = normalize_app_ui_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize app UI state JSON"))?;
    fs::write(path, format!("{json}\n"))
        .with_context(|| format!("Failed to write app UI state {}", path.display()))
}

pub(crate) fn load_or_create_app_ui_state_at_path(path: &Path) -> anyhow::Result<AppUiState> {
    let _app_ui_file_guard = lock_app_ui_state_file();
    load_or_create_app_ui_state_at_path_unlocked(path)
}

fn load_or_create_app_ui_state_at_path_unlocked(path: &Path) -> anyhow::Result<AppUiState> {
    if path.is_file() {
        let content = read_text_file(path)
            .with_context(|| format!("Failed to read app UI state {}", path.display()))?;
        let parsed = serde_json::from_str::<AppUiState>(&content).unwrap_or_default();
        let normalized = normalize_app_ui_state(parsed);
        save_app_ui_state_at_path_unlocked(path, &normalized)?;
        return Ok(normalized);
    }

    let default_state = AppUiState::default();
    save_app_ui_state_at_path_unlocked(path, &default_state)?;
    Ok(default_state)
}

pub(crate) fn patch_app_ui_state_at_path(
    path: &Path,
    patch: AppUiStatePatch,
) -> anyhow::Result<AppUiState> {
    let _app_ui_file_guard = lock_app_ui_state_file();
    let mut state = load_or_create_app_ui_state_at_path_unlocked(path)?;
    if let Some(shell) = patch.shell {
        state.shell = AppUiShellState {
            app_mode: normalize_app_mode(&shell.app_mode),
            launcher_page: normalize_launcher_page(&shell.launcher_page),
            debug_enabled: shell.debug_enabled,
            notification_sound_enabled: shell.notification_sound_enabled,
            window_close_behavior: normalize_window_close_behavior(&shell.window_close_behavior),
            remember_close_choice: shell.remember_close_choice,
        };
    }
    if let Some(appearance) = patch.appearance {
        if let Some(locale) = appearance.locale {
            state.appearance.locale = normalize_locale(&locale);
        }
        if let Some(theme_id) = appearance.theme_id {
            state.appearance.theme_id = normalize_theme_id(&theme_id);
        }
        if let Some(window_border_tone) = appearance.window_border_tone {
            state.appearance.window_border_tone = normalize_window_border_tone(&window_border_tone);
        }
        if let Some(window_border_weight) = appearance.window_border_weight {
            state.appearance.window_border_weight =
                normalize_window_border_weight(&window_border_weight);
        }
        if let Some(recent_game_directories) = appearance.recent_game_directories {
            state.appearance.recent_game_directories =
                normalize_string_vec(recent_game_directories);
        }
        if let Some(player_appearance) = appearance.player_appearance {
            state.appearance.player_appearance = normalize_player_appearance(player_appearance);
        }
        if let Some(loading_motion) = appearance.loading_motion {
            state.appearance.loading_motion = normalize_loading_motion(loading_motion);
        }
    }
    if let Some(workspace) = patch.workspace {
        if let Some(location) = workspace.location {
            state.workspace.location = location;
        }
        if let Some(navigation) = workspace.navigation {
            if let Some(collapsed) = navigation.collapsed {
                state.workspace.navigation.collapsed = collapsed;
            }
            if let Some(expanded_sections) = navigation.expanded_sections {
                state.workspace.navigation.expanded_sections = expanded_sections;
            }
        }
        if let Some(expert_mode) = workspace.expert_mode {
            state.workspace.expert_mode = expert_mode;
        }
        if let Some(modules) = workspace.modules {
            for (key, value) in modules {
                let trimmed_key = key.trim().to_string();
                if trimmed_key.is_empty() {
                    continue;
                }
                match value {
                    Some(Value::Object(incoming)) => {
                        let current = state
                            .workspace
                            .modules
                            .entry(trimmed_key)
                            .or_insert_with(|| Value::Object(Default::default()));
                        if let Value::Object(current) = current {
                            current.extend(incoming);
                        }
                    }
                    Some(_) => {}
                    None => {
                        state.workspace.modules.remove(&trimmed_key);
                    }
                }
            }
        }
    }
    if let Some(launcher) = patch.launcher {
        if let Some(discover_toolbar) = launcher.discover_toolbar {
            state.launcher.discover_toolbar = AppUiDiscoverToolbarState {
                sort: normalize_discover_sort(&discover_toolbar.sort),
                ascending: discover_toolbar.ascending,
                time_range: normalize_discover_time_range(&discover_toolbar.time_range),
                page_size: normalize_discover_page_size(discover_toolbar.page_size),
                filters_hidden: discover_toolbar.filters_hidden,
            };
        }
        if let Some(force_offline) = launcher.force_offline {
            state.launcher.force_offline = force_offline;
        }
        if let Some(force_non_premium) = launcher.force_non_premium {
            state.launcher.force_non_premium = force_non_premium;
        }
    }
    let normalized = normalize_app_ui_state(state);
    save_app_ui_state_at_path_unlocked(path, &normalized)?;
    Ok(normalized)
}

pub(crate) fn load_app_ui_state() -> anyhow::Result<AppUiState> {
    let path = app_ui_state_path()?;
    load_or_create_app_ui_state_at_path(&path)
}

pub(crate) fn patch_app_ui_state(request: AppUiStatePatch) -> anyhow::Result<AppUiState> {
    let path = app_ui_state_path()?;
    patch_app_ui_state_at_path(&path, request)
}

#[cfg(test)]
#[path = "../tests/integration/ui_state_tests.rs"]
mod tests;
