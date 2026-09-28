//! Attached API registry: loads attached API descriptors from compat plugin
//! manifests on disk and aggregates them into `AttachedApiRegistry`.
//!
//! As of format 1 the sole contribution type is `attachedApi`. The previous
//! hardcoded `scaleup` descriptor has been migrated to
//! `apps/desktop/compat-plugins/arborsm.scaleup-unofficial/manifest.json`; the
//! aggregated registry is behaviour-equivalent.

use std::sync::Mutex;

use crate::domain::modding::attached_api::AttachedApiRegistry;
use crate::domain::modding::compat_plugin::{load_plugin_manifests, resolve_plugin_roots};

/// Process-level cache of the attached API registry. Built once from the
/// resolved plugin roots and reused for the process lifetime — plugin manifests
/// are static for a given run. This mirrors the `list_summaries` cache and
/// avoids re-reading `manifest.json` on every mod scan / CP operation. Stage
/// 4's `reload_compat_plugins` resets this cache via
/// [`clear_attached_api_cache`].
static CACHED_REGISTRY: Mutex<Option<AttachedApiRegistry>> = Mutex::new(None);

/// Loads the attached API registry from compat plugin manifests on disk.
///
/// `plugin_root_override` is `Some(path)` only in tests / dev debug; in normal
/// operation it is `None` and the plugin roots are resolved from the build
/// configuration (dev directory or packaged resource/data directories set at
/// startup via `set_plugin_roots`).
///
/// When `plugin_root_override` is `None`, the result is cached for the process
/// lifetime via a `Mutex<Option<>>` — the first call loads from disk,
/// subsequent calls return the cached registry. This matches the previous
/// hardcoded descriptor's zero-cost repeated access. Override calls (tests)
/// always re-read from disk.
///
/// Load errors for individual plugins are logged via `support::logging` and do
/// not abort the registry build — a bad plugin simply contributes no
/// descriptors, leaving the rest unaffected.
pub(crate) fn load_attached_api_registry(
    plugin_root_override: Option<&str>,
) -> AttachedApiRegistry {
    if plugin_root_override.is_none() {
        let mut guard = CACHED_REGISTRY
            .lock()
            .expect("attached API registry cache mutex poisoned");
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
        let registry = build_registry(plugin_root_override);
        *guard = Some(registry.clone());
        return registry;
    }
    build_registry(plugin_root_override)
}

/// Clears the attached API registry cache. Called by
/// `compat_plugin::clear_plugin_caches` as part of the stage 4
/// `reload_compat_plugins` host command so that subsequent reads re-scan from
/// disk.
pub(crate) fn clear_attached_api_cache() {
    let mut guard = CACHED_REGISTRY
        .lock()
        .expect("attached API registry cache mutex poisoned");
    *guard = None;
}

/// Builds the registry from disk. Extracted so the cached and uncached paths
/// share one implementation.
fn build_registry(plugin_root_override: Option<&str>) -> AttachedApiRegistry {
    let roots = resolve_plugin_roots(plugin_root_override);
    let report = load_plugin_manifests(&roots);
    for error in &report.errors {
        crate::support::logging::event::LogEvent::new("compatPlugin.loadError")
            .field("pluginDir", &error.plugin_dir)
            .field("reason", &error.reason)
            .emit_warn(crate::support::logging::event::targets::APP_UI);
    }
    let descriptors = report.to_attached_api_descriptors();
    AttachedApiRegistry::from_descriptors(&descriptors)
}
