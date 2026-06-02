use super::load_content_patcher_project;
use crate::test_support::{create_temp_dir, write_file};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn sample_cp_manifest() -> &'static str {
    r#"{
  "Name": "Snapshot Pack",
  "UniqueID": "ModForge.SnapshotPack",
  "ContentPackFor": { "UniqueID": "Pathoschild.ContentPatcher" }
}"#
}

fn sample_non_cp_manifest() -> &'static str {
    r#"{
  "Name": "Not CP Pack",
  "UniqueID": "ModForge.NotCP",
  "ContentPackFor": { "UniqueID": "Some.Other.Framework" }
}"#
}

#[test]
fn load_content_patcher_project_returns_include_tree_sources_and_summary_metadata() {
    let root = create_temp_dir("cp-project-snapshot");
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "patches/spring.json" }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("spring.json"),
        r#"{
  "Changes": [
    { "Action": "EditData", "Target": "Data/Objects", "When": { "Season": "spring" } }
  ]
}"#,
    );

    let snapshot =
        load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    assert_eq!(snapshot.summary.name.as_deref(), Some("Snapshot Pack"));
    assert_eq!(
        snapshot.summary.unique_id.as_deref(),
        Some("ModForge.SnapshotPack")
    );
    assert_eq!(
        snapshot.summary.content_pack_for.as_deref(),
        Some("Pathoschild.ContentPatcher")
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .absolute_path
                .as_deref()
                .expect("absolute path")
        )
        .is_absolute()
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .absolute_path
                .as_deref()
                .expect("absolute path")
        )
        .ends_with(root.file_name().expect("root name"))
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .manifest_path
                .as_deref()
                .expect("manifest path")
        )
        .is_absolute()
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .manifest_path
                .as_deref()
                .expect("manifest path")
        )
        .ends_with(Path::new("manifest.json"))
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .content_path
                .as_deref()
                .expect("content path")
        )
        .is_absolute()
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .content_path
                .as_deref()
                .expect("content path")
        )
        .ends_with(Path::new("content.json"))
    );
    assert_eq!(snapshot.sources.len(), 2);
    assert!(
        snapshot
            .sources
            .iter()
            .any(|source| source.path == "content.json"
                && Path::new(&source.absolute_path).ends_with(Path::new("content.json"))
                && source.raw_json.contains("\"Format\": \"2.0.0\""))
    );
    assert!(
        snapshot
            .sources
            .iter()
            .any(|source| source.path == "patches/spring.json"
                && Path::new(&source.absolute_path)
                    .ends_with(Path::new("patches").join("spring.json"))
                && source.raw_json.contains("\"Action\": \"EditData\""))
    );
    assert_eq!(snapshot.include_tree.len(), 1);
    assert_eq!(snapshot.include_tree[0].source_path, "content.json");
    assert_eq!(
        snapshot.include_tree[0].included_path,
        "patches/spring.json"
    );
    assert!(snapshot.diagnostics.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_accepts_relaxed_json_and_reports_warning_diagnostics() {
    let root = create_temp_dir("cp-project-relaxed-json");
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  // valid in Content Patcher packs
  "Changes": [
    { "Action": "Include", "FromFile": "patches/spring.json", },
  ],
}"#,
    );
    write_file(
        &root.join("patches").join("spring.json"),
        r#"{
  "Changes": []
}"#,
    );

    let snapshot =
        load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    assert_eq!(snapshot.include_tree.len(), 1);
    assert!(
        snapshot
            .diagnostics
            .iter()
            .any(|diag| diag.severity == "warning"
                && diag.field.as_deref() == Some("content.Format"))
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_accepts_bom_nbsp_and_raw_newlines() {
    let root = create_temp_dir("cp-project-relaxed-edge");
    let manifest = format!("\u{feff}{}", sample_cp_manifest());
    let nbsp = '\u{00A0}'.to_string();
    let content = format!(
        concat!(
            "{{\n",
            "\"Format\": \"2.0.0\",\n",
            "\"Changes\": [\n",
            "\t{{\n",
            "{0} {0} {0}\"Action\": \"EditData\",\n",
            "{0} {0} {0}\"Target\": \"Data/Events/Town\",\n",
            "{0} {0} {0}\"Entries\": {{\n",
            "{0} {0} {0}  \"MuseumBook\": \"Line 1\n",
            "Line 2\"\n",
            "{0} {0} {0}}}\n",
            "\t}}\n",
            "]\n",
            "}}"
        ),
        nbsp
    );

    write_file(&root.join("manifest.json"), &manifest);
    write_file(&root.join("content.json"), &content);

    let snapshot =
        load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    assert_eq!(snapshot.sources.len(), 1);
    assert!(snapshot.sources[0].raw_json.contains("MuseumBook"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_rejects_non_content_patcher_manifest() {
    let root = create_temp_dir("cp-project-non-cp");
    write_file(&root.join("manifest.json"), sample_non_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": []
}"#,
    );

    let err = load_content_patcher_project(root.to_string_lossy().into_owned())
        .expect_err("non-cp manifest should fail");
    assert!(err.contains("Pathoschild.ContentPatcher"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_rejects_include_paths_outside_project_root() {
    let root = create_temp_dir("cp-project-root-escape");
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "../outside.json" }
  ]
}"#,
    );

    let outside_path = root
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("outside.json");
    write_file(
        &outside_path,
        r#"{
  "Changes": []
}"#,
    );

    let err = load_content_patcher_project(root.to_string_lossy().into_owned())
        .expect_err("include escape should fail");
    assert!(err.contains("outside the project root"));

    if outside_path.is_file() {
        fs::remove_file(&outside_path).expect("cleanup outside");
    }
    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_rejects_missing_include_outside_project_root_before_probe() {
    let root = create_temp_dir("cp-project-root-escape-missing");
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "../missing.json" }
  ]
}"#,
    );

    let err = load_content_patcher_project(root.to_string_lossy().into_owned())
        .expect_err("include escape should fail");
    assert!(err.contains("outside the project root"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_normalizes_absolute_paths_from_relative_root_input() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let cwd = std::env::current_dir().expect("cwd");
    let relative_dir_name = format!("tmp-cp-relative-{unique}");
    let root = cwd.join(&relative_dir_name);
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": []
}"#,
    );

    let snapshot =
        load_content_patcher_project(format!(".\\{relative_dir_name}")).expect("snapshot");
    assert!(
        Path::new(
            snapshot
                .summary
                .absolute_path
                .as_deref()
                .expect("absolute path")
        )
        .is_absolute()
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .manifest_path
                .as_deref()
                .expect("manifest path")
        )
        .is_absolute()
    );
    assert!(
        Path::new(
            snapshot
                .summary
                .content_path
                .as_deref()
                .expect("content path")
        )
        .is_absolute()
    );
    assert!(
        snapshot
            .sources
            .iter()
            .all(|source| Path::new(&source.absolute_path).is_absolute())
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_content_patcher_project_normalizes_dot_segment_include_within_root() {
    let root = create_temp_dir("cp-project-dot-segment-include");
    write_file(&root.join("manifest.json"), sample_cp_manifest());
    write_file(
        &root.join("content.json"),
        r#"{
  "Format": "2.0.0",
  "Changes": [
    { "Action": "Include", "FromFile": "patches/../patches/spring.json" }
  ]
}"#,
    );
    write_file(
        &root.join("patches").join("spring.json"),
        r#"{
  "Changes": []
}"#,
    );

    let snapshot =
        load_content_patcher_project(root.to_string_lossy().into_owned()).expect("snapshot");
    assert_eq!(snapshot.include_tree.len(), 1);
    assert_eq!(
        snapshot.include_tree[0].included_path,
        "patches/spring.json"
    );
    assert!(
        snapshot
            .sources
            .iter()
            .any(|source| source.path == "patches/spring.json")
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn load_real_cp_mods_produces_valid_snapshots() {
    let mods_dir = std::path::PathBuf::from("E:/SteamLibrary/steamapps/common/Stardew Valley/Mods");
    if !mods_dir.is_dir() {
        return;
    }

    let test_mods = [
        "[CP] DaisyNiko's Tilesheets",
        "[CP] [DDF] Skimpy VN Portraits II",
        "[CP] Childhood Sweetheart Caroline",
        "[CP] Mermaid Replaces Mariner",
    ];

    for mod_name in test_mods {
        let mod_path = mods_dir.join(mod_name);
        if !mod_path.is_dir() {
            continue;
        }
        let snapshot = load_content_patcher_project(mod_path.to_string_lossy().into_owned());
        assert!(
            snapshot.is_ok(),
            "Failed to load {}: {:?}",
            mod_name,
            snapshot.err()
        );
        let snapshot = snapshot.unwrap();
        assert!(
            snapshot.summary.name.is_some(),
            "{} missing summary name",
            mod_name
        );
        assert!(
            snapshot.sources.iter().any(|s| s.path == "content.json"),
            "{} missing content.json source",
            mod_name
        );
    }
}
