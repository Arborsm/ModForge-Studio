use anyhow::bail;
use std::path::Path;

#[cfg(target_os = "windows")]
#[path = "windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "macos.rs"]
mod platform;
#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
#[path = "linux.rs"]
mod platform;

/// Opens the directory in the platform file manager. Fails when the path is
/// not an existing directory or the file manager exits unsuccessfully.
pub fn open_directory(path: &Path) -> anyhow::Result<()> {
    if !path.is_dir() {
        bail!("Directory {} does not exist.", path.display());
    }
    platform::open_directory(path)
}
