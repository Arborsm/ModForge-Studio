use super::version_is_newer;

#[test]
fn treats_semantically_equal_versions_as_up_to_date() {
    // The reported bug: `v6.6` (folder) vs `v6.6.0` (Nexus main file) are equal.
    assert!(!version_is_newer("v6.6", "v6.6.0"));
    assert!(!version_is_newer("6.6", "6.6.0"));
    assert!(!version_is_newer("6.6", "v6.6"));
    assert!(!version_is_newer("6.6.0", "6.6"));
    assert!(!version_is_newer("6.06", "6.6"));
    assert!(!version_is_newer("06.6.0", "6.6"));
    assert!(!version_is_newer(" 6.6 ", "v6.6.0"));
    assert!(!version_is_newer("V6.6", "6.6.0"));
    assert!(!version_is_newer("6.6", "6.6.0.0"));
    assert!(!version_is_newer("1.2.3-beta", "1.2.3-beta"));
    assert!(!version_is_newer("1.2.3-BETA", "1.2.3-beta"));
}

#[test]
fn detects_real_updates() {
    assert!(version_is_newer("6.6", "6.6.1"));
    assert!(version_is_newer("6.6.0", "6.6.1"));
    assert!(version_is_newer("6.6.0", "6.7.0"));
    assert!(version_is_newer("6.6.0", "7.0.0"));
    assert!(version_is_newer("6.6.0", "6.6.0.1"));
}

#[test]
fn does_not_report_older_remote_as_update() {
    assert!(!version_is_newer("6.6.1", "6.6"));
    assert!(!version_is_newer("6.7.0", "6.6.0"));
}

#[test]
fn orders_prereleases_below_stable_releases() {
    assert!(version_is_newer("1.2.3-beta", "1.2.3"));
    assert!(!version_is_newer("1.2.3", "1.2.3-beta"));
    assert!(!version_is_newer("1.2.3-rc", "1.2.3-beta"));
}

#[test]
fn compares_prerelease_tags_semantically() {
    assert!(version_is_newer("1.2.3-beta", "1.2.3-beta.1"));
    assert!(!version_is_newer("1.2.3-beta.2", "1.2.3-beta.1"));
    assert!(version_is_newer("1.2.3-beta", "1.2.3-rc"));
    assert!(!version_is_newer("1.2.3-rc", "1.2.3-beta"));
}

#[test]
fn treats_unofficial_forks_as_lower_precedence() {
    assert!(version_is_newer("1.0-unofficial.1", "1.0"));
    assert!(version_is_newer("1.0-unofficial.1", "1.0-beta"));
    assert!(!version_is_newer("1.0-beta", "1.0-unofficial.1"));
}

#[test]
fn falls_back_to_normalized_string_comparison_for_unparseable_versions() {
    // Dash-dated labels (e.g. `2024-11-3`) parse as numeric major + prerelease tag
    // and still compare order correctly.
    assert!(!version_is_newer("2024-11-3", "2024-11-3"));
    assert!(version_is_newer("2024-11-3", "2024-11-4"));
    // Truly unparseable labels: equal after normalization is not an update.
    assert!(!version_is_newer("unknown", "unknown"));
    assert!(!version_is_newer("v1.2.3a", "1.2.3a"));
    // Genuinely different labels still surface as an update.
    assert!(version_is_newer("unknown", "unknown2"));
}

#[test]
fn handles_missing_or_blank_versions_conservatively() {
    assert!(!version_is_newer("", "6.6.0"));
    assert!(!version_is_newer("   ", "6.6.0"));
    assert!(!version_is_newer("6.6.0", ""));
}
