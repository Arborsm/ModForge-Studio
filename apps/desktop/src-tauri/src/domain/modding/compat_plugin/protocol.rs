//! `plugin://` protocol path resolver (stage 3).
//!
//! Resolves `plugin://<pluginId>/<relativePath>` URLs to absolute file paths,
//! enforcing plugin id validation, extension whitelisting and lexical
//! within-root normalization.

use std::path::{Path, PathBuf};

use crate::infrastructure::fs::pathing::clean_input_path;

use super::lifecycle::{is_valid_plugin_id, resolve_plugin_roots};

/// Asset extensions whitelisted for the `plugin://` protocol. Requests for
/// files outside this set are rejected with a 404.
pub(crate) const PLUGIN_ASSET_EXTENSIONS: &[&str] =
    &["js", "json", "png", "jpg", "webp", "svg", "css"];

/// Maps a resolved plugin asset path's extension to its MIME content type.
/// Shared by the Tauri `plugin://` URI scheme handler and the sidecar
/// `read_plugin_asset` host command so the two hosts never drift on content
/// types.
pub(crate) fn plugin_asset_content_type(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("css") => "text/css",
        _ => "application/octet-stream",
    }
}

/// Resolves a `plugin://<pluginId>/<relativePath>` URL to an absolute file
/// path.
///
/// Scans every root returned by [`resolve_plugin_roots`] for a child directory
/// named `<pluginId>`, then joins `relativePath` and lexically normalizes the
/// result. Returns `None` when:
/// - `pluginId` fails [`is_valid_plugin_id`] (forbids `..`, separators, drive
///   letters and any component that could escape the root — this is the primary
///   guard against `pluginId`-level traversal, e.g. `plugin://../secret`),
/// - `relativePath` is absolute or UNC,
/// - `relativePath` contains a `..` segment that escapes the plugin directory,
/// - the file extension is not in [`PLUGIN_ASSET_EXTENSIONS`],
/// - no root contains a `<pluginId>` directory.
///
/// The returned path is guaranteed to start with the plugin directory; no
/// filesystem canonicalization is performed, so the file need not exist yet.
pub(crate) fn resolve_plugin_protocol_path(
    plugin_id: &str,
    relative_path: &str,
) -> Option<PathBuf> {
    resolve_plugin_protocol_path_in_roots(&resolve_plugin_roots(None), plugin_id, relative_path)
}

/// Root-scoped variant of [`resolve_plugin_protocol_path`] for unit tests that
/// need to supply explicit roots without touching the process-level
/// `PLUGIN_ROOTS` OnceLock.
pub(super) fn resolve_plugin_protocol_path_in_roots(
    roots: &[PathBuf],
    plugin_id: &str,
    relative_path: &str,
) -> Option<PathBuf> {
    // Validate the plugin id against the canonical pattern first. This is the
    // same guard the destructive toggle/delete paths use via
    // [`find_plugin_dir_in_roots`]; without it, a `pluginId` like `..` (or its
    // `%2E%2E` percent-encoded form, decoded by the URI handler before this
    // point) would be joined onto a root and the lexical within-plugin-dir
    // check below would normalize relative to the *escaped* directory rather
    // than rejecting the id outright, allowing reads of whitelisted-extension
    // files outside any plugin root.
    if !is_valid_plugin_id(plugin_id) {
        return None;
    }

    let cleaned_relative = clean_input_path(relative_path);

    // Reject absolute paths: leading slash (Unix-style or Windows root-relative),
    // drive letters, and UNC paths. `Path::is_absolute()` alone is insufficient
    // on Windows because `/foo` (no drive prefix) is not considered absolute.
    let cleaned_str = cleaned_relative.to_string_lossy();
    if cleaned_relative.is_absolute()
        || cleaned_str.starts_with('/')
        || cleaned_str.starts_with('\\')
    {
        return None;
    }

    // Validate extension whitelist before touching the filesystem.
    let ext = cleaned_relative
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some(e) if PLUGIN_ASSET_EXTENSIONS.contains(&e) => {}
        _ => return None,
    }

    let cleaned_id = clean_input_path(plugin_id);
    if cleaned_id.as_os_str().is_empty() {
        return None;
    }

    for root in roots {
        let plugin_dir = root.join(&cleaned_id);
        if !plugin_dir.is_dir() {
            continue;
        }

        // Lexically normalize the joined path, rejecting `..` that escapes
        // `plugin_dir` and any absolute/prefix component inside the relative
        // segment. Defense-in-depth: the id pattern already forbids `..` and
        // separators, but this keeps the read path explicit and guards against
        // future pattern relaxations or platform-specific `Path::join` quirks.
        let joined = plugin_dir.join(&cleaned_relative);
        let normalized = lexically_normalize_within(&joined, &plugin_dir)?;
        return Some(normalized);
    }

    None
}

/// Lexically normalizes `joined` relative to `base`, rejecting any `..`
/// segment that would escape `base`. No filesystem access is performed.
pub(super) fn lexically_normalize_within(joined: &Path, base: &Path) -> Option<PathBuf> {
    let base_len = base.components().count();
    let mut normalized = base.to_path_buf();

    for component in joined.components().skip(base_len) {
        match component {
            std::path::Component::Normal(segment) => normalized.push(segment),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                if normalized == *base {
                    return None;
                }
                if !normalized.pop() {
                    return None;
                }
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => return None,
        }
    }

    if normalized.starts_with(base) {
        Some(normalized)
    } else {
        None
    }
}
