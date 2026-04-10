use super::http::{
    api_headers, graphql_headers, launcher_http_client, public_graphql_headers,
    public_page_headers, send_nexus_request, DEFAULT_GAME_ID,
};
use super::library::scan_library_at_path;
use super::paths::{current_timestamp_ms, launcher_settings_path};
use super::settings::{load_or_create_settings_at_path, normalize_optional_text};
use super::trace::log_launcher_trace;
use super::types::{
    CheckLauncherUpdatesRequest, LauncherCatalogFacetEntry, LauncherCatalogFacets,
    LauncherCatalogPageResult, LauncherCatalogResult, LauncherRemoteModDetail,
    LauncherSettings, LauncherUpdateProgressPayload, LauncherUpdateSummary,
    LauncherUpdatesResult, LoadLauncherRemoteModDetailRequest, SearchLauncherCatalogRequest,
};
use crate::pathing::clean_input_path;
use regex::Regex;
use reqwest::blocking::Client;
use semver::Version;
use serde_json::{json, Value};
use std::collections::HashMap;
use tauri::Emitter;

const DEFAULT_PAGE_SIZE: usize = 20;
const MAX_PAGE_SIZE: usize = 80;
const UPDATE_BATCH_SIZE: usize = 24;
const GRAPHQL_ENDPOINT: &str = "https://graphql.nexusmods.com/";
const PUBLIC_GRAPHQL_ENDPOINT: &str = "https://api-router.nexusmods.com/graphql";
const PUBLIC_CATALOG_PAGE_URL: &str = "https://www.nexusmods.com/games/stardewvalley/mods";
const PUBLIC_CATALOG_GRAPHQL_REFERER: &str = "https://www.nexusmods.com/";
const PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER: &str = "GameModsListing";
const PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER: &str = "LauncherPublicModDetail";
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
const PUBLIC_CATALOG_GRAPHQL_QUERY: &str = r#"
query ModsListing($count: Int = 0, $facets: ModsFacet, $filter: ModsFilter, $offset: Int, $postFilter: ModsFilter, $sort: [ModsSort!]) {
  mods(
    count: $count
    facets: $facets
    filter: $filter
    offset: $offset
    postFilter: $postFilter
    sort: $sort
    viewUserBlockedContent: false
  ) {
    facetsData
    nodes {
      ...ModTileFragment
    }
    totalCount
  }
}

fragment ModTileFragment on Mod {
  adultContent
  createdAt
  downloads
  endorsements
  fileSize
  game {
    domainName
    id
    name
  }
  modCategory {
    categoryId
    name
  }
  modId
  name
  status
  summary
  thumbnailUrl
  thumbnailBlurredUrl
  uid
  updatedAt
  uploader {
    avatar
    memberId
    name
  }
  viewerDownloaded
  viewerEndorsed
  viewerTracked
  viewerUpdateAvailable
  viewerIsBlocked
}
"#;
const PUBLIC_MOD_DETAIL_GRAPHQL_QUERY: &str = r#"
query LauncherPublicModDetail($gameId: ID!, $modId: ID!) {
  mod(gameId: $gameId, modId: $modId) {
    modId
    name
    summary
    description
    version
    pictureUrl
    thumbnailUrl
    author
    uploader {
      name
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
    pub(crate) author: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) mod_url: String,
    pub(crate) image_url: Option<String>,
    pub(crate) gallery_images: Vec<String>,
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

fn catalog_page_size(requested: Option<usize>) -> usize {
    requested.unwrap_or(DEFAULT_PAGE_SIZE).clamp(20, MAX_PAGE_SIZE)
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

fn build_public_catalog_sort(sort: &str, ascending: bool) -> Value {
    let direction = if ascending { "ASC" } else { "DESC" };
    match sort {
        "updated" => json!({ "updatedAt": { "direction": direction } }),
        "downloads" => json!({ "downloads": { "direction": direction } }),
        "endorsements" => json!({ "endorsements": { "direction": direction } }),
        "name" => json!({ "name": { "direction": direction } }),
        "trending" => json!({ "endorsements": { "direction": direction } }),
        _ => json!({ "createdAt": { "direction": direction } }),
    }
}

fn launcher_catalog_url(
    request: &SearchLauncherCatalogRequest,
    page: usize,
    page_size: usize,
    sort: &str,
    ascending: bool,
) -> Result<reqwest::Url, String> {
    let sort_key = match sort {
        "downloads" => "OLD_downloads",
        "endorsements" => "OLD_endorsements",
        "updated" => "lastupdate",
        "name" => "name",
        "trending" => "two_weeks_ratings",
        _ => "date",
    };
    let order = if ascending { "ASC" } else { "DESC" };
    let include_adult = request.include_adult.unwrap_or(false);
    let mut filter = format!(
        "nav:true,home:false,type:0,user_id:0,game_id:{DEFAULT_GAME_ID},advfilt:true,include_adult:{include_adult},show_game_filter:false,page_size:{page_size},page:{page},order:{order},sort_by={sort_key}"
    );
    if let Some(search) = normalize_optional_text(request.query.clone()) {
        filter.push_str(",search_filename=");
        filter.push_str(&search);
    }
    if let Some(search) = normalize_optional_text(request.title_query.clone()) {
        filter.push_str(",title=");
        filter.push_str(&search);
    }
    if let Some(search) = normalize_optional_text(request.description_query.clone()) {
        filter.push_str(",description=");
        filter.push_str(&search);
    }
    if let Some(search) = normalize_optional_text(request.author_query.clone()) {
        filter.push_str(",author=");
        filter.push_str(&search);
    }
    if let Some(search) = normalize_optional_text(request.uploader_query.clone()) {
        filter.push_str(",uploader=");
        filter.push_str(&search);
    }
    if let Some(category) = normalize_optional_text(request.category.clone()) {
        filter.push_str(",category=");
        filter.push_str(&category);
    }
    if let Some(language) = normalize_optional_text(request.language.clone()) {
        filter.push_str(",language=");
        filter.push_str(&language);
    }
    if let Some(tags) = normalize_optional_text(request.tags_include.clone()) {
        filter.push_str(",tag_inc=");
        filter.push_str(&tags);
    }
    if let Some(tags) = normalize_optional_text(request.tags_exclude.clone()) {
        filter.push_str(",tag_exc=");
        filter.push_str(&tags);
    }
    if let Some(time_range) = normalize_optional_text(request.time_range.clone()).filter(|value| value != "all") {
        filter.push_str(",time_range=");
        filter.push_str(&time_range);
    }
    if let Some(min_size) = request.min_file_size {
        filter.push_str(",size_min=");
        filter.push_str(&min_size.to_string());
    }
    if let Some(max_size) = request.max_file_size {
        filter.push_str(",size_max=");
        filter.push_str(&max_size.to_string());
    }
    if let Some(min_downloads) = request.min_downloads {
        filter.push_str(",downloads_min=");
        filter.push_str(&min_downloads.to_string());
    }
    if let Some(max_downloads) = request.max_downloads {
        filter.push_str(",downloads_max=");
        filter.push_str(&max_downloads.to_string());
    }
    if let Some(min_endorsements) = request.min_endorsements {
        filter.push_str(",endorsements_min=");
        filter.push_str(&min_endorsements.to_string());
    }
    if let Some(max_endorsements) = request.max_endorsements {
        filter.push_str(",endorsements_max=");
        filter.push_str(&max_endorsements.to_string());
    }

    let mut url = reqwest::Url::parse("https://www.nexusmods.com/Core/Libs/Common/Widgets/ModList")
        .map_err(|error| format!("Failed to build launcher catalog URL: {error}"))?;
    url.query_pairs_mut().append_pair("RH_ModList", &filter);
    Ok(url)
}

pub(crate) fn build_catalog_graphql_payload(
    request: &SearchLauncherCatalogRequest,
) -> Result<Value, String> {
    let query = normalize_optional_text(request.query.clone());
    let title_query = normalize_optional_text(request.title_query.clone());
    let description_query = normalize_optional_text(request.description_query.clone());
    let author_query = normalize_optional_text(request.author_query.clone());
    let uploader_query = normalize_optional_text(request.uploader_query.clone());
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let sort = request.sort.as_deref().unwrap_or("newest");
    let ascending = request.ascending.unwrap_or(false);
    let page = page.max(1);
    let mut filter = serde_json::Map::new();
    filter.insert(
        "gameDomainName".to_string(),
        graphql_filter_value("stardewvalley", "EQUALS"),
    );
    filter.insert(
        "adultContent".to_string(),
        json!([{ "op": "EQUALS", "value": request.include_adult.unwrap_or(false) }]),
    );

    if let Some(query) = query.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        filter.insert("name".to_string(), graphql_filter_value(query, "WILDCARD"));
    }
    if let Some(query) = title_query.as_deref() {
        filter.insert("name".to_string(), graphql_filter_value(query, "WILDCARD"));
    }
    if let Some(query) = description_query.as_deref() {
        filter.insert("description".to_string(), graphql_filter_value(query, "MATCHES"));
    }
    if let Some(query) = author_query.as_deref() {
        filter.insert("author".to_string(), graphql_filter_value(query, "WILDCARD"));
    }
    if let Some(query) = uploader_query.as_deref() {
        filter.insert("uploader".to_string(), graphql_filter_value(query, "WILDCARD"));
    }

    Ok(json!({
        "operationName": "CatalogMods",
        "query": CATALOG_GRAPHQL_QUERY,
        "variables": {
            "filter": Value::Object(filter),
            "sort": build_catalog_sort(sort, ascending),
            "offset": ((page - 1) * page_size) as i64,
            "count": page_size as i64
        }
    }))
}

pub(crate) fn build_public_catalog_graphql_payload(
    request: &SearchLauncherCatalogRequest,
) -> Result<Value, String> {
    let query = normalize_optional_text(request.query.clone());
    let title_query = normalize_optional_text(request.title_query.clone());
    let description_query = normalize_optional_text(request.description_query.clone());
    let author_query = normalize_optional_text(request.author_query.clone());
    let uploader_query = normalize_optional_text(request.uploader_query.clone());
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let sort = request.sort.as_deref().unwrap_or("newest");
    let ascending = request.ascending.unwrap_or(false);
    let page = page.max(1);
    let name_filter = title_query
        .as_deref()
        .or(query.as_deref())
        .map(|value| json!([{ "value": value, "op": "WILDCARD" }]))
        .unwrap_or_else(|| json!([]));
    let description_filter = description_query
        .as_deref()
        .map(|value| json!([{ "value": value, "op": "MATCHES" }]))
        .unwrap_or_else(|| json!([]));
    let author_filter = author_query
        .as_deref()
        .map(|value| json!([{ "value": value, "op": "WILDCARD" }]))
        .unwrap_or_else(|| json!([]));
    let uploader_filter = uploader_query
        .as_deref()
        .map(|value| json!([{ "value": value, "op": "WILDCARD" }]))
        .unwrap_or_else(|| json!([]));
    let mut filter = serde_json::Map::new();
    filter.insert(
        "adultContent".to_string(),
        json!([{ "op": "EQUALS", "value": request.include_adult.unwrap_or(false) }]),
    );
    filter.insert("filter".to_string(), json!([]));
    filter.insert(
        "gameDomainName".to_string(),
        json!([{ "op": "EQUALS", "value": "stardewvalley" }]),
    );

    if name_filter != json!([]) {
        filter.insert("name".to_string(), name_filter);
    } else {
        filter.insert("name".to_string(), json!([]));
    }
    // Keep the anonymous GraphQL payload close to the live browser request. The
    // public endpoint is sensitive to unexpected filter keys, so only opt into
    // the extra text/range filters when the user actually uses them.
    if description_filter != json!([]) {
        filter.insert("description".to_string(), description_filter);
    }
    if author_filter != json!([]) {
        filter.insert("author".to_string(), author_filter);
    }
    if uploader_filter != json!([]) {
        filter.insert("uploader".to_string(), uploader_filter);
    }

    let mut file_size_filters = Vec::new();
    if let Some(value) = request.min_file_size {
        file_size_filters.push(json!({ "op": "GTE", "value": value }));
    }
    if let Some(value) = request.max_file_size {
        file_size_filters.push(json!({ "op": "LTE", "value": value }));
    }
    if !file_size_filters.is_empty() {
        filter.insert("fileSize".to_string(), Value::Array(file_size_filters));
    }

    let mut download_filters = Vec::new();
    if let Some(value) = request.min_downloads {
        download_filters.push(json!({ "op": "GTE", "value": value }));
    }
    if let Some(value) = request.max_downloads {
        download_filters.push(json!({ "op": "LTE", "value": value }));
    }
    if !download_filters.is_empty() {
        filter.insert("downloads".to_string(), Value::Array(download_filters));
    }

    let mut endorsement_filters = Vec::new();
    if let Some(value) = request.min_endorsements {
        endorsement_filters.push(json!({ "op": "GTE", "value": value }));
    }
    if let Some(value) = request.max_endorsements {
        endorsement_filters.push(json!({ "op": "LTE", "value": value }));
    }
    if !endorsement_filters.is_empty() {
        filter.insert("endorsements".to_string(), Value::Array(endorsement_filters));
    }

    let post_filter = normalize_optional_text(request.tags_exclude.clone())
        .map(|value| {
            let filters = value
                .split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(|item| json!({ "value": item, "op": "NOT_EQUALS" }))
                .collect::<Vec<_>>();
            if filters.is_empty() {
                json!({})
            } else {
                json!({ "tag": filters })
            }
        })
        .unwrap_or_else(|| json!({}));

    Ok(json!({
        "operationName": "ModsListing",
        "query": PUBLIC_CATALOG_GRAPHQL_QUERY,
        "variables": {
            "count": page_size as i64,
            "facets": {
                "categoryName": normalize_optional_text(request.category.clone())
                    .map(|value| json!([value]))
                    .unwrap_or_else(|| json!([])),
                "languageName": normalize_optional_text(request.language.clone())
                    .map(|value| json!([value]))
                    .unwrap_or_else(|| json!([])),
                "tag": normalize_optional_text(request.tags_include.clone())
                    .map(|value| {
                        Value::Array(
                            value
                                .split(',')
                                .map(str::trim)
                                .filter(|item| !item.is_empty())
                                .map(|item| Value::String(item.to_string()))
                                .collect(),
                        )
                    })
                    .unwrap_or_else(|| json!([]))
            },
            "filter": Value::Object(filter),
            "offset": ((page - 1) * page_size) as i64,
            "postFilter": post_filter,
            "sort": build_public_catalog_sort(sort, ascending)
        }
    }))
}

pub(crate) fn parse_catalog_graphql_response(
    payload: &Value,
    page: usize,
    page_size: usize,
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
    let facets = parse_catalog_facets(mods);
    let has_more = if total_count > 0 {
        page.max(1) * page_size < total_count
    } else {
        results.len() >= page_size
    };

    Ok(LauncherCatalogPageResult {
        page: page.max(1),
        page_size,
        total_count,
        has_more,
        facets,
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

fn empty_catalog_facets() -> LauncherCatalogFacets {
    LauncherCatalogFacets {
        categories: Vec::new(),
        languages: Vec::new(),
        tags: Vec::new(),
    }
}

fn parse_catalog_facet_entries(value: Option<&Value>) -> Vec<LauncherCatalogFacetEntry> {
    let mut entries = value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(name, count)| {
                    let count = count.as_u64()? as usize;
                    if count == 0 {
                        return None;
                    }
                    Some(LauncherCatalogFacetEntry {
                        name: name.trim().to_string(),
                        count,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    entries.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    entries
}

fn parse_catalog_facets(mods: &Value) -> LauncherCatalogFacets {
    let facets = mods.get("facetsData");
    LauncherCatalogFacets {
        categories: parse_catalog_facet_entries(facets.and_then(|value| value.get("categoryName"))),
        languages: parse_catalog_facet_entries(facets.and_then(|value| value.get("languageName"))),
        tags: parse_catalog_facet_entries(facets.and_then(|value| value.get("tag"))),
    }
}

fn parse_catalog_graphql_node(node: &Value) -> Option<LauncherCatalogResult> {
    let mod_id = node.get("modId").and_then(Value::as_i64)?;
    let title = string_field(node, "name")?;
    let uploader = node
        .get("uploader")
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Some(LauncherCatalogResult {
        mod_id,
        title,
        summary: string_field(node, "summary"),
        author: uploader.clone(),
        uploader,
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(node, "pictureUrl").or_else(|| string_field(node, "thumbnailUrl")),
        category: node
            .get("modCategory")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
        created_at: string_field(node, "createdAt"),
        updated_at: string_field(node, "updatedAt"),
        downloads: node.get("downloads").and_then(Value::as_u64),
        endorsements: node.get("endorsements").and_then(Value::as_u64),
        file_size: node.get("fileSize").and_then(Value::as_u64),
        update_available: node.get("viewerUpdateAvailable").and_then(Value::as_bool).unwrap_or(false),
    })
}

pub(crate) fn parse_catalog_results(html: &str) -> Vec<LauncherCatalogResult> {
    let anchor_regex = Regex::new(
        r#"tile-name[^>]*>\s*<a[^>]*href=["'](?P<href>[^"']+)["'][^>]*>(?P<title>[^<]+)"#,
    )
    .expect("valid catalog anchor regex");
    let image_regex =
        Regex::new(r#"class=["'][^"']*\bfore\b[^"']*["'][^>]*src=["'](?P<src>[^"']+)["']"#)
            .expect("valid catalog image regex");
    let summary_regex = Regex::new(
        r#"class=["'][^"']*(?:summary|tile-desc|tile-description)[^"']*["'][^>]*>(?P<summary>.*?)</"#,
    )
    .expect("valid catalog summary regex");
    let author_regex =
        Regex::new(r#"Created by\s*(?P<author>[^<]+)"#).expect("valid catalog author regex");

    html.split("mod-tile")
        .skip(1)
        .filter_map(|section| {
            let anchor = anchor_regex.captures(section)?;
            let href = anchor.name("href")?.as_str();
            let title = decode_html(anchor.name("title")?.as_str()).trim().to_string();
            let mod_url = normalize_nexus_url(href);
            let mod_id = mod_url
                .rsplit('/')
                .find_map(|segment| segment.parse::<i64>().ok())?;
            let image_url = image_regex
                .captures(section)
                .and_then(|captures| captures.name("src"))
                .map(|value| normalize_nexus_url(value.as_str()));
            let summary = summary_regex
                .captures(section)
                .and_then(|captures| captures.name("summary"))
                .map(|value| {
                    let tag_regex = Regex::new(r"<[^>]+>").expect("valid strip tags regex");
                    decode_html(tag_regex.replace_all(value.as_str(), " ").trim())
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|value| !value.is_empty());
            let author = author_regex
                .captures(section)
                .and_then(|captures| captures.name("author"))
                .map(|value| decode_html(value.as_str()).trim().to_string())
                .filter(|value| !value.is_empty());

            Some(LauncherCatalogResult {
                mod_id,
                title,
                summary,
                author,
                uploader: None,
                mod_url,
                image_url,
                category: None,
                created_at: None,
                updated_at: None,
                downloads: None,
                endorsements: None,
                file_size: None,
                update_available: false,
            })
        })
        .collect()
}

fn parse_remote_mod_detail_node(node: &Value) -> Option<RemoteModDetail> {
    let mod_id = node.get("modId").and_then(Value::as_i64)?;
    Some(RemoteModDetail {
        mod_id,
        name: string_field(node, "name"),
        author: None,
        summary: string_field(node, "summary"),
        version: string_field(node, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(node, "pictureUrl"),
        gallery_images: Vec::new(),
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
                uploader: string_field(item, "author"),
                mod_url: build_mod_page_url(mod_id),
                image_url: string_field(item, "picture_url"),
                category: None,
                created_at: None,
                updated_at: string_field(item, "updated_at"),
                downloads: item.get("downloads").and_then(Value::as_u64),
                endorsements: item.get("endorsements").and_then(Value::as_u64),
                file_size: item.get("file_size").and_then(Value::as_u64),
                update_available: false,
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
        page_size: DEFAULT_PAGE_SIZE,
        total_count: total,
        has_more: offset + page_results.len() < total,
        facets: empty_catalog_facets(),
        results: page_results,
    })
}

fn load_public_catalog_page_from_graphql(
    client: &Client,
    request: &SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let headers = public_graphql_headers(
        PUBLIC_CATALOG_GRAPHQL_REFERER,
        PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER,
    )?;
    let payload = build_public_catalog_graphql_payload(request)?;
    let response = send_nexus_request(|| {
        client
            .post(PUBLIC_GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Public Nexus catalog GraphQL request failed: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse public Nexus catalog GraphQL response: {error}"))?;
    parse_catalog_graphql_response(&payload, page, page_size)
}

fn load_public_catalog_page_from_html(
    client: &Client,
    request: &SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let sort = request.sort.as_deref().unwrap_or("newest");
    let ascending = request.ascending.unwrap_or(false);
    let url = launcher_catalog_url(request, page, page_size, sort, ascending)?;
    let headers = public_page_headers(Some(PUBLIC_CATALOG_PAGE_URL))?;
    let response = send_nexus_request(|| client.get(url.clone()).headers(headers.clone()).send())?;
    if !response.status().is_success() {
        return Err(format!(
            "Public Nexus catalog request failed: HTTP {}",
            response.status()
        ));
    }

    let html = response
        .text()
        .map_err(|error| format!("Failed to read public Nexus catalog response: {error}"))?;
    let results = parse_catalog_results(&html);

    Ok(LauncherCatalogPageResult {
        page,
        page_size,
        total_count: results.len(),
        has_more: results.len() >= page_size,
        facets: empty_catalog_facets(),
        results,
    })
}

fn load_public_catalog_page(
    client: &Client,
    request: &SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    match load_public_catalog_page_from_graphql(client, request) {
        Ok(result) => Ok(result),
        Err(error) => {
            log::warn!("launcher public GraphQL catalog lookup failed, falling back to legacy HTML: {error}");
            load_public_catalog_page_from_html(client, request)
        }
    }
}

fn load_catalog_page_from_graphql(
    client: &Client,
    settings: &LauncherSettings,
    payload: &Value,
    page: usize,
    page_size: usize,
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
    parse_catalog_graphql_response(&payload, page, page_size)
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
        author: string_field(&json, "author"),
        summary: string_field(&json, "summary").or_else(|| string_field(&json, "description")),
        version: string_field(&json, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(&json, "picture_url"),
        gallery_images: Vec::new(),
    })
}

pub(crate) fn parse_remote_mod_detail_html(html: &str, mod_id: i64) -> Option<RemoteModDetail> {
    let title_regex =
        Regex::new(r#"<meta property=["']og:title["'] content=["'](?P<title>[^"']+)["']"#)
            .expect("valid mod title regex");
    let summary_regex = Regex::new(
        r#"<meta property=["']og:description["'] content=["'](?P<summary>[^"']+)["']"#,
    )
    .expect("valid mod summary regex");
    let image_regex =
        Regex::new(r#"<meta property=["']og:image["'] content=["'](?P<src>[^"']+)["']"#)
            .expect("valid mod image regex");
    let version_regex = Regex::new(
        r#"twitter:label1["'][^>]*content=["']Version["'][^>]*>\s*<meta property=["']twitter:data1["'] content=["'](?P<version>[^"']+)["']"#,
    )
    .expect("valid mod version regex");
    let gallery_regex =
        Regex::new(r#"data-src=["'](?P<src>https://[^"']+)["']"#).expect("valid mod gallery regex");

    let title = title_regex
        .captures(html)
        .and_then(|captures| captures.name("title"))
        .map(|value| decode_html(value.as_str()).trim().to_string())
        .filter(|value| !value.is_empty())?;
    let summary = summary_regex
        .captures(html)
        .and_then(|captures| captures.name("summary"))
        .map(|value| decode_html(value.as_str()).trim().to_string())
        .filter(|value| !value.is_empty());
    let image_url = image_regex
        .captures(html)
        .and_then(|captures| captures.name("src"))
        .map(|value| normalize_nexus_url(value.as_str()));
    let version = version_regex
        .captures(html)
        .and_then(|captures| captures.name("version"))
        .map(|value| decode_html(value.as_str()).trim().trim_start_matches('v').to_string())
        .filter(|value| !value.is_empty());

    let mut gallery_images = Vec::new();
    for captures in gallery_regex.captures_iter(html) {
        let Some(src) = captures.name("src") else {
            continue;
        };
        let normalized = normalize_nexus_url(src.as_str());
        if !gallery_images.iter().any(|value| value == &normalized) {
            gallery_images.push(normalized);
        }
    }

    Some(RemoteModDetail {
        mod_id,
        name: Some(title),
        author: None,
        summary,
        version,
        mod_url: build_mod_page_url(mod_id),
        image_url,
        gallery_images,
    })
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn html_to_text(value: &str) -> String {
    let break_regex = Regex::new(r"(?i)<br\s*/?>").expect("valid html break regex");
    let tag_regex = Regex::new(r"<[^>]+>").expect("valid strip tags regex");
    let with_line_breaks = break_regex.replace_all(value, "\n");
    collapse_whitespace(&decode_html(tag_regex.replace_all(with_line_breaks.as_ref(), " ").trim()))
}

fn extract_html_image_urls(value: &str) -> Vec<String> {
    let image_regex =
        Regex::new(r#"(?i)<img[^>]+src=["'](?P<src>https?://[^"']+)["']"#).expect("valid image regex");
    let mut images = Vec::new();
    for captures in image_regex.captures_iter(value) {
        let Some(src) = captures.name("src") else {
            continue;
        };
        let normalized = normalize_nexus_url(src.as_str());
        if !images.iter().any(|value| value == &normalized) {
            images.push(normalized);
        }
    }
    images
}

pub(crate) fn parse_public_mod_detail_graphql_response(
    payload: &Value,
    mod_id: i64,
) -> Result<RemoteModDetail, String> {
    if let Some(error) = extract_graphql_error(payload) {
        return Err(error);
    }

    let mod_node = payload
        .get("data")
        .and_then(|value| value.get("mod"))
        .ok_or_else(|| "Public Nexus mod detail response did not include a mod payload.".to_string())?;
    let description_html = string_field(mod_node, "description");
    let description_text = description_html
        .as_deref()
        .map(html_to_text)
        .filter(|value| !value.is_empty());
    let author = string_field(mod_node, "author").or_else(|| {
        mod_node
            .get("uploader")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    });

    Ok(RemoteModDetail {
        mod_id: mod_node.get("modId").and_then(Value::as_i64).unwrap_or(mod_id),
        name: string_field(mod_node, "name"),
        author,
        summary: description_text.or_else(|| string_field(mod_node, "summary")),
        version: string_field(mod_node, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(mod_node, "pictureUrl").or_else(|| string_field(mod_node, "thumbnailUrl")),
        gallery_images: description_html
            .as_deref()
            .map(extract_html_image_urls)
            .unwrap_or_default(),
    })
}

fn load_remote_mod_detail_from_public_graphql(client: &Client, mod_id: i64) -> Result<RemoteModDetail, String> {
    let mod_url = build_mod_page_url(mod_id);
    let headers = public_graphql_headers(
        &mod_url,
        PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER,
    )?;
    let payload = json!({
        "operationName": PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER,
        "query": PUBLIC_MOD_DETAIL_GRAPHQL_QUERY,
        "variables": {
            "gameId": DEFAULT_GAME_ID.to_string(),
            "modId": mod_id.to_string(),
        }
    });
    let response = send_nexus_request(|| {
        client
            .post(PUBLIC_GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })?;
    if !response.status().is_success() {
        return Err(format!(
            "Public Nexus mod detail GraphQL request failed for {mod_id}: HTTP {}",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("Failed to parse public Nexus mod detail GraphQL response: {error}"))?;
    parse_public_mod_detail_graphql_response(&payload, mod_id)
}

fn load_remote_mod_detail_from_html(client: &Client, mod_id: i64) -> Result<RemoteModDetail, String> {
    let mod_url = build_mod_page_url(mod_id);
    let headers = public_page_headers(None)?;
    let response = send_nexus_request(|| {
        client
            .get(&mod_url)
            .headers(headers.clone())
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
    parse_remote_mod_detail_html(&html, mod_id)
        .ok_or_else(|| format!("Failed to parse launcher mod page HTML for {mod_id}."))
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

fn to_launcher_remote_mod_detail(detail: RemoteModDetail) -> LauncherRemoteModDetail {
    LauncherRemoteModDetail {
        mod_id: detail.mod_id,
        title: detail
            .name
            .clone()
            .unwrap_or_else(|| format!("Nexus #{}", detail.mod_id)),
        summary: detail.summary,
        author: detail.author,
        version: detail.version,
        mod_url: detail.mod_url,
        image_url: detail.image_url,
        gallery_images: detail.gallery_images,
    }
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
pub async fn search_launcher_catalog(
    app: tauri::AppHandle,
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "search_launcher_catalog",
        tauri::async_runtime::spawn_blocking(move || search_launcher_catalog_blocking(&app, &request))
            .await
            .map_err(|error| format!("Failed to join launcher catalog search task: {error}"))?,
    )
}

#[tauri::command]
pub async fn load_launcher_remote_mod_detail(
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_remote_mod_detail",
        tauri::async_runtime::spawn_blocking(move || load_launcher_remote_mod_detail_blocking(&request))
            .await
            .map_err(|error| format!("Failed to join launcher mod detail task: {error}"))?,
    )
}

fn search_launcher_catalog_blocking(
    app: &tauri::AppHandle,
    request: &SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let sort = request.sort.clone().unwrap_or_else(|| "newest".to_string());
    let ascending = request.ascending.unwrap_or(false);
    let query = normalize_optional_text(request.query.clone());
    let settings_path = launcher_settings_path(app)?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let client = launcher_http_client()?;
    log_launcher_trace(
        "catalog.search.start",
        &[
            ("page", page.to_string()),
            ("pageSize", page_size.to_string()),
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
        let result = load_public_catalog_page(&client, request)?;
        log_launcher_trace(
            "catalog.search.complete",
            &[
                ("page", result.page.to_string()),
                ("pageSize", result.page_size.to_string()),
                ("totalCount", result.total_count.to_string()),
                ("resultCount", result.results.len().to_string()),
                ("hasMore", result.has_more.to_string()),
                ("source", "public-html".to_string()),
            ],
        );
        return Ok(result);
    }

    let payload = build_catalog_graphql_payload(request)?;
    let result = match load_catalog_page_from_graphql(&client, &settings, &payload, page, page_size) {
        Ok(result) => {
            log_launcher_trace(
                "catalog.search.complete",
                &[
                    ("page", result.page.to_string()),
                    ("pageSize", result.page_size.to_string()),
                    ("totalCount", result.total_count.to_string()),
                    ("resultCount", result.results.len().to_string()),
                    ("hasMore", result.has_more.to_string()),
                    ("source", "graphql".to_string()),
                ],
            );
            result
        }
        Err(error) => {
            log::warn!("launcher graphql catalog lookup failed, falling back to public HTML: {error}");
            let result = load_public_catalog_page(&client, request)?;
            log_launcher_trace(
                "catalog.search.complete",
                &[
                    ("page", result.page.to_string()),
                    ("pageSize", result.page_size.to_string()),
                    ("totalCount", result.total_count.to_string()),
                    ("resultCount", result.results.len().to_string()),
                    ("hasMore", result.has_more.to_string()),
                    ("source", "public-html-fallback".to_string()),
                ],
            );
            result
        }
    };

    Ok(result)
}

fn load_launcher_remote_mod_detail_blocking(
    request: &LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    if request.mod_id <= 0 {
        return Err("modId must be a positive integer.".to_string());
    }

    let client = launcher_http_client()?;
    let detail = load_remote_mod_detail_from_public_graphql(&client, request.mod_id).or_else(|error| {
        log::warn!("launcher public GraphQL mod detail lookup failed, falling back to HTML: {error}");
        load_remote_mod_detail_from_html(&client, request.mod_id)
    })?;

    Ok(to_launcher_remote_mod_detail(detail))
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
