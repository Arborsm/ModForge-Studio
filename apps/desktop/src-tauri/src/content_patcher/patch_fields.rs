use serde_json::{Map, Value};

pub(crate) fn parse_target_values(patch: &Map<String, Value>) -> Vec<String> {
    let mut targets = match patch.get("Target") {
        Some(Value::String(value)) => value
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    if targets.is_empty() {
        targets.push(String::new());
    }

    targets
}

pub(crate) fn parse_from_file_values(patch: &Map<String, Value>) -> Vec<Option<String>> {
    let from_files = match patch.get("FromFile") {
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![Some(trimmed.to_string())]
            }
        }
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| Some(value.to_string()))
            .collect::<Vec<_>>(),
        _ => Vec::new(),
    };

    if from_files.is_empty() {
        vec![None]
    } else {
        from_files
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_from_file_values, parse_target_values};
    use serde_json::{json, Map, Value};

    fn patch(fields: Value) -> Map<String, Value> {
        fields.as_object().cloned().expect("patch object")
    }

    #[test]
    fn parse_target_values_splits_strings_and_preserves_empty_fallback() {
        assert_eq!(
            parse_target_values(&patch(json!({ "Target": "Data/Objects, TileSheets/crops" }))),
            vec!["Data/Objects".to_string(), "TileSheets/crops".to_string()]
        );
        assert_eq!(parse_target_values(&patch(json!({}))), vec![String::new()]);
    }

    #[test]
    fn parse_from_file_values_normalizes_empty_and_array_inputs() {
        assert_eq!(
            parse_from_file_values(&patch(json!({ "FromFile": "assets/crops.png" }))),
            vec![Some("assets/crops.png".to_string())]
        );
        assert_eq!(
            parse_from_file_values(&patch(json!({
                "FromFile": ["assets/one.png", "assets/two.png"]
            }))),
            vec![
                Some("assets/one.png".to_string()),
                Some("assets/two.png".to_string())
            ]
        );
        assert_eq!(parse_from_file_values(&patch(json!({ "FromFile": "" }))), vec![None]);
    }
}
