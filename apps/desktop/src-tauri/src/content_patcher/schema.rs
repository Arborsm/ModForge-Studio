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

pub(crate) fn parse_json_str(raw: &str, source_label: &str) -> Result<Value, String> {
    serde_json::from_str::<Value>(raw).or_else(|primary_error| {
        let sanitized = strip_trailing_commas(&strip_json_comments(raw));
        serde_json::from_str::<Value>(&sanitized).map_err(|secondary_error| {
            format!("Failed to parse {source_label}: {primary_error}; relaxed parse also failed: {secondary_error}")
        })
    })
}

pub(crate) fn parse_json_file(path: &Path) -> Result<(String, Value), String> {
    let raw = std::fs::read_to_string(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let parsed = parse_json_str(&raw, &path.display().to_string())?;
    Ok((raw, parsed))
}
