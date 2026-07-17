use anyhow::Context;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

#[derive(Clone, Debug, PartialEq, Eq)]
enum TemplatePart {
    Literal(String),
    Text {
        id: String,
        value: String,
        kind: &'static str,
        prompt_eligible: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RecordTemplate {
    parts: Vec<TemplatePart>,
}

impl RecordTemplate {
    fn render(&self, translations: &HashMap<String, String>) -> String {
        self.parts
            .iter()
            .map(|part| match part {
                TemplatePart::Literal(value) => value.as_str(),
                TemplatePart::Text { id, value, .. } => {
                    translations.get(id).map(String::as_str).unwrap_or(value)
                }
            })
            .collect()
    }

    fn units(&self, output: &mut Vec<StructuredTranslationUnit>) {
        for part in &self.parts {
            if let TemplatePart::Text {
                id,
                value,
                kind,
                prompt_eligible,
            } = part
            {
                output.push(StructuredTranslationUnit {
                    id: id.clone(),
                    text: value.clone(),
                    kind,
                    prompt_eligible: *prompt_eligible,
                });
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct StructuredTranslationUnit {
    pub id: String,
    pub text: String,
    pub kind: &'static str,
    pub prompt_eligible: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct StructuredTranslationDocument {
    original: Value,
    records: BTreeMap<String, RecordTemplate>,
    #[cfg_attr(not(test), allow(dead_code))]
    units: Vec<StructuredTranslationUnit>,
    corpus_units: Vec<StructuredTranslationUnit>,
}

impl StructuredTranslationDocument {
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn units(&self) -> &[StructuredTranslationUnit] {
        &self.units
    }

    pub(crate) fn corpus_units(&self) -> &[StructuredTranslationUnit] {
        &self.corpus_units
    }

    /// Rebuilds the original records while replacing only typed text nodes.
    #[cfg_attr(not(test), allow(dead_code))]
    pub(crate) fn apply_translations(
        &self,
        translations: &HashMap<String, String>,
    ) -> anyhow::Result<Value> {
        let mut restored = self.original.clone();
        let values = restored
            .as_object_mut()
            .context("Structured translation root must remain an object.")?;
        for (key, record) in &self.records {
            values.insert(key.clone(), Value::String(record.render(translations)));
        }
        Ok(restored)
    }
}

fn text_part(
    id: String,
    value: &str,
    kind: &'static str,
    prompt_eligible: bool,
) -> Vec<TemplatePart> {
    let leading_len = value.len() - value.trim_start().len();
    let trailing_start = value.trim_end().len();
    let text = value.trim();
    if text.is_empty() || !text.chars().any(char::is_alphanumeric) {
        return vec![TemplatePart::Literal(value.to_string())];
    }
    let mut parts = Vec::new();
    if leading_len > 0 {
        parts.push(TemplatePart::Literal(value[..leading_len].to_string()));
    }
    parts.push(TemplatePart::Text {
        id,
        value: text.to_string(),
        kind,
        prompt_eligible,
    });
    if trailing_start < value.len() {
        parts.push(TemplatePart::Literal(value[trailing_start..].to_string()));
    }
    parts
}

fn dialogue_text_part(
    id: String,
    value: &str,
    kind: &'static str,
    prompt_eligible: bool,
) -> Vec<TemplatePart> {
    if let Some(start) = value.find("${") {
        if let Some((length, separator)) = gender_block(&value[start..]) {
            let mut parts = dialogue_text_part(id.clone(), &value[..start], kind, prompt_eligible);
            let block = &value[start..start + length];
            let inner = &block[2..block.len() - 2];
            parts.push(TemplatePart::Literal("${".into()));
            for (branch_index, branch) in inner.split(separator).enumerate() {
                if branch_index > 0 {
                    parts.push(TemplatePart::Literal(separator.to_string()));
                }
                parts.extend(text_part(
                    format!("{id}/gender:{branch_index}"),
                    branch,
                    kind,
                    prompt_eligible,
                ));
            }
            parts.push(TemplatePart::Literal("}$".into()));
            parts.extend(dialogue_text_part(
                format!("{id}/tail"),
                &value[start + length..],
                kind,
                prompt_eligible,
            ));
            return parts;
        }
    }
    let trimmed = value.trim_end();
    let suffix_start = trimmed.rfind('$').filter(|index| {
        let command = &trimmed[*index + 1..];
        command == "neutral"
            || !command.is_empty() && command.chars().all(|value| value.is_ascii_digit())
            || command.len() == 1
                && command.chars().next().is_some_and(|value| {
                    matches!(value.to_ascii_lowercase(), 'h' | 's' | 'u' | 'l' | 'a')
                })
    });
    let Some(suffix_start) = suffix_start else {
        return text_part(id, value, kind, prompt_eligible);
    };
    let mut parts = text_part(id, &value[..suffix_start], kind, prompt_eligible);
    parts.push(TemplatePart::Literal(value[suffix_start..].to_string()));
    parts
}

fn slash_record(
    key: &str,
    raw: &str,
    valid_field_counts: &[usize],
    fields: &[(usize, &'static str, &'static str, bool)],
) -> Option<RecordTemplate> {
    let translations = fields
        .iter()
        .map(|(index, name, kind, prompt)| (*index, (*name, *kind, *prompt)))
        .collect::<BTreeMap<_, _>>();
    let values = raw.split('/').collect::<Vec<_>>();
    if !valid_field_counts.contains(&values.len()) {
        return None;
    }
    let mut parts = Vec::new();
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            parts.push(TemplatePart::Literal("/".into()));
        }
        if let Some((name, kind, prompt)) = translations.get(&index) {
            parts.extend(text_part(format!("{key}/{name}"), value, kind, *prompt));
        } else {
            parts.push(TemplatePart::Literal((*value).to_string()));
        }
    }
    Some(RecordTemplate { parts })
}

fn is_integer(value: &str) -> bool {
    value.trim().parse::<i64>().is_ok()
}

fn is_boolean(value: &str) -> bool {
    matches!(value.trim().to_ascii_lowercase().as_str(), "true" | "false")
}

fn is_number(value: &str) -> bool {
    value.trim().parse::<f64>().is_ok()
}

fn valid_monster_drops(value: &str) -> bool {
    let fields = value.split_whitespace().collect::<Vec<_>>();
    fields.len().is_multiple_of(2)
        && fields
            .chunks_exact(2)
            .all(|drop| !drop[0].is_empty() && is_number(drop[1]))
}

fn valid_monster_record(raw: &str) -> bool {
    let fields = raw.split('/').collect::<Vec<_>>();
    fields.len() == 15
        && is_integer(fields[0])
        && is_integer(fields[1])
        && !fields.last().is_none_or(|value| value.trim().is_empty())
        && is_boolean(fields[4])
        && valid_monster_drops(fields[6])
        && is_integer(fields[7])
        && is_number(fields[8])
        && is_integer(fields[9])
        && is_integer(fields[10])
        && is_number(fields[11])
        && is_boolean(fields[12])
}

fn valid_quest_record(raw: &str) -> bool {
    let fields = raw.split('/').collect::<Vec<_>>();
    matches!(fields.len(), 9 | 10)
        && fields.get(6).is_some_and(|value| is_integer(value))
        && fields.get(8).is_some_and(|value| is_boolean(value))
}

fn valid_bundle_record(raw: &str) -> bool {
    let fields = raw.split('/').collect::<Vec<_>>();
    let ingredients = fields
        .get(2)
        .map(|value| value.split_whitespace().collect::<Vec<_>>())
        .unwrap_or_default();
    fields.len() == 7
        && !fields[0].trim().is_empty()
        && !fields[6].trim().is_empty()
        && !ingredients.is_empty()
        && ingredients.len().is_multiple_of(3)
        && ingredients
            .chunks_exact(3)
            .all(|item| is_integer(item[1]) && is_integer(item[2]))
        && is_integer(fields[3])
        && (fields[4].trim().is_empty() || is_integer(fields[4]))
}

fn valid_boot_record(raw: &str) -> bool {
    let fields = raw.split('/').collect::<Vec<_>>();
    matches!(fields.len(), 7 | 8)
        && fields[2..6].iter().all(|value| is_integer(value))
        && !fields[6].trim().is_empty()
}

fn valid_hat_record(raw: &str) -> bool {
    let fields = raw.split('/').collect::<Vec<_>>();
    (6..=8).contains(&fields.len())
        && (is_boolean(fields[2]) || fields[2].eq_ignore_ascii_case("hide"))
        && is_boolean(fields[3])
        && !fields[5].trim().is_empty()
}

fn dialogue_field(key: &str, raw: &str, kind: &'static str, prompt: bool) -> RecordTemplate {
    if let Some(quick_start) = raw
        .find("$y '")
        .filter(|index| *index == 0 || raw[..*index].ends_with('#'))
    {
        let protocol_start = quick_start.saturating_sub(usize::from(quick_start > 0));
        let body_start = quick_start + "$y '".len();
        if let Some(body_end) = raw[body_start..].find('\'').map(|index| body_start + index) {
            let mut parts = dialogue_field(key, &raw[..protocol_start], kind, prompt).parts;
            parts.push(TemplatePart::Literal(
                raw[protocol_start..body_start].to_string(),
            ));
            for (field_index, field) in raw[body_start..body_end].split('_').enumerate() {
                if field_index > 0 {
                    parts.push(TemplatePart::Literal("_".into()));
                }
                for (part_index, part) in field.split('*').enumerate() {
                    if part_index > 0 {
                        parts.push(TemplatePart::Literal("*".into()));
                    }
                    parts.extend(text_part(
                        format!("{key}/quick:{field_index}/part:{part_index}"),
                        part,
                        kind,
                        prompt,
                    ));
                }
            }
            parts.push(TemplatePart::Literal("'".into()));
            let suffix = &raw[body_end + 1..];
            if let Some(suffix) = suffix.strip_prefix('#') {
                parts.push(TemplatePart::Literal("#".into()));
                parts.extend(
                    dialogue_field(&format!("{key}/after-quick"), suffix, kind, prompt).parts,
                );
            } else {
                parts.extend(
                    dialogue_field(&format!("{key}/after-quick"), suffix, kind, prompt).parts,
                );
            }
            return RecordTemplate { parts };
        }
    }
    if let Some(question_start) = find_dialogue_command(raw, "$q") {
        let mut parts = dialogue_field(key, &raw[..question_start], kind, prompt).parts;
        let question = &raw[question_start..];
        let Some(prompt_start) = question.find('#') else {
            parts.push(TemplatePart::Literal(question.to_string()));
            return RecordTemplate { parts };
        };
        parts.push(TemplatePart::Literal(
            question[..prompt_start + 1].to_string(),
        ));
        let body = &question[prompt_start + 1..];
        let first_choice = body.find("#$r").unwrap_or(body.len());
        parts.extend(dialogue_text_part(
            format!("{key}/prompt"),
            &body[..first_choice],
            kind,
            prompt,
        ));
        let mut cursor = first_choice;
        let mut choice = 0;
        while cursor < body.len() {
            let section = &body[cursor..];
            let next = section[3..]
                .find("#$r")
                .map_or(body.len(), |index| cursor + 3 + index);
            let current = &body[cursor..next];
            let Some(label_start) = current[1..].find('#').map(|index| index + 1) else {
                parts.push(TemplatePart::Literal(current.to_string()));
                cursor = next;
                continue;
            };
            parts.push(TemplatePart::Literal(
                current[..label_start + 1].to_string(),
            ));
            parts.extend(dialogue_text_part(
                format!("{key}/choice:{choice}"),
                &current[label_start + 1..],
                kind,
                prompt,
            ));
            choice += 1;
            cursor = next;
        }
        return RecordTemplate { parts };
    }
    let mut parts = Vec::new();
    let mut cursor = 0;
    let mut page = 0;
    let mut gender_index = 0;
    while cursor < raw.len() {
        let rest = &raw[cursor..];
        if let Some((start, length, separator)) = next_dialogue_gender_block(rest) {
            let command = next_dialogue_command(rest).map(|(index, _)| index);
            let marker = next_dialogue_marker(rest).map(|(index, _)| index);
            if command
                .into_iter()
                .chain(marker)
                .all(|index| start <= index)
            {
                parts.extend(dialogue_text_part(
                    format!("{key}/page:{page}"),
                    &rest[..start],
                    kind,
                    prompt,
                ));
                let block = &rest[start..start + length];
                let inner = &block[2..block.len() - 2];
                parts.push(TemplatePart::Literal("${".into()));
                for (branch_index, branch) in inner.split(separator).enumerate() {
                    if branch_index > 0 {
                        parts.push(TemplatePart::Literal(separator.to_string()));
                    }
                    parts.extend(text_part(
                        format!("{key}/gender:{gender_index}/branch:{branch_index}"),
                        branch,
                        kind,
                        prompt,
                    ));
                }
                parts.push(TemplatePart::Literal("}$".into()));
                cursor += start + length;
                page += 1;
                gender_index += 1;
                continue;
            }
        }
        if let Some((start, length)) = next_dialogue_command(rest) {
            let marker = next_dialogue_marker(rest).map(|(index, _)| index);
            if marker.is_none_or(|index| start <= index) {
                parts.extend(dialogue_text_part(
                    format!("{key}/page:{page}"),
                    &rest[..start],
                    kind,
                    prompt,
                ));
                parts.push(TemplatePart::Literal(
                    rest[start..start + length].to_string(),
                ));
                cursor += start + length;
                page += 1;
                continue;
            }
        }
        let next = next_dialogue_marker(rest);
        let (end, marker) = next.unwrap_or((rest.len(), ""));
        parts.extend(dialogue_text_part(
            format!("{key}/page:{page}"),
            &rest[..end],
            kind,
            prompt,
        ));
        if marker.is_empty() {
            break;
        }
        parts.push(TemplatePart::Literal(marker.to_string()));
        cursor += end + marker.len();
        page += 1;
    }
    if raw.is_empty() {
        parts.push(TemplatePart::Literal(String::new()));
    }
    RecordTemplate { parts }
}

fn find_dialogue_command(raw: &str, command: &str) -> Option<usize> {
    raw.char_indices().find_map(|(index, _)| {
        if index > 0 && !raw[..index].ends_with('#') {
            return None;
        }
        let rest = &raw[index..];
        if !rest.starts_with(command) {
            return None;
        }
        rest[command.len()..]
            .chars()
            .next()
            .is_none_or(|next| next.is_whitespace() || next == '#')
            .then_some(index)
    })
}

fn next_dialogue_marker(raw: &str) -> Option<(usize, &'static str)> {
    const MARKERS: &[&str] = &["#$b#", "#$e#", "$b#", "$e#", "||", "#", "|", "^", "¦"];
    raw.char_indices().find_map(|(index, _)| {
        MARKERS
            .iter()
            .copied()
            .find(|marker| raw[index..].starts_with(marker))
            .map(|marker| (index, marker))
    })
}

fn next_dialogue_gender_block(raw: &str) -> Option<(usize, usize, char)> {
    raw.char_indices().find_map(|(index, _)| {
        gender_block(&raw[index..]).map(|(length, separator)| (index, length, separator))
    })
}

fn next_dialogue_command(raw: &str) -> Option<(usize, usize)> {
    const COMMANDS: &[&str] = &[
        "$action", "$query", "$k", "$1", "$c", "$t", "$r", "$p", "$d", "$y",
    ];
    raw.char_indices().find_map(|(index, _)| {
        if index > 0 && !raw[..index].ends_with('#') {
            return None;
        }
        let rest = &raw[index..];
        let _command = COMMANDS.iter().copied().find(|command| {
            rest.starts_with(command)
                && rest[command.len()..]
                    .chars()
                    .next()
                    .is_none_or(|next| next.is_whitespace() || matches!(next, '#' | '|' | '\''))
        })?;
        let command_end = rest.find('#').unwrap_or(rest.len());
        let start = if index > 0 { index - 1 } else { index };
        let delimiter = usize::from(command_end < rest.len());
        Some((start, index - start + command_end + delimiter))
    })
}

pub(crate) fn dialogue_units(
    key: &str,
    raw: &str,
    kind: &'static str,
    prompt_eligible: bool,
) -> Vec<StructuredTranslationUnit> {
    let mut units = Vec::new();
    dialogue_field(key, raw, kind, prompt_eligible).units(&mut units);
    units
}

pub(crate) fn has_dialogue_protocol(raw: &str) -> bool {
    ["#$b#", "#$e#", "$b#", "$e#", "$q", "#$r"]
        .iter()
        .any(|marker| raw.contains(marker))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ControlSyntax {
    Mail,
    SecretNote,
}

fn reveal_taste_length(raw: &str) -> Option<usize> {
    let prefix = "%revealtaste";
    let payload = raw.strip_prefix(prefix)?;
    let end = payload
        .find(|character: char| {
            character.is_whitespace() || matches!(character, '#' | '%' | '$' | '{' | '^' | '*')
        })
        .unwrap_or(payload.len());
    let value = &payload[..end];
    if let Some(modern) = value.strip_prefix(':') {
        let mut fields = modern.split(':');
        let character = fields.next().unwrap_or_default();
        let item = fields.next().unwrap_or_default();
        if !character.is_empty() && !item.is_empty() && fields.next().is_none() {
            return Some(prefix.len() + end);
        }
    }
    let digit = value.find(|character: char| character.is_ascii_digit())?;
    let (character, item) = value.split_at(digit);
    (!character.is_empty() && !item.is_empty() && item.chars().all(|value| value.is_ascii_digit()))
        .then_some(prefix.len() + end)
}

fn terminated_mail_command_length(raw: &str, command: &str) -> Option<usize> {
    raw.starts_with(command)
        .then(|| raw.find("%%").map(|end| end + 2))
        .flatten()
}

fn custom_mail_format_length(raw: &str) -> Option<usize> {
    let end = raw.strip_prefix('[')?.find(']')? + 1;
    let fields = raw[1..end].split_whitespace().collect::<Vec<_>>();
    let valid = match fields.as_slice() {
        ["textcolor", _color, ..] => true,
        ["letterbg"] => true,
        ["letterbg", background] => background.parse::<i32>().is_ok(),
        ["letterbg", _asset, background] => background.parse::<i32>().is_ok(),
        ["letterbg", _, _, _, ..] => true,
        _ => false,
    };
    valid.then_some(end + 1)
}

fn control_length(raw: &str, syntax: ControlSyntax, at_line_start: bool) -> Option<usize> {
    if raw.starts_with("\r\n") {
        return Some(2);
    }
    if matches!(raw.as_bytes().first(), Some(b'^' | b'@' | b'\r' | b'\n')) {
        return Some(1);
    }
    if syntax == ControlSyntax::Mail && raw.starts_with('¦') {
        return Some('¦'.len_utf8());
    }
    if syntax == ControlSyntax::SecretNote && at_line_start && raw.starts_with('*') {
        return Some(1);
    }
    if let Some(length) = custom_mail_format_length(raw) {
        return Some(length);
    }
    match syntax {
        ControlSyntax::Mail => {
            if let Some(length) = terminated_mail_command_length(raw, "%action") {
                return Some(length);
            }
            if let Some(length) = terminated_mail_command_length(raw, "%item") {
                return Some(length);
            }
            if raw.starts_with("%secretsanta") {
                return Some("%secretsanta".len());
            }
            None
        }
        ControlSyntax::SecretNote => reveal_taste_length(raw),
    }
}

fn gender_block(raw: &str) -> Option<(usize, char)> {
    let body = raw.strip_prefix("${")?;
    let end = body.find("}$")?;
    let body = &body[..end];
    let separator = if body.contains('¦') { '¦' } else { '^' };
    Some((end + 4, separator))
}

fn next_control_or_gender(
    raw: &str,
    syntax: ControlSyntax,
) -> Option<(usize, usize, Option<char>)> {
    raw.char_indices().find_map(|(index, _)| {
        if let Some((length, separator)) = gender_block(&raw[index..]) {
            return Some((index, length, Some(separator)));
        }
        let at_line_start = raw[..index].rsplit_once(['^', '\r', '\n']).map_or_else(
            || raw[..index].trim().is_empty(),
            |(_, line)| line.trim().is_empty(),
        );
        control_length(&raw[index..], syntax, at_line_start).map(|length| (index, length, None))
    })
}

fn control_record(
    key: &str,
    raw: &str,
    title_marker: bool,
    syntax: ControlSyntax,
) -> RecordTemplate {
    let mut parts = Vec::new();
    let title = title_marker.then(|| raw.find("[#]")).flatten();
    let body_end = title.unwrap_or(raw.len());
    let mut cursor = 0;
    let mut part_index = 0;
    while cursor < body_end {
        let rest = &raw[cursor..body_end];
        let control = next_control_or_gender(rest, syntax);
        let end = control.map_or(body_end, |(offset, _, _)| cursor + offset);
        if end > cursor {
            let text_parts = text_part(
                format!("{key}/body/part:{part_index}"),
                &raw[cursor..end],
                "dialogue",
                true,
            );
            if text_parts
                .iter()
                .any(|part| matches!(part, TemplatePart::Text { .. }))
            {
                part_index += 1;
            }
            parts.extend(text_parts);
        }
        let Some((_, control_length, gender_separator)) = control else {
            break;
        };
        let literal_end = (end + control_length).min(body_end);
        if let Some(separator) = gender_separator {
            let block = &raw[end..literal_end];
            let inner = &block[2..block.len() - 2];
            let fields = inner.split(separator).collect::<Vec<_>>();
            parts.push(TemplatePart::Literal("${".into()));
            for (index, field) in fields.iter().enumerate() {
                if index > 0 {
                    parts.push(TemplatePart::Literal(separator.to_string()));
                }
                let text_parts = text_part(
                    format!("{key}/body/part:{part_index}"),
                    field,
                    "dialogue",
                    true,
                );
                if text_parts
                    .iter()
                    .any(|part| matches!(part, TemplatePart::Text { .. }))
                {
                    part_index += 1;
                }
                parts.extend(text_parts);
            }
            parts.push(TemplatePart::Literal("}$".into()));
        } else {
            parts.push(TemplatePart::Literal(raw[end..literal_end].to_string()));
        }
        cursor = literal_end;
    }
    if body_end == 0 {
        parts.push(TemplatePart::Literal(String::new()));
    }
    if let Some(title) = title {
        parts.push(TemplatePart::Literal("[#]".into()));
        parts.extend(text_part(
            format!("{key}/title"),
            &raw[title + 3..],
            "plain-text",
            true,
        ));
    }
    RecordTemplate { parts }
}

fn mail_record(key: &str, raw: &str) -> RecordTemplate {
    control_record(key, raw, true, ControlSyntax::Mail)
}

fn mail_corpus_units(key: &str, raw: &str) -> Vec<StructuredTranslationUnit> {
    let title = raw.find("[#]");
    let body = &raw[..title.unwrap_or(raw.len())];
    let mut visible = String::new();
    let mut cursor = 0;
    while cursor < body.len() {
        let rest = &body[cursor..];
        let Some((offset, length, gender_separator)) =
            next_control_or_gender(rest, ControlSyntax::Mail)
        else {
            visible.push_str(rest);
            break;
        };
        visible.push_str(&rest[..offset]);
        let control = &rest[offset..offset + length];
        if let Some(separator) = gender_separator {
            let inner = &control[2..control.len() - 2];
            for (index, branch) in inner.split(separator).enumerate() {
                if index > 0 {
                    visible.push('\n');
                }
                visible.push_str(branch);
            }
        } else if control == "^" || control == "¦" || matches!(control, "\r" | "\n" | "\r\n") {
            visible.push('\n');
        } else if control == "@" || control.eq_ignore_ascii_case("%secretsanta") {
            visible.push_str(control);
        }
        cursor += offset + length;
    }
    let body_text = visible
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let mut units = Vec::new();
    if body_text.chars().any(char::is_alphanumeric) {
        units.push(StructuredTranslationUnit {
            id: format!("{key}/body"),
            text: body_text,
            kind: "dialogue",
            prompt_eligible: true,
        });
    }
    if let Some(title) = title {
        let title_text = raw[title + 3..].trim();
        if title_text.chars().any(char::is_alphanumeric) {
            units.push(StructuredTranslationUnit {
                id: format!("{key}/title"),
                text: title_text.into(),
                kind: "plain-text",
                prompt_eligible: true,
            });
        }
    }
    units
}

fn gift_tastes_record(key: &str, raw: &str) -> Option<RecordTemplate> {
    let fields = raw.split('/').collect::<Vec<_>>();
    if fields.len() != 11 {
        return None;
    }
    let names = [
        (0, "love"),
        (2, "like"),
        (4, "dislike"),
        (6, "hate"),
        (8, "neutral"),
    ]
    .into_iter()
    .collect::<BTreeMap<_, _>>();
    let mut parts = Vec::new();
    for (index, field) in fields.into_iter().enumerate() {
        if index > 0 {
            parts.push(TemplatePart::Literal("/".into()));
        }
        if let Some(name) = names.get(&index) {
            parts.extend(dialogue_field(&format!("{key}/{name}"), field, "dialogue", true).parts);
        } else {
            parts.push(TemplatePart::Literal(field.to_string()));
        }
    }
    Some(RecordTemplate { parts })
}

fn record_template(asset_path: &str, key: &str, raw: &str) -> Option<RecordTemplate> {
    match asset_path {
        "data/monsters.xnb" if valid_monster_record(raw) => {
            slash_record(key, raw, &[15], &[(14, "display-name", "term", true)])
        }
        "data/quests.xnb" if valid_quest_record(raw) => slash_record(
            key,
            raw,
            &[9, 10],
            &[
                (1, "title", "plain-text", true),
                (2, "description", "plain-text", true),
                (3, "objective", "plain-text", true),
            ],
        ),
        "data/bundles.xnb" if valid_bundle_record(raw) => {
            slash_record(key, raw, &[7], &[(0, "display-name", "term", true)])
        }
        "data/boots.xnb" if valid_boot_record(raw) => slash_record(
            key,
            raw,
            &[7, 8],
            &[
                (1, "description", "plain-text", true),
                (6, "display-name", "term", true),
            ],
        ),
        "data/hats.xnb" if valid_hat_record(raw) => slash_record(
            key,
            raw,
            &[6, 7, 8],
            &[
                (1, "description", "plain-text", true),
                (5, "display-name", "term", true),
            ],
        ),
        "data/extradialogue.xnb" => Some(dialogue_field(key, raw, "dialogue", true)),
        "data/mail.xnb" => Some(mail_record(key, raw)),
        "data/secretnotes.xnb" if raw.starts_with('!') => Some(RecordTemplate {
            parts: vec![TemplatePart::Literal(raw.to_string())],
        }),
        "data/secretnotes.xnb" => Some(control_record(key, raw, false, ControlSyntax::SecretNote)),
        "data/npcgifttastes.xnb" => gift_tastes_record(key, raw),
        _ => None,
    }
}

pub(crate) fn parse(
    asset_path: &str,
    value: &Value,
) -> anyhow::Result<Option<StructuredTranslationDocument>> {
    let normalized = asset_path.replace('\\', "/").to_ascii_lowercase();
    if !matches!(
        normalized.as_str(),
        "data/monsters.xnb"
            | "data/quests.xnb"
            | "data/bundles.xnb"
            | "data/boots.xnb"
            | "data/extradialogue.xnb"
            | "data/hats.xnb"
            | "data/mail.xnb"
            | "data/secretnotes.xnb"
            | "data/npcgifttastes.xnb"
    ) {
        return Ok(None);
    }
    let source = value
        .as_object()
        .context("Structured translation asset root must be an object.")?;
    let mut records = BTreeMap::new();
    let mut units = Vec::new();
    let mut corpus_units = Vec::new();
    for (key, value) in source {
        let Some(raw) = value.as_str() else { continue };
        if crate::domain::event_script::looks_like_event_script(raw) {
            records.insert(
                key.clone(),
                RecordTemplate {
                    parts: vec![TemplatePart::Literal(raw.to_string())],
                },
            );
            continue;
        }
        let Some(template) = record_template(&normalized, key, raw) else {
            continue;
        };
        template.units(&mut units);
        if normalized == "data/mail.xnb" {
            corpus_units.extend(mail_corpus_units(key, raw));
        } else {
            template.units(&mut corpus_units);
        }
        records.insert(key.clone(), template);
    }
    Ok(Some(StructuredTranslationDocument {
        original: value.clone(),
        records,
        units,
        corpus_units,
    }))
}

#[cfg(test)]
#[path = "../../tests/unit/domain/structured_translation_tests.rs"]
mod tests;
