use serde_json::Value;
use std::path::Path;

fn strip_json_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;

    while let Some(ch) = chars.next() {
        if in_line_comment {
            if ch == '\n' {
                in_line_comment = false;
                output.push(ch);
            }
            continue;
        }

        if in_block_comment {
            if ch == '*' && chars.peek() == Some(&'/') {
                chars.next();
                in_block_comment = false;
            }
            continue;
        }

        if in_string {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }

        if ch == '"' {
            in_string = true;
            output.push(ch);
            continue;
        }

        if ch == '/' {
            match chars.peek() {
                Some('/') => {
                    chars.next();
                    in_line_comment = true;
                    continue;
                }
                Some('*') => {
                    chars.next();
                    in_block_comment = true;
                    continue;
                }
                _ => {}
            }
        }

        output.push(ch);
    }

    output
}

fn strip_trailing_commas(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let chars = input.chars().collect::<Vec<_>>();
    let mut index = 0;
    let mut in_string = false;
    let mut escaped = false;

    while index < chars.len() {
        let ch = chars[index];

        if in_string {
            output.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            index += 1;
            continue;
        }

        if ch == '"' {
            in_string = true;
            output.push(ch);
            index += 1;
            continue;
        }

        if ch == ',' {
            let mut look_ahead = index + 1;
            while look_ahead < chars.len() && chars[look_ahead].is_whitespace() {
                look_ahead += 1;
            }

            if look_ahead < chars.len() && matches!(chars[look_ahead], '}' | ']') {
                index += 1;
                continue;
            }
        }

        output.push(ch);
        index += 1;
    }

    output
}

fn escape_control_char(ch: char, output: &mut String) {
    match ch {
        '\n' => output.push_str("\\n"),
        '\r' => output.push_str("\\r"),
        '\t' => output.push_str("\\t"),
        _ => output.push_str(&format!("\\u{:04X}", ch as u32)),
    }
}

fn normalize_json_chars(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    for ch in input.chars() {
        if in_string {
            if escaped {
                output.push(ch);
                escaped = false;
                continue;
            }

            match ch {
                '\\' => {
                    output.push(ch);
                    escaped = true;
                }
                '"' => {
                    output.push(ch);
                    in_string = false;
                }
                _ if ch.is_control() => escape_control_char(ch, &mut output),
                _ => output.push(ch),
            }
            continue;
        }

        if ch == '"' {
            output.push(ch);
            in_string = true;
            continue;
        }

        if ch == '\u{feff}' {
            continue;
        }

        if ch.is_whitespace() && !matches!(ch, ' ' | '\t' | '\r' | '\n') {
            output.push(' ');
            continue;
        }

        output.push(ch);
    }

    output
}

fn decode_json_bytes(bytes: &[u8], source_label: &str) -> Result<String, String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec())
            .map_err(|error| format!("Failed to decode {source_label} as UTF-8: {error}"));
    }

    if bytes.starts_with(&[0xFF, 0xFE]) {
        let utf16 = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return Ok(String::from_utf16_lossy(&utf16));
    }

    if bytes.starts_with(&[0xFE, 0xFF]) {
        let utf16 = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect::<Vec<_>>();
        return Ok(String::from_utf16_lossy(&utf16));
    }

    match String::from_utf8(bytes.to_vec()) {
        Ok(text) => Ok(text),
        Err(_) => Ok(String::from_utf8_lossy(bytes).into_owned()),
    }
}

fn sanitize_json_text(raw: &str) -> String {
    let trimmed = raw.trim_start_matches('\u{feff}');
    let without_comments = strip_json_comments(trimmed);
    let without_trailing_commas = strip_trailing_commas(&without_comments);
    normalize_json_chars(&without_trailing_commas)
}

pub(crate) fn parse_json_str(raw: &str, source_label: &str) -> Result<Value, String> {
    let trimmed = raw.trim_start_matches('\u{feff}');
    serde_json::from_str::<Value>(trimmed).or_else(|primary_error| {
        let sanitized = sanitize_json_text(trimmed);
        serde_json::from_str::<Value>(&sanitized).map_err(|secondary_error| {
            format!("Failed to parse {source_label}: {primary_error}; relaxed parse also failed: {secondary_error}")
        })
    })
}

pub(crate) fn read_json_file(path: &Path, source_label: &str) -> Result<(String, Value), String> {
    let bytes =
        std::fs::read(path).map_err(|error| format!("Failed to read {source_label}: {error}"))?;
    let raw = decode_json_bytes(&bytes, source_label)?;
    let parsed = parse_json_str(&raw, source_label)?;
    Ok((raw, parsed))
}
