use super::{
    load_remote_mod_detail_with_api_fallback, load_remote_mod_detail_with_graphql_fallback,
    parse_public_mod_detail_graphql_response, RemoteModDetail,
};
use serde_json::json;

fn sample_detail(mod_id: i64) -> RemoteModDetail {
    RemoteModDetail {
        name: Some(format!("Sample Mod {mod_id}")),
        author: Some("ModForge".to_string()),
        summary: Some("Summary".to_string()),
        version: Some("1.0.0".to_string()),
        image_url: Some("https://static.nexusmods.com/mods/1303/images/1.png".to_string()),
        ..RemoteModDetail::empty(
            mod_id,
            format!("https://www.nexusmods.com/stardewvalley/mods/{mod_id}"),
        )
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
fn graphql_detail_short_circuits_rest_api() {
    let mut rest_api_attempted = false;

    let result = load_remote_mod_detail_with_graphql_fallback(
        || Ok(sample_detail(1915)),
        || {
            rest_api_attempted = true;
            Ok(Some(sample_detail(112233)))
        },
    )
    .expect("graphql detail should resolve");

    assert_eq!(result.mod_id, 1915);
    assert!(!rest_api_attempted);
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

#[test]
fn parse_public_mod_detail_graphql_response_extracts_detail_fields_and_primary_file() {
    let payload = json!({
        "data": {
            "mod": {
                "modId": 1915,
                "name": "Content Patcher",
                "summary": "Loads content packs for Stardew Valley 1.6.",
                "description": "<p>Loads Content Patcher packs for Stardew Valley 1.6.</p>",
                "category": "Legacy category",
                "directDownloadEnabled": false,
                "supportsVortex": true,
                "downloads": 23100000,
                "endorsements": 457192,
                "fileSize": 381,
                "version": "2.9.1",
                "pictureUrl": "https://staticdelivery.nexusmods.com/mods/1303/images/1915.png",
                "author": "Pathoschild",
                "modCategory": {
                    "name": "Modding Tools"
                },
                "tags": [
                    { "name": "SMAPI" },
                    { "name": "Content Patcher" },
                    { "name": "Stardew Valley 1.6 Compatible" }
                ],
                "modRequirements": {
                    "nexusRequirements": {
                        "nodes": [
                            {
                                "modName": "SMAPI",
                                "notes": "4.4.0 or later",
                                "url": "https://www.nexusmods.com/stardewvalley/mods/2400",
                                "externalRequirement": false
                            }
                        ]
                    },
                    "dlcRequirements": []
                },
                "updatedAt": "2026-04-16T12:34:56Z",
                "uploader": {
                    "name": "Pathoschild"
                }
            },
            "modFiles": [
                {
                    "category": "MAIN",
                    "changelogText": ["<p>Compatibility updates and fixes.</p>"],
                    "fileId": 160463,
                    "manager": 1,
                    "name": "Content Patcher 2.9.1",
                    "primary": 1,
                    "scanned": 1,
                    "scannedV2": "VERIFIED",
                    "size": 381,
                    "sizeInBytes": "389967",
                    "requirementsAlert": 0,
                    "uri": "https://file-metadata.nexusmods.com/file.zip",
                    "version": "2.9.1"
                }
            ]
        }
    });

    let detail = parse_public_mod_detail_graphql_response(&payload, 1915)
        .expect("graphql detail should parse");

    assert_eq!(detail.category.as_deref(), Some("Modding Tools"));
    assert_eq!(detail.downloads, Some(23_100_000));
    assert_eq!(detail.endorsements, Some(457_192));
    assert_eq!(detail.file_size, Some(381));
    assert_eq!(detail.updated_at.as_deref(), Some("2026-04-16T12:34:56Z"));
    assert_eq!(
        detail.tags,
        vec!["SMAPI", "Content Patcher", "Stardew Valley 1.6 Compatible"]
    );
    assert_eq!(
        detail.required_loader.as_deref(),
        Some("SMAPI: 4.4.0 or later")
    );
    assert_eq!(detail.game_version.as_deref(), Some("1.6"));
    assert_eq!(detail.primary_file_id, Some(160463));
    assert_eq!(
        detail.primary_file_name.as_deref(),
        Some("Content Patcher 2.9.1")
    );
    assert_eq!(detail.primary_file_size, Some(381));
    assert_eq!(detail.primary_file_size_bytes, Some(389_967));
    assert_eq!(detail.primary_file_scanned, Some(true));
    assert_eq!(detail.primary_file_scan_status.as_deref(), Some("VERIFIED"));
    assert_eq!(detail.archive_type.as_deref(), Some("ZIP"));
    assert_eq!(
        detail.update_risk.as_deref(),
        Some("Low: verified primary file")
    );
    assert_eq!(
        detail.primary_file_changelog,
        vec!["Compatibility updates and fixes."]
    );
    assert_eq!(
        detail.summary.as_deref(),
        Some("Loads content packs for Stardew Valley 1.6.")
    );
    assert_eq!(
        detail.description.as_deref(),
        Some("Loads Content Patcher packs for Stardew Valley 1.6.")
    );
    assert_eq!(detail.requirements.len(), 1);
    assert_eq!(detail.requirements[0].name, "SMAPI");
    assert_eq!(
        detail.requirements[0].notes.as_deref(),
        Some("4.4.0 or later")
    );
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].file_id, Some(160463));
    assert_eq!(
        detail.files[0].name.as_deref(),
        Some("Content Patcher 2.9.1")
    );
    assert!(detail.files[0].primary);
    assert_eq!(detail.files[0].archive_type.as_deref(), Some("ZIP"));
}

#[test]
fn parse_public_mod_detail_graphql_response_picks_newest_primary_file() {
    let payload = json!({
        "data": {
            "mod": {
                "modId": 1915,
                "name": "Content Patcher",
                "summary": "Loads content packs.",
                "description": "<p>Loads content packs.</p>",
                "version": "2.9.1",
                "pictureUrl": null,
                "author": "Pathoschild",
                "tags": [],
                "modRequirements": {
                    "nexusRequirements": { "nodes": [] },
                    "dlcRequirements": []
                }
            },
            "modFiles": [
                {
                    "category": "MAIN",
                    "changelogText": ["<p>Old file.</p>"],
                    "fileId": 100,
                    "manager": 1,
                    "name": "Content Patcher 1.0.0",
                    "primary": 1,
                    "scanned": 1,
                    "scannedV2": "VERIFIED",
                    "size": 100,
                    "sizeInBytes": "100000",
                    "requirementsAlert": 0,
                    "uri": "https://file-metadata.nexusmods.com/old.zip",
                    "version": "1.0.0"
                },
                {
                    "category": "MAIN",
                    "changelogText": ["<p>Latest file.</p>"],
                    "fileId": 200,
                    "manager": 1,
                    "name": "Content Patcher 2.9.1",
                    "primary": 1,
                    "scanned": 1,
                    "scannedV2": "VERIFIED",
                    "size": 381,
                    "sizeInBytes": "389967",
                    "requirementsAlert": 0,
                    "uri": "https://file-metadata.nexusmods.com/latest.zip",
                    "version": "2.9.1"
                }
            ]
        }
    });

    let detail = parse_public_mod_detail_graphql_response(&payload, 1915)
        .expect("graphql detail should parse");

    assert_eq!(detail.primary_file_id, Some(200));
    assert_eq!(
        detail.primary_file_name.as_deref(),
        Some("Content Patcher 2.9.1")
    );
    assert_eq!(detail.primary_file_version.as_deref(), Some("2.9.1"));
    assert_eq!(detail.primary_file_changelog, vec!["Latest file."]);
}
