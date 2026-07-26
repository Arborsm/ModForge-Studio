use crate::domain::ai::validate_base_url;
use crate::domain::app_paths::localization_semantic_settings_path;
use crate::domain::localization::types::{
    AiSemanticExecutionPreference, AiSemanticRemoteProfile, AiSemanticSearchMode,
    AiSemanticSettingsSnapshot, SaveAiSemanticRemoteProfile, SaveAiSemanticSettingsRequest,
};
use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

const SETTINGS_VERSION: u32 = 1;
const KEYRING_SERVICE: &str = "modforge-studio-semantic-embedding";
const MAX_PROFILES: usize = 16;
const MAX_ID_BYTES: usize = 128;
const MAX_NAME_BYTES: usize = 256;
const MAX_MODEL_BYTES: usize = 512;
const MAX_PATH_BYTES: usize = 16 * 1024;
const MAX_ENVIRONMENT_BYTES: usize = 256;
const MAX_API_KEY_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredRemoteProfile {
    id: String,
    name: String,
    base_url: String,
    model: String,
    dimensions: Option<u32>,
    credential_environment: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    version: u32,
    mode: AiSemanticSearchMode,
    #[serde(default)]
    execution_preference: AiSemanticExecutionPreference,
    local_model_directory: Option<String>,
    active_remote_profile_id: Option<String>,
    remote_profiles: Vec<StoredRemoteProfile>,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            mode: AiSemanticSearchMode::Builtin,
            execution_preference: AiSemanticExecutionPreference::Auto,
            local_model_directory: None,
            active_remote_profile_id: None,
            remote_profiles: Vec::new(),
        }
    }
}

fn bounded(value: &str, field: &str, max: usize) -> anyhow::Result<String> {
    let value = value.trim();
    if value.is_empty() {
        bail!("Semantic embedding profile {field} cannot be empty.");
    }
    if value.len() > max {
        bail!("Semantic embedding profile {field} exceeds {max} bytes.");
    }
    Ok(value.to_string())
}

fn optional_bounded(
    value: Option<&str>,
    field: &str,
    max: usize,
) -> anyhow::Result<Option<String>> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| bounded(value, field, max))
        .transpose()
}

fn entry(profile_id: &str) -> anyhow::Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, profile_id).map_err(Into::into)
}

fn read_key(profile_id: &str) -> anyhow::Result<Option<String>> {
    match entry(profile_id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn delete_key(profile_id: &str) -> anyhow::Result<()> {
    match entry(profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn environment_value(name: Option<&str>) -> Option<String> {
    name.and_then(|name| std::env::var(name).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read_stored(path: &Path) -> anyhow::Result<StoredSettings> {
    if !path.exists() {
        return Ok(StoredSettings::default());
    }
    let bytes = fs::read(path).context("Failed to read semantic search settings.")?;
    let value: StoredSettings =
        serde_json::from_slice(&bytes).context("Failed to parse semantic search settings.")?;
    if value.version != SETTINGS_VERSION {
        bail!("Semantic search settings version is unsupported.");
    }
    Ok(value)
}

fn write_stored(path: &Path, value: &StoredSettings) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("Semantic search settings path has no parent directory.")?;
    fs::create_dir_all(parent).context("Failed to create semantic search settings directory.")?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let bytes = serde_json::to_vec_pretty(value)?;
    {
        use std::io::Write;
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&bytes)?;
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

fn normalize(profile: &SaveAiSemanticRemoteProfile) -> anyhow::Result<StoredRemoteProfile> {
    if profile
        .dimensions
        .is_some_and(|value| value == 0 || value > 16_384)
    {
        bail!("Semantic embedding dimensions must be between 1 and 16384.");
    }
    Ok(StoredRemoteProfile {
        id: bounded(&profile.id, "id", MAX_ID_BYTES)?,
        name: bounded(&profile.name, "name", MAX_NAME_BYTES)?,
        base_url: validate_base_url(&profile.base_url)?,
        model: bounded(&profile.model, "model", MAX_MODEL_BYTES)?,
        dimensions: profile.dimensions,
        credential_environment: optional_bounded(
            profile.credential_environment.as_deref(),
            "credential environment",
            MAX_ENVIRONMENT_BYTES,
        )?,
    })
}

fn snapshot(value: StoredSettings) -> anyhow::Result<AiSemanticSettingsSnapshot> {
    let remote_profiles = value
        .remote_profiles
        .into_iter()
        .map(|profile| {
            let keychain = read_key(&profile.id)?.is_some_and(|value| !value.trim().is_empty());
            let environment =
                environment_value(profile.credential_environment.as_deref()).is_some();
            Ok(AiSemanticRemoteProfile {
                id: profile.id,
                name: profile.name,
                base_url: profile.base_url,
                model: profile.model,
                dimensions: profile.dimensions,
                credential_environment: profile.credential_environment,
                key_configured: keychain || environment,
                resolved_credential_source: if keychain {
                    Some("keychain".into())
                } else if environment {
                    Some("environment".into())
                } else {
                    None
                },
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    Ok(AiSemanticSettingsSnapshot {
        mode: value.mode,
        execution_preference: value.execution_preference,
        active_execution_provider: None,
        execution_fallback_reason: None,
        local_model_directory: value.local_model_directory,
        active_remote_profile_id: value.active_remote_profile_id,
        remote_profiles,
    })
}

pub fn load_settings() -> anyhow::Result<AiSemanticSettingsSnapshot> {
    snapshot(read_stored(&localization_semantic_settings_path()?)?)
}

pub fn save_settings(
    request: SaveAiSemanticSettingsRequest,
) -> anyhow::Result<AiSemanticSettingsSnapshot> {
    if request.remote_profiles.len() > MAX_PROFILES {
        bail!("Semantic search supports at most {MAX_PROFILES} remote profiles.");
    }
    if request
        .local_model_directory
        .as_deref()
        .is_some_and(|value| value.len() > MAX_PATH_BYTES)
    {
        bail!("Semantic local model path exceeds {MAX_PATH_BYTES} bytes.");
    }
    for profile in &request.remote_profiles {
        if profile
            .api_key
            .as_deref()
            .is_some_and(|value| value.trim().len() > MAX_API_KEY_BYTES)
        {
            bail!("Semantic embedding API keys must not exceed {MAX_API_KEY_BYTES} bytes.");
        }
    }
    let path = localization_semantic_settings_path()?;
    let previous = read_stored(&path)?;
    let previous_ids = previous
        .remote_profiles
        .iter()
        .map(|profile| profile.id.clone())
        .collect::<HashSet<_>>();
    let mut ids = HashSet::new();
    let profiles = request
        .remote_profiles
        .iter()
        .map(|profile| {
            let value = normalize(profile)?;
            if !ids.insert(value.id.clone()) {
                bail!("Semantic embedding profile ids must be unique.");
            }
            Ok(value)
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    if request
        .active_remote_profile_id
        .as_ref()
        .is_some_and(|id| !ids.contains(id))
    {
        bail!("The active semantic embedding profile does not exist.");
    }
    if request.mode == AiSemanticSearchMode::LocalOnnx
        && request
            .local_model_directory
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        bail!("Local ONNX mode requires a model directory.");
    }
    if request.mode == AiSemanticSearchMode::RemoteOpenai
        && request.active_remote_profile_id.is_none()
    {
        bail!("Remote semantic mode requires an active embedding profile.");
    }
    let touched = request
        .remote_profiles
        .iter()
        .filter(|profile| {
            profile.clear_api_key
                || profile
                    .api_key
                    .as_deref()
                    .is_some_and(|value| !value.trim().is_empty())
        })
        .map(|profile| profile.id.trim().to_string())
        .chain(previous_ids.difference(&ids).cloned())
        .collect::<HashSet<_>>();
    let previous_credentials = touched
        .iter()
        .map(|id| Ok((id.clone(), read_key(id)?)))
        .collect::<anyhow::Result<BTreeMap<_, _>>>()?;
    let persist = || -> anyhow::Result<()> {
        for profile in &request.remote_profiles {
            if profile.clear_api_key {
                delete_key(profile.id.trim())?;
            } else if let Some(value) = profile
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                entry(profile.id.trim())?.set_password(value)?;
            }
        }
        for id in previous_ids.difference(&ids) {
            delete_key(id)?;
        }
        write_stored(
            &path,
            &StoredSettings {
                version: SETTINGS_VERSION,
                mode: request.mode.clone(),
                execution_preference: request.execution_preference,
                local_model_directory: optional_bounded(
                    request.local_model_directory.as_deref(),
                    "local model path",
                    MAX_PATH_BYTES,
                )?,
                active_remote_profile_id: request.active_remote_profile_id.clone(),
                remote_profiles: profiles,
            },
        )
    };
    if let Err(error) = persist() {
        for (id, value) in previous_credentials {
            match value {
                Some(value) => {
                    let _ =
                        entry(&id).and_then(|entry| entry.set_password(&value).map_err(Into::into));
                }
                None => {
                    let _ = delete_key(&id);
                }
            }
        }
        return Err(error);
    }
    load_settings()
}

pub(crate) fn resolve_remote_credential(profile_id: &str) -> anyhow::Result<Option<String>> {
    let stored = read_stored(&localization_semantic_settings_path()?)?;
    let profile = stored
        .remote_profiles
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .context("The semantic embedding profile does not exist.")?;
    Ok(read_key(profile_id)?
        .or_else(|| environment_value(profile.credential_environment.as_deref())))
}

pub(crate) fn resolve_remote_profile(
    profile_id: &str,
) -> anyhow::Result<(AiSemanticRemoteProfile, Option<String>)> {
    let snapshot = load_settings()?;
    let profile = snapshot
        .remote_profiles
        .into_iter()
        .find(|profile| profile.id == profile_id)
        .context("The semantic embedding profile does not exist.")?;
    let credential = resolve_remote_credential(profile_id)?;
    Ok((profile, credential))
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_semantic_settings_tests.rs"]
mod tests;
