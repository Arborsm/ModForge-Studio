use serde_json::Value;

fn merge_json_value(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(base_object), Value::Object(patch_object)) => {
            for (key, patch_value) in patch_object {
                if let Some(base_value) = base_object.get_mut(key) {
                    merge_json_value(base_value, patch_value);
                } else {
                    base_object.insert(key.clone(), patch_value.clone());
                }
            }
        }
        (base_value, patch_value) => {
            *base_value = patch_value.clone();
        }
    }
}

pub fn apply_edit_data_patch(base: &mut Value, patch: &serde_json::Map<String, Value>) -> Result<String, String> {
    let entries = patch
        .get("Entries")
        .and_then(Value::as_object)
        .ok_or_else(|| "EditData patch is missing an Entries object.".to_string())?;

    let base_object = base
        .as_object_mut()
        .ok_or_else(|| "EditData requires a JSON object target.".to_string())?;

    for (key, value) in entries {
        if let Some(existing_value) = base_object.get_mut(key) {
            merge_json_value(existing_value, value);
        } else {
            base_object.insert(key.clone(), value.clone());
        }
    }

    Ok(format!("updated {} entries", entries.len()))
}
