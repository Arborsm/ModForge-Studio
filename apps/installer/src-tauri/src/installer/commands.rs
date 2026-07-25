//! Tauri commands exposed to the frontend installer UI.

use super::extract;
use super::types::{DiskSpaceInfo, InstallOptions, InstallProgress};
use super::MAIN_APP_EXE;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::File;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager, Window};

#[cfg(target_os = "windows")]
#[derive(Default)]
struct WindowsInstallState {
    manufacturer_registered: bool,
    uninstall_registered: bool,
    desktop_shortcut_created: bool,
    start_menu_shortcut_created: bool,
    autostart_registered: bool,
}

const MIN_WINDOWS_APP_EXE_BYTES: u64 = 5 * 1024 * 1024;
const PAYLOAD_MANIFEST_FILE: &str = "payload-manifest.json";
const INSTALLER_STATE_FILE: &str = "installer-state.json";
/// Used when no embedded payload is available to measure (dev builds).
const FALLBACK_ESTIMATED_INSTALL_SIZE: u64 = 300 * 1024 * 1024;
const EMBEDDED_PAYLOAD_ZIP: &[u8] =
    include_bytes!(concat!(env!("OUT_DIR"), "/embedded_payload.zip"));

#[cfg(target_os = "windows")]
fn create_windows_silent_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

/// Supported app locales, longest aliases first so `zh-hans` beats the broad `zh` prefix.
const APP_LANGUAGE_ALIASES: &[(&str, &str)] = &[
    ("zh-CN", "zh-hans"),
    ("zh-CN", "zh-cn"),
    ("zh-CN", "zh"),
    ("en-US", "en-us"),
    ("en-US", "en"),
];

#[derive(Debug, Clone, Deserialize)]
struct PayloadManifest {
    files: Vec<PayloadManifestFile>,
}

#[derive(Debug, Clone, Deserialize)]
struct PayloadManifestFile {
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchContext {
    pub mode: String,
    pub uninstall_path: Option<String>,
    pub app_language: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstallPathValidation {
    pub install_path: String,
}

/// Matches Tauri NSIS detection via `UNINSTKEY` / `MANUPRODUCTKEY`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExistingInstallationResponse {
    pub detected: bool,
    pub install_location: Option<String>,
    pub display_version: Option<String>,
    pub uninstall_string: Option<String>,
    pub main_binary_present: bool,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallerState {
    last_install_path: String,
}

/// Get the default installation path.
#[tauri::command]
pub(crate) fn get_default_install_path() -> String {
    let base = if cfg!(target_os = "windows") {
        std::env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                dirs::data_local_dir()
                    .unwrap_or_else(|| PathBuf::from(["C:", "Program Files"].join("\\")))
            })
    } else if cfg!(target_os = "macos") {
        dirs::home_dir()
            .map(|h| h.join("Applications"))
            .unwrap_or_else(|| PathBuf::from("/Applications"))
    } else {
        dirs::home_dir()
            .map(|h| h.join(".local/share"))
            .unwrap_or_else(|| PathBuf::from("/opt"))
    };

    if cfg!(target_os = "windows") {
        base.join("Programs")
            .join("ModForge Studio")
            .to_string_lossy()
            .to_string()
    } else {
        base.join("ModForge Studio").to_string_lossy().to_string()
    }
}

/// Last successful install path if still valid, otherwise platform default.
#[tauri::command]
pub(crate) fn get_initial_install_path() -> String {
    #[cfg(target_os = "windows")]
    {
        use super::registry;
        if let Some(data) = registry::read_existing_install_from_uninstall_registry() {
            if let Ok(resolved) = prepare_install_target(Path::new(&data.install_location)) {
                return resolved.to_string_lossy().to_string();
            }
        }
        if let Some(from_reg) = registry::read_tauri_install_location() {
            if let Ok(resolved) = prepare_install_target(Path::new(&from_reg)) {
                return resolved.to_string_lossy().to_string();
            }
        }
    }
    if let Some(saved) = read_last_install_path() {
        if let Ok(resolved) = prepare_install_target(Path::new(&saved)) {
            return resolved.to_string_lossy().to_string();
        }
    }
    get_default_install_path()
}

/// Detect existing ModForge Studio install via Add/Remove Programs registry.
#[tauri::command]
pub(crate) fn get_existing_installation() -> ExistingInstallationResponse {
    #[cfg(not(target_os = "windows"))]
    {
        return ExistingInstallationResponse {
            detected: false,
            install_location: None,
            display_version: None,
            uninstall_string: None,
            main_binary_present: false,
            source: None,
        };
    }
    #[cfg(target_os = "windows")]
    {
        use super::registry;
        if let Some(data) = registry::read_existing_install_from_uninstall_registry() {
            let loc = PathBuf::from(&data.install_location);
            let main_present = loc.join(MAIN_APP_EXE).is_file();
            return ExistingInstallationResponse {
                detected: true,
                install_location: Some(data.install_location),
                display_version: data.display_version,
                uninstall_string: data.uninstall_string,
                main_binary_present: main_present,
                source: Some(format!("uninstall_{}", data.hive)),
            };
        }
        if let Some(loc) = registry::read_tauri_install_location() {
            let pb = PathBuf::from(&loc);
            let main_present = pb.join(MAIN_APP_EXE).is_file();
            return ExistingInstallationResponse {
                detected: true,
                install_location: Some(loc),
                display_version: None,
                uninstall_string: None,
                main_binary_present: main_present,
                source: Some("manufacturer_key".to_string()),
            };
        }
        ExistingInstallationResponse {
            detected: false,
            install_location: None,
            display_version: None,
            uninstall_string: None,
            main_binary_present: false,
            source: None,
        }
    }
}

/// Run the uninstall command stored in Add/Remove Programs, like NSIS maintenance.
#[tauri::command]
pub(crate) async fn launch_registered_uninstaller(
    uninstall_command: String,
    install_path: Option<String>,
) -> Result<(), String> {
    let s = uninstall_command.trim();
    if s.is_empty() {
        return Err("Empty uninstall command".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        let install_path = install_path
            .as_deref()
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from);
        launch_windows_registered_uninstaller(s, install_path.as_deref())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = install_path;
        let _ = s;
        Err("Uninstaller launch is only supported on Windows".to_string())
    }
}

#[cfg(target_os = "windows")]
fn launch_windows_registered_uninstaller(
    uninstall_command: &str,
    install_path: Option<&Path>,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    if let Some(install_path) = install_path {
        let uninstaller_path = install_path.join("uninstall.exe");
        if uninstaller_path.is_file() {
            std::process::Command::new(&uninstaller_path)
                .arg("--uninstall")
                .arg(install_path)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| {
                    format!(
                        "Failed to start uninstaller '{}': {}",
                        uninstaller_path.display(),
                        e
                    )
                })?;
            return Ok(());
        }
    }

    let argv = parse_windows_command_line(uninstall_command)?;
    let (program, args) = argv
        .split_first()
        .ok_or_else(|| "Registered uninstall command is empty".to_string())?;
    let program_path = PathBuf::from(program);
    if !program_path.is_file() {
        return Err(format!(
            "Registered uninstaller not found: {}",
            program_path.display()
        ));
    }

    std::process::Command::new(&program_path)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to start registered uninstaller '{}': {}",
                program_path.display(),
                e
            )
        })?;

    Ok(())
}

#[cfg(target_os = "windows")]
fn parse_windows_command_line(command_line: &str) -> Result<Vec<String>, String> {
    use std::ffi::{c_void, OsStr, OsString};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};

    #[link(name = "shell32")]
    extern "system" {
        fn CommandLineToArgvW(lp_cmd_line: *const u16, p_num_args: *mut i32) -> *mut *mut u16;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(h_mem: *mut c_void) -> *mut c_void;
    }

    let wide: Vec<u16> = OsStr::new(command_line)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut argc = 0i32;
    // SAFETY: `wide` is a valid null-terminated UTF-16 buffer that outlives the call.
    let argv_ptr = unsafe { CommandLineToArgvW(wide.as_ptr(), &mut argc) };
    if argv_ptr.is_null() || argc <= 0 {
        return Err("Failed to parse uninstall command line".to_string());
    }

    // SAFETY: `argv_ptr` is a valid CommandLineToArgvW result with `argc` entries,
    // each a null-terminated UTF-16 string; it is released with LocalFree before return.
    let args = unsafe {
        let argv = std::slice::from_raw_parts(argv_ptr, argc as usize);
        let parsed = argv
            .iter()
            .map(|arg_ptr| {
                let mut len = 0usize;
                while *arg_ptr.add(len) != 0 {
                    len += 1;
                }
                OsString::from_wide(std::slice::from_raw_parts(*arg_ptr, len))
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        LocalFree(argv_ptr.cast::<c_void>());
        parsed
    };

    Ok(args)
}

/// Get available disk space for the given path.
#[tauri::command]
pub(crate) fn get_disk_space(path: String) -> Result<DiskSpaceInfo, String> {
    let path = PathBuf::from(&path);
    let required = estimated_install_size();

    // Walk up to find an existing ancestor directory
    let check_path = find_existing_ancestor(&path);

    // Use std::fs metadata as a basic check. For actual disk space,
    // platform-specific APIs are needed.
    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let fallback_windows_root = format!("{}{}", "C:", std::path::MAIN_SEPARATOR);
        let wide_path: Vec<u16> = OsStr::new(
            check_path
                .to_str()
                .unwrap_or(fallback_windows_root.as_str()),
        )
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

        let mut free_bytes_available: u64 = 0;
        let mut total_bytes: u64 = 0;
        let mut total_free_bytes: u64 = 0;

        // SAFETY: `wide_path` is a valid null-terminated UTF-16 buffer and the
        // out-pointers point to live locals, all valid for the call duration.
        unsafe {
            let result = windows_sys_get_disk_free_space(
                wide_path.as_ptr(),
                &mut free_bytes_available,
                &mut total_bytes,
                &mut total_free_bytes,
            );
            if result != 0 {
                return Ok(DiskSpaceInfo {
                    total: total_bytes,
                    available: free_bytes_available,
                    required,
                    sufficient: free_bytes_available >= required,
                });
            }
        }
    }

    // Fallback: assume sufficient space
    Ok(DiskSpaceInfo {
        total: 0,
        available: u64::MAX,
        required,
        sufficient: true,
    })
}

/// Required free space: actual embedded payload size (compressed ~2x on disk) plus
/// margin, or a fixed estimate when no payload was embedded (dev builds).
fn estimated_install_size() -> u64 {
    if embedded_payload_available() {
        EMBEDDED_PAYLOAD_ZIP.len() as u64 * 2 + 64 * 1024 * 1024
    } else {
        FALLBACK_ESTIMATED_INSTALL_SIZE
    }
}

#[cfg(target_os = "windows")]
unsafe fn windows_sys_get_disk_free_space(
    path: *const u16,
    free_bytes_available: *mut u64,
    total_bytes: *mut u64,
    total_free_bytes: *mut u64,
) -> i32 {
    // Link to kernel32.dll GetDiskFreeSpaceExW
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }
    // SAFETY: all pointers originate from live locals at the call site and stay
    // valid for the duration of the call; GetDiskFreeSpaceExW only writes
    // through the out-pointers.
    unsafe { GetDiskFreeSpaceExW(path, free_bytes_available, total_bytes, total_free_bytes) }
}

#[tauri::command]
pub(crate) fn get_launch_context() -> LaunchContext {
    let args: Vec<String> = std::env::args().collect();
    let app_language = read_saved_app_language();
    if let Some(idx) = args.iter().position(|arg| arg == "--uninstall") {
        let uninstall_path = args
            .get(idx + 1)
            .map(|p| p.to_string())
            .or_else(guess_uninstall_path_from_exe);
        return LaunchContext {
            mode: "uninstall".to_string(),
            uninstall_path,
            app_language,
        };
    }

    if is_running_as_uninstall_binary() {
        return LaunchContext {
            mode: "uninstall".to_string(),
            uninstall_path: guess_uninstall_path_from_exe(),
            app_language,
        };
    }

    LaunchContext {
        mode: "install".to_string(),
        uninstall_path: None,
        app_language,
    }
}

/// Validate the installation path.
#[tauri::command]
pub(crate) fn validate_install_path(path: String) -> Result<InstallPathValidation, String> {
    let requested_path = PathBuf::from(&path);
    let install_path = prepare_install_target(&requested_path)?;
    Ok(InstallPathValidation {
        install_path: install_path.to_string_lossy().to_string(),
    })
}

/// Main installation command. Emits progress events to the frontend.
#[tauri::command]
pub(crate) async fn start_installation(
    window: Window,
    options: InstallOptions,
) -> Result<(), String> {
    let install_path = prepare_install_target(Path::new(&options.install_path))?;
    let install_dir_was_absent = !install_path.exists();
    #[cfg(target_os = "windows")]
    let mut windows_state = WindowsInstallState::default();

    let result: Result<(), String> = (|| {
        // Step 1: Create target directory
        emit_progress(&window, "prepare", 5, "Creating installation directory...");
        std::fs::create_dir_all(&install_path)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        // Step 2: Extract / copy application files
        emit_progress(&window, "extract", 15, "Extracting application files...");

        let mut extracted = false;
        let mut used_debug_placeholder = false;
        let mut checked_locations: Vec<String> = Vec::new();

        if embedded_payload_available() {
            checked_locations.push("embedded payload zip".to_string());
            preflight_validate_payload_zip_bytes(EMBEDDED_PAYLOAD_ZIP, "embedded payload zip")?;
            let _ =
                read_payload_manifest_from_zip_bytes(EMBEDDED_PAYLOAD_ZIP, "embedded payload zip")?;
            extract::extract_zip_bytes_with_filter(
                EMBEDDED_PAYLOAD_ZIP,
                &install_path,
                should_install_payload_path,
            )
            .map_err(|e| format!("Embedded payload extraction failed: {}", e))?;
            extracted = true;
            log::info!("Extracted payload from embedded installer archive");
        }

        // Fallback to external payload locations for compatibility and local debug.
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();

        if !extracted {
            for candidate in build_payload_candidates(&window, &exe_dir) {
                if candidate.is_zip {
                    checked_locations.push(format!("zip: {}", candidate.path.display()));
                    if !candidate.path.exists() {
                        continue;
                    }
                    preflight_validate_payload_zip_file(&candidate.path, &candidate.label)?;
                    let _ = read_payload_manifest_from_zip_file(&candidate.path, &candidate.label)?;
                    extract::extract_zip_with_filter(
                        &candidate.path,
                        &install_path,
                        should_install_payload_path,
                    )
                    .map_err(|e| format!("Extraction failed from {}: {}", candidate.label, e))?;
                    extracted = true;
                    log::info!("Extracted payload from {}", candidate.label);
                    break;
                }

                checked_locations.push(format!("dir: {}", candidate.path.display()));
                if !candidate.path.exists() {
                    continue;
                }
                preflight_validate_payload_dir(&candidate.path, &candidate.label)?;
                let _ = read_payload_manifest_from_dir(&candidate.path, &candidate.label)?;
                extract::copy_directory_with_filter(
                    &candidate.path,
                    &install_path,
                    should_install_payload_path,
                )
                .map_err(|e| format!("File copy failed from {}: {}", candidate.label, e))?;
                extracted = true;
                log::info!("Copied payload from {}", candidate.label);
                break;
            }
        }

        if !extracted {
            if cfg!(debug_assertions) {
                // Development mode: create a placeholder to simplify local UI iteration.
                log::warn!("No payload found - running in development mode");
                let placeholder = install_path.join(MAIN_APP_EXE);
                if !placeholder.exists() {
                    std::fs::write(&placeholder, "placeholder")
                        .map_err(|e| format!("Failed to write placeholder: {}", e))?;
                }
                used_debug_placeholder = true;
            } else {
                return Err(format!(
                    "Installer payload is missing. Checked: {}",
                    checked_locations.join(" | ")
                ));
            }
        }

        if !used_debug_placeholder {
            verify_installed_payload(&install_path)?;
        }

        emit_progress(&window, "extract", 50, "Files extracted successfully");

        // Step 3: Windows-specific operations
        #[cfg(target_os = "windows")]
        {
            use super::registry;
            use super::shortcut;

            let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let uninstaller_path = install_path.join("uninstall.exe");
            std::fs::copy(&current_exe, &uninstaller_path)
                .map_err(|e| format!("Failed to create uninstaller executable: {}", e))?;
            let uninstall_command = format!(
                "\"{}\" --uninstall \"{}\"",
                uninstaller_path.display(),
                install_path.display()
            );

            emit_progress(&window, "registry", 60, "Registering application...");
            registry::register_tauri_install_location(&install_path)
                .map_err(|e| format!("Registry error: {}", e))?;
            windows_state.manufacturer_registered = true;
            registry::register_uninstall_entry(
                &install_path,
                env!("CARGO_PKG_VERSION"),
                &uninstall_command,
            )
            .map_err(|e| format!("Registry error: {}", e))?;
            windows_state.uninstall_registered = true;

            // Desktop shortcut
            if options.desktop_shortcut {
                emit_progress(&window, "shortcuts", 70, "Creating desktop shortcut...");
                shortcut::create_desktop_shortcut(&install_path)
                    .map_err(|e| format!("Shortcut error: {}", e))?;
                windows_state.desktop_shortcut_created = true;
            }

            // Start Menu
            if options.start_menu {
                emit_progress(&window, "shortcuts", 75, "Creating Start Menu entry...");
                shortcut::create_start_menu_shortcut(&install_path)
                    .map_err(|e| format!("Start Menu error: {}", e))?;
                windows_state.start_menu_shortcut_created = true;
            }

            // Autostart on login (per-user Run key)
            if options.auto_start {
                emit_progress(&window, "registry", 78, "Registering startup entry...");
                registry::register_autostart_run_entry(&install_path)
                    .map_err(|e| format!("Autostart registry error: {}", e))?;
                windows_state.autostart_registered = true;
            }
        }

        // Step 4: Save first-launch language preference for the ModForge Studio app.
        emit_progress(&window, "config", 92, "Applying startup preferences...");
        apply_first_launch_language(&options.app_language)
            .map_err(|e| format!("Failed to apply startup preferences: {}", e))?;
        // Step 5: Done
        emit_progress(&window, "complete", 100, "Installation complete!");
        Ok(())
    })();

    if let Err(err) = result {
        #[cfg(target_os = "windows")]
        rollback_installation(&install_path, install_dir_was_absent, &windows_state);
        #[cfg(not(target_os = "windows"))]
        rollback_installation(&install_path, install_dir_was_absent);
        return Err(err);
    }

    persist_last_install_path(&install_path);

    Ok(())
}

/// Uninstall ModForge Studio (for the uninstaller companion).
///
/// When `delete_user_data` is true, the application data root
/// (`%APPDATA%\ModForge Studio` — settings, workspace state, caches, logs) is
/// removed after the installed files. Mods, game directories and user documents
/// are never touched.
#[tauri::command]
pub(crate) async fn uninstall(
    install_path: String,
    delete_user_data: Option<bool>,
) -> Result<(), String> {
    let install_path = PathBuf::from(&install_path);
    let uninstall_targets = collect_uninstall_targets(&install_path)?;

    #[cfg(target_os = "windows")]
    {
        use super::registry;
        use super::shortcut;

        let _ = shortcut::remove_desktop_shortcut();
        let _ = shortcut::remove_start_menu_shortcut();
        let _ = registry::remove_autostart_run_entry();
        let _ = registry::remove_tauri_install_location();
        let _ = registry::remove_uninstall_entry();
    }

    #[cfg(target_os = "windows")]
    {
        let current_exe = std::env::current_exe().ok();
        let running_uninstall_binary = current_exe
            .as_ref()
            .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().to_string()))
            .map(|stem| stem.eq_ignore_ascii_case("uninstall"))
            .unwrap_or(false);

        let current_exe_parent = current_exe
            .as_ref()
            .and_then(|exe| exe.parent().map(|p| p.to_path_buf()));
        let running_from_install_dir = current_exe_parent
            .as_ref()
            .map(|parent| windows_path_eq_case_insensitive(parent, &install_path))
            .unwrap_or(false);

        append_uninstall_runtime_log(&format!(
            "uninstall called: install_path='{}', current_exe='{}', running_uninstall_binary={}, running_from_install_dir={}, delete_user_data={}",
            install_path.display(),
            current_exe
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "<unknown>".to_string()),
            running_uninstall_binary,
            running_from_install_dir,
            delete_user_data.unwrap_or(false)
        ));

        let current_exe_path = current_exe.as_deref();
        remove_installed_targets(&install_path, &uninstall_targets, current_exe_path)?;

        if (running_uninstall_binary || running_from_install_dir)
            && current_exe_path
                .map(|exe| {
                    windows_path_eq_case_insensitive(exe, &install_path.join("uninstall.exe"))
                })
                .unwrap_or(false)
        {
            schedule_windows_self_uninstall_cleanup(current_exe_path.unwrap())?;
        }
    }

    #[cfg(not(target_os = "windows"))]
    remove_installed_targets(&install_path, &uninstall_targets, None)?;

    if delete_user_data.unwrap_or(false) {
        remove_app_user_data()?;
    }

    Ok(())
}

/// Delete the application data root (`<config dir>/ModForge Studio`, e.g.
/// `%APPDATA%\ModForge Studio` on Windows). Fail-soft: the install removal has
/// already succeeded at this point, so deletion problems are logged, not fatal.
fn remove_app_user_data() -> Result<(), String> {
    let data_root = dirs::config_dir()
        .ok_or_else(|| "Failed to resolve the user config directory".to_string())?
        .join("ModForge Studio");

    // Safety guard: only ever delete the exact "<config>/ModForge Studio" directory.
    let is_expected_root = data_root.is_absolute()
        && data_root
            .file_name()
            .map(|name| name == "ModForge Studio")
            .unwrap_or(false);
    if !is_expected_root {
        append_uninstall_runtime_log(&format!(
            "refusing to delete unexpected data root '{}'",
            data_root.display()
        ));
        return Err("Refusing to delete an unexpected user data path".to_string());
    }

    if !data_root.exists() {
        append_uninstall_runtime_log(&format!(
            "user data root '{}' does not exist, nothing to delete",
            data_root.display()
        ));
        return Ok(());
    }

    append_uninstall_runtime_log(&format!(
        "deleting user data root '{}'",
        data_root.display()
    ));
    match std::fs::remove_dir_all(&data_root) {
        Ok(()) => {
            log::info!("Deleted user data root {}", data_root.display());
            append_uninstall_runtime_log("user data root deleted");
            Ok(())
        }
        Err(e) => {
            // Files and registry entries are already gone; report but stay non-fatal
            // so the uninstall still completes and the window can close.
            log::warn!(
                "Failed to delete user data root {}: {}",
                data_root.display(),
                e
            );
            append_uninstall_runtime_log(&format!(
                "failed to delete user data root '{}': {}",
                data_root.display(),
                e
            ));
            Ok(())
        }
    }
}

#[cfg(target_os = "windows")]
fn schedule_windows_self_uninstall_cleanup(uninstall_exe_path: &Path) -> Result<(), String> {
    let temp_dir = std::env::temp_dir();
    let pid = std::process::id();
    let script_path = temp_dir.join(format!("modforge-uninstall-{}.cmd", pid));
    let log_path = temp_dir.join(format!("modforge-uninstall-cleanup-{}.log", pid));

    let script = r#"@echo off
setlocal enableextensions
set "TARGET=%~1"
set "LOG=%~2"
set "TARGET_DIR=%~dp1"
if "%TARGET%"=="" exit /b 2
if "%LOG%"=="" set "LOG=%TEMP%\modforge-uninstall-cleanup.log"
echo [%DATE% %TIME%] cleanup start > "%LOG%"
cd /d "%TEMP%"
for /L %%i in (1,1,30) do (
  if not exist "%TARGET%" (
    echo [%DATE% %TIME%] cleanup success on try %%i >> "%LOG%"
    exit /b 0
  )
  del /f /q "%TARGET%" >> "%LOG%" 2>&1
  if not exist "%TARGET%" (
    if not "%TARGET_DIR%"=="" rmdir "%TARGET_DIR%" >> "%LOG%" 2>&1
    echo [%DATE% %TIME%] cleanup success on try %%i >> "%LOG%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)
echo [%DATE% %TIME%] cleanup failed after retries >> "%LOG%"
exit /b 1
"#
    .to_string();

    std::fs::write(&script_path, script)
        .map_err(|e| format!("Failed to write cleanup script: {}", e))?;

    append_uninstall_runtime_log(&format!(
        "scheduled cleanup script='{}', target='{}', cleanup_log='{}'",
        script_path.display(),
        uninstall_exe_path.display(),
        log_path.display()
    ));

    let child = create_windows_silent_command("cmd")
        .arg("/C")
        .arg("call")
        .arg(&script_path)
        .arg(uninstall_exe_path)
        .arg(&log_path)
        .current_dir(&temp_dir)
        .spawn()
        .map_err(|e| format!("Failed to schedule uninstall cleanup: {}", e))?;

    append_uninstall_runtime_log(&format!("cleanup process spawned: pid={}", child.id()));

    Ok(())
}

#[cfg(target_os = "windows")]
fn windows_path_eq_case_insensitive(a: &Path, b: &Path) -> bool {
    fn normalize(path: &Path) -> String {
        let mut s = path.to_string_lossy().replace('/', "\\").to_lowercase();
        while s.ends_with('\\') {
            s.pop();
        }
        s
    }
    normalize(a) == normalize(b)
}

fn append_uninstall_runtime_log(message: &str) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let log_path = std::env::temp_dir().join("modforge-uninstall-runtime.log");
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        use std::io::Write;
        let _ = writeln!(file, "[{}] {}", ts, message);
    }
}

/// Launch the installed application.
#[tauri::command]
pub(crate) fn launch_application(install_path: String) -> Result<(), String> {
    let exe = if cfg!(target_os = "windows") {
        PathBuf::from(&install_path).join(MAIN_APP_EXE)
    } else if cfg!(target_os = "macos") {
        PathBuf::from(&install_path).join("ModForge Studio")
    } else {
        PathBuf::from(&install_path).join("modforge-studio")
    };

    #[cfg(target_os = "windows")]
    create_windows_silent_command(&exe)
        .current_dir(&install_path)
        .spawn()
        .map_err(|e| format!("Failed to launch ModForge Studio: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    std::process::Command::new(&exe)
        .current_dir(&install_path)
        .spawn()
        .map_err(|e| format!("Failed to launch ModForge Studio: {}", e))?;

    Ok(())
}

/// Close the installer window.
#[tauri::command]
pub(crate) fn close_installer(window: Window) {
    let _ = window.close();
}

// ── Helpers ────────────────────────────────────────────────────────────────

fn emit_progress(window: &Window, step: &str, percent: u32, message: &str) {
    let progress = InstallProgress {
        step: step.to_string(),
        percent,
        message: message.to_string(),
    };
    let _ = window.emit("install-progress", &progress);
    log::info!("[{}%] {}: {}", percent, step, message);
}

fn guess_uninstall_path_from_exe() -> Option<String> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .map(|p| p.to_string_lossy().to_string())
}

fn is_running_as_uninstall_binary() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.file_stem().map(|s| s.to_string_lossy().to_string()))
        .map(|stem| stem.eq_ignore_ascii_case("uninstall"))
        .unwrap_or(false)
}

fn embedded_payload_available() -> bool {
    option_env!("EMBEDDED_PAYLOAD_AVAILABLE")
        .map(|v| v == "1")
        .unwrap_or(false)
}

#[derive(Debug)]
struct PayloadCandidate {
    label: String,
    path: PathBuf,
    is_zip: bool,
}

fn build_payload_candidates(window: &Window, exe_dir: &Path) -> Vec<PayloadCandidate> {
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = window.app_handle().path().resource_dir() {
        candidates.push(PayloadCandidate {
            label: "resource_dir/payload.zip".to_string(),
            path: resource_dir.join("payload.zip"),
            is_zip: true,
        });
        candidates.push(PayloadCandidate {
            label: "resource_dir/payload".to_string(),
            path: resource_dir.join("payload"),
            is_zip: false,
        });
        // Some bundle layouts keep runtime resources under a nested resources directory.
        candidates.push(PayloadCandidate {
            label: "resource_dir/resources/payload.zip".to_string(),
            path: resource_dir.join("resources").join("payload.zip"),
            is_zip: true,
        });
        candidates.push(PayloadCandidate {
            label: "resource_dir/resources/payload".to_string(),
            path: resource_dir.join("resources").join("payload"),
            is_zip: false,
        });
    }

    candidates.push(PayloadCandidate {
        label: "exe_dir/payload.zip".to_string(),
        path: exe_dir.join("payload.zip"),
        is_zip: true,
    });
    candidates.push(PayloadCandidate {
        label: "exe_dir/payload".to_string(),
        path: exe_dir.join("payload"),
        is_zip: false,
    });
    candidates.push(PayloadCandidate {
        label: "exe_dir/resources/payload.zip".to_string(),
        path: exe_dir.join("resources").join("payload.zip"),
        is_zip: true,
    });
    candidates.push(PayloadCandidate {
        label: "exe_dir/resources/payload".to_string(),
        path: exe_dir.join("resources").join("payload"),
        is_zip: false,
    });

    candidates
}

fn find_existing_ancestor(path: &Path) -> PathBuf {
    let mut current = path.to_path_buf();
    while !current.exists() {
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }
    current
}

/// Actual install root is always under a `ModForge Studio` directory: `{user choice}/ModForge Studio`.
/// If the user already chose a path whose last segment is `ModForge Studio`, do not append again.
fn with_modforge_install_subdir(path: PathBuf) -> PathBuf {
    let already_modforge = path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.eq_ignore_ascii_case("ModForge Studio"))
        .unwrap_or(false);
    if already_modforge {
        path
    } else {
        path.join("ModForge Studio")
    }
}

/// Stable codes for `validate_install_path` / `prepare_install_target`; localized in the frontend.
const INSTALL_PATH_ERR_PREFIX: &str = "INSTALL_PATH::";

fn prepare_install_target(requested_path: &Path) -> Result<PathBuf, String> {
    if !requested_path.is_absolute() {
        return Err(format!("{}not_absolute", INSTALL_PATH_ERR_PREFIX));
    }

    if requested_path.parent().is_none() {
        return Err(format!("{}filesystem_root", INSTALL_PATH_ERR_PREFIX));
    }

    if requested_path.exists() && !requested_path.is_dir() {
        return Err(format!("{}path_not_directory", INSTALL_PATH_ERR_PREFIX));
    }

    let install_path = with_modforge_install_subdir(requested_path.to_path_buf());

    if install_path.exists() {
        if !install_path.is_dir() {
            return Err(format!("{}path_not_directory", INSTALL_PATH_ERR_PREFIX));
        }
        if directory_has_entries(&install_path)? && !install_path.join(MAIN_APP_EXE).exists() {
            return Err(format!(
                "{}directory_must_be_empty_or_modforge",
                INSTALL_PATH_ERR_PREFIX
            ));
        }
    }

    let writable_dir = if install_path.exists() {
        install_path.clone()
    } else {
        find_existing_ancestor(&install_path)
    };
    let test_file = writable_dir.join(".modforge_install_test");
    match std::fs::write(&test_file, "test") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            Ok(install_path)
        }
        Err(_) if install_path.exists() => {
            Err(format!("{}directory_not_writable", INSTALL_PATH_ERR_PREFIX))
        }
        Err(_) => Err(format!("{}parent_not_writable", INSTALL_PATH_ERR_PREFIX)),
    }
}

fn directory_has_entries(path: &Path) -> Result<bool, String> {
    let mut entries = std::fs::read_dir(path)
        .map_err(|_| format!("{}inspect_directory_failed", INSTALL_PATH_ERR_PREFIX))?;
    Ok(entries
        .next()
        .transpose()
        .map_err(|_| format!("{}inspect_directory_failed", INSTALL_PATH_ERR_PREFIX))?
        .is_some())
}

/// First-launch UI state shared with the desktop app:
/// `%APPDATA%\ModForge Studio\app\ui-state.json` (see `apps/desktop` `domain::app_paths`).
fn ensure_ui_state_path() -> Result<PathBuf, String> {
    let state_root = dirs::config_dir()
        .ok_or_else(|| "Failed to get user config directory".to_string())?
        .join("ModForge Studio")
        .join("app");
    std::fs::create_dir_all(&state_root)
        .map_err(|e| format!("Failed to create ModForge Studio config directory: {}", e))?;
    Ok(state_root.join("ui-state.json"))
}

fn installer_state_path() -> Result<PathBuf, String> {
    let ui_state_file = ensure_ui_state_path()?;
    let parent = ui_state_file
        .parent()
        .ok_or_else(|| "Invalid ui-state path".to_string())?;
    Ok(parent.join(INSTALLER_STATE_FILE))
}

fn read_last_install_path() -> Option<String> {
    let state_path = installer_state_path().ok()?;
    if !state_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&state_path).ok()?;
    let state: InstallerState = serde_json::from_str(&content).ok()?;
    let trimmed = state.last_install_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_string())
}

fn persist_last_install_path(install_path: &Path) {
    let Ok(state_path) = installer_state_path() else {
        log::warn!("Could not resolve installer state path");
        return;
    };
    let state = InstallerState {
        last_install_path: install_path.to_string_lossy().to_string(),
    };
    let body = match serde_json::to_string_pretty(&state) {
        Ok(b) => b,
        Err(e) => {
            log::warn!("Failed to serialize installer state: {}", e);
            return;
        }
    };
    if let Err(e) = std::fs::write(&state_path, body) {
        log::warn!("Failed to write installer state: {}", e);
    }
}

fn read_saved_app_language() -> Option<String> {
    let ui_state_file = ensure_ui_state_path().ok()?;
    if !ui_state_file.exists() {
        return None;
    }

    let content = std::fs::read_to_string(&ui_state_file).ok()?;
    let root: Value = serde_json::from_str(&content).ok()?;
    let lang = root.get("appearance")?.get("locale")?.as_str()?;

    normalize_app_language(lang).map(str::to_string)
}

fn normalize_app_language(lang: &str) -> Option<&'static str> {
    // Always persist the canonical app locale id so the desktop app
    // and installer do not have to handle mixed aliases from old configs.
    let normalized = lang.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return None;
    }

    APP_LANGUAGE_ALIASES.iter().find_map(|(code, alias)| {
        (normalized == *alias || normalized.starts_with(&format!("{alias}-"))).then_some(*code)
    })
}

fn read_or_create_ui_state(ui_state_file: &Path) -> Result<Value, String> {
    let mut root = if ui_state_file.exists() {
        let content = std::fs::read_to_string(ui_state_file)
            .map_err(|e| format!("Failed to read ui-state: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Value::Object(Map::new()))
    } else {
        Value::Object(Map::new())
    };

    if !root.is_object() {
        root = Value::Object(Map::new());
    }
    Ok(root)
}

fn write_ui_state(ui_state_file: &Path, root: &Value) -> Result<(), String> {
    let formatted = serde_json::to_string_pretty(root)
        .map_err(|e| format!("Failed to serialize ui-state: {}", e))?;
    std::fs::write(ui_state_file, formatted).map_err(|e| format!("Failed to write ui-state: {}", e))
}

/// Persist the selected language as `appearance.locale` in ui-state.json,
/// preserving every other field (the app uses serde defaults for missing keys).
fn apply_first_launch_language(app_language: &str) -> Result<(), String> {
    let Some(app_language) = normalize_app_language(app_language) else {
        return Err("Unsupported app language".to_string());
    };

    let ui_state_file = ensure_ui_state_path()?;
    let mut root = read_or_create_ui_state(&ui_state_file)?;

    let root_obj = root
        .as_object_mut()
        .ok_or_else(|| "Invalid root ui-state object".to_string())?;
    let appearance_obj = ensure_json_object_field(root_obj, "appearance")?;
    appearance_obj.insert(
        "locale".to_string(),
        Value::String(app_language.to_string()),
    );

    write_ui_state(&ui_state_file, &root)
}

/// Returns the mutable object at `key`, creating or replacing non-object values.
fn ensure_json_object_field<'a>(
    parent: &'a mut Map<String, Value>,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let entry = parent
        .entry(key.to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        *entry = Value::Object(Map::new());
    }
    entry
        .as_object_mut()
        .ok_or_else(|| format!("Invalid ui-state object at '{key}'"))
}

/// Main-app color themes (`appearance.themeId`); mirrors `ThemeId` in apps/desktop contracts.
const APP_THEME_IDS: &[&str] = &[
    "warm-paper",
    "neutral-tool",
    "slate-blue",
    "forest",
    "twilight",
    "stardew-wood",
    "crimson",
    "blossom",
];

/// Main-app loading motion styles (`appearance.loadingMotion.styleId`).
const APP_LOADING_MOTION_STYLE_IDS: &[&str] = &[
    "bounceIn",
    "layeredFadeIn",
    "slideInPush",
    "softFadeIn",
    "quietSimplify",
];

/// App preferences pre-selected on the installer's preferences page.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppPreferencesRequest {
    pub theme_id: String,
    pub loading_motion_style_id: String,
    pub window_close_behavior: String,
    pub remember_close_choice: bool,
    pub notification_sound_enabled: bool,
    pub app_mode: String,
}

/// Pre-seed the desktop app's ui-state.json with the preferences chosen in the
/// installer. Only overwrites the selected fields and preserves everything else;
/// the app fills still-missing keys with serde defaults on first launch.
#[tauri::command]
pub(crate) fn persist_app_preferences(preferences: AppPreferencesRequest) -> Result<(), String> {
    if !APP_THEME_IDS.contains(&preferences.theme_id.as_str()) {
        return Err(format!("Unsupported app theme: {}", preferences.theme_id));
    }
    if !APP_LOADING_MOTION_STYLE_IDS.contains(&preferences.loading_motion_style_id.as_str()) {
        return Err(format!(
            "Unsupported loading motion style: {}",
            preferences.loading_motion_style_id
        ));
    }
    match preferences.window_close_behavior.as_str() {
        "quit" | "minimizeToTray" => {}
        other => return Err(format!("Unsupported window close behavior: {other}")),
    }
    match preferences.app_mode.as_str() {
        "launcher" | "workbench" => {}
        other => return Err(format!("Unsupported app mode: {other}")),
    }

    let ui_state_file = ensure_ui_state_path()?;
    let mut root = read_or_create_ui_state(&ui_state_file)?;
    let root_obj = root
        .as_object_mut()
        .ok_or_else(|| "Invalid root ui-state object".to_string())?;

    let appearance_obj = ensure_json_object_field(root_obj, "appearance")?;
    appearance_obj.insert(
        "themeId".to_string(),
        Value::String(preferences.theme_id.clone()),
    );
    let motion_obj = ensure_json_object_field(appearance_obj, "loadingMotion")?;
    motion_obj.insert(
        "styleId".to_string(),
        Value::String(preferences.loading_motion_style_id.clone()),
    );

    let shell_obj = ensure_json_object_field(root_obj, "shell")?;
    shell_obj.insert(
        "windowCloseBehavior".to_string(),
        Value::String(preferences.window_close_behavior.clone()),
    );
    shell_obj.insert(
        "rememberCloseChoice".to_string(),
        Value::Bool(preferences.remember_close_choice),
    );
    shell_obj.insert(
        "notificationSoundEnabled".to_string(),
        Value::Bool(preferences.notification_sound_enabled),
    );
    shell_obj.insert(
        "appMode".to_string(),
        Value::String(preferences.app_mode.clone()),
    );

    write_ui_state(&ui_state_file, &root)?;
    log::info!(
        "Persisted app preferences to {}: theme={}, motion={}, closeBehavior={}, rememberCloseChoice={}, notificationSound={}, appMode={}",
        ui_state_file.display(),
        preferences.theme_id,
        preferences.loading_motion_style_id,
        preferences.window_close_behavior,
        preferences.remember_close_choice,
        preferences.notification_sound_enabled,
        preferences.app_mode
    );
    Ok(())
}

fn preflight_validate_payload_zip_bytes(
    zip_bytes: &[u8],
    source_label: &str,
) -> Result<(), String> {
    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Invalid zip from {source_label}: {e}"))?;
    preflight_validate_payload_zip_archive(&mut archive, source_label)
}

fn preflight_validate_payload_zip_file(path: &Path, source_label: &str) -> Result<(), String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open payload zip ({source_label}): {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid payload zip ({source_label}): {e}"))?;
    preflight_validate_payload_zip_archive(&mut archive, source_label)
}

fn preflight_validate_payload_zip_archive<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    source_label: &str,
) -> Result<(), String> {
    let mut exe_size: Option<u64> = None;
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read payload entry ({source_label}): {e}"))?;
        if file.name().ends_with('/') {
            continue;
        }
        let file_name = zip_entry_file_name(file.name());
        if file_name.eq_ignore_ascii_case(MAIN_APP_EXE) {
            exe_size = Some(file.size());
            break;
        }
    }

    let size = exe_size.ok_or_else(|| {
        format!(
            "Payload from {source_label} does not contain {}",
            MAIN_APP_EXE
        )
    })?;
    validate_payload_exe_size(size, source_label)
}

fn preflight_validate_payload_dir(path: &Path, source_label: &str) -> Result<(), String> {
    let app_exe = path.join(MAIN_APP_EXE);
    let meta = std::fs::metadata(&app_exe).map_err(|_| {
        format!(
            "Payload directory from {source_label} does not contain {}",
            app_exe.display()
        )
    })?;
    validate_payload_exe_size(meta.len(), source_label)
}

fn validate_payload_exe_size(size: u64, source_label: &str) -> Result<(), String> {
    if size < MIN_WINDOWS_APP_EXE_BYTES {
        return Err(format!(
            "Payload {} from {source_label} is too small ({size} bytes)",
            MAIN_APP_EXE
        ));
    }
    Ok(())
}

fn read_payload_manifest_from_zip_bytes(
    zip_bytes: &[u8],
    source_label: &str,
) -> Result<PayloadManifest, String> {
    let reader = Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| format!("Invalid zip from {source_label}: {e}"))?;
    read_payload_manifest_from_zip_archive(&mut archive, source_label)
}

fn read_payload_manifest_from_zip_file(
    path: &Path,
    source_label: &str,
) -> Result<PayloadManifest, String> {
    let file = File::open(path)
        .map_err(|e| format!("Failed to open payload zip ({source_label}): {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid payload zip ({source_label}): {e}"))?;
    read_payload_manifest_from_zip_archive(&mut archive, source_label)
}

fn read_payload_manifest_from_zip_archive<R: std::io::Read + std::io::Seek>(
    archive: &mut zip::ZipArchive<R>,
    source_label: &str,
) -> Result<PayloadManifest, String> {
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read payload entry ({source_label}): {e}"))?;
        let file_name = zip_entry_file_name(file.name());
        if !file_name.eq_ignore_ascii_case(PAYLOAD_MANIFEST_FILE) {
            continue;
        }
        let mut raw = String::new();
        file.read_to_string(&mut raw)
            .map_err(|e| format!("Failed to read payload manifest ({source_label}): {e}"))?;
        return parse_payload_manifest(&raw, source_label);
    }

    Err(format!(
        "Payload manifest is missing from {source_label}. Refusing unsafe install."
    ))
}

fn read_payload_manifest_from_dir(
    path: &Path,
    source_label: &str,
) -> Result<PayloadManifest, String> {
    let manifest_path = path.join(PAYLOAD_MANIFEST_FILE);
    let raw = std::fs::read_to_string(&manifest_path).map_err(|e| {
        format!(
            "Failed to read payload manifest from {} ({}): {}",
            source_label,
            manifest_path.display(),
            e
        )
    })?;
    parse_payload_manifest(&raw, source_label)
}

fn parse_payload_manifest(raw: &str, source_label: &str) -> Result<PayloadManifest, String> {
    serde_json::from_str(raw)
        .map_err(|e| format!("Invalid payload manifest from {source_label}: {}", e))
}

fn zip_entry_file_name(entry_name: &str) -> &str {
    entry_name
        .rsplit(&['/', '\\'][..])
        .next()
        .unwrap_or(entry_name)
}

fn is_payload_manifest_path(relative_path: &Path) -> bool {
    relative_path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|n| n.eq_ignore_ascii_case(PAYLOAD_MANIFEST_FILE))
        .unwrap_or(false)
}

fn should_install_payload_path(relative_path: &Path) -> bool {
    !is_payload_manifest_path(relative_path)
}

fn collect_payload_relative_paths_for_uninstall() -> Result<Vec<String>, String> {
    if embedded_payload_available() {
        return Ok(read_payload_manifest_from_zip_bytes(
            EMBEDDED_PAYLOAD_ZIP,
            "embedded payload zip",
        )?
        .files
        .into_iter()
        .map(|entry| entry.path)
        .collect());
    }

    Ok(vec![MAIN_APP_EXE.to_string()])
}

fn collect_uninstall_targets(install_path: &Path) -> Result<Vec<PathBuf>, String> {
    let mut relative_paths = collect_payload_relative_paths_for_uninstall()?;
    relative_paths.push("uninstall.exe".to_string());

    let mut targets: Vec<PathBuf> = relative_paths
        .into_iter()
        .map(|entry| sanitize_manifest_relative_path(&entry))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|entry| install_path.join(entry))
        .collect();
    targets.sort();
    targets.dedup();
    Ok(targets)
}

fn remove_installed_targets(
    install_path: &Path,
    targets: &[PathBuf],
    skip_file: Option<&Path>,
) -> Result<(), String> {
    for path in targets {
        if skip_file
            .map(|skip| paths_equal_for_platform(path, skip))
            .unwrap_or(false)
        {
            continue;
        }

        if !path.exists() {
            continue;
        }

        if path.is_file() {
            std::fs::remove_file(path).map_err(|e| {
                format!("Failed to remove installed file {}: {}", path.display(), e)
            })?;
        }
    }

    for dir in collect_parent_directories(install_path, targets) {
        let _ = std::fs::remove_dir(&dir);
    }
    let _ = std::fs::remove_dir(install_path);

    Ok(())
}

fn collect_parent_directories(root: &Path, paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for path in paths {
        let mut current = path.parent().map(|p| p.to_path_buf());
        while let Some(dir) = current {
            if paths_equal_for_platform(&dir, root) {
                break;
            }
            if dirs.iter().any(|existing| existing == &dir) {
                break;
            }
            dirs.push(dir.clone());
            current = dir.parent().map(|p| p.to_path_buf());
        }
    }

    dirs.sort_by(|a, b| {
        b.components()
            .count()
            .cmp(&a.components().count())
            .then_with(|| a.cmp(b))
    });
    dirs
}

fn sanitize_manifest_relative_path(raw: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        return Err(format!("Manifest entry must be relative: {}", raw));
    }

    if path
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(format!("Manifest entry escapes install directory: {}", raw));
    }

    Ok(path)
}

fn verify_installed_payload(install_path: &Path) -> Result<(), String> {
    let app_exe = install_path.join(MAIN_APP_EXE);
    let app_meta = std::fs::metadata(&app_exe)
        .map_err(|_| format!("Installed {} is missing after extraction", MAIN_APP_EXE))?;
    if app_meta.len() < MIN_WINDOWS_APP_EXE_BYTES {
        return Err(format!(
            "Installed {} is too small ({} bytes). Payload is likely invalid.",
            MAIN_APP_EXE,
            app_meta.len()
        ));
    }

    Ok(())
}

fn paths_equal_for_platform(a: &Path, b: &Path) -> bool {
    #[cfg(target_os = "windows")]
    {
        windows_path_eq_case_insensitive(a, b)
    }

    #[cfg(not(target_os = "windows"))]
    {
        a == b
    }
}

#[cfg(target_os = "windows")]
fn rollback_installation(
    install_path: &Path,
    install_dir_was_absent: bool,
    windows_state: &WindowsInstallState,
) {
    use super::registry;
    use super::shortcut;

    log::warn!("Installation failed, starting rollback");

    if windows_state.manufacturer_registered {
        let _ = registry::remove_tauri_install_location();
    }
    if windows_state.autostart_registered {
        let _ = registry::remove_autostart_run_entry();
    }
    if windows_state.start_menu_shortcut_created {
        let _ = shortcut::remove_start_menu_shortcut();
    }
    if windows_state.desktop_shortcut_created {
        let _ = shortcut::remove_desktop_shortcut();
    }
    if windows_state.uninstall_registered {
        let _ = registry::remove_uninstall_entry();
    }

    if install_dir_was_absent && install_path.exists() {
        let _ = std::fs::remove_dir_all(install_path);
    }
}

#[cfg(not(target_os = "windows"))]
fn rollback_installation(install_path: &Path, install_dir_was_absent: bool) {
    log::warn!("Installation failed, starting rollback");
    if install_dir_was_absent && install_path.exists() {
        let _ = std::fs::remove_dir_all(install_path);
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_app_language;

    #[test]
    fn normalize_app_language_maps_aliases_to_canonical_ids() {
        assert_eq!(normalize_app_language("zh-CN"), Some("zh-CN"));
        assert_eq!(normalize_app_language("zh"), Some("zh-CN"));
        assert_eq!(normalize_app_language("zh-Hans"), Some("zh-CN"));
        assert_eq!(normalize_app_language("zh-Hans-CN"), Some("zh-CN"));
        assert_eq!(normalize_app_language("  EN-us  "), Some("en-US"));
        assert_eq!(normalize_app_language("en"), Some("en-US"));
        assert_eq!(normalize_app_language("en-GB"), Some("en-US"));
    }

    #[test]
    fn normalize_app_language_rejects_unknown_language_codes() {
        assert_eq!(normalize_app_language("fr-FR"), None);
        assert_eq!(normalize_app_language("zh-TW"), None);
        assert_eq!(normalize_app_language(""), None);
    }
}
