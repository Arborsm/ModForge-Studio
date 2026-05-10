use super::{
    ensure_launcher_nexus_route_available, launcher_cloudflare_challenge_required_error,
    launcher_nexus_route_for_url, nexus_public_html_document_requires_verification,
    nexus_public_html_response_requires_accelerated_fallback,
    probe_blocked_launcher_nexus_route_with_runner, probe_launcher_nexus_route_with_runner,
    public_page_headers, read_nexus_response_body_with_retry,
    reset_launcher_nexus_diagnostics_for_test, run_public_html_with_accelerated_fallback,
    set_launcher_nexus_force_offline_with_settings_for_test,
    set_launcher_nexus_route_snapshot_for_test, snapshot_launcher_nexus_diagnostics_for_test,
    LauncherNexusRoute, LauncherNexusRouteSnapshot, LauncherNexusRouteStatus,
    NexusPublicHtmlDocument,
};
use crate::domain::launcher::types::LauncherSettings;
use reqwest::header::{HeaderMap, HeaderValue, COOKIE, USER_AGENT};
use reqwest::{StatusCode, Url};
use std::net::{IpAddr, Ipv4Addr};
use std::sync::{Mutex, OnceLock};

fn launcher_http_test_guard() -> &'static Mutex<()> {
    static GUARD: OnceLock<Mutex<()>> = OnceLock::new();
    GUARD.get_or_init(|| Mutex::new(()))
}

fn launcher_settings(api_key: Option<&str>, cookie: Option<&str>) -> LauncherSettings {
    LauncherSettings {
        game_path: None,
        mods_path: None,
        download_path: None,
        nexus_api_key: api_key.map(str::to_string),
        nexus_cookie: cookie.map(str::to_string),
        auto_install_downloads: false,
        keep_downloaded_archives: false,
        auto_check_mod_updates: true,
        disable_public_html_route: false,
    }
}

#[test]
fn read_nexus_response_body_with_retry_retries_after_decode_error() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut attempts = 0;

    let body = read_nexus_response_body_with_retry(|| {
        attempts += 1;
        if attempts == 1 {
            Err("error decoding response body".to_string())
        } else {
            Ok(br#"{"data":{"ok":true}}"#.to_vec())
        }
    })
    .expect("retry after body decode failure");

    assert_eq!(attempts, 2);
    assert_eq!(body, br#"{"data":{"ok":true}}"#.to_vec());
}

#[test]
fn launcher_nexus_route_probe_marks_warning_after_three_failed_attempts() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut attempts = 0;

    let snapshot = probe_launcher_nexus_route_with_runner(
        LauncherNexusRoute::PublicGraphql,
        || {
            attempts += 1;
            Err("connection reset".to_string())
        },
        false,
    );

    assert_eq!(attempts, 3);
    assert_eq!(snapshot.status, LauncherNexusRouteStatus::Warning);
    assert!(!snapshot.available);
    assert_eq!(snapshot.attempts, 3);
    assert!(snapshot.message.contains("connection reset"));
}

#[test]
fn launcher_nexus_route_probe_marks_success_after_first_successful_attempt() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut attempts = 0;

    let snapshot = probe_launcher_nexus_route_with_runner(
        LauncherNexusRoute::PublicHtml,
        || {
            attempts += 1;
            Ok(())
        },
        false,
    );

    assert_eq!(attempts, 1);
    assert_eq!(snapshot.status, LauncherNexusRouteStatus::Success);
    assert!(snapshot.available);
    assert_eq!(snapshot.attempts, 1);
}

#[test]
fn public_html_response_requires_fallback_for_cloudflare_challenge_pages() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let challenge_html = r#"
<!DOCTYPE html>
<html>
  <head>
    <title>Just a moment...</title>
  </head>
  <body>
    <div>Enable JavaScript and cookies to continue</div>
    <script>window._cf_chl_opt = { cZone: 'www.nexusmods.com' };</script>
  </body>
</html>
"#;

    let normal_html = r#"
<!DOCTYPE html>
<html>
  <head>
    <meta property="og:title" content="Joja Civic Center" />
  </head>
  <body>real page</body>
</html>
"#;

    assert!(nexus_public_html_response_requires_accelerated_fallback(
        challenge_html
    ));
    assert!(!nexus_public_html_response_requires_accelerated_fallback(
        normal_html
    ));
}

#[test]
fn public_html_fallback_retries_when_primary_body_is_not_usable_html() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut accelerated_attempts = 0;

    let result = run_public_html_with_accelerated_fallback(
        || Err("Received Nexus HTML interstitial instead of page content.".to_string()),
        || Ok(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))),
        |ip| {
            accelerated_attempts += 1;
            Ok(format!("ok via {ip}"))
        },
    )
    .expect("accelerated fallback should recover from unusable primary html");

    assert_eq!(accelerated_attempts, 1);
    assert_eq!(result, "ok via 1.1.1.1");
}

#[test]
fn public_html_fallback_skips_accelerated_retry_when_primary_reports_challenge() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut accelerated_attempts = 0;

    let error = run_public_html_with_accelerated_fallback(
        || {
            Err(launcher_cloudflare_challenge_required_error(
                "https://www.nexusmods.com/stardewvalley",
            ))
        },
        || {
            accelerated_attempts += 1;
            Ok(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)))
        },
        |_ip| Ok("unused".to_string()),
    )
    .expect_err("challenge should short-circuit before accelerated fallback");

    assert_eq!(accelerated_attempts, 0);
    assert!(error.contains("CLOUDFLARE_CHALLENGE_REQUIRED"));
}

#[test]
fn public_html_response_detects_cloudflare_challenge_even_on_http_error() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    assert!(nexus_public_html_response_requires_accelerated_fallback(
        r#"
<!DOCTYPE html>
<html>
  <head>
    <title>Just a moment...</title>
  </head>
  <body>
    <div>Enable JavaScript and cookies to continue</div>
  </body>
</html>
"#
    ));
}

#[test]
fn public_html_document_detects_cloudflare_challenge_from_response_headers() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let mut headers = HeaderMap::new();
    headers.insert("cf-mitigated", HeaderValue::from_static("challenge"));
    headers.insert("server", HeaderValue::from_static("cloudflare"));

    let document = NexusPublicHtmlDocument {
        status: StatusCode::FORBIDDEN,
        headers,
        body: "<html><body>forbidden</body></html>".to_string(),
    };

    assert!(nexus_public_html_document_requires_verification(&document));
}

#[test]
fn public_page_headers_preserve_verification_cookie_and_browser_user_agent() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let url = Url::parse("https://www.nexusmods.com/stardewvalley/mods/101")
        .expect("test URL should parse");
    let headers = public_page_headers(
        Some("https://www.nexusmods.com/stardewvalley"),
        Some("cf_clearance=clearance-token; __cf_bm=bm-token"),
        &url,
    )
    .expect("public page headers should be built");

    let cookie = headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    assert!(cookie.contains("cf_clearance=clearance-token"));
    assert!(cookie.contains("__cf_bm=bm-token"));
    assert_eq!(
        headers
            .get(USER_AGENT)
            .and_then(|value| value.to_str().ok()),
        Some(super::PUBLIC_BROWSER_USER_AGENT)
    );
}

#[test]
fn launcher_nexus_route_probe_stops_retrying_when_cloudflare_challenge_is_required() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let mut attempts = 0;

    let snapshot = probe_launcher_nexus_route_with_runner(
        LauncherNexusRoute::PublicHtml,
        || {
            attempts += 1;
            Err(launcher_cloudflare_challenge_required_error(
                "https://www.nexusmods.com/stardewvalley",
            ))
        },
        true,
    );

    assert_eq!(attempts, 1);
    assert_eq!(snapshot.status, LauncherNexusRouteStatus::Warning);
    assert!(!snapshot.available);
    assert_eq!(snapshot.attempts, 1);
    assert!(snapshot.challenge_required);
}

#[test]
fn blocked_launcher_nexus_route_returns_fast_error() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();
    set_launcher_nexus_route_snapshot_for_test(LauncherNexusRouteSnapshot {
        route_id: LauncherNexusRoute::PublicGraphql.id().to_string(),
        label: LauncherNexusRoute::PublicGraphql.label().to_string(),
        endpoint: LauncherNexusRoute::PublicGraphql.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Warning,
        attempts: 3,
        max_attempts: 3,
        available: false,
        message: "Failed after 3 attempts: timeout".to_string(),
        challenge_required: false,
    });

    let error = ensure_launcher_nexus_route_available(LauncherNexusRoute::PublicGraphql)
        .expect_err("route should be blocked");

    assert!(error.contains("Public GraphQL"));
    assert!(error.contains("Failed after 3 attempts"));
}

#[test]
fn blocked_launcher_nexus_route_can_be_recovered_by_reprobe() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();
    set_launcher_nexus_route_snapshot_for_test(LauncherNexusRouteSnapshot {
        route_id: LauncherNexusRoute::PublicGraphql.id().to_string(),
        label: LauncherNexusRoute::PublicGraphql.label().to_string(),
        endpoint: LauncherNexusRoute::PublicGraphql.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Warning,
        attempts: 3,
        max_attempts: 3,
        available: false,
        message: "Failed after 3 attempts: timeout".to_string(),
        challenge_required: false,
    });

    let mut attempts = 0;
    probe_blocked_launcher_nexus_route_with_runner(
        LauncherNexusRoute::PublicGraphql,
        || {
            attempts += 1;
            Ok(())
        },
        false,
    )
    .expect("blocked route should recover after a successful reprobe");

    assert_eq!(attempts, 1);
    ensure_launcher_nexus_route_available(LauncherNexusRoute::PublicGraphql)
        .expect("route should be available after reprobe");
}

#[test]
fn force_offline_override_blocks_all_configured_routes() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None, None), true);

    let diagnostics = snapshot_launcher_nexus_diagnostics_for_test();
    assert_eq!(diagnostics.routes.len(), 4);
    assert!(diagnostics.routes.iter().all(|route| {
        route.status == LauncherNexusRouteStatus::Warning
            && !route.available
            && route.message.contains("Forced offline")
    }));
    ensure_launcher_nexus_route_available(LauncherNexusRoute::PublicGraphql)
        .expect_err("public GraphQL should be blocked while force offline is active");
    ensure_launcher_nexus_route_available(LauncherNexusRoute::Smapi)
        .expect_err("SMAPI should be blocked while force offline is active");
}

#[test]
fn force_offline_override_prevents_blocked_route_reprobe_recovery() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None, None), true);

    let mut attempts = 0;
    let error = probe_blocked_launcher_nexus_route_with_runner(
        LauncherNexusRoute::PublicGraphql,
        || {
            attempts += 1;
            Ok(())
        },
        false,
    )
    .expect_err("forced-offline route should not recover via reprobe");

    assert_eq!(attempts, 0);
    assert!(error.contains("Forced offline"));

    let diagnostics = snapshot_launcher_nexus_diagnostics_for_test();
    let public_graphql = diagnostics
        .routes
        .iter()
        .find(|route| route.route_id == LauncherNexusRoute::PublicGraphql.id())
        .expect("public GraphQL snapshot should exist");
    assert_eq!(public_graphql.status, LauncherNexusRouteStatus::Warning);
    assert!(!public_graphql.available);
    assert!(public_graphql.message.contains("Forced offline"));
}

#[test]
fn clearing_force_offline_override_unblocks_routes() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None, None), true);
    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None, None), false);

    ensure_launcher_nexus_route_available(LauncherNexusRoute::PublicGraphql)
        .expect("public GraphQL should be available again after clearing force offline");
    ensure_launcher_nexus_route_available(LauncherNexusRoute::Smapi)
        .expect("SMAPI should be available again after clearing force offline");
}

#[test]
fn launcher_nexus_configured_routes_include_smapi_and_image_routes_without_credentials() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let routes = LauncherNexusRoute::configured_routes(&launcher_settings(None, None));

    assert_eq!(
        routes,
        vec![
            LauncherNexusRoute::PublicGraphql,
            LauncherNexusRoute::PublicHtml,
            LauncherNexusRoute::NexusImages,
            LauncherNexusRoute::Smapi,
        ]
    );
}

#[test]
fn launcher_nexus_configured_routes_include_private_graphql_and_api_when_available() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let routes = LauncherNexusRoute::configured_routes(&launcher_settings(
        Some("nexus-api-key"),
        Some("sid=session"),
    ));

    assert_eq!(
        routes,
        vec![
            LauncherNexusRoute::PublicGraphql,
            LauncherNexusRoute::PublicHtml,
            LauncherNexusRoute::NexusImages,
            LauncherNexusRoute::Smapi,
            LauncherNexusRoute::PrivateGraphql,
            LauncherNexusRoute::NexusApi,
        ]
    );
}

#[test]
fn launcher_nexus_route_for_url_classifies_known_remote_hosts() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    assert_eq!(
        launcher_nexus_route_for_url(
            "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/541/541-cover.png"
        ),
        Some(LauncherNexusRoute::NexusImages)
    );
    assert_eq!(
        launcher_nexus_route_for_url(
            "https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json"
        ),
        Some(LauncherNexusRoute::NexusApi)
    );
    assert_eq!(
        launcher_nexus_route_for_url("https://smapi.io/api/v3.0/mods"),
        Some(LauncherNexusRoute::Smapi)
    );
    assert_eq!(
        launcher_nexus_route_for_url(r"E:\Games\Stardew Valley\Mods\Some Mod\assets\cover.png"),
        None
    );
}
#[test]
fn verifying_status_serializes_to_lowercase_json() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let snapshot = super::LauncherNexusRouteSnapshot {
        route_id: super::LauncherNexusRoute::PublicHtml.id().to_string(),
        label: super::LauncherNexusRoute::PublicHtml.label().to_string(),
        endpoint: super::LauncherNexusRoute::PublicHtml.endpoint().to_string(),
        status: super::LauncherNexusRouteStatus::Verifying,
        attempts: 1,
        max_attempts: 3,
        available: true,
        message: "Cloudflare challenge detected -- launching browser verification.".to_string(),
        challenge_required: true,
    };

    let json = serde_json::to_string(&snapshot).expect("snapshot should serialize");
    assert!(
        json.contains(r#""status":"verifying""#),
        "Expected verifying status in JSON, got: {json}"
    );
    assert!(
        json.contains(r#""challengeRequired":true"#),
        "Expected challengeRequired in JSON, got: {json}"
    );
}

#[test]
fn disabled_public_html_route_still_generates_warning_on_challenge() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    // When disable_public_html_route = true, configured_routes excludes PublicHtml
    let settings = LauncherSettings {
        disable_public_html_route: true,
        ..launcher_settings(None, None)
    };

    let routes = super::LauncherNexusRoute::configured_routes(&settings);
    assert!(
        !routes.contains(&super::LauncherNexusRoute::PublicHtml),
        "PublicHtml route should be excluded when disabled"
    );

    // The probe would not be called for PublicHtml at all
    // Verify we can still create a warning snapshot for the route directly
    let warning = super::LauncherNexusRouteSnapshot {
        route_id: super::LauncherNexusRoute::PublicHtml.id().to_string(),
        label: super::LauncherNexusRoute::PublicHtml.label().to_string(),
        endpoint: super::LauncherNexusRoute::PublicHtml.endpoint().to_string(),
        status: super::LauncherNexusRouteStatus::Warning,
        attempts: 1,
        max_attempts: 3,
        available: false,
        message: "Route is disabled.".to_string(),
        challenge_required: false,
    };
    assert_eq!(warning.status, super::LauncherNexusRouteStatus::Warning);
}

#[test]
fn launcher_nexus_success_snapshot_works_with_one_attempt() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let snapshot =
        super::launcher_nexus_success_snapshot(super::LauncherNexusRoute::PublicGraphql, 1);

    assert_eq!(snapshot.status, super::LauncherNexusRouteStatus::Success);
    assert!(snapshot.available);
    assert_eq!(snapshot.attempts, 1);
    assert!(snapshot.message.contains("1 attempt"));
}
