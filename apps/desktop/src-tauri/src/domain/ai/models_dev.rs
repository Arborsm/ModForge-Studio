use super::types::{ModelsDevCatalog, ModelsDevModel, ModelsDevProvider};
use crate::domain::app_paths::modforge_data_dir;
use anyhow::{Context, bail};
use reqwest::blocking::Client;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Public models.dev catalog endpoint. It is a static CDN document listing
/// every known provider/model plus `limit.context` / `limit.output` metadata.
const CATALOG_URL: &str = "https://models.dev/api.json";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// In-memory TTL: the catalog only changes when providers ship new models, so
/// one fetch per app session is plenty.
const MEMORY_TTL_MS: i64 = 60 * 60 * 1000;
/// Disk TTL: 24 h avoids re-downloading the full catalog on every app start
/// while still picking up model additions within a day.
const DISK_TTL_MS: i64 = 24 * 60 * 60 * 1000;

static MEMORY_CACHE: OnceLock<Mutex<Option<(i64, ModelsDevCatalog)>>> = OnceLock::new();
static FETCH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn memory_cache() -> &'static Mutex<Option<(i64, ModelsDevCatalog)>> {
    MEMORY_CACHE.get_or_init(|| Mutex::new(None))
}

fn fetch_lock() -> &'static Mutex<()> {
    FETCH_LOCK.get_or_init(|| Mutex::new(()))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn disk_cache_path() -> anyhow::Result<PathBuf> {
    Ok(modforge_data_dir()?
        .join("ai")
        .join("models-dev-catalog.json"))
}

/// Parses the raw models.dev document into the normalized catalog shape.
/// Unknown/absent fields are dropped instead of failing so catalog updates that
/// add new keys never break the app.
pub(crate) fn parse_models_dev_catalog(value: &Value) -> anyhow::Result<ModelsDevCatalog> {
    let providers_object = value
        .as_object()
        .context("models.dev catalog must be a JSON object.")?;
    let mut providers = Vec::with_capacity(providers_object.len());
    for (provider_id, provider_value) in providers_object {
        let Some(provider) = provider_value.as_object() else {
            continue;
        };
        let name = provider
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| provider_id.clone());
        let mut models = Vec::new();
        if let Some(models_value) = provider.get("models").and_then(Value::as_object) {
            for (model_id, model_value) in models_value {
                let Some(model) = model_value.as_object() else {
                    continue;
                };
                let limit = model.get("limit").and_then(Value::as_object);
                let context = limit
                    .and_then(|limit| limit.get("context"))
                    .and_then(Value::as_u64)
                    .filter(|value| *value > 0);
                let output = limit
                    .and_then(|limit| limit.get("output"))
                    .and_then(Value::as_u64)
                    .filter(|value| *value > 0);
                models.push(ModelsDevModel {
                    id: model_id.clone(),
                    name: model
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    context_window_tokens: context,
                    max_output_tokens: output,
                });
            }
        }
        models.sort_by(|left, right| left.id.cmp(&right.id));
        models.dedup_by(|left, right| left.id == right.id);
        providers.push(ModelsDevProvider {
            id: provider_id.clone(),
            name,
            models,
        });
    }
    providers.sort_by(|left, right| left.id.cmp(&right.id));
    if providers.is_empty() {
        bail!("models.dev catalog contains no providers.");
    }
    Ok(ModelsDevCatalog {
        fetched_at_ms: now_ms(),
        providers,
    })
}

fn read_disk_cache(path: &PathBuf) -> Option<ModelsDevCatalog> {
    let content = fs::read_to_string(path).ok()?;
    let catalog: ModelsDevCatalog = serde_json::from_str(&content).ok()?;
    if now_ms().saturating_sub(catalog.fetched_at_ms) > DISK_TTL_MS {
        let _ = fs::remove_file(path);
        return None;
    }
    Some(catalog)
}

fn write_disk_cache(path: &PathBuf, catalog: &ModelsDevCatalog) {
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let temporary = path.with_extension("json.tmp");
    if serde_json::to_string_pretty(catalog)
        .ok()
        .and_then(|json| fs::write(&temporary, format!("{json}\n")).ok())
        .is_some()
        && fs::rename(&temporary, path).is_err()
    {
        let _ = fs::remove_file(&temporary);
    }
}

fn fetch_from_network() -> anyhow::Result<ModelsDevCatalog> {
    let client = Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .context("Failed to create the models.dev HTTP client.")?;
    let response = client
        .get(CATALOG_URL)
        .send()
        .context("models.dev catalog could not be fetched.")?;
    let status = response.status();
    if !status.is_success() {
        bail!("models.dev catalog request failed ({status}).");
    }
    let body = response
        .bytes()
        .context("Failed to read the models.dev catalog response.")?;
    if body.len() > 8 * 1024 * 1024 {
        bail!("models.dev catalog response exceeds the 8 MB limit.");
    }
    let value: Value =
        serde_json::from_slice(&body).context("models.dev returned invalid JSON.")?;
    parse_models_dev_catalog(&value)
}

/// Fetches the models.dev catalog, serving the in-memory cache, then the disk
/// cache, and only hitting the network when both are stale. Concurrent callers
/// share a single fetch.
pub(crate) fn fetch_models_dev_catalog() -> anyhow::Result<ModelsDevCatalog> {
    {
        let cache = memory_cache()
            .lock()
            .map_err(|_| anyhow::anyhow!("models.dev memory cache lock is poisoned."))?;
        if let Some((fetched_at, catalog)) = cache.as_ref() {
            if now_ms().saturating_sub(*fetched_at) <= MEMORY_TTL_MS {
                return Ok(catalog.clone());
            }
        }
    }
    let path = disk_cache_path()?;
    if let Some(catalog) = read_disk_cache(&path) {
        if let Ok(mut cache) = memory_cache().lock() {
            *cache = Some((catalog.fetched_at_ms, catalog.clone()));
        }
        return Ok(catalog);
    }
    let _fetch_guard = fetch_lock()
        .lock()
        .map_err(|_| anyhow::anyhow!("models.dev fetch lock is poisoned."))?;
    // Re-check the memory cache after acquiring the fetch lock: the concurrent
    // caller may have refreshed it while we waited.
    {
        let cache = memory_cache()
            .lock()
            .map_err(|_| anyhow::anyhow!("models.dev memory cache lock is poisoned."))?;
        if let Some((fetched_at, catalog)) = cache.as_ref() {
            if now_ms().saturating_sub(*fetched_at) <= MEMORY_TTL_MS {
                return Ok(catalog.clone());
            }
        }
    }
    let catalog = fetch_from_network()?;
    write_disk_cache(&path, &catalog);
    if let Ok(mut cache) = memory_cache().lock() {
        *cache = Some((catalog.fetched_at_ms, catalog.clone()));
    }
    Ok(catalog)
}

/// Looks up a model's context window from the cached catalog without hitting
/// the network. Returns `None` when the catalog is unavailable or the model is
/// unknown; callers treat that as "metadata not available".
pub(crate) fn cached_context_window(provider_id: &str, model_id: &str) -> Option<u64> {
    let catalog = {
        let cache = memory_cache().lock().ok()?;
        if let Some((fetched_at, catalog)) = cache.as_ref() {
            if now_ms().saturating_sub(*fetched_at) <= MEMORY_TTL_MS {
                Some(catalog.clone())
            } else {
                None
            }
        } else {
            None
        }
    }
    .or_else(|| read_disk_cache(&disk_cache_path().ok()?))?;
    catalog
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .and_then(|provider| provider.models.iter().find(|model| model.id == model_id))
        .and_then(|model| model.context_window_tokens)
}

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/models_dev_tests.rs"]
mod tests;
