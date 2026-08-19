//! Attached API registry: loads attached API descriptors from compat plugin
//! manifests on disk and aggregates them into `AttachedApiRegistry`.
//!
//! As of format 1 the sole contribution type is `attachedApi`. The previous
//! hardcoded `scaleup` descriptor has been migrated to
//! `apps/desktop/compat-plugins/arborsm.scaleup-unofficial/manifest.json`; the
//! aggregated registry is behaviour-equivalent.

use crate::domain::modding::attached_api::AttachedApiRegistry;
use crate::domain::modding::compat_plugin::{load_plugin_manifests, resolve_plugin_roots};

/// Loads the attached API registry from compat plugin manifests on disk.
///
/// `plugin_root_override` is `Some(path)` only in tests / dev debug; in normal
/// operation it is `None` and the plugin roots are resolved from the build
/// configuration (dev directory or packaged resource/data directories).
///
/// Load errors for individual plugins are logged via `support::logging` and do
/// not abort the registry build — a bad plugin simply contributes no
/// descriptors, leaving the rest unaffected.
pub(crate) fn load_attached_api_registry(
    plugin_root_override: Option<&str>,
) -> AttachedApiRegistry {
    let roots = resolve_plugin_roots(plugin_root_override);
    let report = load_plugin_manifests(&roots);
    for error in &report.errors {
        log::warn!(
            target: crate::support::logging::event::targets::APP_UI,
            "{}",
            crate::support::logging::event::LogEvent::new("compatPlugin.loadError")
                .field("pluginDir", &error.plugin_dir)
                .field("reason", &error.reason)
                .render()
        );
    }
    let descriptors = report.to_attached_api_descriptors();
    AttachedApiRegistry::from_descriptors(&descriptors)
}
