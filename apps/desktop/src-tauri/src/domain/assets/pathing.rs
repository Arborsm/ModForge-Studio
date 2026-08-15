use std::path::{Path, PathBuf};

fn is_locale_suffix(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 5
        && bytes[2] == b'-'
        && bytes[0].is_ascii_alphabetic()
        && bytes[1].is_ascii_alphabetic()
        && bytes[3].is_ascii_alphabetic()
        && bytes[4].is_ascii_alphabetic()
}

pub(crate) fn split_localized_stem(stem: &str) -> (&str, Option<&str>) {
    match stem.rsplit_once('.') {
        Some((base, suffix)) if is_locale_suffix(suffix) => (base, Some(suffix)),
        _ => (stem, None),
    }
}

pub(super) fn normalize_requested_locale(locale: Option<&str>) -> &str {
    locale.unwrap_or("en-US")
}

pub(crate) fn localized_variant_path(path: &Path, locale: &str) -> Option<PathBuf> {
    if locale.eq_ignore_ascii_case("en-US") {
        return None;
    }

    let extension = path.extension()?.to_str()?;
    let stem = path.file_stem()?.to_str()?;
    let (base_stem, _) = split_localized_stem(stem);
    Some(path.with_file_name(format!("{base_stem}.{locale}.{extension}")))
}

pub(crate) fn logicalized_asset_path(path: &Path) -> PathBuf {
    let Some(stem) = path.file_stem().and_then(|value| value.to_str()) else {
        return path.to_path_buf();
    };
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return path.to_path_buf();
    };
    let (base_stem, _) = split_localized_stem(stem);
    path.with_file_name(format!("{base_stem}.{extension}"))
}

pub(crate) fn preferred_existing_xnb_path(path: &Path, locale: Option<&str>) -> PathBuf {
    let requested_locale = normalize_requested_locale(locale);
    if let Some(candidate) = localized_variant_path(path, requested_locale) {
        if candidate.exists() {
            return candidate;
        }
    }

    let logical_path = logicalized_asset_path(path);
    if logical_path.exists() {
        return logical_path;
    }

    path.to_path_buf()
}

/// Turns a game-root-relative path into the Content Patcher asset key the game
/// uses to load the file: `Content/Characters/Abigail.xnb` → `Characters/Abigail`.
pub(crate) fn cp_asset_key(relative_path: &str) -> String {
    let without_content = relative_path
        .strip_prefix("Content/")
        .unwrap_or(relative_path);
    let key = without_content
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(without_content);
    key.to_string()
}
