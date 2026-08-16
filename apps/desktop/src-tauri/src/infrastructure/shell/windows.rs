use anyhow::{Context, bail};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(super) fn open_directory(path: &Path) -> anyhow::Result<()> {
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
