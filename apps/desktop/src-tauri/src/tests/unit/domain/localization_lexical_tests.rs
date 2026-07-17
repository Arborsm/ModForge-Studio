use super::*;

#[test]
fn keywords_ignore_common_words_and_score_partial_sentence_overlap() {
    assert_eq!(
        keywords("Welcome to the old town"),
        ["welcome", "town", "old"]
    );
    let score = keyword_score("Welcome back, farmer", &["Welcome to Pelican Town"]);
    assert!(score > 0.3 && score < 0.5);
    assert_eq!(keyword_score("Good night", &["Welcome to town"]), 0.0);
}

#[test]
fn fts_query_uses_keyword_or_instead_of_an_exact_sentence_phrase() {
    let query = fts_or_query("Welcome to Pelican Town").unwrap();
    assert!(query.contains("\"welcome\""));
    assert!(query.contains("\"pelican\""));
    assert!(query.contains("\"town\""));
    assert!(query.contains(" OR "));
}
