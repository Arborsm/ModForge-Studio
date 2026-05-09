use super::http::{
    launcher_http_client, probe_blocked_launcher_nexus_route, public_graphql_headers,
    public_page_headers, send_nexus_json_request, send_nexus_public_html_request,
    LauncherNexusRoute, DEFAULT_GAME_ID,
};
use super::paths::launcher_settings_path;
use super::settings::load_or_create_settings_at_path;
use super::shared::{
    build_mod_page_url, decode_html, extract_graphql_error, normalize_nexus_url, string_field,
};
use super::types::{
    LauncherRemoteModDetail, LauncherSettings, LauncherUpdateChangelogResult,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
};
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::{json, Value};

const PUBLIC_GRAPHQL_ENDPOINT: &str = "https://api-router.nexusmods.com/graphql";
const PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER: &str = "LauncherPublicModDetail";
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
    pub(crate) updated_at: Option<String>,
    pub(crate) file_size: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct LauncherUpdateFileMetadata {
    pub(crate) author: Option<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) file_size: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedLauncherUpdateChangelog {
    pub(crate) version: Option<String>,
    pub(crate) changelog: String,
}
pub(super) fn parse_remote_mod_detail_node(node: &Value) -> Option<RemoteModDetail> {
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
        updated_at: None,
        file_size: None,
    })
}

pub(crate) fn parse_remote_mod_detail_html(html: &str, mod_id: i64) -> Option<RemoteModDetail> {
    let title_regex =
        Regex::new(r#"<meta property=["']og:title["'] content=["'](?P<title>[^"']+)["']"#)
            .expect("valid mod title regex");
    let summary_regex =
        Regex::new(r#"<meta property=["']og:description["'] content=["'](?P<summary>[^"']+)["']"#)
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
        .map(|value| {
            decode_html(value.as_str())
                .trim()
                .trim_start_matches('v')
                .to_string()
        })
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
        updated_at: None,
        file_size: None,
    })
}

pub(crate) fn parse_remote_mod_images_tab_html(html: &str) -> Vec<String> {
    let image_regex = Regex::new(
        r#"href=["'](?P<src>https://staticdelivery\.nexusmods\.com/mods/\d+/images/[^"'?#]+)["']"#,
    )
    .expect("valid mod images tab regex");
    let mut images = Vec::new();
    for captures in image_regex.captures_iter(html) {
        let Some(src) = captures.name("src") else {
            continue;
        };
        let normalized = normalize_nexus_url(src.as_str());
        if normalized.contains("/images/thumbnails/") {
            continue;
        }
        if !images.iter().any(|value| value == &normalized) {
            images.push(normalized);
        }
    }
    images
}

pub(crate) fn enrich_remote_mod_detail_with_gallery_images(
    mut detail: RemoteModDetail,
    gallery_images: Vec<String>,
) -> RemoteModDetail {
    if detail.gallery_images.is_empty() && !gallery_images.is_empty() {
        detail.gallery_images = gallery_images.clone();
    }
    if detail.image_url.is_none() {
        detail.image_url = gallery_images.first().cloned();
    }
    detail
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn html_to_text(value: &str) -> String {
    let break_regex = Regex::new(r"(?i)<br\s*/?>").expect("valid html break regex");
    let tag_regex = Regex::new(r"<[^>]+>").expect("valid strip tags regex");
    let with_line_breaks = break_regex.replace_all(value, "\n");
    collapse_whitespace(&decode_html(
        tag_regex.replace_all(with_line_breaks.as_ref(), " ").trim(),
    ))
}

fn html_to_multiline_text(value: &str) -> String {
    let block_break_regex =
        Regex::new(r"(?i)<br\s*/?>|</p>|</div>|</li>|</tr>|</section>|</article>|</h\d>")
            .expect("valid html block break regex");
    let tag_regex = Regex::new(r"<[^>]+>").expect("valid strip tags regex");
    let with_line_breaks = block_break_regex.replace_all(value, "\n");
    let stripped = decode_html(&tag_regex.replace_all(with_line_breaks.as_ref(), " "));

    stripped
        .lines()
        .filter_map(normalize_capture_text)
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_capture_text(value: &str) -> Option<String> {
    let normalized = collapse_whitespace(&decode_html(value).replace('\u{a0}', " "));
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn parse_launcher_month(month: &str) -> Option<u32> {
    match month.trim().to_ascii_lowercase().as_str() {
        "jan" => Some(1),
        "feb" => Some(2),
        "mar" => Some(3),
        "apr" => Some(4),
        "may" => Some(5),
        "jun" => Some(6),
        "jul" => Some(7),
        "aug" => Some(8),
        "sep" => Some(9),
        "oct" => Some(10),
        "nov" => Some(11),
        "dec" => Some(12),
        _ => None,
    }
}

fn parse_launcher_timestamp(value: &str) -> Option<String> {
    let pattern = Regex::new(
        r"(?i)^(?P<day>\d{1,2})\s+(?P<month>[A-Za-z]{3})\s+(?P<year>\d{4}),?\s+(?P<hour>\d{1,2}):(?P<minute>\d{2})\s*(?P<meridiem>AM|PM)$",
    )
    .expect("valid launcher timestamp regex");
    let captures = pattern.captures(value.trim())?;
    let day = captures.name("day")?.as_str().parse::<u32>().ok()?;
    let month = parse_launcher_month(captures.name("month")?.as_str())?;
    let year = captures.name("year")?.as_str().parse::<u32>().ok()?;
    let minute = captures.name("minute")?.as_str().parse::<u32>().ok()?;
    let meridiem = captures.name("meridiem")?.as_str().to_ascii_uppercase();
    let mut hour = captures.name("hour")?.as_str().parse::<u32>().ok()?;
    if hour == 12 {
        hour = 0;
    }
    if meridiem == "PM" {
        hour += 12;
    }

    Some(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:00Z"
    ))
}

fn parse_launcher_file_size(value: &str, unit: &str) -> Option<u64> {
    let parsed_value = value.trim().parse::<f64>().ok()?;
    let multiplier = match unit.trim().to_ascii_uppercase().as_str() {
        "B" => 1_f64,
        "KB" => 1024_f64,
        "MB" => 1024_f64 * 1024_f64,
        "GB" => 1024_f64 * 1024_f64 * 1024_f64,
        _ => return None,
    };

    Some((parsed_value * multiplier).round() as u64)
}

pub(crate) fn parse_launcher_update_file_metadata_text(text: &str) -> LauncherUpdateFileMetadata {
    let updated_regex = Regex::new(
        r"(?is)Last updated\s+(?P<value>\d{1,2}\s+[A-Za-z]{3}\s+\d{4},?\s+\d{1,2}:\d{2}\s*[AP]M)",
    )
    .expect("valid launcher update timestamp regex");
    let author_regex = Regex::new(
        r"(?is)Created by\s+(?P<value>.+?)\s+(?:Virus scan|Tags for this mod|File size|Preview file contents|Main files|Old files|Optional files|Miscellaneous files|$)",
    )
    .expect("valid launcher update author regex");
    let file_size_regex =
        Regex::new(r"(?is)File size\s+(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>B|KB|MB|GB)")
            .expect("valid launcher update file size regex");

    let updated_at = updated_regex
        .captures(text)
        .and_then(|captures| captures.name("value"))
        .and_then(|value| normalize_capture_text(value.as_str()))
        .and_then(|value| parse_launcher_timestamp(&value));
    let author = author_regex
        .captures(text)
        .and_then(|captures| captures.name("value"))
        .and_then(|value| normalize_capture_text(value.as_str()));
    let file_size = file_size_regex.captures(text).and_then(|captures| {
        parse_launcher_file_size(
            captures.name("value")?.as_str(),
            captures.name("unit")?.as_str(),
        )
    });

    LauncherUpdateFileMetadata {
        author,
        updated_at,
        file_size,
    }
}

pub(crate) fn parse_launcher_update_changelog_text(
    text: &str,
) -> Option<ParsedLauncherUpdateChangelog> {
    let stop_labels = [
        "old files",
        "optional files",
        "miscellaneous files",
        "preview file contents",
        "manual download",
        "mod manager download",
        "mirror 1",
        "mirror 2",
        "virus scan",
        "permissions and credits",
    ];
    let lines = text
        .lines()
        .filter_map(normalize_capture_text)
        .collect::<Vec<_>>();

    for (index, line) in lines.iter().enumerate() {
        if !line.eq_ignore_ascii_case("Version") {
            continue;
        }

        let version = lines
            .get(index + 1)
            .and_then(|value| normalize_capture_text(value))
            .map(|value| value.trim_start_matches('v').to_string());
        let mut changelog_lines = Vec::new();
        for next in lines.iter().skip(index + 2) {
            let normalized = next.trim().to_ascii_lowercase();
            if stop_labels.contains(&normalized.as_str()) || next.eq_ignore_ascii_case("Version") {
                break;
            }

            let cleaned = next
                .trim()
                .trim_start_matches(|ch: char| matches!(ch, '-' | '•' | '*'))
                .trim();
            if cleaned.is_empty() {
                continue;
            }

            changelog_lines.push(cleaned.to_string());
        }

        let changelog = changelog_lines.join("\n");
        if !changelog.trim().is_empty() {
            return Some(ParsedLauncherUpdateChangelog { version, changelog });
        }
    }

    None
}

fn extract_html_image_urls(value: &str) -> Vec<String> {
    let image_regex = Regex::new(r#"(?i)<img[^>]+src=["'](?P<src>https?://[^"']+)["']"#)
        .expect("valid image regex");
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
        .ok_or_else(|| {
            "Public Nexus mod detail response did not include a mod payload.".to_string()
        })?;
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
        mod_id: mod_node
            .get("modId")
            .and_then(Value::as_i64)
            .unwrap_or(mod_id),
        name: string_field(mod_node, "name"),
        author,
        summary: description_text.or_else(|| string_field(mod_node, "summary")),
        version: string_field(mod_node, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(mod_node, "pictureUrl")
            .or_else(|| string_field(mod_node, "thumbnailUrl")),
        gallery_images: description_html
            .as_deref()
            .map(extract_html_image_urls)
            .unwrap_or_default(),
        updated_at: None,
        file_size: None,
    })
}

fn is_public_graphql_mod_detail_not_found_error(error: &str) -> bool {
    error.trim().to_ascii_lowercase().contains("mod not found")
}

fn load_remote_mod_detail_with_public_graphql_fallback<G, H>(
    mut load_public_graphql: G,
    mut load_html: H,
) -> Result<RemoteModDetail, String>
where
    G: FnMut() -> Result<RemoteModDetail, String>,
    H: FnMut() -> Result<RemoteModDetail, String>,
{
    match load_public_graphql() {
        Ok(detail) => Ok(detail),
        Err(error) if !is_public_graphql_mod_detail_not_found_error(&error) => {
            log::warn!(
                "launcher public GraphQL mod detail lookup failed, falling back to HTML: {error}"
            );
            load_html()
        }
        Err(error) => Err(error),
    }
}

pub(super) fn load_remote_mod_detail_from_public_graphql(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<RemoteModDetail, String> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PublicGraphql)?;
    let mod_url = build_mod_page_url(mod_id);
    let headers = public_graphql_headers(&mod_url, PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER)?;
    let payload = json!({
        "operationName": PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER,
        "query": PUBLIC_MOD_DETAIL_GRAPHQL_QUERY,
        "variables": {
            "gameId": DEFAULT_GAME_ID.to_string(),
            "modId": mod_id.to_string(),
        }
    });
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .post(PUBLIC_GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })
    .map_err(|error| format!("Public Nexus mod detail GraphQL response failed for {mod_id}: {error}"))?;
    if !status.is_success() {
        return Err(format!(
            "Public Nexus mod detail GraphQL request failed for {mod_id}: HTTP {}",
            status
        ));
    }

    parse_public_mod_detail_graphql_response(&response_payload, mod_id)
}

pub(super) fn load_remote_mod_detail_from_html(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<RemoteModDetail, String> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PublicHtml)?;
    let mod_url = build_mod_page_url(mod_id);
    let headers = public_page_headers(None)?;
    let response = send_nexus_public_html_request(client, &mod_url, headers)?;
    let html = response.body;
    parse_remote_mod_detail_html(&html, mod_id)
        .ok_or_else(|| format!("Failed to parse launcher mod page HTML for {mod_id}."))
}

fn load_remote_mod_detail_gallery_from_images_tab(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<Vec<String>, String> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PublicHtml)?;
    let images_url = format!("{}?tab=images", build_mod_page_url(mod_id));
    let headers = public_page_headers(None)?;
    let response = send_nexus_public_html_request(client, &images_url, headers)?;
    let html = response.body;
    Ok(parse_remote_mod_images_tab_html(&html))
}

fn load_remote_mod_files_tab_text(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<String, String> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PublicHtml)?;
    let files_url = format!("{}?tab=files", build_mod_page_url(mod_id));
    let headers = public_page_headers(None)?;
    let response = send_nexus_public_html_request(client, &files_url, headers)?;
    let html = response.body;
    Ok(html_to_multiline_text(&html))
}

fn enrich_remote_mod_detail_with_file_metadata(
    mut detail: RemoteModDetail,
    metadata: LauncherUpdateFileMetadata,
) -> RemoteModDetail {
    if detail.author.is_none() {
        detail.author = metadata.author;
    }
    if detail.updated_at.is_none() {
        detail.updated_at = metadata.updated_at;
    }
    if detail.file_size.is_none() {
        detail.file_size = metadata.file_size;
    }
    detail
}

fn load_remote_mod_file_metadata(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<LauncherUpdateFileMetadata, String> {
    let text = load_remote_mod_files_tab_text(client, settings, mod_id)?;
    Ok(parse_launcher_update_file_metadata_text(&text))
}

fn load_remote_mod_changelog_from_files_tab(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<ParsedLauncherUpdateChangelog, String> {
    let text = load_remote_mod_files_tab_text(client, settings, mod_id)?;
    parse_launcher_update_changelog_text(&text).ok_or_else(|| {
        format!("Failed to parse launcher mod changelog from files page for {mod_id}.")
    })
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
        updated_at: detail.updated_at,
        file_size: detail.file_size,
    }
}

pub async fn load_launcher_remote_mod_detail(
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_remote_mod_detail",
        tauri::async_runtime::spawn_blocking(move || {
            load_launcher_remote_mod_detail_blocking(&request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher mod detail task: {error}"))?,
    )
}

pub async fn load_launcher_update_changelog(
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_update_changelog",
        tauri::async_runtime::spawn_blocking(move || {
            load_launcher_update_changelog_blocking(&request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher update changelog task: {error}"))?,
    )
}

fn load_launcher_remote_mod_detail_blocking(
    request: &LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    if request.mod_id <= 0 {
        return Err("modId must be a positive integer.".to_string());
    }

    let client = launcher_http_client()?;
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let mut detail = load_remote_mod_detail_with_public_graphql_fallback(
        || load_remote_mod_detail_from_public_graphql(&client, &settings, request.mod_id),
        || load_remote_mod_detail_from_html(&client, &settings, request.mod_id),
    )?;
    if detail.image_url.is_none() && detail.gallery_images.is_empty() {
        match load_remote_mod_detail_gallery_from_images_tab(&client, &settings, request.mod_id) {
            Ok(gallery_images) if !gallery_images.is_empty() => {
                detail = enrich_remote_mod_detail_with_gallery_images(detail, gallery_images);
            }
            Ok(_) => {}
            Err(error) => {
                log::warn!(
                    "launcher mod images tab lookup failed for {}: {error}",
                    request.mod_id
                );
            }
        }
    }
    match load_remote_mod_file_metadata(&client, &settings, request.mod_id) {
        Ok(metadata) => {
            detail = enrich_remote_mod_detail_with_file_metadata(detail, metadata);
        }
        Err(error) => {
            log::warn!(
                "launcher mod file metadata lookup failed for {}: {error}",
                request.mod_id
            );
        }
    }

    Ok(to_launcher_remote_mod_detail(detail))
}

fn load_launcher_update_changelog_blocking(
    request: &LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    if request.mod_id <= 0 {
        return Err("modId must be a positive integer.".to_string());
    }

    let client = launcher_http_client()?;
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let changelog = load_remote_mod_changelog_from_files_tab(&client, &settings, request.mod_id)?;

    Ok(LauncherUpdateChangelogResult {
        mod_id: request.mod_id,
        version: changelog.version,
        changelog: Some(changelog.changelog),
    })
}

#[cfg(test)]
#[path = "../../tests/launcher_remote_tests.rs"]
mod launcher_remote_tests;
