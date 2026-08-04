use crate::domain::launcher::archive::{
    inspect_archive_at_path, install_archive_at_path, resolve_backup_session_path,
};
use crate::domain::launcher::types::{InspectLauncherArchiveResult, LauncherArchiveFileChangeKind};
use crate::test_support::{create_temp_dir, write_bytes_file, write_file};
use flate2::Compression;
use flate2::write::GzEncoder;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tar::Builder;
use zip::CompressionMethod;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

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

fn sample_manifest_with_version(unique_id: &str, version: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Mod",
  "Author": "ModForge",
  "Version": "{version}",
  "UniqueID": "{unique_id}"
}}"#
    )
}

fn mod_root_paths(result: &InspectLauncherArchiveResult) -> Vec<String> {
    result
        .mod_roots
        .iter()
        .map(|root| root.path.clone())
        .collect()
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

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect archive");
    assert_eq!(result.archive_file_name, "bundle.zip");
    assert_eq!(result.total_files, 4);
    assert_eq!(
        mod_root_paths(&result),
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
    assert!(
        mods_root
            .join("[CP] Example Pack")
            .join("manifest.json")
            .is_file()
    );
    assert!(!result.backup_id.trim().is_empty());
    assert!(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .is_file()
    );

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

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect tar.gz archive");
    assert_eq!(result.archive_file_name, "bundle.tar.gz");
    assert_eq!(mod_root_paths(&result), vec!["[CP] Tar Pack".to_string()]);

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
    assert!(
        mods_root
            .join("[CP] Tar Install Pack")
            .join("manifest.json")
            .is_file()
    );
    assert!(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .is_file()
    );

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
    assert!(
        mods_root
            .join("Example Mod")
            .join("manifest.json")
            .is_file()
    );
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

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect 7z archive");
    assert_eq!(result.archive_file_name, "bundle.7z");
    assert_eq!(
        mod_root_paths(&result),
        vec!["[CP] SevenZip Pack".to_string()]
    );

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
    assert!(
        mods_root
            .join("[CP] SevenZip Install Pack")
            .join("manifest.json")
            .is_file()
    );
    assert!(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .is_file()
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_rejects_unsupported_archive_extensions() {
    let root = create_temp_dir("launcher-inspect-archive-unsupported");
    let archive_path = root.join("bundle.unsupported");
    write_file(&archive_path, "not-an-archive");

    let result = inspect_archive_at_path(&archive_path, None);
    let message = result.expect_err("unsupported archive extension should fail");
    assert!(message.to_string().contains("Unsupported archive format"));
    assert!(message.to_string().contains(".unsupported"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_routes_rar_extensions_to_the_rar_extractor() {
    let root = create_temp_dir("launcher-inspect-archive-rar");
    let archive_path = root.join("bundle.rar");
    write_file(&archive_path, "not-a-rar-archive");

    let result = inspect_archive_at_path(&archive_path, None);
    let message = result.expect_err("invalid rar archive should fail");
    assert!(message.to_string().contains("as a rar file"));
    assert!(!message.to_string().contains("Unsupported archive format"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_reports_manifest_metadata_for_detected_roots() {
    let root = create_temp_dir("launcher-inspect-manifest-metadata");
    let source = root.join("source");
    write_file(
        &source.join("ModA").join("manifest.json"),
        &sample_manifest_with_version("ModForge.ModA", "2.1.0"),
    );
    write_file(&source.join("ModA").join("content.json"), "{}");
    write_file(
        &source.join("NoVersion").join("manifest.json"),
        r#"{"Name":"No Version Mod","UniqueID":"ModForge.NoVersion"}"#,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect archive");
    assert_eq!(result.mod_roots.len(), 2);

    let mod_a = result
        .mod_roots
        .iter()
        .find(|info| info.path == "ModA")
        .expect("ModA root");
    assert_eq!(mod_a.manifest_unique_id.as_deref(), Some("ModForge.ModA"));
    assert_eq!(mod_a.manifest_name.as_deref(), Some("Example Mod"));
    assert_eq!(mod_a.manifest_version.as_deref(), Some("2.1.0"));
    assert_eq!(mod_a.existing_unique_id, None);
    assert_eq!(mod_a.existing_version, None);
    assert_eq!(mod_a.existing_path, None);
    assert_eq!(mod_a.diff_summary, None);

    let no_version = result
        .mod_roots
        .iter()
        .find(|info| info.path == "NoVersion")
        .expect("NoVersion root");
    assert_eq!(
        no_version.manifest_unique_id.as_deref(),
        Some("ModForge.NoVersion")
    );
    assert_eq!(no_version.manifest_version, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_matches_installed_mod_and_reports_diff_summary() {
    let root = create_temp_dir("launcher-inspect-existing-diff");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let existing_root = mods_root.join("[CP] Example Pack");
    let backup_root = root.join("backups");

    // Already-installed mod: version 1.0.0 with config and one stale file.
    write_file(
        &existing_root.join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "1.0.0"),
    );
    write_file(&existing_root.join("config.json"), r#"{"tone":"old"}"#);
    write_file(&existing_root.join("stale.txt"), "remove-me");

    // Incoming archive: version 2.0.0, changed config, one new file, stale gone.
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "2.0.0"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("config.json"),
        r#"{"tone":"new"}"#,
    );
    write_file(
        &source.join("[CP] Example Pack").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, Some(&mods_root)).expect("inspect archive");
    assert_eq!(result.mod_roots.len(), 1);
    let root_info = &result.mod_roots[0];
    assert_eq!(
        root_info.manifest_unique_id.as_deref(),
        Some("ModForge.ExamplePack")
    );
    assert_eq!(root_info.manifest_version.as_deref(), Some("2.0.0"));
    assert_eq!(
        root_info.existing_unique_id.as_deref(),
        Some("ModForge.ExamplePack")
    );
    assert_eq!(root_info.existing_version.as_deref(), Some("1.0.0"));
    assert_eq!(
        root_info.existing_path.as_deref(),
        Some(existing_root.to_string_lossy().as_ref())
    );
    let diff = root_info.diff_summary.as_ref().expect("diff summary");
    assert_eq!(diff.added, 1);
    assert_eq!(diff.changed, 2);
    assert_eq!(diff.removed, 1);

    // Install would replace in place; verify install result agrees with the
    // matched existing path and reports the upgrade.
    let install_result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install archive over existing");
    assert!(install_result.upgraded);
    assert_eq!(install_result.previous_version.as_deref(), Some("1.0.0"));
    assert_eq!(install_result.version.as_deref(), Some("2.0.0"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_leaves_existing_info_absent_when_unique_id_not_installed() {
    let root = create_temp_dir("launcher-inspect-no-existing-match");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    write_file(
        &mods_root.join("Other Mod").join("manifest.json"),
        &sample_manifest_with_version("ModForge.OtherMod", "3.0.0"),
    );
    write_file(
        &source.join("Incoming Mod").join("manifest.json"),
        &sample_manifest_with_version("ModForge.IncomingMod", "1.0.0"),
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, Some(&mods_root)).expect("inspect archive");
    assert_eq!(result.mod_roots.len(), 1);
    let root_info = &result.mod_roots[0];
    assert_eq!(
        root_info.manifest_unique_id.as_deref(),
        Some("ModForge.IncomingMod")
    );
    assert_eq!(root_info.existing_unique_id, None);
    assert_eq!(root_info.existing_version, None);
    assert_eq!(root_info.existing_path, None);
    assert_eq!(root_info.diff_summary, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_reports_fresh_install_without_upgrade_fields() {
    let root = create_temp_dir("launcher-install-fresh-flag");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest_with_version("ModForge.FreshPack", "1.0.0"),
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

    assert!(!result.upgraded);
    assert_eq!(result.previous_version, None);
    assert_eq!(result.version.as_deref(), Some("1.0.0"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_reports_file_level_diff_details_for_text_binary_added_removed() {
    let root = create_temp_dir("launcher-inspect-file-details");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let existing_root = mods_root.join("[CP] Example Pack");
    let png_old = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01];
    let png_new = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x02];

    // Installed side: v1.0.0 manifest, old config, old binary sprite, stale file.
    write_file(
        &existing_root.join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "1.0.0"),
    );
    write_file(&existing_root.join("config.json"), r#"{"tone":"old"}"#);
    write_bytes_file(&existing_root.join("sprite.png"), &png_old);
    write_file(&existing_root.join("stale.txt"), "remove-me");

    // Incoming side: v2.0.0 manifest, new config, new binary sprite, new file.
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "2.0.0"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("config.json"),
        r#"{"tone":"new"}"#,
    );
    write_bytes_file(
        &source.join("[CP] Example Pack").join("sprite.png"),
        &png_new,
    );
    write_file(
        &source.join("[CP] Example Pack").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, Some(&mods_root)).expect("inspect archive");
    let diff = result.mod_roots[0]
        .diff_summary
        .as_ref()
        .expect("diff summary");
    assert_eq!((diff.added, diff.changed, diff.removed), (1, 3, 1));
    assert_eq!(diff.files.len(), 5);

    // Changed text file: unified diff with +/- lines and entry mtime (zip
    // default DOS mtime 1980-01-01 -> 315532800000 ms).
    let config = diff
        .files
        .iter()
        .find(|file| file.path == "config.json")
        .expect("config diff");
    assert_eq!(config.change_kind, LauncherArchiveFileChangeKind::Changed);
    assert_eq!(config.old_size, Some(14));
    assert_eq!(config.new_size, Some(14));
    assert!(config.old_modified_ms.is_some());
    eprintln!(
        "DEBUG new_modified_ms values: {:?}",
        diff.files
            .iter()
            .map(|file| (file.path.as_str(), file.new_modified_ms))
            .collect::<Vec<_>>()
    );
    assert_eq!(config.new_modified_ms, Some(315_532_800_000));
    let text_diff = config.text_diff.as_deref().expect("config text diff");
    assert!(text_diff.contains("-{\"tone\":\"old\"}"));
    assert!(text_diff.contains("+{\"tone\":\"new\"}"));
    assert!(text_diff.contains("@@"));
    assert!(!config.text_diff_truncated);

    // Changed binary file: no text diff, sizes and mtimes only.
    let sprite = diff
        .files
        .iter()
        .find(|file| file.path == "sprite.png")
        .expect("sprite diff");
    assert_eq!(sprite.change_kind, LauncherArchiveFileChangeKind::Changed);
    assert_eq!(sprite.old_size, Some(10));
    assert_eq!(sprite.new_size, Some(10));
    assert!(sprite.old_modified_ms.is_some());
    assert_eq!(sprite.new_modified_ms, Some(315_532_800_000));
    assert_eq!(sprite.text_diff, None);
    assert!(!sprite.text_diff_truncated);

    // Added file: no old side, new size + entry mtime.
    let added = diff
        .files
        .iter()
        .find(|file| file.path == "content.json")
        .expect("added diff");
    assert_eq!(added.change_kind, LauncherArchiveFileChangeKind::Added);
    assert_eq!(added.old_size, None);
    assert_eq!(
        added.new_size,
        Some(r#"{"Format":"2.0.0","Changes":[]}"#.len() as u64)
    );
    assert_eq!(added.old_modified_ms, None);
    assert_eq!(added.new_modified_ms, Some(315_532_800_000));
    assert_eq!(added.text_diff, None);

    // Removed file: new side absent, old size + installed mtime.
    let removed = diff
        .files
        .iter()
        .find(|file| file.path == "stale.txt")
        .expect("removed diff");
    assert_eq!(removed.change_kind, LauncherArchiveFileChangeKind::Removed);
    assert_eq!(removed.old_size, Some("remove-me".len() as u64));
    assert_eq!(removed.new_size, None);
    assert!(removed.old_modified_ms.is_some());
    assert_eq!(removed.new_modified_ms, None);
    assert_eq!(removed.text_diff, None);

    // Changed manifest also carries a text diff.
    let manifest = diff
        .files
        .iter()
        .find(|file| file.path == "manifest.json")
        .expect("manifest diff");
    assert!(manifest.text_diff.as_deref().is_some());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_truncates_text_diff_past_line_budget() {
    let root = create_temp_dir("launcher-inspect-text-diff-truncate");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let existing_root = mods_root.join("[CP] Example Pack");
    let old_lines = (0..20)
        .map(|index| format!("old line {index}"))
        .collect::<Vec<_>>()
        .join("\n");
    let new_lines = (0..600)
        .map(|index| format!("new line {index}"))
        .collect::<Vec<_>>()
        .join("\n");

    write_file(
        &existing_root.join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "1.0.0"),
    );
    write_file(&existing_root.join("content.json"), &old_lines);
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "2.0.0"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("content.json"),
        &new_lines,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, Some(&mods_root)).expect("inspect archive");
    let diff = result.mod_roots[0]
        .diff_summary
        .as_ref()
        .expect("diff summary");
    let content = diff
        .files
        .iter()
        .find(|file| file.path == "content.json")
        .expect("content diff");
    let text_diff = content.text_diff.as_deref().expect("text diff");
    assert!(content.text_diff_truncated);
    assert_eq!(text_diff.lines().count(), 500);
    assert!(text_diff.contains("-old line 0"));
    assert!(text_diff.contains("+new line 0"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_caps_file_detail_list_per_root() {
    let root = create_temp_dir("launcher-inspect-file-cap");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let existing_root = mods_root.join("[CP] Example Pack");
    let extra_count = 305;

    write_file(
        &existing_root.join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "1.0.0"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest_with_version("ModForge.ExamplePack", "2.0.0"),
    );
    for index in 0..extra_count {
        let name = format!("data/{index:03}.txt");
        write_file(&existing_root.join(&name), "old");
        write_file(&source.join("[CP] Example Pack").join(&name), "new");
    }

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, Some(&mods_root)).expect("inspect archive");
    let diff = result.mod_roots[0]
        .diff_summary
        .as_ref()
        .expect("diff summary");
    assert_eq!(diff.changed, extra_count + 1);
    assert_eq!(diff.files.len(), 300);
    assert_eq!(diff.truncated_file_count, Some(extra_count + 1 - 300));

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
