use super::{can_use_nexus_graphql, endpoints, graphql, rest_api};
use crate::domain::launcher::types::LauncherSettings;
use reqwest::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum LauncherNexusRoute {
    PublicGraphql,
    NexusImages,
    Smapi,
    PrivateGraphql,
    NexusApi,
}

impl LauncherNexusRoute {
    pub(crate) fn id(self) -> &'static str {
        match self {
            Self::PublicGraphql => "publicGraphql",
            Self::NexusImages => "nexusImages",
            Self::Smapi => "smapi",
            Self::PrivateGraphql => "privateGraphql",
            Self::NexusApi => "nexusApi",
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::PublicGraphql => "Nexus Public GraphQL",
            Self::NexusImages => "Nexus Image CDN",
            Self::Smapi => "SMAPI",
            Self::PrivateGraphql => "Nexus Private GraphQL",
            Self::NexusApi => "Nexus REST API",
        }
    }

    pub(crate) fn endpoint(self) -> &'static str {
        match self {
            Self::PublicGraphql | Self::PrivateGraphql => graphql::GRAPHQL_ENDPOINT,
            Self::NexusImages => endpoints::IMAGE_CDN,
            Self::Smapi => endpoints::SMAPI_MODS,
            Self::NexusApi => rest_api::TRENDING_ENDPOINT,
        }
    }

    pub(crate) fn configured_routes(settings: &LauncherSettings) -> Vec<Self> {
        let mut routes = vec![Self::PublicGraphql];
        routes.extend([Self::NexusImages, Self::Smapi]);
        if can_use_nexus_graphql(settings) {
            routes.push(Self::PrivateGraphql);
        }
        if has_launcher_nexus_api_key(settings) {
            routes.push(Self::NexusApi);
        }
        routes
    }

    pub(crate) fn from_route_id(route_id: &str) -> Option<Self> {
        match route_id.trim() {
            "publicGraphql" => Some(Self::PublicGraphql),
            "nexusImages" => Some(Self::NexusImages),
            "smapi" => Some(Self::Smapi),
            "privateGraphql" => Some(Self::PrivateGraphql),
            "nexusApi" => Some(Self::NexusApi),
            _ => None,
        }
    }
}

pub(crate) fn has_launcher_nexus_api_key(settings: &LauncherSettings) -> bool {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
}

pub(crate) fn launcher_nexus_api_key(settings: &LauncherSettings) -> Result<&str, String> {
    settings
        .nexus_api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Configure a Nexus API key before querying the Nexus REST API.".to_string())
}

pub(crate) fn launcher_nexus_route_for_url(url: &str) -> Option<LauncherNexusRoute> {
    let url = Url::parse(url.trim()).ok()?;
    let host = url.host_str()?.trim().to_ascii_lowercase();

    match host.as_str() {
        "api.nexusmods.com" if url.path().trim_end_matches('/') == "/v2/graphql" => {
            Some(LauncherNexusRoute::PublicGraphql)
        }
        "api.nexusmods.com" => Some(LauncherNexusRoute::NexusApi),
        "staticdelivery.nexusmods.com" => Some(LauncherNexusRoute::NexusImages),
        "smapi.io" | "www.smapi.io" => Some(LauncherNexusRoute::Smapi),
        _ => None,
    }
}
