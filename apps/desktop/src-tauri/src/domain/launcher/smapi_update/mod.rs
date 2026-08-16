//! SMAPI self-update support: detects the installed SMAPI/game versions, checks
//! the latest SMAPI GitHub release, picks a game-compatible target version, and
//! drives the official silent installer to upgrade an existing install.
//!
//! Version comparison uses the shared SMAPI-semantics helpers in
//! [`crate::domain::launcher::versions`]. The game-version compatibility table is
//! a faithful port of SMAPI's `Constants.GetCompatibleApiVersion`
//! (src/SMAPI/Constants.cs) and must be kept in sync with SMAPI releases.
//!
//! Formerly a single god file; the implementation now lives in sibling
//! submodules split by responsibility and is re-exported here so existing call
//! sites (`crate::domain::launcher::smapi_update::*`) stay unchanged:
//!   - release: GitHub/Nexus release model, fetch, cache, source resolution and
//!     the version-check entry point
//!   - versioning: game-version/SMAPI compatibility table, target selection and
//!     mod `MinimumApiVersion` scan
//!   - installer: installer archive naming, download/verification and install
//!     execution
//!   - local_scan: scan download directories for manually downloaded installers

pub(crate) mod installer;
pub(crate) mod local_scan;
pub(crate) mod release;
pub(crate) mod versioning;

pub use installer::install_smapi_update_blocking;
pub use local_scan::find_smapi_installer_downloads_blocking;
pub use release::check_smapi_update_blocking;

#[cfg(test)]
#[path = "../../../tests/unit/domain/launcher/smapi_update_tests.rs"]
mod smapi_update_tests;
