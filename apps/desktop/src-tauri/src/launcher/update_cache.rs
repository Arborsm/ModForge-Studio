use super::types::{LauncherUpdateSummary, LauncherUpdatesResult};
use crate::pathing::{clean_input_path, normalize_path};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherUpdatesCacheState {
    #[serde(default)]
    entries: BTreeMap<String, LauncherUpdatesCacheEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherUpdatesCacheEntry {
    mods_path: String,
    checked_at_ms: u128,
    expires_at_ms: u128,
    updates: Vec<LauncherUpdateSummary>,
}

fn normalize_launcher_updates_cache_key(mods_path: &str) -> Option<String> {
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

    serde_json::from_str::<LauncherUpdatesCacheState>(&content).or_else(|_| Ok(LauncherUpdatesCacheState::default()))
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
    state.entries.retain(|_, entry| entry.expires_at_ms > now_ms);
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
        updates: entry.updates,
    }))
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
            updates: result.updates.clone(),
        },
    );
    save_launcher_updates_cache_state(cache_path, &state)
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
        Some(cache_key) => state.entries.remove(&cache_key).is_some(),
        None => {
            let had_entries = !state.entries.is_empty();
            state.entries.clear();
            had_entries
        }
    };

    if changed {
        save_launcher_updates_cache_state(cache_path, &state)?;
    }

    Ok(())
}
