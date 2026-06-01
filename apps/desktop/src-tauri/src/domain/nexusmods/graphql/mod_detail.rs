use crate::domain::launcher::paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::{
    LauncherRemoteModDetail, LauncherRemoteModFile, LauncherRemoteModRequirement, LauncherSettings,
    LauncherUpdateChangelogResult, LoadLauncherRemoteModDetailRequest,
    LoadLauncherUpdateChangelogRequest,
};
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::graphql;
use crate::domain::nexusmods::http::{launcher_http_client, send_nexus_json_request};
use crate::domain::nexusmods::routes::LauncherNexusRoute;
use crate::domain::nexusmods::shared::{
    build_mod_page_url, decode_html, extract_graphql_error, normalize_nexus_url, string_field,
};
use crate::AppHandle;
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER: &str = "LauncherPublicModDetail";
const PUBLIC_MOD_DETAIL_GRAPHQL_QUERY: &str = r#"
query LauncherPublicModDetail($gameId: ID!, $modId: ID!) {
  mod(gameId: $gameId, modId: $modId) {
    modId
    name
    summary
    description
    category
    directDownloadEnabled
    supportsVortex
    downloads
    endorsements
    fileSize
    version
    pictureUrl
    thumbnailUrl
    author
    modCategory {
      name
    }
    tags {
      name
    }
    modRequirements {
      nexusRequirements(offset: 0, count: 8) {
        nodes {
          modName
          notes
          url
          externalRequirement
        }
      }
      dlcRequirements {
        notes
        gameExpansion {
          name
        }
      }
    }
    updatedAt
    uploader {
      name
    }
  }
}
"#;

const PUBLIC_MOD_DETAIL_WITH_FILES_GRAPHQL_QUERY: &str = r#"
query LauncherPublicModDetail($gameId: ID!, $modId: ID!) {
  mod(gameId: $gameId, modId: $modId) {
    modId
    name
    summary
    description
    category
    directDownloadEnabled
    supportsVortex
    downloads
    endorsements
    fileSize
    version
    pictureUrl
    thumbnailUrl
    author
    modCategory {
      name
    }
    tags {
      name
    }
    modRequirements {
      nexusRequirements(offset: 0, count: 8) {
        nodes {
          modName
          notes
          url
          externalRequirement
        }
      }
      dlcRequirements {
        notes
        gameExpansion {
          name
        }
      }
    }
    updatedAt
    uploader {
      name
    }
  }
  modFiles(gameId: $gameId, modId: $modId) {
    category
    changelogText
    date
    description
    fileId
    manager
    name
    primary
    scanned
    scannedV2
    size
    sizeInBytes
    totalDownloads
    uCount
    uid
    uniqueDownloads
    requirementsAlert
    uri
    version
  }
}
"#;

fn public_mod_detail_graphql_query(include_files: bool) -> &'static str {
    if include_files {
        PUBLIC_MOD_DETAIL_WITH_FILES_GRAPHQL_QUERY
    } else {
        PUBLIC_MOD_DETAIL_GRAPHQL_QUERY
    }
}

#[derive(Debug, Clone)]
pub(crate) struct RemoteModRequirement {
    pub(crate) name: String,
    pub(crate) notes: Option<String>,
    pub(crate) url: Option<String>,
    pub(crate) external: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct RemoteModFile {
    pub(crate) file_id: Option<i64>,
    pub(crate) name: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) uploaded_at: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) unique_downloads: Option<u64>,
    pub(crate) total_downloads: Option<u64>,
    pub(crate) manager_download_enabled: Option<bool>,
    pub(crate) uid: Option<String>,
    pub(crate) size: Option<u64>,
    pub(crate) size_bytes: Option<u64>,
    pub(crate) primary: bool,
    pub(crate) scanned: Option<bool>,
    pub(crate) scan_status: Option<String>,
    pub(crate) changelog: Vec<String>,
    pub(crate) archive_type: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct RemoteModDetail {
    pub(crate) mod_id: i64,
    pub(crate) name: Option<String>,
    pub(crate) author: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) mod_url: String,
    pub(crate) image_url: Option<String>,
    pub(crate) gallery_images: Vec<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) file_size: Option<u64>,
    pub(crate) category: Option<String>,
    pub(crate) downloads: Option<u64>,
    pub(crate) endorsements: Option<u64>,
    pub(crate) tags: Vec<String>,
    pub(crate) direct_download_enabled: Option<bool>,
    pub(crate) supports_vortex: Option<bool>,
    pub(crate) primary_file_id: Option<i64>,
    pub(crate) primary_file_name: Option<String>,
    pub(crate) primary_file_version: Option<String>,
    pub(crate) primary_file_category: Option<String>,
    pub(crate) primary_file_size: Option<u64>,
    pub(crate) primary_file_size_bytes: Option<u64>,
    pub(crate) primary_file_scanned: Option<bool>,
    pub(crate) primary_file_scan_status: Option<String>,
    pub(crate) primary_file_changelog: Vec<String>,
    pub(crate) required_loader: Option<String>,
    pub(crate) game_version: Option<String>,
    pub(crate) archive_type: Option<String>,
    pub(crate) update_risk: Option<String>,
    pub(crate) requirements: Vec<RemoteModRequirement>,
    pub(crate) files: Vec<RemoteModFile>,
}

impl RemoteModDetail {
    pub(crate) fn empty(mod_id: i64, mod_url: String) -> Self {
        Self {
            mod_id,
            name: None,
            author: None,
            summary: None,
            description: None,
            version: None,
            mod_url,
            image_url: None,
            gallery_images: Vec::new(),
            updated_at: None,
            file_size: None,
            category: None,
            downloads: None,
            endorsements: None,
            tags: Vec::new(),
            direct_download_enabled: None,
            supports_vortex: None,
            primary_file_id: None,
            primary_file_name: None,
            primary_file_version: None,
            primary_file_category: None,
            primary_file_size: None,
            primary_file_size_bytes: None,
            primary_file_scanned: None,
            primary_file_scan_status: None,
            primary_file_changelog: Vec::new(),
            required_loader: None,
            game_version: None,
            archive_type: None,
            update_risk: None,
            requirements: Vec::new(),
            files: Vec::new(),
        }
    }
}

pub(crate) fn parse_remote_mod_detail_node(node: &Value) -> Option<RemoteModDetail> {
    let mod_id = node.get("modId").and_then(Value::as_i64)?;
    Some(RemoteModDetail {
        name: string_field(node, "name"),
        author: None,
        summary: string_field(node, "summary"),
        description: string_field(node, "description").map(|value| html_to_text(&value)),
        version: string_field(node, "version"),
        image_url: string_field(node, "pictureUrl"),
        category: parse_mod_category(node),
        downloads: node.get("downloads").and_then(Value::as_u64),
        endorsements: node.get("endorsements").and_then(Value::as_u64),
        tags: parse_mod_tags(node),
        direct_download_enabled: node.get("directDownloadEnabled").and_then(Value::as_bool),
        supports_vortex: node.get("supportsVortex").and_then(Value::as_bool),
        ..RemoteModDetail::empty(mod_id, build_mod_page_url(mod_id))
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

fn description_markup_to_text(value: &str) -> String {
    let bbcode_regex = Regex::new(r"(?i)\[/?[a-z*][^\]]*\]").expect("valid bbcode strip regex");
    collapse_whitespace(bbcode_regex.replace_all(&html_to_text(value), " ").trim())
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

fn parse_mod_category(node: &Value) -> Option<String> {
    node.get("modCategory")
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .or_else(|| node.get("category").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn parse_mod_tags(node: &Value) -> Vec<String> {
    node.get("tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(|tag| {
                    string_field(tag, "name")
                        .or_else(|| string_field(tag, "tag"))
                        .or_else(|| tag.as_str().map(ToOwned::to_owned))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_big_int_like(value: &Value) -> Option<u64> {
    value.as_u64().or_else(|| {
        value
            .as_str()
            .and_then(|text| text.trim().parse::<u64>().ok())
    })
}

fn parse_mod_file_changelog(node: &Value) -> Vec<String> {
    node.get("changelogText")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(html_to_text)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn parse_first_requirement_text(node: &Value) -> Option<String> {
    let requirements = node
        .get("modRequirements")
        .and_then(|value| value.get("nexusRequirements"))
        .and_then(|value| value.get("nodes"))
        .and_then(Value::as_array)?;

    requirements.iter().find_map(|requirement| {
        let name = string_field(requirement, "modName");
        let notes = string_field(requirement, "notes");
        match (name, notes) {
            (Some(name), Some(notes)) if !notes.eq_ignore_ascii_case(&name) => {
                Some(format!("{name}: {notes}"))
            }
            (Some(name), _) => Some(name),
            (_, Some(notes)) => Some(notes),
            _ => None,
        }
    })
}

fn parse_mod_requirements(node: &Value) -> Vec<RemoteModRequirement> {
    let Some(requirements) = node
        .get("modRequirements")
        .and_then(|value| value.get("nexusRequirements"))
        .and_then(|value| value.get("nodes"))
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };

    requirements
        .iter()
        .filter_map(|requirement| {
            let name = string_field(requirement, "modName")
                .or_else(|| string_field(requirement, "notes"))?;
            Some(RemoteModRequirement {
                name,
                notes: string_field(requirement, "notes"),
                url: string_field(requirement, "url"),
                external: requirement
                    .get("externalRequirement")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn parse_game_version_from_text(value: &str) -> Option<String> {
    let version_regex = Regex::new(
        r"(?i)(?:stardew(?:\s+valley)?|sdv|game)\s*(?:version|v)?\s*(?P<version>\d+(?:\.\d+){1,3}\+?)",
    )
    .expect("valid game version regex");
    version_regex
        .captures(value)
        .and_then(|captures| captures.name("version"))
        .map(|value| value.as_str().trim().to_string())
}

fn parse_game_version(node: &Value, summary: Option<&str>) -> Option<String> {
    parse_mod_tags(node)
        .into_iter()
        .find_map(|tag| parse_game_version_from_text(&tag))
        .or_else(|| {
            summary.and_then(parse_game_version_from_text).or_else(|| {
                string_field(node, "description")
                    .and_then(|value| parse_game_version_from_text(&value))
            })
        })
}

fn infer_archive_type(file_name: Option<&str>, uri: Option<&str>) -> Option<String> {
    [file_name, uri].into_iter().flatten().find_map(|source| {
        let lower = source
            .split('?')
            .next()
            .unwrap_or(source)
            .to_ascii_lowercase();
        let extension = lower.rsplit('.').next()?;
        match extension {
            "zip" | "7z" | "rar" | "tar" | "gz" | "xz" => Some(extension.to_ascii_uppercase()),
            _ => None,
        }
    })
}

fn infer_update_risk(scan_status: Option<&str>, requirements_alert: Option<i64>) -> Option<String> {
    if requirements_alert.unwrap_or(0) != 0 {
        return Some("Requires review: requirements alert".to_string());
    }

    match scan_status {
        Some("VERIFIED") | Some("INTERNALLY_VERIFIED") | Some("MANUALLY_VERIFIED") => {
            Some("Low: verified primary file".to_string())
        }
        Some("QUEUED") | Some("WAITING_REPORT") | Some("NOT_SCANNED") => {
            scan_status.map(|value| format!("Review: scan status {value}"))
        }
        Some(value) => Some(format!("Review: scan status {value}")),
        None => None,
    }
}

fn parse_mod_file_node(node: &Value) -> RemoteModFile {
    let name = string_field(node, "name");
    let uri = string_field(node, "uri");
    let manager_download_enabled = node
        .get("manager")
        .and_then(Value::as_i64)
        .map(|value| value != 0)
        .or_else(|| node.get("manager").and_then(Value::as_bool));
    RemoteModFile {
        file_id: node.get("fileId").and_then(Value::as_i64),
        name: name.clone(),
        version: string_field(node, "version"),
        category: string_field(node, "category"),
        uploaded_at: node
            .get("date")
            .and_then(parse_big_int_like)
            .and_then(timestamp_to_rfc3339),
        description: string_field(node, "description")
            .map(|value| html_to_text(&value))
            .filter(|value| !value.is_empty()),
        unique_downloads: node
            .get("uniqueDownloads")
            .and_then(parse_big_int_like)
            .or_else(|| node.get("uCount").and_then(parse_big_int_like)),
        total_downloads: node.get("totalDownloads").and_then(parse_big_int_like),
        manager_download_enabled,
        uid: string_field(node, "uid"),
        size: node.get("size").and_then(Value::as_u64),
        size_bytes: node.get("sizeInBytes").and_then(parse_big_int_like),
        primary: is_primary_mod_file(node),
        scanned: node
            .get("scanned")
            .and_then(Value::as_i64)
            .map(|value| value != 0),
        scan_status: string_field(node, "scannedV2"),
        changelog: parse_mod_file_changelog(node),
        archive_type: infer_archive_type(name.as_deref(), uri.as_deref()),
    }
}

fn is_primary_mod_file(node: &Value) -> bool {
    node.get("primary")
        .and_then(Value::as_i64)
        .map(|value| value != 0)
        .unwrap_or(false)
}

fn is_main_mod_file(node: &Value) -> bool {
    string_field(node, "category")
        .map(|value| value.eq_ignore_ascii_case("MAIN"))
        .unwrap_or(false)
}

fn parse_version_parts(value: Option<&str>) -> Vec<u64> {
    value
        .unwrap_or_default()
        .split(|character: char| !character.is_ascii_digit())
        .filter_map(|part| {
            if part.is_empty() {
                None
            } else {
                part.parse::<u64>().ok()
            }
        })
        .collect()
}

fn compare_version_parts(left: &[u64], right: &[u64]) -> std::cmp::Ordering {
    let max_len = left.len().max(right.len());
    for index in 0..max_len {
        let left_value = left.get(index).copied().unwrap_or(0);
        let right_value = right.get(index).copied().unwrap_or(0);
        match left_value.cmp(&right_value) {
            std::cmp::Ordering::Equal => continue,
            ordering => return ordering,
        }
    }
    std::cmp::Ordering::Equal
}

fn compare_mod_files(left: &Value, right: &Value) -> std::cmp::Ordering {
    let version_ordering = compare_version_parts(
        &parse_version_parts(string_field(left, "version").as_deref()),
        &parse_version_parts(string_field(right, "version").as_deref()),
    );
    if version_ordering != std::cmp::Ordering::Equal {
        return version_ordering;
    }

    left.get("fileId")
        .and_then(Value::as_i64)
        .unwrap_or_default()
        .cmp(
            &right
                .get("fileId")
                .and_then(Value::as_i64)
                .unwrap_or_default(),
        )
}

fn select_latest_mod_file<'a>(files: &'a [Value]) -> Option<&'a Value> {
    files
        .iter()
        .filter(|node| is_primary_mod_file(node))
        .max_by(|left, right| compare_mod_files(left, right))
        .or_else(|| {
            files
                .iter()
                .filter(|node| is_main_mod_file(node))
                .max_by(|left, right| compare_mod_files(left, right))
        })
        .or_else(|| {
            files
                .iter()
                .max_by(|left, right| compare_mod_files(left, right))
        })
}

fn enrich_remote_mod_detail_with_primary_file(
    mut detail: RemoteModDetail,
    payload: &Value,
) -> RemoteModDetail {
    let Some(files) = payload
        .get("data")
        .and_then(|value| value.get("modFiles"))
        .and_then(Value::as_array)
    else {
        return detail;
    };
    detail.files = files.iter().map(parse_mod_file_node).collect();
    let Some(file) = select_latest_mod_file(files) else {
        return detail;
    };

    detail.primary_file_id = file.get("fileId").and_then(Value::as_i64);
    detail.primary_file_name = string_field(file, "name");
    detail.primary_file_version = string_field(file, "version");
    detail.primary_file_category = string_field(file, "category");
    detail.primary_file_size = file.get("size").and_then(Value::as_u64);
    detail.primary_file_size_bytes = file.get("sizeInBytes").and_then(parse_big_int_like);
    detail.primary_file_scanned = file
        .get("scanned")
        .and_then(Value::as_i64)
        .map(|value| value != 0);
    detail.primary_file_scan_status = string_field(file, "scannedV2");
    detail.primary_file_changelog = parse_mod_file_changelog(file);
    detail.archive_type = infer_archive_type(
        detail.primary_file_name.as_deref(),
        string_field(file, "uri").as_deref(),
    );
    detail.update_risk = infer_update_risk(
        detail.primary_file_scan_status.as_deref(),
        file.get("requirementsAlert").and_then(Value::as_i64),
    );
    detail.supports_vortex = detail.supports_vortex.or_else(|| {
        file.get("manager")
            .and_then(Value::as_i64)
            .map(|value| value != 0)
    });

    detail
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
    let description_markup =
        string_field(mod_node, "description").filter(|value| !value.trim().is_empty());
    let description_text = description_markup
        .as_deref()
        .map(description_markup_to_text)
        .filter(|value| !value.is_empty());
    let summary_text = string_field(mod_node, "summary").or_else(|| description_text.clone());
    let author = string_field(mod_node, "author").or_else(|| {
        mod_node
            .get("uploader")
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    });

    let detail = RemoteModDetail {
        mod_id: mod_node
            .get("modId")
            .and_then(Value::as_i64)
            .unwrap_or(mod_id),
        name: string_field(mod_node, "name"),
        author,
        summary: summary_text.clone(),
        description: description_markup.clone(),
        version: string_field(mod_node, "version"),
        mod_url: build_mod_page_url(mod_id),
        image_url: string_field(mod_node, "pictureUrl")
            .or_else(|| string_field(mod_node, "thumbnailUrl")),
        gallery_images: description_markup
            .as_deref()
            .map(extract_html_image_urls)
            .unwrap_or_default(),
        updated_at: string_field(mod_node, "updatedAt"),
        file_size: mod_node.get("fileSize").and_then(Value::as_u64),
        category: parse_mod_category(mod_node),
        downloads: mod_node.get("downloads").and_then(Value::as_u64),
        endorsements: mod_node.get("endorsements").and_then(Value::as_u64),
        tags: parse_mod_tags(mod_node),
        direct_download_enabled: mod_node
            .get("directDownloadEnabled")
            .and_then(Value::as_bool),
        supports_vortex: mod_node.get("supportsVortex").and_then(Value::as_bool),
        primary_file_id: None,
        primary_file_name: None,
        primary_file_version: None,
        primary_file_category: None,
        primary_file_size: None,
        primary_file_size_bytes: None,
        primary_file_scanned: None,
        primary_file_scan_status: None,
        primary_file_changelog: Vec::new(),
        required_loader: parse_first_requirement_text(mod_node),
        game_version: parse_game_version(mod_node, summary_text.as_deref()),
        archive_type: None,
        update_risk: None,
        requirements: parse_mod_requirements(mod_node),
        files: Vec::new(),
    };

    Ok(enrich_remote_mod_detail_with_primary_file(detail, payload))
}

#[cfg(test)]
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

pub(crate) fn load_remote_mod_detail_with_graphql_fallback<A, G>(
    mut load_public_graphql: G,
    mut load_rest_api: A,
) -> Result<RemoteModDetail, String>
where
    A: FnMut() -> Result<Option<RemoteModDetail>, String>,
    G: FnMut() -> Result<RemoteModDetail, String>,
{
    match load_public_graphql() {
        Ok(detail) => return Ok(detail),
        Err(error) => {
            log::warn!(
                "launcher public GraphQL mod detail lookup failed, falling back to REST API: {error}"
            );
        }
    }

    match load_rest_api() {
        Ok(Some(detail)) => Ok(detail),
        Ok(None) => Err(
            "Public Nexus mod detail GraphQL lookup failed and no REST API key is configured."
                .to_string(),
        ),
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
        description: None,
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
        category: Some(info.category_name).filter(|value| !value.trim().is_empty()),
        downloads: Some(info.mod_downloads),
        endorsements: Some(info.mod_endorsements),
        tags: Vec::new(),
        direct_download_enabled: None,
        supports_vortex: None,
        primary_file_id: None,
        primary_file_name: None,
        primary_file_version: None,
        primary_file_category: None,
        primary_file_size: None,
        primary_file_size_bytes: None,
        primary_file_scanned: None,
        primary_file_scan_status: None,
        primary_file_changelog: Vec::new(),
        required_loader: None,
        game_version: None,
        archive_type: None,
        update_risk: None,
        requirements: Vec::new(),
        files: Vec::new(),
    }))
}

pub(crate) fn load_remote_mod_detail_from_public_graphql(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
    include_files: bool,
) -> Result<RemoteModDetail, String> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PublicGraphql)?;
    let mod_url = build_mod_page_url(mod_id);
    let headers =
        graphql::public_graphql_headers(&mod_url, PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER)?;
    let payload = json!({
        "operationName": PUBLIC_MOD_DETAIL_GRAPHQL_OPERATION_HEADER,
        "query": public_mod_detail_graphql_query(include_files),
        "variables": {
            "gameId": graphql::DEFAULT_GAME_ID.to_string(),
            "modId": mod_id.to_string(),
        }
    });
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
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
        description: detail.description,
        author: detail.author,
        version: detail.version,
        mod_url: detail.mod_url,
        image_url: detail.image_url,
        gallery_images: detail.gallery_images,
        updated_at: detail.updated_at,
        file_size: detail.file_size,
        category: detail.category,
        downloads: detail.downloads,
        endorsements: detail.endorsements,
        tags: detail.tags,
        direct_download_enabled: detail.direct_download_enabled,
        supports_vortex: detail.supports_vortex,
        primary_file_id: detail.primary_file_id,
        primary_file_name: detail.primary_file_name,
        primary_file_version: detail.primary_file_version,
        primary_file_category: detail.primary_file_category,
        primary_file_size: detail.primary_file_size,
        primary_file_size_bytes: detail.primary_file_size_bytes,
        primary_file_scanned: detail.primary_file_scanned,
        primary_file_scan_status: detail.primary_file_scan_status,
        primary_file_changelog: detail.primary_file_changelog,
        required_loader: detail.required_loader,
        game_version: detail.game_version,
        archive_type: detail.archive_type,
        update_risk: detail.update_risk,
        requirements: detail
            .requirements
            .into_iter()
            .map(|requirement| LauncherRemoteModRequirement {
                name: requirement.name,
                notes: requirement.notes,
                url: requirement.url,
                external: requirement.external,
            })
            .collect(),
        files: detail
            .files
            .into_iter()
            .map(|file| LauncherRemoteModFile {
                file_id: file.file_id,
                name: file.name,
                version: file.version,
                category: file.category,
                uploaded_at: file.uploaded_at,
                description: file.description,
                unique_downloads: file.unique_downloads,
                total_downloads: file.total_downloads,
                manager_download_enabled: file.manager_download_enabled,
                uid: file.uid,
                size: file.size,
                size_bytes: file.size_bytes,
                primary: file.primary,
                scanned: file.scanned,
                scan_status: file.scan_status,
                changelog: file.changelog,
                archive_type: file.archive_type,
            })
            .collect(),
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
    let mut detail = load_remote_mod_detail_with_graphql_fallback(
        || {
            load_remote_mod_detail_from_public_graphql(
                &client,
                &settings,
                request.mod_id,
                request.include_files,
            )
        },
        || load_remote_mod_detail_from_rest_api(&settings, request.mod_id),
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
#[path = "../../../tests/nexusmods_mod_detail_tests.rs"]
mod nexusmods_mod_detail_tests;
