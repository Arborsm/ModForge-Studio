use std::cmp::Ordering;

/// Normalize a version string for comparison: trim whitespace and drop any leading
/// `v`/`V` prefix (e.g. `v6.6` -> `6.6`).
pub(crate) fn normalize_version_string(value: &str) -> &str {
    value.trim().trim_start_matches(['v', 'V'])
}

/// A version parsed with SMAPI-style semantic rules.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedModVersion {
    /// The up-to-four numeric segments (missing trailing segments are zero).
    pub(crate) parts: [u64; 4],
    prerelease: Option<String>,
}

/// Parse a version string with SMAPI-style semantic rules:
/// - short-form `x.y` is equivalent to `x.y.0`;
/// - up to four numeric parts are allowed (the fourth mirrors SMAPI's non-standard
///   platform release);
/// - an optional `-prerelease` tag may follow (hyphens inside the tag equal dots);
/// - build metadata after `+` is ignored for precedence;
/// - leading zeros are accepted (more lenient than strict semver).
/// Returns `None` for strings that cannot be interpreted as a version.
pub(crate) fn parse_mod_version(value: &str) -> Option<ParsedModVersion> {
    let cleaned = normalize_version_string(value);
    if cleaned.is_empty() {
        return None;
    }

    let without_build = cleaned.split('+').next()?;
    let (numeric_part, prerelease) = match without_build.find('-') {
        Some(index) => (&without_build[..index], Some(&without_build[index + 1..])),
        None => (without_build, None),
    };

    let segments = numeric_part.split('.').collect::<Vec<_>>();
    if segments.is_empty() || segments.len() > 4 {
        return None;
    }

    let mut parts = [0u64; 4];
    for (index, segment) in segments.iter().enumerate() {
        if segment.is_empty() || !segment.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        parts[index] = segment.parse::<u64>().ok()?;
    }

    let prerelease = prerelease
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(ToOwned::to_owned);

    Some(ParsedModVersion { parts, prerelease })
}

/// Compare two prerelease tags using SMAPI rules: `-unofficial` is always lower
/// precedence, numeric parts compare numerically (leading zeros ignored), and
/// remaining parts compare case-insensitively; a longer tag supersedes an
/// otherwise-equal shorter tag.
fn compare_prerelease_tags(left: &str, right: &str) -> Ordering {
    let left_parts = left.split(['.', '-']).collect::<Vec<_>>();
    let right_parts = right.split(['.', '-']).collect::<Vec<_>>();

    for index in 0..left_parts.len().max(right_parts.len()) {
        let Some(left_part) = left_parts.get(index) else {
            return Ordering::Less;
        };
        let Some(right_part) = right_parts.get(index) else {
            return Ordering::Greater;
        };

        if left_part.eq_ignore_ascii_case(right_part) {
            continue;
        }

        if right_part.eq_ignore_ascii_case("unofficial") {
            return Ordering::Greater;
        }
        if left_part.eq_ignore_ascii_case("unofficial") {
            return Ordering::Less;
        }

        match (left_part.parse::<u64>(), right_part.parse::<u64>()) {
            (Ok(left_number), Ok(right_number)) if left_number != right_number => {
                return left_number.cmp(&right_number);
            }
            (Ok(_), Ok(_)) => continue,
            _ => {
                return left_part
                    .to_ascii_lowercase()
                    .cmp(&right_part.to_ascii_lowercase());
            }
        }
    }

    Ordering::Equal
}

/// Compare two parsed versions; `Ordering::Less` means `left` is older than `right`.
pub(crate) fn compare_parsed_versions(
    left: &ParsedModVersion,
    right: &ParsedModVersion,
) -> Ordering {
    for index in 0..4 {
        match left.parts[index].cmp(&right.parts[index]) {
            Ordering::Equal => {}
            ordering => return ordering,
        }
    }

    match (&left.prerelease, &right.prerelease) {
        (None, None) => Ordering::Equal,
        (Some(_), None) => Ordering::Less, // a prerelease is older than the stable release
        (None, Some(_)) => Ordering::Greater,
        (Some(left_tag), Some(right_tag)) => compare_prerelease_tags(left_tag, right_tag),
    }
}

/// Returns true when `latest` is strictly newer than `current`, i.e. an update is
/// available.
///
/// Versions are compared semantically: `v6.6`, `6.6`, `6.6.0` and `6.06` are all
/// equivalent, and a stable release is newer than its prereleases (e.g. `1.2.3` is
/// newer than `1.2.3-beta`). When either side cannot be parsed as a version, the
/// normalized strings (trimmed, leading `v` dropped) are compared for equality so
/// that equivalent unparseable labels are not reported as updates. Missing or blank
/// versions never produce an update.
pub(crate) fn version_is_newer(current: &str, latest: &str) -> bool {
    let current_clean = normalize_version_string(current);
    let latest_clean = normalize_version_string(latest);
    if current_clean.is_empty() || latest_clean.is_empty() {
        return false;
    }

    match (
        parse_mod_version(current_clean),
        parse_mod_version(latest_clean),
    ) {
        (Some(current_version), Some(latest_version)) => {
            compare_parsed_versions(&current_version, &latest_version) == Ordering::Less
        }
        _ => current_clean != latest_clean,
    }
}

/// Returns true when `value` parses as a version carrying a prerelease tag
/// (e.g. `4.6.0-beta.1`). Used to decide whether the SMAPI beta channel is active.
pub(crate) fn version_is_prerelease(value: &str) -> bool {
    parse_mod_version(value).is_some_and(|parsed| parsed.prerelease.is_some())
}

#[cfg(test)]
#[path = "../../tests/unit/domain/launcher/versions_tests.rs"]
mod versions_tests;
