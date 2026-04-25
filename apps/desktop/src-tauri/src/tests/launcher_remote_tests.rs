use super::{
    load_remote_mod_detail_with_public_graphql_fallback, parse_public_mod_detail_graphql_response,
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
fn graphql_not_found_error_does_not_fallback_to_html() {
    let mut html_attempted = false;

    let result = load_remote_mod_detail_with_public_graphql_fallback(
        || Err("Mod not found".to_string()),
        || {
            html_attempted = true;
            Ok(sample_detail(20781))
        },
    );

    assert_eq!(result.unwrap_err(), "Mod not found");
    assert!(!html_attempted);
}

#[test]
fn transport_error_still_falls_back_to_html() {
    let mut html_attempted = false;

    let result = load_remote_mod_detail_with_public_graphql_fallback(
        || Err("error sending request for url (https://api-router.nexusmods.com/graphql)".to_string()),
        || {
            html_attempted = true;
            Ok(sample_detail(44980))
        },
    )
    .expect("fallback to html detail");

    assert!(html_attempted);
    assert_eq!(result.mod_id, 44980);
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
