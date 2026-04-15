use crate::domain::launcher::archive::{
    inspect_archive_at_path, install_archive_at_path, resolve_backup_session_path,
};
use crate::test_support::{create_temp_dir, write_file};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;
use zip::ZipWriter;

fn sample_manifest(unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}"
}}"#
    )
}

fn create_zip_from_directory(source_dir: &Path, archive_path: &Path) {
    let archive_file = fs::File::create(archive_path).expect("create archive file");
    let mut archive = ZipWriter::new(archive_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for relative_path in collect_relative_files(source_dir) {
        let source_path = source_dir.join(&relative_path);
        let archive_entry = relative_path.to_string_lossy().replace('\\', "/");
        archive
            .start_file(archive_entry, options)
            .expect("start archive file");
        archive
            .write_all(&fs::read(&source_path).expect("read source file"))
            .expect("write archive file");
    }

    archive.finish().expect("finish archive");
}

fn collect_relative_files(root: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_relative_files_recursive(root, root, &mut files);
    files.sort();
    files
}

fn collect_relative_files_recursive(root: &Path, current_dir: &Path, output: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(current_dir).expect("read directory") {
        let entry = entry.expect("directory entry");
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_relative_files_recursive(root, &entry_path, output);
            continue;
        }
        output.push(
            entry_path
                .strip_prefix(root)
                .expect("relative path")
                .to_path_buf(),
        );
    }
}

fn collect_paths(nodes: &[crate::domain::launcher::types::LauncherArchiveTreeNode], output: &mut Vec<String>) {
    for node in nodes {
        output.push(node.path.clone());
        collect_paths(&node.children, output);
    }
}

#[test]
fn inspect_archive_detects_manifest_roots_and_builds_tree_cross_platform() {
    let root = create_temp_dir("launcher-inspect-archive");
    let source = root.join("source");
    write_file(
        &source.join("ModA").join("manifest.json"),
        &sample_manifest("ModForge.ModA"),
    );
    write_file(
        &source.join("ModA").join("assets").join("icon.png"),
        "png-bytes",
    );
    write_file(
        &source.join("Nested").join("ModB").join("manifest.json"),
        &sample_manifest("ModForge.ModB"),
    );
    write_file(&source.join("readme.txt"), "hello");

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path).expect("inspect archive");
    assert_eq!(result.archive_file_name, "bundle.zip");
    assert_eq!(result.total_files, 4);
    assert_eq!(
        result.mod_roots,
        vec!["ModA".to_string(), "Nested/ModB".to_string()]
    );

    let mut paths = Vec::new();
    collect_paths(&result.tree, &mut paths);
    assert!(paths.contains(&"ModA".to_string()));
    assert!(paths.contains(&"ModA/manifest.json".to_string()));
    assert!(paths.contains(&"ModA/assets/icon.png".to_string()));
    assert!(paths.contains(&"Nested/ModB".to_string()));
    assert!(paths.contains(&"Nested/ModB/manifest.json".to_string()));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_installs_zip_bundle_and_reports_backup_details_cross_platform() {
    let root = create_temp_dir("launcher-install-archive");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install archive");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].unique_id.as_deref(),
        Some("ModForge.ExamplePack")
    );
    assert!(mods_root.join("[CP] Example Pack").join("manifest.json").is_file());
    assert!(!result.backup_id.trim().is_empty());
    assert!(Path::new(&result.backup_path).join("metadata.json").is_file());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn resolve_backup_session_path_rejects_nested_or_absolute_backup_ids() {
    let root = create_temp_dir("launcher-backup-path");
    let backup_root = root.join("backups");
    fs::create_dir_all(&backup_root).expect("create backup root");

    assert_eq!(
        resolve_backup_session_path(&backup_root, "install-123").expect("resolve direct backup id"),
        backup_root.join("install-123")
    );

    assert!(resolve_backup_session_path(&backup_root, "../escape").is_err());
    assert!(resolve_backup_session_path(&backup_root, "nested/entry").is_err());
    assert!(resolve_backup_session_path(&backup_root, "nested\\entry").is_err());
    assert!(resolve_backup_session_path(&backup_root, "/tmp/escape").is_err());

    fs::remove_dir_all(root).expect("cleanup");
}
