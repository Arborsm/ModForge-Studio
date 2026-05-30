use crate::domain::launcher::archive::{
    inspect_archive_at_path, install_archive_at_path, resolve_backup_session_path,
};
use crate::test_support::{create_temp_dir, write_file};
use flate2::write::GzEncoder;
use flate2::Compression;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tar::Builder;
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

fn create_tar_gz_from_directory(source_dir: &Path, archive_path: &Path) {
    let archive_file = fs::File::create(archive_path).expect("create tar.gz file");
    let encoder = GzEncoder::new(archive_file, Compression::default());
    let mut archive = Builder::new(encoder);
    let root_name = source_dir
        .file_name()
        .expect("source directory file name")
        .to_owned();

    for relative_path in collect_relative_files(source_dir) {
        let source_path = source_dir.join(&relative_path);
        let archive_entry = PathBuf::from(&root_name).join(&relative_path);
        archive
            .append_path_with_name(&source_path, &archive_entry)
            .expect("append tar.gz file");
    }

    archive.finish().expect("finish tar.gz archive");
    archive
        .into_inner()
        .expect("into tar.gz encoder")
        .finish()
        .expect("finish tar.gz encoder");
}

fn create_7z_from_directory(source_dir: &Path, archive_path: &Path) {
    sevenz_rust::compress_to_path(source_dir, archive_path).expect("compress 7z archive");
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

fn collect_paths(
    nodes: &[crate::domain::launcher::types::LauncherArchiveTreeNode],
    output: &mut Vec<String>,
) {
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
    assert!(mods_root
        .join("[CP] Example Pack")
        .join("manifest.json")
        .is_file());
    assert!(!result.backup_id.trim().is_empty());
    assert!(Path::new(&result.backup_path)
        .join("metadata.json")
        .is_file());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_detects_manifest_roots_inside_tar_gz_archive() {
    let root = create_temp_dir("launcher-inspect-archive-tar-gz");
    let source = root.join("[CP] Tar Pack");
    write_file(
        &source.join("manifest.json"),
        &sample_manifest("ModForge.TarPack"),
    );
    write_file(
        &source.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.tar.gz");
    create_tar_gz_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path).expect("inspect tar.gz archive");
    assert_eq!(result.archive_file_name, "bundle.tar.gz");
    assert_eq!(result.mod_roots, vec!["[CP] Tar Pack".to_string()]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_installs_tar_gz_bundle_and_reports_backup_details() {
    let root = create_temp_dir("launcher-install-archive-tar-gz");
    let source = root.join("[CP] Tar Install Pack");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &source.join("manifest.json"),
        &sample_manifest("ModForge.TarInstallPack"),
    );
    write_file(
        &source.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.tar.gz");
    create_tar_gz_from_directory(&source, &archive_path);

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install tar.gz archive");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].unique_id.as_deref(),
        Some("ModForge.TarInstallPack")
    );
    assert!(mods_root
        .join("[CP] Tar Install Pack")
        .join("manifest.json")
        .is_file());
    assert!(Path::new(&result.backup_path)
        .join("metadata.json")
        .is_file());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_uses_manifest_name_for_zip_with_manifest_at_archive_root() {
    let root = create_temp_dir("launcher-install-root-manifest-zip");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &source.join("manifest.json"),
        &sample_manifest("ModForge.RootZipPack"),
    );
    write_file(
        &source.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("root.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install zip archive with root manifest");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].unique_id.as_deref(),
        Some("ModForge.RootZipPack")
    );
    assert!(mods_root
        .join("Example Mod")
        .join("manifest.json")
        .is_file());
    assert!(!mods_root.join("launcher-install-bundle").exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_detects_manifest_roots_inside_7z_archive() {
    let root = create_temp_dir("launcher-inspect-archive-7z");
    let source = root.join("source");
    let bundle_root = source.join("[CP] SevenZip Pack");
    write_file(
        &bundle_root.join("manifest.json"),
        &sample_manifest("ModForge.SevenZipPack"),
    );
    write_file(
        &bundle_root.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.7z");
    create_7z_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path).expect("inspect 7z archive");
    assert_eq!(result.archive_file_name, "bundle.7z");
    assert_eq!(result.mod_roots, vec!["[CP] SevenZip Pack".to_string()]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_installs_7z_bundle_and_reports_backup_details() {
    let root = create_temp_dir("launcher-install-archive-7z");
    let source = root.join("source");
    let bundle_root = source.join("[CP] SevenZip Install Pack");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &bundle_root.join("manifest.json"),
        &sample_manifest("ModForge.SevenZipInstallPack"),
    );
    write_file(
        &bundle_root.join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.7z");
    create_7z_from_directory(&source, &archive_path);

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install 7z archive");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].unique_id.as_deref(),
        Some("ModForge.SevenZipInstallPack")
    );
    assert!(mods_root
        .join("[CP] SevenZip Install Pack")
        .join("manifest.json")
        .is_file());
    assert!(Path::new(&result.backup_path)
        .join("metadata.json")
        .is_file());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_rejects_unsupported_archive_extensions() {
    let root = create_temp_dir("launcher-inspect-archive-unsupported");
    let archive_path = root.join("bundle.unsupported");
    write_file(&archive_path, "not-an-archive");

    let result = inspect_archive_at_path(&archive_path);
    let message = result.expect_err("unsupported archive extension should fail");
    assert!(message.contains("Unsupported archive format"));
    assert!(message.contains(".unsupported"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_routes_rar_extensions_to_the_rar_extractor() {
    let root = create_temp_dir("launcher-inspect-archive-rar");
    let archive_path = root.join("bundle.rar");
    write_file(&archive_path, "not-a-rar-archive");

    let result = inspect_archive_at_path(&archive_path);
    let message = result.expect_err("invalid rar archive should fail");
    assert!(message.contains("as a rar file"));
    assert!(!message.contains("Unsupported archive format"));

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
