use super::*;
use crate::domain::ai::types::AiTranslationFormat;

#[test]
fn restores_placeholder_bbcode_and_stardew_markers_exactly() {
    let protected = protect(
        "Hello {{name}} [b]{0:N0}[/b]^n slot $1 rate %1$s",
        AiTranslationFormat::StardewI18n,
    );
    assert_eq!(
        protected
            .restore("Bonjour __MF_TOKEN_0000__ __MF_TOKEN_0001____MF_TOKEN_0002____MF_TOKEN_0003____MF_TOKEN_0004__ slot __MF_TOKEN_0005__ rate __MF_TOKEN_0006__")
            .unwrap(),
        "Bonjour {{name}} [b]{0:N0}[/b]^n slot $1 rate %1$s"
    );
}

#[test]
fn rejects_missing_reordered_or_injected_markers() {
    let protected = protect("{{name}} [b]text[/b]", AiTranslationFormat::NexusBbcodeText);
    assert!(
        protected
            .restore("name __MF_TOKEN_0001__text__MF_TOKEN_0002__")
            .is_err()
    );
    assert!(
        protected
            .restore("__MF_TOKEN_0001____MF_TOKEN_0000__text__MF_TOKEN_0002__")
            .is_err()
    );
    assert!(
        protected
            .restore("__MF_TOKEN_0000____MF_TOKEN_0001__text__MF_TOKEN_0002____MF_TOKEN_9999__")
            .is_err()
    );
}
