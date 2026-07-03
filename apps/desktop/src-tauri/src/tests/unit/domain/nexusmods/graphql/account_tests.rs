use super::{build_user_avatar_graphql_payload, parse_user_avatar_graphql_response};
use serde_json::json;

#[test]
fn build_user_avatar_graphql_payload_queries_user_avatar_by_id() {
    let payload =
        build_user_avatar_graphql_payload(123).expect("build user avatar graphql payload");

    assert_eq!(payload["operationName"], "LauncherUserAvatar");
    assert_eq!(payload["variables"]["id"], 123);

    let query = payload["query"].as_str().expect("graphql query string");
    assert!(query.contains("query LauncherUserAvatar"));
    assert!(query.contains("user(id: $id)"));
    assert!(query.contains("avatar"));
    assert!(query.contains("memberId"));
    assert!(query.contains("name"));
}

#[test]
fn parse_user_avatar_graphql_response_normalizes_avatar_url() {
    let payload = json!({
        "data": {
            "user": {
                "memberId": 123,
                "name": "ApiPilot",
                "avatar": "//staticdelivery.nexusmods.com/Images/Users/123/avatar.png"
            }
        }
    });

    let avatar =
        parse_user_avatar_graphql_response(&payload).expect("parse user avatar graphql response");

    assert_eq!(
        avatar.as_deref(),
        Some("https://staticdelivery.nexusmods.com/Images/Users/123/avatar.png")
    );
}
