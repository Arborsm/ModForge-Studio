use super::{
    build_catalog_graphql_payload, build_public_catalog_graphql_payload,
    parse_catalog_graphql_response,
};
use crate::domain::launcher::types::SearchLauncherCatalogRequest;
use serde_json::Value;

fn assert_catalog_time_range_filter(payload: &Value, field: &str) {
    let filters = payload["variables"]["filter"][field]
        .as_array()
        .expect("time range filter array");
    assert_eq!(filters.len(), 1);
    assert_eq!(filters[0]["op"], "GTE");

    let value = filters[0]["value"]
        .as_str()
        .expect("time range filter value string");
    assert!(value.parse::<i64>().expect("time range unix timestamp") > 0);
}

#[test]
fn catalog_does_not_use_removed_legacy_catalog_widget_endpoint() {
    let source = include_str!("../../domain/nexusmods/graphql/catalog.rs");

    assert!(!source.contains("Core/Libs/Common/Widgets/ModList"));
}

#[test]
fn catalog_graphql_requests_use_documented_v2_endpoint() {
    let source = include_str!("../../domain/nexusmods/graphql/catalog.rs");

    assert!(source.contains("graphql::GRAPHQL_ENDPOINT"));
    assert!(!source.contains(&format!("https://graphql.{}{}", "nexusmods.com", "/")));
    assert!(!source.contains(&format!("https://api-router.{}", "nexusmods.com/graphql")));
}

#[test]
fn build_catalog_graphql_payload_applies_time_range_to_updated_sort() {
    let payload = build_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: None,
        title_query: None,
        description_query: None,
        author_query: None,
        uploader_query: None,
        page: Some(1),
        page_size: Some(20),
        time_range: Some("week".to_string()),
        sort: Some("updated".to_string()),
        ascending: Some(false),
        category: None,
        language: None,
        tags_include: None,
        tags_exclude: None,
        include_adult: Some(false),
        min_file_size: None,
        max_file_size: None,
        min_downloads: None,
        max_downloads: None,
        min_endorsements: None,
        max_endorsements: None,
    })
    .expect("build catalog graphql payload");

    assert_catalog_time_range_filter(&payload, "updatedAt");
}

#[test]
fn build_public_catalog_graphql_payload_applies_time_range_to_created_sort() {
    let payload = build_public_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: None,
        title_query: None,
        description_query: None,
        author_query: None,
        uploader_query: None,
        page: Some(1),
        page_size: Some(20),
        time_range: Some("month".to_string()),
        sort: Some("newest".to_string()),
        ascending: Some(false),
        category: None,
        language: None,
        tags_include: None,
        tags_exclude: None,
        include_adult: Some(false),
        min_file_size: None,
        max_file_size: None,
        min_downloads: None,
        max_downloads: None,
        min_endorsements: None,
        max_endorsements: None,
    })
    .expect("build public catalog graphql payload");

    assert_catalog_time_range_filter(&payload, "createdAt");
}

#[test]
fn catalog_graphql_payload_omits_adult_filter_when_adult_content_is_included() {
    let payload = build_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: None,
        title_query: None,
        description_query: None,
        author_query: None,
        uploader_query: None,
        page: Some(1),
        page_size: Some(20),
        time_range: None,
        sort: Some("newest".to_string()),
        ascending: Some(false),
        category: None,
        language: None,
        tags_include: None,
        tags_exclude: None,
        include_adult: Some(true),
        min_file_size: None,
        max_file_size: None,
        min_downloads: None,
        max_downloads: None,
        min_endorsements: None,
        max_endorsements: None,
    })
    .expect("build catalog graphql payload");

    assert!(payload["variables"]["filter"].get("adultContent").is_none());
}

#[test]
fn public_catalog_graphql_payload_omits_adult_filter_when_adult_content_is_included() {
    let payload = build_public_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: None,
        title_query: None,
        description_query: None,
        author_query: None,
        uploader_query: None,
        page: Some(1),
        page_size: Some(20),
        time_range: None,
        sort: Some("newest".to_string()),
        ascending: Some(false),
        category: None,
        language: None,
        tags_include: None,
        tags_exclude: None,
        include_adult: Some(true),
        min_file_size: None,
        max_file_size: None,
        min_downloads: None,
        max_downloads: None,
        min_endorsements: None,
        max_endorsements: None,
    })
    .expect("build public catalog graphql payload");

    assert!(payload["variables"]["filter"].get("adultContent").is_none());
}

#[test]
fn parse_catalog_graphql_response_keeps_batch_mod_metadata() {
    let payload = serde_json::json!({
        "data": {
            "mods": {
                "nodes": [
                    {
                        "modId": 101,
                        "name": "Tractor Mod",
                        "summary": "Drive around Pelican Town.",
                        "pictureUrl": "https://static.nexusmods.com/tractor.png",
                        "createdAt": "2024-05-01T10:00:00Z",
                        "updatedAt": "2026-05-18T08:30:00Z",
                        "downloads": "1234567",
                        "endorsements": 9876,
                        "fileSize": "13107200",
                        "modCategory": {
                            "name": "Gameplay Mechanics"
                        },
                        "uploader": {
                            "name": "Pathoschild"
                        }
                    }
                ],
                "totalCount": 1,
                "facetsData": {}
            }
        }
    });

    let page =
        parse_catalog_graphql_response(&payload, 1, 20).expect("parse catalog graphql response");

    assert_eq!(page.results.len(), 1);
    assert_eq!(page.results[0].mod_id, 101);
    assert_eq!(page.results[0].title, "Tractor Mod");
    assert_eq!(page.results[0].author.as_deref(), Some("Pathoschild"));
    assert_eq!(
        page.results[0].created_at.as_deref(),
        Some("2024-05-01T10:00:00Z")
    );
    assert_eq!(
        page.results[0].updated_at.as_deref(),
        Some("2026-05-18T08:30:00Z")
    );
    assert_eq!(page.results[0].downloads, Some(1_234_567));
    assert_eq!(page.results[0].endorsements, Some(9_876));
    assert_eq!(page.results[0].file_size, Some(13_107_200));
    assert_eq!(
        page.results[0].category.as_deref(),
        Some("Gameplay Mechanics")
    );
}
