pub mod types;

pub use types::DefaultSaveSlotSummary;

use anyhow::Context;
use std::fs;

use crate::infrastructure::fs::pathing::{
    default_save_root_path, normalize_path, resolve_save_file_path,
};

pub(crate) fn scan_default_save_slots() -> anyhow::Result<Vec<DefaultSaveSlotSummary>> {
    let save_root = default_save_root_path().context("APPDATA is not available on this system.")?;
    if !save_root.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&save_root)
        .with_context(|| format!("Failed to read {}", normalize_path(&save_root)))?;

    let mut slots = Vec::new();
    for entry in entries {
        let entry = entry.with_context(|| format!("Failed to inspect save slot entry"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(file_path) = resolve_save_file_path(&path) else {
            continue;
        };

        let metadata = fs::metadata(&file_path).with_context(|| {
            format!(
                "Failed to read save file metadata {}",
                normalize_path(&file_path)
            )
        })?;
        let modified_time_ms = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_millis())
            .unwrap_or(0);
        let slot_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Unnamed Save")
            .to_string();

        slots.push(DefaultSaveSlotSummary {
            slot_name,
            folder_path: normalize_path(&path),
            file_path: normalize_path(&file_path),
            modified_time_ms,
        });
    }

    slots.sort_by(|left, right| {
        right
            .modified_time_ms
            .cmp(&left.modified_time_ms)
            .then_with(|| left.slot_name.cmp(&right.slot_name))
    });
    Ok(slots)
}
