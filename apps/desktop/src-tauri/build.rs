use std::path::PathBuf;
use std::process::Command;

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
