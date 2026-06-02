use super::{parse_from_file_values, parse_target_values};
use serde_json::{Map, Value, json};

fn patch(fields: Value) -> Map<String, Value> {
    fields.as_object().cloned().expect("patch object")
}

#[test]
fn parse_target_values_splits_strings_and_preserves_empty_fallback() {
    assert_eq!(
        parse_target_values(&patch(
            json!({ "Target": "Data/Objects, TileSheets/crops" })
        )),
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
    assert_eq!(
        parse_from_file_values(&patch(json!({ "FromFile": "" }))),
        vec![None]
    );
}
