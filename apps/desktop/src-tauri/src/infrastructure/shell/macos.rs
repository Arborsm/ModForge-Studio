use anyhow::bail;
use std::path::Path;
use std::process::Command;

pub(super) fn open_directory(path: &Path) -> anyhow::Result<()> {
    let status = Command::new("open").arg(path).status()?;
    if !status.success() {
        bail!("File manager failed to open directory {}.", path.display());
    }
    Ok(())
}
