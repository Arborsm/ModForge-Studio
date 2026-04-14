use super::super::types::ContentPatcherMapDebugSummary;
use serde_json::Value;

fn push_unique(values: &mut Vec<String>, next: String) {
    if !values.iter().any(|value| value == &next) {
        values.push(next);
    }
}

pub fn apply_edit_map_patch(
    base: &mut ContentPatcherMapDebugSummary,
    patch: &serde_json::Map<String, Value>,
) -> Result<String, String> {
    let mut changed = Vec::new();

    if let Some(map_properties) = patch.get("MapProperties").and_then(Value::as_object) {
        for key in map_properties.keys() {
            push_unique(&mut base.properties, key.clone());
        }
        if !map_properties.is_empty() {
            changed.push(format!("{} properties", map_properties.len()));
        }
    }

    if let Some(add_warps) = patch.get("AddWarps") {
        match add_warps {
            Value::Array(values) => {
                for warp in values {
                    push_unique(&mut base.warps, warp.to_string());
                }
                if !values.is_empty() {
                    changed.push(format!("{} warps", values.len()));
                }
            }
            Value::String(value) => {
                push_unique(&mut base.warps, value.clone());
                changed.push("1 warp".to_string());
            }
            _ => return Err("EditMap AddWarps must be a string or array.".to_string()),
        }
    }

    if let Some(from_layer) = patch
        .get("FromLayer")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        push_unique(&mut base.layers, from_layer.to_string());
    }
    if let Some(to_layer) = patch
        .get("ToLayer")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        push_unique(&mut base.layers, to_layer.to_string());
    }

    if changed.is_empty() {
        changed.push("map debug summary".to_string());
    }

    Ok(format!("updated {}", changed.join(", ")))
}
