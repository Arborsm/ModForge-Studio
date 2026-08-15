//! Nexus Mods request context.
//!
//! The launcher-settings-derived values the nexusmods domain needs to make
//! outbound requests. Launcher/host callers construct and inject this context
//! so the nexusmods domain never reads launcher settings itself (R4: the
//! `nexusmods → launcher` direction must stay empty).

/// Settings-derived request context for nexusmods operations.
///
/// Only the fields the nexusmods domain actually consumes are carried here;
/// today that is the Nexus API key. Callers in the launcher/host layers build
/// this from their own already-loaded settings before calling in.
#[derive(Debug, Clone, Default)]
pub(crate) struct NexusRequestContext {
    api_key: Option<String>,
}

impl NexusRequestContext {
    pub(crate) fn new(api_key: Option<String>) -> Self {
        Self { api_key }
    }

    /// Trimmed, non-empty API key when configured.
    pub(crate) fn api_key(&self) -> Option<&str> {
        self.api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    /// Whether a non-empty API key is configured.
    pub(crate) fn api_key_present(&self) -> bool {
        self.api_key().is_some()
    }
}
