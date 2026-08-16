use super::settings;
use crate::AppHandle;
use crate::domain::app_paths::localization_semantic_models_dir;
use crate::domain::localization::operational_log::{SEMANTIC, event};
use crate::domain::localization::{jobs, types::*};
use crate::infrastructure::fs::pathing::normalize_separators;
use crate::infrastructure::http::resumable_download::{
    PartialRetention, ResumableDownloadRequest, ResumeRequest, download_resumable,
};
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use reqwest::header::{IF_RANGE, RANGE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const BUILTIN_MODEL_ID: &str = "intfloat/multilingual-e5-small";
const BUILTIN_MODEL_DIRECTORY: &str = "multilingual-e5-small";
const BUILTIN_SOURCE_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3";
const BUILTIN_REVISION: &str = "614241f622f53c4eeff9890bdc4f31cfecc418b3-o4";
const BUILTIN_DIMENSIONS: u32 = 384;
const MODEL_PROGRESS_EVENT: &str = "localization://semantic-progress";

#[derive(Clone, Copy)]
struct BuiltinFile {
    path: &'static str,
    size: u64,
    sha256: &'static str,
}

const BUILTIN_FILES: &[BuiltinFile] = &[
    BuiltinFile {
        path: "onnx/model_O4.onnx",
        size: 235_052_531,
        sha256: "4654c156f3e4171abc9c716cdb771bf9116455d15ac1aab364aeeede0e3205b0",
    },
    BuiltinFile {
        path: "tokenizer.json",
        size: 17_082_730,
        sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
    },
    BuiltinFile {
        path: "config.json",
        size: 655,
        sha256: "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
    },
    BuiltinFile {
        path: "special_tokens_map.json",
        size: 167,
        sha256: "d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7",
    },
    BuiltinFile {
        path: "tokenizer_config.json",
        size: 443,
        sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b",
    },
];

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveModelManifest {
    model_id: String,
    revision: String,
    dimensions: u32,
    relative_directory: String,
}

fn require_builtin(model_id: &str) -> anyhow::Result<()> {
    if model_id != BUILTIN_MODEL_ID {
        bail!("Unsupported built-in semantic model id.");
    }
    Ok(())
}

fn model_root() -> anyhow::Result<PathBuf> {
    Ok(localization_semantic_models_dir()?.join(BUILTIN_MODEL_DIRECTORY))
}

fn version_directory() -> anyhow::Result<PathBuf> {
    Ok(model_root()?.join(BUILTIN_REVISION))
}

fn staging_directory() -> anyhow::Result<PathBuf> {
    Ok(model_root()?.join(format!("{BUILTIN_REVISION}.staging")))
}

fn active_manifest_path() -> anyhow::Result<PathBuf> {
    Ok(model_root()?.join("active.json"))
}

fn cleanup_inactive_versions(root: &Path) -> anyhow::Result<()> {
    if !root.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.file_name() != BUILTIN_REVISION {
            fs::remove_dir_all(entry.path()).with_context(|| {
                format!(
                    "Failed to remove inactive semantic model version {}.",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

fn cleanup_inactive_versions_after_activation() {
    let result = model_root().and_then(|root| cleanup_inactive_versions(&root));
    if let Err(error) = result {
        event("semantic.model.cleanupDeferred")
            .error(format!("{error}"))
            .emit_warn(SEMANTIC);
    }
}

fn rename_directory_atomically(source: &Path, destination: &Path) -> anyhow::Result<()> {
    let mut last_error = None;
    for attempt in 0..50 {
        match fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::WouldBlock
                ) =>
            {
                last_error = Some(error);
                std::thread::sleep(Duration::from_millis(100 + attempt * 10));
            }
            Err(error) => return Err(error.into()),
        }
    }
    Err(last_error
        .context("Atomic model activation failed without an operating-system error.")?
        .into())
}

fn activate_staging_directory(staging: &Path, version: &Path) -> anyhow::Result<()> {
    if rename_directory_atomically(staging, version).is_ok() {
        return Ok(());
    }
    let activation = version.with_extension("activating");
    if activation.exists() {
        fs::remove_dir_all(&activation)?;
    }
    fs::create_dir_all(&activation)?;
    for file in BUILTIN_FILES {
        let source = staging.join(file.path);
        let destination = activation.join(file.path);
        fs::create_dir_all(
            destination
                .parent()
                .context("Model activation file has no parent.")?,
        )?;
        fs::rename(&source, &destination).with_context(|| {
            format!(
                "Failed to stage verified model file {} for activation.",
                file.path
            )
        })?;
    }
    rename_directory_atomically(&activation, version)?;
    let _ = fs::remove_dir_all(staging);
    Ok(())
}

fn directory_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| match entry.file_type() {
            Ok(value) if value.is_dir() => directory_size(&entry.path()),
            Ok(value) if value.is_file() => entry.metadata().map(|value| value.len()).unwrap_or(0),
            _ => 0,
        })
        .sum()
}

fn digest(path: &Path) -> anyhow::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn validate_builtin_directory(path: &Path, full_hash: bool) -> anyhow::Result<()> {
    for file in BUILTIN_FILES {
        let candidate = path.join(file.path);
        let metadata = candidate
            .metadata()
            .with_context(|| format!("Built-in semantic model file {} is missing.", file.path))?;
        if metadata.len() != file.size {
            bail!(
                "Built-in semantic model file {} has an invalid size.",
                file.path
            );
        }
        if full_hash && digest(&candidate)? != file.sha256 {
            bail!(
                "Built-in semantic model file {} failed SHA-256 verification.",
                file.path
            );
        }
    }
    Ok(())
}

fn write_active_manifest(path: &Path) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("Semantic model active manifest has no parent directory.")?;
    fs::create_dir_all(parent)?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let value = ActiveModelManifest {
        model_id: BUILTIN_MODEL_ID.into(),
        revision: BUILTIN_REVISION.into(),
        dimensions: BUILTIN_DIMENSIONS,
        relative_directory: BUILTIN_REVISION.into(),
    };
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(&value)?)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
    }
    if !path.exists() {
        fs::rename(&temporary, path)?;
        return Ok(());
    }
    let _ = fs::remove_file(&backup);
    fs::rename(path, &backup)?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(error.into());
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn read_active_manifest() -> anyhow::Result<ActiveModelManifest> {
    let path = active_manifest_path()?;
    let bytes = fs::read(&path)
        .with_context(|| format!("Failed to read semantic model manifest {}.", path.display()))?;
    serde_json::from_slice(&bytes).context("Failed to parse semantic model active manifest.")
}

fn inspect_builtin() -> AiSemanticModelStatus {
    let root = model_root().ok();
    let cache_bytes = root.as_deref().map(directory_size).unwrap_or(0);
    let active = read_active_manifest().and_then(|manifest| {
        if manifest.model_id != BUILTIN_MODEL_ID
            || manifest.revision != BUILTIN_REVISION
            || manifest.dimensions != BUILTIN_DIMENSIONS
        {
            bail!("Built-in semantic model manifest does not match the supported model.");
        }
        let path = model_root()?.join(&manifest.relative_directory);
        validate_builtin_directory(&path, false)?;
        Ok(path)
    });
    match active {
        Ok(path) => AiSemanticModelStatus {
            mode: AiSemanticSearchMode::Builtin,
            available: true,
            downloaded: true,
            model_id: Some(BUILTIN_MODEL_ID.into()),
            revision: Some(BUILTIN_REVISION.into()),
            dimensions: Some(BUILTIN_DIMENSIONS),
            model_path: Some(path.to_string_lossy().into_owned()),
            cache_bytes,
            unavailable_reason: None,
        },
        Err(error) => AiSemanticModelStatus {
            mode: AiSemanticSearchMode::Builtin,
            available: false,
            downloaded: false,
            model_id: Some(BUILTIN_MODEL_ID.into()),
            revision: Some(BUILTIN_REVISION.into()),
            dimensions: Some(BUILTIN_DIMENSIONS),
            model_path: None,
            cache_bytes,
            unavailable_reason: Some(error.to_string()),
        },
    }
}

fn local_model_file(path: &Path) -> Option<PathBuf> {
    [
        path.join("model.onnx"),
        path.join("onnx").join("model.onnx"),
        path.join("onnx").join("model_O4.onnx"),
    ]
    .into_iter()
    .find(|value| value.is_file())
}

fn inspect_local(directory: Option<&str>) -> AiSemanticModelStatus {
    let result = (|| -> anyhow::Result<(PathBuf, u32)> {
        let path = PathBuf::from(
            directory
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .context("No local semantic model directory is configured.")?,
        );
        if !path.is_dir() {
            bail!("The local semantic model directory does not exist.");
        }
        local_model_file(&path).context("The local semantic model does not contain model.onnx.")?;
        for file in [
            "tokenizer.json",
            "config.json",
            "special_tokens_map.json",
            "tokenizer_config.json",
        ] {
            if !path.join(file).is_file() {
                bail!("The local semantic model does not contain {file}.");
            }
        }
        let config: Value = serde_json::from_slice(&fs::read(path.join("config.json"))?)?;
        let dimensions = config
            .get("hidden_size")
            .and_then(Value::as_u64)
            .filter(|value| *value > 0 && *value <= 16_384)
            .context("The local semantic model config does not define a valid hidden_size.")?
            as u32;
        let tokenizer: Value = serde_json::from_slice(&fs::read(path.join("tokenizer.json"))?)?;
        if !tokenizer
            .as_object()
            .is_some_and(|value| value.contains_key("model"))
        {
            bail!("The local semantic tokenizer.json does not define a tokenizer model.");
        }
        let tokenizer_config: Value =
            serde_json::from_slice(&fs::read(path.join("tokenizer_config.json"))?)?;
        if !tokenizer_config.is_object() {
            bail!("The local semantic tokenizer_config.json must contain an object.");
        }
        let special_tokens: Value =
            serde_json::from_slice(&fs::read(path.join("special_tokens_map.json"))?)?;
        if !special_tokens.is_object() {
            bail!("The local semantic special_tokens_map.json must contain an object.");
        }
        Ok((path, dimensions))
    })();
    match result {
        Ok((path, dimensions)) => AiSemanticModelStatus {
            mode: AiSemanticSearchMode::LocalOnnx,
            available: true,
            downloaded: false,
            model_id: Some("local-onnx".into()),
            revision: None,
            dimensions: Some(dimensions),
            model_path: Some(path.to_string_lossy().into_owned()),
            cache_bytes: directory_size(&path),
            unavailable_reason: None,
        },
        Err(error) => AiSemanticModelStatus {
            mode: AiSemanticSearchMode::LocalOnnx,
            available: false,
            downloaded: false,
            model_id: Some("local-onnx".into()),
            revision: None,
            dimensions: None,
            model_path: directory.map(str::to_string),
            cache_bytes: 0,
            unavailable_reason: Some(error.to_string()),
        },
    }
}

pub fn inspect_model() -> anyhow::Result<AiSemanticModelStatus> {
    let settings = settings::load_settings()?;
    Ok(match settings.mode {
        AiSemanticSearchMode::Lexical => {
            let installed = inspect_builtin();
            AiSemanticModelStatus {
                mode: AiSemanticSearchMode::Lexical,
                available: true,
                downloaded: installed.downloaded,
                model_id: installed.model_id,
                revision: installed.revision,
                dimensions: installed.dimensions,
                model_path: installed.model_path,
                cache_bytes: installed.cache_bytes,
                unavailable_reason: None,
            }
        }
        AiSemanticSearchMode::Builtin => inspect_builtin(),
        AiSemanticSearchMode::LocalOnnx => inspect_local(settings.local_model_directory.as_deref()),
        AiSemanticSearchMode::RemoteOpenai => {
            let profile = settings.active_remote_profile_id.as_deref().and_then(|id| {
                settings
                    .remote_profiles
                    .iter()
                    .find(|profile| profile.id == id)
            });
            AiSemanticModelStatus {
                mode: AiSemanticSearchMode::RemoteOpenai,
                available: profile.is_some(),
                downloaded: false,
                model_id: profile.map(|profile| profile.model.clone()),
                revision: None,
                dimensions: profile.and_then(|profile| profile.dimensions),
                model_path: None,
                cache_bytes: 0,
                unavailable_reason: profile
                    .is_none()
                    .then(|| "No active remote semantic embedding profile is configured.".into()),
            }
        }
    })
}

fn verified_files(root: &Path, paths: Vec<PathBuf>) -> anyhow::Result<Vec<AiSemanticVerifiedFile>> {
    paths
        .into_iter()
        .map(|path| {
            let relative_path =
                normalize_separators(&path.strip_prefix(root).unwrap_or(&path).to_string_lossy());
            Ok(AiSemanticVerifiedFile {
                relative_path,
                size_bytes: path.metadata()?.len(),
                sha256: digest(&path)?,
            })
        })
        .collect()
}

pub fn verify_model(
    request: VerifyAiSemanticModelRequest,
) -> anyhow::Result<AiSemanticModelVerification> {
    let (mode, model_id, directory, dimensions, paths) = match request.mode {
        AiSemanticSearchMode::Builtin => {
            let model_id = request.model_id.as_deref().unwrap_or(BUILTIN_MODEL_ID);
            require_builtin(model_id)?;
            let manifest = read_active_manifest()?;
            if manifest.model_id != BUILTIN_MODEL_ID
                || manifest.revision != BUILTIN_REVISION
                || manifest.dimensions != BUILTIN_DIMENSIONS
            {
                bail!("Built-in semantic model manifest does not match the supported model.");
            }
            let directory = model_root()?.join(manifest.relative_directory);
            validate_builtin_directory(&directory, true)?;
            let paths = BUILTIN_FILES
                .iter()
                .map(|file| directory.join(file.path))
                .collect();
            (
                AiSemanticSearchMode::Builtin,
                BUILTIN_MODEL_ID.to_string(),
                directory,
                BUILTIN_DIMENSIONS,
                paths,
            )
        }
        AiSemanticSearchMode::LocalOnnx => {
            let directory = request
                .local_model_directory
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .context("No local semantic model directory was selected.")?;
            let status = inspect_local(Some(directory));
            if !status.available {
                bail!(
                    "Local semantic model verification failed: {}",
                    status
                        .unavailable_reason
                        .as_deref()
                        .unwrap_or("unknown error")
                );
            }
            let directory = PathBuf::from(directory);
            let paths = vec![
                local_model_file(&directory)
                    .context("The local semantic model does not contain model.onnx.")?,
                directory.join("tokenizer.json"),
                directory.join("config.json"),
                directory.join("special_tokens_map.json"),
                directory.join("tokenizer_config.json"),
            ];
            (
                AiSemanticSearchMode::LocalOnnx,
                "local-onnx".into(),
                directory,
                status
                    .dimensions
                    .context("Local semantic model dimensions are missing.")?,
                paths,
            )
        }
        _ => bail!("Only built-in and local ONNX semantic models can be verified locally."),
    };
    let files = verified_files(&directory, paths)?;
    let fingerprint =
        super::embedding::verify_local_directory(&directory, model_id.clone(), dimensions)?;
    Ok(AiSemanticModelVerification {
        mode,
        model_id,
        dimensions,
        pooling: "mean".into(),
        normalized: true,
        fingerprint,
        verified_at_ms: time::OffsetDateTime::now_utc().unix_timestamp() * 1000,
        files,
    })
}

pub fn open_builtin_model_directory(request: DeleteAiSemanticModelRequest) -> anyhow::Result<()> {
    require_builtin(&request.model_id)?;
    let path = inspect_builtin()
        .model_path
        .map(PathBuf::from)
        .context("The built-in semantic model is not installed.")?;
    crate::infrastructure::shell::open_directory(&path)
}

fn model_urls(file: BuiltinFile) -> [String; 2] {
    [
        format!(
            "https://huggingface.co/{BUILTIN_MODEL_ID}/resolve/{BUILTIN_SOURCE_REVISION}/{}",
            file.path
        ),
        format!(
            "https://hf-mirror.com/{BUILTIN_MODEL_ID}/resolve/{BUILTIN_SOURCE_REVISION}/{}",
            file.path
        ),
    ]
}

pub fn download_builtin_model(
    app: AppHandle,
    request: DownloadAiSemanticModelRequest,
) -> anyhow::Result<AiSemanticModelStatus> {
    let started = std::time::Instant::now();
    require_builtin(&request.model_id)?;
    if request.job_id.trim().is_empty() {
        bail!("Semantic model download job id cannot be empty.");
    }
    jobs::clear(&request.job_id);
    event("model.download.started")
        .field("job", &request.job_id)
        .field("model", &request.model_id)
        .field("operation", "download")
        .emit_info(SEMANTIC);
    let result = (|| {
        if version_directory()?.is_dir() {
            validate_builtin_directory(&version_directory()?, true)?;
            write_active_manifest(&active_manifest_path()?)?;
            cleanup_inactive_versions_after_activation();
            return Ok(inspect_builtin());
        }
        let staging = staging_directory()?;
        fs::create_dir_all(&staging)?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(4 * 60 * 60))
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .context("Failed to create semantic model download client.")?;
        let total_bytes = BUILTIN_FILES.iter().map(|file| file.size).sum::<u64>();
        let mut completed_bytes = 0_u64;
        for (index, file) in BUILTIN_FILES.iter().copied().enumerate() {
            jobs::check(&request.job_id)?;
            let urls = model_urls(file);
            let destination = staging.join(file.path);
            download_resumable(
                &ResumableDownloadRequest {
                    destination,
                    expected_size: Some(file.size),
                    expected_sha256: Some(file.sha256.into()),
                    version_identity: format!(
                        "{BUILTIN_MODEL_ID}@{BUILTIN_REVISION}:{}",
                        file.path
                    ),
                    current_file: file.path.into(),
                    file_index: index as u32 + 1,
                    file_count: BUILTIN_FILES.len() as u32,
                    partial_retention: PartialRetention::Preserve,
                },
                None,
                |resume: ResumeRequest| {
                    let mut last_error = None;
                    for url in &urls {
                        let mut send = client
                            .get(url)
                            .header(USER_AGENT, "ModForge Studio/0.1 semantic-model-download");
                        if resume.start > 0 {
                            send = send.header(RANGE, format!("bytes={}-", resume.start));
                            if let Some(if_range) = &resume.if_range {
                                send = send.header(IF_RANGE, if_range);
                            }
                        }
                        match send.send() {
                            Ok(response)
                                if response.status().is_success()
                                    || response.status().as_u16() == 416 =>
                            {
                                return Ok(response);
                            }
                            Ok(response) => {
                                last_error = Some(anyhow::anyhow!(
                                    "Model source {url} returned HTTP {}.",
                                    response.status()
                                ))
                            }
                            Err(error) => {
                                last_error =
                                    Some(anyhow::Error::new(error).context(format!(
                                        "Model source {url} could not be reached."
                                    )))
                            }
                        }
                    }
                    Err(last_error.unwrap_or_else(|| {
                        anyhow::anyhow!("No trusted semantic model source is configured.")
                    }))
                },
                || Ok(jobs::check(&request.job_id).is_err()),
                |progress| {
                    let downloaded_bytes = completed_bytes + progress.downloaded_bytes;
                    let value = AiSemanticProgress {
                        job_id: request.job_id.clone(),
                        model_id: BUILTIN_MODEL_ID.into(),
                        kind: "download".into(),
                        phase: progress.phase.into(),
                        current_file: progress.current_file,
                        downloaded_bytes,
                        total_bytes,
                        percentage: if total_bytes == 0 {
                            100.0
                        } else {
                            downloaded_bytes as f64 / total_bytes as f64 * 100.0
                        },
                        bytes_per_second: progress.bytes_per_second,
                        file_index: progress.file_index,
                        file_count: progress.file_count,
                    };
                    if app.emit(MODEL_PROGRESS_EVENT, value).is_err() {
                        event("progress.failed")
                            .field("job", &request.job_id)
                            .field("operation", "download")
                            .field("failureCategory", "provider")
                            .emit_warn(SEMANTIC);
                    }
                    Ok(())
                },
            )?;
            completed_bytes += file.size;
        }
        validate_builtin_directory(&staging, true)?;
        let version = version_directory()?;
        if version.exists() {
            fs::remove_dir_all(&version)?;
        }
        activate_staging_directory(&staging, &version)
            .context("Failed to activate semantic model version.")?;
        write_active_manifest(&active_manifest_path()?)?;
        cleanup_inactive_versions_after_activation();
        Ok(inspect_builtin())
    })();
    jobs::clear(&request.job_id);
    if let Ok(status) = &result {
        event("model.download.completed")
            .field("job", &request.job_id)
            .field("model", &request.model_id)
            .optional("revision", status.revision.as_deref())
            .field("cacheBytes", status.cache_bytes)
            .field("elapsedMs", started.elapsed().as_millis())
            .emit_info(SEMANTIC);
    } else if result.as_ref().err().is_some_and(|error| {
        crate::domain::localization::operational_log::failure_category(error) == "cancelled"
    }) {
        event("model.download.cancelled")
            .field("job", &request.job_id)
            .field("model", &request.model_id)
            .field("failureCategory", "cancelled")
            .field("elapsedMs", started.elapsed().as_millis())
            .emit_info(SEMANTIC);
    }
    result
}

pub fn delete_builtin_model(
    request: DeleteAiSemanticModelRequest,
) -> anyhow::Result<AiSemanticModelStatus> {
    require_builtin(&request.model_id)?;
    let root = model_root()?;
    if root.exists() {
        fs::remove_dir_all(&root).context("Failed to delete the built-in semantic model.")?;
    }
    Ok(inspect_builtin())
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_model_tests.rs"]
mod tests;
