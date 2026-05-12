use super::{
    load_remote_mod_detail_with_api_fallback, parse_public_mod_detail_graphql_response,
    RemoteModDetail,
};
use serde_json::json;

fn sample_detail(mod_id: i64) -> RemoteModDetail {
    RemoteModDetail {
        mod_id,
        name: Some(format!("Sample Mod {mod_id}")),
        author: Some("ModForge".to_string()),
        summary: Some("Summary".to_string()),
        version: Some("1.0.0".to_string()),
        mod_url: format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}"),
        image_url: Some("https://static.nexusmods.com/mods/1303/images/1.png".to_string()),
        gallery_images: Vec::new(),
        updated_at: None,
        file_size: None,
    }
}

#[test]
fn rest_api_detail_short_circuits_public_routes() {
    let mut public_graphql_attempted = false;

    let result = load_remote_mod_detail_with_api_fallback(
        || Ok(Some(sample_detail(112233))),
        || {
            public_graphql_attempted = true;
            Ok(sample_detail(20781))
        },
    )
    .expect("rest api detail should resolve");

    assert_eq!(result.mod_id, 112233);
    assert!(!public_graphql_attempted);
}

#[test]
fn graphql_not_found_error_is_returned_without_html_fallback() {
    let result =
        load_remote_mod_detail_with_api_fallback(|| Ok(None), || Err("Mod not found".to_string()));

    assert_eq!(result.unwrap_err(), "Mod not found");
}

#[test]
fn graphql_transport_error_is_returned_without_html_fallback() {
    let result = load_remote_mod_detail_with_api_fallback(
        || Ok(None),
        || Err("error sending request for url (https://api.nexusmods.com/v2/graphql)".to_string()),
    );

    assert_eq!(
        result.unwrap_err(),
        "error sending request for url (https://api.nexusmods.com/v2/graphql)"
    );
}

#[test]
fn public_mod_detail_uses_documented_v2_graphql_endpoint() {
    let source = include_str!("../domain/nexusmods/graphql/mod_detail.rs");

    assert!(source.contains("graphql::GRAPHQL_ENDPOINT"));
    assert!(!source.contains(&format!("https://api-router.{}", "nexusmods.com/graphql")));
}

#[test]
fn parse_public_mod_detail_graphql_response_returns_not_found_error() {
    let payload = json!({
        "errors": [
            {
                "message": "Mod not found"
            }
        ],
        "data": null
    });

    let error = parse_public_mod_detail_graphql_response(&payload, 20781)
        .expect_err("graphql not found should stay an error");

    assert_eq!(error, "Mod not found");
}
