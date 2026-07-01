pub(crate) const GRAPHQL_V2: &str = "https://api.nexusmods.com/v2/graphql";
pub(crate) const REST_V1_BASE: &str = "https://api.nexusmods.com/v1";
pub(crate) const REST_TRENDING: &str =
    "https://api.nexusmods.com/v1/games/stardewvalley/mods/trending.json";
// Launcher cover probe 2026-07-01: Nexus image CDN completed 24/32/40/48/56
// concurrent GET body downloads with HTTP 200; 64+ became unstable with TLS
// ECONNRESET, not HTTP 429. Keep the app-side and host-side cover pools below
// that cliff instead of raising the global Network lane worker count.
pub(crate) const IMAGE_CDN_DEFAULT_CONCURRENCY: usize = 40;
pub(crate) const IMAGE_CDN: &str = "https://staticdelivery.nexusmods.com/";
pub(crate) const SMAPI_MODS: &str = "https://smapi.io/api/v3.0/mods";
