use super::{
    load_remote_mod_detail_with_public_graphql_fallback, parse_public_mod_detail_graphql_response,
    parse_remote_mod_detail_html, parse_remote_mod_images_tab_html, RemoteModDetail,
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
        || {
            Err(
                "error sending request for url (https://api-router.nexusmods.com/graphql)"
                    .to_string(),
            )
        },
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

#[test]
fn parse_remote_mod_detail_html_handles_meta_attributes_in_any_order() {
    let html = r#"
<html>
  <head>
    <meta content="Stardew Expanded &amp; Friends" property="og:title">
    <meta content="Adds farms &amp; NPCs" property="og:description">
    <meta content="//staticdelivery.nexusmods.com/mods/1303/images/123/cover.png" property="og:image">
    <meta content="Version" property="twitter:label1">
    <meta content="v2.4.1" property="twitter:data1">
  </head>
  <body>
    <img data-src="https://staticdelivery.nexusmods.com/mods/1303/images/123/gallery-a.png">
    <img data-src="https://staticdelivery.nexusmods.com/mods/1303/images/123/gallery-a.png">
    <img data-src="https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/123/thumb.png">
  </body>
</html>
"#;

    let detail = parse_remote_mod_detail_html(html, 123).expect("parse public html detail");

    assert_eq!(detail.name.as_deref(), Some("Stardew Expanded & Friends"));
    assert_eq!(detail.summary.as_deref(), Some("Adds farms & NPCs"));
    assert_eq!(detail.version.as_deref(), Some("2.4.1"));
    assert_eq!(
        detail.image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/mods/1303/images/123/cover.png")
    );
    assert_eq!(
        detail.gallery_images,
        vec!["https://staticdelivery.nexusmods.com/mods/1303/images/123/gallery-a.png"]
    );
}

#[test]
fn parse_remote_mod_images_tab_html_reads_dom_links_without_query_noise() {
    let html = r#"
<section>
  <a data-tracking="image" href="https://staticdelivery.nexusmods.com/mods/1303/images/123/a.png?tab=images">A</a>
  <a href="https://staticdelivery.nexusmods.com/mods/1303/images/123/a.png?tab=images">Duplicate</a>
  <a href="https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/123/thumb.png">Thumb</a>
  <img src="https://staticdelivery.nexusmods.com/mods/1303/images/123/b.png?width=600">
</section>
"#;

    let images = parse_remote_mod_images_tab_html(html);

    assert_eq!(
        images,
        vec![
            "https://staticdelivery.nexusmods.com/mods/1303/images/123/a.png",
            "https://staticdelivery.nexusmods.com/mods/1303/images/123/b.png"
        ]
    );
}
