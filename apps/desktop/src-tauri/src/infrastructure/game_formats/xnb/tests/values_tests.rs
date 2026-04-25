use super::XnbValue;
use serde_json::json;

#[test]
fn serializes_single_precision_values_without_binary_noise() {
    assert_eq!(XnbValue::Float(0.6).to_json(), json!(0.6));
    assert_eq!(XnbValue::Float(1.0).to_json(), json!(1.0));
    assert_eq!(
        XnbValue::Vector2 { x: -4.0, y: -32.0 }.to_json(),
        json!({ "X": -4.0, "Y": -32.0 })
    );
}
