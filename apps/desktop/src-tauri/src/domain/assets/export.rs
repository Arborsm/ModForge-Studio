use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use anyhow::{Context, bail};
use base64::Engine;
use std::fs;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";
const MAX_EXPORTED_MAP_PNG_BYTES: usize = 256 * 1024 * 1024;
const MAX_EXPORTED_FILE_BYTES: usize = 256 * 1024 * 1024;

/// Validates and persists a frontend-rendered map PNG at the user-selected output path.
pub(crate) fn export_map_png(output_path: String, png_base64: String) -> anyhow::Result<()> {
    let output_path = clean_input_path(&output_path);
    if output_path.as_os_str().is_empty() {
        bail!("Choose a PNG export path before exporting the map.");
    }
    if !output_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
    {
        bail!("Map exports must use a .png file extension.");
    }
    let parent = output_path
        .parent()
        .filter(|parent| parent.is_dir())
        .context("The selected PNG export folder does not exist.")?;

    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64.trim())
        .context("The map PNG export payload is not valid base64.")?;
    if png_bytes.len() > MAX_EXPORTED_MAP_PNG_BYTES {
        bail!("The map PNG export exceeds the 256 MB size limit.");
    }
    if !png_bytes.starts_with(PNG_SIGNATURE) {
        bail!("The map export payload is not a PNG image.");
    }

    let temporary_path = parent.join(format!(
        ".{}.{}.tmp",
        output_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("map.png"),
        uuid::Uuid::new_v4()
    ));
    fs::write(&temporary_path, png_bytes).with_context(|| {
        format!(
            "Failed to write temporary map PNG {}",
            normalize_path(&temporary_path)
        )
    })?;
    if output_path.exists() {
        fs::remove_file(&output_path).with_context(|| {
            format!("Failed to replace map PNG {}", normalize_path(&output_path))
        })?;
    }
    if let Err(error) = fs::rename(&temporary_path, &output_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error)
            .with_context(|| format!("Failed to save map PNG {}", normalize_path(&output_path)));
    }

    Ok(())
}

/// Persists a frontend-generated file at a path selected by the user.
pub(crate) fn export_file(output_path: String, content_base64: String) -> anyhow::Result<()> {
    let output_path = clean_input_path(&output_path);
    if output_path.as_os_str().is_empty() {
        bail!("Choose an export path before saving the file.");
    }
    let parent = output_path
        .parent()
        .filter(|parent| parent.is_dir())
        .context("The selected export folder does not exist.")?;
    let content = base64::engine::general_purpose::STANDARD
        .decode(content_base64.trim())
        .context("The export payload is not valid base64.")?;
    if content.len() > MAX_EXPORTED_FILE_BYTES {
        bail!("The exported file exceeds the 256 MB size limit.");
    }

    let temporary_path = parent.join(format!(
        ".{}.{}.tmp",
        output_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("export"),
        uuid::Uuid::new_v4()
    ));
    fs::write(&temporary_path, content).with_context(|| {
        format!(
            "Failed to write temporary export file {}",
            normalize_path(&temporary_path)
        )
    })?;
    if output_path.exists() {
        fs::remove_file(&output_path).with_context(|| {
            format!(
                "Failed to replace export file {}",
                normalize_path(&output_path)
            )
        })?;
    }
    if let Err(error) = fs::rename(&temporary_path, &output_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error).with_context(|| {
            format!(
                "Failed to save export file {}",
                normalize_path(&output_path)
            )
        });
    }

    Ok(())
}
