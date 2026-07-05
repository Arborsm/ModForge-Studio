use crate::domain::content_patcher::types::VirtualPreviewAsset;
use crate::domain::cp_maker::types::CpMakerExportResult;
use crate::domain::cp_maker::{export_cp_maker_pack, types::CpMakerExportRequest};
use crate::infrastructure::fs::pathing::normalize_path;
use crate::test_support::{create_temp_dir, write_file};
use base64::Engine;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

fn virtual_asset(relative_path: &str, bytes: &[u8]) -> VirtualPreviewAsset {
    VirtualPreviewAsset {
        relative_path: relative_path.to_string(),
        media_type: "application/octet-stream".to_string(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    }
}

fn assert_export_paths(result: &CpMakerExportResult, output_dir: &Path) {
    assert_eq!(result.output_path, normalize_path(output_dir));
    assert_eq!(
        result.manifest_path,
        normalize_path(&output_dir.join("manifest.json"))
    );
    assert_eq!(
        result.content_path,
        normalize_path(&output_dir.join("content.json"))
    );
}

fn export_request(
    output_dir: &Path,
    virtual_assets: Vec<VirtualPreviewAsset>,
) -> CpMakerExportRequest {
    CpMakerExportRequest {
        output_path: output_dir.to_string_lossy().into_owned(),
        manifest_json: json!({
            "Name": "Generated Export",
            "Author": "ModForge",
            "Version": "1.0.0",
            "UniqueID": "ModForge.GeneratedExport",
            "ContentPackFor": {
                "UniqueID": "Pathoschild.ContentPatcher"
            }
        })
        .to_string(),
        content_json: json!({
            "Format": "2.0.0",
            "Changes": []
        })
        .to_string(),
        virtual_assets,
    }
}

#[test]
fn exports_cp_maker_pack_to_a_fresh_directory() {
    let root = create_temp_dir("cp-maker-export-success");
    let output_dir = root.join("Fresh Export");
    let manifest = json!({
        "Name": "Generated Export",
        "Author": "ModForge",
        "Version": "1.0.0",
        "UniqueID": "ModForge.GeneratedExport",
        "ContentPackFor": {
            "UniqueID": "Pathoschild.ContentPatcher"
        }
    });
    let content = json!({
        "Format": "2.0.0",
        "Changes": [
            {
                "Action": "EditData",
                "Target": "Data/mail",
                "Entries": {
                    "ModForge.Letter": "Hello from export"
                }
            }
        ]
    });
    let asset_a_path = output_dir.join("assets/mail.json");
    let asset_b_path = output_dir.join("assets/nested/texture.bin");
    let request = CpMakerExportRequest {
        output_path: output_dir.to_string_lossy().into_owned(),
        manifest_json: manifest.to_string(),
        content_json: content.to_string(),
        virtual_assets: vec![
            virtual_asset("assets/mail.json", br#"{"value":"mail"}"#),
            virtual_asset("assets/nested/texture.bin", &[1, 3, 3, 7]),
        ],
    };

    let result = export_cp_maker_pack(request).expect("export cp maker pack");

    assert_export_paths(&result, &output_dir);
    assert_eq!(
        result.virtual_asset_paths,
        vec![normalize_path(&asset_a_path), normalize_path(&asset_b_path)]
    );
    assert_eq!(
        fs::read_to_string(output_dir.join("manifest.json")).expect("read manifest"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&manifest).expect("format manifest")
        )
    );
    assert_eq!(
        fs::read_to_string(output_dir.join("content.json")).expect("read content"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&content).expect("format content")
        )
    );
    assert_eq!(
        fs::read(asset_a_path).expect("read virtual asset json"),
        br#"{"value":"mail"}"#
    );
    assert_eq!(
        fs::read(asset_b_path).expect("read virtual asset bytes"),
        vec![1, 3, 3, 7]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_target_directory_is_not_fresh() {
    let root = create_temp_dir("cp-maker-export-non-empty");
    let output_dir = root.join("Existing Export");
    let manifest = json!({
        "Name": "Generated Export",
        "Author": "ModForge",
        "Version": "1.0.0",
        "UniqueID": "ModForge.GeneratedExport",
        "ContentPackFor": {
            "UniqueID": "Pathoschild.ContentPatcher"
        }
    });
    let content = json!({
        "Format": "2.0.0",
        "Changes": []
    });
    write_file(&output_dir.join("keep.txt"), "leave me alone");

    let error = export_cp_maker_pack(CpMakerExportRequest {
        output_path: output_dir.to_string_lossy().into_owned(),
        manifest_json: manifest.to_string(),
        content_json: content.to_string(),
        virtual_assets: vec![virtual_asset("assets/example.txt", b"ignored")],
    })
    .expect_err("expected export to reject a non-empty target directory");

    let message = error.to_string();
    assert!(message.contains("fresh"), "{message}");
    assert!(
        message.contains(&format!("[path={}]", normalize_path(&output_dir))),
        "{message}"
    );
    assert_eq!(
        fs::read_to_string(output_dir.join("keep.txt")).expect("read existing file"),
        "leave me alone"
    );
    assert!(!output_dir.join("manifest.json").exists());
    assert!(!output_dir.join("content.json").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_output_path_contains_parent_component() {
    let root = create_temp_dir("cp-maker-export-parent-component");
    let output_dir = root.join("fresh").join("..");

    let error = export_cp_maker_pack(export_request(&output_dir, Vec::new()))
        .expect_err("expected export to reject output paths with parent traversal");

    let message = error.to_string();
    assert!(message.contains("clean"), "{message}");
    assert!(
        message.contains(&format!("[path={}]", normalize_path(&output_dir))),
        "{message}"
    );
    assert!(!root.join("fresh").exists());
    assert!(!root.join("manifest.json").exists());
    assert!(!root.join("content.json").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_virtual_asset_collides_with_reserved_output() {
    let root = create_temp_dir("cp-maker-export-reserved-collision");
    let output_dir = root.join("Collision Export");

    let error = export_cp_maker_pack(export_request(
        &output_dir,
        vec![virtual_asset("manifest.json", br#"{"overwritten":true}"#)],
    ))
    .expect_err("expected export to reject reserved output collisions");

    let message = error.to_string();
    assert!(message.contains("manifest.json"), "{message}");
    assert!(!output_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_virtual_asset_case_collides_with_reserved_output() {
    let root = create_temp_dir("cp-maker-export-reserved-case-collision");
    let output_dir = root.join("Collision Export");

    let error = export_cp_maker_pack(export_request(
        &output_dir,
        vec![virtual_asset("Manifest.json", br#"{"overwritten":true}"#)],
    ))
    .expect_err(
        "expected export to reject reserved output collisions on case-insensitive filesystems",
    );

    let message = error.to_string();
    assert!(message.contains("manifest.json"), "{message}");
    assert!(!output_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_virtual_assets_normalize_to_same_path() {
    let root = create_temp_dir("cp-maker-export-duplicate-assets");
    let output_dir = root.join("Collision Export");

    let error = export_cp_maker_pack(export_request(
        &output_dir,
        vec![
            virtual_asset("assets/mail.json", br#"{"first":true}"#),
            virtual_asset(r"assets\mail.json", br#"{"second":true}"#),
        ],
    ))
    .expect_err("expected export to reject duplicate normalized asset paths");

    let message = error.to_string();
    assert!(message.contains("assets/mail.json"), "{message}");
    assert!(!output_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_virtual_assets_only_differ_by_case() {
    let root = create_temp_dir("cp-maker-export-case-duplicate-assets");
    let output_dir = root.join("Collision Export");

    let error = export_cp_maker_pack(export_request(
        &output_dir,
        vec![
            virtual_asset("Assets/Mail.json", br#"{"first":true}"#),
            virtual_asset("assets/mail.json", br#"{"second":true}"#),
        ],
    ))
    .expect_err(
        "expected export to reject duplicate asset paths that only differ by case on case-insensitive filesystems",
    );

    let message = error.to_string();
    assert!(message.contains("assets/mail.json"), "{message}");
    assert!(!output_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn rejects_cp_maker_export_when_virtual_assets_only_differ_by_unicode_case() {
    let root = create_temp_dir("cp-maker-export-unicode-case-duplicate-assets");
    let output_dir = root.join("Collision Export");

    let error = export_cp_maker_pack(export_request(
        &output_dir,
        vec![
            virtual_asset("assets/Ärtifact.json", br#"{"first":true}"#),
            virtual_asset("assets/ärtifact.json", br#"{"second":true}"#),
        ],
    ))
    .expect_err(
        "expected export to reject duplicate asset paths that only differ by unicode case on case-insensitive filesystems",
    );

    let message = error.to_string();
    assert!(message.contains("assets/ärtifact.json"), "{message}");
    assert!(!output_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn exported_json_files_keep_pretty_format_with_trailing_newline() {
    let root = create_temp_dir("cp-maker-export-json");
    let output_dir = root.join("Json Export");
    let manifest = json!({
        "Name": "Generated Export",
        "Author": "ModForge",
        "Version": "1.0.0",
        "UniqueID": "ModForge.GeneratedExport",
        "ContentPackFor": {
            "UniqueID": "Pathoschild.ContentPatcher"
        }
    });
    let content = json!({
        "Format": "2.0.0",
        "Changes": [
            {
                "Action": "EditData",
                "Target": "Data/Objects"
            }
        ]
    });

    export_cp_maker_pack(CpMakerExportRequest {
        output_path: output_dir.to_string_lossy().into_owned(),
        manifest_json: manifest.to_string(),
        content_json: content.to_string(),
        virtual_assets: Vec::new(),
    })
    .expect("export cp maker pack");

    let manifest_text = fs::read_to_string(output_dir.join("manifest.json")).expect("manifest");
    let content_text = fs::read_to_string(output_dir.join("content.json")).expect("content");
    let parsed_manifest: Value = serde_json::from_str(&manifest_text).expect("parse manifest");
    let parsed_content: Value = serde_json::from_str(&content_text).expect("parse content");

    assert_eq!(parsed_manifest, manifest);
    assert_eq!(parsed_content, content);
    assert_eq!(
        manifest_text,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&manifest).expect("format manifest")
        )
    );
    assert_eq!(
        content_text,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&content).expect("format content")
        )
    );
    assert!(manifest_text.ends_with('\n'));
    assert!(content_text.ends_with('\n'));

    fs::remove_dir_all(root).expect("cleanup");
}
