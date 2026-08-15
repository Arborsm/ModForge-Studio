// Facade for the GMCM mod-config domain. Implementation lives in the
// `mod_config/` submodules split by responsibility:
//   - schema: path/JSON safety, schema/options/config parsing and i18n copy discovery
//   - probe_run: dotnet host resolution and GMCM probe child-process execution
//   - probe_merge: probe payload analysis, field merging and diagnostics
//   - service: load/save entry points and field normalization
pub(crate) mod probe_merge;
pub(crate) mod probe_run;
pub(crate) mod schema;
pub(crate) mod service;

pub(crate) const CONFIG_FILE_NAME: &str = "config.json";
pub(crate) const MANIFEST_FILE_NAME: &str = "manifest.json";
pub(crate) const CONTENT_FILE_NAME: &str = "content.json";

pub use probe_run::load_launcher_gmcm_probe_diagnostics;
pub use service::{load_launcher_mod_config, save_launcher_mod_config};

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/mod_config_tests.rs"]
mod tests;
