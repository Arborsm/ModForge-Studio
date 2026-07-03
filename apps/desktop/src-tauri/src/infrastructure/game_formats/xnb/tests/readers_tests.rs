use std::collections::BTreeMap;

use super::super::XnbValue;
use super::super::buffer::CursorReader;
use super::{ReaderResolver, TypeReader, build_reader_from_type_name, format_flags_enum};

#[test]
fn parses_bracket_generic_array_subtypes() {
    let reader = build_reader_from_type_name(
        "System.Collections.Generic.List`1[[System.Int32[], System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e]]",
    )
    .unwrap();

    match reader {
        TypeReader::List(inner) => match *inner {
            TypeReader::Array(array_inner) => {
                assert!(matches!(*array_inner, TypeReader::Int32));
            }
            other => panic!("expected array subtype, got {other:?}"),
        },
        other => panic!("expected list reader, got {other:?}"),
    }
}

#[test]
fn parses_nested_bracket_generic_subtypes_without_losing_inner_brackets() {
    let reader = build_reader_from_type_name(
        "System.Collections.Generic.Dictionary`2[[System.String, System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e],[System.Collections.Generic.List`1[[System.Int32[], System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e]], System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e]]",
    )
    .unwrap();

    match reader {
        TypeReader::Dictionary(key, value) => {
            assert!(matches!(*key, TypeReader::String));
            match *value {
                TypeReader::List(inner) => match *inner {
                    TypeReader::Array(array_inner) => {
                        assert!(matches!(*array_inner, TypeReader::Int32));
                    }
                    other => panic!("expected nested array subtype, got {other:?}"),
                },
                other => panic!("expected nested list subtype, got {other:?}"),
            }
        }
        other => panic!("expected dictionary reader, got {other:?}"),
    }
}

#[test]
fn formats_flags_enum_combinations() {
    let values = BTreeMap::from([
        (0, "None".to_string()),
        (1, "ItemPlacedInMachine".to_string()),
        (2, "OutputCollected".to_string()),
        (4, "MachinePutDown".to_string()),
        (8, "DayUpdate".to_string()),
    ]);

    assert_eq!(
        format_flags_enum(&values, 14),
        Some("OutputCollected, MachinePutDown, DayUpdate".to_string())
    );
    assert_eq!(
        format_flags_enum(&values, 3),
        Some("ItemPlacedInMachine, OutputCollected".to_string())
    );
    assert_eq!(format_flags_enum(&values, 16), None);
}

#[test]
fn texture_reader_consumes_all_mip_levels() {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&0i32.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&4u32.to_le_bytes());
    bytes.extend_from_slice(&[255, 0, 0, 255]);
    bytes.extend_from_slice(&4u32.to_le_bytes());
    bytes.extend_from_slice(&[0, 0, 0, 0]);
    bytes.extend_from_slice(&1234u32.to_le_bytes());

    let mut reader = CursorReader::new(bytes);
    let resolver = ReaderResolver::new(Vec::new());
    let value = TypeReader::Texture2D
        .read(&mut reader, &resolver)
        .expect("texture");

    match value {
        XnbValue::Texture(texture) => {
            assert_eq!(texture.width, 1);
            assert_eq!(texture.height, 1);
            assert_eq!(texture.rgba, vec![255, 0, 0, 255]);
        }
        other => panic!("expected texture, got {other:?}"),
    }
    assert_eq!(reader.read_u32_le().expect("trailing value"), 1234);
}
