use crate::domain::launcher::types::LauncherSettings;
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::http::{api_headers, send_nexus_request};
use crate::domain::nexusmods::routes::LauncherNexusRoute;
use anyhow::{Context, bail};
use reqwest::blocking::{Client, Response};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ResolveDownloadUrlError {
    PremiumRequired,
    Message(String),
}

impl From<String> for ResolveDownloadUrlError {
    fn from(value: String) -> Self {
        Self::Message(value)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct DownloadCandidate {
    pub(crate) file_id: i64,
    pub(crate) file_name: String,
    pub(crate) version: Option<String>,
}

pub(crate) fn fetch_mod_files_payload(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
) -> anyhow::Result<Value> {
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::NexusApi)?;
    let response = client.get(super::mod_files_endpoint(mod_id));
    let api_key = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .context("Configure a Nexus API key before fetching launcher mod files.")?;
    let headers = api_headers(api_key)?;
    let response = send_nexus_request(|| {
        response
            .try_clone()
            .expect("request clone")
            .headers(headers.clone())
            .send()
    })
    .with_context(|| format!("Failed to fetch launcher mod files"))?;
    if !response.status().is_success() {
        bail!(
            "Launcher mod files request failed for {mod_id}: HTTP {}",
            response.status()
        );
    }

    response
        .json::<Value>()
        .with_context(|| format!("Failed to parse launcher mod files JSON"))
}

pub(crate) fn select_download_candidate(
    payload: &Value,
    requested_file_id: Option<i64>,
    requested_version: Option<&str>,
) -> anyhow::Result<DownloadCandidate> {
    let files = payload
        .get("files")
        .and_then(Value::as_array)
        .context("Launcher mod files payload did not contain a files array.")?;
    if files.is_empty() {
        bail!("Launcher mod did not contain any downloadable files.");
    }

    let selected = if let Some(file_id) = requested_file_id {
        files
            .iter()
            .find(|item| item.get("file_id").and_then(Value::as_i64) == Some(file_id))
    } else if let Some(version) = requested_version {
        files.iter().find(|item| {
            item.get("version")
                .and_then(Value::as_str)
                .map(|value| value.trim() == version.trim())
                .unwrap_or(false)
        })
    } else {
        files.iter().max_by_key(|item| {
            item.get("uploaded_timestamp")
                .and_then(Value::as_i64)
                .unwrap_or_default()
        })
    }
    .context("Unable to resolve a launcher download file.")?;

    let file_id = selected
        .get("file_id")
        .and_then(Value::as_i64)
        .context("Launcher download file is missing file_id.")?;
    let file_name = selected
        .get("file_name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .context("Launcher download file is missing file_name.")?
        .to_string();

    Ok(DownloadCandidate {
        file_id,
        file_name,
        version: selected
            .get("version")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned),
    })
}

pub(crate) fn resolve_download_url(
    client: &Client,
    settings: &LauncherSettings,
    mod_id: i64,
    file_id: i64,
) -> Result<String, ResolveDownloadUrlError> {
    let api_key = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            ResolveDownloadUrlError::Message(
                "Nexus API key is required to resolve download links.".to_string(),
            )
        })?;

    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::NexusApi)
        .map_err(|error| ResolveDownloadUrlError::Message(error.to_string()))?;
    let response = client.get(super::download_link_endpoint(mod_id, file_id));
    let headers = api_headers(api_key)
        .map_err(|error| ResolveDownloadUrlError::Message(error.to_string()))?;
    let response = send_nexus_request(|| {
        response
            .try_clone()
            .expect("request clone")
            .headers(headers.clone())
            .send()
    })
    .map_err(|error| {
        ResolveDownloadUrlError::Message(format!(
            "Failed to fetch launcher download links: {error}"
        ))
    })?;
    if response.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(ResolveDownloadUrlError::PremiumRequired);
    }
    if !response.status().is_success() {
        return Err(ResolveDownloadUrlError::Message(format!(
            "Launcher download link request failed for {mod_id}/{file_id}: HTTP {}",
            response.status()
        )));
    }

    let payload = response.json::<Value>().map_err(|error| {
        ResolveDownloadUrlError::Message(format!(
            "Failed to parse launcher download links JSON: {error}"
        ))
    })?;
    payload
        .as_array()
        .and_then(|items| items.first())
        .and_then(|item| item.get("URI"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            ResolveDownloadUrlError::Message(
                "Launcher download link response did not include a URI.".to_string(),
            )
        })
}

pub(crate) fn download_file_response(
    client: &Client,
    download_url: &str,
) -> anyhow::Result<Response> {
    let response = client.get(download_url);
    let response = send_nexus_request(|| response.try_clone().expect("request clone").send())
        .with_context(|| format!("Failed to download launcher mod"))?;
    Ok(response)
}
