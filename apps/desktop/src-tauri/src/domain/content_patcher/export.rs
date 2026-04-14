use base64::Engine;
use std::fs;

use super::types::{ContentPatcherResultAsset, ExportContentPatcherAssetResult};

pub fn write_result_asset(
    target: &str,
    output_path: &str,
    result: &ContentPatcherResultAsset,
) -> Result<ExportContentPatcherAssetResult, String> {
    match result.kind.as_str() {
        "json" => {
            let json = result
                .json
                .as_ref()
                .ok_or_else(|| "missing json result".to_string())?;
            let formatted = serde_json::to_string_pretty(json).map_err(|err| err.to_string())?;
            fs::write(output_path, formatted).map_err(|err| err.to_string())?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "json".to_string(),
                diagnostics: Vec::new(),
            })
        }
        "image" => {
            let image_data_url = result
                .image_data_url
                .as_deref()
                .ok_or_else(|| "missing image result".to_string())?;
            let (_, encoded) = image_data_url
                .split_once(',')
                .ok_or_else(|| "invalid image data URL".to_string())?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|err| format!("Failed to decode image export payload: {err}"))?;
            fs::write(output_path, bytes).map_err(|err| err.to_string())?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "png".to_string(),
                diagnostics: Vec::new(),
            })
        }
        "map" => {
            let map_debug = result
                .map_debug
                .as_ref()
                .ok_or_else(|| "missing map debug result".to_string())?;
            let formatted =
                serde_json::to_string_pretty(map_debug).map_err(|err| err.to_string())?;
            fs::write(output_path, formatted).map_err(|err| err.to_string())?;
            Ok(ExportContentPatcherAssetResult {
                target: target.to_string(),
                output_path: output_path.to_string(),
                format: "map-debug-json".to_string(),
                diagnostics: Vec::new(),
            })
        }
        unsupported => Err(format!("unsupported export kind `{unsupported}`")),
    }
}
