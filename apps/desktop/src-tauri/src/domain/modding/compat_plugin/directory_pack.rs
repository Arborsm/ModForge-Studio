//! Directory-pack entry I/O (stage 2).
//!
//! Lists, reads and writes pack entries under a `directory-pack` page source,
//! with path traversal guards (lexical + canonical).

use std::path::{Path, PathBuf};

use base64::Engine as _;
use serde::{Deserialize, Serialize};

use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};

const MAX_ENTRY_IMAGE_BYTES: usize = 16 * 1024 * 1024;
use crate::support::logging::event::LogEvent;
use crate::support::logging::event::targets;

use super::protocol::lexically_normalize_within;

/// One entry summary returned by `list_directory_pack_entries`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatPluginEntrySummary {
    /// Entry id (the subdirectory name under `<root_subdir>`).
    pub id: String,
    /// Absolute path to the entry's directory.
    pub entry_dir: String,
    /// Absolute path to the entry file (e.g. `texture.json`).
    pub entry_file_path: String,
    /// Absolute path to the companion image file if it exists.
    pub entry_image_path: Option<String>,
}

/// Request to read one directory-pack entry's JSON content.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadCompatPluginEntryRequest {
    /// Absolute path to the target mod's root directory.
    pub mod_root: String,
    /// Subdirectory within the mod root containing entries.
    pub root_subdir: String,
    /// Entry id (subdirectory name under `<root_subdir>`).
    pub entry_id: String,
    /// Entry file name (e.g. "texture.json").
    pub entry_file: String,
}

/// Result of reading one directory-pack entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadCompatPluginEntryResult {
    /// Absolute path to the entry file that was read.
    pub entry_file_path: String,
    /// Raw JSON content of the entry file, parsed into a `serde_json::Value`.
    pub content: serde_json::Value,
}

/// Request to write one directory-pack entry's JSON content.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteCompatPluginEntryRequest {
    /// Absolute path to the target mod's root directory.
    pub mod_root: String,
    /// Subdirectory within the mod root containing entries.
    pub root_subdir: String,
    /// Entry id (subdirectory name under `<root_subdir>`).
    pub entry_id: String,
    /// Entry file name (e.g. "texture.json").
    pub entry_file: String,
    /// JSON content to write.
    pub content: serde_json::Value,
}

/// Request to delete one complete directory-pack entry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCompatPluginEntryRequest {
    pub mod_root: String,
    pub root_subdir: String,
    pub entry_id: String,
}

/// Request to write a base64-encoded companion image into an entry directory.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteCompatPluginEntryImageRequest {
    pub mod_root: String,
    pub root_subdir: String,
    pub entry_id: String,
    pub image_file: String,
    pub content_base64: String,
}

/// Validates that a resolved path stays within the expected base directory.
/// Returns the canonicalized path if safe, or an error string if the path
/// escapes the base (via `..`, absolute path, or symlink escape).
fn ensure_path_within(base: &Path, resolved: &Path) -> Result<PathBuf, String> {
    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Failed to resolve base directory {}: {e}", base.display()))?;
    let canonical_resolved = resolved
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path {}: {e}", resolved.display()))?;
    if !canonical_resolved.starts_with(&canonical_base) {
        return Err(format!(
            "Path traversal detected: {} escapes base directory {}",
            resolved.display(),
            canonical_base.display()
        ));
    }
    Ok(canonical_resolved)
}

/// Validates an entry id: must be a simple directory name (no path separators,
/// no `..`, no empty).
fn validate_entry_id(entry_id: &str) -> Result<(), String> {
    if entry_id.is_empty() {
        return Err("Entry id must not be empty".to_string());
    }
    if entry_id.contains('/') || entry_id.contains('\\') || entry_id == ".." || entry_id == "." {
        return Err(format!("Invalid entry id: {entry_id}"));
    }
    Ok(())
}

/// Validates a file name: must be a simple file name (no path separators,
/// no `..`).
fn validate_file_name(file_name: &str) -> Result<(), String> {
    if file_name.is_empty() {
        return Err("File name must not be empty".to_string());
    }
    if file_name.contains('/') || file_name.contains('\\') || file_name == ".." || file_name == "."
    {
        return Err(format!("Invalid file name: {file_name}"));
    }
    Ok(())
}

fn validate_root_subdir(root_subdir: &str) -> Result<(), String> {
    let path = Path::new(root_subdir);
    if path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!("Invalid root subdirectory: {root_subdir}"));
    }
    Ok(())
}

fn validate_image_file_name(image_file: &str) -> Result<(), String> {
    validate_file_name(image_file)?;
    let extension = Path::new(image_file)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    if !matches!(extension.as_deref(), Some("png" | "jpg" | "jpeg" | "webp")) {
        return Err(format!("Unsupported image file extension: {image_file}"));
    }
    Ok(())
}

/// Lists pack entries under a directory-pack source. Scans
/// `<mod_root>/<root_subdir>` for subdirectories containing the declared entry
/// file, returning one summary per entry. Non-directory entries and
/// subdirectories without the entry file are skipped.
pub(crate) fn list_directory_pack_entries(
    request: &crate::domain::modding::commands::ListCompatPluginEntriesRequest,
) -> Vec<CompatPluginEntrySummary> {
    let mod_root = clean_input_path(&request.mod_root);
    let root_subdir = request.root_subdir.trim();
    let entry_file = request.entry_file.trim();

    if let Err(reason) = validate_file_name(entry_file) {
        LogEvent::new("compatPlugin.listEntriesInvalidParams")
            .field("reason", &reason)
            .emit_warn(targets::APP_UI);
        return Vec::new();
    }

    let entries_dir = mod_root.join(root_subdir);

    // Lexically reject `root_subdir` values that escape the mod root before
    // any filesystem access. Without this, a `root_subdir` like `../sibling`
    // would list an external directory's structure (the canonicalize below
    // resolves the real path but nothing checked it stayed within mod_root).
    if lexically_normalize_within(&entries_dir, &mod_root).is_none() {
        LogEvent::new("compatPlugin.listEntriesTraversalRejected")
            .field("rootSubdir", &root_subdir)
            .emit_warn(targets::APP_UI);
        return Vec::new();
    }

    if !entries_dir.is_dir() {
        return Vec::new();
    }

    let Ok(entries_canonical) = entries_dir.canonicalize() else {
        return Vec::new();
    };

    // Defense-in-depth: confirm the canonicalized entries directory still
    // stays within the mod root (rejects symlink escapes the lexical check
    // cannot see).
    if let Err(reason) = ensure_path_within(&mod_root, &entries_canonical) {
        LogEvent::new("compatPlugin.listEntriesTraversalRejected")
            .field("reason", &reason)
            .emit_warn(targets::APP_UI);
        return Vec::new();
    }

    let mut summaries = Vec::new();
    let Ok(read_dir) = std::fs::read_dir(&entries_canonical) else {
        return Vec::new();
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let entry_id = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        let entry_file_path = path.join(entry_file);
        if !entry_file_path.is_file() {
            continue;
        }
        let entry_image_path = request
            .entry_image
            .as_deref()
            .map(|img| path.join(img))
            .filter(|p| p.is_file())
            .map(|p| normalize_path(&p));
        summaries.push(CompatPluginEntrySummary {
            id: entry_id,
            entry_dir: normalize_path(&path),
            entry_file_path: normalize_path(&entry_file_path),
            entry_image_path,
        });
    }
    summaries.sort_by(|a, b| a.id.cmp(&b.id));
    summaries
}

/// Reads one directory-pack entry's JSON content. Path traversal is blocked
/// by `ensure_path_within`.
pub(crate) fn read_directory_pack_entry(
    request: ReadCompatPluginEntryRequest,
) -> Result<ReadCompatPluginEntryResult, String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_entry_id(&request.entry_id)?;
    validate_file_name(&request.entry_file)?;

    let entries_dir = mod_root.join(request.root_subdir.trim());
    let entry_file_path = entries_dir
        .join(&request.entry_id)
        .join(&request.entry_file);

    let canonical_path = ensure_path_within(&mod_root, &entry_file_path)?;

    let raw = std::fs::read_to_string(&canonical_path).map_err(|e| {
        format!(
            "Failed to read entry file {}: {e}",
            canonical_path.display()
        )
    })?;
    // Mod-authored JSON routinely carries comments / trailing commas; parse
    // with the shared relaxed parser instead of strict serde_json.
    let content = crate::infrastructure::game_formats::json_relaxed::parse_json_str(
        &raw,
        &canonical_path.display().to_string(),
    )
    .map_err(|e| format!("Failed to parse entry file as JSON: {e}"))?;

    Ok(ReadCompatPluginEntryResult {
        entry_file_path: normalize_path(&canonical_path),
        content,
    })
}

/// Writes one directory-pack entry's JSON content. The write is atomic: write
/// to a temp file in the same directory, then rename. Path traversal is
/// blocked by `ensure_path_within`.
pub(crate) fn write_directory_pack_entry(
    request: WriteCompatPluginEntryRequest,
) -> Result<(), String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_entry_id(&request.entry_id)?;
    validate_file_name(&request.entry_file)?;
    validate_root_subdir(request.root_subdir.trim())?;

    let entries_dir = mod_root.join(request.root_subdir.trim());
    let entry_dir = entries_dir.join(&request.entry_id);

    // Lexically verify the entry directory stays within the mod root BEFORE
    // creating anything on disk. `validate_entry_id` / `validate_file_name`
    // already reject `..` and separators in those two components, but
    // `root_subdir` is caller-supplied and unchecked — without this lexical
    // pre-check a `root_subdir` like `../sibling` would let `create_dir_all`
    // create a directory outside the mod root before the canonical
    // `ensure_path_within` check below runs (and that check would then reject,
    // but the external directory would already exist as a side effect).
    if lexically_normalize_within(&entry_dir, &mod_root).is_none() {
        return Err(format!(
            "Path traversal detected: entry directory {} escapes mod root {}",
            entry_dir.display(),
            mod_root.display()
        ));
    }

    // Ensure the entry directory exists.
    std::fs::create_dir_all(&entry_dir).map_err(|e| {
        format!(
            "Failed to create entry directory {}: {e}",
            entry_dir.display()
        )
    })?;

    // Defense-in-depth: canonicalize the now-existing directory to reject
    // symlink escapes that the lexical check cannot see.
    let canonical_entry_dir = ensure_path_within(&mod_root, &entry_dir)?;
    let canonical_path = canonical_entry_dir.join(&request.entry_file);

    let json = serde_json::to_string_pretty(&request.content)
        .map_err(|e| format!("Failed to serialize entry content: {e}"))?;

    // Atomic write: write to temp file then rename.
    let temp_path = canonical_path.with_extension("tmp");
    std::fs::write(&temp_path, &json)
        .map_err(|e| format!("Failed to write temp file {}: {e}", temp_path.display()))?;
    std::fs::rename(&temp_path, &canonical_path).map_err(|e| {
        format!(
            "Failed to rename temp file to {}: {e}",
            canonical_path.display()
        )
    })?;

    Ok(())
}

/// Deletes an entire directory-pack entry directory.
pub(crate) fn delete_directory_pack_entry(
    request: DeleteCompatPluginEntryRequest,
) -> Result<(), String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_root_subdir(request.root_subdir.trim())?;
    validate_entry_id(&request.entry_id)?;
    let entry_dir = mod_root
        .join(request.root_subdir.trim())
        .join(&request.entry_id);
    if lexically_normalize_within(&entry_dir, &mod_root).is_none() {
        return Err(format!("Path traversal detected: {}", entry_dir.display()));
    }
    let canonical = ensure_path_within(&mod_root, &entry_dir)?;
    if !canonical.is_dir() {
        return Err(format!(
            "Entry directory does not exist: {}",
            canonical.display()
        ));
    }
    std::fs::remove_dir_all(&canonical).map_err(|e| {
        format!(
            "Failed to delete entry directory {}: {e}",
            canonical.display()
        )
    })
}

/// Decodes and writes one validated companion image file.
pub(crate) fn write_directory_pack_entry_image(
    request: WriteCompatPluginEntryImageRequest,
) -> Result<(), String> {
    let mod_root = clean_input_path(&request.mod_root);
    validate_root_subdir(request.root_subdir.trim())?;
    validate_entry_id(&request.entry_id)?;
    validate_image_file_name(&request.image_file)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(request.content_base64.trim())
        .map_err(|e| format!("Invalid image base64: {e}"))?;
    if bytes.is_empty() {
        return Err("Image content must not be empty".to_string());
    }
    if bytes.len() > MAX_ENTRY_IMAGE_BYTES {
        return Err(format!(
            "Image content exceeds {MAX_ENTRY_IMAGE_BYTES} bytes"
        ));
    }
    let entry_dir = mod_root
        .join(request.root_subdir.trim())
        .join(&request.entry_id);
    if lexically_normalize_within(&entry_dir, &mod_root).is_none() {
        return Err(format!("Path traversal detected: {}", entry_dir.display()));
    }
    std::fs::create_dir_all(&entry_dir).map_err(|e| {
        format!(
            "Failed to create entry directory {}: {e}",
            entry_dir.display()
        )
    })?;
    let canonical_entry_dir = ensure_path_within(&mod_root, &entry_dir)?;
    let path = canonical_entry_dir.join(&request.image_file);
    std::fs::write(&path, bytes)
        .map_err(|e| format!("Failed to write image {}: {e}", path.display()))
}
