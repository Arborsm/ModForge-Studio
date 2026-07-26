use super::presets::{preset, presets};
use crate::domain::app_paths::machine_translation_settings_path;
use crate::domain::localization::types::*;
use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;
use url::{Host, Url};

const VERSION: u32 = 1;
const KEYRING_SERVICE: &str = "modforge-studio-machine-translation";
const MAX_PROFILES: usize = 32;
const MAX_FIELD_BYTES: usize = 2_048;
const MAX_SECRET_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredProfile {
    id: String,
    name: String,
    preset_id: String,
    protocol: MachineTranslationProtocol,
    base_url: String,
    region: Option<String>,
    #[serde(default = "enabled_by_default")]
    enabled: bool,
    default_source_locale: Option<String>,
    default_target_locale: Option<String>,
    credential_environments: BTreeMap<String, String>,
}
fn enabled_by_default() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSettings {
    version: u32,
    default_profile_id: Option<String>,
    profiles: Vec<StoredProfile>,
}

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            version: VERSION,
            default_profile_id: None,
            profiles: Vec::new(),
        }
    }
}

fn required(value: &str, field: &str) -> anyhow::Result<String> {
    let value = value.trim();
    if value.is_empty() {
        bail!("Machine translation profile {field} cannot be empty.")
    }
    if value.len() > MAX_FIELD_BYTES {
        bail!("Machine translation profile {field} exceeds the {MAX_FIELD_BYTES} byte limit.")
    }
    Ok(value.to_string())
}

pub(crate) fn validate_base_url(value: &str) -> anyhow::Result<String> {
    let value = required(value, "base URL")?
        .trim_end_matches('/')
        .to_string();
    let url = Url::parse(&value).context("Machine translation profile base URL is invalid.")?;
    let loopback = match url.host() {
        Some(Host::Domain(host)) => host.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(host)) => host.is_loopback(),
        Some(Host::Ipv6(host)) => host.is_loopback(),
        None => false,
    };
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) {
        bail!(
            "Machine translation endpoints must use HTTPS; HTTP is allowed only for loopback hosts."
        )
    }
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        bail!(
            "Machine translation base URL must not contain credentials, query parameters, or fragments."
        )
    }
    Ok(value)
}

fn credential_entry(profile_id: &str, field: &str) -> anyhow::Result<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("{profile_id}:{field}"))
        .context("Failed to open the machine translation credential store.")
}

fn read_credential(profile_id: &str, field: &str) -> anyhow::Result<Option<String>> {
    match credential_entry(profile_id, field)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error).context("Failed to read a machine translation credential."),
    }
}

fn delete_credential(profile_id: &str, field: &str) -> anyhow::Result<()> {
    match credential_entry(profile_id, field)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error).context("Failed to delete a machine translation credential."),
    }
}

fn environment_value(name: Option<&String>) -> Option<String> {
    name.and_then(|name| std::env::var(name).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn read(path: &Path) -> anyhow::Result<StoredSettings> {
    let backup = path.with_extension("json.bak");
    let source = if path.is_file() {
        path
    } else if backup.is_file() {
        backup.as_path()
    } else {
        return Ok(StoredSettings::default());
    };
    let value: StoredSettings = serde_json::from_slice(&fs::read(source).with_context(|| {
        format!(
            "Failed to read machine translation settings {}",
            source.display()
        )
    })?)
    .context("Machine translation settings JSON is invalid.")?;
    if value.version != VERSION {
        bail!(
            "Machine translation settings version {} is not supported.",
            value.version
        )
    }
    Ok(value)
}

fn write(path: &Path, value: &StoredSettings) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("Machine translation settings path has no parent.")?;
    fs::create_dir_all(parent)?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    fs::write(
        &temporary,
        format!("{}\n", serde_json::to_string_pretty(value)?),
    )?;
    if !path.exists() {
        fs::rename(&temporary, path)?;
        let _ = fs::remove_file(backup);
        return Ok(());
    }
    let _ = fs::remove_file(&backup);
    fs::rename(path, &backup)?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(error).context("Failed to replace machine translation settings.");
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn normalize(value: &SaveMachineTranslationProfile) -> anyhow::Result<StoredProfile> {
    let selected = preset(&value.preset_id).context("Unknown machine translation preset.")?;
    if selected.protocol != value.protocol {
        bail!("Machine translation protocol does not match its preset.")
    }
    let allowed = selected
        .credential_fields
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if value
        .credential_environments
        .keys()
        .any(|field| !allowed.contains(field))
        || value
            .credentials
            .keys()
            .any(|field| !allowed.contains(field))
        || value
            .clear_credentials
            .iter()
            .any(|field| !allowed.contains(field))
    {
        bail!("Machine translation profile contains an unsupported credential field.")
    }
    let environments = value
        .credential_environments
        .iter()
        .filter_map(|(field, name)| {
            let name = name.trim();
            (!name.is_empty()).then(|| (field.clone(), name.to_string()))
        })
        .collect::<BTreeMap<_, _>>();
    if environments.values().any(|name| name.len() > 128) {
        bail!("Credential environment names must not exceed 128 bytes.")
    }
    Ok(StoredProfile {
        id: required(&value.id, "id")?,
        name: required(&value.name, "name")?,
        preset_id: selected.id,
        protocol: value.protocol,
        base_url: validate_base_url(&value.base_url)?,
        region: value
            .region
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string),
        enabled: value.enabled,
        default_source_locale: value
            .default_source_locale
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        default_target_locale: value
            .default_target_locale
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        credential_environments: environments,
    })
}

fn snapshot(value: StoredProfile) -> anyhow::Result<MachineTranslationProfile> {
    let fields = preset(&value.preset_id)
        .context("Stored machine translation preset no longer exists.")?
        .credential_fields;
    let mut sources = BTreeMap::new();
    for field in fields {
        if read_credential(&value.id, &field)?.is_some_and(|value| !value.trim().is_empty()) {
            sources.insert(field, "keychain".into());
        } else if environment_value(value.credential_environments.get(&field)).is_some() {
            sources.insert(field, "environment".into());
        }
    }
    Ok(MachineTranslationProfile {
        id: value.id,
        name: value.name,
        preset_id: value.preset_id,
        protocol: value.protocol,
        base_url: value.base_url,
        region: value.region,
        enabled: value.enabled,
        default_source_locale: value.default_source_locale,
        default_target_locale: value.default_target_locale,
        credential_environments: value.credential_environments,
        credential_sources: sources,
    })
}

pub fn load() -> anyhow::Result<MachineTranslationSettingsSnapshot> {
    let value = read(&machine_translation_settings_path()?)?;
    Ok(MachineTranslationSettingsSnapshot {
        version: VERSION,
        default_profile_id: value.default_profile_id,
        profiles: value
            .profiles
            .into_iter()
            .map(snapshot)
            .collect::<anyhow::Result<_>>()?,
        presets: presets(),
    })
}

pub fn save(
    request: SaveMachineTranslationSettingsRequest,
) -> anyhow::Result<MachineTranslationSettingsSnapshot> {
    if request.profiles.len() > MAX_PROFILES {
        bail!("Machine translation settings support at most {MAX_PROFILES} profiles.")
    }
    if request
        .profiles
        .iter()
        .flat_map(|profile| profile.credentials.values())
        .any(|secret| secret.trim().len() > MAX_SECRET_BYTES)
    {
        bail!("Machine translation credentials must not exceed {MAX_SECRET_BYTES} bytes.")
    }
    let path = machine_translation_settings_path()?;
    let previous = read(&path)?;
    let previous_profiles = previous
        .profiles
        .iter()
        .map(|p| (p.id.clone(), p.clone()))
        .collect::<BTreeMap<_, _>>();
    let mut ids = BTreeSet::new();
    let profiles = request
        .profiles
        .iter()
        .map(|profile| {
            let profile = normalize(profile)?;
            if !ids.insert(profile.id.clone()) {
                bail!("Machine translation profile ids must be unique.")
            }
            Ok(profile)
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    if request
        .default_profile_id
        .as_ref()
        .is_some_and(|id| !ids.contains(id))
    {
        bail!("The default machine translation profile does not exist.")
    }
    if request.default_profile_id.as_ref().is_some_and(|id| {
        profiles
            .iter()
            .any(|profile| &profile.id == id && !profile.enabled)
    }) {
        bail!("The default machine translation profile must be enabled.")
    }

    let mut touched = BTreeSet::new();
    for profile in &request.profiles {
        touched.extend(
            profile
                .credentials
                .keys()
                .map(|field| (profile.id.trim().to_string(), field.clone())),
        );
        touched.extend(
            profile
                .clear_credentials
                .iter()
                .map(|field| (profile.id.trim().to_string(), field.clone())),
        );
    }
    for (id, profile) in &previous_profiles {
        if !ids.contains(id) {
            if let Some(selected) = preset(&profile.preset_id) {
                touched.extend(
                    selected
                        .credential_fields
                        .into_iter()
                        .map(|field| (id.clone(), field)),
                );
            }
        }
    }
    let prior = touched
        .iter()
        .map(|(id, field)| Ok(((id.clone(), field.clone()), read_credential(id, field)?)))
        .collect::<anyhow::Result<BTreeMap<_, _>>>()?;
    let persist = || -> anyhow::Result<()> {
        for profile in &request.profiles {
            for field in &profile.clear_credentials {
                delete_credential(profile.id.trim(), field)?;
            }
            for (field, secret) in &profile.credentials {
                if !secret.trim().is_empty() {
                    credential_entry(profile.id.trim(), field)?.set_password(secret.trim())?;
                }
            }
        }
        for (id, field) in &touched {
            if !ids.contains(id) {
                delete_credential(id, field)?;
            }
        }
        write(
            &path,
            &StoredSettings {
                version: VERSION,
                default_profile_id: request.default_profile_id.clone(),
                profiles: profiles.clone(),
            },
        )
    };
    if let Err(error) = persist() {
        for ((id, field), secret) in prior {
            match secret {
                Some(secret) => credential_entry(&id, &field)?.set_password(&secret)?,
                None => delete_credential(&id, &field)?,
            }
        }
        return Err(error);
    }
    load()
}

pub(crate) fn resolve_profile(id: Option<&str>) -> anyhow::Result<MachineTranslationProfile> {
    let settings = load()?;
    let id = id
        .filter(|id| !id.trim().is_empty())
        .map(str::to_string)
        .or(settings.default_profile_id)
        .context("No default machine translation profile is configured.")?;
    settings
        .profiles
        .into_iter()
        .find(|profile| profile.id == id)
        .context("The selected machine translation profile does not exist.")
}

pub(crate) fn resolve_credentials(
    profile: &MachineTranslationProfile,
) -> anyhow::Result<BTreeMap<String, String>> {
    let fields = preset(&profile.preset_id)
        .context("Machine translation preset does not exist.")?
        .credential_fields;
    let mut result = BTreeMap::new();
    for field in fields {
        let value = read_credential(&profile.id, &field)?
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or_else(|| environment_value(profile.credential_environments.get(&field)));
        if let Some(value) = value {
            result.insert(field, value);
        }
    }
    Ok(result)
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_machine_translation_settings_tests.rs"]
mod tests;
