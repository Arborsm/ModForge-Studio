use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use tungstenite::{Message, WebSocket, connect};

use super::rest_api;
use crate::AppHandle;
use crate::domain::launcher::{paths, settings as launcher_settings};
use anyhow::bail;

// ---- Constants ----

const SSO_WEBSOCKET_URL: &str = "wss://sso.nexusmods.com";
const SSO_AUTH_URL_BASE: &str = "https://www.nexusmods.com/sso";
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(15);
const AUTHORIZATION_TIMEOUT: Duration = Duration::from_secs(120);
const SSO_KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

// ---- Public types ----

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SsoConnectionStatus {
    Idle,
    Connecting,
    AwaitingAuthorization,
    Authorized,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SsoErrorKind {
    ConnectionTimeout,
    AuthorizationTimeout,
    ConnectionRefused,
    NetworkError,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SsoSnapshot {
    pub status: SsoConnectionStatus,
    pub error_kind: Option<SsoErrorKind>,
    pub error_message: Option<String>,
    pub user_name: Option<String>,
    pub is_premium: bool,
    pub sso_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SsoStartResult {
    pub sso_id: String,
    pub status: SsoConnectionStatus,
}

// ---- Internal state ----

struct SsoState {
    status: SsoConnectionStatus,
    error_kind: Option<SsoErrorKind>,
    error_message: Option<String>,
    user_name: Option<String>,
    is_premium: bool,
    sso_id: Option<String>,
    connection_token: Option<String>,
    cancel_flag: bool,
    generation: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SsoConnectionResponse {
    authorization_url: Option<String>,
    connection_token: Option<String>,
    api_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SsoAuthorizationResponse {
    connection_token: Option<String>,
    api_key: String,
}

impl Default for SsoState {
    fn default() -> Self {
        Self {
            status: SsoConnectionStatus::Idle,
            error_kind: None,
            error_message: None,
            user_name: None,
            is_premium: false,
            sso_id: None,
            connection_token: None,
            cancel_flag: false,
            generation: 0,
        }
    }
}

fn sso_state() -> &'static Mutex<SsoState> {
    static STATE: OnceLock<Mutex<SsoState>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(SsoState::default()))
}

fn running_flag() -> &'static AtomicBool {
    static FLAG: OnceLock<AtomicBool> = OnceLock::new();
    FLAG.get_or_init(|| AtomicBool::new(false))
}

fn is_session_cancelled(generation: u64) -> bool {
    let state = sso_state().lock().expect("sso mutex");
    state.generation != generation || state.cancel_flag
}

fn session_connection_token(generation: u64) -> Option<String> {
    let state = sso_state().lock().expect("sso mutex");
    if state.generation != generation || state.cancel_flag {
        None
    } else {
        state.connection_token.clone()
    }
}

fn store_session_connection_token(generation: u64, connection_token: String) -> bool {
    let mut state = sso_state().lock().expect("sso mutex");
    if state.generation != generation || state.cancel_flag {
        return false;
    }
    state.connection_token = Some(connection_token);
    true
}

// ---- Public API ----

pub(crate) fn start_sso(app: &AppHandle) -> anyhow::Result<String> {
    let mut state = sso_state().lock().expect("sso mutex");

    if running_flag().load(Ordering::Relaxed) {
        bail!("SSO flow already in progress.");
    }

    let sso_id = uuid::Uuid::new_v4().to_string();
    state.generation = state.generation.wrapping_add(1);
    let generation = state.generation;
    state.status = SsoConnectionStatus::Connecting;
    state.sso_id = Some(sso_id.clone());
    state.connection_token = None;
    state.cancel_flag = false;
    state.error_kind = None;
    state.error_message = None;
    state.user_name = None;
    state.is_premium = false;
    running_flag().store(true, Ordering::Relaxed);
    drop(state);

    let app_handle = app.clone();
    let tid = sso_id.clone();

    thread::spawn(move || {
        let result = if is_session_cancelled(generation) {
            Err((
                SsoErrorKind::Cancelled,
                "Cancelled before start.".to_string(),
            ))
        } else {
            run_sso_flow(&app_handle, &tid, generation)
        };

        match result {
            Ok(api_key) => {
                {
                    let mut state = sso_state().lock().expect("sso mutex");
                    if state.generation != generation
                        || state.sso_id.as_deref() != Some(tid.as_str())
                    {
                        return;
                    }
                    state.connection_token = None;
                }

                let validation_result = rest_api::validate_user(&api_key);
                let mut state = sso_state().lock().expect("sso mutex");
                if state.generation != generation || state.sso_id.as_deref() != Some(tid.as_str()) {
                    return;
                }
                if let Ok(path) = paths::launcher_settings_path() {
                    if let Ok(mut settings) =
                        launcher_settings::load_or_create_settings_at_path(&path)
                    {
                        settings.nexus_api_key = Some(api_key.clone());
                        let _ = launcher_settings::save_settings_at_path(&path, &settings);
                    }
                }
                state.status = SsoConnectionStatus::Authorized;
                state.error_kind = None;
                match validation_result {
                    Ok(info) => {
                        state.user_name = Some(info.name);
                        state.is_premium = info.is_premium;
                    }
                    Err(e) => {
                        state.error_message = Some(format!("Validation failed: {e}"));
                    }
                }
                running_flag().store(false, Ordering::Relaxed);
            }
            Err((kind, msg)) => {
                let mut state = sso_state().lock().expect("sso mutex");
                if state.generation != generation || state.sso_id.as_deref() != Some(tid.as_str()) {
                    return;
                }
                state.status = SsoConnectionStatus::Failed;
                state.error_kind = Some(kind);
                state.error_message = Some(msg);
                running_flag().store(false, Ordering::Relaxed);
            }
        }
    });

    Ok(sso_id)
}

pub(crate) fn start_sso_with_status(app: &AppHandle) -> anyhow::Result<SsoStartResult> {
    let sso_id = start_sso(app)?;
    std::thread::sleep(std::time::Duration::from_millis(100));
    let status = get_sso_status().status;
    Ok(SsoStartResult { sso_id, status })
}

pub(crate) fn cancel_sso() {
    let mut state = sso_state().lock().expect("sso mutex");
    state.generation = state.generation.wrapping_add(1);
    state.cancel_flag = true;
    state.status = SsoConnectionStatus::Failed;
    state.error_kind = Some(SsoErrorKind::Cancelled);
    state.error_message = Some("SSO cancelled by user.".to_string());
    state.connection_token = None;
    running_flag().store(false, Ordering::Relaxed);
}

pub(crate) fn get_sso_status() -> SsoSnapshot {
    let state = sso_state().lock().expect("sso mutex");
    SsoSnapshot {
        status: state.status,
        error_kind: state.error_kind.clone(),
        error_message: state.error_message.clone(),
        user_name: state.user_name.clone(),
        is_premium: state.is_premium,
        sso_id: state.sso_id.clone(),
    }
}

// ---- SSO flow (background thread) ----

fn run_sso_flow(
    _app: &AppHandle,
    sso_id: &str,
    generation: u64,
) -> Result<String, (SsoErrorKind, String)> {
    if is_session_cancelled(generation) {
        return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
    }

    // Connect with retries (up to CONNECTION_TIMEOUT)
    let start = Instant::now();
    let mut ws = None;
    let mut last_err = String::new();

    while start.elapsed() < CONNECTION_TIMEOUT {
        if is_session_cancelled(generation) {
            return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
        }

        match connect(SSO_WEBSOCKET_URL) {
            Ok((conn, _)) => {
                ws = Some(conn);
                break;
            }
            Err(e) => {
                last_err = format!("{e}");
                thread::sleep(Duration::from_millis(500));
            }
        }
    }

    let mut ws = ws.ok_or_else(|| {
        (
            SsoErrorKind::ConnectionTimeout,
            format!("Connection timed out: {last_err}"),
        )
    })?;

    if is_session_cancelled(generation) {
        return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
    }

    let connection_token = session_connection_token(generation);

    ws.send(Message::Text(
        build_handshake_payload(sso_id, connection_token.as_deref()).into(),
    ))
    .map_err(|e| (SsoErrorKind::NetworkError, format!("Send failed: {e}")))?;

    // Set read timeout on underlying TCP stream for polling
    set_tcp_timeout(&mut ws, Duration::from_millis(500));

    if is_session_cancelled(generation) {
        return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
    }

    let connection_response = read_with_cancel(&mut ws, CONNECTION_TIMEOUT, generation)
        .ok_or_else(|| {
            (
                SsoErrorKind::ConnectionTimeout,
                "No SSO connection response.".to_string(),
            )
        })
        .and_then(|message| parse_sso_connection_response(&message))?;

    if let Some(connection_token) = connection_response.connection_token.clone() {
        if !store_session_connection_token(generation, connection_token) {
            return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
        }
    }

    if let Some(api_key) = connection_response.api_key {
        return Ok(api_key);
    }

    let authorization_url = resolve_authorization_url(sso_id, &connection_response);

    // Update state to awaiting_authorization
    {
        let mut state = sso_state().lock().expect("sso mutex");
        if state.generation != generation || state.cancel_flag {
            return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
        }
        state.status = SsoConnectionStatus::AwaitingAuthorization;
    }

    open_browser(&authorization_url);

    // Read authorization response (120s timeout)
    set_tcp_timeout(&mut ws, Duration::from_secs(1));

    match read_with_cancel(&mut ws, AUTHORIZATION_TIMEOUT, generation) {
        Some(msg) => {
            if is_session_cancelled(generation) {
                return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
            }
            let response = parse_sso_authorization_response(&msg)?;
            if let Some(connection_token) = response.connection_token {
                if !store_session_connection_token(generation, connection_token) {
                    return Err((SsoErrorKind::Cancelled, "Cancelled.".to_string()));
                }
            }
            Ok(response.api_key)
        }
        None => Err((
            SsoErrorKind::AuthorizationTimeout,
            "No authorization response.".to_string(),
        )),
    }
}

fn set_tcp_timeout(
    ws: &mut WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>,
    duration: Duration,
) {
    use tungstenite::stream::MaybeTlsStream;
    match ws.get_mut() {
        MaybeTlsStream::Plain(tcp) => {
            let _ = tcp.set_read_timeout(Some(duration));
        }
        MaybeTlsStream::Rustls(tls) => {
            let _ = tls.sock.set_read_timeout(Some(duration));
        }
        _ => {}
    }
}

fn read_with_cancel(
    ws: &mut WebSocket<tungstenite::stream::MaybeTlsStream<std::net::TcpStream>>,
    total_timeout: Duration,
    generation: u64,
) -> Option<String> {
    let start = Instant::now();
    let mut last_ping = Instant::now();

    while start.elapsed() < total_timeout {
        if is_session_cancelled(generation) {
            return None;
        }

        if last_ping.elapsed() >= SSO_KEEPALIVE_INTERVAL {
            if let Err(error) = ws.send(Message::Ping(Vec::new().into())) {
                log::warn!("SSO WebSocket ping failed: {error}");
                return None;
            }
            last_ping = Instant::now();
        }

        match ws.read() {
            Ok(Message::Text(text)) => return Some(text.to_string()),
            Ok(Message::Close(_)) => return None,
            Ok(Message::Ping(d)) => {
                let _ = ws.send(Message::Pong(d));
            }
            Ok(_) => {}
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock
                    || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                log::warn!("SSO WebSocket read error: {e}");
                return None;
            }
        }
    }

    None
}

fn build_handshake_payload(sso_id: &str, connection_token: Option<&str>) -> String {
    serde_json::json!({
        "id": sso_id,
        "token": connection_token,
        "protocol": 2,
    })
    .to_string()
}

fn build_auth_url(sso_id: &str) -> String {
    format!("{SSO_AUTH_URL_BASE}?id={sso_id}")
}

fn resolve_authorization_url(sso_id: &str, response: &SsoConnectionResponse) -> String {
    response
        .authorization_url
        .clone()
        .unwrap_or_else(|| build_auth_url(sso_id))
}

fn parse_sso_connection_response(
    msg: &str,
) -> Result<SsoConnectionResponse, (SsoErrorKind, String)> {
    let trimmed = msg.trim();
    if !trimmed.starts_with('{') {
        return if trimmed.is_empty() {
            Err((
                SsoErrorKind::NetworkError,
                "Missing SSO connection response.".to_string(),
            ))
        } else {
            Ok(SsoConnectionResponse {
                authorization_url: None,
                connection_token: None,
                api_key: Some(trimmed.to_string()),
            })
        };
    }

    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|error| (SsoErrorKind::NetworkError, format!("Invalid JSON: {error}")))?;

    if !value
        .get("success")
        .and_then(|item| item.as_bool())
        .unwrap_or(false)
    {
        let error = value
            .get("error")
            .and_then(|item| item.as_str())
            .unwrap_or("Unknown");
        return Err(classify_sso_error(error));
    }

    let data = value.get("data");
    let authorization_url = data
        .and_then(|item| item.get("url"))
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned);
    let connection_token = data
        .and_then(|item| item.get("connection_token"))
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned);
    let api_key = data
        .and_then(|item| item.get("api_key"))
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToOwned::to_owned);

    Ok(SsoConnectionResponse {
        authorization_url,
        connection_token,
        api_key,
    })
}

fn parse_sso_authorization_response(
    msg: &str,
) -> Result<SsoAuthorizationResponse, (SsoErrorKind, String)> {
    let trimmed = msg.trim();
    if !trimmed.starts_with('{') {
        return if trimmed.is_empty() {
            Err((SsoErrorKind::NetworkError, "Missing api_key.".to_string()))
        } else {
            Ok(SsoAuthorizationResponse {
                connection_token: None,
                api_key: trimmed.to_string(),
            })
        };
    }

    let v: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| (SsoErrorKind::NetworkError, format!("Invalid JSON: {e}")))?;

    if !v.get("success").and_then(|x| x.as_bool()).unwrap_or(false) {
        let err = v.get("error").and_then(|x| x.as_str()).unwrap_or("Unknown");
        return Err(classify_sso_error(err));
    }

    let connection_token = v
        .get("data")
        .and_then(|d| d.get("connection_token"))
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    if let Some(api_key) = v
        .get("data")
        .and_then(|d| d.get("api_key"))
        .and_then(|x| x.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(SsoAuthorizationResponse {
            connection_token,
            api_key: api_key.to_string(),
        });
    }

    if v.get("data")
        .and_then(|d| d.get("url"))
        .and_then(|x| x.as_str())
        .is_some()
    {
        return Err((
            SsoErrorKind::NetworkError,
            "Nexus SSO returned a browser URL after the browser was already opened.".to_string(),
        ));
    }

    Err((SsoErrorKind::NetworkError, "Missing api_key.".to_string()))
}

fn classify_sso_error(err: &str) -> (SsoErrorKind, String) {
    if err.contains("timeout") {
        (SsoErrorKind::AuthorizationTimeout, err.to_string())
    } else {
        (SsoErrorKind::ConnectionRefused, err.to_string())
    }
}

fn open_browser(url: &str) {
    let mut command = {
        #[cfg(windows)]
        {
            let mut command = std::process::Command::new("cmd");
            command.args(["/c", "start", "", url]);
            command
        }
        #[cfg(target_os = "macos")]
        {
            let mut command = std::process::Command::new("open");
            command.arg(url);
            command
        }
        #[cfg(target_os = "linux")]
        {
            let mut command = std::process::Command::new("xdg-open");
            command.arg(url);
            command
        }
    };

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let _ = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::{
        SsoAuthorizationResponse, SsoConnectionResponse, SsoErrorKind, build_handshake_payload,
        parse_sso_authorization_response, parse_sso_connection_response, resolve_authorization_url,
    };

    #[test]
    fn build_handshake_payload_sends_session_id_without_unregistered_app_id() {
        let payload: serde_json::Value =
            serde_json::from_str(&build_handshake_payload("session-123", None))
                .expect("handshake JSON");

        assert_eq!(
            payload.get("id").and_then(|value| value.as_str()),
            Some("session-123")
        );
        assert!(payload.get("appid").is_none());
        assert!(payload.get("token").is_some_and(serde_json::Value::is_null));
        assert_eq!(
            payload.get("protocol").and_then(|value| value.as_i64()),
            Some(2)
        );
    }

    #[test]
    fn build_handshake_payload_sends_connection_token_for_reconnect() {
        let payload: serde_json::Value =
            serde_json::from_str(&build_handshake_payload("session-123", Some("token-123")))
                .expect("handshake JSON");

        assert_eq!(
            payload.get("token").and_then(|value| value.as_str()),
            Some("token-123")
        );
    }

    #[test]
    fn parse_sso_response_reads_api_key_from_authorization_message() {
        let response = parse_sso_authorization_response("abc123").expect("plain api key response");

        assert_eq!(response.api_key, "abc123");
    }

    #[test]
    fn parse_sso_authorization_response_returns_connection_token_without_global_state() {
        let response = parse_sso_authorization_response(
            r#"{"success":true,"data":{"api_key":"abc123","connection_token":"token-456"}}"#,
        )
        .expect("authorization response should parse");

        assert_eq!(
            response,
            SsoAuthorizationResponse {
                connection_token: Some("token-456".to_string()),
                api_key: "abc123".to_string(),
            }
        );
    }

    #[test]
    fn parse_sso_connection_response_reads_authorization_url_and_connection_token() {
        let response = parse_sso_connection_response(
            r#"{"success":true,"data":{"url":"https://www.nexusmods.com/sso?id=fresh&application=modforge_studio","connection_token":"token-123"}}"#,
        )
        .expect("connection response should parse");

        assert_eq!(
            response,
            SsoConnectionResponse {
                authorization_url: Some(
                    "https://www.nexusmods.com/sso?id=fresh&application=modforge_studio"
                        .to_string()
                ),
                connection_token: Some("token-123".to_string()),
                api_key: None,
            }
        );
    }

    #[test]
    fn parse_sso_connection_response_accepts_connection_token_without_authorization_url() {
        let response = parse_sso_connection_response(
            r#"{"success":true,"data":{"connection_token":"token-123"},"error":null}"#,
        )
        .expect("current Nexus connection response should parse");

        assert_eq!(
            response,
            SsoConnectionResponse {
                authorization_url: None,
                connection_token: Some("token-123".to_string()),
                api_key: None,
            }
        );
    }

    #[test]
    fn resolve_authorization_url_builds_canonical_sso_url_when_connection_response_has_no_url() {
        let response = SsoConnectionResponse {
            authorization_url: None,
            connection_token: Some("token-123".to_string()),
            api_key: None,
        };

        assert_eq!(
            resolve_authorization_url("session-123", &response),
            "https://www.nexusmods.com/sso?id=session-123"
        );
    }

    #[test]
    fn parse_sso_response_classifies_denied_authorization() {
        let error = parse_sso_authorization_response(r#"{"success":false,"error":"Denied"}"#)
            .expect_err("denied response");

        assert_eq!(
            error,
            (SsoErrorKind::ConnectionRefused, "Denied".to_string())
        );
    }
}
