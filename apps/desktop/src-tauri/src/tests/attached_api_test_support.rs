use super::{library_extension, ATTACHED_API_PLUGIN_STEM_MARKER};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

static SCALEUP_PLUGIN_PATH: OnceLock<PathBuf> = OnceLock::new();
static ATTACHED_API_ENV_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

struct AttachedApiEnvGuard {
    previous: Option<String>,
}

impl AttachedApiEnvGuard {
    fn set(attached_api_root: &Path) -> Self {
        let previous = std::env::var("MODFORGE_ATTACHED_API_DIR").ok();
        std::env::set_var("MODFORGE_ATTACHED_API_DIR", attached_api_root);
        Self { previous }
    }
}

impl Drop for AttachedApiEnvGuard {
    fn drop(&mut self) {
        if let Some(previous) = self.previous.take() {
            std::env::set_var("MODFORGE_ATTACHED_API_DIR", previous);
        } else {
            std::env::remove_var("MODFORGE_ATTACHED_API_DIR");
        }
    }
}

fn compiled_scaleup_plugin_path() -> PathBuf {
    SCALEUP_PLUGIN_PATH
        .get_or_init(|| {
            let manifest_path = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests")
                .join("fixtures")
                .join("scaleup_attached_api_plugin")
                .join("Cargo.toml");
            let target_dir = std::env::temp_dir().join("modforge-scaleup-attached-api-plugin-target");
            fs::create_dir_all(&target_dir).expect("create scaleup plugin target dir");

            let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".to_string());
            let output = Command::new(cargo)
                .arg("build")
                .arg("--manifest-path")
                .arg(&manifest_path)
                .arg("--target-dir")
                .arg(&target_dir)
                .output()
                .expect("build scaleup attached api plugin");
            if !output.status.success() {
                panic!(
                    "failed to build scaleup attached api plugin:\nstdout:\n{}\nstderr:\n{}",
                    String::from_utf8_lossy(&output.stdout),
                    String::from_utf8_lossy(&output.stderr)
                );
            }

            target_dir.join("debug").join(if cfg!(target_os = "windows") {
                "scaleup_attached_api_plugin.dll"
            } else if cfg!(target_os = "macos") {
                "libscaleup_attached_api_plugin.dylib"
            } else {
                "libscaleup_attached_api_plugin.so"
            })
        })
        .clone()
}

pub(crate) fn install_scaleup_attached_api_plugin(project_root: &Path) {
    let source = compiled_scaleup_plugin_path();
    let destination = project_root.join(format!("scaleup.{ATTACHED_API_PLUGIN_STEM_MARKER}.{}", library_extension()));
    fs::create_dir_all(project_root).expect("create attached api root");
    fs::copy(&source, &destination).expect("copy scaleup attached api plugin");
}

pub(crate) fn with_attached_api_root<T>(attached_api_root: &Path, action: impl FnOnce() -> T) -> T {
    let _guard = ATTACHED_API_ENV_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let _env_guard = AttachedApiEnvGuard::set(attached_api_root);
    action()
}
