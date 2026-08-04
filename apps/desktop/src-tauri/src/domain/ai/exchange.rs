use super::types::*;
use super::{load_ai_settings, save_ai_settings};
use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::Path;

const FORMAT_VERSION: u32 = 1;
const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableAiProfile {
    id: String,
    name: String,
    preset_id: String,
    protocol: AiProtocol,
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
    reasoning_effort: Option<ReasoningEffort>,
    #[serde(default)]
    stream_translation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PortableAiProfilesDocument {
    format_version: u32,
    credentials_excluded: bool,
    profiles: Vec<PortableAiProfile>,
}

fn portable(profile: &AiProviderProfile) -> PortableAiProfile {
    PortableAiProfile {
        id: profile.id.clone(),
        name: profile.name.clone(),
        preset_id: profile.preset_id.clone(),
        protocol: profile.protocol,
        base_url: profile.base_url.clone(),
        model: profile.model.clone(),
        credential_environment: profile.credential_environment.clone(),
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
    }
}

fn save_profile(profile: PortableAiProfile) -> SaveAiProviderProfile {
    SaveAiProviderProfile {
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
        api_key: None,
        clear_api_key: false,
    }
}

fn read_document(path: &Path) -> anyhow::Result<PortableAiProfilesDocument> {
    let metadata = path
        .metadata()
        .context("AI profile import file does not exist.")?;
    if !metadata.is_file() || metadata.len() > MAX_IMPORT_BYTES {
        bail!("AI profile import must be a regular JSON file no larger than 2 MB.");
    }
    let value: PortableAiProfilesDocument = serde_json::from_slice(
        &fs::read(path).context("Failed to read the AI profile import file.")?,
    )
    .context("Failed to parse the AI profile import file.")?;
    if value.format_version != FORMAT_VERSION || !value.credentials_excluded {
        bail!("AI profile import format or credential policy is unsupported.");
    }
    if value.profiles.len() > 32 {
        bail!("AI profile import contains more than 32 profiles.");
    }
    let mut ids = HashSet::new();
    if value
        .profiles
        .iter()
        .any(|profile| !ids.insert(profile.id.trim()))
    {
        bail!("AI profile import contains duplicate profile ids.");
    }
    Ok(value)
}

fn write_document(path: &Path, value: &PortableAiProfilesDocument) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("AI profile export path has no parent directory.")?;
    fs::create_dir_all(parent).context("Failed to create the AI profile export directory.")?;
    let temporary = path.with_extension("json.tmp");
    let backup = path.with_extension("json.bak");
    {
        let mut file = fs::File::create(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(value)?)?;
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

pub fn export_profiles(request: ExportAiProfilesRequest) -> anyhow::Result<u32> {
    let settings = load_ai_settings()?;
    let selected = request.profile_ids.into_iter().collect::<HashSet<_>>();
    let profiles = settings
        .profiles
        .iter()
        .filter(|profile| selected.is_empty() || selected.contains(&profile.id))
        .map(portable)
        .collect::<Vec<_>>();
    if profiles.is_empty() {
        bail!("No AI profiles matched the export selection.");
    }
    if !selected.is_empty() && profiles.len() != selected.len() {
        bail!("The AI profile export selection contains an unknown profile id.");
    }
    let exported = profiles.len() as u32;
    write_document(
        Path::new(&request.destination_path),
        &PortableAiProfilesDocument {
            format_version: FORMAT_VERSION,
            credentials_excluded: true,
            profiles,
        },
    )?;
    Ok(exported)
}

pub fn preview_profiles_import(
    request: PreviewAiProfilesImportRequest,
) -> anyhow::Result<AiProfileImportPreview> {
    let document = read_document(Path::new(&request.source_path))?;
    let existing = load_ai_settings()?
        .profiles
        .into_iter()
        .map(|profile| profile.id)
        .collect::<HashSet<_>>();
    Ok(AiProfileImportPreview {
        format_version: document.format_version,
        credentials_excluded: true,
        entries: document
            .profiles
            .into_iter()
            .map(|profile| AiProfileImportPreviewEntry {
                conflicts: existing.contains(&profile.id),
                id: profile.id,
                name: profile.name,
                provider: profile.preset_id,
                model: profile.model,
            })
            .collect(),
    })
}

pub fn apply_profiles_import(
    request: ApplyAiProfilesImportRequest,
) -> anyhow::Result<AiProfileImportResult> {
    let document = read_document(Path::new(&request.source_path))?;
    let current = load_ai_settings()?;
    let mut profiles = current
        .profiles
        .iter()
        .cloned()
        .map(|profile| (profile.id.clone(), save_profile(portable(&profile))))
        .collect::<HashMap<_, _>>();
    let mut imported = 0;
    let mut overwritten = 0;
    let mut copied = 0;
    let mut skipped = 0;
    for profile in document.profiles {
        if profiles.contains_key(&profile.id) {
            match request.conflict_policy {
                AiProfileImportConflictPolicy::Overwrite => {
                    profiles.insert(profile.id.clone(), save_profile(profile));
                    overwritten += 1;
                }
                AiProfileImportConflictPolicy::Copy => {
                    let mut profile = save_profile(profile);
                    profile.id = uuid::Uuid::new_v4().to_string();
                    profiles.insert(profile.id.clone(), profile);
                    copied += 1;
                }
                AiProfileImportConflictPolicy::Skip => skipped += 1,
            }
        } else {
            profiles.insert(profile.id.clone(), save_profile(profile));
            imported += 1;
        }
    }
    let mut profiles = profiles.into_values().collect::<Vec<_>>();
    profiles.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then_with(|| left.id.cmp(&right.id))
    });
    let settings = save_ai_settings(SaveAiSettingsRequest {
        default_profile_id: current.default_profile_id,
        profiles,
    })?;
    Ok(AiProfileImportResult {
        settings,
        imported,
        overwritten,
        copied,
        skipped,
    })
}

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/exchange_tests.rs"]
mod tests;
