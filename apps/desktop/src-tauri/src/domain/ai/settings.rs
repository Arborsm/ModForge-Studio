use super::presets::provider_presets;
use super::types::{
    AiProviderProfile, AiSettingsSnapshot, SaveAiProviderProfile, SaveAiSettingsRequest,
};
use crate::domain::app_paths::ai_settings_path;
use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use url::{Host, Url};

const SETTINGS_VERSION: u32 = 1;
const KEYRING_SERVICE: &str = "modforge-studio-ai";
const MAX_PROFILES: usize = 32;
const MAX_PROFILE_ID_BYTES: usize = 128;
const MAX_PROFILE_NAME_BYTES: usize = 128;
const MAX_PRESET_ID_BYTES: usize = 128;
const MAX_BASE_URL_BYTES: usize = 2_048;
const MAX_MODEL_ID_BYTES: usize = 256;
const MAX_ENVIRONMENT_NAME_BYTES: usize = 128;
const MAX_API_KEY_BYTES: usize = 16 * 1024;
const MAX_CONTEXT_WINDOW_TOKENS: u64 = 10_000_000;
const MAX_OUTPUT_TOKENS: u64 = 10_000_000;
const MAX_BATCH_BYTES: u64 = 256 * 1024;
const TEMPERATURE_LIMITS: (f64, f64) = (0.0, 2.0);
const TOP_P_LIMITS: (f64, f64) = (0.0, 1.0);
const PENALTY_LIMITS: (f64, f64) = (-2.0, 2.0);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAiProfile {
    id: String,
    name: String,
    preset_id: String,
    protocol: super::types::AiProtocol,
    base_url: String,
    model: String,
    credential_environment: Option<String>,
    #[serde(default)]
    allow_insecure_http: bool,
    #[serde(default)]
    context_window_tokens: Option<u64>,
    #[serde(default)]
    max_output_tokens: Option<u64>,
    #[serde(default)]
    temperature: Option<f64>,
    #[serde(default)]
    top_p: Option<f64>,
    #[serde(default)]
    frequency_penalty: Option<f64>,
    #[serde(default)]
    presence_penalty: Option<f64>,
    #[serde(default)]
    max_batch_bytes: Option<u64>,
    #[serde(default)]
    enable_reasoning: bool,
    #[serde(default)]
    reasoning_effort: Option<super::types::ReasoningEffort>,
    #[serde(default)]
    stream_translation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAiSettings {
    version: u32,
    default_profile_id: Option<String>,
    profiles: Vec<StoredAiProfile>,
}

impl Default for StoredAiSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            default_profile_id: None,
            profiles: Vec::new(),
        }
    }
}

fn required(value: &str, field: &str) -> anyhow::Result<String> {
    let value = value.trim();
    if value.is_empty() {
        bail!("AI profile {field} cannot be empty.");
    }
    Ok(value.to_string())
}

fn bounded(value: String, field: &str, max_bytes: usize) -> anyhow::Result<String> {
    if value.len() > max_bytes {
        bail!("AI profile {field} exceeds the {max_bytes} byte limit.");
    }
    Ok(value)
}

fn validate_optional_token_count(
    value: Option<u64>,
    field: &str,
    max: u64,
) -> anyhow::Result<Option<u64>> {
    if let Some(value) = value {
        if value == 0 || value > max {
            bail!("AI profile {field} must be a positive integer no larger than {max}.");
        }
    }
    Ok(value)
}

fn validate_optional_float(
    value: Option<f64>,
    field: &str,
    (min, max): (f64, f64),
) -> anyhow::Result<Option<f64>> {
    if let Some(value) = value {
        if !value.is_finite() || !(min..=max).contains(&value) {
            bail!("AI profile {field} must be a number between {min} and {max}.");
        }
    }
    Ok(value)
}

pub(crate) fn validate_base_url(value: &str, allow_insecure_http: bool) -> anyhow::Result<String> {
    let value = bounded(required(value, "base URL")?, "base URL", MAX_BASE_URL_BYTES)?
        .trim_end_matches('/')
        .to_string();
    let url = Url::parse(&value).context("AI profile base URL is invalid.")?;
    if url.host().is_none() {
        bail!("AI profile base URL must include a host.");
    }
    if allow_insecure_http {
        if url.scheme() != "https" && url.scheme() != "http" {
            bail!("AI profile endpoints must use HTTP or HTTPS.");
        }
    } else {
        let loopback = match url.host() {
            Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
            Some(Host::Ipv4(host)) => host.is_loopback(),
            Some(Host::Ipv6(host)) => host.is_loopback(),
            None => false,
        };
        if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
            bail!("AI profile endpoints must use HTTPS; HTTP is allowed only for loopback hosts.");
        }
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!("AI profile base URL must not contain credentials, query parameters, or fragments.");
    }
    Ok(value)
}

fn load_stored(path: &Path) -> anyhow::Result<StoredAiSettings> {
    let backup = path.with_extension("json.bak");
    let source = if path.is_file() {
        path
    } else if backup.is_file() {
        backup.as_path()
    } else {
        return Ok(StoredAiSettings::default());
    };
    let content = fs::read_to_string(source)
        .with_context(|| format!("Failed to read AI settings {}", source.display()))?;
    let settings: StoredAiSettings =
        serde_json::from_str(&content).context("AI settings JSON is invalid.")?;
    if settings.version != SETTINGS_VERSION {
        bail!(
            "AI settings version {} is not supported (expected {}).",
            settings.version,
            SETTINGS_VERSION
        );
    }
    Ok(settings)
}

fn entry(profile_id: &str) -> anyhow::Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, profile_id)
        .context("Failed to open the system credential store.")
}

fn delete_keychain_credential(profile_id: &str) -> anyhow::Result<()> {
    match entry(profile_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => {
            Err(error).context("Failed to delete the AI API key from the system credential store.")
        }
    }
}

fn read_keychain_credential(profile_id: &str) -> anyhow::Result<Option<String>> {
    match entry(profile_id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => {
            Err(error).context("Failed to read the AI API key from the system credential store.")
        }
    }
}

fn environment_value(name: Option<&str>) -> Option<String> {
    name.and_then(|name| std::env::var(name).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
pub(crate) fn keychain_password(profile_id: &str) -> Option<String> {
    read_keychain_credential(profile_id)
        .ok()
        .flatten()
        .map(|secret| secret.trim().to_string())
        .filter(|secret| !secret.is_empty())
}

pub(crate) fn resolve_profile_credential(
    profile: &AiProviderProfile,
) -> anyhow::Result<Option<String>> {
    if let Some(secret) = read_keychain_credential(&profile.id)?
        .map(|secret| secret.trim().to_string())
        .filter(|secret| !secret.is_empty())
    {
        return Ok(Some(secret));
    }
    Ok(environment_value(profile.credential_environment.as_deref()))
}

fn snapshot(profile: StoredAiProfile) -> anyhow::Result<AiProviderProfile> {
    let keychain =
        read_keychain_credential(&profile.id)?.is_some_and(|secret| !secret.trim().is_empty());
    let environment = environment_value(profile.credential_environment.as_deref()).is_some();
    Ok(AiProviderProfile {
        id: profile.id,
        name: profile.name,
        preset_id: profile.preset_id,
        protocol: profile.protocol,
        base_url: profile.base_url,
        model: profile.model,
        credential_environment: profile.credential_environment,
        allow_insecure_http: profile.allow_insecure_http,
        context_window_tokens: profile.context_window_tokens,
        max_output_tokens: profile.max_output_tokens,
        temperature: profile.temperature,
        top_p: profile.top_p,
        frequency_penalty: profile.frequency_penalty,
        presence_penalty: profile.presence_penalty,
        max_batch_bytes: profile.max_batch_bytes,
        enable_reasoning: profile.enable_reasoning,
        reasoning_effort: profile.reasoning_effort,
        stream_translation: profile.stream_translation,
        key_configured: keychain || environment,
        resolved_credential_source: if keychain {
            Some("keychain".into())
        } else if environment {
            Some("environment".into())
        } else {
            None
        },
    })
}

pub fn load_ai_settings() -> anyhow::Result<AiSettingsSnapshot> {
    let stored = load_stored(&ai_settings_path()?)?;
    Ok(AiSettingsSnapshot {
        version: SETTINGS_VERSION,
        default_profile_id: stored.default_profile_id,
        profiles: stored
            .profiles
            .into_iter()
            .map(snapshot)
            .collect::<anyhow::Result<Vec<_>>>()?,
        presets: provider_presets(),
    })
}

fn normalize(profile: &SaveAiProviderProfile) -> anyhow::Result<StoredAiProfile> {
    Ok(StoredAiProfile {
        id: bounded(required(&profile.id, "id")?, "id", MAX_PROFILE_ID_BYTES)?,
        name: bounded(
            required(&profile.name, "name")?,
            "name",
            MAX_PROFILE_NAME_BYTES,
        )?,
        preset_id: bounded(
            required(&profile.preset_id, "preset")?,
            "preset",
            MAX_PRESET_ID_BYTES,
        )?,
        protocol: profile.protocol,
        base_url: validate_base_url(&profile.base_url, profile.allow_insecure_http)?,
        model: bounded(
            required(&profile.model, "model")?,
            "model",
            MAX_MODEL_ID_BYTES,
        )?,
        credential_environment: profile
            .credential_environment
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .map(|value| bounded(value, "credential environment", MAX_ENVIRONMENT_NAME_BYTES))
            .transpose()?,
        allow_insecure_http: profile.allow_insecure_http,
        context_window_tokens: validate_optional_token_count(
            profile.context_window_tokens,
            "context window",
            MAX_CONTEXT_WINDOW_TOKENS,
        )?,
        max_output_tokens: validate_optional_token_count(
            profile.max_output_tokens,
            "max output tokens",
            MAX_OUTPUT_TOKENS,
        )?,
        temperature: validate_optional_float(
            profile.temperature,
            "temperature",
            TEMPERATURE_LIMITS,
        )?,
        top_p: validate_optional_float(profile.top_p, "top_p", TOP_P_LIMITS)?,
        frequency_penalty: validate_optional_float(
            profile.frequency_penalty,
            "frequency_penalty",
            PENALTY_LIMITS,
        )?,
        presence_penalty: validate_optional_float(
            profile.presence_penalty,
            "presence_penalty",
            PENALTY_LIMITS,
        )?,
        max_batch_bytes: validate_optional_token_count(
            profile.max_batch_bytes,
            "max batch bytes",
            MAX_BATCH_BYTES,
        )?,
        enable_reasoning: profile.enable_reasoning,
        reasoning_effort: profile.reasoning_effort,
        stream_translation: profile.stream_translation,
    })
}

fn write_stored(path: &Path, settings: &StoredAiSettings) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("AI settings path has no parent directory.")?;
    fs::create_dir_all(parent).context("Failed to create the AI settings directory.")?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    let json =
        serde_json::to_string_pretty(settings).context("Failed to serialize AI settings.")?;
    fs::write(&temporary, format!("{json}\n")).context("Failed to write temporary AI settings.")?;
    if !path.exists() {
        fs::rename(&temporary, path).context("Failed to install AI settings.")?;
        let _ = fs::remove_file(&backup);
        return Ok(());
    }
    let _ = fs::remove_file(&backup);
    fs::rename(path, &backup).context("Failed to stage the previous AI settings.")?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(error).context("Failed to replace AI settings.");
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

pub fn save_ai_settings(request: SaveAiSettingsRequest) -> anyhow::Result<AiSettingsSnapshot> {
    if request.profiles.len() > MAX_PROFILES {
        bail!("AI settings support at most {MAX_PROFILES} provider profiles.");
    }
    for profile in &request.profiles {
        if profile
            .api_key
            .as_deref()
            .is_some_and(|secret| secret.trim().len() > MAX_API_KEY_BYTES)
        {
            bail!("AI API keys must not exceed {MAX_API_KEY_BYTES} bytes.");
        }
    }
    let settings_path = ai_settings_path()?;
    let previous = load_stored(&settings_path)?;
    let previous_ids = previous
        .profiles
        .into_iter()
        .map(|profile| profile.id)
        .collect::<HashSet<_>>();
    let mut ids = HashSet::new();
    let mut profiles = Vec::with_capacity(request.profiles.len());
    for profile in &request.profiles {
        let stored = normalize(profile)?;
        if !ids.insert(stored.id.clone()) {
            bail!("AI profile ids must be unique.");
        }
        profiles.push(stored);
    }
    if request
        .default_profile_id
        .as_ref()
        .is_some_and(|id| !ids.contains(id))
    {
        bail!("The default AI profile does not exist.");
    }
    let mut touched_ids = request
        .profiles
        .iter()
        .filter(|profile| {
            profile.clear_api_key
                || profile
                    .api_key
                    .as_deref()
                    .is_some_and(|key| !key.trim().is_empty())
        })
        .map(|profile| profile.id.trim().to_string())
        .collect::<HashSet<_>>();
    touched_ids.extend(previous_ids.difference(&ids).cloned());
    let previous_credentials = touched_ids
        .iter()
        .map(|id| Ok((id.clone(), read_keychain_credential(id)?)))
        .collect::<anyhow::Result<BTreeMap<_, _>>>()?;
    let persist = || -> anyhow::Result<()> {
        for profile in &request.profiles {
            if profile.clear_api_key {
                delete_keychain_credential(profile.id.trim())?;
            } else if let Some(secret) = profile
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|secret| !secret.is_empty())
            {
                entry(profile.id.trim())?
                    .set_password(secret)
                    .context("Failed to save the AI API key in the system credential store.")?;
            }
        }
        for removed_id in previous_ids.difference(&ids) {
            delete_keychain_credential(removed_id)?;
        }
        write_stored(
            &settings_path,
            &StoredAiSettings {
                version: SETTINGS_VERSION,
                default_profile_id: request.default_profile_id.clone(),
                profiles: profiles.clone(),
            },
        )
    };
    if let Err(error) = persist() {
        let rollback = previous_credentials
            .iter()
            .try_for_each(|(id, secret)| match secret {
                Some(secret) => entry(id)?.set_password(secret).map_err(anyhow::Error::from),
                None => delete_keychain_credential(id),
            });
        if let Err(rollback_error) = rollback {
            anyhow::bail!("{error}; credential rollback also failed: {rollback_error}");
        }
        return Err(error);
    }
    load_ai_settings()
}

pub(crate) fn resolve_profile(profile_id: Option<&str>) -> anyhow::Result<AiProviderProfile> {
    let settings = load_ai_settings()?;
    let id = profile_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .or(settings.default_profile_id)
        .context("No default AI profile is configured.")?;
    settings
        .profiles
        .into_iter()
        .find(|profile| profile.id == id)
        .context("The selected AI profile does not exist.")
}

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/settings_tests.rs"]
mod tests;
