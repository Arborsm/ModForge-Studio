//! Mod project scanning, Content Patcher analysis and asset index building.
//!
//! Formerly a single ~1.5k-line god file; the implementation now lives in the
//! sibling submodules (`discovery`, `i18n`, `analysis`, `asset_index`) and is
//! re-exported here so existing call sites (`crate::domain::mods::*`) stay
//! unchanged.

pub(crate) mod commands;

mod analysis;
mod asset_index;
mod discovery;
mod i18n;

// Wire types referenced by the command bindings (`commands.rs`) and the
// integration tests. Everything else stays reachable through the submodule
// paths (`crate::domain::mods::analysis::...` etc.).
pub use analysis::{ModProjectDetail, ModProjectSummary};
pub use asset_index::ModAssetIndex;
pub use i18n::{SaveModI18nFilesRequest, SaveModI18nFilesResult};

pub(crate) use analysis::{
    canonical_mod_project_root, inspect_mod_archive, load_mod_project, save_mod_i18n_files,
    scan_mod_asset_index, scan_mod_projects,
};

#[cfg(test)]
pub use i18n::ContentPatcherI18nFileInput;

#[cfg(test)]
#[path = "../../tests/integration/mods_tests.rs"]
mod tests;
