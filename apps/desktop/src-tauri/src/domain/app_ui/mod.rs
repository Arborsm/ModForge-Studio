use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use crate::domain::app_paths::app_ui_state_path;

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
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiAppearanceState {
    #[serde(default = "default_locale")]
    pub(crate) locale: String,
    #[serde(default = "default_accent_preset_id")]
    pub(crate) accent_preset_id: String,
    #[serde(default)]
    pub(crate) recent_game_directories: Vec<String>,
    #[serde(default)]
    pub(crate) player_appearance: AppUiPlayerAppearanceState,
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
    pub(crate) layouts: BTreeMap<String, Value>,
    #[serde(default = "default_workspace_view_mode")]
    pub(crate) workspace_view_mode: String,
    #[serde(default)]
    pub(crate) cp_maker: AppUiCpMakerWorkspaceState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiCpMakerWorkspaceState {
    #[serde(default)]
    pub(crate) active_generated_draft_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiLauncherState {
    #[serde(default)]
    pub(crate) discover_toolbar: AppUiDiscoverToolbarState,
    #[serde(default)]
    pub(crate) force_offline: bool,
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
    pub(crate) accent_preset_id: Option<String>,
    #[serde(default)]
    pub(crate) recent_game_directories: Option<Vec<String>>,
    #[serde(default)]
    pub(crate) player_appearance: Option<AppUiPlayerAppearanceState>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiWorkspaceStatePatch {
    #[serde(default)]
    pub(crate) layouts: Option<BTreeMap<String, Option<Value>>>,
    #[serde(default)]
    pub(crate) workspace_view_mode: Option<String>,
    #[serde(default)]
    pub(crate) cp_maker: Option<AppUiCpMakerWorkspaceStatePatch>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiCpMakerWorkspaceStatePatch {
    #[serde(default)]
    pub(crate) active_generated_draft_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUiLauncherStatePatch {
    #[serde(default)]
    pub(crate) discover_toolbar: Option<AppUiDiscoverToolbarState>,
    #[serde(default)]
    pub(crate) force_offline: Option<bool>,
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

fn default_locale() -> String {
    "zh-CN".to_string()
}

fn default_accent_preset_id() -> String {
    "indigo".to_string()
}

fn default_workspace_view_mode() -> String {
    "edit".to_string()
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
        }
    }
}

impl Default for AppUiAppearanceState {
    fn default() -> Self {
        Self {
            locale: default_locale(),
            accent_preset_id: default_accent_preset_id(),
            recent_game_directories: Vec::new(),
            player_appearance: AppUiPlayerAppearanceState::default(),
        }
    }
}

impl Default for AppUiWorkspaceState {
    fn default() -> Self {
        Self {
            layouts: BTreeMap::new(),
            workspace_view_mode: default_workspace_view_mode(),
            cp_maker: AppUiCpMakerWorkspaceState::default(),
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

fn normalize_accent_preset_id(value: &str) -> String {
    match value.trim() {
        "indigo" | "blue" | "cyan" | "emerald" | "amber" | "rose" => value.trim().to_string(),
        _ => default_accent_preset_id(),
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

fn normalize_workspace_layouts(layouts: BTreeMap<String, Value>) -> BTreeMap<String, Value> {
    layouts
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

fn normalize_workspace_view_mode(value: &str) -> String {
    match value.trim() {
        "preview" | "project" => value.trim().to_string(),
        _ => default_workspace_view_mode(),
    }
}

fn normalize_cp_maker_workspace_state(
    state: AppUiCpMakerWorkspaceState,
) -> AppUiCpMakerWorkspaceState {
    AppUiCpMakerWorkspaceState {
        active_generated_draft_key: state
            .active_generated_draft_key
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
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
        },
        appearance: AppUiAppearanceState {
            locale: normalize_locale(&state.appearance.locale),
            accent_preset_id: normalize_accent_preset_id(&state.appearance.accent_preset_id),
            recent_game_directories: normalize_string_vec(state.appearance.recent_game_directories),
            player_appearance: normalize_player_appearance(state.appearance.player_appearance),
        },
        workspace: AppUiWorkspaceState {
            layouts: normalize_workspace_layouts(state.workspace.layouts),
            workspace_view_mode: normalize_workspace_view_mode(
                &state.workspace.workspace_view_mode,
            ),
            cp_maker: normalize_cp_maker_workspace_state(
                state.workspace.cp_maker,
            ),
        },
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
        },
    }
}

fn save_app_ui_state_at_path(path: &Path, state: &AppUiState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create app UI state directory {}: {error}",
                parent.display()
            )
        })?;
    }
    let normalized = normalize_app_ui_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize app UI state JSON: {error}"))?;
    fs::write(path, format!("{json}\n"))
        .map_err(|error| format!("Failed to write app UI state {}: {error}", path.display()))
}

pub(crate) fn load_or_create_app_ui_state_at_path(path: &Path) -> Result<AppUiState, String> {
    if path.is_file() {
        let content = fs::read_to_string(path)
            .map_err(|error| format!("Failed to read app UI state {}: {error}", path.display()))?;
        let parsed = serde_json::from_str::<AppUiState>(&content).unwrap_or_default();
        let normalized = normalize_app_ui_state(parsed);
        save_app_ui_state_at_path(path, &normalized)?;
        return Ok(normalized);
    }

    let default_state = AppUiState::default();
    save_app_ui_state_at_path(path, &default_state)?;
    Ok(default_state)
}

pub(crate) fn patch_app_ui_state_at_path(
    path: &Path,
    patch: AppUiStatePatch,
) -> Result<AppUiState, String> {
    let mut state = load_or_create_app_ui_state_at_path(path)?;
    if let Some(shell) = patch.shell {
        state.shell = AppUiShellState {
            app_mode: normalize_app_mode(&shell.app_mode),
            launcher_page: normalize_launcher_page(&shell.launcher_page),
            debug_enabled: shell.debug_enabled,
            notification_sound_enabled: shell.notification_sound_enabled,
        };
    }
    if let Some(appearance) = patch.appearance {
        if let Some(locale) = appearance.locale {
            state.appearance.locale = normalize_locale(&locale);
        }
        if let Some(accent_preset_id) = appearance.accent_preset_id {
            state.appearance.accent_preset_id = normalize_accent_preset_id(&accent_preset_id);
        }
        if let Some(recent_game_directories) = appearance.recent_game_directories {
            state.appearance.recent_game_directories =
                normalize_string_vec(recent_game_directories);
        }
        if let Some(player_appearance) = appearance.player_appearance {
            state.appearance.player_appearance = normalize_player_appearance(player_appearance);
        }
    }
    if let Some(workspace) = patch.workspace {
        if let Some(layouts) = workspace.layouts {
            for (key, value) in layouts {
                let trimmed_key = key.trim().to_string();
                if trimmed_key.is_empty() {
                    continue;
                }
                match value {
                    Some(layout) if layout.is_object() => {
                        state.workspace.layouts.insert(trimmed_key, layout);
                    }
                    Some(_) => {}
                    None => {
                        state.workspace.layouts.remove(&trimmed_key);
                    }
                }
            }
        }
        if let Some(workspace_view_mode) = workspace.workspace_view_mode {
            state.workspace.workspace_view_mode =
                normalize_workspace_view_mode(&workspace_view_mode);
        }
        if let Some(cp_maker) = workspace.cp_maker {
            state.workspace.cp_maker = normalize_cp_maker_workspace_state(
                AppUiCpMakerWorkspaceState {
                    active_generated_draft_key: cp_maker.active_generated_draft_key,
                },
            );
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
    }
    let normalized = normalize_app_ui_state(state);
    save_app_ui_state_at_path(path, &normalized)?;
    Ok(normalized)
}

pub(crate) fn load_app_ui_state() -> Result<AppUiState, String> {
    let path = app_ui_state_path()?;
    load_or_create_app_ui_state_at_path(&path)
}

pub(crate) fn patch_app_ui_state(request: AppUiStatePatch) -> Result<AppUiState, String> {
    let path = app_ui_state_path()?;
    patch_app_ui_state_at_path(&path, request)
}

#[cfg(test)]
#[path = "../../tests/ui_state_tests.rs"]
mod tests;
