use std::collections::BTreeSet;

const ENGLISH_STOP_WORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "he",
    "her", "his", "i", "in", "is", "it", "its", "me", "my", "of", "on", "or", "our", "she", "that",
    "the", "their", "them", "they", "this", "to", "was", "we", "were", "will", "with", "you",
    "your",
];

pub(crate) fn keywords(value: &str) -> Vec<String> {
    let mut tokens = value
        .to_lowercase()
        .split(|character: char| !character.is_alphanumeric() && character != '_')
        .filter(|token| {
            !token.is_empty()
                && (token.chars().any(|character| !character.is_ascii())
                    || (token.len() >= 2 && !ENGLISH_STOP_WORDS.contains(token)))
        })
        .map(ToOwned::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    tokens.sort_by_key(|token| std::cmp::Reverse(token.chars().count()));
    tokens.truncate(16);
    tokens
}

pub(crate) fn keyword_score(query: &str, candidates: &[&str]) -> f64 {
    let query = keywords(query);
    if query.is_empty() {
        return 0.0;
    }
    let candidate = candidates
        .iter()
        .flat_map(|value| keywords(value))
        .collect::<BTreeSet<_>>();
    let matched = query
        .iter()
        .filter(|token| candidate.contains(*token))
        .count();
    if matched == 0 {
        return 0.0;
    }
    let coverage = matched as f64 / query.len() as f64;
    0.2 + coverage * 0.5
}

pub(crate) fn fts_or_query(value: &str) -> Option<String> {
    let tokens = keywords(value);
    (!tokens.is_empty()).then(|| {
        tokens
            .into_iter()
            .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" OR ")
    })
}

pub(crate) fn like_pattern(token: &str) -> String {
    format!(
        "%{}%",
        token
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}

#[cfg(test)]
#[path = "../../tests/unit/domain/localization_lexical_tests.rs"]
mod tests;
