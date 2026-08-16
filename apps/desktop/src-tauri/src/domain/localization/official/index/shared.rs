use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::sync::{Mutex, OnceLock};

pub(crate) const LOCALES: &[&str] = &[
    "de-DE", "es-ES", "fr-FR", "hu-HU", "it-IT", "ja-JP", "ko-KR", "pt-BR", "ru-RU", "tr-TR",
    "zh-CN", "zh-TW",
];
pub(crate) const EXTRACTOR_VERSION: &str = "17";
pub(crate) const SCHEMA_VERSION: u32 = 5;
pub(crate) static INDEX_OPEN_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Convert a Stardew/SMAPI locale identifier to the region-qualified locale
/// used by the official game-content index.
///
/// Mod i18n files intentionally keep their original names (`default`, `zh`,
/// etc.). This conversion is only for official corpus and semantic-index
/// lookups; unknown custom locales are preserved so they cannot accidentally
/// match another language.
pub(crate) fn canonical_locale(locale: &str) -> String {
    let trimmed = locale.trim();
    let normalized = trimmed.replace('_', "-").to_ascii_lowercase();
    let canonical = match normalized.as_str() {
        // `default` is SMAPI's final fallback file, not a language. Keep it
        // unresolved so callers can choose a language-aware fallback strategy.
        "" | "default" => "",
        "en" | "en-us" => "en-US",
        "zh" | "zh-cn" => "zh-CN",
        "ja" | "ja-jp" => "ja-JP",
        "ru" | "ru-ru" => "ru-RU",
        "pt" | "pt-br" => "pt-BR",
        "es" | "es-es" => "es-ES",
        "de" | "de-de" => "de-DE",
        "th" | "th-th" => "th-TH",
        "fr" | "fr-fr" => "fr-FR",
        "ko" | "ko-kr" => "ko-KR",
        "it" | "it-it" => "it-IT",
        "tr" | "tr-tr" => "tr-TR",
        "hu" | "hu-hu" => "hu-HU",
        _ => return trimmed.to_string(),
    };
    canonical.to_string()
}

pub(crate) fn is_default_locale(locale: &str) -> bool {
    let normalized = locale.trim().replace('_', "-").to_ascii_lowercase();
    normalized.is_empty() || normalized == "default"
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct UnitEligibility {
    pub(crate) searchable: bool,
    pub(crate) semantic_eligible: bool,
    pub(crate) prompt_eligible: bool,
}

impl UnitEligibility {
    pub(crate) const SEARCHABLE_ONLY: Self = Self {
        searchable: true,
        semantic_eligible: false,
        prompt_eligible: false,
    };
    pub(crate) const PROMPT_SAFE: Self = Self {
        searchable: true,
        semantic_eligible: true,
        prompt_eligible: true,
    };

    pub(crate) fn for_source(self, source: &str) -> Self {
        let semantic_eligible = self.semantic_eligible && semantic_text_eligible(source);
        let prompt_eligible =
            self.prompt_eligible && semantic_eligible && prompt_text_eligible(source);
        Self {
            searchable: self.searchable,
            semantic_eligible,
            prompt_eligible,
        }
    }
}

pub(crate) fn hex(bytes: impl AsRef<[u8]>) -> String {
    let mut output = String::with_capacity(bytes.as_ref().len() * 2);
    for byte in bytes.as_ref() {
        let _ = write!(output, "{byte:02x}");
    }
    output
}

pub(crate) fn semantic_identity(asset_path: &str, unit_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(asset_path.as_bytes());
    hasher.update([0]);
    hasher.update(unit_key.as_bytes());
    hex(hasher.finalize())
}

pub(crate) fn semantic_fingerprint(
    asset_path: &str,
    unit_key: &str,
    kind: &str,
    source: &str,
) -> String {
    let mut hasher = Sha256::new();
    for value in [asset_path, unit_key, kind, source] {
        hasher.update(value.as_bytes());
        hasher.update([0]);
    }
    hex(hasher.finalize())
}

pub(crate) fn prompt_text_eligible(source: &str) -> bool {
    let trimmed = source.trim();
    if trimmed.is_empty()
        || (trimmed.starts_with("??") && trimmed.ends_with("??"))
        || trimmed.chars().count() > 8_192
    {
        return false;
    }
    trimmed
        .chars()
        .filter(|character| character.is_alphabetic())
        .count()
        >= 4
}

fn semantic_text_eligible(source: &str) -> bool {
    let trimmed = source.trim();
    !trimmed.is_empty()
        && trimmed.chars().count() <= 8_192
        && trimmed
            .chars()
            .filter(|character| character.is_alphabetic())
            .count()
            >= 2
}
