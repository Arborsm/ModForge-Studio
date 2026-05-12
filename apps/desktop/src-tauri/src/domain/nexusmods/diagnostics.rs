use super::http::launcher_http_client;
use super::probes::probe_launcher_nexus_route_once;
use super::routes::LauncherNexusRoute;
use super::types::{NexusDiagnosticsResult, NexusRouteSnapshot, NexusRouteStatus};
use crate::domain::launcher::paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::LauncherSettings;
use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

const LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS: u8 = 3;
const LAUNCHER_NEXUS_DIAGNOSTIC_RETRY_DELAY_MS: u64 = 800;
const LAUNCHER_NEXUS_FORCE_OFFLINE_MESSAGE: &str = "Forced offline by debug override.";

#[derive(Debug, Default)]
struct LauncherNexusDiagnosticsState {
    generation: u64,
    started: bool,
    force_offline: bool,
    routes: BTreeMap<LauncherNexusRoute, NexusRouteSnapshot>,
}

fn launcher_nexus_diagnostics_state() -> &'static Mutex<LauncherNexusDiagnosticsState> {
    static STATE: OnceLock<Mutex<LauncherNexusDiagnosticsState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(LauncherNexusDiagnosticsState::default()))
}

fn launcher_nexus_route_loading_snapshot(route: LauncherNexusRoute) -> NexusRouteSnapshot {
    NexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: NexusRouteStatus::Loading,
        attempts: 0,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: true,
        message: "loading".to_string(),
    }
}

fn build_launcher_nexus_route_snapshot_map(
    settings: &LauncherSettings,
) -> BTreeMap<LauncherNexusRoute, NexusRouteSnapshot> {
    LauncherNexusRoute::configured_routes(settings)
        .into_iter()
        .map(|route| (route, launcher_nexus_route_loading_snapshot(route)))
        .collect()
}

pub(crate) fn launcher_nexus_success_snapshot(
    route: LauncherNexusRoute,
    attempts: u8,
) -> NexusRouteSnapshot {
    NexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: NexusRouteStatus::Success,
        attempts,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: true,
        message: if attempts == 1 {
            "Connected after 1 attempt.".to_string()
        } else {
            format!("Connected after {attempts} attempts.")
        },
    }
}

fn launcher_nexus_warning_snapshot(
    route: LauncherNexusRoute,
    attempts: u8,
    error: &str,
) -> NexusRouteSnapshot {
    NexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
        attempts,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: false,
        message: format!("Failed after {attempts} attempts: {error}"),
    }
}

fn launcher_nexus_force_offline_snapshot(route: LauncherNexusRoute) -> NexusRouteSnapshot {
    NexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
        attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: false,
        message: LAUNCHER_NEXUS_FORCE_OFFLINE_MESSAGE.to_string(),
    }
}

fn build_launcher_nexus_force_offline_snapshot_map(
    settings: &LauncherSettings,
) -> BTreeMap<LauncherNexusRoute, NexusRouteSnapshot> {
    LauncherNexusRoute::configured_routes(settings)
        .into_iter()
        .map(|route| (route, launcher_nexus_force_offline_snapshot(route)))
        .collect()
}

pub(crate) fn probe_launcher_nexus_route_with_runner<F>(
    route: LauncherNexusRoute,
    mut run_attempt: F,
    sleep_between_attempts: bool,
) -> NexusRouteSnapshot
where
    F: FnMut() -> Result<(), String>,
{
    let mut last_error = "Unknown launcher Nexus diagnostics failure.".to_string();

    for attempt in 1..=LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS {
        match run_attempt() {
            Ok(()) => return launcher_nexus_success_snapshot(route, attempt),
            Err(error) => {
                last_error = error;
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

    launcher_nexus_warning_snapshot(route, LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS, &last_error)
}

fn is_launcher_nexus_route_blocked(route: LauncherNexusRoute) -> bool {
    launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned")
        .routes
        .get(&route)
        .map(|snapshot| snapshot.status == NexusRouteStatus::Warning && !snapshot.available)
        .unwrap_or(false)
}

fn launcher_nexus_force_offline_active() -> bool {
    launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned")
        .force_offline
}

fn set_launcher_nexus_route_snapshot(snapshot: NexusRouteSnapshot) {
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
    let recovery_error = if snapshot.status == NexusRouteStatus::Warning && !snapshot.available {
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
    snapshot: NexusRouteSnapshot,
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

fn retry_launcher_nexus_route_with_settings(
    _app: Option<&AppHandle>,
    settings: &LauncherSettings,
    route: LauncherNexusRoute,
) -> Result<NexusDiagnosticsResult, String> {
    ensure_launcher_nexus_route_enabled_in_settings(Some(settings), route)?;

    if launcher_nexus_force_offline_active() {
        ensure_launcher_nexus_route_available(route)?;
        return Ok(snapshot_launcher_nexus_diagnostics());
    }

    let client = launcher_http_client()?;
    let snapshot = probe_launcher_nexus_route_with_runner(
        route,
        || probe_launcher_nexus_route_once(&client, Some(settings), route),
        true,
    );

    set_launcher_nexus_route_snapshot(snapshot);

    Ok(snapshot_launcher_nexus_diagnostics())
}

fn snapshot_launcher_nexus_diagnostics() -> NexusDiagnosticsResult {
    let state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    NexusDiagnosticsResult {
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

    if snapshot.status == NexusRouteStatus::Warning && !snapshot.available {
        return Err(format!(
            "Launcher Nexus route {} is disabled after startup diagnostics: {}",
            snapshot.label, snapshot.message
        ));
    }

    Ok(())
}

fn ensure_launcher_nexus_route_enabled_in_settings(
    _settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> Result<(), String> {
    let _ = route;
    Ok(())
}

pub(crate) fn probe_blocked_launcher_nexus_route(
    client: &reqwest::blocking::Client,
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

fn run_launcher_nexus_diagnostics(
    settings: LauncherSettings,
    generation: u64,
    _app: Option<AppHandle>,
) {
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
    app: Option<AppHandle>,
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

    thread::spawn(move || run_launcher_nexus_diagnostics(settings, generation, app));
}

pub(crate) fn prime_launcher_nexus_diagnostics(_app: &AppHandle) -> Result<(), String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    start_launcher_nexus_diagnostics_with_settings(settings, false, Some(_app.clone()));
    Ok(())
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_handle(
    app: Option<&AppHandle>,
    settings: &LauncherSettings,
) {
    start_launcher_nexus_diagnostics_with_settings(settings.clone(), true, app.cloned());
}

pub(crate) fn set_launcher_nexus_force_offline_with_settings(
    settings: &LauncherSettings,
    force_offline: bool,
) -> NexusDiagnosticsResult {
    let should_restart = {
        let mut state = launcher_nexus_diagnostics_state()
            .lock()
            .expect("launcher nexus diagnostics mutex should not be poisoned");
        if state.force_offline == force_offline {
            if force_offline {
                state.started = true;
                state.routes = build_launcher_nexus_force_offline_snapshot_map(settings);
            }
            return NexusDiagnosticsResult {
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
        start_launcher_nexus_diagnostics_with_settings(settings.clone(), true, None);
    }

    snapshot_launcher_nexus_diagnostics()
}

pub(crate) fn set_launcher_nexus_force_offline(
    _app: &AppHandle,
    force_offline: bool,
) -> Result<NexusDiagnosticsResult, String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    Ok(set_launcher_nexus_force_offline_with_settings(
        &settings,
        force_offline,
    ))
}

pub(crate) fn load_launcher_nexus_diagnostics(
    app: &AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    prime_launcher_nexus_diagnostics(app)?;
    Ok(snapshot_launcher_nexus_diagnostics())
}

pub(crate) fn retry_launcher_nexus_diagnostics_route(
    app: &AppHandle,
    route_id: String,
) -> Result<NexusDiagnosticsResult, String> {
    let route = LauncherNexusRoute::from_route_id(&route_id)
        .ok_or_else(|| format!("Unknown launcher Nexus diagnostics route: {route_id}"))?;
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    retry_launcher_nexus_route_with_settings(Some(app), &settings, route)
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_app(
    _app: &AppHandle,
) -> Result<NexusDiagnosticsResult, String> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    restart_launcher_nexus_diagnostics_with_handle(Some(_app), &settings);
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
pub(crate) fn snapshot_launcher_nexus_diagnostics_for_test() -> NexusDiagnosticsResult {
    snapshot_launcher_nexus_diagnostics()
}

#[cfg(test)]
pub(crate) fn set_launcher_nexus_force_offline_with_settings_for_test(
    settings: &LauncherSettings,
    force_offline: bool,
) -> NexusDiagnosticsResult {
    set_launcher_nexus_force_offline_with_settings(settings, force_offline)
}

#[cfg(test)]
pub(crate) fn set_launcher_nexus_route_snapshot_for_test(snapshot: NexusRouteSnapshot) {
    let Some(route) = LauncherNexusRoute::from_route_id(&snapshot.route_id) else {
        return;
    };

    let mut state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    state.started = true;
    state.routes.insert(route, snapshot);
}

#[cfg(test)]
pub(crate) fn set_launcher_nexus_route_snapshot_from_probe_for_test<F>(
    route: LauncherNexusRoute,
    run_attempt: F,
    sleep_between_attempts: bool,
) where
    F: FnMut() -> Result<(), String>,
{
    let snapshot =
        probe_launcher_nexus_route_with_runner(route, run_attempt, sleep_between_attempts);
    set_launcher_nexus_route_snapshot(snapshot);
}
