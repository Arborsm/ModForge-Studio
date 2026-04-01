#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConditionToken {
    pub raw_key: String,
    pub name: String,
    pub has_modifiers: bool,
}

pub fn parse_condition_token(key: &str) -> ConditionToken {
    let mut segments = key.split('|').map(str::trim).filter(|segment| !segment.is_empty());
    let name = segments.next().unwrap_or_default().to_string();
    let has_modifiers = segments.next().is_some();

    ConditionToken {
        raw_key: key.to_string(),
        name,
        has_modifiers,
    }
}
