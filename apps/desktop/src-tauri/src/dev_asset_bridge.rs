use crate::domain::{assets, resource_registry};
use crate::support::logging::{LogEvent, targets, write_dev_asset_bridge_log};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

const DEFAULT_BIND_ADDR: &str = "127.0.0.1:5187";

pub fn run_from_env() -> Result<(), String> {
    let bind_addr = std::env::var("MODFORGE_EVENT_ASSET_BRIDGE_ADDR")
        .unwrap_or_else(|_| DEFAULT_BIND_ADDR.to_string());
    let bind_addr = resolve_bind_addr(&bind_addr)?;
    let listener = TcpListener::bind(&bind_addr)
        .map_err(|error| format!("Failed to bind dev asset bridge at {bind_addr}: {error}"))?;
    write_dev_asset_bridge_log(
        log::Level::Info,
        targets::DEV_ASSET_BRIDGE,
        LogEvent::new("devAssetBridge.listening")
            .field("url", format!("http://{bind_addr}"))
            .render(),
    );

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                thread::spawn(|| {
                    if let Err(error) = handle_connection(stream) {
                        write_dev_asset_bridge_log(
                            log::Level::Warn,
                            targets::DEV_ASSET_BRIDGE,
                            LogEvent::new("devAssetBridge.requestFailed")
                                .error(&error)
                                .render(),
                        );
                    }
                });
            }
            Err(error) => write_dev_asset_bridge_log(
                log::Level::Warn,
                targets::DEV_ASSET_BRIDGE,
                LogEvent::new("devAssetBridge.acceptFailed")
                    .error(error)
                    .render(),
            ),
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream) -> Result<(), String> {
    let mut buffer = [0_u8; 16 * 1024];
    let byte_count = stream
        .read(&mut buffer)
        .map_err(|error| format!("Failed to read request: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..byte_count]);
    let request_line = request.lines().next().unwrap_or_default();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default();
    let target = request_parts.next().unwrap_or_default();
    let headers = parse_headers(&request);
    let origin = headers.get("origin").map(String::as_str);

    // The bridge exposes local game assets without authentication, so it must only
    // answer loopback callers: a remote page (or a rebound DNS name pointing at
    // 127.0.0.1) would otherwise read arbitrary files through it.
    if !is_loopback_host(headers.get("host").map(String::as_str)) || !is_allowed_origin(origin) {
        write_dev_asset_bridge_log(
            log::Level::Warn,
            targets::DEV_ASSET_BRIDGE,
            LogEvent::new("devAssetBridge.requestRejected")
                .optional("host", headers.get("host").map(String::as_str))
                .optional("origin", origin)
                .render(),
        );
        return write_response(
            &mut stream,
            403,
            "Forbidden",
            "text/plain; charset=utf-8",
            None,
            "The dev asset bridge only serves loopback callers.",
        );
    }

    if method == "OPTIONS" {
        return write_response(
            &mut stream,
            204,
            "No Content",
            "text/plain; charset=utf-8",
            origin,
            "",
        );
    }

    if method != "GET" {
        return write_response(
            &mut stream,
            405,
            "Method Not Allowed",
            "text/plain; charset=utf-8",
            origin,
            "Only GET is supported.",
        );
    }

    let (path, query) = split_target(target);
    let params = parse_query(query);

    match path {
        "/health" => write_response(
            &mut stream,
            200,
            "OK",
            "application/json; charset=utf-8",
            origin,
            "{\"ok\":true}",
        ),
        "/detect-default-game-directory" => {
            write_json_value(&mut stream, origin, assets::detect_default_game_directory())
        }
        "/validate-game-directory" => {
            let root_path = required_param(&params, "path")?;
            write_json_result(
                &mut stream,
                origin,
                assets::validate_game_directory(root_path.to_string()),
            )
        }
        "/load-map-asset" => {
            let root_path = required_param(&params, "rootPath")?;
            let map_path = required_param(&params, "mapPath")?;
            let locale = params
                .get("locale")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            write_json_result(
                &mut stream,
                origin,
                assets::load_map_asset(root_path.to_string(), map_path.to_string(), locale),
            )
        }
        "/load-text-asset" => {
            let root_path = required_param(&params, "rootPath")?;
            let asset_path = required_param(&params, "assetPath")?;
            let locale = params
                .get("locale")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            write_json_result(
                &mut stream,
                origin,
                assets::load_text_asset(root_path.to_string(), asset_path.to_string(), locale),
            )
        }
        "/load-event-asset" => {
            let root_path = required_param(&params, "rootPath")?;
            let asset_path = required_param(&params, "assetPath")?;
            let locale = params
                .get("locale")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            write_json_result(
                &mut stream,
                origin,
                assets::load_event_asset(root_path.to_string(), asset_path.to_string(), locale),
            )
        }
        "/load-image-data-url" => {
            let path = required_param(&params, "path")?;
            let locale = params
                .get("locale")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            let is_optional = params
                .get("optional")
                .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
                .unwrap_or(false);
            if is_optional {
                match assets::load_image_data_url(path.to_string(), locale) {
                    Ok(value) => write_json_value(&mut stream, origin, Some(value)),
                    Err(_) => write_json_value::<Option<String>>(&mut stream, origin, None),
                }
            } else {
                write_json_result(
                    &mut stream,
                    origin,
                    assets::load_image_data_url(path.to_string(), locale),
                )
            }
        }
        "/load-resource-registry" => {
            let root_path = required_param(&params, "rootPath")?;
            let locale = params
                .get("locale")
                .filter(|value| !value.trim().is_empty())
                .cloned();
            write_json_result(
                &mut stream,
                origin,
                resource_registry::load_resource_registry(root_path.to_string(), locale),
            )
        }
        _ => write_response(
            &mut stream,
            404,
            "Not Found",
            "text/plain; charset=utf-8",
            origin,
            "Unknown bridge endpoint.",
        ),
    }
}

/// Validates a configured bind address, refusing anything the network can reach.
pub(crate) fn resolve_bind_addr(bind_addr: &str) -> Result<String, String> {
    let host = bind_addr
        .rsplit_once(':')
        .map_or(bind_addr, |(host, _)| host);
    if !is_loopback_host(Some(host)) {
        return Err(format!(
            "The dev asset bridge only binds loopback addresses, but {bind_addr} was requested."
        ));
    }

    Ok(bind_addr.to_string())
}

/// Lowercased header names mapped to their trimmed values from a raw request head.
pub(crate) fn parse_headers(request: &str) -> HashMap<String, String> {
    request
        .lines()
        .skip(1)
        .take_while(|line| !line.trim().is_empty())
        .filter_map(|line| line.split_once(':'))
        .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        .collect()
}

/// True when the `Host` header targets a loopback address, blocking DNS rebinding.
pub(crate) fn is_loopback_host(host: Option<&str>) -> bool {
    let Some(host) = host.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let hostname = match host.rsplit_once(':') {
        Some((hostname, port)) if port.chars().all(|value| value.is_ascii_digit()) => hostname,
        _ => host,
    };
    let hostname = hostname.trim_start_matches('[').trim_end_matches(']');
    hostname.eq_ignore_ascii_case("localhost")
        || hostname == "::1"
        || hostname
            .parse::<std::net::Ipv4Addr>()
            .is_ok_and(|address| address.is_loopback())
}

/// True when a request carries no browser origin or a loopback development origin.
pub(crate) fn is_allowed_origin(origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|value| !value.is_empty()) else {
        return true;
    };
    let Some(rest) = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
    else {
        return false;
    };
    if rest.contains('/') {
        return false;
    }
    is_loopback_host(Some(rest))
}

fn split_target(target: &str) -> (&str, &str) {
    match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    }
}

fn parse_query(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            Some((decode_component(key)?, decode_component(value)?))
        })
        .collect()
}

fn decode_component(value: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(value.len());
    let raw = value.as_bytes();
    let mut index = 0;
    while index < raw.len() {
        match raw[index] {
            b'+' => {
                bytes.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < raw.len() => {
                let hex = std::str::from_utf8(&raw[index + 1..index + 3]).ok()?;
                let byte = u8::from_str_radix(hex, 16).ok()?;
                bytes.push(byte);
                index += 3;
            }
            byte => {
                bytes.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(bytes).ok()
}

fn required_param<'a>(params: &'a HashMap<String, String>, key: &str) -> Result<&'a str, String> {
    params
        .get(key)
        .map(String::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Missing required query parameter: {key}"))
}

fn write_json_result<T: serde::Serialize>(
    stream: &mut TcpStream,
    origin: Option<&str>,
    result: anyhow::Result<T>,
) -> Result<(), String> {
    match result {
        Ok(value) => {
            let body = serde_json::to_string(&value)
                .map_err(|error| format!("Failed to serialize bridge response: {error}"))?;
            write_response(
                stream,
                200,
                "OK",
                "application/json; charset=utf-8",
                origin,
                &body,
            )
        }
        Err(error) => {
            let error = error.to_string();
            let body = serde_json::to_string(&serde_json::json!({ "error": error }))
                .map_err(|error| format!("Failed to serialize bridge error: {error}"))?;
            write_response(
                stream,
                500,
                "Internal Server Error",
                "application/json; charset=utf-8",
                origin,
                &body,
            )
        }
    }
}

fn write_json_value<T: serde::Serialize>(
    stream: &mut TcpStream,
    origin: Option<&str>,
    value: T,
) -> Result<(), String> {
    let body = serde_json::to_string(&value)
        .map_err(|error| format!("Failed to serialize bridge response: {error}"))?;
    write_response(
        stream,
        200,
        "OK",
        "application/json; charset=utf-8",
        origin,
        &body,
    )
}

fn write_response(
    stream: &mut TcpStream,
    status_code: u16,
    status_text: &str,
    content_type: &str,
    origin: Option<&str>,
    body: &str,
) -> Result<(), String> {
    let response = format!(
        "HTTP/1.1 {status_code} {status_text}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{}Vary: Origin\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len(),
        cors_headers(origin),
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("Failed to write response: {error}"))
}

/// CORS headers echoing an already validated loopback origin, empty for same-origin callers.
pub(crate) fn cors_headers(origin: Option<&str>) -> String {
    match origin.filter(|origin| is_allowed_origin(Some(origin))) {
        Some(origin) => format!(
            "Access-Control-Allow-Origin: {origin}\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
        ),
        None => String::new(),
    }
}

#[cfg(test)]
#[path = "tests/unit/dev_asset_bridge_tests.rs"]
mod dev_asset_bridge_tests;
