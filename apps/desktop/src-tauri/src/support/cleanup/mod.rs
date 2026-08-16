#[cfg(windows)]
mod windows;

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
    windows::cleanup_tauri_shared_memory_leaks();
}
