//! Load patch application: replaces a JSON target with the content of a patch FromFile asset.

use super::super::assets::load_json_patch_asset;
use super::super::types::ContentPatcherProjectSnapshot;
use serde_json::Value;

pub fn apply_load_patch(
    snapshot: &ContentPatcherProjectSnapshot,
    base: &mut Value,
    from_file: &str,
) -> anyhow::Result<String> {
    let loaded = load_json_patch_asset(snapshot, from_file)?;
    *base = loaded;
    Ok(format!("replaced target with `{from_file}`"))
}
