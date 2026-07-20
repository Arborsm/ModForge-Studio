pub(super) mod commands;
mod extract;
mod types;

/// Windows main binary file name — must match `apps/desktop/src-tauri` package name output.
const MAIN_APP_EXE: &str = "modforge_studio_desktop.exe";

#[cfg(target_os = "windows")]
mod registry;
#[cfg(target_os = "windows")]
mod shortcut;
