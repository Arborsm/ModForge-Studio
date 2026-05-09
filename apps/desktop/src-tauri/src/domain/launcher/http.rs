use super::can_use_nexus_graphql;
use super::paths::launcher_settings_path;
use super::settings::load_or_create_settings_at_path;
use super::shared::extract_graphql_error;
use super::types::{
    LauncherNexusDiagnosticsResult, LauncherNexusRouteSnapshot, LauncherNexusRouteStatus,
    LauncherSettings,
};
use reqwest::blocking::{Client, Response};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, COOKIE, REFERER, USER_AGENT};
use reqwest::{StatusCode, Url};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

pub(crate) const DEFAULT_GAME_ID: i64 = 1303;
pub(crate) const LAUNCHER_USER_AGENT: &str = "ModForge Studio/0.1";
pub(crate) const PUBLIC_BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
pub(crate) const LAUNCHER_APP_NAME: &str = "ModForge Studio";
pub(crate) const LAUNCHER_APP_VERSION: &str = "0.1";
pub(crate) const LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX: &str =
    "CLOUDFLARE_CHALLENGE_REQUIRED:";

const NEXUS_REQUEST_INTERVAL_MS: u64 = 650;
const NEXUS_RETRY_ATTEMPTS: usize = 4;
const LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS: u8 = 3;
const LAUNCHER_NEXUS_DIAGNOSTIC_RETRY_DELAY_MS: u64 = 800;
const LAUNCHER_NEXUS_FORCE_OFFLINE_MESSAGE: &str = "Forced offline by debug override.";
const PUBLIC_GRAPHQL_DIAGNOSTIC_ENDPOINT: &str = "https://api-router.nexusmods.com/graphql";
const PUBLIC_GRAPHQL_DIAGNOSTIC_REFERER: &str = "https://www.nexusmods.com/";
const PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME: &str = "GameModsListing";
const PUBLIC_HTML_DIAGNOSTIC_ENDPOINT: &str = "https://www.nexusmods.com/stardewvalley";
const PRIVATE_GRAPHQL_DIAGNOSTIC_ENDPOINT: &str = "https://graphql.nexusmods.com/";
const NEXUS_API_DIAGNOSTIC_ENDPOINT: &str =
    "https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json";
const NEXUS_IMAGES_DIAGNOSTIC_ENDPOINT: &str = "https://staticdelivery.nexusmods.com/";
const SMAPI_DIAGNOSTIC_ENDPOINT: &str = "https://smapi.io/api/v3.0/mods";
const PRIVATE_GRAPHQL_DIAGNOSTIC_QUERY: &str = r#"
query CatalogMods($filter: ModsFilter, $sort: [ModsSort!], $offset: Int, $count: Int) {
  mods(filter: $filter, sort: $sort, offset: $offset, count: $count) {
    totalCount
  }
}
"#;
const PUBLIC_GRAPHQL_DIAGNOSTIC_QUERY: &str = r#"
query GameModsListing($count: Int = 0, $filter: ModsFilter, $offset: Int, $sort: [ModsSort!]) {
  mods(
    count: $count
    filter: $filter
    offset: $offset
    sort: $sort
    viewUserBlockedContent: false
  ) {
    totalCount
  }
}
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum LauncherNexusRoute {
    PublicGraphql,
    PublicHtml,
    NexusImages,
    Smapi,
    PrivateGraphql,
    NexusApi,
}

impl LauncherNexusRoute {
    pub(crate) fn id(self) -> &'static str {
        match self {
            Self::PublicGraphql => "publicGraphql",
            Self::PublicHtml => "publicHtml",
            Self::NexusImages => "nexusImages",
            Self::Smapi => "smapi",
            Self::PrivateGraphql => "privateGraphql",
            Self::NexusApi => "nexusApi",
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::PublicGraphql => "Nexus Public GraphQL",
            Self::PublicHtml => "Nexus Public HTML",
            Self::NexusImages => "Nexus Image CDN",
            Self::Smapi => "SMAPI",
            Self::PrivateGraphql => "Nexus Private GraphQL",
            Self::NexusApi => "Nexus REST API",
        }
    }

    pub(crate) fn endpoint(self) -> &'static str {
        match self {
            Self::PublicGraphql => PUBLIC_GRAPHQL_DIAGNOSTIC_ENDPOINT,
            Self::PublicHtml => PUBLIC_HTML_DIAGNOSTIC_ENDPOINT,
            Self::NexusImages => NEXUS_IMAGES_DIAGNOSTIC_ENDPOINT,
            Self::Smapi => SMAPI_DIAGNOSTIC_ENDPOINT,
            Self::PrivateGraphql => PRIVATE_GRAPHQL_DIAGNOSTIC_ENDPOINT,
            Self::NexusApi => NEXUS_API_DIAGNOSTIC_ENDPOINT,
        }
    }

    fn configured_routes(settings: &LauncherSettings) -> Vec<Self> {
        let mut routes = vec![Self::PublicGraphql];
        if !settings.disable_public_html_route {
            routes.push(Self::PublicHtml);
        }
        routes.extend([Self::NexusImages, Self::Smapi]);
        if can_use_nexus_graphql(settings) {
            routes.push(Self::PrivateGraphql);
        }
        if has_launcher_nexus_api_key(settings) {
            routes.push(Self::NexusApi);
        }
        routes
    }

    fn from_route_id(route_id: &str) -> Option<Self> {
        match route_id.trim() {
            "publicGraphql" => Some(Self::PublicGraphql),
            "publicHtml" => Some(Self::PublicHtml),
            "nexusImages" => Some(Self::NexusImages),
            "smapi" => Some(Self::Smapi),
            "privateGraphql" => Some(Self::PrivateGraphql),
            "nexusApi" => Some(Self::NexusApi),
            _ => None,
        }
    }
}

fn has_launcher_nexus_api_key(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}

fn launcher_nexus_api_key(settings: &LauncherSettings) -> Result<&str, String> {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Configure a Nexus API key before querying the Nexus REST API.".to_string())
}

#[derive(Debug, Default)]
struct LauncherNexusDiagnosticsState {
    generation: u64,
    started: bool,
    force_offline: bool,
    routes: BTreeMap<LauncherNexusRoute, LauncherNexusRouteSnapshot>,
}

#[derive(Debug)]
struct NexusThrottleState {
    last_request_started_at: Option<Instant>,
}

pub(crate) fn launcher_http_client() -> Result<Client, String> {
    Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to create launcher HTTP client: {error}"))
}

fn nexus_throttle_state() -> &'static Mutex<NexusThrottleState> {
    static STATE: OnceLock<Mutex<NexusThrottleState>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(NexusThrottleState {
            last_request_started_at: None,
        })
    })
}

fn launcher_nexus_diagnostics_state() -> &'static Mutex<LauncherNexusDiagnosticsState> {
    static STATE: OnceLock<Mutex<LauncherNexusDiagnosticsState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(LauncherNexusDiagnosticsState::default()))
}

fn launcher_nexus_route_loading_snapshot(route: LauncherNexusRoute) -> LauncherNexusRouteSnapshot {
    LauncherNexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Loading,
        attempts: 0,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: true,
        message: "loading".to_string(),
        challenge_required: false,
    }
}

fn build_launcher_nexus_route_snapshot_map(
    settings: &LauncherSettings,
) -> BTreeMap<LauncherNexusRoute, LauncherNexusRouteSnapshot> {
    LauncherNexusRoute::configured_routes(settings)
        .into_iter()
        .map(|route| (route, launcher_nexus_route_loading_snapshot(route)))
        .collect()
}

fn launcher_nexus_success_snapshot(
    route: LauncherNexusRoute,
    attempts: u8,
) -> LauncherNexusRouteSnapshot {
    LauncherNexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Success,
        attempts,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: true,
        message: if attempts == 1 {
            "Connected after 1 attempt.".to_string()
        } else {
            format!("Connected after {attempts} attempts.")
        },
        challenge_required: false,
    }
}

fn launcher_nexus_warning_snapshot(
    route: LauncherNexusRoute,
    attempts: u8,
    error: &str,
) -> LauncherNexusRouteSnapshot {
    let challenge_required = is_launcher_cloudflare_challenge_required_error(error);
    LauncherNexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Warning,
        attempts,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: false,
        message: if challenge_required {
            format!(
                "Failed after {attempts} attempts: Cloudflare verification is required before {} requests can continue.",
                route.label()
            )
        } else {
            format!("Failed after {attempts} attempts: {error}")
        },
        challenge_required,
    }
}

fn launcher_nexus_force_offline_snapshot(route: LauncherNexusRoute) -> LauncherNexusRouteSnapshot {
    LauncherNexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: LauncherNexusRouteStatus::Warning,
        attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: false,
        message: LAUNCHER_NEXUS_FORCE_OFFLINE_MESSAGE.to_string(),
        challenge_required: false,
    }
}

fn build_launcher_nexus_force_offline_snapshot_map(
    settings: &LauncherSettings,
) -> BTreeMap<LauncherNexusRoute, LauncherNexusRouteSnapshot> {
    LauncherNexusRoute::configured_routes(settings)
        .into_iter()
        .map(|route| (route, launcher_nexus_force_offline_snapshot(route)))
        .collect()
}

pub(crate) fn probe_launcher_nexus_route_with_runner<F>(
    route: LauncherNexusRoute,
    mut run_attempt: F,
    sleep_between_attempts: bool,
) -> LauncherNexusRouteSnapshot
where
    F: FnMut() -> Result<(), String>,
{
    let mut last_error = "Unknown launcher Nexus diagnostics failure.".to_string();

    for attempt in 1..=LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS {
        match run_attempt() {
            Ok(()) => return launcher_nexus_success_snapshot(route, attempt),
            Err(error) => {
                last_error = error;
                if is_launcher_cloudflare_challenge_required_error(&last_error) {
                    return launcher_nexus_warning_snapshot(route, attempt, &last_error);
                }
                if attempt < LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS {
                    log::warn!(
                        "launcher nexus startup probe failed for {} (attempt {attempt}/{}): {}",
                        route.label(),
                        LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
                        last_error
                    );
                    if sleep_between_attempts {
                        thread::sleep(Duration::from_millis(
                            LAUNCHER_NEXUS_DIAGNOSTIC_RETRY_DELAY_MS,
                        ));
                    }
                }
            }
        }
    }

    launcher_nexus_warning_snapshot(
        route,
        LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        &last_error,
    )
}

fn is_launcher_nexus_route_blocked(route: LauncherNexusRoute) -> bool {
    launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned")
        .routes
        .get(&route)
        .map(|snapshot| snapshot.status == LauncherNexusRouteStatus::Warning && !snapshot.available)
        .unwrap_or(false)
}

fn launcher_nexus_force_offline_active() -> bool {
    launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned")
        .force_offline
}

fn set_launcher_nexus_route_snapshot(snapshot: LauncherNexusRouteSnapshot) {
    let Some(route) = LauncherNexusRoute::from_route_id(&snapshot.route_id) else {
        return;
    };

    launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned")
        .routes
        .insert(route, snapshot);
}

pub(crate) fn probe_blocked_launcher_nexus_route_with_runner<F>(
    route: LauncherNexusRoute,
    run_attempt: F,
    sleep_between_attempts: bool,
) -> Result<(), String>
where
    F: FnMut() -> Result<(), String>,
{
    if launcher_nexus_force_offline_active() {
        return ensure_launcher_nexus_route_available(route);
    }

    if !is_launcher_nexus_route_blocked(route) {
        return Ok(());
    }

    let snapshot =
        probe_launcher_nexus_route_with_runner(route, run_attempt, sleep_between_attempts);
    let recovery_error = if snapshot.status == LauncherNexusRouteStatus::Warning && !snapshot.available
    {
        Some(format!(
            "Launcher Nexus route {} is disabled after startup diagnostics: {}",
            snapshot.label, snapshot.message
        ))
    } else {
        None
    };
    set_launcher_nexus_route_snapshot(snapshot);

    match recovery_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn update_launcher_nexus_route_snapshot_for_generation(
    generation: u64,
    snapshot: LauncherNexusRouteSnapshot,
) {
    let Some(route) = LauncherNexusRoute::from_route_id(&snapshot.route_id) else {
        return;
    };

    let mut state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    if state.generation != generation {
        return;
    }
    state.routes.insert(route, snapshot);
}

fn snapshot_launcher_nexus_diagnostics() -> LauncherNexusDiagnosticsResult {
    let state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    LauncherNexusDiagnosticsResult {
        routes: state.routes.values().cloned().collect(),
    }
}

pub(crate) fn ensure_launcher_nexus_route_available(
    route: LauncherNexusRoute,
) -> Result<(), String> {
    let state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    let Some(snapshot) = state.routes.get(&route) else {
        return Ok(());
    };

    if snapshot.status == LauncherNexusRouteStatus::Warning && !snapshot.available {
        return Err(format!(
            "Launcher Nexus route {} is disabled after startup diagnostics: {}",
            snapshot.label, snapshot.message
        ));
    }

    Ok(())
}

fn launcher_public_html_route_disabled(settings: Option<&LauncherSettings>) -> bool {
    settings
        .map(|value| value.disable_public_html_route)
        .unwrap_or(false)
}

fn ensure_launcher_nexus_route_enabled_in_settings(
    settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> Result<(), String> {
    if route == LauncherNexusRoute::PublicHtml && launcher_public_html_route_disabled(settings) {
        return Err("Launcher Nexus Public HTML route is disabled in launcher settings.".to_string());
    }

    Ok(())
}

fn launcher_connectivity_status_is_acceptable(status: StatusCode) -> bool {
    status.is_success()
        || status.is_redirection()
        || matches!(
            status,
            StatusCode::UNAUTHORIZED
                | StatusCode::FORBIDDEN
                | StatusCode::NOT_FOUND
                | StatusCode::METHOD_NOT_ALLOWED
                | StatusCode::BAD_REQUEST
        )
}

pub(crate) fn launcher_nexus_route_for_url(url: &str) -> Option<LauncherNexusRoute> {
    let url = Url::parse(url.trim()).ok()?;
    let host = url.host_str()?.trim().to_ascii_lowercase();

    match host.as_str() {
        "api-router.nexusmods.com" => Some(LauncherNexusRoute::PublicGraphql),
        "www.nexusmods.com" | "nexusmods.com" => Some(LauncherNexusRoute::PublicHtml),
        "graphql.nexusmods.com" => Some(LauncherNexusRoute::PrivateGraphql),
        "api.nexusmods.com" => Some(LauncherNexusRoute::NexusApi),
        "staticdelivery.nexusmods.com" => Some(LauncherNexusRoute::NexusImages),
        "smapi.io" | "www.smapi.io" => Some(LauncherNexusRoute::Smapi),
        _ => None,
    }
}

fn launcher_nexus_graphql_probe_payload(public_endpoint: bool) -> Value {
    let filter = json!({
        "adultContent": [{ "op": "EQUALS", "value": false }],
        "gameDomainName": [{ "op": "EQUALS", "value": "stardewvalley" }],
    });

    if public_endpoint {
        json!({
            "operationName": PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME,
            "query": PUBLIC_GRAPHQL_DIAGNOSTIC_QUERY,
            "variables": {
                "count": 1,
                "filter": {
                    "adultContent": [{ "op": "EQUALS", "value": false }],
                    "filter": [],
                    "gameDomainName": [{ "op": "EQUALS", "value": "stardewvalley" }],
                    "name": []
                },
                "offset": 0,
                "sort": { "createdAt": { "direction": "DESC" } }
            }
        })
    } else {
        json!({
            "operationName": "CatalogMods",
            "query": PRIVATE_GRAPHQL_DIAGNOSTIC_QUERY,
            "variables": {
                "filter": filter,
                "sort": [{ "createdAt": { "direction": "DESC" } }],
                "offset": 0,
                "count": 1
            }
        })
    }
}

fn validate_launcher_nexus_graphql_probe_response(response: Response) -> Result<(), String> {
    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }

    let payload = response
        .json::<Value>()
        .map_err(|error| format!("error decoding response body: {error}"))?;
    if let Some(error) = extract_graphql_error(&payload) {
        return Err(error);
    }

    Ok(())
}

fn probe_launcher_nexus_public_graphql_route(client: &Client) -> Result<(), String> {
    let headers = public_graphql_headers(
        PUBLIC_GRAPHQL_DIAGNOSTIC_REFERER,
        PUBLIC_GRAPHQL_DIAGNOSTIC_OPERATION_NAME,
    )?;
    let payload = launcher_nexus_graphql_probe_payload(true);
    let response = with_nexus_request_slot(|| {
        client
            .post(PUBLIC_GRAPHQL_DIAGNOSTIC_ENDPOINT)
            .headers(headers)
            .json(&payload)
            .send()
    })
    .map_err(|error| error.to_string())?;

    validate_launcher_nexus_graphql_probe_response(response)
}

fn probe_launcher_nexus_public_html_route(client: &Client) -> Result<(), String> {
    let headers = public_page_headers(Some(PUBLIC_GRAPHQL_DIAGNOSTIC_REFERER))?;
    send_nexus_public_html_request(client, PUBLIC_HTML_DIAGNOSTIC_ENDPOINT, headers).map(|_| ())
}

fn probe_launcher_nexus_images_route(client: &Client) -> Result<(), String> {
    let response = with_nexus_request_slot(|| client.get(NEXUS_IMAGES_DIAGNOSTIC_ENDPOINT).send())
        .map_err(|error| error.to_string())?;
    if !launcher_connectivity_status_is_acceptable(response.status()) {
        return Err(format!("HTTP {}", response.status()));
    }

    Ok(())
}

fn probe_launcher_smapi_route(client: &Client) -> Result<(), String> {
    let response = with_nexus_request_slot(|| {
        client
            .post(SMAPI_DIAGNOSTIC_ENDPOINT)
            .header(CONTENT_TYPE, "application/json")
            .body("{}")
            .send()
    })
    .map_err(|error| error.to_string())?;
    if !launcher_connectivity_status_is_acceptable(response.status()) {
        return Err(format!("HTTP {}", response.status()));
    }

    Ok(())
}

fn probe_launcher_nexus_private_graphql_route(
    client: &Client,
    settings: &LauncherSettings,
) -> Result<(), String> {
    let headers = graphql_headers(
        settings.nexus_api_key.as_deref(),
        settings.nexus_cookie.as_deref(),
    )?;
    let payload = launcher_nexus_graphql_probe_payload(false);
    let response = with_nexus_request_slot(|| {
        client
            .post(PRIVATE_GRAPHQL_DIAGNOSTIC_ENDPOINT)
            .headers(headers)
            .json(&payload)
            .send()
    })
    .map_err(|error| error.to_string())?;

    validate_launcher_nexus_graphql_probe_response(response)
}

fn probe_launcher_nexus_api_route(
    client: &Client,
    settings: &LauncherSettings,
) -> Result<(), String> {
    let headers = api_headers(launcher_nexus_api_key(settings)?)?;
    let response = with_nexus_request_slot(|| {
        client
            .get(NEXUS_API_DIAGNOSTIC_ENDPOINT)
            .headers(headers)
            .send()
    })
    .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    Ok(())
}

fn probe_launcher_nexus_route_once(
    client: &Client,
    settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> Result<(), String> {
    match route {
        LauncherNexusRoute::PublicGraphql => probe_launcher_nexus_public_graphql_route(client),
        LauncherNexusRoute::PublicHtml => probe_launcher_nexus_public_html_route(client),
        LauncherNexusRoute::NexusImages => probe_launcher_nexus_images_route(client),
        LauncherNexusRoute::Smapi => probe_launcher_smapi_route(client),
        LauncherNexusRoute::PrivateGraphql => probe_launcher_nexus_private_graphql_route(
            client,
            settings.ok_or_else(|| {
                "Launcher Nexus private GraphQL reprobe requires configured settings.".to_string()
            })?,
        ),
        LauncherNexusRoute::NexusApi => probe_launcher_nexus_api_route(
            client,
            settings.ok_or_else(|| {
                "Launcher Nexus REST API reprobe requires configured settings.".to_string()
            })?,
        ),
    }
}

pub(crate) fn probe_blocked_launcher_nexus_route(
    client: &Client,
    settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> Result<(), String> {
    ensure_launcher_nexus_route_enabled_in_settings(settings, route)?;

    if is_launcher_nexus_route_blocked(route) {
        probe_blocked_launcher_nexus_route_with_runner(
            route,
            || probe_launcher_nexus_route_once(client, settings, route),
            true,
        )?;
    }

    ensure_launcher_nexus_route_available(route)
}

fn run_launcher_nexus_diagnostics(settings: LauncherSettings, generation: u64) {
    let client = match launcher_http_client() {
        Ok(client) => client,
        Err(error) => {
            for route in LauncherNexusRoute::configured_routes(&settings) {
                update_launcher_nexus_route_snapshot_for_generation(
                    generation,
                    launcher_nexus_warning_snapshot(
                        route,
                        LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
                        &error,
                    ),
                );
            }
            return;
        }
    };

    for route in LauncherNexusRoute::configured_routes(&settings) {
        let snapshot = probe_launcher_nexus_route_with_runner(
            route,
            || probe_launcher_nexus_route_once(&client, Some(&settings), route),
            true,
        );
        update_launcher_nexus_route_snapshot_for_generation(generation, snapshot);
    }
}

fn start_launcher_nexus_diagnostics_with_settings(
    settings: LauncherSettings,
    force_restart: bool,
) {
    let generation = {
        let mut state = launcher_nexus_diagnostics_state()
            .lock()
            .expect("launcher nexus diagnostics mutex should not be poisoned");
        if state.started && !force_restart {
            return;
        }
        if state.force_offline {
            state.generation = state.generation.saturating_add(1);
            state.started = true;
            state.routes = build_launcher_nexus_force_offline_snapshot_map(&settings);
            return;
        }
        state.generation = state.generation.saturating_add(1);
        state.started = true;
        state.routes = build_launcher_nexus_route_snapshot_map(&settings);
        state.generation
    };

    thread::spawn(move || run_launcher_nexus_diagnostics(settings, generation));
}

pub(crate) fn prime_launcher_nexus_diagnostics(_app: &AppHandle) -> Result<(), String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    start_launcher_nexus_diagnostics_with_settings(settings, false);
    Ok(())
}

pub(crate) fn restart_launcher_nexus_diagnostics(settings: &LauncherSettings) {
    start_launcher_nexus_diagnostics_with_settings(settings.clone(), true);
}

pub(crate) fn set_launcher_nexus_force_offline_with_settings(
    settings: &LauncherSettings,
    force_offline: bool,
) -> LauncherNexusDiagnosticsResult {
    let should_restart = {
        let mut state = launcher_nexus_diagnostics_state()
            .lock()
            .expect("launcher nexus diagnostics mutex should not be poisoned");
        if state.force_offline == force_offline {
            if force_offline {
                state.started = true;
                state.routes = build_launcher_nexus_force_offline_snapshot_map(settings);
            }
            return LauncherNexusDiagnosticsResult {
                routes: state.routes.values().cloned().collect(),
            };
        }

        state.force_offline = force_offline;
        if force_offline {
            state.generation = state.generation.saturating_add(1);
            state.started = true;
            state.routes = build_launcher_nexus_force_offline_snapshot_map(settings);
            false
        } else {
            state.started = false;
            state.routes.clear();
            true
        }
    };

    if should_restart {
        start_launcher_nexus_diagnostics_with_settings(settings.clone(), true);
    }

    snapshot_launcher_nexus_diagnostics()
}

pub(crate) fn set_launcher_nexus_force_offline(
    _app: &AppHandle,
    force_offline: bool,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    Ok(set_launcher_nexus_force_offline_with_settings(
        &settings,
        force_offline,
    ))
}

pub(crate) fn load_launcher_nexus_diagnostics(
    app: &AppHandle,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    prime_launcher_nexus_diagnostics(app)?;
    Ok(snapshot_launcher_nexus_diagnostics())
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_app(
    _app: &AppHandle,
) -> Result<LauncherNexusDiagnosticsResult, String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    restart_launcher_nexus_diagnostics(&settings);
    Ok(snapshot_launcher_nexus_diagnostics())
}

#[cfg(test)]
pub(crate) fn reset_launcher_nexus_diagnostics_for_test() {
    let mut state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    *state = LauncherNexusDiagnosticsState::default();
}

#[cfg(test)]
pub(crate) fn snapshot_launcher_nexus_diagnostics_for_test() -> LauncherNexusDiagnosticsResult {
    snapshot_launcher_nexus_diagnostics()
}

#[cfg(test)]
pub(crate) fn set_launcher_nexus_force_offline_with_settings_for_test(
    settings: &LauncherSettings,
    force_offline: bool,
) -> LauncherNexusDiagnosticsResult {
    set_launcher_nexus_force_offline_with_settings(settings, force_offline)
}

#[cfg(test)]
pub(crate) fn set_launcher_nexus_route_snapshot_for_test(
    snapshot: LauncherNexusRouteSnapshot,
) {
    let Some(route) = LauncherNexusRoute::from_route_id(&snapshot.route_id) else {
        return;
    };

    let mut state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    state.started = true;
    state.routes.insert(route, snapshot);
}

fn apply_launcher_headers(headers: &mut HeaderMap) {
    headers.insert(USER_AGENT, HeaderValue::from_static(LAUNCHER_USER_AGENT));
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    headers.insert(
        "Application-Name",
        HeaderValue::from_static(LAUNCHER_APP_NAME),
    );
    headers.insert(
        "Application-Version",
        HeaderValue::from_static(LAUNCHER_APP_VERSION),
    );
}

fn with_nexus_request_slot<T, F>(operation: F) -> T
where
    F: FnOnce() -> T,
{
    let mut state = nexus_throttle_state()
        .lock()
        .expect("launcher nexus throttle mutex should not be poisoned");
    if let Some(previous_started_at) = state.last_request_started_at {
        let elapsed = previous_started_at.elapsed();
        let minimum_interval = Duration::from_millis(NEXUS_REQUEST_INTERVAL_MS);
        if elapsed < minimum_interval {
            thread::sleep(minimum_interval - elapsed);
        }
    }
    state.last_request_started_at = Some(Instant::now());
    operation()
}

fn should_retry_status(status: StatusCode) -> bool {
    status == StatusCode::TOO_MANY_REQUESTS
        || status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::BAD_GATEWAY
        || status == StatusCode::SERVICE_UNAVAILABLE
        || status == StatusCode::GATEWAY_TIMEOUT
        || status.is_server_error()
}

fn retry_delay(response: Option<&Response>, attempt: usize) -> Duration {
    let retry_after = response
        .and_then(|value| value.headers().get("retry-after"))
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    retry_after.unwrap_or_else(|| Duration::from_millis(800 * (1_u64 << attempt.min(5))))
}

pub(crate) fn send_nexus_request<F>(mut send: F) -> Result<Response, String>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut last_error = None;

    for attempt in 0..=NEXUS_RETRY_ATTEMPTS {
        let outcome = with_nexus_request_slot(&mut send);
        match outcome {
            Ok(response)
                if should_retry_status(response.status()) && attempt < NEXUS_RETRY_ATTEMPTS =>
            {
                let delay = retry_delay(Some(&response), attempt);
                log::warn!(
                    "retrying nexus request after HTTP {} in {:?} (attempt {})",
                    response.status(),
                    delay,
                    attempt + 1
                );
                thread::sleep(delay);
            }
            Ok(response) => return Ok(response),
            Err(error) if attempt < NEXUS_RETRY_ATTEMPTS => {
                let delay = retry_delay(None, attempt);
                log::warn!(
                    "retrying nexus request after transport error in {:?} (attempt {}): {}",
                    delay,
                    attempt + 1,
                    error
                );
                thread::sleep(delay);
                last_error = Some(error.to_string());
            }
            Err(error) => {
                last_error = Some(error.to_string());
                break;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Nexus request failed without an error message.".to_string()))
}

fn launcher_public_html_accelerated_client(ip: IpAddr) -> Result<Client, String> {
    let addr = SocketAddr::new(ip, 0);
    Client::builder()
        .cookie_store(true)
        .timeout(Duration::from_secs(30))
        .resolve("www.nexusmods.com", addr)
        .resolve("nexusmods.com", addr)
        .build()
        .map_err(|error| {
            format!("Failed to create launcher accelerated Nexus HTML client: {error}")
        })
}

#[derive(Debug, Clone)]
pub(crate) struct NexusPublicHtmlDocument {
    pub(crate) status: StatusCode,
    pub(crate) body: String,
}

pub(crate) fn launcher_cloudflare_challenge_required_error(url: &str) -> String {
    format!("{LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX}{url}")
}

pub(crate) fn is_launcher_cloudflare_challenge_required_error(error: &str) -> bool {
    error
        .trim()
        .starts_with(LAUNCHER_CLOUDFLARE_CHALLENGE_REQUIRED_PREFIX)
}

pub(crate) fn nexus_public_html_response_requires_accelerated_fallback(body: &str) -> bool {
    let normalized = body.trim().to_ascii_lowercase();
    normalized.contains("just a moment")
        || normalized.contains("enable javascript and cookies to continue")
        || normalized.contains("_cf_chl_opt")
        || normalized.contains("challenge-platform")
}

fn send_nexus_public_html_document<F>(send: F) -> Result<NexusPublicHtmlDocument, String>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut request_send = send;
    let mut status = StatusCode::OK;
    let body = read_nexus_response_body_with_retry(|| {
        let response = send_nexus_request(&mut request_send)?;
        status = response.status();
        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| format!("error decoding response body: {error}"))
    })?;

    Ok(NexusPublicHtmlDocument {
        status,
        body: String::from_utf8_lossy(&body).to_string(),
    })
}

pub(crate) fn send_nexus_public_html_request(
    client: &Client,
    url: &str,
    headers: HeaderMap,
) -> Result<NexusPublicHtmlDocument, String> {
    run_public_html_with_accelerated_fallback(
        || {
            let document = send_nexus_public_html_document(|| {
                client.get(url).headers(headers.clone()).send()
            })?;
            if nexus_public_html_response_requires_accelerated_fallback(&document.body) {
                return Err(launcher_cloudflare_challenge_required_error(url));
            }
            if !document.status.is_success() {
                return Err(format!("HTTP {}", document.status));
            }

            Ok(document)
        },
        super::accelerater::resolve_accelerater_nexus_accelerated_ip,
        |ip| {
            let accelerated_client = launcher_public_html_accelerated_client(ip)?;
            let document = send_nexus_public_html_document(|| {
                accelerated_client
                    .get(url)
                    .headers(headers.clone())
                    .send()
            })?;
            if nexus_public_html_response_requires_accelerated_fallback(&document.body) {
                return Err(launcher_cloudflare_challenge_required_error(url));
            }
            if !document.status.is_success() {
                return Err(format!("HTTP {}", document.status));
            }

            Ok(document)
        },
    )
}

pub(crate) fn run_public_html_with_accelerated_fallback<T, P, R, A>(
    mut send_primary: P,
    mut resolve_accelerated_ip: R,
    mut send_accelerated: A,
) -> Result<T, String>
where
    P: FnMut() -> Result<T, String>,
    R: FnMut() -> Result<IpAddr, String>,
    A: FnMut(IpAddr) -> Result<T, String>,
{
    let primary_error = match send_primary() {
        Ok(response) => return Ok(response),
        Err(error) => error,
    };

    if is_launcher_cloudflare_challenge_required_error(&primary_error) {
        return Err(primary_error);
    }

    log::warn!(
        "launcher Nexus Public HTML request failed, retrying through Accelerater accelerated IP: {primary_error}"
    );
    let ip = resolve_accelerated_ip().map_err(|fallback_error| {
        format!(
            "{primary_error}; Accelerater accelerated fallback could not resolve an IP: {fallback_error}"
        )
    })?;
    send_accelerated(ip).map_err(|fallback_error| {
        if is_launcher_cloudflare_challenge_required_error(&fallback_error) {
            fallback_error
        } else {
            format!(
                "{primary_error}; Accelerater accelerated fallback through {ip} failed: {fallback_error}"
            )
        }
    })
}

fn read_nexus_response_body_with_retry<F>(mut read_body: F) -> Result<Vec<u8>, String>
where
    F: FnMut() -> Result<Vec<u8>, String>,
{
    let mut last_error = None;

    for attempt in 0..=NEXUS_RETRY_ATTEMPTS {
        match read_body() {
            Ok(body) => return Ok(body),
            Err(error)
                if attempt < NEXUS_RETRY_ATTEMPTS
                    && should_retry_body_read_error(&error) =>
            {
                let delay = retry_delay(None, attempt);
                log::warn!(
                    "retrying nexus request after body read error in {:?} (attempt {}): {}",
                    delay,
                    attempt + 1,
                    error
                );
                thread::sleep(delay);
                last_error = Some(error);
            }
            Err(error) => {
                last_error = Some(error);
                break;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Nexus response body read failed without an error message.".to_string()))
}

fn should_retry_body_read_error(error: &str) -> bool {
    let normalized = error.trim().to_ascii_lowercase();
    normalized.contains("error decoding response body")
        || normalized.contains("unexpected eof")
        || normalized.contains("connection reset")
        || normalized.contains("channel closed")
}

pub(crate) fn send_nexus_json_request<F>(send: F) -> Result<(StatusCode, Value), String>
where
    F: FnMut() -> Result<Response, reqwest::Error>,
{
    let mut send = send;
    let mut status = StatusCode::OK;
    let body = read_nexus_response_body_with_retry(|| {
        let response = send_nexus_request(&mut send)?;
        status = response.status();
        if !status.is_success() {
            return Ok(Vec::new());
        }

        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| error.to_string())
    })?;
    if !status.is_success() {
        return Ok((status, Value::Null));
    }

    let payload = serde_json::from_slice::<Value>(&body).map_err(|error| error.to_string())?;
    Ok((status, payload))
}

pub(crate) fn api_headers(api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);
    headers.insert(
        "apikey",
        HeaderValue::from_str(api_key)
            .map_err(|error| format!("Failed to encode launcher Nexus API key header: {error}"))?,
    );
    Ok(headers)
}

pub(crate) fn graphql_headers(
    api_key: Option<&str>,
    cookie: Option<&str>,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    apply_launcher_headers(&mut headers);

    if let Some(api_key) = api_key.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            "apikey",
            HeaderValue::from_str(api_key).map_err(|error| {
                format!("Failed to encode launcher Nexus GraphQL API key header: {error}")
            })?,
        );
    }

    if let Some(cookie) = cookie.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            COOKIE,
            HeaderValue::from_str(cookie).map_err(|error| {
                format!("Failed to encode launcher Nexus cookie header: {error}")
            })?,
        );
    }

    if !headers.contains_key("apikey") && !headers.contains_key(COOKIE) {
        return Err("Configure a Nexus API key or cookie before querying Nexus Mods.".to_string());
    }

    Ok(headers)
}

pub(crate) fn public_page_headers(referer: Option<&str>) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(PUBLIC_BROWSER_USER_AGENT),
    );
    headers.insert(
        ACCEPT,
        HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        ),
    );
    headers.insert(
        "Accept-Language",
        HeaderValue::from_static("zh-CN,zh;q=0.9"),
    );
    headers.insert("Priority", HeaderValue::from_static("u=0, i"));
    headers.insert(
        "sec-ch-ua",
        HeaderValue::from_static(
            r#""Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99""#,
        ),
    );
    headers.insert("sec-ch-ua-mobile", HeaderValue::from_static("?0"));
    headers.insert(
        "sec-ch-ua-platform",
        HeaderValue::from_static(r#""Windows""#),
    );
    headers.insert("sec-fetch-dest", HeaderValue::from_static("document"));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("navigate"));
    headers.insert("sec-fetch-site", HeaderValue::from_static("none"));
    headers.insert("sec-fetch-user", HeaderValue::from_static("?1"));
    headers.insert("Upgrade-Insecure-Requests", HeaderValue::from_static("1"));
    if let Some(referer) = referer.map(str::trim).filter(|value| !value.is_empty()) {
        headers.insert(
            REFERER,
            HeaderValue::from_str(referer).map_err(|error| {
                format!("Failed to encode launcher public page referer header: {error}")
            })?,
        );
    }
    Ok(headers)
}

pub(crate) fn public_graphql_headers(
    referer: &str,
    operation_name: &str,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        USER_AGENT,
        HeaderValue::from_static(PUBLIC_BROWSER_USER_AGENT),
    );
    headers.insert(ACCEPT, HeaderValue::from_static("*/*"));
    headers.insert(
        "Accept-Language",
        HeaderValue::from_static("zh-CN,zh;q=0.9"),
    );
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert("Priority", HeaderValue::from_static("u=1, i"));
    headers.insert(
        "sec-ch-ua",
        HeaderValue::from_static(
            r#""Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99""#,
        ),
    );
    headers.insert("sec-ch-ua-mobile", HeaderValue::from_static("?0"));
    headers.insert(
        "sec-ch-ua-platform",
        HeaderValue::from_static(r#""Windows""#),
    );
    headers.insert("sec-fetch-dest", HeaderValue::from_static("empty"));
    headers.insert("sec-fetch-mode", HeaderValue::from_static("cors"));
    headers.insert("sec-fetch-site", HeaderValue::from_static("same-site"));
    headers.insert(
        "Origin",
        HeaderValue::from_static("https://www.nexusmods.com"),
    );
    headers.insert(
        REFERER,
        HeaderValue::from_str(referer).map_err(|error| {
            format!("Failed to encode launcher public GraphQL referer header: {error}")
        })?,
    );
    headers.insert(
        "x-graphql-operationname",
        HeaderValue::from_str(operation_name).map_err(|error| {
            format!("Failed to encode launcher public GraphQL operation header: {error}")
        })?,
    );
    Ok(headers)
}

#[cfg(test)]
#[path = "../../tests/launcher_http_tests.rs"]
mod launcher_http_tests;
