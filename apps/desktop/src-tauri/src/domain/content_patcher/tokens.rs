pub const INVALID_WHEN_TOKEN: &str = "__modforgeInvalidWhen";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConditionModifier {
    pub name: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConditionToken {
    pub raw_key: String,
    pub name: String,
    pub has_modifiers: bool,
    pub modifiers: Vec<ConditionModifier>,
}

pub fn parse_condition_token(key: &str) -> ConditionToken {
    let mut segments = key
        .split('|')
        .map(str::trim)
        .filter(|segment| !segment.is_empty());
    let name = segments.next().unwrap_or_default().to_string();
    let modifiers = segments
        .map(|segment| {
            let (modifier_name, modifier_value) = segment
                .split_once('=')
                .map(|(modifier_name, modifier_value)| {
                    (modifier_name.trim(), Some(modifier_value.trim()))
                })
                .unwrap_or((segment, None));
            ConditionModifier {
                name: modifier_name.to_string(),
                value: modifier_value
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned),
            }
        })
        .collect::<Vec<_>>();
    let has_modifiers = !modifiers.is_empty();

    ConditionToken {
        raw_key: key.to_string(),
        name,
        has_modifiers,
        modifiers,
    }
}
