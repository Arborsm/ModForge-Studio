use super::http::{api_headers, with_nexus_request_slot};
use super::request::NexusRequestContext;
use super::routes::{LauncherNexusRoute, launcher_nexus_api_key};
use super::shared::extract_graphql_error;
use super::{endpoints, graphql, rest_api};
use anyhow::{Context, bail};
use reqwest::StatusCode;
use reqwest::blocking::{Client, Response};
use reqwest::header::CONTENT_TYPE;
use serde_json::{Value, json};

const PUBLIC_GRAPHQL_DIAGNOSTIC_REFERER: &str = "https://www.nexusmods.com/";
const PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME: &str = "GameModsListing";
const PRIVATE_GRAPHQL_DIAGNOSTIC_QUERY: &str = r#"
query CatalogMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
  mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
    totalCount
  }
}
"#;
const PUBLIC_GRAPHQL_DIAGNOSTIC_QUERY: &str = r#"
query GameModsListing($count: Int = 0, $filter: ModsFilter, $offset: Int, $sort: [ModsSort!]) {
  mods(
    count: $count
    filter: $filter
    offset: $offset
    sort: $sort
    viewUserBlockedContent: false
  ) {
    totalCount
  }
}
"#;

fn launcher_connectivity_status_is_acceptable(status: StatusCode) -> bool {
    status.is_success()
        || status.is_redirection()
        || matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::NOT_FOUND
                | StatusCode::METHOD_NOT_ALLOWED
                | StatusCode::BAD_REQUEST
        )
}

fn launcher_nexus_graphql_probe_payload(public_endpoint: bool) -> Value {
    let filter = json!({
        "adultContent": [{ "op": "EQUALS", "value": false }],
        "gameDomainName": [{ "op": "EQUALS", "value": "stardewvalley" }],
    });

    if public_endpoint {
        json!({
            "operationName": PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME,
            "query": PUBLIC_GRAPHQL_DIAGNOSTIC_QUERY,
            "variables": {
                "count": 1,
                "filter": {
                    "adultContent": [{ "op": "EQUALS", "value": false }],
                    "filter": [],
                    "gameDomainName": [{ "op": "EQUALS", "value": "stardewvalley" }],
                    "name": []
                },
                "offset": 0,
                "sort": { "createdAt": { "direction": "DESC" } }
            }
        })
    } else {
        json!({
            "operationName": "CatalogMods",
            "query": PRIVATE_GRAPHQL_DIAGNOSTIC_QUERY,
            "variables": {
                "filter": filter,
                "sort": [{ "createdAt": { "direction": "DESC" } }],
                "offset": 0,
                "count": 1
            }
        })
    }
}

fn validate_launcher_nexus_graphql_probe_response(response: Response) -> anyhow::Result<()> {
    let status = response.status();
    if !status.is_success() {
        bail!("HTTP {status}");
    }

    let payload = response
        .json::<Value>()
        .with_context(|| format!("error decoding response body"))?;
    if let Some(error) = extract_graphql_error(&payload) {
        return Err(anyhow::anyhow!(error));
    }

    Ok(())
}

fn probe_launcher_nexus_public_graphql_route(client: &Client) -> anyhow::Result<()> {
    let headers = graphql::public_graphql_headers(
        PUBLIC_GRAPHQL_DIAGNOSTIC_REFERER,
        PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME,
    )?;
    let payload = launcher_nexus_graphql_probe_payload(true);
    let response = with_nexus_request_slot(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
            .headers(headers)
            .json(&payload)
            .send()
    })?;

    validate_launcher_nexus_graphql_probe_response(response)
}

fn probe_launcher_nexus_images_route(client: &Client) -> anyhow::Result<()> {
    let response = with_nexus_request_slot(|| client.get(endpoints::IMAGE_CDN).send())?;
    if !launcher_connectivity_status_is_acceptable(response.status()) {
        bail!("HTTP {}", response.status());
    }

    Ok(())
}

fn probe_launcher_smapi_route(client: &Client) -> anyhow::Result<()> {
    let response = with_nexus_request_slot(|| {
        client
            .post(endpoints::SMAPI_MODS)
            .header(CONTENT_TYPE, "application/json")
            .body("{}")
            .send()
    })?;
    if !launcher_connectivity_status_is_acceptable(response.status()) {
        bail!("HTTP {}", response.status());
    }

    Ok(())
}

fn probe_launcher_nexus_private_graphql_route(
    client: &Client,
    context: &NexusRequestContext,
) -> anyhow::Result<()> {
    let headers = graphql::graphql_headers(context.api_key())?;
    let payload = launcher_nexus_graphql_probe_payload(false);
    let response = with_nexus_request_slot(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
            .headers(headers)
            .json(&payload)
            .send()
    })?;

    validate_launcher_nexus_graphql_probe_response(response)
}

fn probe_launcher_nexus_api_route(
    client: &Client,
    context: &NexusRequestContext,
) -> anyhow::Result<()> {
    let headers = api_headers(launcher_nexus_api_key(context)?)?;
    let response = with_nexus_request_slot(|| {
        client
            .get(rest_api::TRENDING_ENDPOINT)
            .headers(headers)
            .send()
    })?;
    if !response.status().is_success() {
        bail!("HTTP {}", response.status());
    }

    Ok(())
}

pub(crate) fn probe_launcher_nexus_route_once(
    client: &Client,
    context: Option<&NexusRequestContext>,
    route: LauncherNexusRoute,
) -> anyhow::Result<()> {
    match route {
        LauncherNexusRoute::PublicGraphql => probe_launcher_nexus_public_graphql_route(client),
        LauncherNexusRoute::NexusImages => probe_launcher_nexus_images_route(client),
        LauncherNexusRoute::Smapi => probe_launcher_smapi_route(client),
        LauncherNexusRoute::PrivateGraphql => probe_launcher_nexus_private_graphql_route(
            client,
            context
                .context("Launcher Nexus private GraphQL reprobe requires configured settings.")?,
        ),
        LauncherNexusRoute::NexusApi => probe_launcher_nexus_api_route(
            client,
            context.context("Launcher Nexus REST API reprobe requires configured settings.")?,
        ),
    }
}
