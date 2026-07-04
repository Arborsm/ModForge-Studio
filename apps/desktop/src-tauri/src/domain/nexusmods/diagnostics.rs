use super::http::launcher_http_client;
use super::probes::probe_launcher_nexus_route_once;
use super::routes::LauncherNexusRoute;
use super::types::{NexusDiagnosticsResult, NexusRouteSnapshot, NexusRouteStatus};
use crate::AppHandle;
use crate::domain::launcher::paths::launcher_settings_path;
use crate::domain::launcher::settings::load_or_create_settings_at_path;
use crate::domain::launcher::types::LauncherSettings;
use anyhow::{Context, bail};
use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};
use std::thread;

const LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS: u8 = 3;
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
    previous_routes: &BTreeMap<LauncherNexusRoute, NexusRouteSnapshot>,
) -> BTreeMap<LauncherNexusRoute, NexusRouteSnapshot> {
    LauncherNexusRoute::configured_routes(settings)
        .into_iter()
        .map(|route| {
            (
                route,
                launcher_nexus_loading_snapshot_with_previous(route, previous_routes.get(&route)),
            )
        })
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
    let blocked = attempts >= LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS;
    NexusRouteSnapshot {
        route_id: route.id().to_string(),
        label: route.label().to_string(),
        endpoint: route.endpoint().to_string(),
        status: NexusRouteStatus::Warning,
        attempts,
        max_attempts: LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
        available: !blocked,
        message: format!(
            "Failed after {attempts} attempt{}: {error}",
            if attempts == 1 { "" } else { "s" }
        ),
    }
}

fn launcher_nexus_warning_error_from_message(message: &str) -> &str {
    message
        .split_once(": ")
        .map(|(_, error)| error)
        .unwrap_or(message)
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
    _sleep_between_attempts: bool,
) -> NexusRouteSnapshot
where
    F: FnMut() -> anyhow::Result<()>,
{
    match run_attempt() {
        Ok(()) => launcher_nexus_success_snapshot(route, 1),
        Err(error) => launcher_nexus_warning_snapshot(route, 1, &error.to_string()),
    }
}

fn accumulate_launcher_nexus_route_snapshot(
    previous: Option<&NexusRouteSnapshot>,
    route: LauncherNexusRoute,
    snapshot: NexusRouteSnapshot,
) -> NexusRouteSnapshot {
    if snapshot.status != NexusRouteStatus::Warning {
        return snapshot;
    }

    let attempts = previous_failure_attempts(previous)
        .saturating_add(1)
        .min(LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS);
    launcher_nexus_warning_snapshot(
        route,
        attempts,
        launcher_nexus_warning_error_from_message(&snapshot.message),
    )
}

fn launcher_nexus_loading_snapshot_with_previous(
    route: LauncherNexusRoute,
    previous: Option<&NexusRouteSnapshot>,
) -> NexusRouteSnapshot {
    let mut snapshot = launcher_nexus_route_loading_snapshot(route);
    if previous.is_some_and(|value| value.status == NexusRouteStatus::Warning) {
        snapshot.attempts = previous.map(|value| value.attempts).unwrap_or(0);
    }
    snapshot
}

fn previous_failure_attempts(previous: Option<&NexusRouteSnapshot>) -> u8 {
    previous
        .filter(|value| {
            matches!(
                value.status,
                NexusRouteStatus::Warning | NexusRouteStatus::Loading
            )
        })
        .map(|value| value.attempts)
        .unwrap_or(0)
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

fn set_launcher_nexus_route_snapshot(snapshot: NexusRouteSnapshot) -> Option<NexusRouteSnapshot> {
    let Some(route) = LauncherNexusRoute::from_route_id(&snapshot.route_id) else {
        return None;
    };

    let mut state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    let snapshot =
        accumulate_launcher_nexus_route_snapshot(state.routes.get(&route), route, snapshot);
    let stored = snapshot.clone();
    state.routes.insert(route, snapshot);
    Some(stored)
}

pub(crate) fn probe_blocked_launcher_nexus_route_with_runner<F>(
    route: LauncherNexusRoute,
    run_attempt: F,
    sleep_between_attempts: bool,
) -> anyhow::Result<()>
where
    F: FnMut() -> anyhow::Result<()>,
{
    if launcher_nexus_force_offline_active() {
        return ensure_launcher_nexus_route_available(route);
    }

    if !is_launcher_nexus_route_blocked(route) {
        return Ok(());
    }

    let snapshot =
        probe_launcher_nexus_route_with_runner(route, run_attempt, sleep_between_attempts);
    let snapshot = set_launcher_nexus_route_snapshot(snapshot).unwrap_or_else(|| {
        launcher_nexus_warning_snapshot(
            route,
            LAUNCHER_NEXUS_DIAGNOSTIC_MAX_ATTEMPTS,
            "Unknown launcher Nexus diagnostics failure.",
        )
    });
    let recovery_error = if snapshot.status == NexusRouteStatus::Warning && !snapshot.available {
        Some(format!(
            "Launcher Nexus route {} is disabled after startup diagnostics: {}",
            snapshot.label, snapshot.message
        ))
    } else {
        None
    };

    match recovery_error {
        Some(error) => Err(anyhow::anyhow!(error)),
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
    let snapshot =
        accumulate_launcher_nexus_route_snapshot(state.routes.get(&route), route, snapshot);
    state.routes.insert(route, snapshot);
}

fn retry_launcher_nexus_route_with_settings(
    _app: Option<&AppHandle>,
    settings: &LauncherSettings,
    route: LauncherNexusRoute,
) -> anyhow::Result<NexusDiagnosticsResult> {
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
) -> anyhow::Result<()> {
    let state = launcher_nexus_diagnostics_state()
        .lock()
        .expect("launcher nexus diagnostics mutex should not be poisoned");
    let Some(snapshot) = state.routes.get(&route) else {
        return Ok(());
    };

    if snapshot.status == NexusRouteStatus::Warning && !snapshot.available {
        bail!(
            "Launcher Nexus route {} is disabled after startup diagnostics: {}",
            snapshot.label,
            snapshot.message
        );
    }

    Ok(())
}

fn ensure_launcher_nexus_route_enabled_in_settings(
    _settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> anyhow::Result<()> {
    let _ = route;
    Ok(())
}

pub(crate) fn probe_blocked_launcher_nexus_route(
    client: &reqwest::blocking::Client,
    settings: Option<&LauncherSettings>,
    route: LauncherNexusRoute,
) -> anyhow::Result<()> {
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
                        &error.to_string(),
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
    let nexus_api_key_present = settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some();
    let generation = {
        let mut state = launcher_nexus_diagnostics_state()
            .lock()
            .expect("launcher nexus diagnostics mutex should not be poisoned");
        if state.started && !force_restart {
            log::debug!(
                target: "Nexus",
                "Diagnostics already started: generation={} api-key-present={}",
                state.generation,
                nexus_api_key_present
            );
            return;
        }
        if state.force_offline {
            state.generation = state.generation.saturating_add(1);
            state.started = true;
            state.routes = build_launcher_nexus_force_offline_snapshot_map(&settings);
            log::info!(
                target: "Nexus",
                "Using force-offline diagnostics snapshot: generation={} api-key-present={}",
                state.generation,
                nexus_api_key_present
            );
            return;
        }
        state.generation = state.generation.saturating_add(1);
        state.started = true;
        let previous_routes = state.routes.clone();
        state.routes = build_launcher_nexus_route_snapshot_map(&settings, &previous_routes);
        state.generation
    };

    log::info!(
        target: "Nexus",
        "Start diagnostics: generation={generation} force-restart={force_restart} api-key-present={nexus_api_key_present}"
    );
    thread::spawn(move || run_launcher_nexus_diagnostics(settings, generation, app));
}

pub(crate) fn prime_launcher_nexus_diagnostics(_app: &AppHandle) -> anyhow::Result<()> {
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
) -> anyhow::Result<NexusDiagnosticsResult> {
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    Ok(set_launcher_nexus_force_offline_with_settings(
        &settings,
        force_offline,
    ))
}

pub(crate) fn load_launcher_nexus_diagnostics(
    app: &AppHandle,
) -> anyhow::Result<NexusDiagnosticsResult> {
    prime_launcher_nexus_diagnostics(app)?;
    Ok(snapshot_launcher_nexus_diagnostics())
}

pub(crate) fn retry_launcher_nexus_diagnostics_route(
    app: &AppHandle,
    route_id: String,
) -> anyhow::Result<NexusDiagnosticsResult> {
    let route = LauncherNexusRoute::from_route_id(&route_id)
        .with_context(|| format!("Unknown launcher Nexus diagnostics route: {route_id}"))?;
    let settings_path = launcher_settings_path()?;
    let settings = load_or_create_settings_at_path(&settings_path)?;
    retry_launcher_nexus_route_with_settings(Some(app), &settings, route)
}

pub(crate) fn restart_launcher_nexus_diagnostics_with_app(
    _app: &AppHandle,
) -> anyhow::Result<NexusDiagnosticsResult> {
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
    F: FnMut() -> anyhow::Result<()>,
{
    let snapshot =
        probe_launcher_nexus_route_with_runner(route, run_attempt, sleep_between_attempts);
    set_launcher_nexus_route_snapshot(snapshot);
}
