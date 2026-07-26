use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[allow(dead_code)]
pub(crate) fn process_environment_lock() -> MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[allow(dead_code)]
pub(crate) fn create_temp_dir(name: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("modforge-{name}-{unique}"));
    fs::create_dir_all(&path).expect("create temp dir");
    path
}

#[allow(dead_code)]
pub(crate) fn write_file(path: &Path, content: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, content).expect("write file");
}

#[allow(dead_code)]
pub(crate) fn write_bytes_file(path: &Path, content: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create parent");
    }
    fs::write(path, content).expect("write bytes file");
}

#[allow(dead_code)]
pub(crate) fn installed_game_root() -> PathBuf {
    crate::infrastructure::fs::pathing::clean_input_path(
        r"E:\SteamLibrary\steamapps\common\Stardew Valley",
    )
}

#[allow(dead_code)]
pub(crate) fn resolve_game_root() -> PathBuf {
    std::env::var_os("SDV_GAME_PATH")
        .map(PathBuf::from)
        .map(|path| crate::infrastructure::fs::pathing::clean_input_path(&path.to_string_lossy()))
        .unwrap_or_else(installed_game_root)
}
