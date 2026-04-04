use serde_json::Value;

pub fn apply_edit_data_patch(base: &mut Value, patch: &serde_json::Map<String, Value>) -> Result<String, String> {
    let entries = patch
        .get("Entries")
        .and_then(Value::as_object)
        .ok_or_else(|| "EditData patch is missing an Entries object.".to_string())?;

    let base_object = base
        .as_object_mut()
        .ok_or_else(|| "EditData requires a JSON object target.".to_string())?;

    for (key, value) in entries {
        base_object.insert(key.clone(), value.clone());
    }

    Ok(format!("updated {} entries", entries.len()))
}
