use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Packages the built-in compat plugins (apps/desktop/compat-plugins/) into a
/// single zip archive under OUT_DIR. The archive is embedded into the binary
/// via `include_bytes!` in `domain::modding::compat_plugin` and extracted into
/// the app data directory on first launch (and whenever the archive changes).
fn package_builtin_compat_plugins(desktop_root: &Path) {
    let source_dir = desktop_root.join("compat-plugins");
    // Track the whole tree so edits to any built-in plugin rebuild the archive.
    println!("cargo:rerun-if-changed={}", source_dir.display());

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let archive_path = out_dir.join("builtin_compat_plugins.zip");

    let file = std::fs::File::create(&archive_path).expect("create builtin plugin archive");
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    if source_dir.is_dir() {
        // Deterministic ordering keeps the archive (and its sha256 marker)
        // stable across machines for identical content.
        let mut files: Vec<PathBuf> = walkdir::WalkDir::new(&source_dir)
            .into_iter()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().is_file())
            .map(|entry| entry.into_path())
            .collect();
        files.sort();
        for path in files {
            let relative = path
                .strip_prefix(&source_dir)
                .expect("walkdir entry under source dir");
            let name = relative.to_string_lossy().replace('\\', "/");
            zip.start_file(name, options).expect("start zip entry");
            let bytes = std::fs::read(&path).expect("read builtin plugin file");
            zip.write_all(&bytes).expect("write zip entry");
        }
    }
    zip.finish().expect("finish builtin plugin archive");
}

fn main() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));

    // Host command drift gate: every build verifies that the sidecar routing
    // block, the lib.rs generate_handler! list and the frontend HOST_COMMANDS
    // table match the scanned `commands.rs` bindings. Drift fails the build;
    // regenerate with `vp run --filter @modforge/desktop gen:host-commands`.
    let desktop_root = manifest_dir.join("..");
    let generator = desktop_root.join("scripts/generate-host-commands.mjs");
    println!("cargo:rerun-if-changed={}", generator.display());
    println!(
        "cargo:rerun-if-changed={}",
        manifest_dir.join("src").display()
    );
    println!(
        "cargo:rerun-if-changed={}",
        desktop_root
            .join("src/platform/host-commands/index.ts")
            .display()
    );

    let status = Command::new("node")
        .arg(&generator)
        .arg("--check")
        .status()
        .expect("failed to spawn node for the host command drift check; node is required to build the desktop host");
    if !status.success() {
        panic!(
            "host command outputs are out of sync; run `vp run --filter @modforge/desktop gen:host-commands` to regenerate"
        );
    }

    package_builtin_compat_plugins(&desktop_root);

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest()),
    )
    .expect("failed to run tauri build script");

    #[cfg(target_os = "windows")]
    {
        let manifest = manifest_dir.join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
        println!("cargo:rustc-link-arg=/WX");
    }
}
