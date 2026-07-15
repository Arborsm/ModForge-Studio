use crate::domain::ai::load_ai_settings;
use crate::domain::app_paths::localization_settings_path;
use crate::domain::localization::machine_translation;
use crate::domain::localization::types::LocalizationEngineRef;
use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;

const SETTINGS_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredLocalizationSettings {
    version: u32,
    default_engine: Option<LocalizationEngineRef>,
}

impl Default for StoredLocalizationSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            default_engine: None,
        }
    }
}

fn read(path: &Path) -> anyhow::Result<StoredLocalizationSettings> {
    if !path.is_file() {
        return Ok(StoredLocalizationSettings::default());
    }
    let bytes = fs::read(path).context("Failed to read localization settings.")?;
    let settings = serde_json::from_slice::<StoredLocalizationSettings>(&bytes)
        .context("Failed to parse localization settings.")?;
    if settings.version != SETTINGS_VERSION {
        bail!("Localization settings version is unsupported.");
    }
    Ok(settings)
}

fn write(path: &Path, settings: &StoredLocalizationSettings) -> anyhow::Result<()> {
    let parent = path
        .parent()
        .context("Localization settings path has no parent directory.")?;
    fs::create_dir_all(parent).context("Failed to create the localization settings directory.")?;
    let temporary = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(settings)?;
    {
        let mut file =
            fs::File::create(&temporary).context("Failed to stage localization settings.")?;
        file.write_all(&bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
    }
    if !path.exists() {
        fs::rename(&temporary, path).context("Failed to activate localization settings.")?;
        return Ok(());
    }
    let backup = path.with_extension("json.bak");
    let _ = fs::remove_file(&backup);
    fs::rename(path, &backup).context("Failed to stage the previous localization settings.")?;
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::rename(&backup, path);
        return Err(error).context("Failed to activate localization settings.");
    }
    let _ = fs::remove_file(backup);
    Ok(())
}

fn validate(engine: &LocalizationEngineRef) -> anyhow::Result<()> {
    if engine.profile_id.trim().is_empty() {
        bail!("The default translation profile cannot be empty.");
    }
    match engine.kind.as_str() {
        "generative-ai" => {
            let settings = load_ai_settings()?;
            if !settings
                .profiles
                .iter()
                .any(|profile| profile.id == engine.profile_id)
            {
                bail!("The selected generative AI profile does not exist.");
            }
        }
        "machine-translation" => {
            let settings = machine_translation::load()?;
            if !settings
                .profiles
                .iter()
                .any(|profile| profile.id == engine.profile_id && profile.enabled)
            {
                bail!("The selected machine translation profile does not exist or is disabled.");
            }
        }
        _ => bail!("The default translation engine kind is unsupported."),
    }
    Ok(())
}

pub fn load_default_engine() -> anyhow::Result<Option<LocalizationEngineRef>> {
    Ok(read(&localization_settings_path()?)?.default_engine)
}

pub fn save_default_engine(engine: LocalizationEngineRef) -> anyhow::Result<LocalizationEngineRef> {
    validate(&engine)?;
    write(
        &localization_settings_path()?,
        &StoredLocalizationSettings {
            version: SETTINGS_VERSION,
            default_engine: Some(engine.clone()),
        },
    )?;
    Ok(engine)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_settings_tests.rs"]
mod tests;
