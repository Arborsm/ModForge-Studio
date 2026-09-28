//! TMX map parsing and serialization (Stardew-compatible finite orthogonal maps).
//!
//! Formerly a single ~1.8k-line god file; the implementation now lives in the
//! sibling submodules and is re-exported here so existing call sites
//! (`crate::infrastructure::game_formats::tmx::*`) stay unchanged:
//!
//! - `parse` — reading/deserialization: raw XML structs, serde helpers,
//!   dependency resolution, conversion to `map` types and layer-data decoding.
//! - `scan` — XML preservation scanning: stripping preserved top-level
//!   layers, scanning layer order and tileset/tile extension fragments.
//! - `serialize` — serialization: baking per-cell properties, hoisting
//!   per-cell animations, and writing map/TSX XML.

mod parse;
mod scan;
mod serialize;

pub(crate) use parse::parse_tmx_map;
pub(crate) use serialize::{serialize_tmx_map, serialize_tsx_tileset};
