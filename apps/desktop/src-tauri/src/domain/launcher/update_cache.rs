use super::types::{LauncherUpdateSummary, LauncherUpdatesResult};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherUpdatesCacheState {
    #[serde(default)]
    entries: BTreeMap<String, LauncherUpdatesCacheEntry>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    in_progress: BTreeMap<String, LauncherUpdatesCheckInProgressEntry>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    auto_failures: BTreeMap<String, BTreeMap<i64, LauncherUpdateAutoFailureEntry>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherUpdatesCacheEntry {
    mods_path: String,
    checked_at_ms: u128,
    expires_at_ms: u128,
    #[serde(default = "default_launcher_updates_result_is_complete")]
    is_complete: bool,
    updates: Vec<LauncherUpdateSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherUpdatesCheckInProgressEntry {
    mods_path: String,
    started_at_ms: u128,
    #[serde(default = "default_launcher_updates_check_active_count")]
    active_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LauncherUpdateAutoFailureEntry {
    pub(crate) mod_id: i64,
    #[serde(default = "default_launcher_update_auto_failure_count")]
    pub(crate) failure_count: u32,
    pub(crate) last_failed_at_ms: u128,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LauncherUpdatesCacheEntryState {
    Missing,
    Fresh,
    Expired,
}

impl LauncherUpdatesCacheEntryState {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::Missing => "missing",
            Self::Fresh => "fresh",
            Self::Expired => "expired",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LauncherUpdatesCacheInspection {
    pub(crate) cache_key: Option<String>,
    pub(crate) entry_state: LauncherUpdatesCacheEntryState,
    pub(crate) checked_at_ms: Option<u128>,
    pub(crate) expires_at_ms: Option<u128>,
    pub(crate) is_complete: Option<bool>,
    pub(crate) ttl_remaining_ms: Option<u128>,
    pub(crate) expired_by_ms: Option<u128>,
    pub(crate) in_progress_active_count: u32,
    pub(crate) in_progress_started_at_ms: Option<u128>,
}

fn default_launcher_updates_check_active_count() -> u32 {
    1
}

fn default_launcher_update_auto_failure_count() -> u32 {
    1
}

fn default_launcher_updates_result_is_complete() -> bool {
    true
}

pub(crate) fn normalize_launcher_updates_cache_key(mods_path: &str) -> Option<String> {
    let trimmed = mods_path.trim();
    if trimmed.is_empty() {
        return None;
    }

    let normalized = normalize_path(&clean_input_path(trimmed))
        .replace('/', "\\")
        .to_ascii_lowercase();
    if normalized.trim().is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn load_launcher_updates_cache_state(
    cache_path: &Path,
) -> Result<LauncherUpdatesCacheState, String> {
    if !cache_path.is_file() {
        return Ok(LauncherUpdatesCacheState::default());
    }

    let content = fs::read_to_string(cache_path).map_err(|error| {
        format!(
            "Failed to read launcher updates cache {}: {error}",
            normalize_path(cache_path)
        )
    })?;

    serde_json::from_str::<LauncherUpdatesCacheState>(&content)
        .or_else(|_| Ok(LauncherUpdatesCacheState::default()))
}

fn save_launcher_updates_cache_state(
    cache_path: &Path,
    state: &LauncherUpdatesCacheState,
) -> Result<(), String> {
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher updates cache directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let json = serde_json::to_string_pretty(state)
        .map_err(|error| format!("Failed to serialize launcher updates cache JSON: {error}"))?;
    fs::write(cache_path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher updates cache {}: {error}",
            normalize_path(cache_path)
        )
    })?;
    Ok(())
}

fn prune_expired_entries(state: &mut LauncherUpdatesCacheState, now_ms: u128) -> bool {
    let count_before = state.entries.len();
    state
        .entries
        .retain(|_, entry| entry.expires_at_ms > now_ms);
    state.entries.len() != count_before
}

pub(crate) fn load_cached_launcher_updates_at_path(
    cache_path: &Path,
    mods_path: &str,
    now_ms: u128,
) -> Result<Option<LauncherUpdatesResult>, String> {
    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Ok(None);
    };

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let pruned = prune_expired_entries(&mut state, now_ms);
    let entry = state.entries.get(&cache_key).cloned();
    if pruned {
        save_launcher_updates_cache_state(cache_path, &state)?;
    }

    Ok(entry.map(|entry| LauncherUpdatesResult {
        mods_path: entry.mods_path,
        checked_at_ms: entry.checked_at_ms,
        is_complete: entry.is_complete,
        updates: entry.updates,
    }))
}

pub(crate) fn inspect_launcher_updates_cache_at_path(
    cache_path: &Path,
    mods_path: &str,
    now_ms: u128,
) -> Result<LauncherUpdatesCacheInspection, String> {
    let cache_key = normalize_launcher_updates_cache_key(mods_path);
    let Some(cache_key_value) = cache_key.clone() else {
        return Ok(LauncherUpdatesCacheInspection {
            cache_key,
            entry_state: LauncherUpdatesCacheEntryState::Missing,
            checked_at_ms: None,
            expires_at_ms: None,
            is_complete: None,
            ttl_remaining_ms: None,
            expired_by_ms: None,
            in_progress_active_count: 0,
            in_progress_started_at_ms: None,
        });
    };

    let state = load_launcher_updates_cache_state(cache_path)?;
    let entry = state.entries.get(&cache_key_value);
    let in_progress = state.in_progress.get(&cache_key_value);

    let (entry_state, checked_at_ms, expires_at_ms, is_complete, ttl_remaining_ms, expired_by_ms) =
        match entry {
            Some(entry) if entry.expires_at_ms > now_ms => (
                LauncherUpdatesCacheEntryState::Fresh,
                Some(entry.checked_at_ms),
                Some(entry.expires_at_ms),
                Some(entry.is_complete),
                Some(entry.expires_at_ms.saturating_sub(now_ms)),
                None,
            ),
            Some(entry) => (
                LauncherUpdatesCacheEntryState::Expired,
                Some(entry.checked_at_ms),
                Some(entry.expires_at_ms),
                Some(entry.is_complete),
                None,
                Some(now_ms.saturating_sub(entry.expires_at_ms)),
            ),
            None => (
                LauncherUpdatesCacheEntryState::Missing,
                None,
                None,
                None,
                None,
                None,
            ),
        };

    Ok(LauncherUpdatesCacheInspection {
        cache_key,
        entry_state,
        checked_at_ms,
        expires_at_ms,
        is_complete,
        ttl_remaining_ms,
        expired_by_ms,
        in_progress_active_count: in_progress.map(|entry| entry.active_count).unwrap_or(0),
        in_progress_started_at_ms: in_progress.map(|entry| entry.started_at_ms),
    })
}

pub(crate) fn save_launcher_updates_cache_at_path(
    cache_path: &Path,
    result: &LauncherUpdatesResult,
    now_ms: u128,
    ttl_ms: u128,
) -> Result<(), String> {
    let Some(cache_key) = normalize_launcher_updates_cache_key(&result.mods_path) else {
        return Ok(());
    };

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    prune_expired_entries(&mut state, now_ms);
    state.entries.insert(
        cache_key,
        LauncherUpdatesCacheEntry {
            mods_path: normalize_path(&clean_input_path(&result.mods_path)),
            checked_at_ms: result.checked_at_ms,
            expires_at_ms: now_ms.saturating_add(ttl_ms),
            is_complete: result.is_complete,
            updates: result.updates.clone(),
        },
    );
    save_launcher_updates_cache_state(cache_path, &state)
}

#[cfg(test)]
pub(crate) fn load_launcher_update_auto_failures_at_path(
    cache_path: &Path,
    mods_path: &str,
    mod_id: i64,
) -> Result<Option<LauncherUpdateAutoFailureEntry>, String> {
    if mod_id <= 0 {
        return Ok(None);
    }

    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Ok(None);
    };

    let state = load_launcher_updates_cache_state(cache_path)?;
    Ok(state
        .auto_failures
        .get(&cache_key)
        .and_then(|entries| entries.get(&mod_id))
        .cloned())
}

pub(crate) fn load_suppressed_launcher_update_mod_ids_at_path(
    cache_path: &Path,
    mods_path: &str,
    threshold: u32,
) -> Result<HashSet<i64>, String> {
    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Ok(HashSet::new());
    };

    let state = load_launcher_updates_cache_state(cache_path)?;
    Ok(state
        .auto_failures
        .get(&cache_key)
        .into_iter()
        .flat_map(|entries| entries.iter())
        .filter_map(|(mod_id, entry)| {
            (entry.failure_count >= threshold && *mod_id > 0).then_some(*mod_id)
        })
        .collect())
}

pub(crate) fn record_launcher_update_auto_failure_at_path(
    cache_path: &Path,
    mods_path: &str,
    mod_id: i64,
    failed_at_ms: u128,
    error: Option<&str>,
) -> Result<LauncherUpdateAutoFailureEntry, String> {
    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Err("modsPath is required.".to_string());
    };
    if mod_id <= 0 {
        return Err("modId must be greater than 0.".to_string());
    }

    let normalized_error = error
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let entry = state
        .auto_failures
        .entry(cache_key)
        .or_default()
        .entry(mod_id)
        .and_modify(|entry| {
            entry.failure_count = entry.failure_count.saturating_add(1);
            entry.last_failed_at_ms = entry.last_failed_at_ms.max(failed_at_ms);
            entry.last_error = normalized_error.clone();
        })
        .or_insert(LauncherUpdateAutoFailureEntry {
            mod_id,
            failure_count: 1,
            last_failed_at_ms: failed_at_ms,
            last_error: normalized_error,
        })
        .clone();

    save_launcher_updates_cache_state(cache_path, &state)?;
    Ok(entry)
}

pub(crate) fn clear_launcher_update_auto_failures_at_path(
    cache_path: &Path,
    mods_path: &str,
    mod_ids: &[i64],
) -> Result<(), String> {
    if mod_ids.is_empty() || !cache_path.is_file() {
        return Ok(());
    }

    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Ok(());
    };

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let mut changed = false;
    let mut should_remove_cache_key = false;
    if let Some(entries) = state.auto_failures.get_mut(&cache_key) {
        for mod_id in mod_ids.iter().copied().filter(|value| *value > 0) {
            changed |= entries.remove(&mod_id).is_some();
        }
        should_remove_cache_key = entries.is_empty();
    }

    if should_remove_cache_key {
        state.auto_failures.remove(&cache_key);
    }

    if changed {
        save_launcher_updates_cache_state(cache_path, &state)?;
    }

    Ok(())
}

pub(crate) fn mark_launcher_updates_check_in_progress_at_path(
    cache_path: &Path,
    mods_path: &str,
    started_at_ms: u128,
) -> Result<(), String> {
    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return Ok(());
    };

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let normalized_mods_path = normalize_path(&clean_input_path(mods_path));
    state
        .in_progress
        .entry(cache_key)
        .and_modify(|entry| {
            entry.mods_path = normalized_mods_path.clone();
            entry.started_at_ms = entry.started_at_ms.max(started_at_ms);
            entry.active_count = entry.active_count.saturating_add(1);
        })
        .or_insert(LauncherUpdatesCheckInProgressEntry {
            mods_path: normalized_mods_path,
            started_at_ms,
            active_count: 1,
        });
    save_launcher_updates_cache_state(cache_path, &state)
}

pub(crate) fn clear_launcher_updates_check_in_progress_at_path(
    cache_path: &Path,
    mods_path: Option<&str>,
) -> Result<(), String> {
    if !cache_path.is_file() {
        return Ok(());
    }

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let changed = match mods_path.and_then(normalize_launcher_updates_cache_key) {
        Some(cache_key) => {
            let mut should_remove = false;
            let mut changed = false;
            if let Some(entry) = state.in_progress.get_mut(&cache_key) {
                changed = true;
                if entry.active_count > 1 {
                    entry.active_count -= 1;
                } else {
                    should_remove = true;
                }
            }
            if should_remove {
                state.in_progress.remove(&cache_key);
            }
            changed
        }
        None => {
            let had_entries = !state.in_progress.is_empty();
            state.in_progress.clear();
            had_entries
        }
    };

    if changed {
        save_launcher_updates_cache_state(cache_path, &state)?;
    }

    Ok(())
}

pub(crate) fn invalidate_launcher_updates_cache_at_path(
    cache_path: &Path,
    mods_path: Option<&str>,
) -> Result<(), String> {
    if !cache_path.is_file() {
        return Ok(());
    }

    let mut state = load_launcher_updates_cache_state(cache_path)?;
    let changed = match mods_path.and_then(normalize_launcher_updates_cache_key) {
        Some(cache_key) => {
            let removed_entry = state.entries.remove(&cache_key).is_some();
            let removed_in_progress = state.in_progress.remove(&cache_key).is_some();
            let removed_auto_failures = state.auto_failures.remove(&cache_key).is_some();
            removed_entry || removed_in_progress || removed_auto_failures
        }
        None => {
            let had_entries = !state.entries.is_empty()
                || !state.in_progress.is_empty()
                || !state.auto_failures.is_empty();
            state.entries.clear();
            state.in_progress.clear();
            state.auto_failures.clear();
            had_entries
        }
    };

    if changed {
        save_launcher_updates_cache_state(cache_path, &state)?;
    }

    Ok(())
}
