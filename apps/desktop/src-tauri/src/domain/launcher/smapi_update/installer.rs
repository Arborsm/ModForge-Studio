//! SMAPI installer archive naming, download/verification and install execution.
//!
//! Owns the recognized installer archive naming (GitHub / Nexus), the official
//! silent installer execution, checksum verification and the local-file install
//! branch, plus the [`install_smapi_update_blocking`] entry point.

use crate::AppHandle;
use crate::domain::app_paths::launcher_settings_path;
use crate::domain::launcher::archive::{
    expand_archive_to_destination, temp_work_dir, with_expanded_archive,
};
use crate::domain::launcher::downloads::{
    ensure_launcher_download_not_cancelled, is_launcher_download_cancelled,
    take_cancelled_launcher_download,
};
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    InstallSmapiUpdateRequest, InstallSmapiUpdateResult, SmapiUpdateProgressPayload,
};
use crate::domain::launcher::updates::{
    resolve_smapi_runtime_versions, resolve_update_check_game_root,
};
use crate::domain::launcher::versions::parse_mod_version;
use crate::domain::nexusmods::downloads::download_file_response;
use crate::domain::nexusmods::http::launcher_http_client;
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::http::resumable_download::{
    PartialRetention, ResumableDownloadRequest, download_resumable,
};
use anyhow::{Context, bail};
use sha2::{Digest, Sha256};
use std::fs;
use std::io;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const SMAPI_UPDATE_PROGRESS_EVENT: &str = "launcher://smapi-update-progress";
pub(crate) const SMAPI_INSTALLER_ZIP_PREFIX: &str = "SMAPI-";
pub(crate) const SMAPI_INSTALLER_ZIP_SUFFIX: &str = "-installer.zip";
const SMAPI_INSTALLER_DOUBLE_ZIPPED_SUFFIX: &str = "-installer-double-zipped.zip";
const SMAPI_INSTALLER_STDERR_TAIL_CHARS: usize = 4000;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Recognized SMAPI installer archive naming.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SmapiInstallerFileKind {
    Github { double_zipped: bool },
    Nexus,
}

/// Parses a SMAPI installer archive file name into its version and naming:
/// - GitHub: `SMAPI-{version}-installer.zip` and
///   `SMAPI-{version}-installer-double-zipped.zip` (case-insensitive);
/// - Nexus: `SMAPI {version}-2400-{version}-{timestamp}.zip` (space-separated,
///   mod id 2400, dash-separated version digits then a numeric timestamp).
/// Returns `None` for anything that is not a recognized SMAPI installer archive.
pub(crate) fn parse_smapi_installer_file_name(
    file_name: &str,
) -> Option<(String, SmapiInstallerFileKind)> {
    let trimmed = file_name.trim();
    let lower = trimmed.to_ascii_lowercase();

    // GitHub: `SMAPI-{version}-installer.zip` and
    // `SMAPI-{version}-installer-double-zipped.zip`.
    if let Some(version) = lower
        .strip_prefix("smapi-")
        .and_then(|rest| rest.strip_suffix(SMAPI_INSTALLER_DOUBLE_ZIPPED_SUFFIX))
        && parse_mod_version(version).is_some()
    {
        return Some((
            version.to_string(),
            SmapiInstallerFileKind::Github {
                double_zipped: true,
            },
        ));
    }
    if let Some(version) = lower
        .strip_prefix("smapi-")
        .and_then(|rest| rest.strip_suffix(SMAPI_INSTALLER_ZIP_SUFFIX))
        && parse_mod_version(version).is_some()
    {
        return Some((
            version.to_string(),
            SmapiInstallerFileKind::Github {
                double_zipped: false,
            },
        ));
    }

    // Nexus: `SMAPI {version}-2400-{version}-{timestamp}.zip` (space-separated,
    // mod id 2400, dash-separated version digits then a numeric timestamp).
    if lower.starts_with("smapi ") && trimmed.ends_with(".zip") {
        let rest = &trimmed["smapi ".len()..trimmed.len() - 4];
        let mut segments = rest.split('-');
        let version = segments.next()?;
        if segments.next()? != "2400" {
            return None;
        }
        let parsed = parse_mod_version(version)?;
        let version_digit_count = version.split('.').count();
        let remaining = segments.collect::<Vec<_>>();
        // The dash-separated version digits must match the dot version, followed
        // by at least one numeric timestamp segment.
        if remaining.len() <= version_digit_count {
            return None;
        }
        for (index, segment) in remaining.iter().take(version_digit_count).enumerate() {
            if segment.parse::<u64>().ok() != Some(parsed.parts[index]) {
                return None;
            }
        }
        for segment in remaining.iter().skip(version_digit_count) {
            if segment.is_empty() || !segment.bytes().all(|byte| byte.is_ascii_digit()) {
                return None;
            }
        }
        return Some((version.to_string(), SmapiInstallerFileKind::Nexus));
    }

    None
}

/// Normalizes a user-supplied SHA-256 digest: strips an optional `sha256:` prefix
/// and lowercases; fails hard on anything that is not exactly 64 hex characters.
pub(crate) fn normalize_expected_sha256(value: &str) -> anyhow::Result<String> {
    let value = value
        .trim()
        .strip_prefix("sha256:")
        .unwrap_or(value.trim())
        .trim();
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        bail!(
            "expectedSha256 must be a 64-character hex SHA-256 digest (optionally prefixed with \"sha256:\")."
        );
    }
    Ok(value.to_ascii_lowercase())
}

/// Locates the platform-specific silent installer inside an extracted
/// `SMAPI-{version}-installer.zip` payload root and structurally validates the
/// package (the `internal/.../SMAPI.Installer[.exe]` executable plus `install.dat`
/// must both be present). Fails with an explicit "not a SMAPI installer" error
/// when either is missing.
fn locate_smapi_installer(expanded_root: &Path) -> anyhow::Result<PathBuf> {
    #[cfg(target_os = "windows")]
    let candidate = expanded_root
        .join("internal")
        .join("windows")
        .join("SMAPI.Installer.exe");
    #[cfg(target_os = "macos")]
    let candidate = expanded_root
        .join("internal")
        .join("macOS")
        .join("SMAPI.Installer");
    #[cfg(target_os = "linux")]
    let candidate = expanded_root
        .join("internal")
        .join("linux")
        .join("SMAPI.Installer");
    if !candidate.is_file() {
        bail!(
            "SMAPI installer archive does not contain the expected installer executable {}; this is not a valid SMAPI installer package.",
            normalize_path(&candidate)
        );
    }
    if !expanded_root.join("install.dat").is_file() {
        bail!(
            "SMAPI installer archive {} is missing install.dat; this is not a valid SMAPI installer package.",
            normalize_path(expanded_root)
        );
    }
    Ok(candidate)
}

/// Resolves the payload root after a first extraction: GitHub "double-zipped"
/// assets (and some manual downloads) contain exactly one inner SMAPI installer
/// zip; when that is the case, the inner zip is extracted and becomes the payload.
/// Any other layout (no inner zip, or several zips) is used as-is.
fn resolve_smapi_installer_payload_root(first_root: &Path) -> anyhow::Result<PathBuf> {
    let inner_zips = first_root
        .read_dir()
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().is_file())
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| parse_smapi_installer_file_name(name).is_some())
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    if inner_zips.len() != 1 {
        return Ok(first_root.to_path_buf());
    }
    let payload_root = first_root.join("payload");
    if payload_root.exists() {
        let _ = fs::remove_dir_all(&payload_root);
    }
    log_launcher_trace("smapiUpdate.install.innerZip", |event| {
        event.path("innerZipPath", &inner_zips[0])
    });
    expand_archive_to_destination(&inner_zips[0], &payload_root)
        .with_context(|| format!("Failed to extract inner SMAPI installer archive"))?;
    Ok(payload_root)
}

/// Runs the official silent installer. Non-zero exit codes are structured errors
/// carrying the exit code and the captured stderr tail.
fn run_smapi_installer(installer_path: &Path, game_root: &Path) -> anyhow::Result<()> {
    let mut command = Command::new(installer_path);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .arg("--no-prompt")
        .arg("--install")
        .arg("--game-path")
        .arg(game_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let output = command.output().with_context(|| {
        format!(
            "Failed to run SMAPI installer {}",
            normalize_path(installer_path)
        )
    })?;
    if !output.status.success() {
        let exit_code = output
            .status
            .code()
            .map(|code| code.to_string())
            .unwrap_or_else(|| "unknown (terminated by signal)".to_string());
        let stderr_tail = output_tail(&output.stderr, SMAPI_INSTALLER_STDERR_TAIL_CHARS);
        log_launcher_trace("smapiUpdate.installer.failed", |event| {
            event
                .path("installerPath", installer_path)
                .path("gameRoot", game_root)
                .field("exitCode", &exit_code)
                .field("stderrTail", &stderr_tail)
        });
        bail!("SMAPI installer failed with exit code {exit_code}: {stderr_tail}");
    }
    Ok(())
}

/// Last `max_chars` characters of a captured output stream, prefixed with `...`.
fn output_tail(bytes: &[u8], max_chars: usize) -> String {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim();
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let skip = text.chars().count() - max_chars;
    format!("...{}", text.chars().skip(skip).collect::<String>())
}

fn emit_smapi_update_progress(
    app: &AppHandle,
    phase: &str,
    percent: Option<f64>,
    message: &str,
) -> anyhow::Result<()> {
    app.emit(
        SMAPI_UPDATE_PROGRESS_EVENT,
        SmapiUpdateProgressPayload {
            phase: phase.to_string(),
            percent,
            message: message.to_string(),
        },
    )
    .map_err(anyhow::Error::msg)
    .with_context(|| format!("Failed to emit SMAPI update progress"))
}

/// Detects whether Stardew Valley or SMAPI is currently running (Windows
/// `tasklist`, POSIX `pgrep`). When detection itself fails, the game is assumed to
/// be closed; the installer would fail loudly if a running game locks the files.
fn is_game_process_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("tasklist")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/FO", "CSV", "/NH"])
            .output();
        match output {
            Ok(output) if output.status.success() => {
                let text = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
                text.contains("stardew valley") || text.contains("stardewmoddingapi")
            }
            Ok(_) => {
                log_launcher_trace("smapiUpdate.gameProcessCheck.failed", |event| {
                    event.field("reason", "tasklist-nonzero-exit")
                });
                false
            }
            Err(error) => {
                log_launcher_trace("smapiUpdate.gameProcessCheck.failed", |event| {
                    event.error(&error.to_string())
                });
                false
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("pgrep")
            .args(["-f", "StardewValley|Stardew Valley|StardewModdingAPI"])
            .output();
        match output {
            Ok(output) => output.status.success(),
            Err(error) => {
                log_launcher_trace("smapiUpdate.gameProcessCheck.failed", |event| {
                    event.error(&error.to_string())
                });
                false
            }
        }
    }
}

fn ensure_game_not_running() -> anyhow::Result<()> {
    if is_game_process_running() {
        bail!("Stardew Valley is currently running. Close the game before updating SMAPI.");
    }
    Ok(())
}

/// Validates the local-file install branch input: the path must be a readable
/// file whose name matches a recognized SMAPI installer naming. Returns the
/// parsed version and naming for logging. This is the anti-arbitrary-path guard —
/// anything else is rejected with a structured error.
pub(crate) fn validate_local_smapi_installer_file(
    path: &Path,
) -> anyhow::Result<(String, SmapiInstallerFileKind)> {
    if !path.is_file() {
        bail!(
            "localFilePath {} is not a readable file.",
            normalize_path(path)
        );
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let Some((version, kind)) = parse_smapi_installer_file_name(file_name) else {
        bail!(
            "localFilePath {} is not a recognized SMAPI installer archive. Expected SMAPI-{{version}}-installer.zip (or -installer-double-zipped.zip), or a Nexus download named \"SMAPI {{version}}-2400-...\".zip.",
            normalize_path(path)
        );
    };
    Ok((version, kind))
}

/// Computes the hex SHA-256 digest of a file.
pub(crate) fn sha256_hex_of_file(path: &Path) -> anyhow::Result<String> {
    let mut file = fs::File::open(path).with_context(|| {
        format!(
            "Failed to open {} for checksum verification",
            normalize_path(path)
        )
    })?;
    let mut hasher = Sha256::new();
    io::copy(&mut file, &mut hasher).with_context(|| {
        format!(
            "Failed to read {} for checksum verification",
            normalize_path(path)
        )
    })?;
    Ok(format!("{:x}", hasher.finalize()))
}

/// Downloads (or uses a local file), verifies, and silently installs the SMAPI
/// version described by the request. The game root is re-resolved from launcher
/// settings server-side; the client-supplied path is never trusted.
///
/// Local-file branch: when `local_file_path` is present the download phase is
/// skipped. The file must be a readable file whose name matches a recognized
/// SMAPI installer naming, and the extracted payload is validated structurally
/// (installer executable + `install.dat`). A provided `expected_sha256` is still
/// verified hard; without one, hashing is skipped.
///
/// Cancellation: the download phase cooperates with the shared launcher download
/// cancel set (`cancel_launcher_download` with the request's `job_id`). Once the
/// installer process starts, cancellation is not attempted.
pub fn install_smapi_update_blocking(
    app: &AppHandle,
    request: InstallSmapiUpdateRequest,
) -> anyhow::Result<InstallSmapiUpdateResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "install_smapi_update",
        (|| {
            let target_version = request.target_version.trim();
            if target_version.is_empty() {
                bail!("targetVersion is required.");
            }
            if parse_mod_version(target_version).is_none() {
                bail!("targetVersion is not a valid version: {target_version}");
            }
            let expected_sha256 = match request.expected_sha256.as_deref() {
                Some(value) => Some(normalize_expected_sha256(value)?),
                None => None,
            };
            let job_id = request
                .job_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty());
            let local_file_path = request
                .local_file_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(clean_input_path);

            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;
            let mods_path = settings
                .mods_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or_default();
            let game_root = resolve_update_check_game_root(&settings, mods_path)
                .context("Launcher game path is not configured.")?;
            if !game_root.is_dir() {
                bail!(
                    "Launcher game path {} does not exist.",
                    normalize_path(&game_root)
                );
            }
            ensure_game_not_running()?;

            // The temp root only exists for the download branch; local files are
            // read in place and extracted into `with_expanded_archive`'s own temp.
            let temp_root = if local_file_path.is_none() {
                let temp_root = temp_work_dir("smapi-update");
                if temp_root.exists() {
                    let _ = fs::remove_dir_all(&temp_root);
                }
                fs::create_dir_all(&temp_root).with_context(|| {
                    format!(
                        "Failed to create SMAPI update temp directory {}",
                        normalize_path(&temp_root)
                    )
                })?;
                Some(temp_root)
            } else {
                None
            };
            let result = (|| -> anyhow::Result<InstallSmapiUpdateResult> {
                let zip_path = if let Some(local_path) = local_file_path.as_deref() {
                    let (file_version, _) = validate_local_smapi_installer_file(local_path)?;
                    if let Some(expected) = expected_sha256.as_deref() {
                        emit_smapi_update_progress(
                            app,
                            "verifying",
                            None,
                            "Verifying SMAPI installer checksum",
                        )?;
                        let actual = sha256_hex_of_file(local_path)?;
                        if !actual.eq_ignore_ascii_case(expected) {
                            bail!(
                                "SMAPI installer SHA-256 verification failed for {}: expected {expected}, got {actual}.",
                                normalize_path(local_path)
                            );
                        }
                        emit_smapi_update_progress(
                            app,
                            "verifying",
                            Some(100.0),
                            "Verified SMAPI installer checksum",
                        )?;
                    }
                    log_launcher_trace("smapiUpdate.install.localFile", |event| {
                        event
                            .path("localPath", local_path)
                            .field("version", &file_version)
                            .flag("sha256Verified", expected_sha256.is_some())
                    });
                    local_path.to_path_buf()
                } else {
                    let download_url = request
                        .download_url
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .context("downloadUrl is required when no localFilePath is provided.")?;
                    let parsed_url = url::Url::parse(download_url).with_context(|| {
                        format!("downloadUrl is not a valid URL: {download_url}")
                    })?;
                    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
                        bail!("downloadUrl must use http or https.");
                    }
                    let expected_sha256 = expected_sha256.context(
                        "expectedSha256 is required when downloading the SMAPI installer.",
                    )?;
                    let temp_root = temp_root
                        .as_deref()
                        .expect("temp root exists for downloads");
                    let zip_path = temp_root.join("smapi-installer.zip");
                    let client = launcher_http_client()?;
                    ensure_launcher_download_not_cancelled(job_id)?;
                    let response = download_file_response(&client, download_url, None, None)?;
                    ensure_launcher_download_not_cancelled(job_id)?;
                    if !response.status().is_success() {
                        bail!(
                            "Failed to download SMAPI installer: HTTP {}",
                            response.status()
                        );
                    }

                    emit_smapi_update_progress(
                        app,
                        "downloading",
                        Some(0.0),
                        &format!("Downloading SMAPI {target_version} installer"),
                    )?;
                    let download = download_resumable(
                        &ResumableDownloadRequest {
                            destination: zip_path.clone(),
                            expected_size: None,
                            expected_sha256: Some(expected_sha256.clone()),
                            version_identity: format!("smapi:{target_version}"),
                            current_file: "SMAPI installer".to_string(),
                            file_index: 1,
                            file_count: 1,
                            partial_retention: PartialRetention::DeleteOnFailure,
                        },
                        Some(response),
                        |resume| {
                            download_file_response(
                                &client,
                                download_url,
                                Some(resume.start),
                                resume.if_range.as_deref(),
                            )
                        },
                        || {
                            let Some(job_id) = job_id else {
                                return Ok(false);
                            };
                            let cancelled = is_launcher_download_cancelled(job_id)?;
                            if cancelled {
                                let _ = take_cancelled_launcher_download(job_id)?;
                            }
                            Ok(cancelled)
                        },
                        |progress| {
                            let percent = progress.total_bytes.map(|total| {
                                if total == 0 {
                                    0.0
                                } else {
                                    progress.downloaded_bytes as f64 / total as f64 * 100.0
                                }
                            });
                            emit_smapi_update_progress(
                                app,
                                "downloading",
                                percent,
                                &format!("Downloading SMAPI {target_version} installer"),
                            )
                        },
                    )?;
                    log_launcher_trace("smapiUpdate.install.downloaded", |event| {
                        event
                            .path("zipPath", &zip_path)
                            .field("bytes", download.size)
                    });

                    // `download_resumable` verified the SHA-256 (hard failure on
                    // mismatch); never install a misverified archive.
                    emit_smapi_update_progress(
                        app,
                        "verifying",
                        Some(100.0),
                        "Verified SMAPI installer checksum",
                    )?;
                    ensure_launcher_download_not_cancelled(job_id)?;
                    zip_path
                };

                with_expanded_archive(&zip_path, |first_root| {
                    emit_smapi_update_progress(
                        app,
                        "extracting",
                        None,
                        &format!("Extracting SMAPI {target_version} installer"),
                    )?;
                    let payload_root = resolve_smapi_installer_payload_root(first_root)?;
                    let installer_path = locate_smapi_installer(&payload_root)?;
                    emit_smapi_update_progress(
                        app,
                        "installing",
                        None,
                        &format!("Installing SMAPI {target_version}"),
                    )?;
                    run_smapi_installer(&installer_path, &game_root)?;
                    Ok(())
                })?;
                if let Some(job_id) = job_id {
                    let _ = take_cancelled_launcher_download(job_id)?;
                }

                let versions = resolve_smapi_runtime_versions(&settings, mods_path);
                log_launcher_trace("smapiUpdate.install.complete", |event| {
                    event
                        .path("gameRoot", &game_root)
                        .field("installedVersion", &versions.api_version)
                });
                Ok(InstallSmapiUpdateResult {
                    success: true,
                    installed_version: versions.api_version,
                })
            })();
            if let Some(temp_root) = temp_root {
                let _ = fs::remove_dir_all(&temp_root);
            }
            result
        })(),
    )
}
