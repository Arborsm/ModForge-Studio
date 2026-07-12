use crate::infrastructure::text_encoding::decode_text_bytes;

#[test]
fn decodes_plain_utf8() {
    let bytes = "{\"Name\": \"中文模组\"}".as_bytes();
    let text = decode_text_bytes(bytes);
    assert_eq!(text, "{\"Name\": \"中文模组\"}");
}

#[test]
fn decodes_utf8_bom() {
    let mut bytes = vec![0xef, 0xbb, 0xbf];
    bytes.extend_from_slice("{\"Name\": \"中文\"}".as_bytes());
    let text = decode_text_bytes(&bytes);
    assert_eq!(text, "{\"Name\": \"中文\"}");
}

#[test]
fn decodes_utf16_le_bom() {
    let text = "中文";
    let mut bytes: Vec<u8> = vec![0xff, 0xfe];
    for ch in text.encode_utf16() {
        bytes.extend_from_slice(&ch.to_le_bytes());
    }
    assert_eq!(decode_text_bytes(&bytes), text);
}

#[test]
fn decodes_utf16_be_bom() {
    let text = "中文";
    let mut bytes: Vec<u8> = vec![0xfe, 0xff];
    for ch in text.encode_utf16() {
        bytes.extend_from_slice(&ch.to_be_bytes());
    }
    assert_eq!(decode_text_bytes(&bytes), text);
}

#[test]
fn decodes_gbk_as_gb18030_fallback() {
    // GB18030 is a strict superset of GBK; encode "中文" in GB18030.
    let (encoded, _, had_errors) = encoding_rs::GB18030.encode("中文");
    assert!(!had_errors);
    let bytes = encoded.into_owned();
    assert_eq!(decode_text_bytes(&bytes), "中文");
}

#[test]
fn decodes_empty_input() {
    assert_eq!(decode_text_bytes(b""), "");
}

#[test]
fn falls_back_to_lossy_utf8_for_invalid_bytes() {
    // 0xff is never valid UTF-8 and is not valid GB18030 either.
    let bytes = vec![0xff, 0xff, 0xff];
    let text = decode_text_bytes(&bytes);
    assert!(!text.is_empty());
    assert!(text.contains('\u{fffd}'));
}
