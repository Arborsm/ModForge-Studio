use super::{
    CheckSmapiUpdateResult, GAME_VERSION_SMAPI_TABLE, InstallSmapiUpdateRequest, RemoteModDetail,
    SMAPI_LATEST_MINIMUM_GAME_VERSION, SMAPI_NEXUS_MOD_ID, SMAPI_NEXUS_MOD_PAGE_URL,
    SmapiInstallerDownloadCandidate, SmapiInstallerFileKind, SmapiInstallerNaming, SmapiRelease,
    SmapiUpdateDownloadInfo, SmapiVersionSource, collect_installer_candidates_from_dir,
    enrich_installer_candidate_flags, max_game_compatible_smapi_version, normalize_expected_sha256,
    parse_minimum_game_version_from_body, parse_smapi_installer_file_name,
    resolve_latest_smapi_source, scan_required_smapi_mods, select_smapi_update_target,
    sha256_hex_of_file, smapi_release_from_nexus_detail, sort_installer_candidates,
    validate_local_smapi_installer_file,
};
use crate::domain::launcher::types::SmapiUpdateRequiredByMod;
use crate::infrastructure::http::resumable_download::{
    PartialRetention, ResumableDownloadRequest, download_resumable,
};
use crate::test_support::{create_temp_dir, write_bytes_file, write_file};
use reqwest::blocking::Client;
use reqwest::header::RANGE;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::time::Duration;

const GITHUB_LATEST_RELEASE_FIXTURE: &str = r#"{
  "tag_name": "4.5.2",
  "prerelease": false,
  "draft": false,
  "body": "This release requires Stardew Valley 1.6.14 or later.\n\nSee the release notes for details.",
  "assets": [
    {
      "name": "SMAPI-4.5.2-installer.zip",
      "browser_download_url": "https://github.com/Pathoschild/SMAPI/releases/download/4.5.2/SMAPI-4.5.2-installer.zip",
      "size": 1234567,
      "digest": "sha256:abc123def4567890abc123def4567890abc123def4567890abc123def4567890"
    },
    {
      "name": "SMAPI-4.5.2.zip",
      "browser_download_url": "https://github.com/Pathoschild/SMAPI/releases/download/4.5.2/SMAPI-4.5.2.zip",
      "size": 42,
      "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}"#;

#[test]
fn parses_latest_github_release_fixture() {
    let payload: Value = serde_json::from_str(GITHUB_LATEST_RELEASE_FIXTURE).unwrap();
    let release = SmapiRelease::from_github_value(&payload).unwrap();

    assert_eq!(release.version, "4.5.2");
    assert!(!release.prerelease);
    assert_eq!(release.minimum_game_version.as_deref(), Some("1.6.14"));
    assert_eq!(release.assets.len(), 2);

    let installer = release.installer_asset("4.5.2").expect("installer asset");
    assert_eq!(installer.name, "SMAPI-4.5.2-installer.zip");
    assert_eq!(installer.size_bytes, Some(1234567));
    assert_eq!(
        installer.sha256.as_deref(),
        Some("abc123def4567890abc123def4567890abc123def4567890abc123def4567890")
    );

    assert!(
        release.installer_asset("4.5.1").is_none(),
        "an older version must not match the newer installer asset"
    );
}

#[test]
fn parses_github_release_with_v_prefix_and_missing_fields() {
    let payload: Value = serde_json::from_str(
        r#"{
          "tag_name": "v4.0.8",
          "prerelease": true,
          "body": "No requirement statement here.",
          "assets": []
        }"#,
    )
    .unwrap();
    let release = SmapiRelease::from_github_value(&payload).unwrap();

    assert_eq!(release.version, "4.0.8");
    assert!(release.prerelease);
    assert_eq!(release.minimum_game_version, None);
    assert!(release.assets.is_empty());
    assert!(release.installer_asset("4.0.8").is_none());
}

#[test]
fn github_release_without_tag_is_rejected() {
    let payload: Value = serde_json::from_str(r#"{"prerelease": false, "assets": []}"#).unwrap();
    let error = SmapiRelease::from_github_value(&payload).unwrap_err();
    assert!(
        error.to_string().contains("tag_name"),
        "unexpected error: {error}"
    );
}

#[test]
fn parses_minimum_game_version_from_release_body() {
    assert_eq!(
        parse_minimum_game_version_from_body(
            "This release requires Stardew Valley 1.6.14 or later. Fixes stuff."
        ),
        Some("1.6.14".to_string())
    );
    assert_eq!(
        parse_minimum_game_version_from_body("Requires Stardew Valley 1.5.6 or later (see notes)."),
        Some("1.5.6".to_string())
    );
    assert_eq!(
        parse_minimum_game_version_from_body("No requirement mentioned."),
        None
    );
    assert_eq!(parse_minimum_game_version_from_body(""), None);
}

#[test]
fn latest_is_compatible_when_game_meets_the_minimum_game_version() {
    assert_eq!(
        max_game_compatible_smapi_version("1.6.14", "4.5.2", "1.6.14"),
        Some("4.5.2".to_string())
    );
    assert_eq!(
        max_game_compatible_smapi_version("1.6.15", "4.5.2", "1.6.14"),
        Some("4.5.2".to_string())
    );
}

#[test]
fn older_games_resolve_to_their_pinned_compatible_smapi() {
    // Exact table match.
    assert_eq!(
        max_game_compatible_smapi_version("1.6.8", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        Some("4.0.8".to_string())
    );
    assert_eq!(
        max_game_compatible_smapi_version("1.5.6", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        Some("3.18.6".to_string())
    );
    // Unlisted intermediate game version resolves to the nearest listed entry at
    // or below it (never newer than what the game is known to support).
    assert_eq!(
        max_game_compatible_smapi_version("1.6.9", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        Some("4.0.8".to_string())
    );
    assert_eq!(
        max_game_compatible_smapi_version("1.6.13", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        Some("4.0.8".to_string())
    );
    assert_eq!(
        max_game_compatible_smapi_version("1.5.5", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        Some("3.13.2".to_string())
    );
}

#[test]
fn games_older_than_every_table_entry_have_no_compatible_smapi() {
    assert_eq!(
        max_game_compatible_smapi_version("0.9.0", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        None
    );
    assert_eq!(
        max_game_compatible_smapi_version("unknown", "4.5.2", SMAPI_LATEST_MINIMUM_GAME_VERSION),
        None
    );
}

#[test]
fn compatibility_table_covers_the_referenced_game_versions() {
    // Every table entry must parse; the table drives target selection for old games.
    for (game_version, _) in GAME_VERSION_SMAPI_TABLE {
        let compatible = max_game_compatible_smapi_version(
            game_version,
            "4.5.2",
            SMAPI_LATEST_MINIMUM_GAME_VERSION,
        );
        let expected = GAME_VERSION_SMAPI_TABLE
            .iter()
            .find(|(candidate, _)| candidate == game_version)
            .expect("entry exists")
            .1;
        assert_eq!(
            compatible.as_deref(),
            Some(expected),
            "game {game_version} must resolve to its own pinned SMAPI"
        );
    }
}

#[test]
fn installed_below_latest_offers_latest_stable_as_target() {
    let selection = select_smapi_update_target("4.3.2", "1.6.14", "4.5.2", "1.6.14");
    assert!(selection.update_available);
    assert_eq!(selection.target_version, "4.5.2");
}

#[test]
fn installed_at_target_reports_up_to_date() {
    let selection = select_smapi_update_target("4.5.2", "1.6.14", "4.5.2", "1.6.14");
    assert!(!selection.update_available);
    assert_eq!(selection.target_version, "4.5.2");
}

#[test]
fn installed_above_game_max_never_downgrades() {
    let selection = select_smapi_update_target("4.0.8", "1.6.8", "4.5.2", "1.6.14");
    assert!(!selection.update_available);
    assert_eq!(selection.target_version, "4.0.8");
}

#[test]
fn too_old_game_targets_the_pinned_compatible_release() {
    let selection = select_smapi_update_target("4.0.0", "1.6.8", "4.5.2", "1.6.14");
    assert!(selection.update_available);
    assert_eq!(selection.target_version, "4.0.8");
}

#[test]
fn unsupported_game_reports_latest_for_reference_without_update() {
    let selection = select_smapi_update_target("0.9.0", "0.9.0", "4.5.2", "1.6.14");
    assert!(!selection.update_available);
    assert_eq!(selection.target_version, "4.5.2");
}

#[test]
fn scan_required_smapi_mods_reports_only_mods_needing_newer_smapi() {
    let root = create_temp_dir("smapi-required-mods");
    write_file(
        &root.join("Mods").join("AlphaMod").join("manifest.json"),
        r#"{
  "Name": "Alpha Mod",
  "UniqueID": "alpha.mod",
  "Version": "1.0.0",
  "MinimumApiVersion": "4.4.0"
}"#,
    );
    write_file(
        &root.join("Mods").join("BetaMod").join("manifest.json"),
        r#"{
  "Name": "Beta Mod",
  "UniqueID": "beta.mod",
  "Version": "1.0.0"
}"#,
    );
    write_file(
        &root.join("Mods").join("GammaMod").join("manifest.json"),
        r#"{
  "Name": "Gamma Mod",
  "UniqueID": "gamma.mod",
  "Version": "1.0.0",
  "MinimumApiVersion": "4.2.0"
}"#,
    );

    let root_text = root.to_string_lossy().to_string();
    let required = scan_required_smapi_mods(&root_text, "4.3.2").expect("scan mods");
    assert_eq!(
        required.len(),
        1,
        "only Alpha requires SMAPI newer than 4.3.2"
    );
    assert_eq!(required[0].mod_id, "alpha.mod");
    assert_eq!(required[0].mod_name, "Alpha Mod");
    assert_eq!(required[0].minimum_api_version, "4.4.0");

    let none = scan_required_smapi_mods(&root_text, "4.5.0").expect("scan mods");
    assert!(none.is_empty(), "4.5.0 satisfies every declared minimum");

    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_required_smapi_mods_handles_missing_mods_folder() {
    let root = create_temp_dir("smapi-required-mods-empty");
    let required = scan_required_smapi_mods(&root.to_string_lossy(), "4.3.2").expect("scan mods");
    assert!(required.is_empty());
    assert!(
        scan_required_smapi_mods("", "4.3.2")
            .expect("scan mods")
            .is_empty(),
        "empty mods path yields no requirements"
    );
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn required_mods_sort_by_name() {
    let required = vec![
        SmapiUpdateRequiredByMod {
            mod_id: "b.mod".to_string(),
            mod_name: "Bravo Mod".to_string(),
            minimum_api_version: "4.4.0".to_string(),
        },
        SmapiUpdateRequiredByMod {
            mod_id: "a.mod".to_string(),
            mod_name: "Alpha Mod".to_string(),
            minimum_api_version: "4.4.0".to_string(),
        },
    ];
    let mut sorted = required.clone();
    sorted.sort_by(|left, right| {
        left.mod_name
            .to_ascii_lowercase()
            .cmp(&right.mod_name.to_ascii_lowercase())
    });
    assert_eq!(sorted[0].mod_id, "a.mod");
}

#[test]
fn normalize_expected_sha256_accepts_prefixed_and_plain_hex() {
    let digest = "ABC123DEF4567890ABC123DEF4567890ABC123DEF4567890ABC123DEF4567890";
    assert_eq!(
        normalize_expected_sha256(digest).unwrap(),
        digest.to_ascii_lowercase()
    );
    assert_eq!(
        normalize_expected_sha256(&format!("sha256:{digest}")).unwrap(),
        digest.to_ascii_lowercase()
    );
    assert_eq!(
        normalize_expected_sha256(&format!("  sha256: {digest} ")).unwrap(),
        digest.to_ascii_lowercase()
    );
}

#[test]
fn normalize_expected_sha256_rejects_malformed_digests() {
    assert!(normalize_expected_sha256("").is_err());
    assert!(normalize_expected_sha256("abc").is_err());
    assert!(normalize_expected_sha256(&"a".repeat(63)).is_err());
    assert!(
        normalize_expected_sha256(&"z".repeat(64)).is_err(),
        "non-hex rejected"
    );
    assert!(normalize_expected_sha256(&"sha256:".to_string()).is_err());
}

/// Serves a single HTTP 200 response with the given body, then closes.
fn spawn_single_response_server(body: &'static [u8]) -> (String, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let mut buffer = [0_u8; 4096];
        let _ = stream.read(&mut buffer);
        let head = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let _ = stream.write_all(head.as_bytes());
        let _ = stream.write_all(body);
    });
    (format!("http://{address}"), handle)
}

#[test]
fn sha256_mismatch_fails_the_installer_download_hard() {
    let root = create_temp_dir("smapi-update-sha-mismatch");
    let destination = root.join("installer.zip");
    let body: &'static [u8] = b"corrupt installer bytes";
    let (url, server) = spawn_single_response_server(body);
    let client = Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .unwrap();

    let result = download_resumable(
        &ResumableDownloadRequest {
            destination: destination.clone(),
            expected_size: None,
            expected_sha256: Some("0".repeat(64)),
            version_identity: "smapi:test".to_string(),
            current_file: "installer.zip".to_string(),
            file_index: 1,
            file_count: 1,
            partial_retention: PartialRetention::DeleteOnFailure,
        },
        None,
        |resume| {
            let mut request = client.get(&url);
            if resume.start > 0 {
                request = request.header(RANGE, format!("bytes={}-", resume.start));
            }
            request.send().map_err(Into::into)
        },
        || Ok(false),
        |_| Ok(()),
    );
    server.join().expect("server thread");

    let error = result.expect_err("checksum mismatch must fail the download");
    assert!(
        error.to_string().contains("SHA-256"),
        "unexpected error: {error}"
    );
    assert!(
        !destination.exists()
            || std::fs::metadata(&destination)
                .map(|metadata| metadata.len())
                .unwrap_or(0)
                == 0,
        "misverified archive must not remain on disk"
    );
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn parses_github_installer_file_names() {
    let (version, kind) = parse_smapi_installer_file_name("SMAPI-4.5.2-installer.zip")
        .expect("plain github installer");
    assert_eq!(version, "4.5.2");
    assert_eq!(
        kind,
        SmapiInstallerFileKind::Github {
            double_zipped: false
        }
    );

    let (version, kind) =
        parse_smapi_installer_file_name("SMAPI-4.5.2-installer-double-zipped.zip")
            .expect("double-zipped github installer");
    assert_eq!(version, "4.5.2");
    assert_eq!(
        kind,
        SmapiInstallerFileKind::Github {
            double_zipped: true
        }
    );

    // Case-insensitive and leading `v` tolerant.
    let (version, kind) =
        parse_smapi_installer_file_name("smapi-V4.0.8-INSTALLER-DOUBLE-ZIPPED.ZIP")
            .expect("case-insensitive double-zipped github installer");
    assert_eq!(version, "v4.0.8");
    assert_eq!(
        kind,
        SmapiInstallerFileKind::Github {
            double_zipped: true
        }
    );
}

#[test]
fn parses_nexus_installer_file_names() {
    let (version, kind) = parse_smapi_installer_file_name("SMAPI 4.5.2-2400-4-5-2-1730000000.zip")
        .expect("nexus installer");
    assert_eq!(version, "4.5.2");
    assert_eq!(kind, SmapiInstallerFileKind::Nexus);

    // Short-form version (two segments) with matching dash segments.
    let (version, kind) = parse_smapi_installer_file_name("SMAPI 4.5-2400-4-5-1730000000.zip")
        .expect("short-form nexus installer");
    assert_eq!(version, "4.5");
    assert_eq!(kind, SmapiInstallerFileKind::Nexus);
}

#[test]
fn rejects_junk_and_malformed_installer_file_names() {
    for file_name in [
        "SMAPI-4.5.2.zip",
        "SMAPI-4.5.2-installer.zip.bak",
        "SMAPI-4.5.2-double-zipped.zip",
        "SMAPI 4.5.2-2401-4-5-2-1730000000.zip",
        "SMAPI 4.5.2-2400-4-5-9-1730000000.zip",
        "SMAPI 4.5.2-2400-4-5-2.zip",
        "SMAPI 4.5.2-2400-4-5-2-beta.zip",
        "SMAPI 4.5.2-2400-4-5-2.zip",
        "random.zip",
        "ContentPatcher.zip",
        "",
    ] {
        assert!(
            parse_smapi_installer_file_name(file_name).is_none(),
            "{file_name} must not parse as a SMAPI installer"
        );
    }
}

#[test]
fn github_source_wins_when_available() {
    let github = SmapiRelease::from_github_value(
        &serde_json::from_str(GITHUB_LATEST_RELEASE_FIXTURE).unwrap(),
    )
    .unwrap();
    let resolved = resolve_latest_smapi_source(Ok(github.clone()), Err("nexus down".to_string()))
        .expect("github result wins");
    assert_eq!(resolved.source, SmapiVersionSource::Github);
    assert_eq!(resolved.release.version, "4.5.2");
    assert!(resolved.nexus_detail.is_none());
}

#[test]
fn nexus_fallback_is_used_when_github_fails() {
    let detail = RemoteModDetail {
        version: Some("4.5.2".to_string()),
        primary_file_name: Some("SMAPI 4.5.2-2400-4-5-2-1730000000.zip".to_string()),
        primary_file_id: Some(12345),
        primary_file_size_bytes: Some(999),
        ..RemoteModDetail::empty(SMAPI_NEXUS_MOD_ID, SMAPI_NEXUS_MOD_PAGE_URL.to_string())
    };
    let nexus_release = smapi_release_from_nexus_detail(&detail, "4.5.2");

    let resolved = resolve_latest_smapi_source(
        Err("github unreachable".to_string()),
        Ok((nexus_release, detail.clone())),
    )
    .expect("nexus fallback wins");
    assert_eq!(resolved.source, SmapiVersionSource::Nexus);
    assert_eq!(resolved.release.version, "4.5.2");
    assert!(resolved.nexus_detail.is_some());

    // Nexus release shape: no sha256, no minimum game version, primary file asset.
    assert!(!resolved.release.prerelease);
    assert_eq!(resolved.release.minimum_game_version, None);
    assert_eq!(resolved.release.assets.len(), 1);
    assert_eq!(
        resolved.release.assets[0].name,
        "SMAPI 4.5.2-2400-4-5-2-1730000000.zip"
    );
    assert_eq!(resolved.release.assets[0].size_bytes, Some(999));
    assert_eq!(resolved.release.assets[0].sha256, None);
}

#[test]
fn both_sources_failing_reports_a_structured_combined_error() {
    let error = resolve_latest_smapi_source(
        Err("github unreachable".to_string()),
        Err("nexus 403".to_string()),
    )
    .expect_err("both sources failing must error");
    let message = error.to_string();
    assert!(message.contains("github unreachable"), "{message}");
    assert!(message.contains("nexus 403"), "{message}");
}

#[test]
fn nexus_prerelease_versions_are_marked_as_prerelease() {
    let detail = RemoteModDetail::empty(SMAPI_NEXUS_MOD_ID, SMAPI_NEXUS_MOD_PAGE_URL.to_string());
    let release = smapi_release_from_nexus_detail(&detail, "4.6.0-beta.1");
    assert!(release.prerelease);
}

#[test]
fn local_file_validation_accepts_recognized_installer_names() {
    let root = create_temp_dir("smapi-local-validation");
    let github_zip = root.join("SMAPI-4.5.2-installer.zip");
    write_file(&github_zip, "not a real zip but the name is what matters");
    let (version, kind) =
        validate_local_smapi_installer_file(&github_zip).expect("github naming accepted");
    assert_eq!(version, "4.5.2");
    assert_eq!(
        kind,
        SmapiInstallerFileKind::Github {
            double_zipped: false
        }
    );

    let nexus_zip = root.join("SMAPI 4.5.2-2400-4-5-2-1730000000.zip");
    write_file(&nexus_zip, "not a real zip");
    let (version, kind) =
        validate_local_smapi_installer_file(&nexus_zip).expect("nexus naming accepted");
    assert_eq!(version, "4.5.2");
    assert_eq!(kind, SmapiInstallerFileKind::Nexus);

    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn local_file_validation_rejects_non_installer_paths() {
    let root = create_temp_dir("smapi-local-validation-reject");
    let junk = root.join("random.zip");
    write_file(&junk, "junk");
    let error =
        validate_local_smapi_installer_file(&junk).expect_err("junk file name must be rejected");
    assert!(
        error
            .to_string()
            .contains("not a recognized SMAPI installer archive"),
        "unexpected error: {error}"
    );

    let missing = root.join("SMAPI-4.5.2-installer.zip");
    let error =
        validate_local_smapi_installer_file(&missing).expect_err("missing file must be rejected");
    assert!(
        error.to_string().contains("not a readable file"),
        "unexpected error: {error}"
    );

    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn sha256_hex_of_file_matches_the_computed_digest() {
    let root = create_temp_dir("smapi-sha256-file");
    let path = root.join("archive.bin");
    let bytes = b"SMAPI installer bytes for hashing";
    write_bytes_file(&path, bytes);
    let expected = format!("{:x}", Sha256::digest(bytes));
    assert_eq!(sha256_hex_of_file(&path).expect("hash"), expected);
    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn candidate_collection_picks_only_recognized_installer_files() {
    let root = create_temp_dir("smapi-candidate-dir");
    write_file(&root.join("SMAPI-4.0.8-installer.zip"), "old");
    write_file(
        &root.join("SMAPI-4.5.2-installer-double-zipped.zip"),
        "double",
    );
    write_file(&root.join("SMAPI 4.5.1-2400-4-5-1-1730000000.zip"), "nexus");
    write_file(&root.join("ContentPatcher.zip"), "junk");
    write_file(&root.join("notes.txt"), "junk");
    std::fs::create_dir_all(root.join("SMAPI-4.5.2-installer.zip")).expect("dir with zip name");

    let mut candidates = Vec::new();
    collect_installer_candidates_from_dir(&root, &mut candidates);
    assert_eq!(candidates.len(), 3, "only recognized installer files count");
    let by_name = |name: &str| {
        candidates
            .iter()
            .find(|candidate| candidate.file_name == name)
            .expect("candidate")
    };

    let plain = by_name("SMAPI-4.0.8-installer.zip");
    assert_eq!(plain.version, "4.0.8");
    assert!(!plain.double_zipped);
    assert_eq!(plain.naming, SmapiInstallerNaming::Github);

    let double = by_name("SMAPI-4.5.2-installer-double-zipped.zip");
    assert_eq!(double.version, "4.5.2");
    assert!(double.double_zipped);
    assert_eq!(double.naming, SmapiInstallerNaming::Github);

    let nexus = by_name("SMAPI 4.5.1-2400-4-5-1-1730000000.zip");
    assert_eq!(nexus.version, "4.5.1");
    assert!(!nexus.double_zipped);
    assert_eq!(nexus.naming, SmapiInstallerNaming::Nexus);

    std::fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn candidate_flags_reflect_compatibility_and_target_satisfaction() {
    let mut candidates = vec![
        SmapiInstallerDownloadCandidate {
            path: "/tmp/old.zip".to_string(),
            file_name: "SMAPI-4.0.8-installer.zip".to_string(),
            version: "4.0.8".to_string(),
            size_bytes: None,
            double_zipped: false,
            naming: SmapiInstallerNaming::Github,
            compatible: None,
            satisfies_target: None,
        },
        SmapiInstallerDownloadCandidate {
            path: "/tmp/current.zip".to_string(),
            file_name: "SMAPI-4.5.2-installer.zip".to_string(),
            version: "4.5.2".to_string(),
            size_bytes: None,
            double_zipped: false,
            naming: SmapiInstallerNaming::Github,
            compatible: None,
            satisfies_target: None,
        },
        SmapiInstallerDownloadCandidate {
            path: "/tmp/future.zip".to_string(),
            file_name: "SMAPI-4.6.0-installer.zip".to_string(),
            version: "4.6.0".to_string(),
            size_bytes: None,
            double_zipped: false,
            naming: SmapiInstallerNaming::Github,
            compatible: None,
            satisfies_target: None,
        },
    ];

    enrich_installer_candidate_flags(&mut candidates, Some("4.5.2"), Some("4.5.2"));
    assert_eq!(candidates[0].compatible, Some(true));
    assert_eq!(candidates[0].satisfies_target, Some(false));
    assert_eq!(candidates[1].compatible, Some(true));
    assert_eq!(candidates[1].satisfies_target, Some(true));
    assert_eq!(candidates[2].compatible, Some(false));
    assert_eq!(candidates[2].satisfies_target, Some(true));

    // Unknown references leave the flags null instead of guessed.
    enrich_installer_candidate_flags(&mut candidates, None, None);
    assert!(candidates.iter().all(|candidate| candidate.compatible.is_none()
        && candidate.satisfies_target.is_none()));
}

#[test]
fn candidates_sort_newest_version_first() {
    let mut candidates = vec![
        candidate_with_version("SMAPI-4.0.8-installer.zip"),
        candidate_with_version("SMAPI-4.5.2-installer.zip"),
        candidate_with_version("SMAPI-4.5.2-installer-double-zipped.zip"),
        candidate_with_version("SMAPI-4.10.0-installer.zip"),
    ];
    sort_installer_candidates(&mut candidates);
    let versions = candidates
        .iter()
        .map(|candidate| candidate.version.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        versions,
        vec!["4.10.0", "4.5.2", "4.5.2", "4.0.8"],
        "newest version first"
    );
    assert_eq!(
        candidates[1].file_name, "SMAPI-4.5.2-installer-double-zipped.zip",
        "equal versions tie-break by file name"
    );
    assert_eq!(candidates[2].file_name, "SMAPI-4.5.2-installer.zip");
}

fn candidate_with_version(file_name: &str) -> SmapiInstallerDownloadCandidate {
    let (version, _) = parse_smapi_installer_file_name(file_name).expect("candidate name");
    SmapiInstallerDownloadCandidate {
        path: format!("/tmp/{file_name}"),
        file_name: file_name.to_string(),
        version,
        size_bytes: None,
        double_zipped: file_name.contains("double-zipped"),
        naming: SmapiInstallerNaming::Github,
        compatible: None,
        satisfies_target: None,
    }
}

#[test]
fn version_source_serializes_as_lowercase_wire_labels() {
    let result = CheckSmapiUpdateResult {
        installed_version: "4.3.2".to_string(),
        game_version: "1.6.14".to_string(),
        latest_stable_version: "4.5.2".to_string(),
        target_version: "4.5.2".to_string(),
        update_available: true,
        version_source: SmapiVersionSource::Github,
        required_by_mods: Vec::new(),
        download: Some(SmapiUpdateDownloadInfo {
            source: SmapiVersionSource::Github,
            url: Some("https://github.com/...".to_string()),
            sha256: Some("abc".repeat(21)),
            size_bytes: Some(123),
            asset_name: "SMAPI-4.5.2-installer.zip".to_string(),
            nexus_mod_page_url: None,
            nexus_download_popup_url: None,
            nexus_file_id: None,
        }),
    };
    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["versionSource"], "github");
    assert_eq!(json["download"]["source"], "github");
    assert_eq!(json["download"]["url"], "https://github.com/...");
    assert_eq!(json["download"]["sha256"], "abc".repeat(21));
    assert!(json["download"].get("nexusModPageUrl").is_none());

    let nexus_result = CheckSmapiUpdateResult {
        installed_version: "4.3.2".to_string(),
        game_version: "1.6.14".to_string(),
        latest_stable_version: "4.5.2".to_string(),
        target_version: "4.5.2".to_string(),
        update_available: true,
        version_source: SmapiVersionSource::Nexus,
        required_by_mods: Vec::new(),
        download: Some(SmapiUpdateDownloadInfo {
            source: SmapiVersionSource::Nexus,
            url: None,
            sha256: None,
            size_bytes: Some(999),
            asset_name: "SMAPI 4.5.2-2400-4-5-2-1730000000.zip".to_string(),
            nexus_mod_page_url: Some(SMAPI_NEXUS_MOD_PAGE_URL.to_string()),
            nexus_download_popup_url: Some(
                "https://www.nexusmods.com/Core/Libs/Common/Widgets/DownloadPopUp?id=12345&game_id=1303".to_string(),
            ),
            nexus_file_id: Some(12345),
        }),
    };
    let nexus_json = serde_json::to_value(&nexus_result).unwrap();
    assert_eq!(nexus_json["versionSource"], "nexus");
    assert_eq!(nexus_json["download"]["source"], "nexus");
    assert!(nexus_json["download"].get("url").is_none());
    assert!(nexus_json["download"].get("sha256").is_none());
    assert_eq!(
        nexus_json["download"]["nexusModPageUrl"],
        SMAPI_NEXUS_MOD_PAGE_URL
    );
    assert_eq!(nexus_json["download"]["nexusFileId"], 12345);
}

#[test]
fn install_request_accepts_local_file_branch_fields() {
    let request: InstallSmapiUpdateRequest = serde_json::from_value(serde_json::json!({
        "targetVersion": "4.5.2",
        "localFilePath": "C:/Downloads/SMAPI-4.5.2-installer.zip",
    }))
    .unwrap();
    assert_eq!(
        request.local_file_path.as_deref(),
        Some("C:/Downloads/SMAPI-4.5.2-installer.zip")
    );
    assert_eq!(request.download_url, None);
    assert_eq!(request.expected_sha256, None);
}
