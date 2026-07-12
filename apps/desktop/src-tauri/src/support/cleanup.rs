use std::fs;
use std::path::PathBuf;

const SHMEM_DIR_NAME: &str = "shared_memory-rs";
const SHMEM_FILE_PREFIX: &str = "shmem_";

/// Cleans up stale shared-memory mapping files left behind by Tauri/WebView2 on
/// Windows. These files live in the system temp directory under
/// `shared_memory-rs` and are named `shmem_<hex>`. Each leak can be several
/// gigabytes, so removing stale mappings before the app starts keeps disk usage
/// under control.
///
/// This function is a no-op on non-Windows platforms because the leak is
/// Windows-specific.
pub fn cleanup_tauri_shared_memory_leaks() {
    #[cfg(windows)]
    {
        if let Err(error) = cleanup_tauri_shared_memory_leaks_inner() {
            log::warn!(
                target: "Cleanup",
                "Failed to clean up Tauri shared memory leaks: error={error}"
            );
        }
    }

    #[cfg(not(windows))]
    {
        // The shared_memory-rs leak is Windows-specific.
    }
}

#[cfg(windows)]
fn cleanup_tauri_shared_memory_leaks_inner() -> Result<(), std::io::Error> {
    let shmem_dir = std::env::temp_dir().join(SHMEM_DIR_NAME);

    let entries = match fs::read_dir(&shmem_dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            log::debug!(
                target: "Cleanup",
                "No Tauri shared memory leak directory found at {}",
                shmem_dir.display()
            );
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
                log::debug!(
                    target: "Cleanup",
                    "Skipping shared memory entry {}: error={error}",
                    path.display()
                );
                skipped += 1;
                continue;
            }
        };

        if let Err(error) = fs::remove_file(&path) {
            // PermissionDenied on Windows usually means the mapping is still
            // held by a running process. Leave it alone.
            if error.kind() == std::io::ErrorKind::PermissionDenied {
                locked += 1;
                log::debug!(
                    target: "Cleanup",
                    "Shared memory file is in use, skipping: path={}",
                    path.display()
                );
            } else {
                skipped += 1;
                log::debug!(
                    target: "Cleanup",
                    "Could not remove shared memory file: path={} error={error}",
                    path.display()
                );
            }
            continue;
        }

        deleted += 1;
        freed_bytes += metadata.len();
    }

    let freed_gb = freed_bytes as f64 / 1024.0 / 1024.0 / 1024.0;
    log::info!(
        target: "Cleanup",
        "Cleaned Tauri shared memory leaks: deleted={deleted} locked={locked} skipped={skipped} freed_gb={freed_gb:.2}"
    );

    Ok(())
}

#[cfg(test)]
#[path = "../tests/unit/support/cleanup_tests.rs"]
mod tests;
