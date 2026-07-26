use crate::domain::ai::types::AiTranslationFormat;
use anyhow::{Context, bail};
use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug)]
pub struct ProtectedText {
    text: String,
    tokens: Vec<String>,
}

fn token_pattern() -> &'static Regex {
    static VALUE: OnceLock<Regex> = OnceLock::new();
    VALUE.get_or_init(|| Regex::new(r"(?x)(\{\{[^{}\r\n]+\}\}|\{[A-Za-z0-9_.-]+(?::[^{}\r\n]+)?\}|%(?:\d+\$)?[sdif]\b|\$\d+|\[[A-Za-z/][^\]\r\n]*\]|<[^>\r\n]+>|\^[A-Za-z0-9]+|\\[nrt])").expect("valid localization token regex"))
}

fn marker(index: usize) -> String {
    format!("__MF_TOKEN_{index:04}__")
}

pub fn protect(text: &str, _format: AiTranslationFormat) -> ProtectedText {
    let mut tokens = Vec::new();
    let replaced = token_pattern().replace_all(text, |captures: &regex::Captures<'_>| {
        let index = tokens.len();
        tokens.push(captures[0].to_string());
        marker(index)
    });
    ProtectedText {
        text: replaced.into_owned(),
        tokens,
    }
}

impl ProtectedText {
    pub fn request_text(&self) -> &str {
        &self.text
    }

    pub fn restore(&self, translated: &str) -> anyhow::Result<String> {
        let mut output = translated.to_string();
        for (index, token) in self.tokens.iter().enumerate() {
            let expected = marker(index);
            let count = output.matches(&expected).count();
            if count != 1 {
                bail!("Machine translation changed or removed a protected localization marker.")
            }
            output = output.replacen(&expected, token, 1);
        }
        if Regex::new(r"__MF_TOKEN_\d{4}__")
            .context("Failed to validate protected markers.")?
            .is_match(&output)
        {
            bail!("Machine translation returned an unknown protected localization marker.")
        }
        let actual = token_pattern()
            .find_iter(&output)
            .map(|value| value.as_str().to_string())
            .collect::<Vec<_>>();
        if actual != self.tokens {
            bail!("Machine translation changed the protected marker set or order.")
        }
        Ok(output)
    }
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_machine_translation_protection_tests.rs"]
mod tests;
