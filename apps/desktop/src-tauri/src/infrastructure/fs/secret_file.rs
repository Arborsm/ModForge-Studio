use std::fs;
use std::io;
use std::path::Path;

/// Writes credential-bearing content and restricts the file to the current user
/// on Unix, so settings that hold API keys are not left world-readable.
pub fn write_secret_file(path: &Path, contents: &str) -> io::Result<()> {
    fs::write(path, contents)?;
    restrict_secret_file(path)
}

/// Restricts an existing credential-bearing file to owner-only access on Unix.
pub fn restrict_secret_file(path: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
    }
    #[cfg(not(unix))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(test)]
#[path = "../../tests/unit/infrastructure/secret_file_tests.rs"]
mod secret_file_tests;
