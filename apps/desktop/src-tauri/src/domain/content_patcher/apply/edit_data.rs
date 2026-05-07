use super::super::conditions::evaluate_patch_status;
use super::super::context::SimulationContext;
use serde_json::{Map, Value};
use std::collections::BTreeMap;

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
    patch: &Map<String, Value>,
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

fn resolve_conditional_entry(
    value: &Value,
    context: &SimulationContext,
    project_root_path: Option<&str>,
    ignore_when: bool,
) -> Option<Value> {
    if ignore_when {
        return Some(value.clone());
    }
    let obj = match value.as_object() {
        Some(o) => o,
        None => return Some(value.clone()),
    };
    let when = match obj.get("When") {
        Some(w) => w,
        None => return Some(value.clone()),
    };
    let when_obj = match when {
        Value::Object(map) => {
            let mut bt = BTreeMap::new();
            for (k, v) in map {
                bt.insert(k.clone(), v.clone());
            }
            bt
        }
        _ => return Some(value.clone()),
    };
    let status = evaluate_patch_status(
        &Value::Object(Map::from_iter(when_obj.iter().map(|(k, v)| (k.clone(), v.clone())))),
        context,
        project_root_path,
    );
    if status.status == "applied" {
        obj.get("Value").cloned().or_else(|| {
            let mut cloned = obj.clone();
            cloned.remove("When");
            Some(Value::Object(cloned))
        })
    } else {
        None
    }
}

fn apply_entries_to_object(
    base_object: &mut Map<String, Value>,
    entries: &Map<String, Value>,
    context: &SimulationContext,
    project_root_path: Option<&str>,
    ignore_when: bool,
) {
    for (key, value) in entries {
        let Some(effective_value) = resolve_conditional_entry(value, context, project_root_path, ignore_when) else {
            continue;
        };
        if let Some(existing_value) = base_object.get_mut(key) {
            merge_json_value(existing_value, &effective_value);
        } else {
            base_object.insert(key.clone(), effective_value);
        }
    }
}

fn apply_entries_to_array(
    base_array: &mut Vec<Value>,
    entries: &Map<String, Value>,
    context: &SimulationContext,
    project_root_path: Option<&str>,
    ignore_when: bool,
) {
    for (key, value) in entries {
        let Some(effective_value) = resolve_conditional_entry(value, context, project_root_path, ignore_when) else {
            continue;
        };
        let entry_id = effective_value
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
            merge_json_value(existing_value, &effective_value);
        } else {
            base_array.push(effective_value);
        }
    }
}

// ── Fields support ──

fn set_value_at_path(obj: &mut Map<String, Value>, path: &[&str], value: &Value) {
    if path.is_empty() {
        return;
    }
    if path.len() == 1 {
        if value.is_null() {
            obj.remove(path[0]);
        } else {
            obj.insert(path[0].to_string(), value.clone());
        }
        return;
    }
    let next = obj
        .entry(path[0].to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if let Value::Object(next_obj) = next {
        set_value_at_path(next_obj, &path[1..], value);
    } else {
        // Overwrite non-object intermediate node with an object
        *next = Value::Object(Map::new());
        if let Value::Object(next_obj) = next {
            set_value_at_path(next_obj, &path[1..], value);
        }
    }
}

fn set_field_in_entry(entry: &mut Value, field_key: &str, field_value: &Value) {
    match entry {
        Value::Object(obj) => {
            let segments: Vec<&str> = field_key.split('/').collect();
            if segments.len() <= 1 {
                if field_value.is_null() {
                    obj.remove(field_key);
                } else {
                    obj.insert(field_key.to_string(), field_value.clone());
                }
            } else {
                set_value_at_path(obj, &segments, field_value);
            }
        }
        Value::String(text) => {
            // Slash-delimited string field editing
            let parts: Vec<&str> = text.split('/').collect();
            if let Ok(index) = field_key.parse::<usize>() {
                if index < parts.len() {
                    let mut new_parts: Vec<String> = parts.iter().map(|s| s.to_string()).collect();
                    if field_value.is_null() {
                        new_parts.remove(index);
                    } else {
                        let replacement = match field_value {
                            Value::String(s) => s.clone(),
                            Value::Number(n) => n.to_string(),
                            Value::Bool(b) => if *b { "true".to_string() } else { "false".to_string() },
                            other => other.to_string(),
                        };
                        new_parts[index] = replacement;
                    }
                    *entry = Value::String(new_parts.join("/"));
                }
            }
        }
        _ => {}
    }
}

fn apply_fields_patch(
    base: &mut Value,
    fields: &Map<String, Value>,
) -> Result<String, String> {
    match base {
        Value::Object(base_object) => {
            for (entry_key, field_map) in fields {
                let Some(field_map) = field_map.as_object() else {
                    continue;
                };
                let entry = base_object
                    .entry(entry_key.clone())
                    .or_insert_with(|| Value::Object(Map::new()));
                for (field_key, field_value) in field_map {
                    set_field_in_entry(entry, field_key, field_value);
                }
            }
        }
        Value::Array(base_array) => {
            for (entry_key, field_map) in fields {
                let Some(field_map) = field_map.as_object() else {
                    continue;
                };
                if let Some(entry) = base_array.iter_mut().find(|e| {
                    e.get("Id")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        == Some(entry_key)
                }) {
                    for (field_key, field_value) in field_map {
                        set_field_in_entry(entry, field_key, field_value);
                    }
                }
            }
        }
        _ => {
            return Err(
                "EditData Fields requires the target to be an object or array.".to_string(),
            )
        }
    }

    Ok(format!("updated {} field entries", fields.len()))
}

// ── MoveEntries support ──

#[derive(Debug, Clone)]
struct MoveEntry {
    id: String,
    before_id: Option<String>,
    after_id: Option<String>,
    to_position: Option<String>,
}

fn parse_move_entries(patch: &Map<String, Value>) -> Result<Vec<MoveEntry>, String> {
    let Some(move_entries) = patch.get("MoveEntries").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };

    move_entries
        .iter()
        .map(|entry| {
            let obj = entry.as_object().ok_or("MoveEntries item must be an object.")?;
            let id = obj
                .get("ID")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or("MoveEntries item is missing ID.")?;
            Ok(MoveEntry {
                id: id.to_string(),
                before_id: obj
                    .get("BeforeId")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned),
                after_id: obj
                    .get("AfterId")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned),
                to_position: obj
                    .get("ToPosition")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned),
            })
        })
        .collect()
}

fn apply_move_entries(
    base: &mut Value,
    move_entries: &[MoveEntry],
) -> Result<String, String> {
    let Value::Array(array) = base else {
        return Err("EditData MoveEntries requires the target to be a list (array).".to_string());
    };

    let mut moved_count = 0;

    for move_entry in move_entries {
        let current_index = array.iter().position(|item| {
            item.get("Id")
                .and_then(Value::as_str)
                .map(str::trim)
                .is_some_and(|id| id == move_entry.id)
        });

        let Some(current_index) = current_index else {
            continue;
        };

        let item = array.remove(current_index);

        let target_index = if let Some(ref to_position) = move_entry.to_position {
            match to_position.to_ascii_lowercase().as_str() {
                "top" => 0,
                "bottom" => array.len(),
                _ => to_position.parse::<usize>().unwrap_or(array.len()),
            }
        } else if let Some(ref before_id) = move_entry.before_id {
            array
                .iter()
                .position(|item| {
                    item.get("Id")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .is_some_and(|id| id == before_id.as_str())
                })
                .unwrap_or(array.len())
        } else if let Some(ref after_id) = move_entry.after_id {
            array
                .iter()
                .position(|item| {
                    item.get("Id")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .is_some_and(|id| id == after_id.as_str())
                })
                .map(|i| i + 1)
                .unwrap_or(array.len())
        } else {
            array.len()
        };

        let insert_index = target_index.min(array.len());
        array.insert(insert_index, item);
        moved_count += 1;
    }

    Ok(format!("moved {} entries", moved_count))
}

// ── TextOperations support ──

#[derive(Debug, Clone, PartialEq, Eq)]
enum TextOperationType {
    Append,
    Prepend,
    RemoveDelimited,
    ReplaceDelimited,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ReplaceMode {
    First,
    Last,
    All,
}

#[derive(Debug, Clone)]
struct TextOperation {
    operation: TextOperationType,
    target: Vec<String>,
    value: Option<String>,
    delimiter: String,
    search: Option<String>,
    replace_mode: ReplaceMode,
}

fn parse_text_operations(patch: &Map<String, Value>) -> Result<Vec<TextOperation>, String> {
    let Some(ops) = patch.get("TextOperations").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };

    ops.iter()
        .map(|op| {
            let obj = op.as_object().ok_or("TextOperations item must be an object.")?;

            let operation = obj
                .get("Operation")
                .and_then(Value::as_str)
                .map(str::trim)
                .ok_or("TextOperations item is missing Operation.")?;
            let operation = match operation.to_ascii_lowercase().as_str() {
                "append" => TextOperationType::Append,
                "prepend" => TextOperationType::Prepend,
                "removedelimited" => TextOperationType::RemoveDelimited,
                "replacedelimited" => TextOperationType::ReplaceDelimited,
                other => return Err(format!("Unsupported TextOperation: {other}")),
            };

            let target = obj
                .get("Target")
                .and_then(Value::as_array)
                .ok_or("TextOperations item is missing Target array.")?
                .iter()
                .map(|v| {
                    v.as_str()
                        .map(str::trim)
                        .ok_or("TextOperations Target must contain strings.")
                        .map(ToOwned::to_owned)
                })
                .collect::<Result<Vec<_>, _>>()?;

            let value = obj
                .get("Value")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);

            let delimiter = obj
                .get("Delimiter")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or(" ")
                .to_string();

            let search = obj
                .get("Search")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned);

            let replace_mode = obj
                .get("ReplaceMode")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("All");
            let replace_mode = match replace_mode.to_ascii_lowercase().as_str() {
                "first" => ReplaceMode::First,
                "last" => ReplaceMode::Last,
                _ => ReplaceMode::All,
            };

            Ok(TextOperation {
                operation,
                target,
                value,
                delimiter,
                search,
                replace_mode,
            })
        })
        .collect()
}

fn resolve_text_target<'a>(
    base: &'a mut Value,
    target: &[String],
) -> Result<Option<&'a mut Value>, String> {
    let mut current = base;

    for (i, segment) in target.iter().enumerate() {
        match current {
            Value::Object(obj) => {
                if !obj.contains_key(segment.as_str()) && i == target.len() - 1 {
                    // Last segment doesn't exist yet; will be created as empty string
                    obj.insert(segment.clone(), Value::String(String::new()));
                    return Ok(Some(obj.get_mut(segment.as_str()).expect("just inserted")));
                }
                current = obj.get_mut(segment.as_str()).ok_or_else(|| {
                    format!("TextOperations target segment `{segment}` not found.")
                })?;
            }
            Value::Array(arr) => {
                if let Ok(index) = segment.parse::<usize>() {
                    current = arr.get_mut(index).ok_or_else(|| {
                        format!("TextOperations target index `{segment}` out of bounds.")
                    })?;
                } else {
                    // Find by ID
                    let idx = arr.iter().position(|item| {
                        item.get("Id")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .is_some_and(|id| id == segment)
                    });
                    let idx = idx.ok_or_else(|| {
                        format!("TextOperations target array entry `{segment}` not found.")
                    })?;
                    current = &mut arr[idx];
                }
            }
            _ => {
                return Err(
                    "TextOperations target path must traverse objects or arrays.".to_string(),
                )
            }
        }
    }

    Ok(Some(current))
}

fn apply_delimited_operation(
    text: &str,
    operation: &TextOperationType,
    value: &str,
    delimiter: &str,
    search: Option<&str>,
    replace_mode: &ReplaceMode,
) -> String {
    let parts: Vec<&str> = text.split(delimiter).collect();
    let trimmed_parts: Vec<&str> = parts.iter().map(|p| p.trim()).collect();

    match operation {
        TextOperationType::Append => {
            if text.is_empty() {
                value.to_string()
            } else {
                format!("{text}{delimiter}{value}")
            }
        }
        TextOperationType::Prepend => {
            if text.is_empty() {
                value.to_string()
            } else {
                format!("{value}{delimiter}{text}")
            }
        }
        TextOperationType::RemoveDelimited => {
            let search_term = search.unwrap_or(value);
            trimmed_parts
                .into_iter()
                .filter(|p| *p != search_term)
                .collect::<Vec<_>>()
                .join(delimiter)
        }
        TextOperationType::ReplaceDelimited => {
            let search_term = search.unwrap_or(value);
            let mut replaced = false;
            let mut result = Vec::new();

            for part in trimmed_parts {
                if part == search_term {
                    if !replaced || *replace_mode == ReplaceMode::All {
                        result.push(value);
                        if *replace_mode == ReplaceMode::First {
                            replaced = true;
                        }
                        continue;
                    }
                }
                result.push(part);
            }

            result.join(delimiter)
        }
    }
}

fn apply_text_operations(
    base: &mut Value,
    operations: &[TextOperation],
) -> Result<String, String> {
    let mut applied_count = 0;

    for op in operations {
        let target_value = resolve_text_target(base, &op.target)?;
        let Some(target_value) = target_value else {
            continue;
        };

        let text = match target_value {
            Value::String(s) => s.clone(),
            ref other => other.to_string(),
        };

        let new_text = match op.operation {
            TextOperationType::Append | TextOperationType::Prepend => {
                let value = op.value.as_deref().unwrap_or("");
                apply_delimited_operation(
                    &text,
                    &op.operation,
                    value,
                    &op.delimiter,
                    None,
                    &op.replace_mode,
                )
            }
            TextOperationType::RemoveDelimited => {
                let search = op.search.as_deref().or(op.value.as_deref()).unwrap_or("");
                apply_delimited_operation(
                    &text,
                    &op.operation,
                    "",
                    &op.delimiter,
                    Some(search),
                    &op.replace_mode,
                )
            }
            TextOperationType::ReplaceDelimited => {
                let search = op.search.as_deref().unwrap_or("");
                let value = op.value.as_deref().unwrap_or("");
                apply_delimited_operation(
                    &text,
                    &op.operation,
                    value,
                    &op.delimiter,
                    Some(search),
                    &op.replace_mode,
                )
            }
        };

        *target_value = Value::String(new_text);
        applied_count += 1;
    }

    Ok(format!("applied {} text operations", applied_count))
}

// ── Main entry point ──

pub fn apply_edit_data_patch(
    base: &mut Value,
    patch: &Map<String, Value>,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> Result<String, String> {
    let ignore_when = context.ignore_entry_when_conditions.unwrap_or(false);
    let target_field = parse_target_field_segments(patch)?;
    let entries_for_default = patch
        .get("Entries")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let target_value = if target_field.is_empty() {
        base
    } else {
        resolve_target_field(base, &target_field, &entries_for_default)?
    };

    let mut changes = Vec::new();

    // 1. Apply Entries
    if let Some(entries) = patch.get("Entries").and_then(Value::as_object) {
        match target_value {
            Value::Object(base_object) => {
                apply_entries_to_object(base_object, entries, context, project_root_path, ignore_when)
            }
            Value::Array(base_array) => {
                apply_entries_to_array(base_array, entries, context, project_root_path, ignore_when)
            }
            _ => {
                return Err(
                    "EditData TargetField resolved to a scalar value, which cannot accept Entries."
                        .to_string(),
                )
            }
        }
        changes.push(format!("{} entries", entries.len()));
    }

    // 2. Apply Fields
    if let Some(fields) = patch.get("Fields").and_then(Value::as_object) {
        apply_fields_patch(target_value, fields)?;
        changes.push(format!("{} fields", fields.len()));
    }

    // 3. Apply MoveEntries
    let move_entries = parse_move_entries(patch)?;
    if !move_entries.is_empty() {
        apply_move_entries(target_value, &move_entries)?;
        changes.push(format!("{} moved", move_entries.len()));
    }

    // 4. Apply TextOperations
    let text_ops = parse_text_operations(patch)?;
    if !text_ops.is_empty() {
        apply_text_operations(target_value, &text_ops)?;
        changes.push(format!("{} text ops", text_ops.len()));
    }

    if changes.is_empty() {
        return Err("EditData patch must specify at least one of: Entries, Fields, MoveEntries, or TextOperations.".to_string());
    }

    Ok(format!("updated {}", changes.join(", ")))
}


#[cfg(test)]
#[path = "tests/edit_data_tests.rs"]
mod tests;
