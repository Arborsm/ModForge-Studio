use super::{
    nexus_request_delay_for_test, read_nexus_response_body_with_retry, retry_delay_from_headers,
    with_nexus_request_slot,
};
use crate::domain::launcher::types::LauncherSettings;
use crate::domain::nexusmods::diagnostics::{
    ensure_launcher_nexus_route_available, launcher_nexus_success_snapshot,
    probe_blocked_launcher_nexus_route_with_runner, probe_launcher_nexus_route_with_runner,
    reset_launcher_nexus_diagnostics_for_test,
    set_launcher_nexus_force_offline_with_settings_for_test,
    set_launcher_nexus_route_snapshot_for_test,
    set_launcher_nexus_route_snapshot_from_probe_for_test,
    snapshot_launcher_nexus_diagnostics_for_test,
};
use crate::domain::nexusmods::routes::{launcher_nexus_route_for_url, LauncherNexusRoute};
use crate::domain::nexusmods::types::{NexusRouteSnapshot, NexusRouteStatus};
use reqwest::header::{HeaderMap, HeaderValue};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;

fn launcher_http_test_guard() -> &'static Mutex<()> {
    static GUARD: OnceLock<Mutex<()>> = OnceLock::new();
    GUARD.get_or_init(|| Mutex::new(()))
}

#[test]
fn nexus_http_module_only_contains_transport_helpers() {
    let source = include_str!("../domain/nexusmods/http.rs");

    assert!(!source.contains("LauncherNexusDiagnosticsState"));
    assert!(!source.contains("probe_launcher_nexus_public_graphql_route"));
    assert!(!source.contains("run_launcher_nexus_diagnostics"));
    assert!(!source.contains("LauncherNexusRoute"));
}

#[test]
fn launcher_nexus_api_key_validation_command_runs_off_the_webview_thread() {
    let source = include_str!("../commands/launcher.rs");
    let command_start = source
        .find("pub async fn validate_nexus_api_key")
        .expect("validate_nexus_api_key command should exist");
    let command_source = &source[command_start..];
    let command_end = command_source
        .find("// ---- SSO Commands ----")
        .expect("validate_nexus_api_key command should stay above SSO commands");
    let command_source = &command_source[..command_end];

    assert!(command_source.contains("tauri::async_runtime::spawn_blocking"));
    assert!(command_source.contains("validate_nexus_api_key_blocking"));
}

#[test]
fn launcher_archive_inspection_command_runs_off_the_webview_thread() {
    let source = include_str!("../commands/launcher.rs");
    let command_start = source
        .find("pub async fn inspect_launcher_archive")
        .expect("inspect_launcher_archive command should exist");
    let command_source = &source[command_start..];
    let command_end = command_source
        .find("// ---- REST API v1 Commands ----")
        .expect("inspect_launcher_archive command should stay above REST API commands");
    let command_source = &command_source[..command_end];

    assert!(command_source.contains("tauri::async_runtime::spawn_blocking"));
    assert!(command_source.contains("archive::inspect_launcher_archive(request)"));
}

#[test]
fn launcher_mod_download_command_runs_off_the_webview_thread() {
    let source = include_str!("../commands/launcher.rs");
    let command_start = source
        .find("pub async fn download_launcher_mod")
        .expect("download_launcher_mod command should exist");
    let command_source = &source[command_start..];
    let command_end = command_source
        .find("pub async fn search_launcher_catalog")
        .expect("download_launcher_mod command should stay above catalog search");
    let command_source = &command_source[..command_end];

    assert!(command_source.contains("tauri::async_runtime::spawn_blocking"));
    assert!(command_source.contains("downloads::download_launcher_mod(app, request)"));
}

fn launcher_settings(api_key: Option<&str>) -> LauncherSettings {
    LauncherSettings {
        game_path: None,
        mods_path: None,
        download_path: None,
        nexus_api_key: api_key.map(str::to_string),
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
fn nexus_request_throttle_does_not_hold_lock_while_request_runs() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    let (first_started_tx, first_started_rx) = mpsc::channel();
    let (release_first_tx, release_first_rx) = mpsc::channel();
    let (second_started_tx, second_started_rx) = mpsc::channel();

    let first = std::thread::spawn(move || {
        with_nexus_request_slot(|| {
            first_started_tx
                .send(())
                .expect("first request should signal start");
            release_first_rx
                .recv()
                .expect("first request should be released");
        });
    });

    first_started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("first request should enter the throttled operation");

    let second = std::thread::spawn(move || {
        with_nexus_request_slot(|| {
            second_started_tx
                .send(())
                .expect("second request should signal start");
        });
    });

    let second_started = second_started_rx.recv_timeout(Duration::from_millis(300));
    release_first_tx
        .send(())
        .expect("first request release should be sent");
    first.join().expect("first request thread should finish");
    second.join().expect("second request thread should finish");

    assert!(
        second_started.is_ok(),
        "Nexus request throttle should not hold its mutex while the HTTP request is running",
    );
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
    assert_eq!(snapshot.status, NexusRouteStatus::Warning);
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
        LauncherNexusRoute::PublicGraphql,
        || {
            attempts += 1;
            Ok(())
        },
        false,
    );

    assert_eq!(attempts, 1);
    assert_eq!(snapshot.status, NexusRouteStatus::Success);
    assert!(snapshot.available);
    assert_eq!(snapshot.attempts, 1);
}

#[test]
fn nexus_request_delay_for_test_stays_within_expected_range() {
    let min = nexus_request_delay_for_test(1);
    let max = nexus_request_delay_for_test(u64::MAX - 1);

    assert!(min >= Duration::from_millis(45));
    assert!(min <= Duration::from_millis(80));
    assert!(max >= Duration::from_millis(45));
    assert!(max <= Duration::from_millis(80));
}

#[test]
fn nexus_request_delay_for_test_stays_below_twenty_five_requests_per_second() {
    let min = nexus_request_delay_for_test(1);

    assert!(min >= Duration::from_millis(40));
}

#[test]
fn retry_delay_prefers_retry_after_header() {
    let mut headers = HeaderMap::new();
    headers.insert("retry-after", HeaderValue::from_static("7"));

    let delay = retry_delay_from_headers(&headers, 0);

    assert_eq!(delay, Duration::from_secs(7));
}

#[test]
fn blocked_launcher_nexus_route_returns_fast_error() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();
    set_launcher_nexus_route_snapshot_for_test(NexusRouteSnapshot {
        route_id: LauncherNexusRoute::PublicGraphql.id().to_string(),
        label: LauncherNexusRoute::PublicGraphql.label().to_string(),
        endpoint: LauncherNexusRoute::PublicGraphql.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
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
    set_launcher_nexus_route_snapshot_for_test(NexusRouteSnapshot {
        route_id: LauncherNexusRoute::PublicGraphql.id().to_string(),
        label: LauncherNexusRoute::PublicGraphql.label().to_string(),
        endpoint: LauncherNexusRoute::PublicGraphql.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
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
fn retrying_one_launcher_nexus_route_keeps_other_route_snapshots_unchanged() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();
    set_launcher_nexus_route_snapshot_for_test(NexusRouteSnapshot {
        route_id: LauncherNexusRoute::PublicGraphql.id().to_string(),
        label: LauncherNexusRoute::PublicGraphql.label().to_string(),
        endpoint: LauncherNexusRoute::PublicGraphql.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
        attempts: 3,
        max_attempts: 3,
        available: false,
        message: "Failed after 3 attempts: timeout".to_string(),
    });
    set_launcher_nexus_route_snapshot_for_test(NexusRouteSnapshot {
        route_id: LauncherNexusRoute::NexusImages.id().to_string(),
        label: LauncherNexusRoute::NexusImages.label().to_string(),
        endpoint: LauncherNexusRoute::NexusImages.endpoint().to_string(),
        status: NexusRouteStatus::Success,
        attempts: 1,
        max_attempts: 3,
        available: true,
        message: "Connected after 1 attempt.".to_string(),
    });

    set_launcher_nexus_route_snapshot_from_probe_for_test(
        LauncherNexusRoute::PublicGraphql,
        || Ok(()),
        false,
    );

    let diagnostics = snapshot_launcher_nexus_diagnostics_for_test();
    let public_graphql = diagnostics
        .routes
        .iter()
        .find(|route| route.route_id == LauncherNexusRoute::PublicGraphql.id())
        .expect("public GraphQL route should exist");
    let image_route = diagnostics
        .routes
        .iter()
        .find(|route| route.route_id == LauncherNexusRoute::NexusImages.id())
        .expect("image route should exist");

    assert_eq!(public_graphql.status, NexusRouteStatus::Success);
    assert_eq!(public_graphql.attempts, 1);
    assert_eq!(image_route.status, NexusRouteStatus::Success);
    assert_eq!(image_route.message, "Connected after 1 attempt.");
}

#[test]
fn force_offline_override_blocks_all_configured_routes() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None), true);

    let diagnostics = snapshot_launcher_nexus_diagnostics_for_test();
    assert_eq!(diagnostics.routes.len(), 3);
    assert!(diagnostics.routes.iter().all(|route| {
        route.status == NexusRouteStatus::Warning
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

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None), true);

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
    assert_eq!(public_graphql.status, NexusRouteStatus::Warning);
    assert!(!public_graphql.available);
    assert!(public_graphql.message.contains("Forced offline"));
}

#[test]
fn clearing_force_offline_override_unblocks_routes() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");
    reset_launcher_nexus_diagnostics_for_test();

    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None), true);
    set_launcher_nexus_force_offline_with_settings_for_test(&launcher_settings(None), false);

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

    let routes = LauncherNexusRoute::configured_routes(&launcher_settings(None));

    assert_eq!(
        routes,
        vec![
            LauncherNexusRoute::PublicGraphql,
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

    let routes = LauncherNexusRoute::configured_routes(&launcher_settings(Some("nexus-api-key")));

    assert_eq!(
        routes,
        vec![
            LauncherNexusRoute::PublicGraphql,
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
        launcher_nexus_route_for_url("https://api.nexusmods.com/v2/graphql"),
        Some(LauncherNexusRoute::PublicGraphql)
    );
    assert_eq!(
        launcher_nexus_route_for_url(&format!("https://graphql.{}{}", "nexusmods.com", "/")),
        None
    );
    assert_eq!(
        LauncherNexusRoute::PublicGraphql.endpoint(),
        "https://api.nexusmods.com/v2/graphql"
    );
    assert_eq!(
        LauncherNexusRoute::PrivateGraphql.endpoint(),
        "https://api.nexusmods.com/v2/graphql"
    );
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
fn launcher_nexus_success_snapshot_works_with_one_attempt() {
    let _guard = launcher_http_test_guard()
        .lock()
        .expect("launcher http test guard should not be poisoned");

    let snapshot = launcher_nexus_success_snapshot(LauncherNexusRoute::PublicGraphql, 1);

    assert_eq!(snapshot.status, NexusRouteStatus::Success);
    assert!(snapshot.available);
    assert_eq!(snapshot.attempts, 1);
    assert!(snapshot.message.contains("1 attempt"));
}
