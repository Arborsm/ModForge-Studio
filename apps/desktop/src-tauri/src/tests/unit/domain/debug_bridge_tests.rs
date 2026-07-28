use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

use serde_json::json;

use crate::domain::debug_bridge::{
    get_debug_bridge_status, parse_bridge_response, read_manifest_version,
    send_debug_bridge_command,
};

#[test]
fn parses_successful_bridge_response_result() {
    let response = json!({ "id": 1, "ok": true, "result": { "saveLoaded": true } });
    let result = parse_bridge_response(&response).expect("response should parse");
    assert_eq!(result, json!({ "saveLoaded": true }));
}

#[test]
fn parses_successful_bridge_response_without_result_as_null() {
    let response = json!({ "id": 1, "ok": true });
    let result = parse_bridge_response(&response).expect("response should parse");
    assert!(result.is_null());
}

#[test]
fn surfaces_bridge_error_message() {
    let response = json!({ "id": 1, "ok": false, "error": "No save is loaded" });
    let error = parse_bridge_response(&response).expect_err("response should fail");
    assert!(error.to_string().contains("No save is loaded"));
}

#[test]
fn rejects_response_without_ok_flag() {
    let response = json!({ "id": 1 });
    let error = parse_bridge_response(&response).expect_err("response should fail");
    assert!(error.to_string().contains("ok flag"));
}

#[test]
fn reads_manifest_version_from_mod_folder() {
    let dir = std::env::temp_dir().join(format!("modforge-bridge-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir should be created");
    std::fs::write(
        dir.join("manifest.json"),
        r#"{ "Name": "ModForge Debug Bridge", "Version": "0.1.0", "UniqueID": "ModForge.DebugBridge" }"#,
    )
    .expect("manifest should be written");

    assert_eq!(read_manifest_version(&dir).as_deref(), Some("0.1.0"));

    std::fs::remove_dir_all(&dir).ok();
}

/// Serves one JSON-line request with a canned responder on an ephemeral localhost port.
fn spawn_mock_bridge(respond: fn(&serde_json::Value) -> serde_json::Value) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("mock bridge should bind");
    let port = listener.local_addr().expect("mock bridge address").port();
    std::thread::spawn(move || {
        if let Ok((stream, _)) = listener.accept() {
            let mut reader = BufReader::new(stream.try_clone().expect("mock clone"));
            let mut line = String::new();
            if reader.read_line(&mut line).is_ok() {
                let request: serde_json::Value =
                    serde_json::from_str(line.trim()).unwrap_or_default();
                let response = respond(&request);
                let mut writer = stream;
                let _ = writer.write_all(
                    serde_json::to_string(&response)
                        .expect("serialize")
                        .as_bytes(),
                );
                let _ = writer.write_all(b"\n");
            }
        }
    });
    port
}

#[test]
fn status_round_trips_hello_through_a_live_socket() {
    let port = spawn_mock_bridge(|request| {
        assert_eq!(
            request.get("command").and_then(|v| v.as_str()),
            Some("hello")
        );
        json!({ "id": request["id"], "ok": true, "result": { "bridgeVersion": "0.1.0", "saveLoaded": false } })
    });

    let status = get_debug_bridge_status(Some(port)).expect("status should resolve");
    assert!(status.reachable);
    assert_eq!(status.port, port);
    let hello = status.hello.expect("hello payload");
    assert_eq!(
        hello.get("bridgeVersion").and_then(|v| v.as_str()),
        Some("0.1.0")
    );
}

#[test]
fn status_reports_unreachable_bridge_as_data() {
    // bind then drop to get a port that is very likely closed
    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").expect("probe bind");
        listener.local_addr().expect("probe address").port()
    };

    let status = get_debug_bridge_status(Some(port)).expect("status should resolve");
    assert!(!status.reachable);
    assert!(status.error.is_some());
}

#[test]
fn send_command_round_trips_args_and_returns_raw_response() {
    let port = spawn_mock_bridge(|request| {
        assert_eq!(
            request.get("command").and_then(|v| v.as_str()),
            Some("warp")
        );
        assert_eq!(
            request.pointer("/args/location").and_then(|v| v.as_str()),
            Some("Town")
        );
        json!({ "id": request["id"], "ok": false, "error": "No save is loaded" })
    });

    let response = send_debug_bridge_command(json!({
        "command": "warp",
        "args": { "location": "Town", "x": 1, "y": 2 },
        "port": port,
    }))
    .expect("transport should succeed");
    assert_eq!(response.get("ok").and_then(|v| v.as_bool()), Some(false));
    assert_eq!(
        response.get("error").and_then(|v| v.as_str()),
        Some("No save is loaded")
    );
}

#[test]
fn missing_manifest_yields_no_version() {
    let dir = std::env::temp_dir().join(format!(
        "modforge-bridge-test-missing-{}",
        std::process::id()
    ));
    assert_eq!(read_manifest_version(&dir), None);
}
