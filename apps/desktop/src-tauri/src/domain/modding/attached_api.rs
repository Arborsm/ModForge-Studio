use std::collections::{BTreeMap, BTreeSet};

use crate::domain::manifest::normalize_unique_id;

#[derive(Debug, Clone, Default)]
pub(crate) struct AttachedApiRegistry {
    provided_unique_ids_by_provider: BTreeMap<String, Vec<String>>,
    target_asset_kinds: BTreeMap<String, String>,
}

impl AttachedApiRegistry {
    pub(crate) fn provided_unique_ids_for(&self, provider_unique_id: &str) -> Vec<String> {
        self.provided_unique_ids_by_provider
            .get(&normalize_unique_id(provider_unique_id))
            .cloned()
            .unwrap_or_default()
    }

    pub(crate) fn infer_asset_kind(&self, target: &str) -> Option<&str> {
        let normalized_target = normalize_attached_api_target(target);
        if normalized_target.is_empty() {
            return None;
        }

        self.target_asset_kinds
            .get(&normalized_target)
            .map(String::as_str)
    }

    fn register_entry(
        &mut self,
        provider_unique_id: &str,
        provides_unique_ids: &[String],
        targets: &[AttachedApiTargetDescriptor],
    ) {
        let provider_key = normalize_unique_id(provider_unique_id);
        if provider_key.is_empty() {
            return;
        }

        let mut seen_ids = BTreeSet::new();
        let mut registered_ids = Vec::new();
        for unique_id in std::iter::once(provider_unique_id)
            .chain(provides_unique_ids.iter().map(String::as_str))
        {
            let trimmed = unique_id.trim();
            if trimmed.is_empty() {
                continue;
            }
            if seen_ids.insert(normalize_unique_id(trimmed)) {
                registered_ids.push(trimmed.to_string());
            }
        }

        if registered_ids.is_empty() {
            return;
        }

        let entry = self
            .provided_unique_ids_by_provider
            .entry(provider_key)
            .or_default();
        for unique_id in &registered_ids {
            let normalized = normalize_unique_id(unique_id);
            if !entry
                .iter()
                .any(|existing| normalize_unique_id(existing) == normalized)
            {
                entry.push(unique_id.clone());
            }
        }

        for target in targets {
            let asset_path = normalize_asset_path(&target.asset_path);
            let asset_kind = normalize_asset_kind(&target.asset_kind);
            if asset_path.is_empty() || asset_kind.is_empty() {
                continue;
            }

            for unique_id in &registered_ids {
                self.target_asset_kinds.insert(
                    normalize_attached_api_target(&format!("{unique_id}/{asset_path}")),
                    asset_kind.clone(),
                );
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn from_test_descriptors(descriptors: &[(&str, &[&str], &[(&str, &str)])]) -> Self {
        let mut registry = Self::default();
        for (provider_unique_id, provided_unique_ids, targets) in descriptors {
            let target_descriptors = targets
                .iter()
                .map(|(asset_path, asset_kind)| AttachedApiTargetDescriptor {
                    asset_path: (*asset_path).to_string(),
                    asset_kind: (*asset_kind).to_string(),
                })
                .collect::<Vec<_>>();
            registry.register_entry(
                provider_unique_id,
                &provided_unique_ids
                    .iter()
                    .map(|value| (*value).to_string())
                    .collect::<Vec<_>>(),
                &target_descriptors,
            );
        }

        registry
    }

    pub(crate) fn from_descriptors(descriptors: &[AttachedApiDescriptor]) -> Self {
        let mut registry = Self::default();
        for descriptor in descriptors {
            registry.register_entry(
                descriptor.provider_unique_id,
                &descriptor.provided_unique_ids,
                &descriptor.targets,
            );
        }
        registry
    }
}

#[derive(Debug, Clone)]
pub(crate) struct AttachedApiDescriptor {
    pub(crate) provider_unique_id: &'static str,
    pub(crate) provided_unique_ids: Vec<String>,
    pub(crate) targets: Vec<AttachedApiTargetDescriptor>,
}

#[derive(Debug, Clone)]
pub(crate) struct AttachedApiTargetDescriptor {
    pub(crate) asset_path: String,
    pub(crate) asset_kind: String,
}

fn normalize_asset_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
}

fn normalize_asset_kind(kind: &str) -> String {
    match kind.trim().to_ascii_lowercase().as_str() {
        "json" | "image" | "map" => kind.trim().to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn normalize_attached_api_target(target: &str) -> String {
    let trimmed = target.trim();
    let unwrapped = trimmed
        .strip_prefix("{{")
        .and_then(|value| value.strip_suffix("}}"))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(trimmed);

    unwrapped
        .replace('\\', "/")
        .split('/')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>()
        .join("/")
        .to_ascii_lowercase()
}

#[cfg(test)]
#[path = "../../tests/integration/attached_api_tests.rs"]
mod tests;
