use super::super::assets::load_json_patch_asset;
use super::super::types::ContentPatcherProjectSnapshot;
use serde_json::Value;

pub fn apply_load_patch(
    snapshot: &ContentPatcherProjectSnapshot,
    base: &mut Value,
    source_path: &str,
    from_file: &str,
) -> Result<String, String> {
    let loaded = load_json_patch_asset(snapshot, source_path, from_file)?;
    *base = loaded;
    Ok(format!("replaced target with `{from_file}`"))
}
