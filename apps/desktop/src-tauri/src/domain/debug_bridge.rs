use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::support::logging::{LogEvent, targets};

/// Default localhost port the ModForge Debug Bridge SMAPI mod listens on (mirrors the mod's config.json default).
pub const DEFAULT_BRIDGE_PORT: u16 = 5847;
const MOD_FOLDER_NAME: &str = "ModForgeDebugBridge";
const CONNECT_TIMEOUT: Duration = Duration::from_millis(600);
const READ_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugBridgeStatus {
    pub reachable: bool,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hello: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugBridgeModState {
    pub payload_available: bool,
    pub payload_version: Option<String>,
    pub payload_path: Option<String>,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub mods_path: String,
}

/// Probes the bridge with a `hello` round trip; unreachable bridges are a status, not an error.
pub(crate) fn get_debug_bridge_status(port: Option<u16>) -> Result<DebugBridgeStatus> {
    let port = port.unwrap_or(DEFAULT_BRIDGE_PORT);
    match bridge_roundtrip(port, "hello", Value::Null) {
        Ok(response) => Ok(match parse_bridge_response(&response) {
            Ok(result) => DebugBridgeStatus {
                reachable: true,
                port,
                hello: Some(result),
                error: None,
            },
            Err(error) => DebugBridgeStatus {
                reachable: true,
                port,
                hello: None,
                error: Some(error.to_string()),
            },
        }),
        Err(error) => Ok(DebugBridgeStatus {
            reachable: false,
            port,
            hello: None,
            error: Some(error.to_string()),
        }),
    }
}

/// Sends one command to the running game and returns the bridge's `{ok, result?, error?}` payload verbatim.
pub(crate) fn send_debug_bridge_command(request: Value) -> Result<Value> {
    let command = request
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("Bridge request is missing a command."))?
        .to_string();
    let args = request.get("args").cloned().unwrap_or(Value::Null);
    let port = request
        .get("port")
        .and_then(Value::as_u64)
        .and_then(|value| u16::try_from(value).ok())
        .unwrap_or(DEFAULT_BRIDGE_PORT);

    let response = bridge_roundtrip(port, &command, args)?;
    LogEvent::new("debugBridge.command.completed")
        .field("command", &command)
        .flag(
            "ok",
            response.get("ok").and_then(Value::as_bool).unwrap_or(false),
        )
        .emit_debug(targets::DEBUG_BRIDGE);
    Ok(response)
}

/// Reports payload availability and the installed bridge mod version inside the game's Mods folder.
pub(crate) fn get_debug_bridge_mod_state(game_root_path: String) -> Result<DebugBridgeModState> {
    let mods_path = resolve_mods_dir(&game_root_path)?;
    let payload_dir = resolve_payload_dir();
    let payload_version = payload_dir.as_deref().and_then(read_manifest_version);
    let installed_dir = mods_path.join(MOD_FOLDER_NAME);
    let installed_version = read_manifest_version(&installed_dir);

    Ok(DebugBridgeModState {
        payload_available: payload_version.is_some(),
        payload_version,
        payload_path: payload_dir.map(|path| path.to_string_lossy().into_owned()),
        installed: installed_version.is_some(),
        installed_version,
        mods_path: mods_path.to_string_lossy().into_owned(),
    })
}

/// Copies the staged bridge mod into the game's Mods folder, replacing any previous install.
pub(crate) fn install_debug_bridge_mod(game_root_path: String) -> Result<DebugBridgeModState> {
    let mods_path = resolve_mods_dir(&game_root_path)?;
    let payload_dir = resolve_payload_dir()
        .ok_or_else(|| anyhow!("The debug bridge mod payload is not available in this build. Run `pnpm --filter @modforge/desktop build:debug-bridge` or set MODFORGE_DEBUG_BRIDGE_DIST."))?;
    if read_manifest_version(&payload_dir).is_none() {
        bail!(
            "The debug bridge payload at {} is missing a valid manifest.json.",
            payload_dir.display()
        );
    }

    let target_dir = mods_path.join(MOD_FOLDER_NAME);
    copy_dir_replacing(&payload_dir, &target_dir)?;

    let state = get_debug_bridge_mod_state(game_root_path)?;
    LogEvent::new("debugBridge.mod.installed")
        .path("modsPath", &mods_path)
        .optional("version", state.installed_version.clone())
        .emit_info(targets::DEBUG_BRIDGE);
    Ok(state)
}

/// Parses one bridge response line, returning the `result` payload of a successful response.
pub(crate) fn parse_bridge_response(response: &Value) -> Result<Value> {
    let ok = response
        .get("ok")
        .and_then(Value::as_bool)
        .ok_or_else(|| anyhow!("Bridge response is missing the ok flag."))?;
    if !ok {
        let error = response
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Bridge command failed without an error message.");
        bail!("{error}");
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

fn bridge_roundtrip(port: u16, command: &str, args: Value) -> Result<Value> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let stream = TcpStream::connect_timeout(&address, CONNECT_TIMEOUT)
        .with_context(|| format!("Could not reach the debug bridge on 127.0.0.1:{port}."))?;
    stream.set_read_timeout(Some(READ_TIMEOUT))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    stream.set_nodelay(true)?;

    let request = json!({ "id": 1, "command": command, "args": args });
    let mut writer = stream.try_clone()?;
    writer.write_all(serde_json::to_string(&request)?.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    let read = reader
        .read_line(&mut line)
        .context("The debug bridge closed the connection before replying.")?;
    if read == 0 || line.trim().is_empty() {
        bail!("The debug bridge closed the connection before replying.");
    }
    serde_json::from_str(line.trim()).context("The debug bridge returned invalid JSON.")
}

fn resolve_mods_dir(game_root_path: &str) -> Result<PathBuf> {
    let root = PathBuf::from(game_root_path);
    if !root.is_dir() {
        bail!("Game directory {} does not exist.", root.display());
    }
    let mods = root.join("Mods");
    if !mods.is_dir() {
        bail!(
            "No Mods folder found in {} — install SMAPI first.",
            root.display()
        );
    }
    Ok(mods)
}

/// Resolves the staged bridge mod folder: explicit env override, packaged resources, then the repo dev build.
pub(crate) fn resolve_payload_dir() -> Option<PathBuf> {
    if let Ok(overridden) = std::env::var("MODFORGE_DEBUG_BRIDGE_DIST") {
        let path = PathBuf::from(overridden);
        if path.is_dir() {
            return Some(path);
        }
    }

    if let Ok(executable) = std::env::current_exe() {
        if let Some(exe_dir) = executable.parent() {
            let packaged = exe_dir
                .join("resources")
                .join("debug-bridge")
                .join(MOD_FOLDER_NAME);
            if packaged.is_dir() {
                return Some(packaged);
            }
        }
    }

    let dev = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tools")
        .join("debug-bridge")
        .join("dist")
        .join(MOD_FOLDER_NAME);
    dev.is_dir().then_some(dev)
}

/// Reads the SMAPI manifest Version from a mod folder, or None when the folder is not a valid mod.
pub(crate) fn read_manifest_version(mod_dir: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(mod_dir.join("manifest.json")).ok()?;
    let manifest: Value = crate::infrastructure::game_formats::json_relaxed::parse_json_str(
        &raw,
        "debug bridge manifest",
    )
    .ok()?;
    manifest
        .get("Version")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn copy_dir_replacing(source: &Path, target: &Path) -> Result<()> {
    if target.exists() {
        std::fs::remove_dir_all(target).with_context(|| {
            format!(
                "Could not remove the previous install at {}.",
                target.display()
            )
        })?;
    }
    std::fs::create_dir_all(target)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let destination = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_replacing(&entry.path(), &destination)?;
        } else {
            std::fs::copy(entry.path(), &destination).with_context(|| {
                format!(
                    "Could not copy {} into the Mods folder.",
                    entry.path().display()
                )
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "../tests/unit/domain/debug_bridge_tests.rs"]
mod tests;
