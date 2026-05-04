use base64::Engine;
use serde_json::{json, Map, Number, Value};

#[derive(Debug, Clone)]
pub struct TextureData {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

#[derive(Debug, Clone)]
pub enum XnbValue {
    Null,
    Bool(bool),
    Int(i32),
    UInt(u32),
    Float(f32),
    Double(f64),
    String(String),
    Vector2 {
        x: f32,
        y: f32,
    },
    Vector3 {
        x: f32,
        y: f32,
        z: f32,
    },
    Vector4 {
        x: f32,
        y: f32,
        z: f32,
        w: f32,
    },
    Rectangle {
        x: i32,
        y: i32,
        width: i32,
        height: i32,
    },
    Color {
        r: u8,
        g: u8,
        b: u8,
        a: u8,
    },
    Point {
        x: i32,
        y: i32,
    },
    List(Vec<XnbValue>),
    Array(Vec<XnbValue>),
    Dictionary(Vec<(XnbValue, XnbValue)>),
    Object(Vec<(String, XnbValue)>),
    Bytes(Vec<u8>),
    Texture(TextureData),
}

impl XnbValue {
    pub fn as_bytes(&self) -> Option<&[u8]> {
        match self {
            XnbValue::Bytes(bytes) => Some(bytes),
            _ => None,
        }
    }

    pub fn as_texture(&self) -> Option<&TextureData> {
        match self {
            XnbValue::Texture(texture) => Some(texture),
            _ => None,
        }
    }

    pub fn to_json(&self) -> Value {
        match self {
            XnbValue::Null => Value::Null,
            XnbValue::Bool(value) => Value::Bool(*value),
            XnbValue::Int(value) => json!(*value),
            XnbValue::UInt(value) => json!(*value),
            XnbValue::Float(value) => compact_f32_value(*value),
            XnbValue::Double(value) => compact_f64_value(*value),
            XnbValue::String(value) => Value::String(value.clone()),
            XnbValue::Vector2 { x, y } => {
                json!({ "X": compact_f32_value(*x), "Y": compact_f32_value(*y) })
            }
            XnbValue::Vector3 { x, y, z } => {
                json!({ "X": compact_f32_value(*x), "Y": compact_f32_value(*y), "Z": compact_f32_value(*z) })
            }
            XnbValue::Vector4 { x, y, z, w } => {
                json!({ "X": compact_f32_value(*x), "Y": compact_f32_value(*y), "Z": compact_f32_value(*z), "W": compact_f32_value(*w) })
            }
            XnbValue::Rectangle {
                x,
                y,
                width,
                height,
            } => json!({ "X": x, "Y": y, "Width": width, "Height": height }),
            XnbValue::Color { r, g, b, a } => json!({ "R": r, "G": g, "B": b, "A": a }),
            XnbValue::Point { x, y } => json!({ "X": x, "Y": y }),
            XnbValue::List(values) | XnbValue::Array(values) => {
                Value::Array(values.iter().map(|value| value.to_json()).collect())
            }
            XnbValue::Dictionary(entries) => {
                let mut object = Map::new();
                let mut as_pairs = Vec::with_capacity(entries.len());
                let mut all_object_keys = true;

                for (key, value) in entries {
                    if let Some(key_string) = key.json_object_key() {
                        object.insert(key_string, value.to_json());
                    } else {
                        all_object_keys = false;
                        as_pairs.push(json!([key.to_json(), value.to_json()]));
                    }
                }

                if all_object_keys {
                    Value::Object(object)
                } else {
                    Value::Array(as_pairs)
                }
            }
            XnbValue::Object(entries) => {
                let mut object = Map::new();
                for (key, value) in entries {
                    object.insert(key.clone(), value.to_json());
                }
                Value::Object(object)
            }
            XnbValue::Bytes(bytes) => {
                let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
                Value::String(encoded)
            }
            XnbValue::Texture(texture) => json!({
                "Width": texture.width,
                "Height": texture.height,
                "DataLength": texture.rgba.len()
            }),
        }
    }

    pub(crate) fn json_object_key(&self) -> Option<String> {
        match self {
            XnbValue::String(value) => Some(value.clone()),
            XnbValue::Int(value) => Some(value.to_string()),
            XnbValue::UInt(value) => Some(value.to_string()),
            XnbValue::Bool(value) => Some(value.to_string()),
            _ => None,
        }
    }
}

fn compact_f32_value(value: f32) -> Value {
    compact_number_value(format_float_text(value.to_string()))
}

fn compact_f64_value(value: f64) -> Value {
    if !value.is_finite() {
        return Value::Null;
    }

    compact_number_value(format_float_text(value.to_string()))
}

fn compact_number_value(text: String) -> Value {
    match text.parse::<Number>() {
        Ok(number) => Value::Number(number),
        Err(_) => Value::Null,
    }
}

fn format_float_text(mut text: String) -> String {
    if text == "-0" {
        return "0.0".to_string();
    }
    if !text.contains('.') && !text.contains('e') && !text.contains('E') {
        text.push_str(".0");
    }
    text
}

#[cfg(test)]
#[path = "tests/values_tests.rs"]
mod tests;
