//! SMAPI release model and version-check orchestration.
//!
//! Owns the GitHub release API fetching/parsing (with a 30-minute disk cache),
//! the Nexus Mods fallback, latest-source resolution and the
//! [`check_smapi_update_blocking`] entry point. Game-version compatibility logic
//! lives in [`super::versioning`]; installer archive naming lives in
//! [`super::installer`].

use super::installer::{SMAPI_INSTALLER_ZIP_PREFIX, SMAPI_INSTALLER_ZIP_SUFFIX};
use super::versioning::{
    SMAPI_LATEST_MINIMUM_GAME_VERSION, scan_required_smapi_mods, select_smapi_update_target,
};
use crate::domain::app_paths::{
    current_timestamp_ms, launcher_settings_path, launcher_smapi_update_cache_path,
};
use crate::domain::launcher::downloads::{NEXUS_STARDEW_VALLEY_GAME_ID, nexus_manual_download_url};
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    CheckSmapiUpdateResult, SmapiUpdateDownloadInfo, SmapiVersionSource,
};
use crate::domain::launcher::updates::{
    resolve_smapi_runtime_versions, resolve_update_check_game_root,
};
use crate::domain::launcher::versions::{
    parse_mod_version, version_is_newer, version_is_prerelease,
};
use crate::domain::nexusmods::http::launcher_http_client;
use crate::domain::nexusmods::mod_detail::{
    RemoteModDetail, load_remote_mod_detail_from_public_graphql,
};
use crate::domain::nexusmods::request::NexusRequestContext;
use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::text_encoding::read_text_file;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, HeaderMap, HeaderValue, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

const SMAPI_RELEASES_LATEST_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases/latest";
const SMAPI_RELEASES_FIRST_PAGE_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases?per_page=1";
const SMAPI_RELEASE_BY_TAG_ENDPOINT: &str =
    "https://api.github.com/repos/Pathoschild/SMAPI/releases/tags/";
const SMAPI_UPDATE_CACHE_TTL_MS: u128 = 30 * 60 * 1000;
pub(crate) const SMAPI_NEXUS_MOD_ID: i64 = 2400;
pub(crate) const SMAPI_NEXUS_MOD_PAGE_URL: &str =
    "https://www.nexusmods.com/stardewvalley/mods/2400";

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
pub(crate) struct SmapiReleaseAsset {
    pub(crate) name: String,
    pub(crate) url: String,
    pub(crate) size_bytes: Option<u64>,
    /// Hex SHA-256 digest without the `sha256:` prefix.
    pub(crate) sha256: Option<String>,
}

/// A parsed SMAPI GitHub release.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SmapiRelease {
    /// Semantic version derived from `tag_name` (leading `v` stripped).
    pub(crate) version: String,
    pub(crate) prerelease: bool,
    /// `Requires Stardew Valley X or later` parsed from the release body, when stated.
    pub(crate) minimum_game_version: Option<String>,
    pub(crate) assets: Vec<SmapiReleaseAsset>,
}

impl SmapiRelease {
    pub(crate) fn from_github_value(payload: &Value) -> anyhow::Result<Self> {
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
    pub(crate) fn installer_asset(&self, version: &str) -> Option<&SmapiReleaseAsset> {
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
pub(crate) fn load_cached_latest_smapi_release(
    cache_path: &Path,
    now_ms: u128,
) -> Option<SmapiRelease> {
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

/// Parses a `Requires Stardew Valley X or later` statement out of a release body.
pub(crate) fn parse_minimum_game_version_from_body(body: &str) -> Option<String> {
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

/// Builds a [`SmapiRelease`] from the Nexus public GraphQL mod detail for SMAPI
/// (mod 2400). Nexus carries no sha256 and no minimum game version, so both stay
/// absent; the primary file info feeds the manual-download UI.
pub(crate) fn smapi_release_from_nexus_detail(
    detail: &RemoteModDetail,
    version: &str,
) -> SmapiRelease {
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
pub(crate) struct ResolvedSmapiLatest {
    pub(crate) release: SmapiRelease,
    pub(crate) source: SmapiVersionSource,
    /// Nexus mod detail when `source` is Nexus (feeds the manual-download info).
    pub(crate) nexus_detail: Option<RemoteModDetail>,
}

/// Selects the latest-version source: GitHub wins, Nexus is the fallback, and a
/// structured error reports both attempts when both fail.
pub(crate) fn resolve_latest_smapi_source(
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
                    &NexusRequestContext::new(settings.nexus_api_key.clone()),
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
