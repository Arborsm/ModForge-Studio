use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, ACCEPT_ENCODING, CONTENT_TYPE, REFERER, USER_AGENT};
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

const ACCELERATER_PROJECT_GROUPS_URL_SEED: u8 = 0x5a;
const ACCELERATER_PROJECT_GROUPS_URL_BYTES: &[u8] = &[
    0x32, 0x1f, 0x08, 0xfd, 0xed, 0x95, 0xef, 0xfe, 0x83, 0x83, 0x6d, 0x3b, 0x55, 0x43, 0x2d, 0x38,
    0x07, 0x0b, 0xfc, 0xb3, 0xc0, 0xda, 0xa4, 0xce, 0x93, 0x60, 0x77, 0x40, 0x5a, 0x22, 0x2a, 0x08,
    0x0e, 0xe4, 0xee, 0x82, 0xce, 0xbd, 0x8f, 0x9b, 0x67, 0x70, 0x50, 0x52, 0x34, 0x38, 0x1d, 0x09,
    0xf9,
];
const ACCELERATER_REFERER_SEED: u8 = 0x31;
const ACCELERATER_REFERER_BYTES: &[u8] = &[
    0x42, 0x32, 0x23, 0x5e, 0x5a, 0xa9, 0xe0, 0xc1, 0xd7, 0xae, 0xb4, 0x9b, 0x8e, 0x21, 0x2c, 0x1e,
    0x70, 0x7c, 0x51, 0x44, 0xb7, 0xa3, 0x89, 0x88,
];
const ACCELERATER_MEMORYPACK_MIME_SEED: u8 = 0x73;
const ACCELERATER_MEMORYPACK_MIME_BYTES: &[u8] = &[
    0x12, 0xf4, 0xe5, 0xca, 0xde, 0xab, 0xb8, 0x9e, 0x92, 0x63, 0x73, 0x01, 0x47, 0x7d, 0x0c, 0x17,
    0xee, 0xfb, 0xd7, 0xcf, 0xb7, 0xb9, 0x8a, 0x91,
];
const ACCELERATER_ACCELERATOR_REQUEST_BODY: &[u8] = &[
    0x05, 0x00, 0x00, 0x00, 0x00, 0xf9, 0x7f, 0x00, 0x00, 0x35, 0x95, 0x61, 0x9f, 0xca, 0xa9, 0xde,
    0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00,
    0x00, 0x00,
];
const ACCELERATER_NEXUS_MATCH_DOMAIN: &str = "nexusmods.com";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AcceleraterAccelerateProjectInfo {
    pub(crate) forward_domain: String,
    pub(crate) listen_domains: Vec<String>,
}

fn accelerater_nexus_ip_cache() -> &'static Mutex<Option<IpAddr>> {
    static CACHE: OnceLock<Mutex<Option<IpAddr>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

pub(crate) fn extract_accelerater_accelerate_project_info(
    decompressed: &[u8],
    match_domain: &str,
) -> Option<AcceleraterAccelerateProjectInfo> {
    let full_pattern = format!("{match_domain};*.{match_domain}");
    let start = find_bytes(decompressed, full_pattern.as_bytes())
        .or_else(|| find_bytes(decompressed, match_domain.as_bytes()))?;
    let forward_domain = "cf.rmbgame.net";
    if find_bytes(&decompressed[start..], forward_domain.as_bytes()).is_none() {
        return None;
    }

    let window_end = decompressed.len().min(start.saturating_add(1024));
    let window = &decompressed[start..window_end];
    let mut listen_domains = Vec::new();
    for domain in [
        "www.nexusmods.com",
        "staticdelivery.nexusmods.com",
        "cf-files.nexusmods.com",
        "staticstats.nexusmods.com",
        "users.nexusmods.com",
        "nexusmods.com",
    ] {
        if find_bytes(window, domain.as_bytes()).is_some() {
            listen_domains.push(domain.to_string());
        }
    }

    Some(AcceleraterAccelerateProjectInfo {
        forward_domain: forward_domain.to_string(),
        listen_domains,
    })
}

pub(crate) fn resolve_accelerater_nexus_accelerated_ip() -> Result<IpAddr, String> {
    if let Some(ip) = *accelerater_nexus_ip_cache()
        .lock()
        .expect("accelerater nexus IP cache mutex should not be poisoned")
    {
        return Ok(ip);
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|error| format!("Failed to create Accelerater HTTP client: {error}"))?;
    let memorypack_mime = accelerater_memorypack_mime();
    let compressed = client
        .post(accelerater_project_groups_url())
        .header(CONTENT_TYPE, memorypack_mime.clone())
        .header(ACCEPT, memorypack_mime)
        .header(REFERER, accelerater_referer())
        .header(USER_AGENT, super::http::PUBLIC_BROWSER_USER_AGENT)
        .header(ACCEPT_ENCODING, "br")
        .header(
            "Accept-Language",
            "zh-CN, zh; q=0.9, en-US; q=0.8, en; q=0.7",
        )
        .body(ACCELERATER_ACCELERATOR_REQUEST_BODY)
        .send()
        .map_err(|error| format!("Accelerater accelerator request failed: {error}"))?;
    if !compressed.status().is_success() {
        return Err(format!(
            "Accelerater accelerator request failed: HTTP {}",
            compressed.status()
        ));
    }

    let compressed = compressed
        .bytes()
        .map_err(|error| format!("Failed to read Accelerater accelerator response: {error}"))?;
    let decompressed = decompress_accelerater_brotli_response(&compressed)?;
    let info =
        extract_accelerater_accelerate_project_info(&decompressed, ACCELERATER_NEXUS_MATCH_DOMAIN)
            .ok_or_else(|| {
                "Accelerater response did not include Nexus Mods acceleration data.".to_string()
            })?;
    let ip = resolve_forward_domain_ipv4(&info.forward_domain)?;
    *accelerater_nexus_ip_cache()
        .lock()
        .expect("accelerater nexus IP cache mutex should not be poisoned") = Some(ip);
    Ok(ip)
}

fn decompress_accelerater_brotli_response(compressed: &[u8]) -> Result<Vec<u8>, String> {
    let mut decompressor = brotli::Decompressor::new(compressed, 4096);
    let mut decompressed = Vec::new();
    decompressor
        .read_to_end(&mut decompressed)
        .map_err(|error| format!("Failed to decompress Accelerater Brotli response: {error}"))?;
    Ok(decompressed)
}

fn resolve_forward_domain_ipv4(domain: &str) -> Result<IpAddr, String> {
    (domain, 443)
        .to_socket_addrs()
        .map_err(|error| format!("Failed to resolve Accelerater forward domain {domain}: {error}"))?
        .map(|addr| addr.ip())
        .find(IpAddr::is_ipv4)
        .ok_or_else(|| format!("Accelerater forward domain {domain} did not resolve to IPv4."))
}

fn accelerater_project_groups_url() -> String {
    decode_obfuscated_ascii(
        ACCELERATER_PROJECT_GROUPS_URL_BYTES,
        ACCELERATER_PROJECT_GROUPS_URL_SEED,
    )
}

fn accelerater_referer() -> String {
    decode_obfuscated_ascii(ACCELERATER_REFERER_BYTES, ACCELERATER_REFERER_SEED)
}

fn accelerater_memorypack_mime() -> String {
    decode_obfuscated_ascii(
        ACCELERATER_MEMORYPACK_MIME_BYTES,
        ACCELERATER_MEMORYPACK_MIME_SEED,
    )
}

fn decode_obfuscated_ascii(bytes: &[u8], seed: u8) -> String {
    let decoded = bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| {
            let mask = seed.wrapping_add((index as u8).wrapping_mul(17));
            byte ^ mask
        })
        .collect::<Vec<_>>();
    String::from_utf8(decoded).expect("obfuscated accelerater constant should decode to UTF-8")
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}
