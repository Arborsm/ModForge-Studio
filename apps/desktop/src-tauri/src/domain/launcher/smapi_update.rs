//! SMAPI self-update support: detects the installed SMAPI/game versions, checks
//! the latest SMAPI GitHub release, picks a game-compatible target version, and
//! drives the official silent installer to upgrade an existing install.
//!
//! Version comparison uses the shared SMAPI-semantics helpers in
//! [`super::versions`]. The game-version compatibility table is a faithful port of
//! SMAPI's `Constants.GetCompatibleApiVersion` (src/SMAPI/Constants.cs) and must
//! be kept in sync with SMAPI releases.

use super::archive::{expand_archive_to_destination, with_expanded_archive};
use super::downloads::{
    NEXUS_STARDEW_VALLEY_GAME_ID, ensure_launcher_download_not_cancelled,
    is_launcher_download_cancelled, nexus_manual_download_url, take_cancelled_launcher_download,
};
use super::library::scan_library_at_path;
use super::paths::{
    current_timestamp_ms, launcher_settings_path, launcher_smapi_update_cache_path,
};
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    CheckSmapiUpdateResult, FindSmapiInstallerDownloadsResult, InstallSmapiUpdateRequest,
    InstallSmapiUpdateResult, SmapiInstallerDownloadCandidate, SmapiInstallerNaming,
    SmapiUpdateDownloadInfo, SmapiUpdateProgressPayload, SmapiUpdateRequiredByMod,
    SmapiVersionSource,
};
use super::updates::{resolve_smapi_runtime_versions, resolve_update_check_game_root};
use super::versions::{
    compare_parsed_versions, parse_mod_version, version_is_newer, version_is_prerelease,
};
use crate::AppHandle;
use crate::domain::nexusmods::downloads::download_file_response;
use crate::domain::nexusmods::http::launcher_http_client;
use crate::domain::nexusmods::mod_detail::{
    RemoteModDetail, load_remote_mod_detail_from_public_graphql,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::infrastructure::http::resumable_download::{
    PartialRetention, ResumableDownloadRequest, download_resumable,
};
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::fs;
use std::io;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

const SMAPI_RELEASES_LATEST_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases/latest";
const SMAPI_RELEASES_FIRST_PAGE_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases?per_page=1";
const SMAPI_RELEASE_BY_TAG_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases/tags/";
const SMAPI_UPDATE_PROGRESS_EVENT: &str = "launcher://smapi-update-progress";
const SMAPI_UPDATE_CACHE_TTL_MS: u128 = 30 * 60 * 1000;
const SMAPI_INSTALLER_ZIP_PREFIX: &str = "SMAPI-";
const SMAPI_INSTALLER_ZIP_SUFFIX: &str = "-installer.zip";
const SMAPI_INSTALLER_DOUBLE_ZIPPED_SUFFIX: &str = "-installer-double-zipped.zip";
const SMAPI_INSTALLER_STDERR_TAIL_CHARS: usize = 4000;
const SMAPI_NEXUS_MOD_ID: i64 = 2400;
const SMAPI_NEXUS_MOD_PAGE_URL: &str = "https://www.nexusmods.com/stardewvalley/mods/2400";
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Game version -> recommended SMAPI version table, ported from SMAPI's
/// `Constants.GetCompatibleApiVersion` (src/SMAPI/Constants.cs). SMAPI deliberately
/// lists only game updates that need a pinned older SMAPI; intermediate game
/// versions resolve to the nearest listed version at or below them (see
/// [`max_game_compatible_smapi_version`]).
const GAME_VERSION_SMAPI_TABLE: &[(&str, &str)] = &[
    ("1.6.8", "4.0.8"),
    ("1.6.7", "4.0.8"),
    ("1.6.6", "4.0.8"),
    ("1.6.5", "4.0.8"),
    ("1.6.4", "4.0.8"),
    ("1.6.3", "4.0.6"),
    ("1.6.2", "4.0.6"),
    ("1.6.1", "4.0.6"),
    ("1.6.0", "4.0.6"),
    ("1.5.6", "3.18.6"),
    ("1.5.5", "3.13.2"),
    ("1.5.4", "3.12.8"),
    ("1.5.3", "3.8.4"),
    ("1.5.2", "3.8.3"),
    ("1.5.1", "3.8.2"),
    ("1.5.0", "3.8.0"),
    ("1.4.5", "3.7.6"),
    ("1.4.4", "3.7.6"),
    ("1.4.3", "3.7.6"),
    ("1.4.2", "3.7.6"),
    ("1.4.1", "3.7.6"),
    ("1.4.0", "3.0.1"),
    ("1.3.36", "2.11.2"),
    ("1.3.33", "2.10.2"),
    ("1.3.32", "2.10.2"),
    ("1.3.28", "2.7.0"),
    ("1.2.33", "2.5.5"),
    ("1.2.32", "2.5.5"),
    ("1.2.31", "2.5.5"),
    ("1.2.30", "2.5.5"),
    ("1.2.29", "1.13.1"),
    ("1.2.28", "1.13.1"),
    ("1.2.27", "1.13.1"),
    ("1.2.26", "1.13.1"),
    ("1.1.1", "1.9.0"),
    ("1.1.0", "1.9.0"),
    ("1.0.7.1", "0.40.0"),
    ("1.0.7", "0.40.0"),
    ("1.0.6", "0.40.0"),
    ("1.0.5.2", "0.40.0"),
    ("1.0.5.1", "0.40.0"),
    ("1.0.5", "0.40.0"),
    ("1.0.4", "0.40.0"),
    ("1.0.3", "0.40.0"),
    ("1.0.2", "0.40.0"),
    ("1.0.1", "0.40.0"),
    ("1.0.0", "0.40.0"),
];

/// Minimum game version required by the current SMAPI stable release, used as the
/// fallback when a release body does not state its own requirement. Keep in sync
/// with SMAPI's `Constants.MinimumGameVersion` when bumping the table.
const SMAPI_LATEST_MINIMUM_GAME_VERSION: &str = "1.6.14";

static SMAPI_UPDATE_CACHE_FILE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn lock_smapi_update_cache_file() -> std::sync::MutexGuard<'static, ()> {
    match SMAPI_UPDATE_CACHE_FILE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
    {
        Ok(guard) => guard,
        Err(poisoned) => {
            LogEvent::new("launcher.lock.poisoned")
                .field("resource", "smapi-update-cache-file")
                .emit_error(targets::LAUNCHER);
            poisoned.into_inner()
        }
    }
}

/// A `SMAPI-{version}-installer.zip` GitHub release asset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SmapiReleaseAsset {
    name: String,
    url: String,
    size_bytes: Option<u64>,
    /// Hex SHA-256 digest without the `sha256:` prefix.
    sha256: Option<String>,
}

/// A parsed SMAPI GitHub release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SmapiRelease {
    /// Semantic version derived from `tag_name` (leading `v` stripped).
    version: String,
    prerelease: bool,
    /// `Requires Stardew Valley X or later` parsed from the release body, when stated.
    minimum_game_version: Option<String>,
    assets: Vec<SmapiReleaseAsset>,
}

impl SmapiRelease {
    fn from_github_value(payload: &Value) -> anyhow::Result<Self> {
        let tag_name = payload
            .get("tag_name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .context("SMAPI GitHub release response is missing tag_name.")?;
        let version = tag_name.trim_start_matches(['v', 'V']).trim();
        if version.is_empty() {
            bail!("SMAPI GitHub release tag {tag_name} does not contain a version.");
        }

        let prerelease = payload
            .get("prerelease")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let body = payload.get("body").and_then(Value::as_str).unwrap_or("");
        let minimum_game_version = parse_minimum_game_version_from_body(body);
        let assets = payload
            .get("assets")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|asset| {
                let name = asset
                    .get("name")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let url = asset
                    .get("browser_download_url")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())?;
                let size_bytes = asset.get("size").and_then(Value::as_u64);
                let sha256 = asset
                    .get("digest")
                    .and_then(Value::as_str)
                    .and_then(|value| value.trim().strip_prefix("sha256:"))
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned);
                Some(SmapiReleaseAsset {
                    name: name.to_string(),
                    url: url.to_string(),
                    size_bytes,
                    sha256,
                })
            })
            .collect::<Vec<_>>();

        Ok(Self {
            version: version.to_string(),
            prerelease,
            minimum_game_version,
            assets,
        })
    }

    /// The `SMAPI-{version}-installer.zip` asset, when present.
    fn installer_asset(&self, version: &str) -> Option<&SmapiReleaseAsset> {
        let expected_name =
            format!("{SMAPI_INSTALLER_ZIP_PREFIX}{version}{SMAPI_INSTALLER_ZIP_SUFFIX}");
        self.assets
            .iter()
            .find(|asset| asset.name.eq_ignore_ascii_case(&expected_name))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SmapiLatestReleaseCacheEntry {
    checked_at_ms: u128,
    expires_at_ms: u128,
    release: SmapiRelease,
}

/// Loads the cached latest-stable release; a missing, expired, or unreadable cache
/// entry is a miss (the cache is an optimization, never a correctness gate).
fn load_cached_latest_smapi_release(cache_path: &Path, now_ms: u128) -> Option<SmapiRelease> {
    if !cache_path.is_file() {
        return None;
    }
    let content = read_text_file(cache_path).ok()?;
    let entry: SmapiLatestReleaseCacheEntry = serde_json::from_str(&content).ok()?;
    if entry.expires_at_ms <= now_ms {
        return None;
    }
    Some(entry.release)
}

fn save_latest_smapi_release_cache(
    cache_path: &Path,
    release: &SmapiRelease,
    now_ms: u128,
) -> anyhow::Result<()> {
    let _cache_file_guard = lock_smapi_update_cache_file();
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create SMAPI update cache directory {}",
                normalize_path(parent)
            )
        })?;
    }
    let entry = SmapiLatestReleaseCacheEntry {
        checked_at_ms: now_ms,
        expires_at_ms: now_ms.saturating_add(SMAPI_UPDATE_CACHE_TTL_MS),
        release: release.clone(),
    };
    let json = serde_json::to_string_pretty(&entry)
        .with_context(|| format!("Failed to serialize SMAPI update cache JSON"))?;
    fs::write(cache_path, format!("{json}\n")).with_context(|| {
        format!(
            "Failed to write SMAPI update cache {}",
            normalize_path(cache_path)
        )
    })?;
    Ok(())
}

fn github_headers() -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(concat!("ModForge Studio/", env!("CARGO_PKG_VERSION"))),
    );
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/vnd.github+json"),
    );
    Ok(headers)
}

fn fetch_github_json(client: &Client, url: &str) -> anyhow::Result<Value> {
    let response = client
        .get(url)
        .headers(github_headers()?)
        .send()
        .with_context(|| format!("SMAPI GitHub release request failed: {url}"))?;
    if !response.status().is_success() {
        bail!(
            "SMAPI GitHub release request failed: HTTP {} for {url}",
            response.status()
        );
    }
    response
        .json::<Value>()
        .with_context(|| format!("Failed to parse SMAPI GitHub release response for {url}"))
}

fn fetch_latest_smapi_release(client: &Client) -> anyhow::Result<SmapiRelease> {
    let payload = fetch_github_json(client, SMAPI_RELEASES_LATEST_ENDPOINT)?;
    SmapiRelease::from_github_value(&payload)
}

/// The newest non-draft release including prereleases (used when the installed
/// SMAPI is itself a prerelease; see [`check_smapi_update_blocking`]).
fn fetch_newest_smapi_release(client: &Client) -> anyhow::Result<Option<SmapiRelease>> {
    let payload = fetch_github_json(client, SMAPI_RELEASES_FIRST_PAGE_ENDPOINT)?;
    let releases = payload
        .as_array()
        .context("SMAPI GitHub release list response is not an array.")?;
    let newest = releases
        .iter()
        .find(|release| {
            !release
                .get("draft")
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .map(SmapiRelease::from_github_value)
        .transpose()?;
    Ok(newest)
}

fn fetch_smapi_release_by_tag(client: &Client, version: &str) -> anyhow::Result<SmapiRelease> {
    let payload = fetch_github_json(client, &format!("{SMAPI_RELEASE_BY_TAG_ENDPOINT}{version}"))?;
    SmapiRelease::from_github_value(&payload)
}

/// Recognized SMAPI installer archive naming.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SmapiInstallerFileKind {
    Github { double_zipped: bool },
    Nexus,
}

/// Parses a SMAPI installer archive file name into its version and naming:
/// - GitHub: `SMAPI-{version}-installer.zip` and
///   `SMAPI-{version}-installer-double-zipped.zip` (case-insensitive);
/// - Nexus: `SMAPI {version}-2400-{version}-{timestamp}.zip` (space-separated,
///   mod id 2400, dash-separated version digits then a numeric timestamp).
/// Returns `None` for anything that is not a recognized SMAPI installer archive.
fn parse_smapi_installer_file_name(file_name: &str) -> Option<(String, SmapiInstallerFileKind)> {
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

/// Builds a [`SmapiRelease`] from the Nexus public GraphQL mod detail for SMAPI
/// (mod 2400). Nexus carries no sha256 and no minimum game version, so both stay
/// absent; the primary file info feeds the manual-download UI.
fn smapi_release_from_nexus_detail(detail: &RemoteModDetail, version: &str) -> SmapiRelease {
    let file_name = detail
        .primary_file_name
        .clone()
        .unwrap_or_else(|| format!("SMAPI {version}"));
    SmapiRelease {
        version: version.to_string(),
        prerelease: version_is_prerelease(version),
        minimum_game_version: None,
        assets: vec![SmapiReleaseAsset {
            name: file_name,
            url: String::new(),
            size_bytes: detail.primary_file_size_bytes.or(detail.primary_file_size),
            sha256: None,
        }],
    }
}

/// The resolved latest-version lookup plus the source that produced it.
#[derive(Debug)]
struct ResolvedSmapiLatest {
    release: SmapiRelease,
    source: SmapiVersionSource,
    /// Nexus mod detail when `source` is Nexus (feeds the manual-download info).
    nexus_detail: Option<RemoteModDetail>,
}

/// Selects the latest-version source: GitHub wins, Nexus is the fallback, and a
/// structured error reports both attempts when both fail.
fn resolve_latest_smapi_source(
    github_result: Result<SmapiRelease, String>,
    nexus_result: Result<(SmapiRelease, RemoteModDetail), String>,
) -> anyhow::Result<ResolvedSmapiLatest> {
    match github_result {
        Ok(release) => Ok(ResolvedSmapiLatest {
            release,
            source: SmapiVersionSource::Github,
            nexus_detail: None,
        }),
        Err(github_error) => match nexus_result {
            Ok((release, nexus_detail)) => Ok(ResolvedSmapiLatest {
                release,
                source: SmapiVersionSource::Nexus,
                nexus_detail: Some(nexus_detail),
            }),
            Err(nexus_error) => bail!(
                "SMAPI version check failed: GitHub release lookup failed ({github_error}) and Nexus mod detail lookup failed ({nexus_error})."
            ),
        },
    }
}

/// Parses a `Requires Stardew Valley X or later` statement out of a release body.
fn parse_minimum_game_version_from_body(body: &str) -> Option<String> {
    let lower = body.to_ascii_lowercase();
    let marker = "stardew valley";
    let mut search_from = 0;
    while let Some(index) = lower[search_from..].find(marker) {
        let window_start = search_from + index + marker.len();
        let window_end = (window_start + 80).min(lower.len());
        if let Some(version) = first_version_token(&lower[window_start..window_end]) {
            return Some(version);
        }
        search_from = window_start;
    }
    None
}

/// Finds the first `x.y[.z]`-shaped version token in `value`.
fn first_version_token(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if !bytes[index].is_ascii_digit() {
            index += 1;
            continue;
        }
        let mut end = index;
        let mut dot_count = 0;
        while end < bytes.len() {
            if bytes[end].is_ascii_digit() {
                end += 1;
            } else if bytes[end] == b'.' && dot_count < 2 {
                dot_count += 1;
                end += 1;
            } else {
                break;
            }
        }
        let token = value[index..end].to_string();
        if parse_mod_version(&token).is_some() {
            return Some(token);
        }
        index = end;
    }
    None
}

/// The highest SMAPI version the given game version supports:
/// - the candidate latest when the game meets its minimum game version;
/// - otherwise the ported compatibility table: an exact game version match, or the
///   nearest listed game version at or below the user's game (never newer than what
///   the game is known to support).
/// Returns `None` for game versions older than every table entry or unparseable.
fn max_game_compatible_smapi_version(
    game_version: &str,
    candidate_latest: &str,
    candidate_latest_minimum_game_version: &str,
) -> Option<String> {
    let game_parsed = parse_mod_version(game_version)?;
    let game_meets_latest_minimum = parse_mod_version(candidate_latest_minimum_game_version)
        .is_none_or(|minimum| compare_parsed_versions(&game_parsed, &minimum) != Ordering::Less);
    if game_meets_latest_minimum {
        return Some(candidate_latest.to_string());
    }

    let mut nearest_below: Option<(super::versions::ParsedModVersion, &str)> = None;
    for (table_game, table_smapi) in GAME_VERSION_SMAPI_TABLE {
        let Some(table_parsed) = parse_mod_version(table_game) else {
            continue;
        };
        match compare_parsed_versions(&table_parsed, &game_parsed) {
            Ordering::Equal => return Some((*table_smapi).to_string()),
            Ordering::Less => {
                let is_newer_below = nearest_below.as_ref().is_none_or(|(current_best, _)| {
                    compare_parsed_versions(&table_parsed, current_best) == Ordering::Greater
                });
                if is_newer_below {
                    nearest_below = Some((table_parsed, table_smapi));
                }
            }
            Ordering::Greater => {}
        }
    }
    nearest_below.map(|(_, smapi)| smapi.to_string())
}

struct SmapiTargetSelection {
    target_version: String,
    update_available: bool,
}

/// Picks the SMAPI version to install:
/// - target is the highest game-compatible SMAPI (the latest release when the game
///   meets its minimum). Mod `MinimumApiVersion` pressure does not change the
///   target — the game-compatible maximum either satisfies it or nothing can — but
///   the unsatisfied mods stay visible via `requiredByMods`.
/// - when the game is older than every known mapping, the latest is reported for
///   reference only and no update is offered.
fn select_smapi_update_target(
    installed_version: &str,
    game_version: &str,
    candidate_latest: &str,
    candidate_latest_minimum_game_version: &str,
) -> SmapiTargetSelection {
    let Some(game_compatible) = max_game_compatible_smapi_version(
        game_version,
        candidate_latest,
        candidate_latest_minimum_game_version,
    ) else {
        return SmapiTargetSelection {
            target_version: candidate_latest.to_string(),
            update_available: false,
        };
    };
    SmapiTargetSelection {
        update_available: version_is_newer(installed_version, &game_compatible),
        target_version: game_compatible,
    }
}

/// Collects installed mods whose declared `MinimumApiVersion` is newer than the
/// installed SMAPI version, sorted by mod name. A missing/unreadable Mods folder
/// yields an empty list (nothing requires a newer SMAPI).
fn scan_required_smapi_mods(
    mods_path: &str,
    installed_version: &str,
) -> anyhow::Result<Vec<SmapiUpdateRequiredByMod>> {
    let mods_path = mods_path.trim();
    if mods_path.is_empty() {
        return Ok(Vec::new());
    }
    let mods_root = clean_input_path(mods_path);
    if !mods_root.is_dir() {
        return Ok(Vec::new());
    }

    let scan = scan_library_at_path(&mods_root)?;
    let mut required = scan
        .mods
        .iter()
        .filter_map(|summary| {
            let minimum_api_version = summary.minimum_api_version.as_deref()?;
            if !version_is_newer(installed_version, minimum_api_version) {
                return None;
            }
            Some(SmapiUpdateRequiredByMod {
                mod_id: summary
                    .unique_id
                    .clone()
                    .unwrap_or_else(|| summary.id.clone()),
                mod_name: summary.name.clone(),
                minimum_api_version: minimum_api_version.to_string(),
            })
        })
        .collect::<Vec<_>>();
    required.sort_by(|left, right| {
        left.mod_name
            .to_ascii_lowercase()
            .cmp(&right.mod_name.to_ascii_lowercase())
    });
    Ok(required)
}

/// Checks whether SMAPI can update: resolves installed versions, fetches the
/// latest release, scans mod `MinimumApiVersion` pressure, and picks the target.
///
/// The latest-version source chain is GitHub releases first (with a 30-minute disk
/// cache at `launcher/smapi-update-cache.json`), then Nexus Mods public GraphQL
/// (mod 2400) as the fallback; the response's `version_source` records which one
/// produced the result.
///
/// Beta channel: stable releases only by default. When the installed SMAPI version
/// is itself a prerelease, GitHub prereleases are also allowed by preferring the
/// newest GitHub release over the latest stable one; the Nexus fallback reports
/// whatever Nexus lists as its latest file.
pub fn check_smapi_update_blocking() -> anyhow::Result<CheckSmapiUpdateResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "check_smapi_update",
        (|| {
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
            let smapi_files = [
                game_root.join("StardewModdingAPI.dll"),
                game_root.join("StardewModdingAPI.exe"),
            ];
            if !smapi_files.iter().any(|path| path.is_file()) {
                bail!(
                    "SMAPI is not installed in {}. Install it once manually before using the SMAPI updater.",
                    normalize_path(&game_root)
                );
            }

            let versions = resolve_smapi_runtime_versions(&settings, mods_path);
            let installed_version = versions.api_version;
            let game_version = versions.game_version;
            let required_by_mods = scan_required_smapi_mods(mods_path, &installed_version)?;
            log_launcher_trace("smapiUpdate.check.start", |event| {
                event
                    .path("gameRoot", &game_root)
                    .field("installedVersion", &installed_version)
                    .field("gameVersion", &game_version)
                    .count("requiredByModCount", required_by_mods.len())
            });

            let client = launcher_http_client()?;
            let cache_path = launcher_smapi_update_cache_path()?;
            let now_ms = current_timestamp_ms();

            // Source chain: fresh disk cache or live GitHub first, then Nexus
            // public GraphQL; both failures produce one structured error.
            let github_result = (|| -> anyhow::Result<SmapiRelease> {
                if let Some(release) = load_cached_latest_smapi_release(&cache_path, now_ms) {
                    return Ok(release);
                }
                let release = fetch_latest_smapi_release(&client)?;
                save_latest_smapi_release_cache(&cache_path, &release, now_ms)?;
                Ok(release)
            })()
            .map_err(|error| error.to_string());
            let nexus_result = (|| -> anyhow::Result<(SmapiRelease, RemoteModDetail)> {
                let detail = load_remote_mod_detail_from_public_graphql(
                    &client,
                    &settings,
                    SMAPI_NEXUS_MOD_ID,
                    true,
                )?;
                let version = detail
                    .version
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .context("Nexus SMAPI mod detail did not include a version.")?;
                let release = smapi_release_from_nexus_detail(&detail, version);
                Ok((release, detail))
            })()
            .map_err(|error| error.to_string());
            let resolved_latest = resolve_latest_smapi_source(github_result, nexus_result)?;
            let latest_stable = resolved_latest.release;
            let version_source = resolved_latest.source;
            log_launcher_trace("smapiUpdate.check.source", |event| {
                event.field("source", version_source_label(version_source))
            });

            let allow_prereleases = version_is_prerelease(&installed_version);
            let mut candidate = latest_stable.clone();
            // The prerelease "newest release" probe is GitHub-only; the Nexus
            // fallback has no separate prerelease channel to consult.
            if version_source == SmapiVersionSource::Github && allow_prereleases {
                if let Some(newest) = fetch_newest_smapi_release(&client)? {
                    if version_is_newer(&candidate.version, &newest.version) {
                        candidate = newest;
                    }
                }
            }

            let latest_minimum_game_version = candidate
                .minimum_game_version
                .as_deref()
                .unwrap_or(SMAPI_LATEST_MINIMUM_GAME_VERSION);
            let selection = select_smapi_update_target(
                &installed_version,
                &game_version,
                &candidate.version,
                latest_minimum_game_version,
            );

            let download = if selection.update_available {
                match version_source {
                    SmapiVersionSource::Github => {
                        let target_release = if selection.target_version == candidate.version {
                            candidate.clone()
                        } else {
                            fetch_smapi_release_by_tag(&client, &selection.target_version)?
                        };
                        target_release
                            .installer_asset(&selection.target_version)
                            .map(|asset| SmapiUpdateDownloadInfo {
                                source: SmapiVersionSource::Github,
                                url: Some(asset.url.clone()),
                                sha256: asset.sha256.clone(),
                                size_bytes: asset.size_bytes,
                                asset_name: asset.name.clone(),
                                nexus_mod_page_url: None,
                                nexus_download_popup_url: None,
                                nexus_file_id: None,
                            })
                    }
                    SmapiVersionSource::Nexus => {
                        // Only the Nexus-listed latest file is known; older pinned
                        // targets have no Nexus file info to point at.
                        resolved_latest
                            .nexus_detail
                            .as_ref()
                            .and_then(|nexus_detail| {
                                let nexus_version = nexus_detail
                                    .version
                                    .as_deref()
                                    .map(str::trim)
                                    .unwrap_or_default();
                                if selection.target_version != nexus_version {
                                    return None;
                                }
                                Some(SmapiUpdateDownloadInfo {
                                    source: SmapiVersionSource::Nexus,
                                    url: None,
                                    sha256: None,
                                    size_bytes: nexus_detail
                                        .primary_file_size_bytes
                                        .or(nexus_detail.primary_file_size),
                                    asset_name: nexus_detail
                                        .primary_file_name
                                        .clone()
                                        .unwrap_or_else(|| {
                                            format!("SMAPI {}", selection.target_version)
                                        }),
                                    nexus_mod_page_url: Some(SMAPI_NEXUS_MOD_PAGE_URL.to_string()),
                                    nexus_download_popup_url: nexus_detail.primary_file_id.map(
                                        |file_id| {
                                            nexus_manual_download_url(
                                                file_id,
                                                NEXUS_STARDEW_VALLEY_GAME_ID,
                                            )
                                        },
                                    ),
                                    nexus_file_id: nexus_detail.primary_file_id,
                                })
                            })
                    }
                }
            } else {
                None
            };

            let result = CheckSmapiUpdateResult {
                installed_version,
                game_version,
                latest_stable_version: latest_stable.version.clone(),
                target_version: selection.target_version.clone(),
                update_available: selection.update_available,
                version_source,
                required_by_mods,
                download,
            };
            log_launcher_trace("smapiUpdate.check.complete", |event| {
                event
                    .field("latestStableVersion", &result.latest_stable_version)
                    .field("targetVersion", &result.target_version)
                    .flag("updateAvailable", result.update_available)
                    .field("versionSource", version_source_label(version_source))
                    .flag("allowedPrereleases", allow_prereleases)
                    .flag("hasVerifiedDownload", result.download.is_some())
            });
            Ok(result)
        })(),
    )
}

/// Stable wire label for a version source (`github` / `nexus`).
fn version_source_label(source: SmapiVersionSource) -> &'static str {
    match source {
        SmapiVersionSource::Github => "github",
        SmapiVersionSource::Nexus => "nexus",
    }
}

/// Normalizes a user-supplied SHA-256 digest: strips an optional `sha256:` prefix
/// and lowercases; fails hard on anything that is not exactly 64 hex characters.
fn normalize_expected_sha256(value: &str) -> anyhow::Result<String> {
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
fn validate_local_smapi_installer_file(
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
fn sha256_hex_of_file(path: &Path) -> anyhow::Result<String> {
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
                let temp_root = super::archive::temp_work_dir("smapi-update");
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

/// Scans the user's download directories (top level only) for SMAPI installer
/// archives they already downloaded manually, newest version first.
///
/// Directories: `settings.download_path` (when set) plus `dirs::download_dir()`.
/// The scan is deliberately non-recursive — installer zips land directly in the
/// Downloads folder and nested copies would only add noise.
///
/// `compatible` / `satisfies_target` are computed against the game-compatible
/// maximum and the current target version. The latest reference comes from the
/// fresh `check_smapi_update` disk cache (this is a cheap io command — no
/// network); when that, the game version, or the installed SMAPI is unavailable,
/// the flags are `None` rather than guessed. The command never errors for a
/// missing game setup; it returns candidates with unknown flags.
pub fn find_smapi_installer_downloads_blocking() -> anyhow::Result<FindSmapiInstallerDownloadsResult>
{
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "find_smapi_installer_downloads",
        (|| {
            let settings_path = launcher_settings_path()?;
            let settings = load_or_create_settings_at_path(&settings_path)?;

            let mut dirs = Vec::new();
            if let Some(path) = settings
                .download_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(clean_input_path)
            {
                dirs.push(path);
            }
            if let Some(default_dir) = dirs::download_dir() {
                let default_dir = clean_input_path(&default_dir.to_string_lossy());
                if !dirs
                    .iter()
                    .any(|dir| normalize_path(dir) == normalize_path(&default_dir))
                {
                    dirs.push(default_dir);
                }
            }

            let mods_path = settings
                .mods_path
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or_default();
            let game_root = resolve_update_check_game_root(&settings, mods_path);
            let game_root_ready = game_root.as_deref().is_some_and(|root| root.is_dir());
            let installed_detected = game_root_ready
                && (game_root
                    .as_deref()
                    .expect("game root present when ready")
                    .join("StardewModdingAPI.dll")
                    .is_file()
                    || game_root
                        .as_deref()
                        .expect("game root present when ready")
                        .join("StardewModdingAPI.exe")
                        .is_file());

            let cache_path = launcher_smapi_update_cache_path()?;
            let now_ms = current_timestamp_ms();
            let cached_latest = load_cached_latest_smapi_release(&cache_path, now_ms);

            let game_compatible_max = match (game_root_ready, cached_latest.as_ref()) {
                (true, Some(latest)) => {
                    let versions = resolve_smapi_runtime_versions(&settings, mods_path);
                    max_game_compatible_smapi_version(
                        &versions.game_version,
                        &latest.version,
                        latest
                            .minimum_game_version
                            .as_deref()
                            .unwrap_or(SMAPI_LATEST_MINIMUM_GAME_VERSION),
                    )
                }
                _ => None,
            };
            let target_version = if installed_detected {
                Some(game_compatible_max.clone().unwrap_or_else(|| {
                    resolve_smapi_runtime_versions(&settings, mods_path).api_version
                }))
            } else {
                None
            };

            let mut candidates = Vec::new();
            for dir in dirs {
                collect_installer_candidates_from_dir(&dir, &mut candidates);
            }
            enrich_installer_candidate_flags(
                &mut candidates,
                game_compatible_max.as_deref(),
                target_version.as_deref(),
            );
            sort_installer_candidates(&mut candidates);
            log_launcher_trace("smapiUpdate.find.complete", |event| {
                event.count("candidateCount", candidates.len())
            });
            Ok(FindSmapiInstallerDownloadsResult { candidates })
        })(),
    )
}

/// Sorts candidates newest version first (ties by file name).
fn sort_installer_candidates(candidates: &mut [SmapiInstallerDownloadCandidate]) {
    candidates.sort_by(|left, right| {
        match (
            parse_mod_version(&left.version),
            parse_mod_version(&right.version),
        ) {
            (Some(left_version), Some(right_version)) => {
                compare_parsed_versions(&right_version, &left_version)
                    .then_with(|| left.file_name.cmp(&right.file_name))
            }
            _ => left.file_name.cmp(&right.file_name),
        }
    });
}

/// Collects recognized SMAPI installer archives from one directory (top level
/// only). Unreadable entries are skipped, never errors.
fn collect_installer_candidates_from_dir(
    dir: &Path,
    out: &mut Vec<SmapiInstallerDownloadCandidate>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(file_name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Some((version, kind)) = parse_smapi_installer_file_name(&file_name) else {
            continue;
        };
        let size_bytes = entry.metadata().ok().map(|metadata| metadata.len());
        let (double_zipped, naming) = match kind {
            SmapiInstallerFileKind::Github { double_zipped } => {
                (double_zipped, SmapiInstallerNaming::Github)
            }
            SmapiInstallerFileKind::Nexus => (false, SmapiInstallerNaming::Nexus),
        };
        out.push(SmapiInstallerDownloadCandidate {
            path: normalize_path(&path),
            file_name,
            version,
            size_bytes,
            double_zipped,
            naming,
            compatible: None,
            satisfies_target: None,
        });
    }
}

/// Computes the `compatible` / `satisfies_target` flags: version within the
/// game-compatible maximum, and version at or above the current target.
fn enrich_installer_candidate_flags(
    candidates: &mut [SmapiInstallerDownloadCandidate],
    game_compatible_max: Option<&str>,
    target_version: Option<&str>,
) {
    for candidate in candidates {
        candidate.compatible =
            game_compatible_max.map(|max| !version_is_newer(max, &candidate.version));
        candidate.satisfies_target =
            target_version.map(|target| !version_is_newer(&candidate.version, target));
    }
}

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/smapi_update_tests.rs"]
mod smapi_update_tests;
