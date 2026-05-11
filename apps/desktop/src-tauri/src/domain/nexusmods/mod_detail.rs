use super::http::{
    launcher_http_client, probe_blocked_launcher_nexus_route, public_graphql_headers,
    send_nexus_json_request, LauncherNexusRoute, DEFAULT_GAME_ID,
};
use super::shared::{
    build_mod_page_url, decode_html, extract_graphql_error, normalize_nexus_url, string_field,
};
use crate::domain::launcher::paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::{
    LauncherRemoteModDetail, LauncherSettings, LauncherUpdateChangelogResult,
    LoadLauncherRemoteModDetailRequest, LoadLauncherUpdateChangelogRequest,
};
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use tauri::AppHandle;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

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

pub(crate) fn parse_remote_mod_detail_node(node: &Value) -> Option<RemoteModDetail> {
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

pub(crate) fn load_remote_mod_detail_with_api_fallback<A, G>(
    mut load_rest_api: A,
    mut load_public_graphql: G,
) -> Result<RemoteModDetail, String>
where
    A: FnMut() -> Result<Option<RemoteModDetail>, String>,
    G: FnMut() -> Result<RemoteModDetail, String>,
{
    match load_rest_api() {
        Ok(Some(detail)) => return Ok(detail),
        Ok(None) => {}
        Err(error) => {
            log::warn!(
                "launcher REST API mod detail lookup failed, falling back to public routes: {error}"
            );
        }
    }

    match load_public_graphql() {
        Ok(detail) => Ok(detail),
        Err(error) => Err(error),
    }
}

fn timestamp_to_rfc3339(timestamp: u64) -> Option<String> {
    OffsetDateTime::from_unix_timestamp(timestamp as i64)
        .ok()
        .and_then(|value| value.format(&Rfc3339).ok())
}

fn load_remote_mod_detail_from_rest_api(
    settings: &LauncherSettings,
    mod_id: i64,
) -> Result<Option<RemoteModDetail>, String> {
    let Some(api_key) = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    let info = crate::domain::nexusmods::rest_api::get_mod(api_key, "stardewvalley", mod_id as u64)
        .map_err(|error| error.to_string())?;

    Ok(Some(RemoteModDetail {
        mod_id: info.mod_id as i64,
        name: Some(info.name),
        author: Some(if info.author.trim().is_empty() {
            info.uploaded_by
        } else {
            info.author
        }),
        summary: Some(info.summary).filter(|value| !value.trim().is_empty()),
        version: None,
        mod_url: if info.mod_url.trim().is_empty() {
            build_mod_page_url(mod_id)
        } else {
            info.mod_url
        },
        image_url: info.picture_url,
        gallery_images: Vec::new(),
        updated_at: timestamp_to_rfc3339(info.updated_timestamp),
        file_size: None,
    }))
}

pub(crate) fn load_remote_mod_detail_from_public_graphql(
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
    .map_err(|error| {
        format!("Public Nexus mod detail GraphQL response failed for {mod_id}: {error}")
    })?;
    if !status.is_success() {
        return Err(format!(
            "Public Nexus mod detail GraphQL request failed for {mod_id}: HTTP {}",
            status
        ));
    }

    parse_public_mod_detail_graphql_response(&response_payload, mod_id)
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
    app: AppHandle,
    request: LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_remote_mod_detail",
        tauri::async_runtime::spawn_blocking(move || {
            load_launcher_remote_mod_detail_blocking(&app, &request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher mod detail task: {error}"))?,
    )
}

pub async fn load_launcher_update_changelog(
    app: AppHandle,
    request: LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    modforge_studio_desktop_lib::logging::log_tauri_command_error(
        "load_launcher_update_changelog",
        tauri::async_runtime::spawn_blocking(move || {
            load_launcher_update_changelog_blocking(&app, &request)
        })
        .await
        .map_err(|error| format!("Failed to join launcher update changelog task: {error}"))?,
    )
}

fn load_launcher_remote_mod_detail_blocking(
    _app: &AppHandle,
    request: &LoadLauncherRemoteModDetailRequest,
) -> Result<LauncherRemoteModDetail, String> {
    if request.mod_id <= 0 {
        return Err("modId must be a positive integer.".to_string());
    }

    let client = launcher_http_client()?;
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    let mut detail = load_remote_mod_detail_with_api_fallback(
        || load_remote_mod_detail_from_rest_api(&settings, request.mod_id),
        || load_remote_mod_detail_from_public_graphql(&client, &settings, request.mod_id),
    )?;
    if detail.gallery_images.is_empty() {
        let fallback_images = detail.image_url.iter().cloned().collect::<Vec<_>>();
        detail = enrich_remote_mod_detail_with_gallery_images(detail, fallback_images);
    }

    Ok(to_launcher_remote_mod_detail(detail))
}

fn load_launcher_update_changelog_blocking(
    _app: &AppHandle,
    request: &LoadLauncherUpdateChangelogRequest,
) -> Result<LauncherUpdateChangelogResult, String> {
    if request.mod_id <= 0 {
        return Err("modId must be a positive integer.".to_string());
    }

    Ok(LauncherUpdateChangelogResult {
        mod_id: request.mod_id,
        version: None,
        changelog: None,
    })
}

#[cfg(test)]
#[path = "../../tests/nexusmods_mod_detail_tests.rs"]
mod nexusmods_mod_detail_tests;
