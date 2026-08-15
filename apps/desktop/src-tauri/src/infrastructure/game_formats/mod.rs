pub mod json_relaxed;
pub mod map;
pub mod tbin;
pub mod tmx;
pub mod xact;
pub mod xnb;

use anyhow::{Context, bail};
use map::MapDocument;
use std::path::Path;

/// Parses a TMX, TBin, or XNB-contained TBin map using its extension and byte signature.
pub fn parse_map_asset(
    bytes: &[u8],
    map_path: &Path,
    relative_path: &str,
) -> anyhow::Result<MapDocument> {
    let extension = map_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "xnb" || bytes.starts_with(b"XNB") {
        let xnb = xnb::read_xnb_from_bytes(bytes.to_vec())?;
        let tbin_bytes = xnb
            .content
            .as_bytes()
            .context("Map XNB did not contain TBin data.")?;
        return tbin::parse_tbin_map(tbin_bytes, map_path, relative_path);
    }
    if extension == "tmx"
        || bytes
            .iter()
            .copied()
            .skip_while(u8::is_ascii_whitespace)
            .next()
            == Some(b'<')
    {
        return tmx::parse_tmx_map(bytes, map_path, relative_path);
    }
    if extension == "tbin" || bytes.starts_with(b"tBIN") {
        return tbin::parse_tbin_map(bytes, map_path, relative_path);
    }
    bail!(
        "Unsupported map format '{}'; expected TMX, TBin, or XNB.",
        map_path.display()
    )
}

#[cfg(test)]
#[path = "../../tests/unit/infrastructure/game_formats/mod.rs"]
mod tests;
