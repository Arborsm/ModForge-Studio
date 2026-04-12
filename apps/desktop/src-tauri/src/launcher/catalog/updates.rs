use super::super::http::{graphql_headers, launcher_http_client, send_nexus_request};
use super::super::library::scan_library_at_path;
use super::super::paths::{
    current_timestamp_ms, launcher_settings_path, launcher_updates_cache_path,
};
use super::super::settings::load_or_create_settings_at_path;
use super::super::trace::log_launcher_trace;
use super::super::types::{
    CheckLauncherUpdatesRequest, LauncherSettings, LauncherUpdateProgressPayload,
    LauncherUpdateSummary, LauncherUpdatesResult, LoadCachedLauncherUpdatesRequest,
};
use super::super::update_cache::{
    clear_launcher_updates_check_in_progress_at_path, inspect_launcher_updates_cache_at_path,
    load_cached_launcher_updates_at_path, mark_launcher_updates_check_in_progress_at_path,
    normalize_launcher_updates_cache_key, save_launcher_updates_cache_at_path,
    LauncherUpdatesCacheInspection,
};
use super::can_use_nexus_graphql;
use super::remote::{
    load_remote_mod_detail_from_html, load_remote_mod_detail_from_public_graphql,
    parse_remote_mod_detail_node, RemoteModDetail,
};
use super::shared::{build_mod_page_url, extract_graphql_error, normalize_nexus_url};
use crate::pathing::clean_input_path;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use semver::Version;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use tauri::Emitter;

const UPDATE_BATCH_SIZE: usize = 24;
const GRAPHQL_ENDPOINT: &str = "https://graphql.nexusmods.com/";
const SMAPI_MOD_LOOKUP_ENDPOINT: &str = "https://smapi.io/api/v3.0/mods";
const SMAPI_APPLICATION_NAME: &str = "ModForge Studio";
const SMAPI_APPLICATION_VERSION: &str = env!("CARGO_PKG_VERSION");
const SMAPI_DEFAULT_API_VERSION: &str = "4.5.2";
const SMAPI_DEFAULT_GAME_VERSION: &str = "1.6.14";
const SMAPI_DEFAULT_PLATFORM: &str = "Windows";
const LAUNCHER_UPDATE_PROGRESS_EVENT: &str = "launcher://update-check-progress";
const LAUNCHER_UPDATES_CACHE_TTL_MS: u128 = 30 * 60 * 1000;
const UPDATE_BATCH_GRAPHQL_QUERY: &str = r#"
query LauncherUpdateBatch($ids: [CompositeDomainWithIdInput!]!) {
  legacyModsByDomain(ids: $ids) {
    nodes {
      modId
      name
      version
      pictureUrl
    }
  }
}
"#;
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

fn resolve_update_check_game_root(settings: &LauncherSettings, mods_path: &str) -> Option<PathBuf> {
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
fn read_windows_file_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }

    let escaped = path.to_string_lossy().replace('\'', "''");
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!(
            "$item = Get-Item -LiteralPath '{escaped}'; \
             $version = $item.VersionInfo.ProductVersion; \
             if ([string]::IsNullOrWhiteSpace($version)) {{ $version = $item.VersionInfo.FileVersion }}; \
             if (-not [string]::IsNullOrWhiteSpace($version)) {{ [Console]::Out.Write($version) }}"
        ))
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let raw = String::from_utf8_lossy(&output.stdout);
    parse_version_triplet(raw.trim())
}

#[cfg(not(target_os = "windows"))]
fn read_windows_file_version(_path: &Path) -> Option<String> {
    None
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

fn resolve_smapi_runtime_versions(
    settings: &LauncherSettings,
    mods_path: &str,
) -> SmapiRuntimeVersions {
    let game_root = resolve_update_check_game_root(settings, mods_path);
    resolve_smapi_runtime_versions_with_reader(game_root.as_deref(), read_windows_file_version)
}
pub(crate) fn build_update_batch_graphql_payload(mod_ids: &[i64]) -> Result<Value, String> {
    if mod_ids.is_empty() {
        return Err("At least one Nexus mod id is required.".to_string());
    }

    let ids = mod_ids
        .iter()
        .map(|mod_id| {
            json!({
                "gameDomain": "stardewvalley",
                "modId": mod_id
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "operationName": "LauncherUpdateBatch",
        "query": UPDATE_BATCH_GRAPHQL_QUERY,
        "variables": {
            "ids": ids
        }
    }))
}

pub(crate) fn parse_update_batch_graphql_response(
    payload: &Value,
) -> Result<Vec<RemoteModDetail>, String> {
    if let Some(error) = extract_graphql_error(payload) {
        return Err(error);
    }

    let nodes = payload
        .get("data")
        .and_then(|value| value.get("legacyModsByDomain"))
        .and_then(|value| value.get("nodes"))
        .and_then(Value::as_array)
        .ok_or_else(|| {
            "Nexus update batch response did not include a legacyModsByDomain.nodes array."
                .to_string()
        })?;

    Ok(nodes
        .iter()
        .filter_map(parse_remote_mod_detail_node)
        .collect())
}

fn load_remote_mod_details_from_graphql(
    client: &Client,
    settings: &LauncherSettings,
    mod_ids: &[i64],
) -> Result<HashMap<i64, RemoteModDetail>, String> {
    if !can_use_nexus_graphql(settings) {
        return Err("Configure a Nexus API key or cookie before querying Nexus Mods.".to_string());
    }

    let headers = graphql_headers(
        settings.nexus_api_key.as_deref(),
        settings.nexus_cookie.as_deref(),
    )?;
    let payload = build_update_batch_graphql_payload(mod_ids)?;
    let response = send_nexus_request(|| {
        client
            .post(GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Nexus update batch GraphQL request failed: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse Nexus update batch GraphQL response: {error}"))?;
    let details = parse_update_batch_graphql_response(&payload)?;
    Ok(details
        .into_iter()
        .map(|detail| (detail.mod_id, detail))
        .collect())
}

fn smapi_headers() -> Result<HeaderMap, String> {
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
) -> Result<HashMap<i64, RemoteModDetail>, String> {
    let entries = payload
        .as_array()
        .or_else(|| payload.get("Mods").and_then(Value::as_array))
        .ok_or_else(|| "SMAPI mod lookup response did not contain an array payload.".to_string())?;

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
                mod_id: candidate.mod_id,
                name,
                author,
                summary,
                version: Some(version),
                mod_url,
                image_url,
                gallery_images: Vec::new(),
                updated_at: None,
                file_size: None,
            },
        );
    }

    Ok(details)
}

fn load_remote_mod_details_from_smapi(
    client: &Client,
    candidates: &[UpdateCheckCandidate],
    versions: &SmapiRuntimeVersions,
) -> Result<HashMap<i64, RemoteModDetail>, String> {
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

    let headers = smapi_headers()?;
    let payload = build_smapi_update_payload_with_versions(&smapi_candidates, versions);
    let response = client
        .post(SMAPI_MOD_LOOKUP_ENDPOINT)
        .headers(headers)
        .json(&payload)
        .send()
        .map_err(|error| format!("SMAPI mod lookup request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "SMAPI mod lookup request failed: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse SMAPI mod lookup response: {error}"))?;
    parse_smapi_update_response(&payload, &smapi_candidates)
}

fn load_remote_mod_details_batch(
    client: &Client,
    settings: &LauncherSettings,
    candidates: &[UpdateCheckCandidate],
    smapi_versions: &SmapiRuntimeVersions,
) -> Result<HashMap<i64, RemoteModDetail>, String> {
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
            log::warn!(
                "launcher smapi update lookup failed, falling back to nexus sources: {error}"
            );
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
    log_launcher_trace(
        "update-check.smapi",
        &[
            ("candidateCount", candidates.len().to_string()),
            ("smapiCandidateCount", smapi_candidate_count.to_string()),
            (
                "skippedNoUniqueIdCount",
                candidates
                    .len()
                    .saturating_sub(smapi_candidate_count)
                    .to_string(),
            ),
            ("resolvedCount", details.len().to_string()),
            ("missingCount", missing_after_smapi.len().to_string()),
            (
                "missingUniqueCount",
                unique_missing_after_smapi.len().to_string(),
            ),
            ("missingModIds", format!("{missing_after_smapi_mod_ids:?}")),
        ],
    );
    if missing_after_smapi.is_empty() {
        return Ok(details);
    }

    let mod_ids = unique_missing_after_smapi
        .iter()
        .map(|candidate| candidate.mod_id)
        .collect::<Vec<_>>();
    let can_use_graphql = can_use_nexus_graphql(settings);
    let detail_count_before_graphql = details.len();
    if can_use_graphql {
        match load_remote_mod_details_from_graphql(client, settings, &mod_ids) {
            Ok(graphql_details) if !graphql_details.is_empty() => {
                details.extend(graphql_details);
            }
            Ok(_) => {}
            Err(error) => {
                log::warn!(
                    "launcher graphql update batch failed, falling back to single lookups: {error}"
                );
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
    log_launcher_trace(
        "update-check.graphql",
        &[
            ("enabled", can_use_graphql.to_string()),
            ("requestedCount", mod_ids.len().to_string()),
            (
                "resolvedCount",
                details
                    .len()
                    .saturating_sub(detail_count_before_graphql)
                    .to_string(),
            ),
            ("missingCount", missing_after_graphql.len().to_string()),
            (
                "missingModIds",
                format!("{missing_after_graphql_mod_ids:?}"),
            ),
        ],
    );
    let public_fallback_candidate_count = missing_after_graphql.len();
    let mut unresolved_mod_ids = Vec::new();
    let mut public_graphql_resolved = 0usize;
    let mut html_resolved = 0usize;
    for candidate in missing_after_graphql {
        match load_remote_mod_detail_from_public_graphql(client, candidate.mod_id) {
            Ok(detail) => {
                public_graphql_resolved += 1;
                details.insert(candidate.mod_id, detail);
            }
            Err(public_error) => {
                log::warn!(
                    "launcher public graphql update lookup failed for {}: {error}",
                    candidate.mod_id,
                    error = public_error
                );
                match load_remote_mod_detail_from_html(client, candidate.mod_id) {
                    Ok(detail) => {
                        html_resolved += 1;
                        details.insert(candidate.mod_id, detail);
                    }
                    Err(html_error) => {
                        unresolved_mod_ids.push(candidate.mod_id);
                        errors.push(format!(
                            "mod {} public GraphQL failed: {}",
                            candidate.mod_id, public_error
                        ));
                        errors.push(format!(
                            "mod {} HTML fallback failed: {}",
                            candidate.mod_id, html_error
                        ));
                    }
                }
            }
        }
    }
    log_launcher_trace(
        "update-check.public-fallback",
        &[
            (
                "candidateCount",
                public_fallback_candidate_count.to_string(),
            ),
            ("publicGraphqlResolved", public_graphql_resolved.to_string()),
            ("htmlResolved", html_resolved.to_string()),
            ("unresolvedCount", unresolved_mod_ids.len().to_string()),
            ("unresolvedModIds", format!("{unresolved_mod_ids:?}")),
        ],
    );

    finalize_remote_mod_details_batch(details, unresolved_mod_ids, errors)
}

pub(crate) fn finalize_remote_mod_details_batch(
    details: HashMap<i64, RemoteModDetail>,
    unresolved_mod_ids: Vec<i64>,
    errors: Vec<String>,
) -> Result<HashMap<i64, RemoteModDetail>, String> {
    if !unresolved_mod_ids.is_empty() && !errors.is_empty() {
        let mut unique_errors = errors;
        unique_errors.sort();
        unique_errors.dedup();
        log::warn!(
            "launcher remote update detail batch incomplete for mods {:?}: {}",
            unresolved_mod_ids,
            unique_errors.join(" | ")
        );
    }

    Ok(details)
}

fn format_optional_u128(value: Option<u128>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

fn format_optional_bool(value: Option<bool>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

fn log_launcher_updates_cache_trace(
    action: &str,
    mods_path: &str,
    inspection: &LauncherUpdatesCacheInspection,
    extra_fields: &[(&str, String)],
) {
    let mut fields = vec![
        ("modsPath", mods_path.to_string()),
        ("cacheKey", inspection.cache_key.clone().unwrap_or_default()),
        ("entryState", inspection.entry_state.as_str().to_string()),
        (
            "checkedAtMs",
            format_optional_u128(inspection.checked_at_ms),
        ),
        (
            "expiresAtMs",
            format_optional_u128(inspection.expires_at_ms),
        ),
        ("isComplete", format_optional_bool(inspection.is_complete)),
        (
            "ttlRemainingMs",
            format_optional_u128(inspection.ttl_remaining_ms),
        ),
        (
            "expiredByMs",
            format_optional_u128(inspection.expired_by_ms),
        ),
        (
            "inProgressActiveCount",
            inspection.in_progress_active_count.to_string(),
        ),
        (
            "inProgressStartedAtMs",
            format_optional_u128(inspection.in_progress_started_at_ms),
        ),
    ];
    fields.extend(
        extra_fields
            .iter()
            .map(|(key, value)| (*key, value.clone())),
    );
    log_launcher_trace(action, &fields);
}

fn save_incremental_launcher_updates_cache(
    cache_path: &Path,
    mods_path: &str,
    updates: &[LauncherUpdateSummary],
    checked_count: usize,
    total_count: usize,
    is_complete: bool,
    session_id: &str,
) -> Result<LauncherUpdatesResult, String> {
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
            "update-check.cache-save"
        } else {
            "update-check.cache-save-partial"
        },
        mods_path,
        &inspection,
        &[
            ("ttlMs", LAUNCHER_UPDATES_CACHE_TTL_MS.to_string()),
            ("checkedCount", checked_count.to_string()),
            ("totalCount", total_count.to_string()),
            ("updateCount", partial_result.updates.len().to_string()),
            ("sessionId", session_id.to_string()),
        ],
    );
    Ok(partial_result)
}

fn version_is_newer(current: &str, latest: &str) -> bool {
    let current_clean = current.trim().trim_start_matches('v');
    let latest_clean = latest.trim().trim_start_matches('v');
    match (Version::parse(current_clean), Version::parse(latest_clean)) {
        (Ok(current_version), Ok(latest_version)) => latest_version > current_version,
        _ => latest_clean != current_clean,
    }
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
    app: &tauri::AppHandle,
    mods_path: &str,
    session_id: &str,
    checked: usize,
    total: usize,
    current_mod_name: Option<&str>,
    updates: Option<&[LauncherUpdateSummary]>,
) -> Result<(), String> {
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
    .map_err(|error| format!("Failed to emit launcher update progress: {error}"))
}

pub fn load_cached_launcher_updates(
    app: tauri::AppHandle,
    request: LoadCachedLauncherUpdatesRequest,
) -> Result<Option<LauncherUpdatesResult>, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_cached_launcher_updates",
        (|| {
            let mods_path = request.mods_path.trim();
            if mods_path.is_empty() {
                return Err("modsPath is required.".to_string());
            }

            let cache_path = launcher_updates_cache_path(&app)?;
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
                    "update-cache.clear-in-progress",
                    mods_path,
                    &inspection_after_clear,
                    &[("hadActiveCheck", had_active_check.to_string())],
                );
            }

            let cached = load_cached_launcher_updates_at_path(&cache_path, mods_path, now_ms)?;
            log_launcher_updates_cache_trace(
                if cached
                    .as_ref()
                    .map(|result| result.is_complete)
                    .unwrap_or(false)
                {
                    "update-cache.hit"
                } else if cached.is_some() {
                    "update-cache.partial"
                } else {
                    "update-cache.miss"
                },
                mods_path,
                &inspection_after_clear,
                &[("hadActiveCheck", had_active_check.to_string())],
            );
            Ok(cached)
        })(),
    )
}

pub async fn check_launcher_updates(
    app: tauri::AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "check_launcher_updates",
        tauri::async_runtime::spawn_blocking(move || {
            check_launcher_updates_blocking(&app, &request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher update check task: {error}"))?,
    )
}

fn check_launcher_updates_blocking(
    app: &tauri::AppHandle,
    request: &CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    let mods_path = request.mods_path.trim();
    if mods_path.is_empty() {
        return Err("modsPath is required.".to_string());
    }
    let session_id = request
        .session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "sessionId is required.".to_string())?;

    let force_refresh = request.force_refresh.unwrap_or(false);
    let cache_path = launcher_updates_cache_path(app)?;
    if !force_refresh {
        let now_ms = current_timestamp_ms();
        let inspection = inspect_launcher_updates_cache_at_path(&cache_path, mods_path, now_ms)?;
        if let Some(cached) = load_cached_launcher_updates_at_path(&cache_path, mods_path, now_ms)?
        {
            if cached.is_complete {
                log_launcher_updates_cache_trace(
                    "update-check.cache-hit",
                    mods_path,
                    &inspection,
                    &[("updateCount", cached.updates.len().to_string())],
                );
                log_launcher_trace(
                    "update-check.cache-hit",
                    &[
                        ("modsPath", cached.mods_path.clone()),
                        ("updateCount", cached.updates.len().to_string()),
                    ],
                );
                return Ok(cached);
            }

            log_launcher_updates_cache_trace(
                "update-check.cache-partial",
                mods_path,
                &inspection,
                &[("updateCount", cached.updates.len().to_string())],
            );
        }
        log_launcher_updates_cache_trace("update-check.cache-miss", mods_path, &inspection, &[]);
    } else {
        let inspection =
            inspect_launcher_updates_cache_at_path(&cache_path, mods_path, current_timestamp_ms())?;
        log_launcher_updates_cache_trace(
            "update-check.cache-bypass",
            mods_path,
            &inspection,
            &[("reason", "forceRefresh".to_string())],
        );
    }
    let active_cache_key = begin_launcher_update_check_activity(mods_path);
    let result = (|| -> Result<LauncherUpdatesResult, String> {
        let started_at_ms = current_timestamp_ms();
        mark_launcher_updates_check_in_progress_at_path(&cache_path, mods_path, started_at_ms)?;
        let in_progress_inspection =
            inspect_launcher_updates_cache_at_path(&cache_path, mods_path, started_at_ms)?;
        log_launcher_updates_cache_trace(
            "update-check.cache-mark-in-progress",
            mods_path,
            &in_progress_inspection,
            &[("sessionId", session_id.to_string())],
        );

        let settings_path = launcher_settings_path(app)?;
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
        let total = candidates.len();
        log_launcher_trace(
            "update-check.start",
            &[
                ("modsPath", mods_path.to_string()),
                ("candidateCount", total.to_string()),
            ],
        );
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
            log_launcher_trace(
                "update-check.batch",
                &[
                    ("batchSize", batch.len().to_string()),
                    ("modIds", format!("{mod_ids:?}")),
                ],
            );
            let remote_details =
                load_remote_mod_details_batch(&client, &settings, batch, &smapi_versions)?;

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
        log_launcher_trace(
            "update-check.complete",
            &[
                ("modsPath", result.mods_path.clone()),
                ("checkedCount", checked.to_string()),
                ("updateCount", result.updates.len().to_string()),
            ],
        );
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
                "update-check.cache-clear-in-progress",
                mods_path,
                &clear_inspection,
                &[("status", "success".to_string())],
            );
            Ok(result)
        }
        Err(error) => {
            clear_launcher_updates_check_in_progress_at_path(&cache_path, Some(mods_path))
                .map_err(|clear_error| {
                    format!("{error} Failed to clear launcher update check state: {clear_error}")
                })?;
            let clear_inspection = inspect_launcher_updates_cache_at_path(
                &cache_path,
                mods_path,
                current_timestamp_ms(),
            )?;
            log_launcher_updates_cache_trace(
                "update-check.cache-clear-in-progress",
                mods_path,
                &clear_inspection,
                &[("status", "error".to_string())],
            );
            Err(error)
        }
    }
}
