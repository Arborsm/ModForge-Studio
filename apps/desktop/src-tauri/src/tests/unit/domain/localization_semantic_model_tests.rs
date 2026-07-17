use super::*;
use std::fs;

fn test_root() -> PathBuf {
    let root =
        std::env::temp_dir().join(format!("modforge-semantic-model-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    root
}

#[test]
fn builtin_mode_is_the_default_without_saved_settings() {
    let _guard = crate::test_support::process_environment_lock();
    let root = test_root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let status = inspect_model().unwrap();
    assert_eq!(status.mode, AiSemanticSearchMode::Builtin);
    assert!(!status.available);
    assert!(!status.downloaded);
    assert_eq!(status.model_id.as_deref(), Some(BUILTIN_MODEL_ID));
    assert_eq!(status.cache_bytes, 0);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn explicitly_saved_lexical_mode_is_available_without_model_files() {
    let _guard = crate::test_support::process_environment_lock();
    let root = test_root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    settings::save_settings(SaveAiSemanticSettingsRequest {
        mode: AiSemanticSearchMode::Lexical,
        execution_preference: AiSemanticExecutionPreference::Auto,
        local_model_directory: None,
        active_remote_profile_id: None,
        remote_profiles: Vec::new(),
    })
    .unwrap();
    let status = inspect_model().unwrap();
    assert_eq!(status.mode, AiSemanticSearchMode::Lexical);
    assert!(status.available);
    assert!(!status.downloaded);
    assert_eq!(status.cache_bytes, 0);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn builtin_status_reports_an_actionable_missing_model() {
    let _guard = crate::test_support::process_environment_lock();
    let root = test_root();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &root) };
    let status = inspect_builtin();
    assert!(!status.available);
    assert!(!status.downloaded);
    assert_eq!(status.model_id.as_deref(), Some(BUILTIN_MODEL_ID));
    assert!(status.unavailable_reason.unwrap().contains("manifest"));
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_model_validation_accepts_supported_onnx_layouts() {
    for relative_model in ["model.onnx", "onnx/model.onnx", "onnx/model_O4.onnx"] {
        let root = test_root();
        let model = root.join(relative_model);
        fs::create_dir_all(model.parent().unwrap()).unwrap();
        fs::write(model, b"onnx").unwrap();
        fs::write(root.join("tokenizer.json"), br#"{"model":{}}"#).unwrap();
        fs::write(root.join("config.json"), br#"{"hidden_size":384}"#).unwrap();
        fs::write(root.join("special_tokens_map.json"), b"{}").unwrap();
        fs::write(root.join("tokenizer_config.json"), b"{}").unwrap();
        let status = inspect_local(Some(&root.to_string_lossy()));
        assert!(status.available);
        assert_eq!(status.dimensions, Some(384));
        fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn inactive_versions_are_removed_only_after_activation() {
    let root = test_root();
    let active = root.join(BUILTIN_REVISION);
    let previous = root.join("previous-revision");
    let abandoned_staging = root.join("abandoned.staging");
    fs::create_dir_all(&active).unwrap();
    fs::create_dir_all(&previous).unwrap();
    fs::create_dir_all(&abandoned_staging).unwrap();

    cleanup_inactive_versions(&root).unwrap();

    assert!(active.is_dir());
    assert!(!previous.exists());
    assert!(!abandoned_staging.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_model_validation_rejects_incomplete_or_invalid_bundles() {
    let root = test_root();
    let missing = inspect_local(Some(&root.to_string_lossy()));
    assert!(!missing.available);
    assert!(missing.unavailable_reason.unwrap().contains("model.onnx"));

    fs::write(root.join("model.onnx"), b"onnx").unwrap();
    fs::write(root.join("tokenizer.json"), b"{}").unwrap();
    fs::write(root.join("config.json"), br#"{"hidden_size":0}"#).unwrap();
    fs::write(root.join("special_tokens_map.json"), b"{}").unwrap();
    fs::write(root.join("tokenizer_config.json"), b"{}").unwrap();
    let invalid = inspect_local(Some(&root.to_string_lossy()));
    assert!(!invalid.available);
    assert!(invalid.unavailable_reason.unwrap().contains("hidden_size"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn builtin_model_commands_reject_untrusted_model_ids() {
    let error = require_builtin("arbitrary/model").unwrap_err();
    assert!(error.to_string().contains("Unsupported"));
}

#[test]
fn explicit_verification_rejects_modes_without_a_local_model() {
    let error = verify_model(VerifyAiSemanticModelRequest {
        mode: AiSemanticSearchMode::Lexical,
        model_id: None,
        local_model_directory: None,
    })
    .unwrap_err();
    assert!(error.to_string().contains("built-in and local ONNX"));
}

#[test]
fn staging_activation_is_atomic_and_preserves_the_previous_version() {
    let root = test_root();
    let staging = root.join("staging");
    let version = root.join(BUILTIN_REVISION);
    let previous = root.join("previous-revision");
    fs::create_dir_all(&previous).unwrap();
    fs::write(previous.join("marker"), b"previous model").unwrap();
    for file in BUILTIN_FILES {
        let path = staging.join(file.path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, file.path.as_bytes()).unwrap();
    }

    activate_staging_directory(&staging, &version).unwrap();
    assert!(!staging.exists());
    assert_eq!(
        fs::read(previous.join("marker")).unwrap(),
        b"previous model"
    );
    for file in BUILTIN_FILES {
        assert!(version.join(file.path).is_file());
    }

    let manifest = root.join("active.json");
    write_active_manifest(&manifest).unwrap();
    write_active_manifest(&manifest).unwrap();
    let active: ActiveModelManifest =
        serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
    assert_eq!(active.model_id, BUILTIN_MODEL_ID);
    assert_eq!(active.revision, BUILTIN_REVISION);
    assert_eq!(active.relative_directory, BUILTIN_REVISION);
    assert!(!manifest.with_extension("json.tmp").exists());
    assert!(!manifest.with_extension("json.bak").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "downloads and verifies the pinned production embedding model"]
fn downloads_and_verifies_real_builtin_model() {
    let staging_has_data = BUILTIN_FILES
        .iter()
        .any(|file| staging_directory().unwrap().join(file.path).is_file());
    if !version_directory().unwrap().is_dir() && !staging_has_data {
        let (progress_tx, progress_rx) = std::sync::mpsc::channel();
        let app = crate::AppHandle::sidecar(move |event, value| {
            if event == MODEL_PROGRESS_EVENT {
                let _ =
                    progress_tx.send(serde_json::from_value::<AiSemanticProgress>(value).unwrap());
            }
            Ok(())
        });
        let first = std::thread::spawn(move || {
            download_builtin_model(
                app,
                DownloadAiSemanticModelRequest {
                    job_id: "semantic-real-pause".into(),
                    model_id: BUILTIN_MODEL_ID.into(),
                },
            )
        });
        let progress = loop {
            let value = progress_rx
                .recv_timeout(std::time::Duration::from_secs(120))
                .expect("the real download should emit progress");
            if value.downloaded_bytes >= 1024 * 1024 {
                break value;
            }
        };
        assert!(progress.total_bytes > 250_000_000);
        jobs::cancel("semantic-real-pause").unwrap();
        assert!(first.join().unwrap().is_err());
        assert!(
            staging_directory().unwrap().is_dir(),
            "pause must retain staging partials"
        );
        assert!(
            BUILTIN_FILES.iter().any(|file| {
                let destination = staging_directory().unwrap().join(file.path);
                let mut part = destination.as_os_str().to_owned();
                part.push(".part");
                PathBuf::from(part).is_file()
            }),
            "pause must retain a non-empty .part file"
        );
    }
    let status = download_builtin_model(
        crate::AppHandle::sidecar(|_, _| Ok(())),
        DownloadAiSemanticModelRequest {
            job_id: "semantic-real-download".into(),
            model_id: BUILTIN_MODEL_ID.into(),
        },
    )
    .expect("the pinned semantic model should download and verify");
    assert!(status.available);
    assert!(status.downloaded);
    assert_eq!(status.dimensions, Some(BUILTIN_DIMENSIONS));
    assert!(status.cache_bytes > 250_000_000);
}
