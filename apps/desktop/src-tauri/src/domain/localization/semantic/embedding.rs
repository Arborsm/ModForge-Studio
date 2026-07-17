use super::{model, settings};
use crate::domain::localization::types::{AiSemanticExecutionPreference, AiSemanticSearchMode};
use anyhow::{Context, bail};
use fastembed::{
    InitOptionsUserDefined, Pooling, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel,
};
use reqwest::blocking::Client;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const MAX_EMBEDDING_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;
const LOCAL_BATCH_SIZE: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EmbeddingPurpose {
    Query,
    Passage,
}

#[derive(Debug)]
pub struct EmbeddingOutput {
    pub vectors: Vec<Vec<f32>>,
    pub model_key: String,
    pub model_id: String,
    pub dimensions: u32,
    pub input_tokens: Option<u64>,
}

struct LoadedLocalModel {
    signature: String,
    fingerprint: String,
    model_id: String,
    dimensions: u32,
    execution_provider: String,
    model: TextEmbedding,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct ExecutionRuntimeStatus {
    preference: AiSemanticExecutionPreference,
    pub active_provider: Option<String>,
    pub fallback_reason: Option<String>,
}

fn runtime_status() -> &'static Mutex<ExecutionRuntimeStatus> {
    static VALUE: OnceLock<Mutex<ExecutionRuntimeStatus>> = OnceLock::new();
    VALUE.get_or_init(|| {
        Mutex::new(ExecutionRuntimeStatus {
            preference: AiSemanticExecutionPreference::Auto,
            active_provider: None,
            fallback_reason: None,
        })
    })
}

pub(super) fn execution_runtime_status(
    preference: AiSemanticExecutionPreference,
) -> ExecutionRuntimeStatus {
    runtime_status()
        .lock()
        .map(|value| {
            (value.preference == preference)
                .then(|| value.clone())
                .unwrap_or(ExecutionRuntimeStatus {
                    preference,
                    active_provider: None,
                    fallback_reason: None,
                })
        })
        .unwrap_or(ExecutionRuntimeStatus {
            preference,
            active_provider: None,
            fallback_reason: Some("Semantic execution runtime status is unavailable.".into()),
        })
}

fn update_runtime_status(
    preference: AiSemanticExecutionPreference,
    active_provider: &str,
    fallback_reason: Option<String>,
) {
    if let Ok(mut status) = runtime_status().lock() {
        status.preference = preference;
        status.active_provider = Some(active_provider.into());
        status.fallback_reason = fallback_reason;
    }
}

fn loaded_model() -> &'static Mutex<Option<LoadedLocalModel>> {
    static VALUE: OnceLock<Mutex<Option<LoadedLocalModel>>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(None))
}

pub(super) fn release_local_model() -> anyhow::Result<bool> {
    let released = loaded_model()
        .lock()
        .map_err(|_| anyhow::anyhow!("Semantic model runtime lock is unavailable."))?
        .take()
        .is_some();
    if let Ok(mut status) = runtime_status().lock() {
        status.active_provider = None;
        status.fallback_reason = None;
    }
    Ok(released)
}

fn required_path(directory: &Path, name: &str) -> anyhow::Result<PathBuf> {
    let value = directory.join(name);
    if !value.is_file() {
        bail!("Semantic model does not contain {name}.");
    }
    Ok(value)
}

fn onnx_path(directory: &Path) -> anyhow::Result<PathBuf> {
    [
        directory.join("model.onnx"),
        directory.join("onnx").join("model.onnx"),
        directory.join("onnx").join("model_O4.onnx"),
    ]
    .into_iter()
    .find(|value| value.is_file())
    .context("Semantic model does not contain model.onnx.")
}

fn file_signature(path: &Path) -> anyhow::Result<String> {
    let metadata = path.metadata()?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    Ok(format!("{}:{}:{modified}", path.display(), metadata.len()))
}

fn local_signature(directory: &Path) -> anyhow::Result<String> {
    [
        onnx_path(directory)?,
        required_path(directory, "tokenizer.json")?,
        required_path(directory, "config.json")?,
        required_path(directory, "special_tokens_map.json")?,
        required_path(directory, "tokenizer_config.json")?,
    ]
    .iter()
    .map(|path| file_signature(path))
    .collect::<anyhow::Result<Vec<_>>>()
    .map(|values| values.join("|"))
}

fn load_bytes(path: &Path, fingerprint: &mut Sha256) -> anyhow::Result<Vec<u8>> {
    let value = fs::read(path)
        .with_context(|| format!("Failed to read semantic model file {}.", path.display()))?;
    fingerprint.update(
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default(),
    );
    fingerprint.update([0]);
    fingerprint.update(&value);
    Ok(value)
}

fn load_local_model(
    directory: &Path,
    model_id: String,
    dimensions: u32,
    execution_preference: AiSemanticExecutionPreference,
) -> anyhow::Result<LoadedLocalModel> {
    let signature = format!("{}:{execution_preference:?}", local_signature(directory)?);
    let mut fingerprint = Sha256::new();
    let onnx_file = load_bytes(&onnx_path(directory)?, &mut fingerprint)?;
    let tokenizer_files = TokenizerFiles {
        tokenizer_file: load_bytes(
            &required_path(directory, "tokenizer.json")?,
            &mut fingerprint,
        )?,
        config_file: load_bytes(&required_path(directory, "config.json")?, &mut fingerprint)?,
        special_tokens_map_file: load_bytes(
            &required_path(directory, "special_tokens_map.json")?,
            &mut fingerprint,
        )?,
        tokenizer_config_file: load_bytes(
            &required_path(directory, "tokenizer_config.json")?,
            &mut fingerprint,
        )?,
    };
    let fingerprint = format!("{:x}", fingerprint.finalize());
    let embedding_model =
        UserDefinedEmbeddingModel::new(onnx_file, tokenizer_files).with_pooling(Pooling::Mean);
    let threads = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(2)
        .clamp(1, 8);
    let options = || {
        InitOptionsUserDefined::new()
            .with_max_length(512)
            .with_intra_threads(threads)
    };
    #[cfg(target_os = "windows")]
    let accelerated = (execution_preference == AiSemanticExecutionPreference::Auto).then(|| {
        TextEmbedding::try_new_from_user_defined(
            embedding_model.clone(),
            options().with_execution_providers(vec![
                ort::ep::DirectML::default()
                    .with_performance_preference(
                        ort::ep::directml::PerformancePreference::HighPerformance,
                    )
                    .with_device_filter(ort::ep::directml::DeviceFilter::Gpu)
                    .build()
                    .error_on_failure(),
            ]),
        )
    });
    #[cfg(target_os = "linux")]
    let accelerated = (execution_preference == AiSemanticExecutionPreference::Auto).then(|| {
        TextEmbedding::try_new_from_user_defined(
            embedding_model.clone(),
            options().with_execution_providers(vec![
                ort::ep::CUDA::default()
                    .with_device_id(0)
                    .build()
                    .error_on_failure(),
            ]),
        )
    });
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let accelerated = (execution_preference == AiSemanticExecutionPreference::Auto).then(|| {
        TextEmbedding::try_new_from_user_defined(
            embedding_model.clone(),
            options().with_execution_providers(vec![
                ort::ep::CoreML::default()
                    .with_subgraphs(true)
                    .build()
                    .error_on_failure(),
            ]),
        )
    });
    #[cfg(not(any(
        target_os = "windows",
        target_os = "linux",
        all(target_os = "macos", target_arch = "aarch64")
    )))]
    let accelerated: Option<anyhow::Result<TextEmbedding>> = None;
    let (model, execution_provider, fallback_reason) = match accelerated {
        Some(Ok(model)) => (model, platform_gpu_provider(), None),
        Some(Err(error)) => (
            TextEmbedding::try_new_from_user_defined(embedding_model, options()).context(
                "Failed to initialize the CPU semantic embedding model after GPU fallback.",
            )?,
            "cpu",
            Some(format!(
                "{} initialization failed: {error:#}",
                platform_gpu_provider_label()
            )),
        ),
        None => (
            TextEmbedding::try_new_from_user_defined(embedding_model, options())
                .context("Failed to initialize the local semantic embedding model.")?,
            "cpu",
            (execution_preference == AiSemanticExecutionPreference::Auto)
                .then(|| "GPU acceleration is not available in this platform build.".into()),
        ),
    };
    update_runtime_status(execution_preference, execution_provider, fallback_reason);
    Ok(LoadedLocalModel {
        signature,
        fingerprint,
        model_id,
        dimensions,
        execution_provider: execution_provider.into(),
        model,
    })
}

fn platform_gpu_provider() -> &'static str {
    if cfg!(target_os = "windows") {
        "directml"
    } else if cfg!(target_os = "linux") {
        "cuda"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "coreml"
    } else {
        "gpu"
    }
}

fn platform_gpu_provider_label() -> &'static str {
    if cfg!(target_os = "windows") {
        "DirectML"
    } else if cfg!(target_os = "linux") {
        "CUDA"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "CoreML"
    } else {
        "GPU provider"
    }
}

fn prefixed(texts: &[String], purpose: EmbeddingPurpose) -> Vec<String> {
    let prefix = match purpose {
        EmbeddingPurpose::Query => "query: ",
        EmbeddingPurpose::Passage => "passage: ",
    };
    texts
        .iter()
        .map(|text| format!("{prefix}{}", text.trim()))
        .collect()
}

fn normalize_vectors(vectors: &mut [Vec<f32>], dimensions: u32) -> anyhow::Result<()> {
    for vector in vectors {
        if vector.len() != dimensions as usize || vector.iter().any(|value| !value.is_finite()) {
            bail!("Local semantic model returned invalid embedding dimensions or values.");
        }
        let norm = vector.iter().map(|value| value * value).sum::<f32>().sqrt();
        if !norm.is_finite() || norm <= f32::EPSILON {
            bail!("Local semantic model returned an embedding that cannot be normalized.");
        }
        for value in vector {
            *value /= norm;
        }
    }
    Ok(())
}

pub(super) fn verify_local_directory(
    directory: &Path,
    model_id: String,
    dimensions: u32,
) -> anyhow::Result<String> {
    let preference = settings::load_settings()?.execution_preference;
    let mut loaded = load_local_model(directory, model_id, dimensions, preference)?;
    let texts = prefixed(
        &["semantic model verification".into()],
        EmbeddingPurpose::Query,
    );
    let mut vectors = loaded
        .model
        .embed(texts, None)
        .context("Failed to execute the semantic model verification embedding.")?;
    normalize_vectors(&mut vectors, dimensions)?;
    Ok(loaded.fingerprint)
}

fn embed_local(
    directory: &Path,
    model_id: String,
    dimensions: u32,
    texts: &[String],
    purpose: EmbeddingPurpose,
    execution_preference: AiSemanticExecutionPreference,
) -> anyhow::Result<EmbeddingOutput> {
    let signature = format!("{}:{execution_preference:?}", local_signature(directory)?);
    let mut loaded = loaded_model()
        .lock()
        .map_err(|_| anyhow::anyhow!("Semantic model runtime lock is unavailable."))?;
    if loaded
        .as_ref()
        .is_none_or(|value| value.signature != signature)
    {
        *loaded = Some(load_local_model(
            directory,
            model_id,
            dimensions,
            execution_preference,
        )?);
    }
    let loaded = loaded.as_mut().context("Semantic model failed to load.")?;
    let mut vectors = loaded
        .model
        .embed(prefixed(texts, purpose), Some(LOCAL_BATCH_SIZE))
        .context("Local semantic embedding inference failed.")?;
    normalize_vectors(&mut vectors, loaded.dimensions)?;
    Ok(EmbeddingOutput {
        vectors,
        model_key: format!(
            "local:{}:{}:{}",
            loaded.fingerprint,
            loaded.execution_provider,
            execution_preference_key(execution_preference)
        ),
        model_id: loaded.model_id.clone(),
        dimensions: loaded.dimensions,
        input_tokens: None,
    })
}

pub(super) fn execution_preference_key(preference: AiSemanticExecutionPreference) -> &'static str {
    match preference {
        AiSemanticExecutionPreference::Auto => "execution-auto",
        AiSemanticExecutionPreference::Cpu => "execution-cpu",
    }
}

fn remote_endpoint(base_url: &str) -> String {
    format!("{}/embeddings", base_url.trim_end_matches('/'))
}

fn embed_remote(
    profile_id: &str,
    texts: &[String],
    purpose: EmbeddingPurpose,
) -> anyhow::Result<EmbeddingOutput> {
    let (profile, credential) = settings::resolve_remote_profile(profile_id)?;
    let input = prefixed(texts, purpose);
    let mut body = json!({"model":profile.model,"input":input,"encoding_format":"float"});
    if let Some(dimensions) = profile.dimensions {
        body["dimensions"] = json!(dimensions);
    }
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()?;
    let mut request = client.post(remote_endpoint(&profile.base_url)).json(&body);
    if let Some(credential) = credential {
        request = request.bearer_auth(credential);
    }
    let mut response = None;
    for attempt in 0..3 {
        let candidate = request
            .try_clone()
            .context("Semantic embedding request could not be retried.")?
            .send()
            .context("Semantic embedding request failed.")?;
        let retryable = candidate.status().as_u16() == 429 || candidate.status().is_server_error();
        if !retryable || attempt == 2 {
            response = Some(candidate);
            break;
        }
        let delay = candidate
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(1_u64 << attempt)
            .min(10);
        std::thread::sleep(Duration::from_secs(delay));
    }
    let response = response.context("Semantic embedding request produced no response.")?;
    if !response.status().is_success() {
        bail!(
            "Semantic embedding request failed with HTTP {}.",
            response.status()
        );
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_EMBEDDING_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_EMBEDDING_RESPONSE_BYTES {
        bail!("Semantic embedding response exceeds 16 MB.");
    }
    let value: Value =
        serde_json::from_slice(&bytes).context("Semantic embedding response is not valid JSON.")?;
    let mut rows = value
        .get("data")
        .and_then(Value::as_array)
        .context("Semantic embedding response did not contain data.")?
        .iter()
        .map(|row| {
            let index = row
                .get("index")
                .and_then(Value::as_u64)
                .context("Semantic embedding row did not contain an index.")?;
            let vector = row
                .get("embedding")
                .and_then(Value::as_array)
                .context("Semantic embedding row did not contain a vector.")?
                .iter()
                .map(|value| {
                    value
                        .as_f64()
                        .map(|value| value as f32)
                        .filter(|value| value.is_finite())
                        .context("Semantic embedding vector contains a non-finite value.")
                })
                .collect::<anyhow::Result<Vec<_>>>()?;
            Ok((index, vector))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    rows.sort_by_key(|(index, _)| *index);
    if rows.len() != texts.len()
        || rows
            .iter()
            .enumerate()
            .any(|(expected, (actual, _))| *actual != expected as u64)
    {
        bail!("Semantic embedding response does not align with the request items.");
    }
    let vectors = rows
        .into_iter()
        .map(|(_, vector)| vector)
        .collect::<Vec<_>>();
    let dimensions = vectors.first().map(Vec::len).unwrap_or(0);
    if dimensions == 0 || vectors.iter().any(|vector| vector.len() != dimensions) {
        bail!("Semantic embedding response has inconsistent dimensions.");
    }
    if profile
        .dimensions
        .is_some_and(|expected| expected as usize != dimensions)
    {
        bail!("Semantic embedding response dimensions do not match the profile.");
    }
    let mut key = Sha256::new();
    key.update(profile.base_url.as_bytes());
    key.update([0]);
    key.update(profile.model.as_bytes());
    key.update([0]);
    key.update(dimensions.to_le_bytes());
    Ok(EmbeddingOutput {
        vectors,
        model_key: format!("remote:{:x}", key.finalize()),
        model_id: profile.model,
        dimensions: dimensions as u32,
        input_tokens: value
            .get("usage")
            .and_then(|usage| {
                usage
                    .get("prompt_tokens")
                    .or_else(|| usage.get("total_tokens"))
            })
            .and_then(Value::as_u64),
    })
}

pub fn embed(texts: &[String], purpose: EmbeddingPurpose) -> anyhow::Result<EmbeddingOutput> {
    if texts.is_empty() {
        bail!("At least one text is required for semantic embedding.");
    }
    let settings = settings::load_settings()?;
    match settings.mode {
        AiSemanticSearchMode::Lexical => bail!("Semantic search is not enabled."),
        AiSemanticSearchMode::Builtin | AiSemanticSearchMode::LocalOnnx => {
            let status = model::inspect_model()?;
            if !status.available {
                bail!(
                    "Semantic model is unavailable: {}",
                    status
                        .unavailable_reason
                        .as_deref()
                        .unwrap_or("unknown model error")
                );
            }
            embed_local(
                Path::new(
                    status
                        .model_path
                        .as_deref()
                        .context("Semantic model path is missing.")?,
                ),
                status.model_id.context("Semantic model id is missing.")?,
                status
                    .dimensions
                    .context("Semantic model dimensions are missing.")?,
                texts,
                purpose,
                settings.execution_preference,
            )
        }
        AiSemanticSearchMode::RemoteOpenai => embed_remote(
            settings
                .active_remote_profile_id
                .as_deref()
                .context("No remote semantic profile is active.")?,
            texts,
            purpose,
        ),
    }
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_embedding_tests.rs"]
mod tests;
