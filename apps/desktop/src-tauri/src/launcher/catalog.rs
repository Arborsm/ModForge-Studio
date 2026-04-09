use super::http::{api_headers, launcher_http_client, DEFAULT_GAME_ID, LAUNCHER_USER_AGENT};
use super::library::scan_library_at_path;
use super::paths::{current_timestamp_ms, launcher_settings_path};
use super::settings::{load_or_create_settings_at_path, normalize_optional_text};
use super::types::{
    CheckLauncherUpdatesRequest, LauncherCatalogPageResult, LauncherCatalogResult,
    LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult, SearchLauncherCatalogRequest,
};
use crate::pathing::clean_input_path;
use regex::Regex;
use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;
use semver::Version;
use serde_json::Value;

const DEFAULT_PAGE_SIZE: usize = 20;

#[derive(Debug, Clone)]
struct RemoteModDetail {
    name: Option<String>,
    version: Option<String>,
    mod_url: String,
    image_url: Option<String>,
}

fn launcher_catalog_url(
    query: Option<&str>,
    page: usize,
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
    let mut filter = format!(
        "nav:true,home:false,type:0,user_id:0,game_id:{DEFAULT_GAME_ID},advfilt:true,include_adult:true,show_game_filter:false,page_size:{DEFAULT_PAGE_SIZE},page:{page},order:{order},sort_by={sort_key}"
    );
    if let Some(search) = query {
        filter.push_str(",search_filename=");
        filter.push_str(search);
    }

    let mut url = reqwest::Url::parse("https://www.nexusmods.com/Core/Libs/Common/Widgets/ModList")
        .map_err(|error| format!("Failed to build launcher catalog URL: {error}"))?;
    url.query_pairs_mut().append_pair("RH_ModList", &filter);
    Ok(url)
}

fn parse_catalog_results(html: &str) -> Vec<LauncherCatalogResult> {
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
            let mod_id = parse_mod_id_from_url(&mod_url)?;
            let image_url = image_regex
                .captures(section)
                .and_then(|captures| captures.name("src"))
                .map(|match_| normalize_nexus_url(match_.as_str()));
            let summary = summary_regex
                .captures(section)
                .and_then(|captures| captures.name("summary"))
                .map(|match_| strip_tags(match_.as_str()))
                .filter(|value| !value.is_empty());
            let author = author_regex
                .captures(section)
                .and_then(|captures| captures.name("author"))
                .map(|match_| decode_html(match_.as_str()).trim().to_string())
                .filter(|value| !value.is_empty());

            Some(LauncherCatalogResult {
                mod_id,
                title,
                summary,
                author,
                mod_url,
                image_url,
            })
        })
        .collect()
}

fn normalize_nexus_url(value: &str) -> String {
    if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("https://www.nexusmods.com{}", value.trim())
    }
}

fn parse_mod_id_from_url(value: &str) -> Option<i64> {
    value.rsplit('/').find_map(|segment| segment.parse::<i64>().ok())
}

fn strip_tags(value: &str) -> String {
    let tag_regex = Regex::new(r"<[^>]+>").expect("valid strip tags regex");
    decode_html(tag_regex.replace_all(value, " ").trim())
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
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

fn build_mod_page_url(mod_id: i64) -> String {
    format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}")
}

#[tauri::command]
pub fn search_launcher_catalog(
    request: SearchLauncherCatalogRequest,
) -> Result<LauncherCatalogPageResult, String> {
    let page = request.page.unwrap_or(1).max(1);
    let sort = request.sort.unwrap_or_else(|| "newest".to_string());
    let ascending = request.ascending.unwrap_or(false);
    let query = normalize_optional_text(request.query);
    let url = launcher_catalog_url(query.as_deref(), page, &sort, ascending)?;
    let client = launcher_http_client()?;
    let response = client
        .get(url)
        .send()
        .map_err(|error| format!("Failed to fetch launcher catalog: {error}"))?;
    let html = response
        .text()
        .map_err(|error| format!("Failed to read launcher catalog response: {error}"))?;
    let results = parse_catalog_results(&html);

    Ok(LauncherCatalogPageResult {
        page,
        has_more: results.len() >= DEFAULT_PAGE_SIZE,
        results,
    })
}

#[tauri::command]
pub fn check_launcher_updates(
    app: tauri::AppHandle,
    request: CheckLauncherUpdatesRequest,
) -> Result<LauncherUpdatesResult, String> {
    let mods_path = request.mods_path.trim();
    if mods_path.is_empty() {
        return Err("modsPath is required.".to_string());
    }

    let settings_path = launcher_settings_path(&app)?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let scan = scan_library_at_path(&clean_input_path(mods_path))?;
    let mut updates = Vec::new();

    for item in &scan.mods {
        let Some(mod_id) = item.nexus_mod_id else {
            continue;
        };
        let Some(current_version) = item.version.as_deref() else {
            continue;
        };

        let remote = match load_remote_mod_detail(&settings, mod_id) {
            Ok(detail) => detail,
            Err(error) => {
                log::debug!("launcher update lookup skipped for {mod_id}: {error}");
                continue;
            }
        };

        let Some(latest_version) = remote.version else {
            continue;
        };
        if !version_is_newer(current_version, &latest_version) {
            continue;
        }

        updates.push(LauncherUpdateSummary {
            mod_id,
            name: remote.name.unwrap_or_else(|| item.name.clone()),
            current_version: item.version.clone(),
            latest_version,
            absolute_path: item.absolute_path.clone(),
            mod_url: remote.mod_url,
            image_url: remote.image_url,
        });
    }

    updates.sort_by(|left, right| left.name.cmp(&right.name));

    Ok(LauncherUpdatesResult {
        mods_path: scan.mods_path,
        checked_at_ms: current_timestamp_ms(),
        updates,
    })
}

fn load_remote_mod_detail(settings: &LauncherSettings, mod_id: i64) -> Result<RemoteModDetail, String> {
    let client = launcher_http_client()?;
    if let Some(api_key) = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if let Ok(detail) = load_remote_mod_detail_from_api(&client, api_key, mod_id) {
            return Ok(detail);
        }
    }

    load_remote_mod_detail_from_html(&client, mod_id)
}

fn load_remote_mod_detail_from_api(
    client: &Client,
    api_key: &str,
    mod_id: i64,
) -> Result<RemoteModDetail, String> {
    let payload = client
        .get(format!(
            "https://api.nexusmods.com/v1/games/stardewvalley/mods/{mod_id}.json"
        ))
        .headers(api_headers(api_key)?)
        .send()
        .map_err(|error| format!("Failed to fetch launcher mod metadata: {error}"))?;
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
        name: string_field(&json, "name"),
        version: string_field(&json, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(&json, "picture_url"),
    })
}

fn load_remote_mod_detail_from_html(client: &Client, mod_id: i64) -> Result<RemoteModDetail, String> {
    let mod_url = build_mod_page_url(mod_id);
    let html = client
        .get(&mod_url)
        .header(USER_AGENT, LAUNCHER_USER_AGENT)
        .send()
        .map_err(|error| format!("Failed to fetch launcher mod page: {error}"))?
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
        name: title_regex
            .captures(&html)
            .and_then(|captures| captures.name("title"))
            .map(|match_| decode_html(match_.as_str()).trim().to_string())
            .filter(|value| !value.is_empty()),
        version: version_regex
            .captures(&html)
            .and_then(|captures| captures.name("version"))
            .map(|match_| decode_html(match_.as_str()).trim().trim_start_matches('v').to_string())
            .filter(|value| !value.is_empty()),
        mod_url,
        image_url: image_regex
            .captures(&html)
            .and_then(|captures| captures.name("src"))
            .map(|match_| normalize_nexus_url(match_.as_str())),
    })
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
