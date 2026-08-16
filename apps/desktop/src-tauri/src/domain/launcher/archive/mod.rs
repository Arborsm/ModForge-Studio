// Facade for the launcher archive domain. Implementation lives in the
// `archive/` submodules split by responsibility:
//   - extract: format detection, path-traversal-safe decompression and temp work dirs
//   - inspect: archive inspection, manifest metadata, tree building and file diffs
//   - install: install/backup entry points and Tauri command wrappers
pub(crate) mod extract;
pub(crate) mod inspect;
pub(crate) mod install;

pub(crate) use extract::{expand_archive_to_destination, temp_work_dir, with_expanded_archive};
// `inspect_archive_at_path` and `resolve_backup_session_path` are exercised by
// the unit/integration tests (and used internally via `super::`), so the facade
// re-export is only referenced under `#[cfg(test)]`.
#[allow(unused_imports)]
pub(crate) use inspect::inspect_archive_at_path;
#[allow(unused_imports)]
pub(crate) use install::{install_archive_at_path, resolve_backup_session_path};

pub use install::{
    inspect_launcher_archive, install_launcher_archive, list_launcher_install_backups,
    restore_launcher_install_backup,
};

#[cfg(test)]
#[path = "../../../tests/unit/domain/launcher/archive_tests.rs"]
mod tests;
