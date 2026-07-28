use super::{cors_headers, is_allowed_origin, is_loopback_host, parse_headers, resolve_bind_addr};

#[test]
fn resolve_bind_addr_rejects_network_reachable_addresses() {
    assert_eq!(
        resolve_bind_addr("127.0.0.1:5187").expect("loopback address"),
        "127.0.0.1:5187"
    );
    assert_eq!(
        resolve_bind_addr("localhost:5187").expect("loopback host"),
        "localhost:5187"
    );

    assert!(resolve_bind_addr("0.0.0.0:5187").is_err());
    assert!(resolve_bind_addr("192.168.1.10:5187").is_err());
    assert!(resolve_bind_addr("[::]:5187").is_err());
}

#[test]
fn parse_headers_lowercases_names_and_stops_at_the_body() {
    let request = "GET /health HTTP/1.1\r\nHost: 127.0.0.1:5187\r\nOrigin: http://localhost:5173\r\n\r\nbody: ignored\r\n";

    let headers = parse_headers(request);

    assert_eq!(
        headers.get("host").map(String::as_str),
        Some("127.0.0.1:5187")
    );
    assert_eq!(
        headers.get("origin").map(String::as_str),
        Some("http://localhost:5173")
    );
    assert!(!headers.contains_key("body"));
}

#[test]
fn is_loopback_host_accepts_loopback_targets_and_rejects_rebound_names() {
    assert!(is_loopback_host(Some("127.0.0.1:5187")));
    assert!(is_loopback_host(Some("127.1.2.3")));
    assert!(is_loopback_host(Some("localhost:5187")));
    assert!(is_loopback_host(Some("[::1]:5187")));

    assert!(!is_loopback_host(None));
    assert!(!is_loopback_host(Some("")));
    assert!(!is_loopback_host(Some("attacker.example:5187")));
    assert!(!is_loopback_host(Some("192.168.1.10:5187")));
}

#[test]
fn is_allowed_origin_only_accepts_missing_or_loopback_origins() {
    assert!(is_allowed_origin(None));
    assert!(is_allowed_origin(Some("http://127.0.0.1:5173")));
    assert!(is_allowed_origin(Some("http://localhost:5173")));

    assert!(!is_allowed_origin(Some("https://evil.example")));
    assert!(!is_allowed_origin(Some("http://localhost.evil.example")));
    assert!(!is_allowed_origin(Some("http://evil.example/localhost")));
    assert!(!is_allowed_origin(Some("null")));
    assert!(!is_allowed_origin(Some("file://")));
}

#[test]
fn cors_headers_echo_loopback_origins_and_never_wildcard() {
    let headers = cors_headers(Some("http://127.0.0.1:5173"));

    assert!(headers.contains("Access-Control-Allow-Origin: http://127.0.0.1:5173"));
    assert!(!headers.contains('*'));
    assert_eq!(cors_headers(None), "");
    assert_eq!(cors_headers(Some("https://evil.example")), "");
}
