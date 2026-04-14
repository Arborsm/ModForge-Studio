use super::{build_catalog_graphql_payload, build_public_catalog_graphql_payload};
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
    assert!(!value.is_empty());
    assert!(value.contains('T'));
    assert!(value.ends_with('Z'));
}

#[test]
fn discovery_does_not_use_removed_legacy_catalog_widget_endpoint() {
    let source = include_str!("../domain/launcher/discovery.rs");

    assert!(!source.contains("Core/Libs/Common/Widgets/ModList"));
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
