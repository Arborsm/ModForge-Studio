use crate::support::logging::{LogEvent, targets};
use std::fs;

const SHMEM_DIR_NAME: &str = "shared_memory-rs";
const SHMEM_FILE_PREFIX: &str = "shmem_";

pub(super) fn cleanup_tauri_shared_memory_leaks() {
    if let Err(error) = cleanup_inner() {
        LogEvent::new("cleanup.sharedMemory.failed")
            .error(error)
            .emit_warn(targets::CLEANUP);
    }
}

fn cleanup_inner() -> Result<(), std::io::Error> {
    let shmem_dir = std::env::temp_dir().join(SHMEM_DIR_NAME);

    let entries = match fs::read_dir(&shmem_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            LogEvent::new("cleanup.sharedMemory.dirMissing")
                .path("shmemDir", &shmem_dir)
                .emit_debug(targets::CLEANUP);
            return Ok(());
        }
        Err(error) => {
            return Err(error);
        }
    };

    let mut deleted = 0usize;
    let mut locked = 0usize;
    let mut skipped = 0usize;
    let mut freed_bytes = 0u64;

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = match entry.file_name().into_string() {
            Ok(name) => name,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        if !file_name.starts_with(SHMEM_FILE_PREFIX) {
            skipped += 1;
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(metadata) if metadata.is_file() => metadata,
            Ok(_) => {
                skipped += 1;
                continue;
            }
            Err(error) => {
                LogEvent::new("cleanup.sharedMemory.entrySkipped")
                    .field("reason", "metadata-unreadable")
                    .path("path", &path)
                    .error(error)
                    .emit_debug(targets::CLEANUP);
                skipped += 1;
                continue;
            }
        };

        if let Err(error) = fs::remove_file(&path) {
            // PermissionDenied on Windows usually means the mapping is still
            // held by a running process. Leave it alone.
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                locked += 1;
                LogEvent::new("cleanup.sharedMemory.entrySkipped")
                    .field("reason", "file-in-use")
                    .path("path", &path)
                    .emit_debug(targets::CLEANUP);
            } else {
                skipped += 1;
                LogEvent::new("cleanup.sharedMemory.entrySkipped")
                    .field("reason", "remove-failed")
                    .path("path", &path)
                    .error(error)
                    .emit_debug(targets::CLEANUP);
            }
            continue;
        }

        deleted += 1;
        freed_bytes += metadata.len();
    }

    let freed_gb = freed_bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    LogEvent::new("cleanup.sharedMemory.complete")
        .count("deleted", deleted)
        .count("locked", locked)
        .count("skipped", skipped)
        .field("freedGb", format!("{freed_gb:.2}"))
        .emit_info(targets::CLEANUP);

    Ok(())
}
