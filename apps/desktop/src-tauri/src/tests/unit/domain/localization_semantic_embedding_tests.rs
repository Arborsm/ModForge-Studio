use super::*;
use crate::domain::localization::semantic::settings;
use crate::domain::localization::types::{
    AiSemanticSearchMode, SaveAiSemanticRemoteProfile, SaveAiSemanticSettingsRequest,
};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

fn read_request(stream: &mut std::net::TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0_u8; 4096];
    loop {
        let count = stream.read(&mut buffer).unwrap();
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
            let headers = String::from_utf8_lossy(&bytes[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| line.split_once(':'))
                .filter(|(name, _)| name.eq_ignore_ascii_case("content-length"))
                .and_then(|(_, value)| value.trim().parse::<usize>().ok())
                .unwrap_or(0);
            if bytes.len() >= header_end + 4 + content_length {
                break;
            }
        }
    }
    String::from_utf8(bytes).unwrap()
}

#[test]
fn remote_embeddings_retry_authenticate_and_restore_response_order() {
    let _guard = crate::test_support::process_environment_lock();
    let root =
        std::env::temp_dir().join(format!("modforge-semantic-remote-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    unsafe {
        std::env::set_var("MODFORGE_TEST_DATA_DIR", &root);
        std::env::set_var("MODFORGE_TEST_EMBEDDING_KEY", "local-secret");
    }
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base_url = format!("http://{}", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let server = std::thread::spawn(move || {
        for attempt in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            captured.lock().unwrap().push(read_request(&mut stream));
            if attempt == 0 {
                stream
                    .write_all(b"HTTP/1.1 429 Too Many Requests\r\nContent-Length: 0\r\nRetry-After: 0\r\nConnection: close\r\n\r\n")
                    .unwrap();
            } else {
                let body = r#"{"data":[{"index":1,"embedding":[0,1,0]},{"index":0,"embedding":[1,0,0]}],"usage":{"prompt_tokens":17}}"#;
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .unwrap();
            }
        }
    });
    settings::save_settings(SaveAiSemanticSettingsRequest {
        mode: AiSemanticSearchMode::RemoteOpenai,
        local_model_directory: None,
        active_remote_profile_id: Some("local".into()),
        remote_profiles: vec![SaveAiSemanticRemoteProfile {
            id: "local".into(),
            name: "Local test".into(),
            base_url,
            model: "test-embedding".into(),
            dimensions: Some(3),
            credential_environment: Some("MODFORGE_TEST_EMBEDDING_KEY".into()),
            api_key: None,
            clear_api_key: false,
        }],
    })
    .unwrap();
    let output = embed(
        &["first".into(), "second".into()],
        EmbeddingPurpose::Passage,
    )
    .unwrap();
    server.join().unwrap();
    assert_eq!(
        output.vectors,
        vec![vec![1.0, 0.0, 0.0], vec![0.0, 1.0, 0.0]]
    );
    assert_eq!(output.dimensions, 3);
    assert_eq!(output.model_id, "test-embedding");
    assert_eq!(output.input_tokens, Some(17));
    let requests = requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    for request in requests.iter() {
        assert!(request.starts_with("POST /embeddings HTTP/1.1"));
        assert!(
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer local-secret")
        );
        assert!(request.contains("passage: first"));
        assert!(request.contains("passage: second"));
    }
    unsafe {
        std::env::remove_var("MODFORGE_TEST_EMBEDDING_KEY");
        std::env::remove_var("MODFORGE_TEST_DATA_DIR");
    }
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_vectors_are_l2_normalized_and_invalid_vectors_are_rejected() {
    let mut vectors = vec![vec![3.0, 4.0], vec![0.0, 2.0]];
    normalize_vectors(&mut vectors, 2).unwrap();
    for vector in vectors {
        let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-6);
    }
    assert!(normalize_vectors(&mut [vec![0.0, 0.0]], 2).is_err());
    assert!(normalize_vectors(&mut [vec![f32::NAN, 1.0]], 2).is_err());
    assert!(normalize_vectors(&mut [vec![1.0]], 2).is_err());
}
