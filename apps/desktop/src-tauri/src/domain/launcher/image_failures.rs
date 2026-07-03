use super::paths::launcher_image_failures_path;
use super::types::{LauncherImageFailureEntry, LauncherImageFailuresState};
use crate::AppHandle;
use crate::infrastructure::fs::pathing::normalize_path;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, OnceLock};

static LAUNCHER_IMAGE_FAILURES_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
const LAUNCHER_IMAGE_FAILURE_THRESHOLD: u32 = 3;

fn lock_launcher_image_failures_file() -> MutexGuard<'static, ()> {
    match LAUNCHER_IMAGE_FAILURES_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::error!(target: "Launcher", "Launcher image failures file lock was poisoned");
            poisoned.into_inner()
        }
    }
}

fn normalize_state(state: LauncherImageFailuresState) -> LauncherImageFailuresState {
    let mut seen = BTreeMap::new();
    let mut entries = Vec::new();

    for entry in state.entries {
        let mod_key = entry.mod_key.trim().to_string();
        if mod_key.is_empty() {
            continue;
        }

        let normalized_key = mod_key.to_ascii_lowercase();
        if seen.contains_key(&normalized_key) {
            continue;
        }

        seen.insert(normalized_key, ());
        entries.push(LauncherImageFailureEntry {
            mod_key,
            failure_count: entry.failure_count,
            blocked: entry.blocked,
            last_error: entry.last_error.trim().to_string(),
            last_failed_at_ms: entry.last_failed_at_ms,
        });
    }

    LauncherImageFailuresState { entries }
}

fn load_or_create_image_failures_at_path_unlocked(
    path: &Path,
) -> Result<LauncherImageFailuresState, String> {
    if path.is_file() {
        let content = fs::read_to_string(path).map_err(|error| {
            format!(
                "Failed to read launcher image failures {}: {error}",
                normalize_path(path)
            )
        })?;
        let parsed: LauncherImageFailuresState =
            serde_json::from_str(&content).map_err(|error| {
                format!(
                    "Launcher image failures {} is invalid JSON: {error}",
                    normalize_path(path)
                )
            })?;
        return Ok(normalize_state(parsed));
    }

    let defaults = LauncherImageFailuresState {
        entries: Vec::new(),
    };
    save_image_failures_at_path_unlocked(path, &defaults)?;
    Ok(defaults)
}

fn save_image_failures_at_path_unlocked(
    path: &Path,
    state: &LauncherImageFailuresState,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Failed to create launcher image failures directory {}: {error}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize launcher image failures JSON: {error}"))?;
    fs::write(path, format!("{json}\n")).map_err(|error| {
        format!(
            "Failed to write launcher image failures {}: {error}",
            normalize_path(path)
        )
    })?;
    Ok(())
}

pub(crate) fn load_or_create_image_failures_at_path(
    path: &Path,
) -> Result<LauncherImageFailuresState, String> {
    let _guard = lock_launcher_image_failures_file();
    load_or_create_image_failures_at_path_unlocked(path)
}

pub(crate) fn load_or_create_launcher_image_failures() -> Result<LauncherImageFailuresState, String>
{
    let path = launcher_image_failures_path()?;
    load_or_create_image_failures_at_path(&path)
}

fn normalize_mod_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(crate) fn get_launcher_image_failure_entry(
    state: &LauncherImageFailuresState,
    mod_key: &str,
) -> Option<LauncherImageFailureEntry> {
    let normalized = normalize_mod_key(mod_key);
    state
        .entries
        .iter()
        .find(|entry| normalize_mod_key(&entry.mod_key) == normalized)
        .cloned()
}

pub(crate) fn clear_launcher_image_failure_entries_at_path(path: &Path) -> Result<(), String> {
    let _guard = lock_launcher_image_failures_file();
    if path.exists() {
        fs::remove_file(path).map_err(|error| {
            format!(
                "Failed to clear launcher image failures {}: {error}",
                normalize_path(path)
            )
        })?;
    }
    Ok(())
}

pub(crate) fn record_launcher_image_failure_at_path(
    path: &Path,
    mod_key: &str,
    error: &str,
) -> Result<LauncherImageFailuresState, String> {
    let mod_key = mod_key.trim();
    if mod_key.is_empty() {
        return Err("modKey is required.".to_string());
    }
    let _guard = lock_launcher_image_failures_file();
    let mut state = load_or_create_image_failures_at_path_unlocked(path)?;
    let normalized_key = normalize_mod_key(mod_key);
    let failure_count = state
        .entries
        .iter()
        .find(|entry| normalize_mod_key(&entry.mod_key) == normalized_key)
        .map(|entry| entry.failure_count)
        .unwrap_or(0)
        .saturating_add(1);
    state
        .entries
        .retain(|entry| normalize_mod_key(&entry.mod_key) != normalized_key);

    state.entries.push(LauncherImageFailureEntry {
        mod_key: mod_key.to_string(),
        failure_count,
        blocked: failure_count >= LAUNCHER_IMAGE_FAILURE_THRESHOLD,
        last_error: error.trim().to_string(),
        last_failed_at_ms: crate::domain::launcher::paths::current_timestamp_ms(),
    });

    let normalized = normalize_state(state);
    save_image_failures_at_path_unlocked(path, &normalized)?;
    Ok(normalized)
}

pub(crate) fn record_launcher_image_failure(
    mod_key: &str,
    error: &str,
) -> Result<LauncherImageFailuresState, String> {
    let path = launcher_image_failures_path()?;
    record_launcher_image_failure_at_path(&path, mod_key, error)
}

pub(crate) fn clear_launcher_image_failure_for_mod_at_path(
    path: &Path,
    mod_key: &str,
) -> Result<LauncherImageFailuresState, String> {
    let mod_key = mod_key.trim();
    if mod_key.is_empty() {
        return Err("modKey is required.".to_string());
    }
    let _guard = lock_launcher_image_failures_file();
    let mut state = load_or_create_image_failures_at_path_unlocked(path)?;
    let normalized_key = normalize_mod_key(mod_key);
    state
        .entries
        .retain(|entry| normalize_mod_key(&entry.mod_key) != normalized_key);
    let normalized = normalize_state(state);
    save_image_failures_at_path_unlocked(path, &normalized)?;
    Ok(normalized)
}

pub(crate) fn clear_launcher_image_failure_for_mod(
    mod_key: &str,
) -> Result<LauncherImageFailuresState, String> {
    let path = launcher_image_failures_path()?;
    clear_launcher_image_failure_for_mod_at_path(&path, mod_key)
}

pub(crate) fn is_launcher_image_blocked(state: &LauncherImageFailuresState, mod_key: &str) -> bool {
    get_launcher_image_failure_entry(state, mod_key).is_some_and(|entry| entry.blocked)
}

pub fn load_launcher_image_failures(_app: AppHandle) -> Result<LauncherImageFailuresState, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_image_failures",
        (|| {
            let path = launcher_image_failures_path()?;
            load_or_create_image_failures_at_path(&path)
        })(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::create_temp_dir;
    use std::fs;

    #[test]
    fn launcher_image_failures_track_blocked_entries_and_reset_on_clear() {
        let root = create_temp_dir("launcher-image-failures");
        let failures_path = root.join("launcher").join("image-failures.json");

        let initial = load_or_create_image_failures_at_path(&failures_path)
            .expect("create launcher image failures");
        assert!(initial.entries.is_empty());

        let first = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 1",
        )
        .expect("record first failure");
        let entry = get_launcher_image_failure_entry(&first, "ModForge.NPCAdventures")
            .expect("failure entry");
        assert_eq!(entry.failure_count, 1);
        assert!(!entry.blocked);

        let second = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 2",
        )
        .expect("record second failure");
        let entry = get_launcher_image_failure_entry(&second, "ModForge.NPCAdventures")
            .expect("failure entry");
        assert_eq!(entry.failure_count, 2);
        assert!(!entry.blocked);

        let blocked = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.NPCAdventures",
            "boom 3",
        )
        .expect("record blocked failure");
        let entry = get_launcher_image_failure_entry(&blocked, "ModForge.NPCAdventures")
            .expect("failure entry");
        assert_eq!(entry.failure_count, 3);
        assert!(entry.blocked);
        assert!(is_launcher_image_blocked(
            &blocked,
            "ModForge.NPCAdventures"
        ));

        let cleared =
            clear_launcher_image_failure_for_mod_at_path(&failures_path, "ModForge.NPCAdventures")
                .expect("clear mod failures");
        assert!(get_launcher_image_failure_entry(&cleared, "ModForge.NPCAdventures").is_none());

        clear_launcher_image_failure_entries_at_path(&failures_path).expect("clear all failures");
        assert!(!failures_path.exists());

        fs::remove_dir_all(root).expect("cleanup");
    }
}
