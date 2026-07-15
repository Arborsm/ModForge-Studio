use super::*;
use reqwest::blocking::Client;
use reqwest::header::{IF_RANGE, RANGE};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

fn temporary_directory() -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "modforge-resumable-download-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&path).unwrap();
    path
}

fn response(status: &str, headers: &[(&str, &str)], body: &[u8]) -> Vec<u8> {
    let mut value = format!(
        "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (name, value_part) in headers {
        value.push_str(&format!("{name}: {value_part}\r\n"));
    }
    value.push_str("\r\n");
    let mut bytes = value.into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

fn spawn_http_server(
    responses: Vec<Vec<u8>>,
) -> (String, mpsc::Receiver<String>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let (request_tx, request_rx) = mpsc::channel();
    let handle = thread::spawn(move || {
        for response in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let read = stream.read(&mut buffer).unwrap();
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                if request.windows(4).any(|value| value == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = request_tx.send(String::from_utf8_lossy(&request).into_owned());
            stream.write_all(&response).unwrap();
        }
    });
    (format!("http://{address}"), request_rx, handle)
}

fn send_request(client: &Client, url: &str, resume: ResumeRequest) -> anyhow::Result<Response> {
    let mut request = client.get(url);
    if resume.start > 0 {
        request = request.header(RANGE, format!("bytes={}-", resume.start));
        if let Some(if_range) = resume.if_range {
            request = request.header(IF_RANGE, if_range);
        }
    }
    request.send().map_err(Into::into)
}

fn request(destination: PathBuf, body: &[u8]) -> ResumableDownloadRequest {
    ResumableDownloadRequest {
        destination,
        expected_size: Some(body.len() as u64),
        expected_sha256: Some(format!("{:x}", Sha256::digest(body))),
        version_identity: "model-revision-1".into(),
        current_file: "model.onnx".into(),
        file_index: 1,
        file_count: 1,
        partial_retention: PartialRetention::Preserve,
    }
}

fn seed_partial(request: &ResumableDownloadRequest, bytes: &[u8], etag: &str) {
    fs::write(partial_path(&request.destination), bytes).unwrap();
    write_metadata(
        &metadata_path(&request.destination),
        &PartialMetadata {
            version_identity: request.version_identity.clone(),
            expected_size: request.expected_size,
            expected_sha256: normalized_sha256(request.expected_sha256.as_deref()).unwrap(),
            etag: Some(etag.into()),
            last_modified: None,
        },
    )
    .unwrap();
}

#[test]
fn downloads_verifies_and_atomically_activates_a_new_file() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"semantic model bytes";
    let (url, requests, server) =
        spawn_http_server(vec![response("200 OK", &[("ETag", "\"model-v1\"")], body)]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let mut progress_values = Vec::new();
    let result = download_resumable(
        &request(destination.clone(), body),
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |progress| {
            progress_values.push(progress);
            Ok(())
        },
    )
    .unwrap();
    assert_eq!(fs::read(&destination).unwrap(), body);
    assert_eq!(result.size, body.len() as u64);
    assert_eq!(result.resumed_from, 0);
    assert_eq!(result.etag.as_deref(), Some("\"model-v1\""));
    assert!(!partial_path(&destination).exists());
    assert!(!metadata_path(&destination).exists());
    assert_eq!(progress_values.first().unwrap().phase, "downloading");
    assert_eq!(progress_values.last().unwrap().phase, "complete");
    assert_eq!(progress_values.last().unwrap().percentage, Some(100.0));
    assert!(
        !requests
            .recv_timeout(Duration::from_secs(1))
            .unwrap()
            .contains("Range:")
    );
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn progress_updates_are_throttled_to_one_hundred_milliseconds() {
    assert!(!should_emit_progress(Duration::from_millis(99)));
    assert!(should_emit_progress(Duration::from_millis(100)));
    assert!(should_emit_progress(Duration::from_secs(1)));
}

#[test]
fn local_write_failures_do_not_create_partial_or_final_files() {
    let root = temporary_directory();
    let blocked_parent = root.join("not-a-directory");
    fs::write(&blocked_parent, b"file blocks directory creation").unwrap();
    let destination = blocked_parent.join("model.onnx");
    let body = b"semantic model";

    let error = download_resumable(
        &request(destination.clone(), body),
        None,
        |_| panic!("network must not start when the destination is unwritable"),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap_err();

    assert!(error.to_string().contains("create download directory"));
    assert!(!destination.exists());
    assert!(!partial_path(&destination).exists());
    assert!(!metadata_path(&destination).exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn consumes_an_injected_initial_response_without_sending_again() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"single use response";
    let (url, _, server) = spawn_http_server(vec![response("200 OK", &[], body)]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let initial = client.get(&url).send().unwrap();
    let result = download_resumable(
        &request(destination.clone(), body),
        Some(initial),
        |_| panic!("the injected response must prevent a second request"),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(result.size, body.len() as u64);
    assert_eq!(fs::read(destination).unwrap(), body);
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn resumes_from_a_valid_partial_file_with_range_and_if_range() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"hello world";
    let request = request(destination.clone(), body);
    seed_partial(&request, &body[..6], "\"model-v1\"");
    let (url, requests, server) = spawn_http_server(vec![response(
        "206 Partial Content",
        &[("Content-Range", "bytes 6-10/11"), ("ETag", "\"model-v1\"")],
        &body[6..],
    )]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let result = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(result.resumed_from, 6);
    assert_eq!(fs::read(destination).unwrap(), body);
    let request_text = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    assert!(
        request_text
            .to_ascii_lowercase()
            .contains("range: bytes=6-")
    );
    assert!(
        request_text
            .to_ascii_lowercase()
            .contains("if-range: \"model-v1\"")
    );
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn restarts_when_the_server_ignores_a_range_request() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"replacement model";
    let request = request(destination.clone(), body);
    seed_partial(&request, b"wrong", "\"model-v1\"");
    let (url, _, server) = spawn_http_server(vec![response("200 OK", &[], body)]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let result = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap();
    assert_eq!(result.resumed_from, 0);
    assert_eq!(fs::read(destination).unwrap(), body);
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_an_invalid_content_range_without_appending() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"hello world";
    let request = request(destination.clone(), body);
    seed_partial(&request, &body[..6], "\"model-v1\"");
    let (url, _, server) = spawn_http_server(vec![response(
        "206 Partial Content",
        &[("Content-Range", "bytes 5-10/11"), ("ETag", "\"model-v1\"")],
        &body[6..],
    )]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let error = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap_err();
    assert!(error.to_string().contains("expected 6"));
    assert!(partial_path(&destination).exists());
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_changed_or_missing_resume_validators() {
    for headers in [
        vec![("Content-Range", "bytes 6-10/11"), ("ETag", "\"model-v2\"")],
        vec![("Content-Range", "bytes 6-10/11")],
    ] {
        let root = temporary_directory();
        let destination = root.join("model.onnx");
        let body = b"hello world";
        let request = request(destination.clone(), body);
        seed_partial(&request, &body[..6], "\"model-v1\"");
        let (url, _, server) =
            spawn_http_server(vec![response("206 Partial Content", &headers, &body[6..])]);
        let client = Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let error = download_resumable(
            &request,
            None,
            |resume| send_request(&client, &url, resume),
            || Ok(false),
            |_| Ok(()),
        )
        .unwrap_err();
        assert!(error.to_string().contains("validators changed"));
        assert!(!partial_path(&destination).exists());
        server.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn rejects_unexpected_range_not_satisfiable() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"hello world";
    let request = request(destination.clone(), body);
    seed_partial(&request, &body[..6], "\"model-v1\"");
    let (url, _, server) = spawn_http_server(vec![response(
        "416 Range Not Satisfiable",
        &[("Content-Range", "bytes */11")],
        &[],
    )]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let error = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap_err();
    assert!(
        error
            .to_string()
            .contains("rejected the requested byte range")
    );
    assert!(partial_path(&destination).exists());
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn deletes_corrupt_partial_data_after_sha256_failure() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let expected = b"expected";
    let actual = b"corrupt!";
    let (url, _, server) = spawn_http_server(vec![response("200 OK", &[], actual)]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();
    let error = download_resumable(
        &request(destination.clone(), expected),
        None,
        |resume| send_request(&client, &url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap_err();
    assert!(error.to_string().contains("SHA-256"));
    assert!(!destination.exists());
    assert!(!partial_path(&destination).exists());
    assert!(!metadata_path(&destination).exists());
    server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn cancellation_honors_the_callers_partial_retention_policy() {
    for (policy, expected_partial) in [
        (PartialRetention::Preserve, true),
        (PartialRetention::DeleteOnFailure, false),
    ] {
        let root = temporary_directory();
        let destination = root.join("model.onnx");
        let body = b"download body";
        let request = ResumableDownloadRequest {
            partial_retention: policy,
            ..request(destination.clone(), body)
        };
        let (url, _, server) = spawn_http_server(vec![response("200 OK", &[], body)]);
        let client = Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let mut checks = 0;
        let error = download_resumable(
            &request,
            None,
            |resume| send_request(&client, &url, resume),
            || {
                checks += 1;
                Ok(checks > 1)
            },
            |_| Ok(()),
        )
        .unwrap_err();
        assert!(error.to_string().contains("cancelled"));
        assert_eq!(partial_path(&destination).exists(), expected_partial);
        assert_eq!(metadata_path(&destination).exists(), expected_partial);
        server.join().unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn resumes_after_a_connection_drops_mid_stream() {
    let root = temporary_directory();
    let destination = root.join("model.onnx");
    let body = b"a complete semantic model payload";
    let split = 11;
    let request = request(destination.clone(), body);
    let mut interrupted = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nETag: \"model-v1\"\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    interrupted.extend_from_slice(&body[..split]);
    let (first_url, _, first_server) = spawn_http_server(vec![interrupted]);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();

    let error = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &first_url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap_err();
    assert!(error.to_string().contains("stream download bytes"));
    assert_eq!(
        fs::read(partial_path(&destination)).unwrap(),
        &body[..split]
    );
    assert!(metadata_path(&destination).is_file());
    first_server.join().unwrap();

    let content_range = format!("bytes {split}-{}/{}", body.len() - 1, body.len());
    let (second_url, requests, second_server) = spawn_http_server(vec![response(
        "206 Partial Content",
        &[("Content-Range", &content_range), ("ETag", "\"model-v1\"")],
        &body[split..],
    )]);
    let result = download_resumable(
        &request,
        None,
        |resume| send_request(&client, &second_url, resume),
        || Ok(false),
        |_| Ok(()),
    )
    .unwrap();

    assert_eq!(result.resumed_from, split as u64);
    assert_eq!(fs::read(&destination).unwrap(), body);
    let resumed_request = requests.recv_timeout(Duration::from_secs(1)).unwrap();
    assert!(
        resumed_request
            .to_ascii_lowercase()
            .contains(&format!("range: bytes={split}-"))
    );
    assert!(
        resumed_request
            .to_ascii_lowercase()
            .contains("if-range: \"model-v1\"")
    );
    second_server.join().unwrap();
    fs::remove_dir_all(root).unwrap();
}
