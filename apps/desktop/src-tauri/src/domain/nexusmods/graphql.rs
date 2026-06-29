pub mod catalog;
pub mod mod_detail;
pub mod updates;

use super::http::{
    PUBLIC_BROWSER_USER_AGENT, apply_launcher_headers, launcher_http_client,
    send_nexus_json_request,
};
use crate::domain::nexusmods::shared::{extract_graphql_error, normalize_nexus_url, string_field};
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderMap, HeaderValue, REFERER, USER_AGENT};
use serde_json::{Value, json};

pub(crate) const GRAPHQL_ENDPOINT: &str = super::endpoints::GRAPHQL_V2;
pub(crate) const DEFAULT_GAME_ID: i64 = 1303;

const USER_AVATAR_GRAPHQL_QUERY: &str = r#"
query LauncherUserAvatar($id: Int!) {
  user(id: $id) {
    memberId
    name
    avatar
  }
}
"#;

pub(crate) fn graphql_headers(api_key: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);

    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            "apikey",
            HeaderValue::from_str(api_key).map_err(|error| {
                format!("Failed to encode launcher Nexus GraphQL API key header: {error}")
            })?,
        );
    }

    if !headers.contains_key("apikey") {
        return Err("Configure a Nexus API key before querying Nexus Mods.".to_string());
    }

    Ok(headers)
}

pub(crate) fn public_graphql_headers(
    referer: &str,
    operation_name: &str,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(PUBLIC_BROWSER_USER_AGENT),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
    headers.insert(
        "Accept-Language",
        HeaderValue::from_static("zh-CN,zh;q=0.9"),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("Priority", HeaderValue::from_static("u=1, i"));
    headers.insert(
        "sec-ch-ua",
        HeaderValue::from_static(
            r#""Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99""#,
        ),
    );
    headers.insert("sec-ch-ua-mobile", HeaderValue::from_static("?0"));
    headers.insert(
        "sec-ch-ua-platform",
        HeaderValue::from_static(r#""Windows""#),
    );
    headers.insert("sec-fetch-dest", HeaderValue::from_static("empty"));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("cors"));
    headers.insert("sec-fetch-site", HeaderValue::from_static("same-site"));
    headers.insert(
        "Origin",
        HeaderValue::from_static("https://www.nexusmods.com"),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_str(referer).map_err(|error| {
            format!("Failed to encode launcher public GraphQL referer header: {error}")
        })?,
    );
    headers.insert(
        "x-graphql-operationname",
        HeaderValue::from_str(operation_name).map_err(|error| {
            format!("Failed to encode launcher public GraphQL operation header: {error}")
        })?,
    );
    Ok(headers)
}

pub(crate) fn build_user_avatar_graphql_payload(user_id: u64) -> Result<Value, String> {
    let id = i64::try_from(user_id)
        .map_err(|_| format!("Nexus user id {user_id} is too large for GraphQL Int."))?;

    Ok(json!({
        "operationName": "LauncherUserAvatar",
        "query": USER_AVATAR_GRAPHQL_QUERY,
        "variables": {
            "id": id
        }
    }))
}

pub(crate) fn parse_user_avatar_graphql_response(
    payload: &Value,
) -> Result<Option<String>, String> {
    if let Some(error) = extract_graphql_error(payload) {
        return Err(error);
    }

    let user = payload
        .get("data")
        .and_then(|value| value.get("user"))
        .ok_or_else(|| "Nexus user avatar response did not include data.user.".to_string())?;

    Ok(string_field(user, "avatar").map(|avatar| normalize_nexus_url(&avatar)))
}

pub(crate) fn load_user_avatar(api_key: &str, user_id: u64) -> Result<Option<String>, String> {
    let client = launcher_http_client()?;
    let headers = graphql_headers(Some(api_key))?;
    let payload = build_user_avatar_graphql_payload(user_id)?;
    let (status, response_payload) = send_nexus_json_request(|| {
        client
            .post(GRAPHQL_ENDPOINT)
            .headers(headers.clone())
            .json(&payload)
            .send()
    })
    .map_err(|error| format!("Nexus user avatar GraphQL response failed: {error}"))?;

    if !status.is_success() {
        return Err(format!(
            "Nexus user avatar GraphQL request failed: HTTP {}",
            status
        ));
    }

    parse_user_avatar_graphql_response(&response_payload)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/nexusmods/graphql/account_tests.rs"]
mod account_tests;
