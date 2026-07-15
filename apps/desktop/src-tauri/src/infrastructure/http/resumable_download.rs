use anyhow::{Context, bail};
use reqwest::StatusCode;
use reqwest::blocking::Response;
use reqwest::header::{CONTENT_LENGTH, CONTENT_RANGE, ETAG, LAST_MODIFIED};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const DOWNLOAD_CHUNK_SIZE: usize = 64 * 1024;
const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PartialRetention {
    Preserve,
    DeleteOnFailure,
}

#[derive(Clone, Debug)]
pub struct ResumableDownloadRequest {
    pub destination: PathBuf,
    pub expected_size: Option<u64>,
    pub expected_sha256: Option<String>,
    pub version_identity: String,
    pub current_file: String,
    pub file_index: u32,
    pub file_count: u32,
    pub partial_retention: PartialRetention,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ResumableDownloadProgress {
    pub current_file: String,
    pub phase: &'static str,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percentage: Option<f64>,
    pub bytes_per_second: Option<u64>,
    pub file_index: u32,
    pub file_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResumableDownloadResult {
    pub path: PathBuf,
    pub size: u64,
    pub sha256: String,
    pub resumed_from: u64,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ResumeRequest {
    pub start: u64,
    pub if_range: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartialMetadata {
    version_identity: String,
    expected_size: Option<u64>,
    expected_sha256: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
}

fn appended_path(path: &Path, suffix: &str) -> PathBuf {
    let mut name: OsString = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn partial_path(path: &Path) -> PathBuf {
    appended_path(path, ".part")
}

fn metadata_path(path: &Path) -> PathBuf {
    appended_path(path, ".part.json")
}

fn normalized_sha256(value: Option<&str>) -> anyhow::Result<Option<String>> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
                bail!("Expected SHA-256 must contain exactly 64 hexadecimal characters.")
            }
            Ok(value.to_ascii_lowercase())
        })
        .transpose()
}

fn read_metadata(path: &Path) -> anyhow::Result<Option<PartialMetadata>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(path).with_context(|| {
        format!(
            "Failed to read partial download metadata {}.",
            path.display()
        )
    })?;
    serde_json::from_slice(&bytes).map(Some).with_context(|| {
        format!(
            "Failed to parse partial download metadata {}.",
            path.display()
        )
    })
}

fn write_metadata(path: &Path, metadata: &PartialMetadata) -> anyhow::Result<()> {
    let temporary = appended_path(path, ".tmp");
    let bytes = serde_json::to_vec(metadata)?;
    {
        let mut file = File::create(&temporary).with_context(|| {
            format!(
                "Failed to create partial download metadata {}.",
                temporary.display()
            )
        })?;
        file.write_all(&bytes)?;
        file.sync_all()?;
    }
    if path.exists() {
        fs::remove_file(path).with_context(|| {
            format!(
                "Failed to replace partial download metadata {}.",
                path.display()
            )
        })?;
    }
    fs::rename(&temporary, path).with_context(|| {
        format!(
            "Failed to install partial download metadata {}.",
            path.display()
        )
    })
}

fn remove_if_exists(path: &Path) {
    if path.exists() {
        let _ = fs::remove_file(path);
    }
}

fn clear_partial(partial: &Path, metadata: &Path) {
    remove_if_exists(partial);
    remove_if_exists(metadata);
}

fn file_digest(path: &Path) -> anyhow::Result<(u64, String)> {
    let mut file = File::open(path)
        .with_context(|| format!("Failed to open downloaded file {}.", path.display()))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; DOWNLOAD_CHUNK_SIZE];
    let mut size = 0_u64;
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
        size += read as u64;
    }
    Ok((size, format!("{:x}", digest.finalize())))
}

fn validate_download(
    path: &Path,
    expected_size: Option<u64>,
    expected_sha256: Option<&str>,
) -> anyhow::Result<(u64, String)> {
    let (size, digest) = file_digest(path)?;
    if expected_size.is_some_and(|expected| expected != size) {
        bail!(
            "Downloaded file size mismatch: expected {} bytes, received {size} bytes.",
            expected_size.unwrap_or_default()
        );
    }
    if expected_sha256.is_some_and(|expected| expected != digest) {
        bail!("Downloaded file SHA-256 verification failed.");
    }
    Ok((size, digest))
}

fn header(response: &Response, name: reqwest::header::HeaderName) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn content_range(response: &Response) -> anyhow::Result<(u64, u64, Option<u64>)> {
    let value = response
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .context("Resumed download response did not contain a valid Content-Range header.")?;
    let value = value
        .strip_prefix("bytes ")
        .context("Resumed download Content-Range unit is not bytes.")?;
    let (range, total) = value
        .split_once('/')
        .context("Resumed download Content-Range is malformed.")?;
    let (start, end) = range
        .split_once('-')
        .context("Resumed download Content-Range byte range is malformed.")?;
    let start = start.parse::<u64>()?;
    let end = end.parse::<u64>()?;
    if end < start {
        bail!("Resumed download Content-Range end precedes its start.");
    }
    let total = if total == "*" {
        None
    } else {
        Some(total.parse::<u64>()?)
    };
    Ok((start, end, total))
}

fn percentage(downloaded: u64, total: Option<u64>) -> Option<f64> {
    total
        .filter(|value| *value > 0)
        .map(|total| ((downloaded as f64 / total as f64) * 100.0).clamp(0.0, 100.0))
}

fn should_emit_progress(elapsed: Duration) -> bool {
    elapsed >= PROGRESS_INTERVAL
}

fn progress(
    request: &ResumableDownloadRequest,
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    bytes_per_second: Option<u64>,
) -> ResumableDownloadProgress {
    ResumableDownloadProgress {
        current_file: request.current_file.clone(),
        phase,
        downloaded_bytes,
        total_bytes,
        percentage: percentage(downloaded_bytes, total_bytes),
        bytes_per_second,
        file_index: request.file_index,
        file_count: request.file_count,
    }
}

fn cleanup_on_failure(request: &ResumableDownloadRequest, partial: &Path, metadata: &Path) {
    if request.partial_retention == PartialRetention::DeleteOnFailure {
        clear_partial(partial, metadata);
    }
}

pub fn download_resumable<Send, Cancel, Progress>(
    request: &ResumableDownloadRequest,
    initial_response: Option<Response>,
    mut send: Send,
    mut is_cancelled: Cancel,
    mut on_progress: Progress,
) -> anyhow::Result<ResumableDownloadResult>
where
    Send: FnMut(ResumeRequest) -> anyhow::Result<Response>,
    Cancel: FnMut() -> anyhow::Result<bool>,
    Progress: FnMut(ResumableDownloadProgress) -> anyhow::Result<()>,
{
    let expected_sha256 = normalized_sha256(request.expected_sha256.as_deref())?;
    if request.version_identity.trim().is_empty() {
        bail!("Download version identity cannot be empty.");
    }
    if request.file_index == 0 || request.file_count == 0 || request.file_index > request.file_count
    {
        bail!("Download file position is invalid.");
    }
    if request.destination.exists() {
        let (size, digest) = validate_download(
            &request.destination,
            request.expected_size,
            expected_sha256.as_deref(),
        )?;
        return Ok(ResumableDownloadResult {
            path: request.destination.clone(),
            size,
            sha256: digest,
            resumed_from: size,
            etag: None,
            last_modified: None,
        });
    }
    let parent = request
        .destination
        .parent()
        .context("Download destination must have a parent directory.")?;
    fs::create_dir_all(parent)
        .with_context(|| format!("Failed to create download directory {}.", parent.display()))?;
    let partial = partial_path(&request.destination);
    let metadata_path = metadata_path(&request.destination);
    let mut stored = match read_metadata(&metadata_path) {
        Ok(value) => value,
        Err(_) => {
            clear_partial(&partial, &metadata_path);
            None
        }
    };
    let metadata_matches = stored.as_ref().is_some_and(|value| {
        value.version_identity == request.version_identity
            && value.expected_size == request.expected_size
            && value.expected_sha256 == expected_sha256
    });
    if partial.exists() && !metadata_matches {
        clear_partial(&partial, &metadata_path);
        stored = None;
    } else if !partial.exists() {
        remove_if_exists(&metadata_path);
        stored = None;
    }
    let mut resumed_from = partial.metadata().map(|value| value.len()).unwrap_or(0);
    if request
        .expected_size
        .is_some_and(|expected| resumed_from > expected)
    {
        clear_partial(&partial, &metadata_path);
        stored = None;
        resumed_from = 0;
    }
    if request
        .expected_size
        .is_some_and(|expected| resumed_from == expected && expected > 0)
    {
        on_progress(progress(
            request,
            "verifying",
            resumed_from,
            request.expected_size,
            Some(0),
        ))?;
        match validate_download(&partial, request.expected_size, expected_sha256.as_deref()) {
            Ok((size, digest)) => {
                fs::rename(&partial, &request.destination).with_context(|| {
                    format!(
                        "Failed to activate downloaded file {}.",
                        request.destination.display()
                    )
                })?;
                remove_if_exists(&metadata_path);
                on_progress(progress(request, "complete", size, Some(size), Some(0)))?;
                return Ok(ResumableDownloadResult {
                    path: request.destination.clone(),
                    size,
                    sha256: digest,
                    resumed_from,
                    etag: stored.as_ref().and_then(|value| value.etag.clone()),
                    last_modified: stored.and_then(|value| value.last_modified),
                });
            }
            Err(error) => {
                clear_partial(&partial, &metadata_path);
                return Err(error);
            }
        }
    }
    if is_cancelled()? {
        cleanup_on_failure(request, &partial, &metadata_path);
        bail!("Download was cancelled.");
    }
    let resume = ResumeRequest {
        start: resumed_from,
        if_range: stored
            .as_ref()
            .and_then(|value| value.etag.clone().or_else(|| value.last_modified.clone())),
    };
    let mut response = if resumed_from == 0 {
        match initial_response {
            Some(response) => response,
            None => send(resume.clone())?,
        }
    } else {
        send(resume.clone())?
    };
    if response.status() == StatusCode::RANGE_NOT_SATISFIABLE {
        cleanup_on_failure(request, &partial, &metadata_path);
        bail!("Download server rejected the requested byte range.");
    }
    if resumed_from > 0 && response.status() == StatusCode::OK {
        clear_partial(&partial, &metadata_path);
        stored = None;
        resumed_from = 0;
    } else if resumed_from > 0 {
        if response.status() != StatusCode::PARTIAL_CONTENT {
            cleanup_on_failure(request, &partial, &metadata_path);
            bail!("Resumed download failed with HTTP {}.", response.status());
        }
        let (start, _, _) = content_range(&response)?;
        if start != resumed_from {
            cleanup_on_failure(request, &partial, &metadata_path);
            bail!("Resumed download started at byte {start}, expected {resumed_from}.");
        }
        let response_etag = header(&response, ETAG);
        let response_modified = header(&response, LAST_MODIFIED);
        if stored.as_ref().is_some_and(|value| {
            value
                .etag
                .as_ref()
                .is_some_and(|etag| response_etag.as_ref() != Some(etag))
                || value
                    .last_modified
                    .as_ref()
                    .is_some_and(|modified| response_modified.as_ref() != Some(modified))
        }) {
            clear_partial(&partial, &metadata_path);
            bail!("Download server validators changed while resuming the file.");
        }
    }
    if !response.status().is_success() {
        cleanup_on_failure(request, &partial, &metadata_path);
        bail!("Download failed with HTTP {}.", response.status());
    }
    let response_etag = header(&response, ETAG).or_else(|| stored.as_ref()?.etag.clone());
    let response_modified =
        header(&response, LAST_MODIFIED).or_else(|| stored.as_ref()?.last_modified.clone());
    let response_total = if response.status() == StatusCode::PARTIAL_CONTENT {
        content_range(&response)?.2
    } else {
        response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .map(|value| value + resumed_from)
    };
    if let (Some(expected), Some(actual)) = (request.expected_size, response_total) {
        if expected != actual {
            cleanup_on_failure(request, &partial, &metadata_path);
            bail!("Download server reported {actual} bytes, expected {expected} bytes.");
        }
    }
    let total = request.expected_size.or(response_total);
    let metadata = PartialMetadata {
        version_identity: request.version_identity.clone(),
        expected_size: request.expected_size,
        expected_sha256: expected_sha256.clone(),
        etag: response_etag.clone(),
        last_modified: response_modified.clone(),
    };
    write_metadata(&metadata_path, &metadata)?;
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed_from > 0)
        .truncate(resumed_from == 0)
        .open(&partial)
        .with_context(|| format!("Failed to open partial download {}.", partial.display()))?;
    let mut downloaded = resumed_from;
    let mut buffer = [0_u8; DOWNLOAD_CHUNK_SIZE];
    let mut last_progress = Instant::now();
    let mut last_progress_bytes = downloaded;
    on_progress(progress(request, "downloading", downloaded, total, Some(0)))?;
    loop {
        if is_cancelled()? {
            cleanup_on_failure(request, &partial, &metadata_path);
            bail!("Download was cancelled.");
        }
        let read = match response.read(&mut buffer) {
            Ok(value) => value,
            Err(error) => {
                cleanup_on_failure(request, &partial, &metadata_path);
                return Err(error).context("Failed to stream download bytes.");
            }
        };
        if read == 0 {
            break;
        }
        if let Err(error) = file.write_all(&buffer[..read]) {
            cleanup_on_failure(request, &partial, &metadata_path);
            return Err(error).context("Failed to write partial download bytes.");
        }
        downloaded += read as u64;
        if should_emit_progress(last_progress.elapsed()) {
            let elapsed = last_progress.elapsed().as_secs_f64().max(0.001);
            let speed = ((downloaded - last_progress_bytes) as f64 / elapsed) as u64;
            on_progress(progress(
                request,
                "downloading",
                downloaded,
                total,
                Some(speed),
            ))?;
            last_progress = Instant::now();
            last_progress_bytes = downloaded;
        }
    }
    file.flush()?;
    file.sync_all()?;
    on_progress(progress(request, "verifying", downloaded, total, Some(0)))?;
    let (size, digest) = match validate_download(
        &partial,
        request.expected_size.or(total),
        expected_sha256.as_deref(),
    ) {
        Ok(value) => value,
        Err(error) => {
            clear_partial(&partial, &metadata_path);
            return Err(error);
        }
    };
    fs::rename(&partial, &request.destination).with_context(|| {
        format!(
            "Failed to activate downloaded file {}.",
            request.destination.display()
        )
    })?;
    remove_if_exists(&metadata_path);
    on_progress(progress(request, "complete", size, Some(size), Some(0)))?;
    Ok(ResumableDownloadResult {
        path: request.destination.clone(),
        size,
        sha256: digest,
        resumed_from,
        etag: response_etag,
        last_modified: response_modified,
    })
}

#[cfg(test)]
#[path = "../../tests/unit/infrastructure/resumable_download_tests.rs"]
mod tests;
