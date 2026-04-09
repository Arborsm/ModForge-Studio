use super::http::{
    api_headers, graphql_headers, launcher_http_client, send_nexus_request, LAUNCHER_USER_AGENT,
};
use super::library::scan_library_at_path;
use super::paths::{current_timestamp_ms, launcher_settings_path};
use super::settings::{load_or_create_settings_at_path, normalize_optional_text};
use super::trace::log_launcher_trace;
use super::types::{
    CheckLauncherUpdatesRequest, LauncherCatalogPageResult, LauncherCatalogResult,
    LauncherSettings, LauncherUpdateProgressPayload, LauncherUpdateSummary,
    LauncherUpdatesResult, SearchLauncherCatalogRequest,
};
use crate::pathing::clean_input_path;
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;
use semver::Version;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::Emitter;

const DEFAULT_PAGE_SIZE: usize = 20;
const UPDATE_BATCH_SIZE: usize = 24;
const GRAPHQL_ENDPOINT: &str = "https://graphql.nexusmods.com/";
const TRENDING_ENDPOINT: &str = "https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json";
const LAUNCHER_UPDATE_PROGRESS_EVENT: &str = "launcher://update-check-progress";
const CATALOG_GRAPHQL_QUERY: &str = r#"
query CatalogMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
  mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
    totalCount
    nodes {
      modId
      name
      summary
      pictureUrl
      uploader {
        name
      }
    }
  }
}
"#;
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

#[derive(Debug, Clone)]
pub(crate) struct RemoteModDetail {
    pub(crate) mod_id: i64,
    pub(crate) name: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) mod_url: String,
    pub(crate) image_url: Option<String>,
}

#[derive(Debug, Clone)]
struct UpdateCheckCandidate {
    mod_id: i64,
    name: String,
    current_version: String,
    absolute_path: String,
}

pub(crate) fn build_mod_page_url(mod_id: i64) -> String {
    format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}")
}

pub(crate) fn can_use_nexus_graphql(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        || settings
            .nexus_cookie
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
}

fn graphql_filter_value(value: &str, op: &str) -> Value {
    json!([{ "value": value, "op": op }])
}

fn build_catalog_sort(sort: &str, ascending: bool) -> Value {
    let direction = if ascending { "ASC" } else { "DESC" };
    match sort {
        "updated" => json!([{ "updatedAt": { "direction": direction } }]),
        "downloads" => json!([{ "downloads": { "direction": direction } }]),
        "endorsements" => json!([{ "endorsements": { "direction": direction } }]),
        "name" => json!([{ "name": { "direction": direction } }]),
        // GraphQL does not currently expose a first-class "trending" sort, so the
        // fallback path uses the legacy public endpoint when possible.
        "trending" => json!([{ "endorsements": { "direction": direction } }]),
        _ => json!([{ "createdAt": { "direction": direction } }]),
    }
}

pub(crate) fn build_catalog_graphql_payload(
    query: Option<&str>,
    page: usize,
    sort: &str,
    ascending: bool,
) -> Result<Value, String> {
    let page = page.max(1);
    let mut filter = serde_json::Map::new();
    filter.insert(
        "gameDomainName".to_string(),
        graphql_filter_value("stardewvalley", "EQUALS"),
    );

    if let Some(query) = query.map(str::trim).filter(|value| !value.is_empty()) {
        filter.insert("name".to_string(), graphql_filter_value(query, "WILDCARD"));
    }

    Ok(json!({
        "operationName": "CatalogMods",
        "query": CATALOG_GRAPHQL_QUERY,
        "variables": {
            "filter": Value::Object(filter),
            "sort": build_catalog_sort(sort, ascending),
            "offset": ((page - 1) * DEFAULT_PAGE_SIZE) as i64,
            "count": DEFAULT_PAGE_SIZE as i64
        }
    }))
}

pub(crate) fn parse_catalog_graphql_response(
    payload: &Value,
    page: usize,
) -> Result<LauncherCatalogPageResult, String> {
    if let Some(error) = extract_graphql_error(payload) {
        return Err(error);
    }

    let mods = payload
        .get("data")
        .and_then(|value| value.get("mods"))
        .ok_or_else(|| "Nexus catalog response did not include a mods payload.".to_string())?;
    let total_count = mods
        .get("totalCount")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let nodes = mods
        .get("nodes")
        .and_then(Value::as_array)
        .ok_or_else(|| "Nexus catalog response did not include a nodes array.".to_string())?;
    let results = nodes
        .iter()
        .filter_map(parse_catalog_graphql_node)
        .collect::<Vec<_>>();
    let has_more = if total_count > 0 {
        page.max(1) * DEFAULT_PAGE_SIZE < total_count
    } else {
        results.len() >= DEFAULT_PAGE_SIZE
    };

    Ok(LauncherCatalogPageResult {
        page: page.max(1),
        has_more,
        results,
    })
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

fn extract_graphql_error(payload: &Value) -> Option<String> {
    payload
        .get("errors")
        .and_then(Value::as_array)
        .and_then(|errors| errors.first())
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_catalog_graphql_node(node: &Value) -> Option<LauncherCatalogResult> {
    let mod_id = node.get("modId").and_then(Value::as_i64)?;
    let title = string_field(node, "name")?;

    Some(LauncherCatalogResult {
        mod_id,
        title,
        summary: string_field(node, "summary"),
        author: node
            .get("uploader")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(node, "pictureUrl"),
    })
}

fn parse_remote_mod_detail_node(node: &Value) -> Option<RemoteModDetail> {
    let mod_id = node.get("modId").and_then(Value::as_i64)?;
    Some(RemoteModDetail {
        mod_id,
        name: string_field(node, "name"),
        version: string_field(node, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(node, "pictureUrl"),
    })
}

fn parse_trending_catalog_response(
    payload: &Value,
    page: usize,
    ascending: bool,
) -> Result<LauncherCatalogPageResult, String> {
    let items = payload
        .as_array()
        .ok_or_else(|| "Nexus trending response did not return an array.".to_string())?;
    let mut results = items
        .iter()
        .filter_map(|item| {
            let mod_id = item.get("mod_id").and_then(Value::as_i64)?;
            let title = string_field(item, "name")?;
            Some(LauncherCatalogResult {
                mod_id,
                title,
                summary: string_field(item, "summary"),
                author: string_field(item, "author"),
                mod_url: build_mod_page_url(mod_id),
                image_url: string_field(item, "picture_url"),
            })
        })
        .collect::<Vec<_>>();

    if ascending {
        results.reverse();
    }

    let offset = (page.max(1) - 1) * DEFAULT_PAGE_SIZE;
    let total = results.len();
    let page_results = results
        .into_iter()
        .skip(offset)
        .take(DEFAULT_PAGE_SIZE)
        .collect::<Vec<_>>();

    Ok(LauncherCatalogPageResult {
        page: page.max(1),
        has_more: offset + page_results.len() < total,
        results: page_results,
    })
}

fn load_catalog_page_from_graphql(
    client: &Client,
    settings: &LauncherSettings,
    payload: &Value,
    page: usize,
) -> Result<LauncherCatalogPageResult, String> {
    if !can_use_nexus_graphql(settings) {
        return Err("Configure a Nexus API key or cookie before querying Nexus Mods.".to_string());
    }

    let headers = graphql_headers(
        settings.nexus_api_key.as_deref(),
        settings.nexus_cookie.as_deref(),
    )?;
    let response = send_nexus_request(|| {
        client
            .post(GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(payload)
            .send()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Nexus catalog GraphQL request failed: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse Nexus catalog GraphQL response: {error}"))?;
    parse_catalog_graphql_response(&payload, page)
}

fn load_trending_catalog_page(
    client: &Client,
    api_key: &str,
    page: usize,
    ascending: bool,
) -> Result<LauncherCatalogPageResult, String> {
    let headers = api_headers(api_key)?;
    let response = send_nexus_request(|| client.get(TRENDING_ENDPOINT).headers(headers.clone()).send())?;
    if !response.status().is_success() {
        return Err(format!(
            "Nexus trending request failed: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse Nexus trending response: {error}"))?;
    parse_trending_catalog_response(&payload, page, ascending)
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

fn load_remote_mod_detail_from_api(
    client: &Client,
    api_key: &str,
    mod_id: i64,
) -> Result<RemoteModDetail, String> {
    let headers = api_headers(api_key)?;
    let payload = send_nexus_request(|| {
        client
            .get(format!(
                "https://api.nexusmods.com/v1/games/stardewvalley/mods/{mod_id}.json"
            ))
            .headers(headers.clone())
            .send()
    })?;
    if !payload.status().is_success() {
        return Err(format!(
            "Launcher mod metadata request failed for {mod_id}: HTTP {}",
            payload.status()
        ));
    }

    let json = payload
        .json::<Value>()
        .map_err(|error| format!("Failed to parse launcher mod metadata JSON: {error}"))?;
    Ok(RemoteModDetail {
        mod_id,
        name: string_field(&json, "name"),
        version: string_field(&json, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(&json, "picture_url"),
    })
}

fn load_remote_mod_detail_from_html(client: &Client, mod_id: i64) -> Result<RemoteModDetail, String> {
    let mod_url = build_mod_page_url(mod_id);
    let response = send_nexus_request(|| {
        client
            .get(&mod_url)
            .header(USER_AGENT, LAUNCHER_USER_AGENT)
            .send()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch launcher mod page for {mod_id}: HTTP {}",
            response.status()
        ));
    }

    let html = response
        .text()
        .map_err(|error| format!("Failed to read launcher mod page HTML: {error}"))?;
    let version_regex = Regex::new(
        r#"stat-version[^>]*>\s*<div[^>]*class=["']stat["'][^>]*>\s*(?P<version>[^<]+)"#,
    )
    .expect("valid mod version regex");
    let image_regex = Regex::new(r#"img-wrapper header-img.*?<img[^>]*src=["'](?P<src>[^"']+)["']"#)
        .expect("valid mod image regex");
    let title_regex =
        Regex::new(r#"<meta property=["']og:title["'] content=["'](?P<title>[^"']+)["']"#)
            .expect("valid mod title regex");

    Ok(RemoteModDetail {
        mod_id,
        name: title_regex
            .captures(&html)
            .and_then(|captures| captures.name("title"))
            .map(|value| decode_html(value.as_str()).trim().to_string())
            .filter(|value| !value.is_empty()),
        version: version_regex
            .captures(&html)
            .and_then(|captures| captures.name("version"))
            .map(|value| decode_html(value.as_str()).trim().trim_start_matches('v').to_string())
            .filter(|value| !value.is_empty()),
        mod_url,
        image_url: image_regex
            .captures(&html)
            .and_then(|captures| captures.name("src"))
            .map(|value| normalize_nexus_url(value.as_str())),
    })
}

fn load_remote_mod_details_batch(
    client: &Client,
    settings: &LauncherSettings,
    mod_ids: &[i64],
) -> Result<HashMap<i64, RemoteModDetail>, String> {
    if mod_ids.is_empty() {
        return Ok(HashMap::new());
    }

    if can_use_nexus_graphql(settings) {
        match load_remote_mod_details_from_graphql(client, settings, mod_ids) {
            Ok(details) if !details.is_empty() => return Ok(details),
            Ok(_) => {}
            Err(error) => {
                log::warn!("launcher graphql update batch failed, falling back to single lookups: {error}");
            }
        }
    }

    let mut details = HashMap::new();
    for mod_id in mod_ids {
        let detail = settings
            .nexus_api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .and_then(|api_key| load_remote_mod_detail_from_api(client, api_key, *mod_id).ok())
            .or_else(|| load_remote_mod_detail_from_html(client, *mod_id).ok());

        if let Some(detail) = detail {
            details.insert(*mod_id, detail);
        }
    }

    Ok(details)
}

fn normalize_nexus_url(value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("https://www.nexusmods.com{}", value.trim())
    }
}

fn decode_html(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn version_is_newer(current: &str, latest: &str) -> bool {
    let current_clean = current.trim().trim_start_matches('v');
    let latest_clean = latest.trim().trim_start_matches('v');
    match (Version::parse(current_clean), Version::parse(latest_clean)) {
        (Ok(current_version), Ok(latest_version)) => latest_version > current_version,
        _ => latest_clean != current_clean,
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn emit_update_check_progress(
    app: &tauri::AppHandle,
    mods_path: &str,
    checked: usize,
    total: usize,
    current_mod_name: Option<&str>,
) -> Result<(), String> {
    app.emit(
        LAUNCHER_UPDATE_PROGRESS_EVENT,
        LauncherUpdateProgressPayload {
            mods_path: mods_path.to_string(),
            checked,
            total,
            current_mod_name: current_mod_name.map(str::to_string),
        },
    )
    .map_err(|error| format!("Failed to emit launcher update progress: {error}"))
}

#[tauri::command]
pub fn search_launcher_catalog(
    app: tauri::AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error("search_launcher_catalog", (|| {
        let page = request.page.unwrap_or(1).max(1);
        let sort = request.sort.unwrap_or_else(|| "newest".to_string());
        let ascending = request.ascending.unwrap_or(false);
        let query = normalize_optional_text(request.query);
        let settings_path = launcher_settings_path(&app)?;
        let settings = load_or_create_settings_at_path(&settings_path)?;
        let client = launcher_http_client()?;
        log_launcher_trace(
            "catalog.search.start",
            &[
                ("page", page.to_string()),
                ("sort", sort.clone()),
                ("ascending", ascending.to_string()),
                ("query", query.clone().unwrap_or_default()),
            ],
        );

        if query.is_none() && sort == "trending" {
            if let Some(api_key) = settings
                .nexus_api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                let result = load_trending_catalog_page(&client, api_key, page, ascending)?;
                log_launcher_trace(
                    "catalog.search.complete",
                    &[
                        ("page", result.page.to_string()),
                        ("resultCount", result.results.len().to_string()),
                        ("hasMore", result.has_more.to_string()),
                        ("source", "trending".to_string()),
                    ],
                );
                return Ok(result);
            }
        }

        if !can_use_nexus_graphql(&settings) {
            return Err("Configure a Nexus API key or cookie before querying Nexus Mods.".to_string());
        }

        let payload = build_catalog_graphql_payload(query.as_deref(), page, &sort, ascending)?;
        let result = load_catalog_page_from_graphql(&client, &settings, &payload, page)?;
        log_launcher_trace(
            "catalog.search.complete",
            &[
                ("page", result.page.to_string()),
                ("resultCount", result.results.len().to_string()),
                ("hasMore", result.has_more.to_string()),
                ("source", "graphql".to_string()),
            ],
        );
        Ok(result)
    })())
}

#[tauri::command]
pub async fn check_launcher_updates(
    app: tauri::AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "check_launcher_updates",
        tauri::async_runtime::spawn_blocking(move || check_launcher_updates_blocking(&app, &request))
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

    let settings_path = launcher_settings_path(app)?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let scan = scan_library_at_path(&clean_input_path(mods_path))?;
    let candidates = scan
        .mods
        .iter()
        .filter_map(|item| {
            Some(UpdateCheckCandidate {
                mod_id: item.nexus_mod_id?,
                name: item.name.clone(),
                current_version: item.version.clone()?,
                absolute_path: item.absolute_path.clone(),
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
    emit_update_check_progress(app, mods_path, 0, total, None)?;

    let client = launcher_http_client()?;
    let mut updates = Vec::new();
    let mut checked = 0;

    for batch in candidates.chunks(UPDATE_BATCH_SIZE) {
        let mod_ids = batch.iter().map(|candidate| candidate.mod_id).collect::<Vec<_>>();
        log_launcher_trace(
            "update-check.batch",
            &[
                ("batchSize", batch.len().to_string()),
                ("modIds", format!("{mod_ids:?}")),
            ],
        );
        let remote_details = load_remote_mod_details_batch(&client, &settings, &mod_ids).unwrap_or_else(|error| {
            log::warn!("launcher update batch skipped: {error}");
            HashMap::new()
        });

        for candidate in batch {
            if let Some(remote) = remote_details.get(&candidate.mod_id) {
                if let Some(latest_version) = remote
                    .version
                    .as_deref()
                    .filter(|latest_version| version_is_newer(&candidate.current_version, latest_version))
                {
                    updates.push(LauncherUpdateSummary {
                        mod_id: candidate.mod_id,
                        name: remote.name.clone().unwrap_or_else(|| candidate.name.clone()),
                        current_version: Some(candidate.current_version.clone()),
                        latest_version: latest_version.to_string(),
                        absolute_path: candidate.absolute_path.clone(),
                        mod_url: remote.mod_url.clone(),
                        image_url: remote.image_url.clone(),
                    });
                }
            }

            checked += 1;
            emit_update_check_progress(
                app,
                mods_path,
                checked,
                total,
                Some(&candidate.name),
            )?;
        }
    }

    updates.sort_by(|left, right| left.name.cmp(&right.name));
    let result = LauncherUpdatesResult {
        mods_path: scan.mods_path,
        checked_at_ms: current_timestamp_ms(),
        updates,
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
}
