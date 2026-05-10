use super::http::PUBLIC_BROWSER_USER_AGENT;
use super::paths::launcher_settings_path;
use super::settings::{load_or_create_settings_at_path, save_settings_at_path};
use super::types::{
    PublicHtmlVerificationEventPayload, PublicHtmlVerificationReason,
    PublicHtmlVerificationSnapshot, PublicHtmlVerificationStage,
};
use crate::infrastructure::webview::split_pane as webview_runtime;
use crate::infrastructure::webview::split_pane::{SplitPaneWebviewConfig, SplitPaneWebviewLabels};
use reqwest::Url;
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

const VERIFICATION_EVENT_NAME: &str = "launcher://public-html-verify-state";
const VERIFICATION_POLL_INTERVAL_MS: u64 = 200;
const VERIFICATION_WAIT_LOG_INTERVAL_SECS: u64 = 5;
const VERIFICATION_TIMEOUT_SECS: u64 = 300;
const DEFAULT_BROWSER_VERIFICATION_URL: &str = "https://www.nexusmods.com/stardewvalley";
const VERIFICATION_WINDOW_LABEL: &str = "public-html-verification";
const VERIFICATION_CONTROLS_WEBVIEW_LABEL: &str = "public-html-verification-controls";
const VERIFICATION_BROWSER_WEBVIEW_LABEL: &str = "public-html-verification-browser";
const WEBVIEW_DATA_DIR_NAME: &str = "public-html-verification-browser";

fn verification_window_config() -> SplitPaneWebviewConfig {
    SplitPaneWebviewConfig {
        labels: SplitPaneWebviewLabels {
            window: VERIFICATION_WINDOW_LABEL,
            controls: VERIFICATION_CONTROLS_WEBVIEW_LABEL,
            content: VERIFICATION_BROWSER_WEBVIEW_LABEL,
        },
        title: "Public HTML Verification",
        content_data_dir_name: WEBVIEW_DATA_DIR_NAME,
        content_user_agent: Some(PUBLIC_BROWSER_USER_AGENT),
        initial_width: 1120.0,
        initial_height: 860.0,
        min_width: 960.0,
        min_height: 720.0,
        controls_width: 300,
    }
}

struct VerificationManager {
    session_id: u64,
    stage: PublicHtmlVerificationStage,
    reason: Option<PublicHtmlVerificationReason>,
    url: Option<String>,
    message: Option<String>,
    result_cookie: Option<String>,
    disable_public_html_route: bool,
    last_verified_at_ms: Option<u128>,
}

impl VerificationManager {
    fn new() -> Self {
        Self {
            session_id: 0,
            stage: PublicHtmlVerificationStage::Idle,
            reason: None,
            url: None,
            message: None,
            result_cookie: None,
            disable_public_html_route: false,
            last_verified_at_ms: None,
        }
    }

    fn snapshot(&self) -> PublicHtmlVerificationSnapshot {
        PublicHtmlVerificationSnapshot {
            stage: self.stage,
            reason: self.reason,
            url: self.url.clone(),
            message: self.message.clone(),
            disable_public_html_route: self.disable_public_html_route,
            last_verified_at_ms: self.last_verified_at_ms,
        }
    }

    fn event_payload(&self) -> PublicHtmlVerificationEventPayload {
        PublicHtmlVerificationEventPayload {
            stage: self.stage,
            reason: self.reason,
            url: self.url.clone(),
            message: self.message.clone(),
            disable_public_html_route: self.disable_public_html_route,
            last_verified_at_ms: self.last_verified_at_ms,
        }
    }

    fn reset_session(&mut self) {
        self.session_id = self.session_id.saturating_add(1);
        self.stage = PublicHtmlVerificationStage::Idle;
        self.reason = None;
        self.url = None;
        self.message = None;
        self.result_cookie = None;
    }
}

fn verification_manager() -> &'static Mutex<VerificationManager> {
    static MANAGER: OnceLock<Mutex<VerificationManager>> = OnceLock::new();
    MANAGER.get_or_init(|| Mutex::new(VerificationManager::new()))
}

fn verification_condvar() -> &'static Condvar {
    static CV: OnceLock<Condvar> = OnceLock::new();
    CV.get_or_init(Condvar::new)
}

fn verification_sync_mutex() -> &'static Mutex<Option<u64>> {
    static SYNC: OnceLock<Mutex<Option<u64>>> = OnceLock::new();
    SYNC.get_or_init(|| Mutex::new(None))
}

struct VerificationSyncGuard {
    session_id: u64,
}

impl Drop for VerificationSyncGuard {
    fn drop(&mut self) {
        let mut running = verification_sync_mutex()
            .lock()
            .expect("verification sync mutex should not be poisoned");
        if *running == Some(self.session_id) {
            *running = None;
        }
    }
}

fn try_begin_verification_sync(session_id: u64) -> Option<VerificationSyncGuard> {
    let mut running = verification_sync_mutex()
        .lock()
        .expect("verification sync mutex should not be poisoned");
    if running.is_some() {
        return None;
    }
    *running = Some(session_id);
    Some(VerificationSyncGuard { session_id })
}

fn verification_sync_running_session() -> Option<u64> {
    *verification_sync_mutex()
        .lock()
        .expect("verification sync mutex should not be poisoned")
}

fn clear_verification_sync_if_session(session_id: u64) {
    let mut running = verification_sync_mutex()
        .lock()
        .expect("verification sync mutex should not be poisoned");
    if *running == Some(session_id) {
        *running = None;
    }
}

fn clear_verification_sync() {
    let mut running = verification_sync_mutex()
        .lock()
        .expect("verification sync mutex should not be poisoned");
    *running = None;
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn emit_snapshot(app: Option<&AppHandle>, snapshot: &PublicHtmlVerificationSnapshot) {
    log::info!(
        "launcher Public HTML verification snapshot stage={:?} reason={:?} url={:?} disabled={} message={:?}",
        snapshot.stage,
        snapshot.reason,
        snapshot.url,
        snapshot.disable_public_html_route,
        snapshot.message
    );
    let Some(app) = app else {
        return;
    };

    let payload = PublicHtmlVerificationEventPayload {
        stage: snapshot.stage,
        reason: snapshot.reason,
        url: snapshot.url.clone(),
        message: snapshot.message.clone(),
        disable_public_html_route: snapshot.disable_public_html_route,
        last_verified_at_ms: snapshot.last_verified_at_ms,
    };
    let _ = app.emit(VERIFICATION_EVENT_NAME, payload);
}

fn snapshot_and_emit(app: Option<&AppHandle>) -> PublicHtmlVerificationSnapshot {
    let snapshot = current_verification_snapshot();
    emit_snapshot(app, &snapshot);
    snapshot
}

fn fail_verification_with_message(
    app: Option<&AppHandle>,
    message: &str,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Failed;
        state.message = Some(message.to_string());
        let snapshot = state.snapshot();
        let _ = verification_condvar().notify_all();
        snapshot
    };
    emit_snapshot(app, &snapshot);
    snapshot
}

fn resolve_browser_verification_url(target_url: &str) -> String {
    let Ok(url) = Url::parse(target_url) else {
        return DEFAULT_BROWSER_VERIFICATION_URL.to_string();
    };

    if url.scheme().is_empty() || url.host_str().is_none() {
        return DEFAULT_BROWSER_VERIFICATION_URL.to_string();
    }

    url.to_string()
}

fn save_nexus_cookie(cookie: Option<&str>) -> Result<(), String> {
    let settings_path = launcher_settings_path()?;
    let mut settings = load_or_create_settings_at_path(&settings_path)?;
    settings.nexus_cookie = cookie
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    save_settings_at_path(&settings_path, &settings)
}

fn verification_request_is_still_active(session_id: u64, target_url: &str) -> bool {
    let state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    matches!(
        state.stage,
        PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
    ) && state.session_id == session_id
        && state.url.as_deref() == Some(target_url)
}

fn browser_cookie_header(app: &AppHandle, target_url: &str) -> Result<Option<String>, String> {
    let Some(browser) = app.get_webview(VERIFICATION_BROWSER_WEBVIEW_LABEL) else {
        log::warn!(
            "launcher Public HTML browser verification cookie read skipped missing webview label={VERIFICATION_BROWSER_WEBVIEW_LABEL}"
        );
        return Ok(None);
    };

    let url = Url::parse(target_url)
        .map_err(|error| format!("Failed to parse verification browser URL: {error}"))?;
    let cookies = browser
        .cookies_for_url(url)
        .map_err(|error| format!("Failed to read browser verification cookies: {error}"))?;
    if cookies.is_empty() {
        log::warn!("launcher Public HTML browser verification cookie read returned no cookies");
        return Ok(None);
    }

    let cookie_names = cookies
        .iter()
        .map(|cookie| cookie.name().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    log::info!(
        "launcher Public HTML browser verification cookie read count={} names=[{}]",
        cookies.len(),
        cookie_names
    );

    let header = cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ");
    if header.trim().is_empty() {
        Ok(None)
    } else {
        Ok(Some(header))
    }
}

fn complete_verification_internal(
    app: Option<&AppHandle>,
    cookie: Option<String>,
) -> PublicHtmlVerificationSnapshot {
    let cookie = cookie
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if cookie.is_none() {
        let snapshot = {
            let mut state = verification_manager()
                .lock()
                .expect("verification manager mutex should not be poisoned");
            state.stage = PublicHtmlVerificationStage::Waiting;
            state.result_cookie = None;
            state.message = Some(
                "No Nexus verification cookie was found. Complete verification in the browser window, then check again."
                    .to_string(),
            );
            state.snapshot()
        };
        emit_snapshot(app, &snapshot);
        return snapshot;
    }

    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Verified;
        state.result_cookie = cookie;
        state.message = Some("Verification completed successfully.".to_string());
        state.last_verified_at_ms = Some(now_ms());
        let snapshot = state.snapshot();
        let _ = verification_condvar().notify_all();
        snapshot
    };

    emit_snapshot(app, &snapshot);
    snapshot
}

fn submit_cookie_internal(
    app: Option<&AppHandle>,
    cookie: String,
) -> PublicHtmlVerificationSnapshot {
    complete_verification_internal(app, Some(cookie))
}

fn set_waiting_message(app: Option<&AppHandle>, message: &str) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Waiting;
        state.message = Some(message.to_string());
        state.snapshot()
    };
    emit_snapshot(app, &snapshot);
    snapshot
}

fn ensure_verification_window(app: &AppHandle, target_url: &str) -> Result<(), String> {
    let browser_url = resolve_browser_verification_url(target_url);
    webview_runtime::ensure_split_pane_window(
        app,
        verification_window_config(),
        browser_url,
        |_app, loaded_url| {
            log::info!("launcher Public HTML verification browser page loaded url={loaded_url}");
        },
        |_app, _title| {},
        |app| {
            let snapshot =
                cancel_verification_with_message("Verification window closed before completion.");
            emit_snapshot(Some(&app), &snapshot);
        },
    )
}

fn open_or_focus_browser_window(app: &AppHandle, target_url: &str) -> Result<(), String> {
    ensure_verification_window(app, target_url)
}

pub(crate) fn request_verification(reason: PublicHtmlVerificationReason, url: String) -> bool {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    log::info!(
        "launcher Public HTML verification request received current_stage={:?} reason={reason:?} url={url}",
        state.stage
    );

    if state.disable_public_html_route {
        state.stage = PublicHtmlVerificationStage::Disabled;
        state.reason = Some(reason);
        state.url = Some(url);
        state.message = Some("Public HTML route disabled by user.".to_string());
        let _ = verification_condvar().notify_all();
        return false;
    }

    match state.stage {
        PublicHtmlVerificationStage::Idle
        | PublicHtmlVerificationStage::Verified
        | PublicHtmlVerificationStage::Disabled
        | PublicHtmlVerificationStage::Failed
        | PublicHtmlVerificationStage::Cancelled => {
            state.session_id = state.session_id.saturating_add(1);
            state.stage = PublicHtmlVerificationStage::Opening;
            state.reason = Some(reason);
            state.url = Some(url);
            state.message = Some(
                "Browser verification required before the Public HTML route can continue."
                    .to_string(),
            );
            state.result_cookie = None;
            log::info!(
                "launcher Public HTML verification request accepted next_stage={:?} reason={:?} url={:?}",
                state.stage,
                state.reason,
                state.url
            );
            true
        }
        PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting => {
            log::warn!(
                "public html verification already in progress (stage={:?}), ignoring new request",
                state.stage
            );
            false
        }
    }
}

fn restart_verification_request(
    reason: PublicHtmlVerificationReason,
    url: String,
) -> PublicHtmlVerificationSnapshot {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    log::info!(
        "launcher Public HTML verification restart requested previous_stage={:?} reason={reason:?} url={url}",
        state.stage
    );
    state.session_id = state.session_id.saturating_add(1);
    state.stage = PublicHtmlVerificationStage::Opening;
    state.reason = Some(reason);
    state.url = Some(url);
    state.message = Some(
        "Browser verification required before the Public HTML route can continue.".to_string(),
    );
    state.result_cookie = None;
    log::info!(
        "launcher Public HTML verification restart applied next_stage={:?} reason={:?} url={:?}",
        state.stage,
        state.reason,
        state.url
    );
    state.snapshot()
}

pub(crate) fn request_verification_with_app(
    app: &AppHandle,
    reason: PublicHtmlVerificationReason,
    url: String,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let current_snapshot = {
        let state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.snapshot()
    };
    log::info!(
        "launcher Public HTML verification request_with_app current_stage={:?} reason={reason:?} url={url}",
        current_snapshot.stage
    );

    if current_snapshot.disable_public_html_route {
        return Ok(sync_disable_public_html_route(Some(app), true));
    }

    if matches!(
        current_snapshot.stage,
        PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
    ) {
        return Ok(snapshot_and_emit(Some(app)));
    }

    if !request_verification(reason, url.clone()) {
        return Ok(current_verification_snapshot());
    }

    let _ = snapshot_and_emit(Some(app));
    Ok(signal_verification_requested_with_app(Some(app)))
}

pub(crate) fn signal_verification_requested() -> PublicHtmlVerificationSnapshot {
    signal_verification_requested_with_app(None)
}

fn signal_verification_requested_with_app(
    app: Option<&AppHandle>,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Waiting;
        state.message =
            Some("Open the verification window to continue the Public HTML route.".to_string());
        state.snapshot()
    };
    emit_snapshot(app, &snapshot);
    snapshot
}

pub(crate) fn signal_verification_opened() -> PublicHtmlVerificationSnapshot {
    signal_verification_opened_with_app(None)
}

fn signal_verification_opened_with_app(app: Option<&AppHandle>) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Waiting;
        state.message = Some(
            "Waiting for user to open the verification window and complete browser verification."
                .to_string(),
        );
        state.snapshot()
    };
    emit_snapshot(app, &snapshot);
    snapshot
}

pub(crate) fn open_verification_window_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let snapshot = current_verification_snapshot();
    let target_url = snapshot
        .url
        .unwrap_or_else(|| DEFAULT_BROWSER_VERIFICATION_URL.to_string());
    log::info!(
        "launcher Public HTML verification open window requested stage={:?} url={target_url}",
        snapshot.stage
    );
    open_or_focus_browser_window(app, &target_url)?;
    log::info!("launcher Public HTML verification open window completed url={target_url}");
    Ok(set_waiting_message(
        Some(app),
        "Verification window opened. Complete the Nexus browser verification there.",
    ))
}

pub(crate) fn restart_verification_with_app(
    app: &AppHandle,
    reason: PublicHtmlVerificationReason,
    url: String,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    log::info!(
        "launcher Public HTML verification restart_with_app received reason={reason:?} url={url}"
    );
    let snapshot = restart_verification_request(reason, url);
    emit_snapshot(Some(app), &snapshot);
    open_verification_window_with_app(app)
}

pub(crate) fn close_verification_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    log::info!("launcher Public HTML verification close_with_app started");
    let snapshot =
        cancel_verification_with_message("Verification window closed before completion.");
    clear_verification_sync();
    webview_runtime::run_on_main_thread_sync(app, {
        let app = app.clone();
        move || {
            webview_runtime::hide_split_pane_window(&app, &verification_window_config()).map(|_| ())
        }
    })?;
    emit_snapshot(Some(app), &snapshot);
    log::info!(
        "launcher Public HTML verification close_with_app completed stage={:?} url={:?}",
        snapshot.stage,
        snapshot.url
    );
    Ok(snapshot)
}

pub(crate) fn cancel_verification() -> PublicHtmlVerificationSnapshot {
    cancel_verification_with_message("Verification cancelled by user.")
}

fn cancel_verification_with_message(message: &str) -> PublicHtmlVerificationSnapshot {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    let previous_session_id = state.session_id;
    log::info!(
        "launcher Public HTML verification cancel requested session={previous_session_id} previous_stage={:?} message={message}",
        state.stage
    );
    state.session_id = state.session_id.saturating_add(1);
    state.stage = PublicHtmlVerificationStage::Cancelled;
    state.message = Some(message.to_string());
    let snapshot = state.snapshot();
    let _ = verification_condvar().notify_all();
    drop(state);
    clear_verification_sync_if_session(previous_session_id);
    snapshot
}

pub(crate) fn submit_verification(cookie: String) -> PublicHtmlVerificationSnapshot {
    submit_cookie_internal(None, cookie)
}

fn complete_verified_browser_session(
    app: &AppHandle,
    session_id: u64,
    target_url: &str,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    if !verification_request_is_still_active(session_id, target_url) {
        return Ok(current_verification_snapshot());
    }

    log::info!("launcher Public HTML browser verification reading cookies url={target_url}");
    let cookie_header = browser_cookie_header(app, target_url)?;
    if let Some(cookie_value) = cookie_header.as_deref() {
        save_nexus_cookie(Some(cookie_value))?;
    }
    log::info!(
        "launcher Public HTML browser verification completed url={target_url} cookie_saved={}",
        cookie_header.is_some()
    );
    let snapshot = complete_verification_internal(Some(app), cookie_header);
    if snapshot.stage != PublicHtmlVerificationStage::Verified {
        return Ok(snapshot);
    }
    webview_runtime::run_on_main_thread_sync(app, {
        let app = app.clone();
        move || {
            webview_runtime::hide_split_pane_window(&app, &verification_window_config()).map(|_| ())
        }
    })?;
    Ok(snapshot)
}

fn keep_waiting_for_browser_verification(
    app: &AppHandle,
    session_id: u64,
    target_url: &str,
) -> PublicHtmlVerificationSnapshot {
    if !verification_request_is_still_active(session_id, target_url) {
        return current_verification_snapshot();
    }
    set_waiting_message(
        Some(app),
        "Waiting for user to complete verification in browser window.",
    )
}

pub(crate) fn complete_verification_from_browser_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let session_id = {
        let state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.session_id
    };
    let snapshot = current_verification_snapshot();
    if snapshot.url.is_none() {
        return complete_verification_from_browser_session_with_app(app, session_id);
    }

    complete_verification_from_browser_session_with_app(app, session_id)
}

fn complete_verification_from_browser_session_with_app(
    app: &AppHandle,
    session_id: u64,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let snapshot = current_verification_snapshot();
    if !matches!(
        snapshot.stage,
        PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
    ) {
        return Ok(snapshot);
    }

    let Some(target_url) = snapshot.url else {
        return Ok(set_waiting_message(
            Some(app),
            "Waiting for user to complete verification in browser window.",
        ));
    };
    if !verification_request_is_still_active(session_id, &target_url) {
        log::info!(
            "launcher Public HTML browser verification sync ignored stale session={session_id} url={target_url}"
        );
        return Ok(current_verification_snapshot());
    }
    if let Some(running_session) = verification_sync_running_session() {
        log::info!(
            "launcher Public HTML browser verification sync skipped because another sync is running running_session={running_session} session={session_id} url={target_url}"
        );
        return Ok(keep_waiting_for_browser_verification(
            app,
            session_id,
            &target_url,
        ));
    }
    let Some(_sync_guard) = try_begin_verification_sync(session_id) else {
        log::info!(
            "launcher Public HTML browser verification sync skipped because another sync started first session={session_id} url={target_url}"
        );
        return Ok(keep_waiting_for_browser_verification(
            app,
            session_id,
            &target_url,
        ));
    };
    log::info!(
        "launcher Public HTML browser verification sync started session={session_id} url={target_url}"
    );

    complete_verified_browser_session(app, session_id, &target_url)
}

pub(crate) fn refresh_verification_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let snapshot = current_verification_snapshot();
    let target_url = snapshot
        .url
        .unwrap_or_else(|| DEFAULT_BROWSER_VERIFICATION_URL.to_string());

    open_or_focus_browser_window(app, &target_url)?;
    webview_runtime::run_on_main_thread_sync(app, {
        let app = app.clone();
        let target_url = target_url.clone();
        move || {
            if let Some(browser) = app.get_webview(VERIFICATION_BROWSER_WEBVIEW_LABEL) {
                let url = Url::parse(&resolve_browser_verification_url(&target_url)).map_err(
                    |error| format!("Failed to parse verification refresh URL: {error}"),
                )?;
                browser
                    .navigate(url)
                    .map_err(|error| format!("Failed to refresh verification browser: {error}"))?;
                browser
                    .reload()
                    .map_err(|error| format!("Failed to reload verification browser: {error}"))?;
                browser
                    .set_focus()
                    .map_err(|error| format!("Failed to focus verification browser: {error}"))?;
            }
            Ok(())
        }
    })?;

    Ok(set_waiting_message(
        Some(app),
        "Reloaded browser verification page.",
    ))
}

pub(crate) fn clear_verification_session_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    clear_verification_sync();

    let snapshot = current_verification_snapshot();
    let target_url = snapshot
        .url
        .unwrap_or_else(|| DEFAULT_BROWSER_VERIFICATION_URL.to_string());

    webview_runtime::run_on_main_thread_sync(app, {
        let app = app.clone();
        let target_url = target_url.clone();
        move || {
            let url =
                Url::parse(&resolve_browser_verification_url(&target_url)).map_err(|error| {
                    format!("Failed to parse verification browser URL after session clear: {error}")
                })?;

            if let Some(browser) = app.get_webview(VERIFICATION_BROWSER_WEBVIEW_LABEL) {
                browser.clear_all_browsing_data().map_err(|error| {
                    format!("Failed to clear verification browser session data: {error}")
                })?;
                browser.navigate(url).map_err(|error| {
                    format!("Failed to navigate verification browser after clear: {error}")
                })?;
            }
            Ok(())
        }
    })?;

    save_nexus_cookie(None)?;

    let cleared_snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        if matches!(
            state.stage,
            PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
        ) {
            state.stage = PublicHtmlVerificationStage::Waiting;
        } else {
            state.stage = PublicHtmlVerificationStage::Idle;
        }
        state.result_cookie = None;
        state.last_verified_at_ms = None;
        state.message =
            Some("Verification session cleared. Complete verification again.".to_string());
        state.snapshot()
    };

    emit_snapshot(Some(app), &cleared_snapshot);
    Ok(cleared_snapshot)
}

pub(crate) fn refresh_disable_public_html_route_flag(
    disabled: bool,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.disable_public_html_route = disabled;
        if !disabled && state.stage == PublicHtmlVerificationStage::Disabled {
            state.reset_session();
            state.message = Some("Public HTML route enabled.".to_string());
        } else if disabled && state.stage == PublicHtmlVerificationStage::Idle {
            state.stage = PublicHtmlVerificationStage::Disabled;
            state.message = Some("Public HTML route disabled by user.".to_string());
        }
        state.snapshot()
    };
    emit_snapshot(None, &snapshot);
    snapshot
}

pub(crate) fn sync_disable_public_html_route(
    app: Option<&AppHandle>,
    disabled: bool,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.disable_public_html_route = disabled;
        if disabled
            && matches!(
                state.stage,
                PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
            )
        {
            state.stage = PublicHtmlVerificationStage::Disabled;
            state.message = Some("Public HTML route disabled by user.".to_string());
            let _ = verification_condvar().notify_all();
        } else if !disabled && state.stage == PublicHtmlVerificationStage::Disabled {
            state.reset_session();
            state.message = Some("Public HTML route enabled.".to_string());
        }
        state.snapshot()
    };

    if disabled {
        if let Some(app) = app {
            let _ = webview_runtime::run_on_main_thread_sync(app, {
                let app = app.clone();
                move || {
                    webview_runtime::hide_split_pane_window(&app, &verification_window_config())
                        .map(|_| ())
                }
            });
        }
    }
    emit_snapshot(app, &snapshot);
    snapshot
}

pub(crate) fn current_verification_snapshot() -> PublicHtmlVerificationSnapshot {
    let state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    let _ = state.event_payload();
    state.snapshot()
}

pub(crate) fn wait_for_verification_with_app(
    app: Option<&AppHandle>,
) -> Result<Option<String>, (PublicHtmlVerificationStage, String)> {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    log::info!(
        "launcher Public HTML verification wait started stage={:?} url={:?}",
        state.stage,
        state.url
    );

    let deadline = std::time::Instant::now() + Duration::from_secs(VERIFICATION_TIMEOUT_SECS);
    let mut next_wait_log_at = std::time::Instant::now();

    while std::time::Instant::now() < deadline {
        match state.stage {
            PublicHtmlVerificationStage::Verified => {
                let cookie = state.result_cookie.take();
                log::info!(
                    "launcher Public HTML verification wait completed verified cookie_saved={}",
                    cookie.is_some()
                );
                return Ok(cookie);
            }
            PublicHtmlVerificationStage::Disabled => {
                let msg = state
                    .message
                    .clone()
                    .unwrap_or_else(|| "Public HTML route disabled.".to_string());
                log::info!("launcher Public HTML verification wait ended disabled message={msg}");
                return Err((PublicHtmlVerificationStage::Disabled, msg));
            }
            PublicHtmlVerificationStage::Cancelled => {
                let msg = state
                    .message
                    .clone()
                    .unwrap_or_else(|| "Cancelled".to_string());
                log::info!("launcher Public HTML verification wait ended cancelled message={msg}");
                return Err((PublicHtmlVerificationStage::Cancelled, msg));
            }
            PublicHtmlVerificationStage::Failed => {
                let msg = state
                    .message
                    .clone()
                    .unwrap_or_else(|| "Failed".to_string());
                log::info!("launcher Public HTML verification wait ended failed message={msg}");
                return Err((PublicHtmlVerificationStage::Failed, msg));
            }
            _ => {
                let (guard, timeout_result) = verification_condvar()
                    .wait_timeout_while(
                        state,
                        Duration::from_millis(VERIFICATION_POLL_INTERVAL_MS),
                        |value| {
                            matches!(
                                value.stage,
                                PublicHtmlVerificationStage::Opening
                                    | PublicHtmlVerificationStage::Waiting
                            )
                        },
                    )
                    .expect("verification condvar should not be poisoned");
                state = guard;
                if timeout_result.timed_out() {
                    let now = std::time::Instant::now();
                    if now >= next_wait_log_at {
                        log::debug!(
                            "launcher Public HTML verification wait poll stage={:?} url={:?}",
                            state.stage,
                            state.url
                        );
                        next_wait_log_at =
                            now + Duration::from_secs(VERIFICATION_WAIT_LOG_INTERVAL_SECS);
                    }
                    continue;
                }
            }
        }
    }

    drop(state);
    let snapshot = fail_verification_with_message(app, "Verification timed out.");
    let msg = snapshot
        .message
        .clone()
        .unwrap_or_else(|| "Timed out".to_string());
    log::warn!("launcher Public HTML verification wait timed out message={msg}");
    Err((PublicHtmlVerificationStage::Failed, msg))
}

pub(crate) fn reset_verification() {
    log::info!("launcher Public HTML verification reset requested");
    clear_verification_sync();
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.reset_session();
        state.snapshot()
    };
    emit_snapshot(None, &snapshot);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex as StdMutex, OnceLock};
    use std::thread;

    fn verification_test_guard() -> &'static StdMutex<()> {
        static GUARD: OnceLock<StdMutex<()>> = OnceLock::new();
        GUARD.get_or_init(|| StdMutex::new(()))
    }

    #[test]
    fn test_idle_on_start() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        let snap = current_verification_snapshot();
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Idle);
        assert!(snap.reason.is_none());
        assert!(snap.url.is_none());
    }

    #[test]
    fn test_request_verification_transitions_to_opening() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        let accepted = request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        assert!(accepted);

        let snap = current_verification_snapshot();
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Opening);
        assert_eq!(
            snap.reason,
            Some(PublicHtmlVerificationReason::RemoteModDetail)
        );
        assert_eq!(
            snap.url,
            Some("https://www.nexusmods.com/stardewvalley".to_string())
        );
    }

    #[test]
    fn test_second_request_rejected_while_in_progress() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        let rejected = request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        assert!(!rejected);
    }

    #[test]
    fn test_signal_opened() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        let snap = signal_verification_opened();
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Waiting);
    }

    #[test]
    fn test_request_verification_message_waits_for_user_to_open_window() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        let snap = signal_verification_requested();

        assert_eq!(snap.stage, PublicHtmlVerificationStage::Waiting);
        assert!(
            snap.message
                .as_deref()
                .unwrap_or_default()
                .contains("open the verification window"),
            "message should guide the user to open the window, got {:?}",
            snap.message
        );
    }

    #[test]
    fn test_submit_cookie_completes_verification() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        signal_verification_opened();

        let snap = submit_verification("sid=mytestsession".to_string());
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Verified);
        assert!(snap.message.unwrap().contains("success"));
        assert!(snap.last_verified_at_ms.is_some());
    }

    #[test]
    fn test_browser_session_completion_accepts_cookie_without_html_probe() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        signal_verification_opened();

        let snap = complete_verification_internal(None, Some("__cf_bm=token".to_string()));
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Verified);
        assert!(snap.last_verified_at_ms.is_some());
    }

    #[test]
    fn test_browser_session_completion_without_cookie_keeps_waiting() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        signal_verification_opened();

        let snap = complete_verification_internal(None, None);
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Waiting);
        assert!(snap.last_verified_at_ms.is_none());
    }

    #[test]
    fn test_cancel_verification() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com".to_string(),
        );
        let snap = cancel_verification();
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Cancelled);
    }

    #[test]
    fn test_new_request_is_accepted_after_cancelled_waiting_session() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        signal_verification_opened();
        cancel_verification_with_message("Verification window closed before completion.");

        let accepted = request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com/stardewvalley/mods/101".to_string(),
        );
        let snap = current_verification_snapshot();

        assert!(accepted);
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Opening);
        assert_eq!(
            snap.reason,
            Some(PublicHtmlVerificationReason::RemoteModDetail)
        );
        assert_eq!(
            snap.url,
            Some("https://www.nexusmods.com/stardewvalley/mods/101".to_string())
        );
    }

    #[test]
    fn test_restart_verification_request_replaces_waiting_session() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        signal_verification_opened();

        let snap = restart_verification_request(
            PublicHtmlVerificationReason::RemoteModFiles,
            "https://www.nexusmods.com/stardewvalley/mods/101?tab=files".to_string(),
        );

        assert_eq!(snap.stage, PublicHtmlVerificationStage::Opening);
        assert_eq!(
            snap.reason,
            Some(PublicHtmlVerificationReason::RemoteModFiles)
        );
        assert_eq!(
            snap.url,
            Some("https://www.nexusmods.com/stardewvalley/mods/101?tab=files".to_string())
        );
    }

    #[test]
    fn test_restart_after_cancel_keeps_new_active_session() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com/stardewvalley".to_string(),
        );
        signal_verification_opened();
        cancel_verification();
        restart_verification_request(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com/stardewvalley/mods/101".to_string(),
        );

        let snap = current_verification_snapshot();
        assert_eq!(snap.stage, PublicHtmlVerificationStage::Opening);
    }

    #[test]
    fn test_wait_returns_ok_after_submit() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        let accepted = request_verification(
            PublicHtmlVerificationReason::RemoteModDetail,
            "https://www.nexusmods.com".to_string(),
        );
        assert!(accepted);
        signal_verification_opened();

        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            submit_verification("sid=test123".to_string());
        });

        let result = wait_for_verification_with_app(None);
        handle.join().ok();

        match result {
            Ok(Some(cookie)) => assert_eq!(cookie, "sid=test123"),
            other => panic!("Expected Ok(Some(...)), got {:?}", other),
        }
    }

    #[test]
    fn test_wait_returns_err_on_cancel() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com".to_string(),
        );
        signal_verification_opened();

        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            cancel_verification();
        });

        let result = wait_for_verification_with_app(None);
        handle.join().ok();

        match result {
            Err((PublicHtmlVerificationStage::Cancelled, _)) => {}
            other => panic!("Expected Err(Cancelled, ..), got {:?}", other),
        }
    }

    #[test]
    fn test_disable_route_unblocks_waiters() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com".to_string(),
        );
        signal_verification_opened();
        sync_disable_public_html_route(None, true);

        let result = wait_for_verification_with_app(None);
        match result {
            Err((PublicHtmlVerificationStage::Disabled, _)) => {}
            other => panic!("Expected Err(Disabled, ..), got {:?}", other),
        }
    }

    #[test]
    fn test_fail_verification_with_message_marks_failed() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        request_verification(
            PublicHtmlVerificationReason::Diagnostics,
            "https://www.nexusmods.com".to_string(),
        );

        let snap = fail_verification_with_message(None, "Verification timed out.");

        assert_eq!(snap.stage, PublicHtmlVerificationStage::Failed);
        assert_eq!(snap.message.as_deref(), Some("Verification timed out."));
        assert_eq!(
            current_verification_snapshot().stage,
            PublicHtmlVerificationStage::Failed
        );
    }

    #[test]
    fn test_verification_sync_running_probe_does_not_take_guard() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        reset_verification();
        let sync_guard =
            try_begin_verification_sync(1).expect("first verification sync should acquire guard");

        assert_eq!(verification_sync_running_session(), Some(1));
        assert!(try_begin_verification_sync(2).is_none());

        drop(sync_guard);
        assert_eq!(verification_sync_running_session(), None);
        assert!(try_begin_verification_sync(2).is_some());
    }

    #[test]
    fn test_browser_url_uses_target_url_when_valid() {
        let _guard = verification_test_guard()
            .lock()
            .expect("test guard should not be poisoned");

        assert_eq!(
            resolve_browser_verification_url("https://www.nexusmods.com/stardewvalley/mods/101"),
            "https://www.nexusmods.com/stardewvalley/mods/101"
        );
    }
}
