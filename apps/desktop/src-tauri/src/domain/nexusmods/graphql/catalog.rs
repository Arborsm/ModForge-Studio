use crate::AppHandle;
use crate::domain::launcher::paths::launcher_settings_path;
use crate::domain::launcher::settings::{load_or_create_settings_at_path, normalize_optional_text};
use crate::domain::launcher::trace::log_launcher_trace;
use crate::domain::launcher::types::{
    LauncherCatalogFacetEntry, LauncherCatalogFacets, LauncherCatalogPageResult,
    LauncherCatalogResult, LauncherSettings, SearchLauncherCatalogRequest,
};
use crate::domain::nexusmods::can_use_nexus_graphql;
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::graphql;
use crate::domain::nexusmods::http::{api_headers, launcher_http_client, send_nexus_json_request};
use crate::domain::nexusmods::routes::LauncherNexusRoute;
use crate::domain::nexusmods::shared::{build_mod_page_url, extract_graphql_error, string_field};
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use serde_json::{Value, json};
use time::{Duration, OffsetDateTime};

const DEFAULT_PAGE_SIZE: usize = 20;
const MAX_PAGE_SIZE: usize = 80;
const PUBLIC_CATALOG_GRAPHQL_REFERER: &str = "https://www.nexusmods.com/";
const PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER: &str = "GameModsListing";
const TRENDING_ENDPOINT: &str =
    "https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json";
const CATALOG_GRAPHQL_QUERY: &str = r#"
query CatalogMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
  mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
    totalCount
    nodes {
      modId
      name
      summary
      pictureUrl
      createdAt
      downloads
      endorsements
      fileSize
      modCategory {
        name
      }
      updatedAt
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
fn graphql_filter_value(value: &str, op: &str) -> Value {
    json!([{ "value": value, "op": op }])
}

fn has_catalog_text(value: &Option<String>) -> bool {
    normalize_optional_text(value.clone()).is_some()
}

fn has_catalog_advanced_filters(request: &SearchLauncherCatalogRequest) -> bool {
    has_catalog_text(&request.category)
        || has_catalog_text(&request.language)
        || has_catalog_text(&request.tags_include)
        || has_catalog_text(&request.tags_exclude)
        || request.min_file_size.is_some()
        || request.max_file_size.is_some()
        || request.min_downloads.is_some()
        || request.max_downloads.is_some()
        || request.min_endorsements.is_some()
        || request.max_endorsements.is_some()
}

fn has_catalog_constraints(request: &SearchLauncherCatalogRequest) -> bool {
    has_catalog_text(&request.query)
        || has_catalog_text(&request.title_query)
        || has_catalog_text(&request.description_query)
        || has_catalog_text(&request.author_query)
        || has_catalog_text(&request.uploader_query)
        || has_catalog_advanced_filters(request)
        || catalog_time_range_days(request.time_range.as_deref()).is_some()
        || request.include_adult.unwrap_or(false)
}

fn catalog_page_size(requested: Option<usize>) -> usize {
    requested
        .unwrap_or(DEFAULT_PAGE_SIZE)
        .clamp(20, MAX_PAGE_SIZE)
}

fn build_catalog_sort(sort: &str, ascending: bool) -> Value {
    let direction = if ascending { "ASC" } else { "DESC" };
    match sort {
        "updated" => json!([{ "updatedAt": { "direction": direction } }]),
        "downloads" => json!([{ "downloads": { "direction": direction } }]),
        "endorsements" => json!([{ "endorsements": { "direction": direction } }]),
        "name" => json!([{ "name": { "direction": direction } }]),
        // GraphQL does not currently expose a first-class "trending" sort, so the
        // anonymous path approximates it with endorsements while the credentialed
        // path uses the dedicated trending endpoint when available.
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

fn catalog_time_range_days(time_range: Option<&str>) -> Option<i64> {
    match time_range
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("day") => Some(1),
        Some("week") => Some(7),
        Some("month") => Some(30),
        Some("year") => Some(365),
        _ => None,
    }
}

fn catalog_time_range_filter_field(sort: &str) -> &'static str {
    match sort {
        "updated" => "updatedAt",
        _ => "createdAt",
    }
}

fn build_catalog_time_range_filter(
    time_range: Option<&str>,
    sort: &str,
) -> anyhow::Result<Option<(&'static str, Value)>> {
    let days = match catalog_time_range_days(time_range) {
        Some(value) => value,
        None => return Ok(None),
    };
    let lower_bound = (OffsetDateTime::now_utc() - Duration::days(days))
        .unix_timestamp()
        .to_string();

    Ok(Some((
        catalog_time_range_filter_field(sort),
        json!([{ "value": lower_bound, "op": "GTE" }]),
    )))
}

pub(crate) fn build_catalog_graphql_payload(
    request: &SearchLauncherCatalogRequest,
) -> anyhow::Result<Value> {
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
    if !request.include_adult.unwrap_or(false) {
        filter.insert(
            "adultContent".to_string(),
            json!([{ "op": "EQUALS", "value": false }]),
        );
    }

    if let Some(query) = query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        filter.insert("name".to_string(), graphql_filter_value(query, "WILDCARD"));
    }
    if let Some(query) = title_query.as_deref() {
        filter.insert("name".to_string(), graphql_filter_value(query, "WILDCARD"));
    }
    if let Some(query) = description_query.as_deref() {
        filter.insert(
            "description".to_string(),
            graphql_filter_value(query, "MATCHES"),
        );
    }
    if let Some(query) = author_query.as_deref() {
        filter.insert(
            "author".to_string(),
            graphql_filter_value(query, "WILDCARD"),
        );
    }
    if let Some(query) = uploader_query.as_deref() {
        filter.insert(
            "uploader".to_string(),
            graphql_filter_value(query, "WILDCARD"),
        );
    }
    if let Some((field, value)) =
        build_catalog_time_range_filter(request.time_range.as_deref(), sort)?
    {
        filter.insert(field.to_string(), value);
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
) -> anyhow::Result<Value> {
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
    if !request.include_adult.unwrap_or(false) {
        filter.insert(
            "adultContent".to_string(),
            json!([{ "op": "EQUALS", "value": false }]),
        );
    }
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
    if let Some((field, value)) =
        build_catalog_time_range_filter(request.time_range.as_deref(), sort)?
    {
        filter.insert(field.to_string(), value);
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
        filter.insert(
            "endorsements".to_string(),
            Value::Array(endorsement_filters),
        );
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
) -> anyhow::Result<LauncherCatalogPageResult> {
    if let Some(error) = extract_graphql_error(payload) {
        return Err(anyhow::anyhow!(error));
    }

    let mods = payload
        .get("data")
        .and_then(|value| value.get("mods"))
        .context("Nexus catalog response did not include a mods payload.")?;
    let total_count = mods
        .get("totalCount")
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let nodes = mods
        .get("nodes")
        .and_then(Value::as_array)
        .context("Nexus catalog response did not include a nodes array.")?;
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

fn u64_field(node: &Value, key: &str) -> Option<u64> {
    node.get(key).and_then(|value| {
        value.as_u64().or_else(|| {
            value
                .as_str()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .and_then(|value| value.parse::<u64>().ok())
        })
    })
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
        downloads: u64_field(node, "downloads"),
        endorsements: u64_field(node, "endorsements"),
        file_size: u64_field(node, "fileSize"),
        update_available: node
            .get("viewerUpdateAvailable")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

fn parse_trending_catalog_response(
    payload: &Value,
    page: usize,
    ascending: bool,
) -> anyhow::Result<LauncherCatalogPageResult> {
    let items = payload
        .as_array()
        .context("Nexus trending response did not return an array.")?;
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
) -> anyhow::Result<LauncherCatalogPageResult> {
    probe_blocked_launcher_nexus_route(client, None, LauncherNexusRoute::PublicGraphql)?;
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let headers = graphql::public_graphql_headers(
        PUBLIC_CATALOG_GRAPHQL_REFERER,
        PUBLIC_CATALOG_GRAPHQL_OPERATION_HEADER,
    )?;
    let payload = build_public_catalog_graphql_payload(request)?;
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })
    .with_context(|| format!("Public Nexus catalog GraphQL response failed"))?;
    if !status.is_success() {
        bail!(
            "Public Nexus catalog GraphQL request failed: HTTP {}",
            status
        );
    }

    parse_catalog_graphql_response(&response_payload, page, page_size)
}

fn load_public_catalog_page(
    client: &Client,
    request: &SearchLauncherCatalogRequest,
) -> anyhow::Result<LauncherCatalogPageResult> {
    load_public_catalog_page_from_graphql(client, request)
}

fn load_catalog_page_from_graphql(
    client: &Client,
    settings: &LauncherSettings,
    payload: &Value,
    page: usize,
    page_size: usize,
) -> anyhow::Result<LauncherCatalogPageResult> {
    if !can_use_nexus_graphql(settings) {
        bail!("Configure a Nexus API key before querying Nexus Mods.");
    }
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PrivateGraphql)?;

    let headers = graphql::graphql_headers(settings.nexus_api_key.as_deref())?;
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(payload)
            .send()
    })
    .with_context(|| format!("Nexus catalog GraphQL response failed"))?;
    if !status.is_success() {
        bail!("Nexus catalog GraphQL request failed: HTTP {}", status);
    }

    parse_catalog_graphql_response(&response_payload, page, page_size)
}

fn load_trending_catalog_page(
    client: &Client,
    settings: &LauncherSettings,
    api_key: &str,
    page: usize,
    ascending: bool,
) -> anyhow::Result<LauncherCatalogPageResult> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::NexusApi)?;
    let headers = api_headers(api_key)?;
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .get(TRENDING_ENDPOINT)
            .headers(headers.clone())
            .send()
    })
    .with_context(|| format!("Nexus trending response failed"))?;
    if !status.is_success() {
        bail!("Nexus trending request failed: HTTP {}", status);
    }

    parse_trending_catalog_response(&response_payload, page, ascending)
}

pub(crate) fn search_launcher_catalog_blocking(
    _app: &AppHandle,
    request: &SearchLauncherCatalogRequest,
) -> anyhow::Result<LauncherCatalogPageResult> {
    let page = request.page.unwrap_or(1).max(1);
    let page_size = catalog_page_size(request.page_size);
    let sort = request.sort.clone().unwrap_or_else(|| "newest".to_string());
    let ascending = request.ascending.unwrap_or(false);
    let query = normalize_optional_text(request.query.clone());
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let client = launcher_http_client()?;
    log_launcher_trace(
        "catalog.search.start",
        &[
            ("page", page.to_string()),
            ("page-size", page_size.to_string()),
            ("sort", sort.clone()),
            ("ascending", ascending.to_string()),
            ("query", query.clone().unwrap_or_default()),
        ],
    );

    if query.is_none() && sort == "trending" && !has_catalog_constraints(request) {
        if let Some(api_key) = settings
            .nexus_api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let result = load_trending_catalog_page(&client, &settings, api_key, page, ascending)?;
            if !result.facets.categories.is_empty()
                || !result.facets.languages.is_empty()
                || !result.facets.tags.is_empty()
            {
                log_launcher_trace(
                    "catalog.search.complete",
                    &[
                        ("page", result.page.to_string()),
                        ("results", result.results.len().to_string()),
                        ("has-more", result.has_more.to_string()),
                        ("source", "trending".to_string()),
                    ],
                );
                return Ok(result);
            }
        }
    }

    if query.is_none() || has_catalog_advanced_filters(request) {
        let result = load_public_catalog_page(&client, request)?;
        log_launcher_trace(
            "catalog.search.complete",
            &[
                ("page", result.page.to_string()),
                ("page-size", result.page_size.to_string()),
                ("total", result.total_count.to_string()),
                ("results", result.results.len().to_string()),
                ("has-more", result.has_more.to_string()),
                ("source", "public-graphql".to_string()),
            ],
        );
        return Ok(result);
    }

    if !can_use_nexus_graphql(&settings) {
        let result = load_public_catalog_page(&client, request)?;
        log_launcher_trace(
            "catalog.search.complete",
            &[
                ("page", result.page.to_string()),
                ("page-size", result.page_size.to_string()),
                ("total", result.total_count.to_string()),
                ("results", result.results.len().to_string()),
                ("has-more", result.has_more.to_string()),
                ("source", "public-graphql".to_string()),
            ],
        );
        return Ok(result);
    }

    let payload = build_catalog_graphql_payload(request)?;
    let result = match load_catalog_page_from_graphql(&client, &settings, &payload, page, page_size)
    {
        Ok(result) => {
            log_launcher_trace(
                "catalog.search.complete",
                &[
                    ("page", result.page.to_string()),
                    ("page-size", result.page_size.to_string()),
                    ("total", result.total_count.to_string()),
                    ("results", result.results.len().to_string()),
                    ("has-more", result.has_more.to_string()),
                    ("source", "graphql".to_string()),
                ],
            );
            result
        }
        Err(error) => {
            log::warn!(
                "launcher graphql catalog lookup failed, falling back to public GraphQL: {error}"
            );
            let result = load_public_catalog_page(&client, request)?;
            log_launcher_trace(
                "catalog.search.complete",
                &[
                    ("page", result.page.to_string()),
                    ("page-size", result.page_size.to_string()),
                    ("total", result.total_count.to_string()),
                    ("results", result.results.len().to_string()),
                    ("has-more", result.has_more.to_string()),
                    ("source", "public-graphql-fallback".to_string()),
                ],
            );
            result
        }
    };

    Ok(result)
}

#[cfg(test)]
#[path = "../../../tests/integration/nexusmods_catalog_tests.rs"]
mod nexusmods_catalog_tests;
