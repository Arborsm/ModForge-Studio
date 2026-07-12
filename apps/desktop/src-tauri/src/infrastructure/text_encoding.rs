use anyhow::Context;
use std::path::Path;

const UTF8_BOM: &[u8] = b"\xef\xbb\xbf";
const UTF16_LE_BOM: &[u8] = b"\xff\xfe";
const UTF16_BE_BOM: &[u8] = b"\xfe\xff";

fn decode_utf16(bytes: &[u8], endianness: fn([u8; 2]) -> u16) -> String {
    let utf16 = bytes
        .chunks_exact(2)
        .map(|chunk| endianness([chunk[0], chunk[1]]))
        .collect::<Vec<_>>();
    String::from_utf16_lossy(&utf16)
}

fn decode_without_bom(bytes: &[u8]) -> String {
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text;
    }

    if let (decoded, false) = encoding_rs::GB18030.decode_without_bom_handling(bytes) {
        log::warn!(
            target: "TextEncoding",
            "Decoded file as GB18030 fallback ({} bytes)",
            bytes.len()
        );
        return decoded.into_owned();
    }

    log::warn!(
        target: "TextEncoding",
        "Falling back to lossy UTF-8 for file ({} bytes)",
        bytes.len()
    );
    String::from_utf8_lossy(bytes).into_owned()
}

/// Decodes raw text bytes using UTF-8/UTF-16 BOM detection, strict UTF-8,
/// GB18030 fallback, and finally lossy UTF-8.
pub fn decode_text_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    if bytes.starts_with(UTF8_BOM) {
        return decode_without_bom(&bytes[UTF8_BOM.len()..]);
    }

    if bytes.starts_with(UTF16_LE_BOM) {
        return decode_utf16(&bytes[UTF16_LE_BOM.len()..], u16::from_le_bytes);
    }

    if bytes.starts_with(UTF16_BE_BOM) {
        return decode_utf16(&bytes[UTF16_BE_BOM.len()..], u16::from_be_bytes);
    }

    decode_without_bom(bytes)
}

/// Reads a text file from disk and decodes it with encoding fallback.
pub fn read_text_file(path: &Path) -> anyhow::Result<String> {
    let bytes = std::fs::read(path)
        .with_context(|| format!("Failed to read text file {}", path.to_string_lossy()))?;
    Ok(decode_text_bytes(&bytes))
}

#[cfg(test)]
#[path = "../tests/unit/infrastructure/text_encoding_tests.rs"]
mod tests;
