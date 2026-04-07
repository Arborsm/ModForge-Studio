use super::{coerce_number, coerce_u32};
use serde_json::json;

#[test]
fn coerce_u32_accepts_integer_like_numbers_and_strings() {
    assert_eq!(coerce_u32(&json!(12)), Some(12));
    assert_eq!(coerce_u32(&json!(12.0)), Some(12));
    assert_eq!(coerce_u32(&json!("12")), Some(12));
    assert_eq!(coerce_u32(&json!("12.0")), Some(12));
    assert_eq!(coerce_u32(&json!(" 12 ")), Some(12));
    assert_eq!(coerce_u32(&json!("12.5")), None);
    assert_eq!(coerce_u32(&json!(-1)), None);
}

#[test]
fn coerce_number_accepts_numeric_strings() {
    assert_eq!(coerce_number(&json!(3.5)), Some(3.5));
    assert_eq!(coerce_number(&json!("3.5")), Some(3.5));
    assert_eq!(coerce_number(&json!("bad")), None);
}
