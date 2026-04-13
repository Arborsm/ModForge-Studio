use serde_json::{Map, Value};

enum TargetFieldSegment {
    Key(String),
    Index(usize),
}

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

fn parse_target_field_segments(
    patch: &serde_json::Map<String, Value>,
) -> Result<Vec<TargetFieldSegment>, String> {
    let Some(target_field) = patch.get("TargetField") else {
        return Ok(Vec::new());
    };

    let values = match target_field {
        Value::Array(values) => values.iter().collect::<Vec<_>>(),
        Value::String(_) => vec![target_field].into_iter().collect::<Vec<_>>(),
        _ => {
            return Err(
                "EditData TargetField must be a string or an array of path segments.".to_string(),
            )
        }
    };

    values
        .into_iter()
        .map(|value| match value {
            Value::String(segment) => {
                let trimmed = segment.trim();
                if trimmed.is_empty() {
                    Err("EditData TargetField contains an empty path segment.".to_string())
                } else {
                    Ok(TargetFieldSegment::Key(trimmed.to_string()))
                }
            }
            Value::Number(number) => number
                .as_u64()
                .map(|index| TargetFieldSegment::Index(index as usize))
                .ok_or_else(|| {
                    "EditData TargetField numeric segments must be non-negative integers."
                        .to_string()
                }),
            _ => Err(
                "EditData TargetField path segments must be strings or non-negative integers."
                    .to_string(),
            ),
        })
        .collect()
}

fn entries_look_like_collection(entries: &Map<String, Value>) -> bool {
    !entries.is_empty()
        && entries.values().all(Value::is_object)
        && entries
            .values()
            .any(|value| value.get("Id").and_then(Value::as_str).is_some())
}

fn default_target_value(
    next_segment: Option<&TargetFieldSegment>,
    entries: &Map<String, Value>,
) -> Value {
    match next_segment {
        Some(TargetFieldSegment::Index(_)) => Value::Array(Vec::new()),
        Some(TargetFieldSegment::Key(_)) => Value::Object(Map::new()),
        None if entries_look_like_collection(entries) => Value::Array(Vec::new()),
        None => Value::Object(Map::new()),
    }
}

fn resolve_target_field<'a>(
    base: &'a mut Value,
    segments: &[TargetFieldSegment],
    entries: &Map<String, Value>,
) -> Result<&'a mut Value, String> {
    let mut current = base;

    for (index, segment) in segments.iter().enumerate() {
        let next_segment = segments.get(index + 1);

        match segment {
            TargetFieldSegment::Key(key) => {
                if current.is_null() {
                    *current = Value::Object(Map::new());
                }

                let object = current.as_object_mut().ok_or_else(|| {
                    format!("EditData TargetField segment `{key}` requires a JSON object.")
                })?;

                current = object
                    .entry(key.clone())
                    .or_insert_with(|| default_target_value(next_segment, entries));
            }
            TargetFieldSegment::Index(array_index) => {
                if current.is_null() {
                    *current = Value::Array(Vec::new());
                }

                let array = current.as_array_mut().ok_or_else(|| {
                    format!("EditData TargetField index `{array_index}` requires a JSON array.")
                })?;

                while array.len() <= *array_index {
                    let next_value = if array.len() == *array_index {
                        default_target_value(next_segment, entries)
                    } else {
                        Value::Null
                    };
                    array.push(next_value);
                }

                current = &mut array[*array_index];
            }
        }
    }

    Ok(current)
}

fn apply_entries_to_object(base_object: &mut Map<String, Value>, entries: &Map<String, Value>) {
    for (key, value) in entries {
        if let Some(existing_value) = base_object.get_mut(key) {
            merge_json_value(existing_value, value);
        } else {
            base_object.insert(key.clone(), value.clone());
        }
    }
}

fn apply_entries_to_array(base_array: &mut Vec<Value>, entries: &Map<String, Value>) {
    for (key, value) in entries {
        let entry_id = value
            .get("Id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(key.as_str());

        if let Some(existing_value) = base_array.iter_mut().find(|existing| {
            existing
                .get("Id")
                .and_then(Value::as_str)
                .map(str::trim)
                .is_some_and(|existing_id| existing_id == entry_id)
        }) {
            merge_json_value(existing_value, value);
        } else {
            base_array.push(value.clone());
        }
    }
}

pub fn apply_edit_data_patch(
    base: &mut Value,
    patch: &serde_json::Map<String, Value>,
) -> Result<String, String> {
    let entries = patch
        .get("Entries")
        .and_then(Value::as_object)
        .ok_or_else(|| "EditData patch is missing an Entries object.".to_string())?;

    let target_field = parse_target_field_segments(patch)?;
    let target_value = if target_field.is_empty() {
        base
    } else {
        resolve_target_field(base, &target_field, entries)?
    };

    match target_value {
        Value::Object(base_object) => apply_entries_to_object(base_object, entries),
        Value::Array(base_array) => apply_entries_to_array(base_array, entries),
        _ => {
            return Err(
                "EditData TargetField resolved to a scalar value, which cannot accept Entries."
                    .to_string(),
            )
        }
    }

    Ok(format!("updated {} entries", entries.len()))
}
