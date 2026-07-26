use anyhow::{Context, bail};
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn open_directory(path: &Path) -> anyhow::Result<()> {
    if !path.is_dir() {
        bail!("Directory {} does not exist.", path.display());
    }
    open_directory_platform(path)
}

#[cfg(target_os = "windows")]
fn open_directory_platform(path: &Path) -> anyhow::Result<()> {
    let status = Command::new("explorer")
        .creation_flags(CREATE_NO_WINDOW)
        .arg(path)
        .status()
        .with_context(|| format!("Failed to open directory {}.", path.display()))?;
    if !status.success() {
        bail!("File manager failed to open directory {}.", path.display());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_directory_platform(path: &Path) -> anyhow::Result<()> {
    let status = Command::new("open").arg(path).status()?;
    if !status.success() {
        bail!("File manager failed to open directory {}.", path.display());
    }
    Ok(())
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn open_directory_platform(path: &Path) -> anyhow::Result<()> {
    let status = Command::new("xdg-open").arg(path).status()?;
    if !status.success() {
        bail!("File manager failed to open directory {}.", path.display());
    }
    Ok(())
}
