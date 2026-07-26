use super::paths::launcher_image_failures_path;
use super::types::{
    LauncherImageFailureEntry, LauncherImageFailuresState, RecordLauncherImageFailureRequest,
};
use crate::AppHandle;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
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
            LogEvent::new("launcher.lock.poisoned")
                .field("resource", "image-failures-file")
                .emit_error(targets::LAUNCHER);
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
) -> anyhow::Result<LauncherImageFailuresState> {
    if path.is_file() {
        let content = read_text_file(path).with_context(|| {
            format!(
                "Failed to read launcher image failures {}",
                normalize_path(path)
            )
        })?;
        let parsed: LauncherImageFailuresState =
            serde_json::from_str(&content).with_context(|| {
                format!(
                    "Launcher image failures {} is invalid JSON",
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
) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create launcher image failures directory {}",
                normalize_path(parent)
            )
        })?;
    }

    let normalized = normalize_state(state.clone());
    let json = serde_json::to_string_pretty(&normalized)
        .with_context(|| format!("Failed to serialize launcher image failures JSON"))?;
    fs::write(path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write launcher image failures {}",
            normalize_path(path)
        )
    })?;
    Ok(())
}

pub(crate) fn load_or_create_image_failures_at_path(
    path: &Path,
) -> anyhow::Result<LauncherImageFailuresState> {
    let _guard = lock_launcher_image_failures_file();
    load_or_create_image_failures_at_path_unlocked(path)
}

fn normalize_mod_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn should_skip_launcher_image_retry(error: &str) -> bool {
    let trimmed = error.trim();
    trimmed.starts_with("Nexus mod unavailable:")
        || (trimmed.starts_with("Nexus mod ") && trimmed.ends_with(" is unavailable."))
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

pub(crate) fn clear_launcher_image_failure_entries_at_path(path: &Path) -> anyhow::Result<()> {
    let _guard = lock_launcher_image_failures_file();
    if path.exists() {
        fs::remove_file(path).with_context(|| {
            format!(
                "Failed to clear launcher image failures {}",
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
) -> anyhow::Result<LauncherImageFailuresState> {
    let mod_key = mod_key.trim();
    if mod_key.is_empty() {
        bail!("modKey is required.");
    }
    let _guard = lock_launcher_image_failures_file();
    let mut state = load_or_create_image_failures_at_path_unlocked(path)?;
    let normalized_key = normalize_mod_key(mod_key);
    let next_failure_count = state
        .entries
        .iter()
        .find(|entry| normalize_mod_key(&entry.mod_key) == normalized_key)
        .map(|entry| entry.failure_count)
        .unwrap_or(0)
        .saturating_add(1);
    state
        .entries
        .retain(|entry| normalize_mod_key(&entry.mod_key) != normalized_key);

    let trimmed_error = error.trim().to_string();
    let skip_retry = should_skip_launcher_image_retry(&trimmed_error);
    let failure_count = if skip_retry {
        next_failure_count.max(LAUNCHER_IMAGE_FAILURE_THRESHOLD)
    } else {
        next_failure_count
    };
    let blocked = failure_count >= LAUNCHER_IMAGE_FAILURE_THRESHOLD;
    LogEvent::new("launcher.image.cover.failure")
        .field("modKey", mod_key)
        .field("failureCount", failure_count)
        .field("threshold", LAUNCHER_IMAGE_FAILURE_THRESHOLD)
        .flag("blocked", blocked)
        .flag("skipRetry", skip_retry)
        .error(&trimmed_error)
        .emit_debug(targets::LAUNCHER);
    if blocked {
        LogEvent::new("launcher.image.cover.blocked")
            .field("modKey", mod_key)
            .field("failureCount", failure_count)
            .field("threshold", LAUNCHER_IMAGE_FAILURE_THRESHOLD)
            .flag("skipRetry", skip_retry)
            .emit_debug(targets::LAUNCHER);
    }

    state.entries.push(LauncherImageFailureEntry {
        mod_key: mod_key.to_string(),
        failure_count,
        blocked,
        last_error: trimmed_error,
        last_failed_at_ms: crate::domain::launcher::paths::current_timestamp_ms(),
    });

    let normalized = normalize_state(state);
    save_image_failures_at_path_unlocked(path, &normalized)?;
    Ok(normalized)
}

pub(crate) fn record_launcher_image_failure(
    mod_key: &str,
    error: &str,
) -> anyhow::Result<LauncherImageFailuresState> {
    let path = launcher_image_failures_path()?;
    record_launcher_image_failure_at_path(&path, mod_key, error)
}

pub(crate) fn clear_launcher_image_failure_for_mod_at_path(
    path: &Path,
    mod_key: &str,
) -> anyhow::Result<LauncherImageFailuresState> {
    let mod_key = mod_key.trim();
    if mod_key.is_empty() {
        bail!("modKey is required.");
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

pub(crate) fn is_launcher_image_blocked(state: &LauncherImageFailuresState, mod_key: &str) -> bool {
    get_launcher_image_failure_entry(state, mod_key).is_some_and(|entry| entry.blocked)
}

pub fn load_launcher_image_failures(_app: AppHandle) -> anyhow::Result<LauncherImageFailuresState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_image_failures",
        (|| {
            let path = launcher_image_failures_path()?;
            load_or_create_image_failures_at_path(&path)
        })(),
    )
}

pub fn record_launcher_image_failure_command(
    _app: AppHandle,
    request: RecordLauncherImageFailureRequest,
) -> anyhow::Result<LauncherImageFailuresState> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "record_launcher_image_failure",
        (|| record_launcher_image_failure(&request.mod_key, &request.error))(),
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

    #[test]
    fn launcher_image_failures_block_unavailable_nexus_mods_immediately() {
        let root = create_temp_dir("launcher-image-failures-unavailable");
        let failures_path = root.join("launcher").join("image-failures.json");

        let state = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.HiddenCover",
            "Nexus mod unavailable: mod_id=Some(23651), status=Some(\"hidden\"), available=Some(false)",
        )
        .expect("record unavailable mod failure");
        let entry = get_launcher_image_failure_entry(&state, "ModForge.HiddenCover")
            .expect("unavailable mod failure entry");

        assert_eq!(entry.failure_count, LAUNCHER_IMAGE_FAILURE_THRESHOLD);
        assert!(entry.blocked);
        assert_eq!(
            entry.last_error,
            "Nexus mod unavailable: mod_id=Some(23651), status=Some(\"hidden\"), available=Some(false)"
        );

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn launcher_image_failures_do_not_skip_retries_for_other_deserialization_errors() {
        let root = create_temp_dir("launcher-image-failures-transient-deserialize");
        let failures_path = root.join("launcher").join("image-failures.json");

        let state = record_launcher_image_failure_at_path(
            &failures_path,
            "ModForge.OtherBadResponse",
            "API error: HTTP 200 — Failed to deserialize response: missing field `username`",
        )
        .expect("record non-cover deserialization failure");
        let entry = get_launcher_image_failure_entry(&state, "ModForge.OtherBadResponse")
            .expect("failure entry");

        assert_eq!(entry.failure_count, 1);
        assert!(!entry.blocked);

        fs::remove_dir_all(root).expect("cleanup");
    }
}
