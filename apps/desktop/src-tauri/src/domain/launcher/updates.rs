use super::library::scan_library_at_path;
use super::settings::load_or_create_settings_at_path;
use super::trace::log_launcher_trace;
use super::types::{
    CheckLauncherUpdatesRequest, LauncherSettings, LauncherSuppressedUpdateModIdsResult,
    LauncherUpdateProgressPayload, LauncherUpdateSummary, LauncherUpdatesResult,
    LoadCachedLauncherUpdatesRequest, LoadSuppressedLauncherUpdateModIdsRequest,
};
use super::update_cache::{
    LauncherUpdatesCacheInspection, clear_launcher_update_auto_failures_at_path,
    clear_launcher_updates_check_in_progress_at_path, inspect_launcher_updates_cache_at_path,
    load_cached_launcher_updates_at_path, load_suppressed_launcher_update_mod_ids_at_path,
    mark_launcher_updates_check_in_progress_at_path, normalize_launcher_updates_cache_key,
    record_launcher_update_auto_failure_at_path, save_launcher_updates_cache_at_path,
};
pub(crate) use super::versions::version_is_newer;
use crate::AppHandle;
use crate::domain::app_paths::{
    current_timestamp_ms, launcher_settings_path, launcher_updates_cache_path,
};
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::http::launcher_http_client;
use crate::domain::nexusmods::mod_detail::{
    RemoteModDetail, load_remote_mod_detail_from_public_graphql,
};
use crate::domain::nexusmods::routes::LauncherNexusRoute;
use crate::domain::nexusmods::shared::{build_mod_page_url, normalize_nexus_url};
use crate::domain::nexusmods::updates::load_remote_mod_details_from_graphql;
use crate::infrastructure::fs::pathing::clean_input_path;
use crate::support::logging::{LogEvent, targets};
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use reqwest::header::{CONTENT_TYPE, HeaderMap, HeaderValue};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::sync::{Mutex, OnceLock};

const UPDATE_BATCH_SIZE: usize = 24;
const SMAPI_MOD_LOOKUP_ENDPOINT: &str = "https://smapi.io/api/v3.0/mods";
const SMAPI_APPLICATION_NAME: &str = "ModForge Studio";
const SMAPI_APPLICATION_VERSION: &str = env!("CARGO_PKG_VERSION");
const SMAPI_DEFAULT_API_VERSION: &str = "4.5.2";
const SMAPI_DEFAULT_GAME_VERSION: &str = "1.6.14";
const SMAPI_DEFAULT_PLATFORM: &str = "Windows";
const LAUNCHER_UPDATE_PROGRESS_EVENT: &str = "launcher://update-check-progress";
const LAUNCHER_UPDATES_CACHE_TTL_MS: u128 = 30 * 60 * 1000;
pub(crate) const AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD: u32 = 3;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
static ACTIVE_LAUNCHER_UPDATE_CHECKS: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

fn active_launcher_update_checks() -> &'static Mutex<HashMap<String, u32>> {
    ACTIVE_LAUNCHER_UPDATE_CHECKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn begin_launcher_update_check_activity(mods_path: &str) -> Option<String> {
    let cache_key = normalize_launcher_updates_cache_key(mods_path)?;
    let mut active_checks = active_launcher_update_checks()
        .lock()
        .expect("launcher update checks mutex poisoned");
    *active_checks.entry(cache_key.clone()).or_insert(0) += 1;
    Some(cache_key)
}

fn end_launcher_update_check_activity(cache_key: Option<&str>) {
    let Some(cache_key) = cache_key else {
        return;
    };

    let mut active_checks = active_launcher_update_checks()
        .lock()
        .expect("launcher update checks mutex poisoned");
    if let Some(active_count) = active_checks.get_mut(cache_key) {
        if *active_count > 1 {
            *active_count -= 1;
        } else {
            active_checks.remove(cache_key);
        }
    }
}

fn is_launcher_update_check_active(mods_path: &str) -> bool {
    let Some(cache_key) = normalize_launcher_updates_cache_key(mods_path) else {
        return false;
    };

    active_launcher_update_checks()
        .lock()
        .expect("launcher update checks mutex poisoned")
        .get(&cache_key)
        .copied()
        .unwrap_or(0)
        > 0
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UpdateCheckCandidate {
    pub(crate) mod_id: i64,
    pub(crate) unique_id: Option<String>,
    pub(crate) name: String,
    pub(crate) current_version: String,
    pub(crate) absolute_path: String,
    pub(crate) update_keys: Vec<String>,
}

pub(crate) fn dedupe_update_candidates_by_mod_id(
    candidates: &[UpdateCheckCandidate],
) -> Vec<UpdateCheckCandidate> {
    let mut seen = HashSet::new();
    candidates
        .iter()
        .filter(|candidate| seen.insert(candidate.mod_id))
        .cloned()
        .collect()
}

pub(crate) fn partition_update_candidates_for_request(
    candidates: Vec<UpdateCheckCandidate>,
    suppressed_mod_ids: &HashSet<i64>,
    force_refresh: bool,
) -> (Vec<UpdateCheckCandidate>, Vec<i64>) {
    if force_refresh || suppressed_mod_ids.is_empty() {
        return (candidates, Vec::new());
    }

    let mut allowed = Vec::with_capacity(candidates.len());
    let mut skipped = Vec::new();
    for candidate in candidates {
        if suppressed_mod_ids.contains(&candidate.mod_id) {
            skipped.push(candidate.mod_id);
        } else {
            allowed.push(candidate);
        }
    }

    (allowed, skipped)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SmapiRuntimeVersions {
    pub(crate) api_version: String,
    pub(crate) game_version: String,
    pub(crate) platform: String,
}

fn default_smapi_runtime_versions() -> SmapiRuntimeVersions {
    SmapiRuntimeVersions {
        api_version: SMAPI_DEFAULT_API_VERSION.to_string(),
        game_version: SMAPI_DEFAULT_GAME_VERSION.to_string(),
        platform: SMAPI_DEFAULT_PLATFORM.to_string(),
    }
}

fn parse_version_triplet(value: &str) -> Option<String> {
    let mut parts = Vec::new();
    let mut current = String::new();

    for ch in value.chars() {
        if ch.is_ascii_digit() {
            current.push(ch);
            continue;
        }

        if ch == '.' && !current.is_empty() && parts.len() < 2 {
            parts.push(current);
            current = String::new();
            continue;
        }

        if parts.is_empty() {
            current.clear();
            continue;
        }

        break;
    }

    if !current.is_empty() {
        parts.push(current);
    }

    if parts.len() < 3 {
        return None;
    }

    Some(parts.into_iter().take(3).collect::<Vec<_>>().join("."))
}

pub(crate) fn resolve_update_check_game_root(
    settings: &LauncherSettings,
    mods_path: &str,
) -> Option<PathBuf> {
    settings
        .game_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(clean_input_path)
        .or_else(|| {
            let mods_root = clean_input_path(mods_path);
            let folder_name = mods_root.file_name()?.to_string_lossy();
            if !folder_name.eq_ignore_ascii_case("mods") {
                return None;
            }
            mods_root.parent().map(Path::to_path_buf)
        })
}

#[cfg(target_os = "windows")]
pub(crate) fn read_windows_file_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }

    let escaped = path.to_string_lossy().replace('\'', "''");
    let mut command = Command::new("powershell");
    command
        .creation_flags(CREATE_NO_WINDOW)
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!(
            "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
             $item = Get-Item -LiteralPath '{escaped}'; \
             $version = $item.VersionInfo.ProductVersion; \
             if ([string]::IsNullOrWhiteSpace($version)) {{ $version = $item.VersionInfo.FileVersion }}; \
             if (-not [string]::IsNullOrWhiteSpace($version)) {{ [Console]::Out.Write($version) }}"
        ));
    let output = command.output().ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    parse_version_triplet(raw.trim())
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn read_windows_file_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    text.split(|character: char| !character.is_ascii_graphic())
        .find_map(|candidate| {
            let value = candidate.trim();
            (value.len() >= 5
                && value.chars().filter(|character| *character == '.').count() >= 2
                && value.split('.').take(3).all(|part| {
                    !part.is_empty() && part.chars().all(|character| character.is_ascii_digit())
                }))
            .then(|| parse_version_triplet(value))
            .flatten()
        })
}

pub(crate) fn resolve_smapi_runtime_versions_with_reader<F>(
    game_root: Option<&Path>,
    mut version_reader: F,
) -> SmapiRuntimeVersions
where
    F: FnMut(&Path) -> Option<String>,
{
    let mut resolved = default_smapi_runtime_versions();
    let Some(game_root) = game_root else {
        return resolved;
    };

    let api_candidates = [
        game_root.join("StardewModdingAPI.dll"),
        game_root.join("StardewModdingAPI.exe"),
    ];
    if let Some(api_version) = api_candidates
        .iter()
        .find_map(|path| version_reader(path).and_then(|value| parse_version_triplet(&value)))
    {
        resolved.api_version = api_version;
    }

    let game_candidates = [
        game_root.join("Stardew Valley.dll"),
        game_root.join("Stardew Valley.exe"),
    ];
    if let Some(game_version) = game_candidates
        .iter()
        .find_map(|path| version_reader(path).and_then(|value| parse_version_triplet(&value)))
    {
        resolved.game_version = game_version;
    }

    resolved
}

pub(crate) fn resolve_smapi_runtime_versions(
    settings: &LauncherSettings,
    mods_path: &str,
) -> SmapiRuntimeVersions {
    let game_root = resolve_update_check_game_root(settings, mods_path);
    resolve_smapi_runtime_versions_with_reader(game_root.as_deref(), read_windows_file_version)
}
fn smapi_headers() -> anyhow::Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        "Application-Name",
        HeaderValue::from_static(SMAPI_APPLICATION_NAME),
    );
    headers.insert(
        "Application-Version",
        HeaderValue::from_static(SMAPI_APPLICATION_VERSION),
    );
    headers.insert(
        "User-Agent",
        HeaderValue::from_static(concat!("ModForge Studio/", env!("CARGO_PKG_VERSION"))),
    );
    Ok(headers)
}

pub(crate) fn build_smapi_update_payload_with_versions(
    candidates: &[UpdateCheckCandidate],
    versions: &SmapiRuntimeVersions,
) -> Value {
    let mods = candidates
        .iter()
        .filter_map(|candidate| {
            let unique_id = candidate
                .unique_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())?;
            Some(json!({
                "ID": unique_id,
                "Version": candidate.current_version,
                "UpdateKeys": candidate.update_keys,
            }))
        })
        .collect::<Vec<_>>();

    json!({
        "Mods": mods,
        "ApiVersion": versions.api_version.clone(),
        "GameVersion": versions.game_version.clone(),
        "Platform": versions.platform.clone(),
        "IncludeExtendedMetadata": true,
    })
}

#[cfg(test)]
pub(crate) fn build_smapi_update_payload(candidates: &[UpdateCheckCandidate]) -> Value {
    build_smapi_update_payload_with_versions(candidates, &default_smapi_runtime_versions())
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}

fn string_at_path(value: &Value, path: &[&str]) -> Option<String> {
    value_at_path(value, path)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn first_string_at_paths(value: &Value, paths: &[&[&str]]) -> Option<String> {
    paths.iter().find_map(|path| string_at_path(value, path))
}

fn normalize_remote_mod_url(value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else if value.starts_with('/') {
        normalize_nexus_url(value)
    } else {
        value.to_string()
    }
}

fn normalize_smapi_mod_url(value: &str, mod_id: i64) -> String {
    let normalized = normalize_remote_mod_url(value);
    if normalized.contains("nexusmods.com/") {
        normalized
    } else {
        build_mod_page_url(mod_id)
    }
}

pub(crate) fn parse_smapi_update_response(
    payload: &Value,
    candidates: &[UpdateCheckCandidate],
) -> anyhow::Result<HashMap<i64, RemoteModDetail>> {
    let entries = payload
        .as_array()
        .or_else(|| payload.get("Mods").and_then(Value::as_array))
        .context("SMAPI mod lookup response did not contain an array payload.")?;

    let mut details = HashMap::new();
    for (candidate, entry) in candidates.iter().zip(entries.iter()) {
        let latest_version = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "Version"],
                &["Metadata", "Version"],
                &["Version"],
            ],
        );
        let Some(version) = latest_version else {
            continue;
        };

        let name = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "Name"],
                &["Metadata", "Name"],
                &["Name"],
            ],
        )
        .or_else(|| Some(candidate.name.clone()));
        let author = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "Author"],
                &["Metadata", "Author"],
                &["Author"],
            ],
        );
        let summary = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "Description"],
                &["Metadata", "Description"],
                &["Description"],
            ],
        );
        let mod_url = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "URL"],
                &["Metadata", "Main", "Url"],
                &["Metadata", "Main", "ModPageUrl"],
                &["Metadata", "Main", "ModUrl"],
                &["URL"],
                &["Url"],
            ],
        )
        .map(|value| normalize_smapi_mod_url(&value, candidate.mod_id))
        .unwrap_or_else(|| build_mod_page_url(candidate.mod_id));
        let image_url = first_string_at_paths(
            entry,
            &[
                &["Metadata", "Main", "ImageUrl"],
                &["Metadata", "Main", "ImageURL"],
                &["Metadata", "ImageUrl"],
                &["ImageUrl"],
            ],
        )
        .map(|value| normalize_remote_mod_url(&value));

        details.insert(
            candidate.mod_id,
            RemoteModDetail {
                name,
                author,
                summary,
                version: Some(version),
                image_url,
                ..RemoteModDetail::empty(candidate.mod_id, mod_url)
            },
        );
    }

    Ok(details)
}

fn load_remote_mod_details_from_smapi(
    client: &Client,
    candidates: &[UpdateCheckCandidate],
    versions: &SmapiRuntimeVersions,
) -> anyhow::Result<HashMap<i64, RemoteModDetail>> {
    let smapi_candidates = candidates
        .iter()
        .filter(|candidate| {
            candidate
                .unique_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some()
        })
        .cloned()
        .collect::<Vec<_>>();
    if smapi_candidates.is_empty() {
        return Ok(HashMap::new());
    }

    probe_blocked_launcher_nexus_route(client, None, LauncherNexusRoute::Smapi)?;
    let headers = smapi_headers()?;
    let payload = build_smapi_update_payload_with_versions(&smapi_candidates, versions);
    let response = client
        .post(SMAPI_MOD_LOOKUP_ENDPOINT)
        .headers(headers)
        .json(&payload)
        .send()
        .with_context(|| format!("SMAPI mod lookup request failed"))?;
    if !response.status().is_success() {
        bail!(
            "SMAPI mod lookup request failed: HTTP {}",
            response.status()
        );
    }

    let payload = response
        .json::<Value>()
        .with_context(|| format!("Failed to parse SMAPI mod lookup response"))?;
    parse_smapi_update_response(&payload, &smapi_candidates)
}

fn load_remote_mod_details_batch(
    _app: &AppHandle,
    client: &Client,
    settings: &LauncherSettings,
    candidates: &[UpdateCheckCandidate],
    smapi_versions: &SmapiRuntimeVersions,
) -> anyhow::Result<HashMap<i64, RemoteModDetail>> {
    if candidates.is_empty() {
        return Ok(HashMap::new());
    }

    let smapi_candidate_count = candidates
        .iter()
        .filter(|candidate| {
            candidate
                .unique_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some()
        })
        .count();
    let mut errors = Vec::new();
    let mut details = match load_remote_mod_details_from_smapi(client, candidates, smapi_versions) {
        Ok(details) => details,
        Err(error) => {
            LogEvent::new("updateCheck.smapi.fallback")
                .field("fallbackTo", "nexus-sources")
                .error(&error)
                .emit_warn(targets::LAUNCHER);
            errors.push(format!("SMAPI lookup failed: {error}"));
            HashMap::new()
        }
    };
    let missing_after_smapi = candidates
        .iter()
        .filter(|candidate| !details.contains_key(&candidate.mod_id))
        .cloned()
        .collect::<Vec<_>>();
    let unique_missing_after_smapi = dedupe_update_candidates_by_mod_id(&missing_after_smapi);
    let missing_after_smapi_mod_ids = unique_missing_after_smapi
        .iter()
        .map(|candidate| candidate.mod_id)
        .collect::<Vec<_>>();
    log_launcher_trace("updateCheck.smapi", |event| {
        event
            .count("candidateCount", candidates.len())
            .count("smapiCandidateCount", smapi_candidate_count)
            .count(
                "skippedNoUniqueIdCount",
                candidates.len().saturating_sub(smapi_candidate_count),
            )
            .count("resolvedCount", details.len())
            .count("missingCount", missing_after_smapi.len())
            .count("missingUniqueCount", unique_missing_after_smapi.len())
            .debug("missingModIds", &missing_after_smapi_mod_ids)
    });
    if missing_after_smapi.is_empty() {
        return Ok(details);
    }

    let mod_ids = unique_missing_after_smapi
        .iter()
        .map(|candidate| candidate.mod_id)
        .collect::<Vec<_>>();
    let can_use_graphql = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();
    let detail_count_before_graphql = details.len();
    if can_use_graphql {
        match load_remote_mod_details_from_graphql(client, settings, &mod_ids) {
            Ok(graphql_details) if !graphql_details.is_empty() => {
                details.extend(graphql_details);
            }
            Ok(_) => {}
            Err(error) => {
                LogEvent::new("updateCheck.graphql.batchFallback")
                    .field("fallbackTo", "single-lookups")
                    .error(&error)
                    .emit_warn(targets::LAUNCHER);
                errors.push(format!("GraphQL batch failed: {error}"));
            }
        }
    }

    let missing_after_graphql = unique_missing_after_smapi
        .into_iter()
        .filter(|candidate| !details.contains_key(&candidate.mod_id))
        .collect::<Vec<_>>();
    let missing_after_graphql_mod_ids = missing_after_graphql
        .iter()
        .map(|candidate| candidate.mod_id)
        .collect::<Vec<_>>();
    log_launcher_trace("updateCheck.graphql", |event| {
        event
            .flag("enabled", can_use_graphql)
            .count("requestedCount", mod_ids.len())
            .count(
                "resolvedCount",
                details.len().saturating_sub(detail_count_before_graphql),
            )
            .count("missingCount", missing_after_graphql.len())
            .debug("missingModIds", &missing_after_graphql_mod_ids)
    });
    let public_fallback_candidate_count = missing_after_graphql.len();
    let mut unresolved_mod_ids = Vec::new();
    let mut public_graphql_resolved = 0usize;
    for candidate in missing_after_graphql {
        match load_remote_mod_detail_from_public_graphql(client, settings, candidate.mod_id, false)
        {
            Ok(detail) => {
                public_graphql_resolved += 1;
                details.insert(candidate.mod_id, detail);
            }
            Err(public_error) => {
                LogEvent::new("updateCheck.publicGraphql.failed")
                    .field("modId", candidate.mod_id)
                    .error(&public_error)
                    .emit_warn(targets::LAUNCHER);
                unresolved_mod_ids.push(candidate.mod_id);
                errors.push(format!(
                    "mod {} public GraphQL failed: {}",
                    candidate.mod_id, public_error
                ));
            }
        }
    }
    log_launcher_trace("updateCheck.publicFallback", |event| {
        event
            .count("candidateCount", public_fallback_candidate_count)
            .count("publicGraphqlResolved", public_graphql_resolved)
            .count("unresolvedCount", unresolved_mod_ids.len())
            .debug("unresolvedModIds", &unresolved_mod_ids)
    });

    finalize_remote_mod_details_batch(details, unresolved_mod_ids, errors)
}

pub(crate) fn finalize_remote_mod_details_batch(
    details: HashMap<i64, RemoteModDetail>,
    unresolved_mod_ids: Vec<i64>,
    errors: Vec<String>,
) -> anyhow::Result<HashMap<i64, RemoteModDetail>> {
    if !unresolved_mod_ids.is_empty() && !errors.is_empty() {
        let mut unique_errors = errors;
        unique_errors.sort();
        unique_errors.dedup();
        LogEvent::new("updateCheck.batch.incomplete")
            .debug("unresolvedModIds", &unresolved_mod_ids)
            .error(unique_errors.join(" | "))
            .emit_warn(targets::LAUNCHER);
    }

    Ok(details)
}

fn log_launcher_updates_cache_trace(
    action: &str,
    mods_path: &str,
    inspection: &LauncherUpdatesCacheInspection,
    extend: impl FnOnce(LogEvent) -> LogEvent,
) {
    log_launcher_trace(action, |event| {
        extend(
            event
                .field("modsPath", mods_path)
                .optional("cacheKey", inspection.cache_key.as_deref())
                .field("entryState", inspection.entry_state.as_str())
                .optional("checkedAtMs", inspection.checked_at_ms)
                .optional("expiresAtMs", inspection.expires_at_ms)
                .optional("isComplete", inspection.is_complete)
                .optional("ttlRemainingMs", inspection.ttl_remaining_ms)
                .optional("expiredByMs", inspection.expired_by_ms)
                .field("activeChecks", inspection.in_progress_active_count)
                .optional(
                    "inProgressStartedAtMs",
                    inspection.in_progress_started_at_ms,
                ),
        )
    });
}

fn save_incremental_launcher_updates_cache(
    cache_path: &Path,
    mods_path: &str,
    updates: &[LauncherUpdateSummary],
    checked_count: usize,
    total_count: usize,
    is_complete: bool,
    session_id: &str,
) -> anyhow::Result<LauncherUpdatesResult> {
    let checked_at_ms = current_timestamp_ms();
    let partial_result = LauncherUpdatesResult {
        mods_path: mods_path.to_string(),
        checked_at_ms,
        is_complete,
        updates: updates.to_vec(),
    };
    save_launcher_updates_cache_at_path(
        cache_path,
        &partial_result,
        checked_at_ms,
        LAUNCHER_UPDATES_CACHE_TTL_MS,
    )?;
    let inspection = inspect_launcher_updates_cache_at_path(cache_path, mods_path, checked_at_ms)?;
    log_launcher_updates_cache_trace(
        if partial_result.is_complete {
            "updateCheck.cacheSave"
        } else {
            "updateCheck.cacheSavePartial"
        },
        mods_path,
        &inspection,
        |event| {
            event
                .field("ttlMs", LAUNCHER_UPDATES_CACHE_TTL_MS)
                .count("checkedCount", checked_count)
                .count("total", total_count)
                .count("updateCount", partial_result.updates.len())
                .field("sessionId", session_id)
        },
    );
    Ok(partial_result)
}

pub(crate) fn build_launcher_update_summary(
    candidate: &UpdateCheckCandidate,
    remote: &RemoteModDetail,
) -> Option<LauncherUpdateSummary> {
    let latest_version = remote
        .version
        .as_deref()
        .filter(|latest_version| version_is_newer(&candidate.current_version, latest_version))?;

    Some(LauncherUpdateSummary {
        mod_id: candidate.mod_id,
        name: remote
            .name
            .clone()
            .unwrap_or_else(|| candidate.name.clone()),
        author: remote.author.clone(),
        current_version: Some(candidate.current_version.clone()),
        latest_version: latest_version.to_string(),
        absolute_path: candidate.absolute_path.clone(),
        mod_url: remote.mod_url.clone(),
        image_url: remote.image_url.clone(),
        updated_at: remote.updated_at.clone(),
        file_size: remote.file_size,
    })
}

fn emit_update_check_progress(
    app: &AppHandle,
    mods_path: &str,
    session_id: &str,
    checked: usize,
    total: usize,
    current_mod_name: Option<&str>,
    updates: Option<&[LauncherUpdateSummary]>,
) -> anyhow::Result<()> {
    app.emit(
        LAUNCHER_UPDATE_PROGRESS_EVENT,
        LauncherUpdateProgressPayload {
            mods_path: mods_path.to_string(),
            session_id: session_id.to_string(),
            checked,
            total,
            current_mod_name: current_mod_name.map(str::to_string),
            updates: updates.map(|items| items.to_vec()),
        },
    )
    .map_err(anyhow::Error::msg)
    .with_context(|| format!("Failed to emit launcher update progress"))
}

pub fn load_cached_launcher_updates(
    _app: AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> anyhow::Result<Option<LauncherUpdatesResult>> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_cached_launcher_updates",
        (|| {
            let mods_path = request.mods_path.trim();
            if mods_path.is_empty() {
                bail!("modsPath is required.");
            }

            let cache_path = launcher_updates_cache_path()?;
            let now_ms = current_timestamp_ms();
            let had_active_check = is_launcher_update_check_active(mods_path);
            let inspection_before_clear =
                inspect_launcher_updates_cache_at_path(&cache_path, mods_path, now_ms)?;
            let cleared_stale_in_progress =
                !had_active_check && inspection_before_clear.in_progress_active_count > 0;
            if !had_active_check {
                clear_launcher_updates_check_in_progress_at_path(&cache_path, Some(mods_path))?;
            }
            let inspection_after_clear =
                inspect_launcher_updates_cache_at_path(&cache_path, mods_path, now_ms)?;
            if cleared_stale_in_progress {
                log_launcher_updates_cache_trace(
                    "updateCache.clearInProgress",
                    mods_path,
                    &inspection_after_clear,
                    |event| event.flag("hadActiveCheck", had_active_check),
                );
            }

            let cached = load_cached_launcher_updates_at_path(&cache_path, mods_path, now_ms)?;
            log_launcher_updates_cache_trace(
                if cached
                    .as_ref()
                    .map(|result| result.is_complete)
                    .unwrap_or(false)
                {
                    "updateCache.hit"
                } else if cached.is_some() {
                    "updateCache.partial"
                } else {
                    "updateCache.miss"
                },
                mods_path,
                &inspection_after_clear,
                |event| event.flag("hadActiveCheck", had_active_check),
            );
            Ok(cached)
        })(),
    )
}

pub(crate) fn load_launcher_suppressed_update_mod_ids_result_at_path(
    cache_path: &Path,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> anyhow::Result<LauncherSuppressedUpdateModIdsResult> {
    let mods_path = request.mods_path.trim();
    if mods_path.is_empty() {
        bail!("modsPath is required.");
    }

    let mut mod_ids = load_suppressed_launcher_update_mod_ids_at_path(
        cache_path,
        mods_path,
        AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
    )?
    .into_iter()
    .collect::<Vec<_>>();
    mod_ids.sort_unstable();

    Ok(LauncherSuppressedUpdateModIdsResult {
        mods_path: mods_path.to_string(),
        mod_ids,
    })
}

pub fn load_suppressed_launcher_update_mod_ids(
    _app: AppHandle,
    request: LoadSuppressedLauncherUpdateModIdsRequest,
) -> anyhow::Result<LauncherSuppressedUpdateModIdsResult> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_suppressed_launcher_update_mod_ids",
        (|| {
            let cache_path = launcher_updates_cache_path()?;
            load_launcher_suppressed_update_mod_ids_result_at_path(&cache_path, request)
        })(),
    )
}

pub(crate) fn check_launcher_updates_blocking(
    app: &AppHandle,
    request: &CheckLauncherUpdatesRequest,
) -> anyhow::Result<LauncherUpdatesResult> {
    let mods_path = request.mods_path.trim();
    if mods_path.is_empty() {
        bail!("modsPath is required.");
    }
    let session_id = request
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .context("sessionId is required.")?;

    let force_refresh = request.force_refresh.unwrap_or(false);
    let cache_path = launcher_updates_cache_path()?;
    if !force_refresh {
        let now_ms = current_timestamp_ms();
        let inspection = inspect_launcher_updates_cache_at_path(&cache_path, mods_path, now_ms)?;
        if let Some(cached) = load_cached_launcher_updates_at_path(&cache_path, mods_path, now_ms)?
        {
            if cached.is_complete {
                log_launcher_updates_cache_trace(
                    "updateCheck.cacheHit",
                    mods_path,
                    &inspection,
                    |event| event.count("updateCount", cached.updates.len()),
                );
                return Ok(cached);
            }

            log_launcher_updates_cache_trace(
                "updateCheck.cachePartial",
                mods_path,
                &inspection,
                |event| event.count("updateCount", cached.updates.len()),
            );
        }
        log_launcher_updates_cache_trace(
            "updateCheck.cacheMiss",
            mods_path,
            &inspection,
            |event| event,
        );
    } else {
        let inspection =
            inspect_launcher_updates_cache_at_path(&cache_path, mods_path, current_timestamp_ms())?;
        log_launcher_updates_cache_trace(
            "updateCheck.cacheBypass",
            mods_path,
            &inspection,
            |event| event.field("reason", "force-refresh"),
        );
    }
    let active_cache_key = begin_launcher_update_check_activity(mods_path);
    let result = (|| -> anyhow::Result<LauncherUpdatesResult> {
        let started_at_ms = current_timestamp_ms();
        mark_launcher_updates_check_in_progress_at_path(&cache_path, mods_path, started_at_ms)?;
        let in_progress_inspection =
            inspect_launcher_updates_cache_at_path(&cache_path, mods_path, started_at_ms)?;
        log_launcher_updates_cache_trace(
            "updateCheck.cacheMarkInProgress",
            mods_path,
            &in_progress_inspection,
            |event| event.field("sessionId", session_id),
        );

        let settings_path = launcher_settings_path()?;
        let settings = load_or_create_settings_at_path(&settings_path)?;
        let scan = scan_library_at_path(&clean_input_path(mods_path))?;
        let candidates = scan
            .mods
            .iter()
            .filter_map(|item| {
                Some(UpdateCheckCandidate {
                    mod_id: item.nexus_mod_id?,
                    unique_id: item.unique_id.clone(),
                    name: item.name.clone(),
                    current_version: item.version.clone()?,
                    absolute_path: item.absolute_path.clone(),
                    update_keys: item.update_keys.clone(),
                })
            })
            .collect::<Vec<_>>();
        let suppressed_mod_ids = if force_refresh {
            HashSet::new()
        } else {
            load_suppressed_launcher_update_mod_ids_at_path(
                &cache_path,
                mods_path,
                AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
            )?
        };
        let (candidates, skipped_mod_ids) =
            partition_update_candidates_for_request(candidates, &suppressed_mod_ids, force_refresh);
        let total = candidates.len();
        if !skipped_mod_ids.is_empty() {
            log_launcher_trace("updateCheck.autoSuppressed", |event| {
                event
                    .field("modsPath", mods_path)
                    .count("skippedCount", skipped_mod_ids.len())
                    .debug("skippedModIds", &skipped_mod_ids)
                    .field("threshold", AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD)
            });
        }
        log_launcher_trace("updateCheck.start", |event| {
            event
                .field("modsPath", mods_path)
                .count("candidateCount", total)
                .count("skippedCount", skipped_mod_ids.len())
        });
        let mut updates = Vec::new();
        let mut final_cached_result: Option<LauncherUpdatesResult> = None;
        emit_update_check_progress(app, mods_path, session_id, 0, total, None, Some(&updates))?;

        let client = launcher_http_client()?;
        let smapi_versions = resolve_smapi_runtime_versions(&settings, mods_path);
        let mut checked = 0;

        for batch in candidates.chunks(UPDATE_BATCH_SIZE) {
            let mod_ids = batch
                .iter()
                .map(|candidate| candidate.mod_id)
                .collect::<Vec<_>>();
            log_launcher_trace("updateCheck.batch", |event| {
                event
                    .count("batchSize", batch.len())
                    .debug("modIds", &mod_ids)
            });
            let remote_details =
                load_remote_mod_details_batch(app, &client, &settings, batch, &smapi_versions)?;
            let resolved_mod_ids = batch
                .iter()
                .filter(|candidate| remote_details.contains_key(&candidate.mod_id))
                .map(|candidate| candidate.mod_id)
                .collect::<Vec<_>>();
            if !resolved_mod_ids.is_empty() {
                clear_launcher_update_auto_failures_at_path(
                    &cache_path,
                    mods_path,
                    &resolved_mod_ids,
                )?;
            }
            if !force_refresh {
                let unresolved_mod_ids = batch
                    .iter()
                    .filter(|candidate| !remote_details.contains_key(&candidate.mod_id))
                    .map(|candidate| candidate.mod_id)
                    .collect::<Vec<_>>();
                for mod_id in unresolved_mod_ids {
                    let failure = record_launcher_update_auto_failure_at_path(
                        &cache_path,
                        mods_path,
                        mod_id,
                        current_timestamp_ms(),
                        Some("All remote update detail fallbacks failed."),
                    )?;
                    log_launcher_trace("updateCheck.autoFailure", |event| {
                        event
                            .field("modsPath", mods_path)
                            .field("modId", mod_id)
                            .field("failureCount", failure.failure_count)
                            .flag(
                                "suppressed",
                                failure.failure_count >= AUTO_UPDATE_FAILURE_SUPPRESSION_THRESHOLD,
                            )
                    });
                }
            }

            for candidate in batch {
                if let Some(remote) = remote_details.get(&candidate.mod_id) {
                    if let Some(summary) = build_launcher_update_summary(candidate, remote) {
                        updates.push(summary);
                    }
                }

                checked += 1;
                emit_update_check_progress(
                    app,
                    mods_path,
                    session_id,
                    checked,
                    total,
                    Some(&candidate.name),
                    Some(&updates),
                )?;
            }

            updates.sort_by(|left, right| left.name.cmp(&right.name));
            let batch_complete = checked >= total;
            let cached_result = save_incremental_launcher_updates_cache(
                &cache_path,
                &scan.mods_path,
                &updates,
                checked,
                total,
                batch_complete,
                session_id,
            )?;
            if batch_complete {
                final_cached_result = Some(cached_result);
            }
        }

        let result = if let Some(cached_result) = final_cached_result {
            cached_result
        } else {
            updates.sort_by(|left, right| left.name.cmp(&right.name));
            save_incremental_launcher_updates_cache(
                &cache_path,
                &scan.mods_path,
                &updates,
                checked,
                total,
                true,
                session_id,
            )?
        };
        log_launcher_trace("updateCheck.complete", |event| {
            event
                .field("modsPath", &result.mods_path)
                .count("checkedCount", checked)
                .count("updateCount", result.updates.len())
        });
        Ok(result)
    })();

    end_launcher_update_check_activity(active_cache_key.as_deref());

    match result {
        Ok(result) => {
            clear_launcher_updates_check_in_progress_at_path(&cache_path, Some(mods_path))?;
            let clear_inspection = inspect_launcher_updates_cache_at_path(
                &cache_path,
                mods_path,
                current_timestamp_ms(),
            )?;
            log_launcher_updates_cache_trace(
                "updateCheck.cacheClearInProgress",
                mods_path,
                &clear_inspection,
                |event| event.field("status", "success"),
            );
            Ok(result)
        }
        Err(error) => {
            clear_launcher_updates_check_in_progress_at_path(&cache_path, Some(mods_path))
                .with_context(|| format!("{error} Failed to clear launcher update check state"))?;
            let clear_inspection = inspect_launcher_updates_cache_at_path(
                &cache_path,
                mods_path,
                current_timestamp_ms(),
            )?;
            log_launcher_updates_cache_trace(
                "updateCheck.cacheClearInProgress",
                mods_path,
                &clear_inspection,
                |event| event.field("status", "error"),
            );
            Err(error)
        }
    }
}

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/updates_tests.rs"]
mod updates_tests;

#[cfg(test)]
#[path = "../../tests/integration/launcher_update_suppression_tests.rs"]
mod launcher_update_suppression_tests;
