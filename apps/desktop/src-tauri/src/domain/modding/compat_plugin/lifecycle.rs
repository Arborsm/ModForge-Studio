//! Compat plugin lifecycle: root resolution, caching, disable/delete and
//! built-in archive extraction.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::infrastructure::fs::pathing::clean_input_path;
use crate::support::logging::event::LogEvent;
use crate::support::logging::event::targets;

use super::manifest::load_plugin_manifests;
use super::protocol::lexically_normalize_within;
use super::summary::build_summaries_from_report;
use super::types::{CompatPluginSummary, PLUGIN_ID_PATTERN};

/// Process-level cache of resolved plugin roots. Set once at app startup (Tauri
/// `setup` or sidecar `run_stdio`) so that domain code without access to an
/// `AppHandle` — e.g. `load_attached_api_registry` — can still locate the
/// plugin directory. Falls back to the platform data directory when not set.
static PLUGIN_ROOTS: OnceLock<Vec<PathBuf>> = OnceLock::new();

/// Process-level cache of plugin summaries. Built once from the resolved
/// plugin roots and reused for the process lifetime. Stage 4's
/// `reload_compat_plugins` resets this cache (and the attached API registry
/// cache) via [`clear_plugin_caches`].
static CACHED_SUMMARIES: Mutex<Option<Vec<CompatPluginSummary>>> = Mutex::new(None);

/// Initializes the process-level plugin root set. Called once at app startup
/// from the Tauri `setup` hook (macOS/Windows) or the sidecar entry point
/// (Linux). Subsequent calls are no-ops — the first set wins.
///
/// Pass the full set of roots to scan (normally just the app data directory's
/// `compat-plugins` folder). The `MODFORGE_COMPAT_PLUGIN_ROOT` dev override,
/// when present, is prepended automatically by `resolve_plugin_roots`.
pub(crate) fn set_plugin_roots(roots: Vec<PathBuf>) {
    let _ = PLUGIN_ROOTS.set(roots);
}

/// Built-in compat plugins, packaged by `build.rs` into a single zip archive
/// and embedded into the binary. Extracted into the app data directory on
/// first launch (and whenever the archive content changes, e.g. after an app
/// update) so users can inspect the built-in sources and drop their own
/// plugins alongside them.
static BUILTIN_PLUGINS_ARCHIVE: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/builtin_compat_plugins.zip"));

/// Name of the marker file (inside the data-dir `compat-plugins` folder) that
/// records the sha256 of the last extracted built-in archive and the list of
/// top-level plugin directories it extracted, so a subsequent upgrade can clean
/// up directories from plugins that were removed from the archive.
const BUILTIN_ARCHIVE_MARKER: &str = ".builtin-archive-sha256";

/// Extracts the embedded built-in compat plugins into the app data
/// directory's `compat-plugins` subfolder. Skipped entirely when the marker
/// file already records the current archive's sha256; otherwise the built-in
/// plugin directories are removed and re-extracted so files deleted from a
/// newer archive do not linger. Plugins the user added themselves (directory
/// names not present in the archive and not recorded in the marker) are never
/// touched.
///
/// The marker file stores the archive hash on the first line and one
/// extracted top-level directory per subsequent line. On upgrade, directories
/// that were extracted previously but are absent from the new archive (i.e. a
/// built-in plugin was retired) are removed so they do not linger as ghost
/// plugins. User-created directories are never in the marker's recorded list
/// and are left untouched.
///
/// Returns the destination directory path on success.
pub(crate) fn extract_builtin_plugins_if_needed(app_data_dir: &Path) -> std::io::Result<PathBuf> {
    use sha2::Digest;

    let dest = app_data_dir.join("compat-plugins");
    std::fs::create_dir_all(&dest)?;

    let archive_hash = format!("{:x}", sha2::Sha256::digest(BUILTIN_PLUGINS_ARCHIVE));
    let marker_path = dest.join(BUILTIN_ARCHIVE_MARKER);
    let marker_content = std::fs::read_to_string(&marker_path).unwrap_or_default();
    let mut marker_lines = marker_content.lines();
    let marker_hash = marker_lines.next().unwrap_or("").trim();
    let previous_builtin_dirs: std::collections::BTreeSet<String> = marker_lines
        .map(|line| line.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if marker_hash == archive_hash && !previous_builtin_dirs.is_empty() {
        return Ok(dest);
    }

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(BUILTIN_PLUGINS_ARCHIVE))
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;

    // Collect the new archive's top-level plugin directories.
    let mut top_dirs = std::collections::BTreeSet::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
        if let Some(first) = entry.name().split('/').next() {
            if !first.is_empty() {
                top_dirs.insert(first.to_string());
            }
        }
    }

    // Remove previously extracted built-in plugin directories before
    // re-extracting. This includes directories that were in the previous
    // archive but are absent from the new one (retired built-in plugins), so
    // they do not linger as ghost plugins. User-created directories are never
    // in the marker's recorded list and are left untouched.
    let dirs_to_remove = top_dirs
        .iter()
        .chain(previous_builtin_dirs.iter())
        .collect::<std::collections::BTreeSet<_>>();
    for dir in &dirs_to_remove {
        let path = dest.join(dir);
        if path.is_dir() {
            std::fs::remove_dir_all(&path)?;
        }
    }

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
        let Some(relative) = entry.enclosed_name().map(|path| path.to_path_buf()) else {
            continue;
        };
        let out_path = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out)?;
    }

    // Rewrite the marker with the new hash and the list of built-in
    // directories extracted this run, so the next upgrade can retire removed
    // ones.
    let mut marker = String::new();
    marker.push_str(&archive_hash);
    marker.push('\n');
    for dir in &top_dirs {
        marker.push_str(dir);
        marker.push('\n');
    }
    std::fs::write(&marker_path, marker)?;
    Ok(dest)
}

/// Returns the plugin roots that are currently registered, for the
/// `get_compat_plugin_roots` host command.
pub(crate) fn get_plugin_roots() -> Vec<PathBuf> {
    resolve_plugin_roots(None)
}

/// Loads plugin summaries from the resolved plugin roots, including inline i18n
/// bundles.
///
/// Summaries are cached for the process lifetime via a `Mutex<Option<>>` — the
/// first call loads from disk, subsequent calls return the cached result.
/// Stage 4's `reload_compat_plugins` resets this cache via
/// [`clear_plugin_caches`].
pub(crate) fn list_summaries(roots: &[PathBuf]) -> Vec<CompatPluginSummary> {
    let mut guard = CACHED_SUMMARIES
        .lock()
        .expect("compat plugin summaries cache mutex poisoned");
    if let Some(cached) = guard.as_ref() {
        return cached.clone();
    }
    let report = load_plugin_manifests(roots);
    for error in &report.errors {
        LogEvent::new("compatPlugin.loadError")
            .field("pluginDir", &error.plugin_dir)
            .field("reason", &error.reason)
            .emit_warn(targets::APP_UI);
    }
    let summaries = build_summaries_from_report(&report);
    *guard = Some(summaries.clone());
    summaries
}

/// Loads plugin summaries using the process-level resolved plugin roots.
/// This is the entry point for the `list_compat_plugins` host command and any
/// other caller that does not supply explicit roots.
pub(crate) fn list_summaries_from_resolved_roots() -> Vec<CompatPluginSummary> {
    list_summaries(&resolve_plugin_roots(None))
}

/// Clears all compat plugin caches: the summaries cache and the attached API
/// registry cache. Used by the stage 4 `reload_compat_plugins` host command's
/// manual reload button so that subsequent reads re-scan from disk.
pub(crate) fn clear_plugin_caches() {
    {
        let mut guard = CACHED_SUMMARIES
            .lock()
            .expect("compat plugin summaries cache mutex poisoned");
        *guard = None;
    }
    crate::domain::content_patcher::attached::clear_attached_api_cache();
}

/// Marker file name placed inside a plugin directory to indicate it is
/// disabled. Disabled plugins are still listed (so the manager can show and
/// re-enable them) but their contributions are not registered.
const DISABLED_MARKER: &str = ".disabled";

/// Returns `true` when the plugin directory contains a `.disabled` marker file.
pub(crate) fn is_plugin_disabled(plugin_dir: &Path) -> bool {
    plugin_dir.join(DISABLED_MARKER).exists()
}

/// Sets the disabled state of a plugin by creating or removing the `.disabled`
/// marker file in its directory. Returns an error string if the plugin
/// directory cannot be found or the marker file cannot be written/removed.
pub(crate) fn set_plugin_disabled(plugin_id: &str, disabled: bool) -> Result<(), String> {
    set_plugin_disabled_in_roots(&resolve_plugin_roots(None), plugin_id, disabled)
}

/// Root-scoped variant of [`set_plugin_disabled`] for unit tests that supply
/// explicit roots without touching the process-level `MODFORGE_COMPAT_PLUGIN_ROOT`
/// environment variable (which is unsafe under parallel test execution).
pub(crate) fn set_plugin_disabled_in_roots(
    roots: &[PathBuf],
    plugin_id: &str,
    disabled: bool,
) -> Result<(), String> {
    let plugin_dir = find_plugin_dir_in_roots(roots, plugin_id)
        .ok_or_else(|| format!("plugin directory not found: {plugin_id}"))?;
    let marker = plugin_dir.join(DISABLED_MARKER);
    if disabled {
        std::fs::write(&marker, b"").map_err(|e| format!("failed to write disabled marker: {e}"))
    } else {
        // Removing a non-existent file is not an error.
        match std::fs::remove_file(&marker) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("failed to remove disabled marker: {e}")),
        }
    }
}

/// Deletes a plugin directory entirely. Returns an error string if the plugin
/// directory cannot be found or cannot be removed. The caller is responsible
/// for clearing caches and reloading after deletion.
pub(crate) fn delete_plugin(plugin_id: &str) -> Result<(), String> {
    delete_plugin_in_roots(&resolve_plugin_roots(None), plugin_id)
}

/// Root-scoped variant of [`delete_plugin`] for unit tests that supply explicit
/// roots without touching the process-level `MODFORGE_COMPAT_PLUGIN_ROOT`
/// environment variable (which is unsafe under parallel test execution).
pub(crate) fn delete_plugin_in_roots(roots: &[PathBuf], plugin_id: &str) -> Result<(), String> {
    let plugin_dir = find_plugin_dir_in_roots(roots, plugin_id)
        .ok_or_else(|| format!("plugin directory not found: {plugin_id}"))?;
    std::fs::remove_dir_all(&plugin_dir)
        .map_err(|e| format!("failed to delete plugin directory: {e}"))
}

/// Validates a plugin id against the canonical [`PLUGIN_ID_PATTERN`]. Returns
/// `true` only when the id is safe to join onto a plugin root: the pattern
/// forbids `..`, path separators, drive letters and any component that could
/// escape the root. This is the primary guard for the destructive toggle/delete
/// paths; [`find_plugin_dir_in_roots`] adds a lexical within-root check as
/// defense-in-depth.
pub(super) fn is_valid_plugin_id(plugin_id: &str) -> bool {
    regex::Regex::new(PLUGIN_ID_PATTERN)
        .map(|re| re.is_match(plugin_id))
        .unwrap_or(false)
}

/// Locates the on-disk directory for a plugin id by scanning the given roots.
/// Returns the first match (roots are priority-ordered). The plugin id is
/// validated against [`PLUGIN_ID_PATTERN`] and the joined path is lexically
/// normalized within the root, so traversal attempts (`..`, absolute paths,
/// drive letters) are rejected before any filesystem access. This is the
/// shared guard for the destructive [`set_plugin_disabled_in_roots`] and
/// [`delete_plugin_in_roots`] mutations.
pub(super) fn find_plugin_dir_in_roots(roots: &[PathBuf], plugin_id: &str) -> Option<PathBuf> {
    if !is_valid_plugin_id(plugin_id) {
        return None;
    }
    let cleaned_id = clean_input_path(plugin_id);
    for root in roots {
        let dir = root.join(&cleaned_id);
        // Defense-in-depth: the id pattern already forbids `..` and
        // separators, but the lexical check keeps the destructive mutation
        // path explicit and guards against future pattern relaxations or
        // platform-specific `Path::join` quirks (e.g. absolute segments
        // replacing the base on Windows).
        let normalized = lexically_normalize_within(&dir, root)?;
        if normalized.is_dir() {
            return Some(normalized);
        }
    }
    None
}

/// Resolves the plugin roots to scan for the current build configuration.
///
/// - `plugin_root_override = Some(path)` → only that path (tests / dev debug).
/// - `MODFORGE_COMPAT_PLUGIN_ROOT` env var → prepended as the highest-priority
///   root. Lets plugin developers iterate on the source tree (or any external
///   folder) without rebuilding the embedded archive; the reload button
///   re-scans it.
/// - Process-level roots set via `set_plugin_roots` at startup → those roots
///   (the app data directory's `compat-plugins` folder, into which the
///   embedded built-in plugins are extracted).
/// - Fallback when nothing was set (unit tests, early calls): the platform
///   data directory's `ModForgeStudio/compat-plugins` folder. The directory
///   may not exist; scanning tolerates that.
pub(crate) fn resolve_plugin_roots(plugin_root_override: Option<&str>) -> Vec<PathBuf> {
    if let Some(path) = plugin_root_override {
        return vec![PathBuf::from(path)];
    }

    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(extra) = std::env::var("MODFORGE_COMPAT_PLUGIN_ROOT") {
        let extra = extra.trim();
        if !extra.is_empty() {
            roots.push(PathBuf::from(extra));
        }
    }

    // Roots set at app startup by the Tauri `setup` hook or the sidecar entry
    // point (the app data directory into which built-ins are extracted).
    if let Some(startup_roots) = PLUGIN_ROOTS.get() {
        for root in startup_roots {
            if !roots.contains(root) {
                roots.push(root.clone());
            }
        }
    }

    if roots.is_empty()
        && let Some(data_dir) = dirs::data_dir()
    {
        roots.push(data_dir.join("ModForgeStudio").join("compat-plugins"));
    }

    roots
}
