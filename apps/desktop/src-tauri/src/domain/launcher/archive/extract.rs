use crate::domain::launcher::install_manager::normalize_relative_path;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::text_encoding::decode_text_bytes;
use anyhow::{Context, bail};
use flate2::read::GzDecoder;
use sevenz_rust::{Error as SevenZipError, decompress_file_with_extract_fn};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tar::Archive as TarArchive;
use unrar::Archive as RarArchive;
use zip::ZipArchive;

static TEMP_WORK_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Archive-relative file path (forward slashes) -> unix epoch milliseconds of
/// the entry's last-modified time, captured from archive entry metadata during
/// extraction. Only populated when the archive format exposes mtimes.
pub(crate) type ArchiveEntryMtimes = BTreeMap<String, u128>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum LauncherArchiveFormat {
    Zip,
    SevenZip,
    Rar,
    Tar,
    TarGz,
    Tgz,
}

pub(crate) fn system_time_ms(time: SystemTime) -> Option<u128> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis())
}

/// Converts DOS date/time fields (zip entries, RAR headers) to a system time.
/// Invalid field combinations return `None`.
fn dos_fields_to_system_time(
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
) -> Option<SystemTime> {
    if month == 0 || day == 0 || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let month = time::Month::try_from(month).ok()?;
    let date = time::Date::from_calendar_date(i32::from(year), month, day).ok()?;
    let datetime = date.with_hms(hour, minute, second).ok()?;
    Some(datetime.assume_utc().into())
}

/// Converts a packed DOS date/time value (bits 15-0 date, 23-16 time) used by
/// RAR headers to a system time. `0` and invalid dates yield `None`.
fn dos_datetime_to_system_time(raw: u32) -> Option<SystemTime> {
    if raw == 0 {
        return None;
    }
    dos_fields_to_system_time(
        1980 + ((raw >> 25) & 0x7f) as u16,
        ((raw >> 21) & 0x0f) as u8,
        ((raw >> 16) & 0x1f) as u8,
        ((raw >> 11) & 0x1f) as u8,
        ((raw >> 5) & 0x3f) as u8,
        ((raw & 0x1f) as u8) * 2,
    )
}

/// Resolves a unique temp work directory for launcher operations. The caller owns
/// creation and cleanup; see [`with_temp_work_dir`] for the guarded variant.
pub(crate) fn temp_work_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = TEMP_WORK_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
    env::temp_dir().join(format!(
        "modforge-{name}-{}-{unique}-{counter}",
        std::process::id()
    ))
}

pub(crate) fn with_expanded_archive<T>(
    archive_path: &Path,
    operation: impl FnOnce(&Path) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    with_temp_work_dir("mod-inspect", "mod archive inspection", |temp_root| {
        expand_archive_to_path(archive_path, temp_root, None)?;
        operation(temp_root)
    })
}

pub(crate) fn with_temp_work_dir<T>(
    name: &str,
    purpose: &str,
    operation: impl FnOnce(&Path) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    let temp_root = temp_work_dir(name);
    if temp_root.exists() {
        let _ = fs::remove_dir_all(&temp_root);
    }
    fs::create_dir_all(&temp_root).with_context(|| {
        format!(
            "Failed to create launcher {purpose} directory {}",
            normalize_path(&temp_root)
        )
    })?;

    let result = operation(&temp_root);
    let _ = fs::remove_dir_all(&temp_root);
    result
}

pub(crate) fn expand_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    match detect_archive_format(archive_path)? {
        LauncherArchiveFormat::Zip => {
            expand_zip_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::SevenZip => expand_seven_zip_archive_to_path(
            archive_path,
            destination_path,
            entry_mtimes.as_deref_mut(),
        ),
        LauncherArchiveFormat::Rar => {
            expand_rar_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::Tar => {
            expand_tar_archive_to_path(archive_path, destination_path, entry_mtimes.as_deref_mut())
        }
        LauncherArchiveFormat::TarGz | LauncherArchiveFormat::Tgz => expand_tar_gz_archive_to_path(
            archive_path,
            destination_path,
            entry_mtimes.as_deref_mut(),
        ),
    }
}

/// Expands any supported archive into `destination_path` (path-traversal safe),
/// without capturing entry mtimes. Used by the SMAPI updater to unpack inner
/// "double-zipped" installer archives.
pub(crate) fn expand_archive_to_destination(
    archive_path: &Path,
    destination_path: &Path,
) -> anyhow::Result<()> {
    expand_archive_to_path(archive_path, destination_path, None)
}

/// Records the entry's modified time (when the format exposes one) into the
/// mtime map under its normalized relative path.
fn record_entry_mtime(
    entry_mtimes: Option<&mut ArchiveEntryMtimes>,
    relative_path: &Path,
    modified: Option<SystemTime>,
) {
    if let (Some(mtimes), Some(modified)) = (entry_mtimes, modified) {
        if let Some(ms) = system_time_ms(modified) {
            mtimes.insert(normalize_relative_path(relative_path), ms);
        }
    }
}

fn detect_archive_format(archive_path: &Path) -> anyhow::Result<LauncherArchiveFormat> {
    let file_name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name.ends_with(".tar.gz") {
        return Ok(LauncherArchiveFormat::TarGz);
    }
    if file_name.ends_with(".tgz") {
        return Ok(LauncherArchiveFormat::Tgz);
    }

    match archive_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("zip") => Ok(LauncherArchiveFormat::Zip),
        Some("7z") => Ok(LauncherArchiveFormat::SevenZip),
        Some("rar") => Ok(LauncherArchiveFormat::Rar),
        Some("tar") => Ok(LauncherArchiveFormat::Tar),
        _ => Err(anyhow::anyhow!(
            "Unsupported archive format: {}",
            archive_format_label(archive_path)
        )),
    }
}

fn archive_format_label(archive_path: &Path) -> String {
    let file_name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name.ends_with(".tar.gz") {
        return ".tar.gz".to_string();
    }
    if file_name.ends_with(".tgz") {
        return ".tgz".to_string();
    }

    archive_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_else(|| archive_path.display().to_string())
}

fn sanitize_archive_entry_path(path: &Path, archive_path: &Path) -> anyhow::Result<PathBuf> {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            _ => {
                bail!(
                    "Launcher archive {} contains an unsafe path entry: {}",
                    normalize_path(archive_path),
                    normalize_path(path)
                );
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        bail!(
            "Launcher archive {} contains an empty path entry: {}",
            normalize_path(archive_path),
            normalize_path(path)
        );
    }

    Ok(normalized)
}

fn decode_zip_entry_name<R: io::Read>(entry: &zip::read::ZipFile<'_, R>) -> String {
    let raw = entry.name_raw();
    if std::str::from_utf8(raw).is_ok() {
        return entry.name().to_string();
    }
    decode_text_bytes(raw)
}

fn expand_zip_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    let mut archive = ZipArchive::new(archive_file).with_context(|| {
        format!(
            "Failed to read launcher archive {} as a zip file",
            normalize_path(archive_path)
        )
    })?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).with_context(|| {
            format!(
                "Failed to read launcher archive entry #{index} from {}",
                normalize_path(archive_path)
            )
        })?;
        let decoded_name = decode_zip_entry_name(&entry);
        let relative_path = sanitize_archive_entry_path(Path::new(&decoded_name), archive_path)
            .with_context(|| {
                format!(
                    "Launcher archive {} contains an unsafe path entry: {}",
                    normalize_path(archive_path),
                    decoded_name
                )
            })?;
        let output_path = destination_path.join(&relative_path);

        if entry.is_dir() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        let modified = entry.last_modified().and_then(|datetime| {
            dos_fields_to_system_time(
                datetime.year(),
                datetime.month(),
                datetime.day(),
                datetime.hour(),
                datetime.minute(),
                datetime.second(),
            )
        });
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        let mut output_file = fs::File::create(&output_path).with_context(|| {
            format!(
                "Failed to create launcher archive output file {}",
                normalize_path(&output_path)
            )
        })?;
        io::copy(&mut entry, &mut output_file).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                decoded_name,
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

fn expand_tar_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    extract_tar_entries(
        TarArchive::new(archive_file),
        archive_path,
        destination_path,
        entry_mtimes.as_deref_mut(),
    )
}

fn expand_tar_gz_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let archive_file = fs::File::open(archive_path).with_context(|| {
        format!(
            "Failed to open launcher archive {}",
            normalize_path(archive_path)
        )
    })?;
    let decoder = GzDecoder::new(archive_file);
    extract_tar_entries(
        TarArchive::new(decoder),
        archive_path,
        destination_path,
        entry_mtimes.as_deref_mut(),
    )
}

fn extract_tar_entries<R: io::Read>(
    mut archive: TarArchive<R>,
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let entries = archive.entries().with_context(|| {
        format!(
            "Failed to read launcher archive {} as a tar file",
            normalize_path(archive_path)
        )
    })?;

    for entry in entries {
        let mut entry = entry.with_context(|| {
            format!(
                "Failed to read launcher archive entry from {}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = entry.path().with_context(|| {
            format!(
                "Failed to read launcher archive entry path from {}",
                normalize_path(archive_path)
            )
        })?;
        let relative_path = sanitize_archive_entry_path(relative_path.as_ref(), archive_path)?;
        let output_path = destination_path.join(&relative_path);
        let entry_type = entry.header().entry_type();

        if entry_type.is_dir() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            continue;
        }

        if !entry_type.is_file() {
            bail!(
                "Launcher archive {} contains an unsupported tar entry: {}",
                normalize_path(archive_path),
                normalize_path(&relative_path)
            );
        }

        let modified = entry
            .header()
            .mtime()
            .ok()
            .map(|seconds| UNIX_EPOCH + std::time::Duration::from_secs(seconds));
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        entry.unpack(&output_path).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                normalize_path(&relative_path),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}

fn expand_seven_zip_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    decompress_file_with_extract_fn(archive_path, destination_path, |entry, reader, _| {
        if entry.is_directory() && entry.name().is_empty() {
            return Ok(true);
        }

        let relative_path = sanitize_archive_entry_path(Path::new(entry.name()), archive_path)
            .map_err(|error| SevenZipError::other(error.to_string()))?;
        let output_path = destination_path.join(&relative_path);

        if entry.is_directory() {
            fs::create_dir_all(&output_path).map_err(|error| {
                SevenZipError::io_msg(
                    error,
                    format!(
                        "Failed to create launcher archive directory {}",
                        normalize_path(&output_path)
                    ),
                )
            })?;
            return Ok(true);
        }

        if entry.has_last_modified_date {
            let modified: SystemTime = entry.last_modified_date().into();
            record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, Some(modified));
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                SevenZipError::io_msg(
                    error,
                    format!(
                        "Failed to create launcher archive parent {}",
                        normalize_path(parent)
                    ),
                )
            })?;
        }

        let mut output_file = fs::File::create(&output_path).map_err(|error| {
            SevenZipError::io_msg(
                error,
                format!(
                    "Failed to create launcher archive output file {}",
                    normalize_path(&output_path)
                ),
            )
        })?;
        io::copy(reader, &mut output_file).map_err(|error| {
            SevenZipError::io_msg(
                error,
                format!(
                    "Failed to extract launcher archive entry {} to {}",
                    normalize_path(&relative_path),
                    normalize_path(&output_path)
                ),
            )
        })?;
        Ok(true)
    })
    .with_context(|| {
        format!(
            "Failed to extract launcher archive {} as a 7z file",
            normalize_path(archive_path)
        )
    })
}

fn expand_rar_archive_to_path(
    archive_path: &Path,
    destination_path: &Path,
    mut entry_mtimes: Option<&mut ArchiveEntryMtimes>,
) -> anyhow::Result<()> {
    let mut archive = RarArchive::new(archive_path)
        .open_for_processing()
        .with_context(|| {
            format!(
                "Failed to read launcher archive {} as a rar file",
                normalize_path(archive_path)
            )
        })?;

    while let Some(header) = archive.read_header().with_context(|| {
        format!(
            "Failed to read launcher archive entry from {}",
            normalize_path(archive_path)
        )
    })? {
        let relative_path =
            sanitize_archive_entry_path(header.entry().filename.as_path(), archive_path)?;
        let output_path = destination_path.join(&relative_path);

        if header.entry().is_directory() {
            fs::create_dir_all(&output_path).with_context(|| {
                format!(
                    "Failed to create launcher archive directory {}",
                    normalize_path(&output_path)
                )
            })?;
            archive = header.skip().with_context(|| {
                format!(
                    "Failed to advance launcher archive entry {}",
                    normalize_path(&relative_path)
                )
            })?;
            continue;
        }

        let modified = dos_datetime_to_system_time(header.entry().file_time);
        record_entry_mtime(entry_mtimes.as_deref_mut(), &relative_path, modified);

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent).with_context(|| {
                format!(
                    "Failed to create launcher archive parent {}",
                    normalize_path(parent)
                )
            })?;
        }

        archive = header.extract_to(&output_path).with_context(|| {
            format!(
                "Failed to extract launcher archive entry {} to {}",
                normalize_path(&relative_path),
                normalize_path(&output_path)
            )
        })?;
    }

    Ok(())
}
