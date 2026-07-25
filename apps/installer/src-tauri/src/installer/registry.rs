//! Windows Registry operations for the installer.
//!
//! Handles:
//! - Uninstall registry entries (Add/Remove Programs)
//! - Install location under `Software\{publisher}\{productName}` (mirrors Tauri NSIS `MANUPRODUCTKEY`)
//! - `Run` autostart cleanup
//!
//! Main exe name must match `super::MAIN_APP_EXE`.

use anyhow::{Context, Result};
use std::path::Path;
use winreg::enums::*;
use winreg::RegKey;

use super::MAIN_APP_EXE;

const APP_NAME: &str = "ModForge Studio";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ModForgeStudio";

/// Publisher shown in Add/Remove Programs.
const TAURI_MANUFACTURER: &str = "ModForge Studio";
/// Product name segment of the install-location key (mirrors Tauri NSIS `PRODUCTNAME`).
const TAURI_PRODUCT_NAME: &str = "ModForge Studio";

/// `HKCU\Software\{TAURI_MANUFACTURER}\{TAURI_PRODUCT_NAME}` — same shape as Tauri `MANUPRODUCTKEY`.
fn tauri_manufacturer_product_key() -> String {
    format!(r"Software\{}\{}", TAURI_MANUFACTURER, TAURI_PRODUCT_NAME)
}

fn quote_windows_path(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

fn normalize_registry_path(value: &str) -> Option<String> {
    let trimmed = value.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(trimmed)
        .trim();
    if unquoted.is_empty() {
        None
    } else {
        Some(unquoted.to_string())
    }
}

/// Register the application in Add/Remove Programs.
pub(super) fn register_uninstall_entry(
    install_path: &Path,
    version: &str,
    uninstall_command: &str,
) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(UNINSTALL_KEY)
        .with_context(|| "Failed to create uninstall registry key")?;

    let exe_path = install_path.join(MAIN_APP_EXE);

    key.set_value("DisplayName", &APP_NAME)?;
    key.set_value("DisplayVersion", &version)?;
    key.set_value("Publisher", &TAURI_MANUFACTURER)?;
    key.set_value("MainBinaryName", &MAIN_APP_EXE)?;
    key.set_value("InstallLocation", &quote_windows_path(install_path))?;
    key.set_value("DisplayIcon", &quote_windows_path(&exe_path))?;
    key.set_value("UninstallString", &uninstall_command)?;
    key.set_value("QuietUninstallString", &uninstall_command)?;
    key.set_value("NoModify", &1u32)?;
    key.set_value("NoRepair", &1u32)?;

    log::info!("Registered uninstall entry at {}", UNINSTALL_KEY);
    Ok(())
}

/// Same as Tauri NSIS `WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR` — used for default install dir / upgrades.
pub(super) fn register_tauri_install_location(install_path: &Path) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = tauri_manufacturer_product_key();
    let (key, _) = hkcu
        .create_subkey(&path)
        .with_context(|| format!("Failed to create registry key {}", path))?;
    let dir = install_path.to_string_lossy();
    key.set_value("", &dir.as_ref())?;
    log::info!("Registered Tauri install location at {}", path);
    Ok(())
}

/// Read install dir written by a previous install (`MANUPRODUCTKEY` default value).
pub(super) fn read_tauri_install_location() -> Option<String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = tauri_manufacturer_product_key();
    let key = hkcu.open_subkey(&path).ok()?;
    let s: String = key.get_value("").ok()?;
    normalize_registry_path(&s)
}

/// Remove `MANUPRODUCTKEY` (HKCU and HKLM, matching Tauri NSIS `SHCTX` per-user / per-machine).
pub(super) fn remove_tauri_install_location() -> Result<()> {
    let path = tauri_manufacturer_product_key();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if hkcu.delete_subkey_all(&path).is_ok() {
        log::info!("Removed HKCU Tauri install location key {}", path);
    }
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if hklm.delete_subkey_all(&path).is_ok() {
        log::info!("Removed HKLM Tauri install location key {}", path);
    }
    Ok(())
}

/// Remove Add/Remove Programs entry (per-user and per-machine attempts).
pub(super) fn remove_uninstall_entry() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if hkcu.delete_subkey_all(UNINSTALL_KEY).is_ok() {
        log::info!("Removed HKCU uninstall key {}", UNINSTALL_KEY);
    }
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if hklm.delete_subkey_all(UNINSTALL_KEY).is_ok() {
        log::info!("Removed HKLM uninstall key {}", UNINSTALL_KEY);
    }
    Ok(())
}

/// Remove any `Run` autostart value registered for the app.
pub(super) fn remove_autostart_run_entry() -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let key = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_READ | KEY_WRITE,
    );
    if let Ok(key) = key {
        let _ = key.delete_value(APP_NAME);
        log::info!("Removed Run registry value for {}", APP_NAME);
    }
    Ok(())
}

/// Register a per-user `Run` autostart value pointing at the installed main exe.
pub(super) fn register_autostart_run_entry(install_path: &Path) -> Result<()> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
        .with_context(|| "Failed to open Run registry key")?;
    let exe_path = install_path.join(MAIN_APP_EXE);
    key.set_value(APP_NAME, &quote_windows_path(&exe_path))?;
    log::info!(
        "Registered Run autostart value for {} -> {}",
        APP_NAME,
        exe_path.display()
    );
    Ok(())
}

/// Data read from `Uninstall\ModForgeStudio` (this installer).
#[derive(Debug, Clone)]
pub(super) struct UninstallRegistryData {
    pub install_location: String,
    pub display_version: Option<String>,
    pub uninstall_string: Option<String>,
    pub hive: &'static str,
}

fn read_uninstall_key(root: RegKey, hive_name: &'static str) -> Option<UninstallRegistryData> {
    let key = root.open_subkey(UNINSTALL_KEY).ok()?;
    let install_location: String = key.get_value("InstallLocation").ok()?;
    let display_version: Option<String> = key.get_value("DisplayVersion").ok();
    let uninstall_string: Option<String> = key.get_value("UninstallString").ok();
    Some(UninstallRegistryData {
        install_location: normalize_registry_path(&install_location)?,
        display_version,
        uninstall_string,
        hive: hive_name,
    })
}

/// Detect existing install via the uninstall registry key (HKCU then HKLM).
pub(super) fn read_existing_install_from_uninstall_registry() -> Option<UninstallRegistryData> {
    read_uninstall_key(RegKey::predef(HKEY_CURRENT_USER), "hkcu")
        .or_else(|| read_uninstall_key(RegKey::predef(HKEY_LOCAL_MACHINE), "hklm"))
}
