use super::version_is_prerelease;

#[test]
fn stable_versions_are_not_prereleases() {
    assert!(!version_is_prerelease("4.5.2"));
    assert!(!version_is_prerelease("v4.5.2"));
    assert!(!version_is_prerelease("4.5.2+meta"));
    assert!(!version_is_prerelease("1.6.14"));
    assert!(!version_is_prerelease(""));
    assert!(!version_is_prerelease("unknown"));
}

#[test]
fn tagged_versions_are_prereleases() {
    assert!(version_is_prerelease("4.6.0-beta.1"));
    assert!(version_is_prerelease("4.6.0-beta"));
    assert!(version_is_prerelease("4.6.0-rc"));
    assert!(version_is_prerelease("4.6.0-unofficial.3"));
    assert!(version_is_prerelease(" 4.6.0-beta "));
}

#[test]
fn dash_dated_labels_count_as_prereleases() {
    // `2024-11-3` parses as numeric major + prerelease tag under SMAPI semantics.
    assert!(version_is_prerelease("2024-11-3"));
}
