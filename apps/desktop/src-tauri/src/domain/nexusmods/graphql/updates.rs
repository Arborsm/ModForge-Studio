use crate::domain::launcher::types::LauncherSettings;
use crate::domain::nexusmods::can_use_nexus_graphql;
use crate::domain::nexusmods::diagnostics::probe_blocked_launcher_nexus_route;
use crate::domain::nexusmods::graphql;
use crate::domain::nexusmods::graphql::mod_detail::{
    parse_remote_mod_detail_node, RemoteModDetail,
};
use crate::domain::nexusmods::http::send_nexus_request;
use crate::domain::nexusmods::routes::LauncherNexusRoute;
use crate::domain::nexusmods::shared::extract_graphql_error;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::collections::HashMap;

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

pub(crate) fn load_remote_mod_details_from_graphql(
    client: &Client,
    settings: &LauncherSettings,
    mod_ids: &[i64],
) -> Result<HashMap<i64, RemoteModDetail>, String> {
    if !can_use_nexus_graphql(settings) {
        return Err("Configure a Nexus API key before querying Nexus Mods.".to_string());
    }
    probe_blocked_launcher_nexus_route(client, Some(settings), LauncherNexusRoute::PrivateGraphql)?;

    let headers = graphql::graphql_headers(settings.nexus_api_key.as_deref())?;
    let payload = build_update_batch_graphql_payload(mod_ids)?;
    let response = send_nexus_request(|| {
        client
            .post(graphql::GRAPHQL_ENDPOINT)
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
