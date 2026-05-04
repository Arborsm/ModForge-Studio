use super::{
    ensure_launcher_nexus_route_available, launcher_nexus_route_for_url,
    probe_blocked_launcher_nexus_route_with_runner, probe_launcher_nexus_route_with_runner,
    read_nexus_response_body_with_retry, reset_launcher_nexus_diagnostics_for_test,
    set_launcher_nexus_force_offline_with_settings_for_test,
    set_launcher_nexus_route_snapshot_for_test, LauncherNexusRoute,
    LauncherNexusRouteSnapshot, LauncherNexusRouteStatus, snapshot_launcher_nexus_diagnostics_for_test,
};
use crate::domain::launcher::types::LauncherSettings;
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
        launcher_nexus_route_for_url(
            r"E:\Games\Stardew Valley\Mods\Some Mod\assets\cover.png"
        ),
        None
    );
}
