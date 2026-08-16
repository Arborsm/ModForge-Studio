pub(crate) mod commands;
mod mime;
pub mod types;

mod cache;
mod export;
mod load;
mod pathing;
mod scan;

pub use types::{
    AudioAssetSummary, DataAssetSummary, EventAssetSummary, FileCacheStats, GameDirectoryInfo,
    ImageAssetSummary, LocalTextFileContent, MapAssetContent, MapAssetSummary,
    ParsedEventAssetContent, TextAssetContent,
};

pub(crate) use cache::{clear_file_cache, get_file_cache_stats};
pub(crate) use export::{export_file, export_map_png};
pub(crate) use load::{
    load_audio_data_url, load_event_asset, load_image_data_url, load_map_asset, load_text_asset,
    load_text_file,
};
pub(crate) use scan::{
    detect_default_game_directory, list_known_game_directories, scan_audio_assets,
    scan_data_assets, scan_events, scan_image_assets, scan_maps, validate_game_directory,
};

// Test-only re-exports: the integration test (wired below) reaches these through
// `super::`, so they must be re-exported here — but only under cfg(test) to
// avoid unused-import warnings in the normal library build.
#[cfg(test)]
pub(crate) use cache::{
    MAP_CLASSIFICATION_CACHE_VERSION, cache_file_path, classify_map_xnb_with_cache, encode_hex,
    map_classification_cache_path,
};
#[cfg(test)]
pub(crate) use pathing::{
    localized_variant_path, logicalized_asset_path, preferred_existing_xnb_path,
    split_localized_stem,
};
#[cfg(test)]
pub(crate) use scan::read_directory_info;

#[cfg(test)]
#[path = "../../tests/integration/assets_tests.rs"]
mod tests;
