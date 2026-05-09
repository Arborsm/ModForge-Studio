use super::paths::launcher_settings_path;
use super::settings::{load_or_create_settings_at_path, save_settings_at_path};
use super::types::{
    PublicHtmlVerificationEventPayload, PublicHtmlVerificationReason,
    PublicHtmlVerificationSnapshot, PublicHtmlVerificationStage,
};
use reqwest::Url;
use std::path::PathBuf;
use std::sync::{mpsc, Condvar, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WindowEvent};

const VERIFICATION_EVENT_NAME: &str = "launcher://public-html-verify-state";
const VERIFICATION_WINDOW_LABEL: &str = "launcher-public-html-window";
const TOOLBAR_WEBVIEW_LABEL: &str = "launcher-public-html-toolbar";
const BROWSER_WEBVIEW_LABEL: &str = "launcher-public-html-browser";
const TOOLBAR_HEIGHT: u32 = 150;
const VERIFICATION_POLL_INTERVAL_MS: u64 = 200;
const VERIFICATION_TIMEOUT_SECS: u64 = 300;
const DEFAULT_BROWSER_VERIFICATION_URL: &str = "https://www.nexusmods.com/stardewvalley";

struct VerificationManager {
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

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn emit_snapshot(app: Option<&AppHandle>, snapshot: &PublicHtmlVerificationSnapshot) {
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

fn run_on_main_thread_sync<T, F>(app: &AppHandle, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (tx, rx) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(task());
    })
    .map_err(|error| format!("Failed to schedule verification window task: {error}"))?;

    rx.recv()
        .map_err(|error| format!("Failed to receive verification window task result: {error}"))?
}

fn browser_data_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data directory: {error}"))?;
    Ok(base.join("launcher-public-html-browser"))
}

fn snapshot_and_emit(app: Option<&AppHandle>) -> PublicHtmlVerificationSnapshot {
    let snapshot = current_verification_snapshot();
    emit_snapshot(app, &snapshot);
    snapshot
}

fn hide_verification_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window(VERIFICATION_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|error| format!("Failed to hide verification window: {error}"))?;
    }
    Ok(())
}

fn show_verification_window(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_window(VERIFICATION_WINDOW_LABEL) {
        window
            .show()
            .map_err(|error| format!("Failed to show verification window: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("Failed to focus verification window: {error}"))?;
    }
    if let Some(toolbar) = app.get_webview(TOOLBAR_WEBVIEW_LABEL) {
        toolbar
            .show()
            .map_err(|error| format!("Failed to show verification toolbar webview: {error}"))?;
    }
    if let Some(browser) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser
            .show()
            .map_err(|error| format!("Failed to show verification browser webview: {error}"))?;
    }
    Ok(())
}

fn layout_verification_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_window(VERIFICATION_WINDOW_LABEL) else {
        return Ok(());
    };

    let size = window
        .inner_size()
        .map_err(|error| format!("Failed to read verification window size: {error}"))?;
    let toolbar_height = TOOLBAR_HEIGHT.min(size.height.max(1));
    let browser_height = size.height.saturating_sub(toolbar_height).max(1);

    if let Some(toolbar) = app.get_webview(TOOLBAR_WEBVIEW_LABEL) {
        toolbar
            .set_position(PhysicalPosition::new(0, 0))
            .map_err(|error| format!("Failed to position verification toolbar: {error}"))?;
        toolbar
            .set_size(PhysicalSize::new(size.width, toolbar_height))
            .map_err(|error| format!("Failed to size verification toolbar: {error}"))?;
    }

    if let Some(browser) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
        browser
            .set_position(PhysicalPosition::new(0, toolbar_height as i32))
            .map_err(|error| format!("Failed to position verification browser: {error}"))?;
        browser
            .set_size(PhysicalSize::new(size.width, browser_height))
            .map_err(|error| format!("Failed to size verification browser: {error}"))?;
    }

    Ok(())
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

fn browser_cookie_header(app: &AppHandle, target_url: &str) -> Result<Option<String>, String> {
    let Some(browser) = app.get_webview(BROWSER_WEBVIEW_LABEL) else {
        return Ok(None);
    };

    let url = Url::parse(target_url)
        .map_err(|error| format!("Failed to parse verification browser URL: {error}"))?;
    let cookies = browser
        .cookies_for_url(url)
        .map_err(|error| format!("Failed to read browser verification cookies: {error}"))?;
    if cookies.is_empty() {
        return Ok(None);
    }

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

fn verify_browser_session_cookie(app: &AppHandle, target_url: &str) -> Result<Option<String>, String> {
    let Some(cookie_header) = browser_cookie_header(app, target_url)? else {
        return Ok(None);
    };

    let client = super::http::launcher_http_client()?;
    let headers = super::http::public_page_headers(None, Some(cookie_header.as_str()))?;
    super::http::send_nexus_public_html_request(&client, target_url, headers)
        .map(|_| Some(cookie_header))
}

fn submit_cookie_internal(
    app: Option<&AppHandle>,
    cookie: String,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Verified;
        state.result_cookie = Some(cookie);
        state.message = Some("Verification completed successfully.".to_string());
        state.last_verified_at_ms = Some(now_ms());
        let snapshot = state.snapshot();
        let _ = verification_condvar().notify_all();
        snapshot
    };

    emit_snapshot(app, &snapshot);
    snapshot
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
    let app_handle = app.clone();

    run_on_main_thread_sync(app, move || {
        let (window, created_window) = match app_handle.get_window(VERIFICATION_WINDOW_LABEL) {
            Some(window) => (window, false),
            None => (
                WindowBuilder::new(&app_handle, VERIFICATION_WINDOW_LABEL)
                    .title("Nexus Verification")
                    .inner_size(1120.0, 860.0)
                    .min_inner_size(960.0, 720.0)
                    .center()
                    .visible(false)
                    .focused(false)
                    .build()
                    .map_err(|error| format!("Failed to create verification window: {error}"))?,
                true,
            ),
        };

        if app_handle.get_webview(TOOLBAR_WEBVIEW_LABEL).is_none() {
            let toolbar_builder = WebviewBuilder::new(
                TOOLBAR_WEBVIEW_LABEL,
                tauri::WebviewUrl::App("index.html".into()),
            );
            window
                .add_child(
                    toolbar_builder,
                    PhysicalPosition::new(0, 0),
                    PhysicalSize::new(1120, TOOLBAR_HEIGHT),
                )
                .map_err(|error| format!("Failed to add verification toolbar webview: {error}"))?;
        }

        if app_handle.get_webview(BROWSER_WEBVIEW_LABEL).is_none() {
            let external_url = Url::parse(&browser_url)
                .map_err(|error| format!("Failed to parse verification browser URL: {error}"))?;
            let app_for_page_load = app_handle.clone();
            let browser_builder = WebviewBuilder::new(
                BROWSER_WEBVIEW_LABEL,
                tauri::WebviewUrl::External(external_url),
            )
            .data_directory(browser_data_directory(&app_handle)?)
            .on_page_load(move |_webview, payload| {
                if payload.event() != PageLoadEvent::Finished {
                    return;
                }

                let app = app_for_page_load.clone();
                std::thread::spawn(move || {
                    let _ = complete_verification_from_browser_with_app(&app);
                });
            });
            window
                .add_child(
                    browser_builder,
                    PhysicalPosition::new(0, TOOLBAR_HEIGHT as i32),
                    PhysicalSize::new(1120, 860 - TOOLBAR_HEIGHT),
                )
                .map_err(|error| format!("Failed to add verification browser webview: {error}"))?;
        } else if let Some(browser) = app_handle.get_webview(BROWSER_WEBVIEW_LABEL) {
            let url = Url::parse(&browser_url)
                .map_err(|error| format!("Failed to parse verification browser URL: {error}"))?;
            browser
                .navigate(url)
                .map_err(|error| format!("Failed to navigate verification browser: {error}"))?;
        }

        if created_window {
            let window_for_events = window.clone();
            let app_for_events = app_handle.clone();
            window.on_window_event(move |event| match event {
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let snapshot = cancel_verification();
                    let _ = window_for_events.hide();
                    emit_snapshot(Some(&app_for_events), &snapshot);
                }
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    let _ = layout_verification_window(&app_for_events);
                }
                _ => {}
            });
        }

        layout_verification_window(&app_handle)?;
        show_verification_window(&app_handle)?;
        Ok(())
    })
}

fn open_or_focus_browser_window(app: &AppHandle, target_url: &str) -> Result<(), String> {
    ensure_verification_window(app, target_url)
}

pub(crate) fn request_verification(
    reason: PublicHtmlVerificationReason,
    url: String,
) -> bool {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");

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
            state.stage = PublicHtmlVerificationStage::Opening;
            state.reason = Some(reason);
            state.url = Some(url);
            state.message = Some("Browser verification required before the Public HTML route can continue.".to_string());
            state.result_cookie = None;
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
    Ok(signal_verification_opened_with_app(Some(app)))
}

pub(crate) fn signal_verification_opened() -> PublicHtmlVerificationSnapshot {
    signal_verification_opened_with_app(None)
}

fn signal_verification_opened_with_app(
    app: Option<&AppHandle>,
) -> PublicHtmlVerificationSnapshot {
    let snapshot = {
        let mut state = verification_manager()
            .lock()
            .expect("verification manager mutex should not be poisoned");
        state.stage = PublicHtmlVerificationStage::Waiting;
        state.message = Some("Waiting for user to open the verification window and complete browser verification.".to_string());
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
    open_or_focus_browser_window(app, &target_url)?;
    Ok(set_waiting_message(
        Some(app),
        "Verification window opened. Complete the Nexus browser verification there.",
    ))
}

pub(crate) fn close_verification_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let snapshot = cancel_verification();
    run_on_main_thread_sync(app, {
        let app = app.clone();
        move || hide_verification_window(&app).map(|_| ())
    })?;
    emit_snapshot(Some(app), &snapshot);
    Ok(snapshot)
}

pub(crate) fn cancel_verification() -> PublicHtmlVerificationSnapshot {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");
    state.stage = PublicHtmlVerificationStage::Cancelled;
    state.message = Some("Verification cancelled by user.".to_string());
    let snapshot = state.snapshot();
    let _ = verification_condvar().notify_all();
    snapshot
}

pub(crate) fn submit_verification(cookie: String) -> PublicHtmlVerificationSnapshot {
    submit_cookie_internal(None, cookie)
}

pub(crate) fn complete_verification_from_browser_with_app(
    app: &AppHandle,
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

    match verify_browser_session_cookie(app, &target_url) {
        Ok(Some(cookie_header)) => {
            save_nexus_cookie(Some(cookie_header.as_str()))?;
            let snapshot = submit_cookie_internal(Some(app), cookie_header);
            run_on_main_thread_sync(app, {
                let app = app.clone();
                move || hide_verification_window(&app).map(|_| ())
            })?;
            Ok(snapshot)
        }
        Ok(None) => Ok(set_waiting_message(
            Some(app),
            "Waiting for user to complete verification in browser window.",
        )),
        Err(error)
            if super::http::is_launcher_cloudflare_challenge_required_error(&error)
                || error.contains("HTTP 403") =>
        {
            Ok(set_waiting_message(
                Some(app),
                "Waiting for user to complete verification in browser window.",
            ))
        }
        Err(error) => {
            log::warn!("browser verification probe failed: {error}");
            Ok(set_waiting_message(
                Some(app),
                "Waiting for user to complete verification in browser window.",
            ))
        }
    }
}

pub(crate) fn refresh_verification_with_app(
    app: &AppHandle,
) -> Result<PublicHtmlVerificationSnapshot, String> {
    let snapshot = current_verification_snapshot();
    let target_url = snapshot
        .url
        .unwrap_or_else(|| DEFAULT_BROWSER_VERIFICATION_URL.to_string());

    open_or_focus_browser_window(app, &target_url)?;
    run_on_main_thread_sync(app, {
        let app = app.clone();
        let target_url = target_url.clone();
        move || {
            if let Some(browser) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
                let url = Url::parse(&resolve_browser_verification_url(&target_url))
                    .map_err(|error| format!("Failed to parse verification refresh URL: {error}"))?;
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
    let snapshot = current_verification_snapshot();
    let target_url = snapshot
        .url
        .unwrap_or_else(|| DEFAULT_BROWSER_VERIFICATION_URL.to_string());

    run_on_main_thread_sync(app, {
        let app = app.clone();
        let target_url = target_url.clone();
        move || {
            if let Some(browser) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
                browser.clear_all_browsing_data().map_err(|error| {
                    format!("Failed to clear verification browser session data: {error}")
                })?;
                let url = Url::parse(&resolve_browser_verification_url(&target_url)).map_err(|error| {
                    format!("Failed to parse verification browser URL after session clear: {error}")
                })?;
                browser
                    .navigate(url)
                    .map_err(|error| format!("Failed to navigate verification browser after clear: {error}"))?;
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
        state.message = Some("Verification session cleared. Complete verification again.".to_string());
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
            let _ = run_on_main_thread_sync(app, {
                let app = app.clone();
                move || hide_verification_window(&app).map(|_| ())
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

pub(crate) fn wait_for_verification() -> Result<Option<String>, (PublicHtmlVerificationStage, String)> {
    let mut state = verification_manager()
        .lock()
        .expect("verification manager mutex should not be poisoned");

    let deadline = std::time::Instant::now() + Duration::from_secs(VERIFICATION_TIMEOUT_SECS);

    while std::time::Instant::now() < deadline {
        match state.stage {
            PublicHtmlVerificationStage::Verified => {
                let cookie = state.result_cookie.take();
                return Ok(cookie);
            }
            PublicHtmlVerificationStage::Disabled => {
                let msg = state
                    .message
                    .clone()
                    .unwrap_or_else(|| "Public HTML route disabled.".to_string());
                return Err((PublicHtmlVerificationStage::Disabled, msg));
            }
            PublicHtmlVerificationStage::Cancelled => {
                let msg = state.message.clone().unwrap_or_else(|| "Cancelled".to_string());
                return Err((PublicHtmlVerificationStage::Cancelled, msg));
            }
            PublicHtmlVerificationStage::Failed => {
                let msg = state.message.clone().unwrap_or_else(|| "Failed".to_string());
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
                                PublicHtmlVerificationStage::Opening | PublicHtmlVerificationStage::Waiting
                            )
                        },
                    )
                    .expect("verification condvar should not be poisoned");
                state = guard;
                if timeout_result.timed_out() {
                    continue;
                }
            }
        }
    }

    state.stage = PublicHtmlVerificationStage::Failed;
    state.message = Some("Verification timed out.".to_string());
    let msg = state.message.clone().unwrap_or_else(|| "Timed out".to_string());
    Err((PublicHtmlVerificationStage::Failed, msg))
}

pub(crate) fn reset_verification() {
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
        assert_eq!(snap.reason, Some(PublicHtmlVerificationReason::RemoteModDetail));
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

        let result = wait_for_verification();
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

        let result = wait_for_verification();
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

        let result = wait_for_verification();
        match result {
            Err((PublicHtmlVerificationStage::Disabled, _)) => {}
            other => panic!("Expected Err(Disabled, ..), got {:?}", other),
        }
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
