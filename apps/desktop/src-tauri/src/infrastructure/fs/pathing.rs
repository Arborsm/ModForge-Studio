use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

pub fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn clean_input_path(path: &str) -> PathBuf {
    let trimmed = path.trim().trim_matches('"');

    #[cfg(windows)]
    {
        PathBuf::from(trimmed)
    }

    #[cfg(not(windows))]
    {
        if let Some(mapped) = map_windows_drive_path(trimmed) {
            return mapped;
        }

        PathBuf::from(trimmed.replace('\\', "/"))
    }
}

#[cfg(not(windows))]
fn map_windows_drive_path(path: &str) -> Option<PathBuf> {
    let bytes = path.as_bytes();
    if bytes.len() < 3 || !bytes[0].is_ascii_alphabetic() || bytes[1] != b':' {
        return None;
    }

    let separator = bytes[2];
    if separator != b'\\' && separator != b'/' {
        return None;
    }

    let drive = (bytes[0] as char).to_ascii_lowercase().to_string();
    let rest = path[3..].replace('\\', "/");
    let mut mapped = PathBuf::from("/mnt");
    mapped.push(drive);
    if !rest.is_empty() {
        mapped.push(rest);
    }
    Some(mapped)
}

pub fn collect_known_game_paths() -> Vec<PathBuf> {
    let mut seen = HashSet::<String>::new();
    let mut candidates = Vec::new();

    for candidate in collect_custom_install_paths()
        .into_iter()
        .chain(collect_default_install_paths())
    {
        let normalized = normalize_path(&candidate).to_ascii_lowercase();
        if seen.insert(normalized) {
            candidates.push(candidate);
        }
    }

    candidates
}

pub fn map_source_path(root: &Path) -> PathBuf {
    root.join("Content").join("Maps")
}

pub fn event_source_path(root: &Path) -> PathBuf {
    root.join("Content").join("Data").join("Events")
}

pub fn audio_source_roots(root: &Path) -> Vec<PathBuf> {
    vec![
        root.join("Content").join("Audio"),
        root.join("Content").join("Music"),
        root.join("Content").join("Sound"),
    ]
}

pub fn default_save_root_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|path| path.join("StardewValley").join("Saves"))
}

pub fn resolve_save_file_path(save_folder: &Path) -> Option<PathBuf> {
    let slot_name = save_folder.file_name().and_then(|value| value.to_str())?;
    let save_game_info = save_folder.join("SaveGameInfo");
    if save_game_info.exists() {
        return Some(save_game_info);
    }

    let primary_file = save_folder.join(slot_name);
    if primary_file.exists() {
        return Some(primary_file);
    }

    None
}

fn collect_custom_install_paths() -> Vec<PathBuf> {
    let home_var = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    let Some(home) = std::env::var_os(home_var).map(PathBuf::from) else {
        return Vec::new();
    };

    let targets_path = home.join("stardewvalley.targets");
    let Ok(content) = std::fs::read_to_string(&targets_path) else {
        return Vec::new();
    };

    extract_xml_tag_value(&content, "GamePath")
        .map(PathBuf::from)
        .into_iter()
        .collect()
}

fn collect_default_install_paths() -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        collect_windows_install_paths()
    }

    #[cfg(target_os = "linux")]
    {
        collect_linux_install_paths()
    }

    #[cfg(target_os = "macos")]
    {
        collect_macos_install_paths()
    }

    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Vec::new()
    }
}

fn extract_xml_tag_value(content: &str, tag_name: &str) -> Option<String> {
    let start_tag = format!("<{tag_name}>");
    let end_tag = format!("</{tag_name}>");
    let start = content.find(&start_tag)? + start_tag.len();
    let end = content[start..].find(&end_tag)? + start;
    let value = content[start..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

#[cfg(target_os = "linux")]
fn collect_linux_install_paths() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };

    let primary_steam = home
        .join(".steam")
        .join("steam")
        .join("steamapps")
        .join("common")
        .join("Stardew Valley");
    let fallback_steam = home
        .join(".local")
        .join("share")
        .join("Steam")
        .join("steamapps")
        .join("common")
        .join("Stardew Valley");

    vec![
        home.join("GOG Games").join("Stardew Valley").join("game"),
        if primary_steam.exists() {
            primary_steam
        } else {
            fallback_steam
        },
        home.join(".var")
            .join("app")
            .join("com.valvesoftware.Steam")
            .join("data")
            .join("Steam")
            .join("steamapps")
            .join("common")
            .join("Stardew Valley"),
    ]
}

#[cfg(target_os = "macos")]
fn collect_macos_install_paths() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return vec![PathBuf::from(
            "/Applications/Stardew Valley.app/Contents/MacOS",
        )];
    };

    vec![
        home.join("GOG Games").join("Stardew Valley").join("game"),
        home.join("Library")
            .join("Application Support")
            .join("Steam")
            .join("steamapps")
            .join("common")
            .join("Stardew Valley")
            .join("Contents")
            .join("MacOS"),
        PathBuf::from("/Applications/Stardew Valley.app/Contents/MacOS"),
    ]
}

#[cfg(windows)]
fn collect_windows_install_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    for (key, value_name) in [
        (
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 413150",
            "InstallLocation",
        ),
        (r"SOFTWARE\WOW6432Node\GOG.com\Games\1453375253", "PATH"),
    ] {
        if let Some(value) =
            read_windows_registry_value(winreg::enums::HKEY_LOCAL_MACHINE, key, value_name)
        {
            candidates.push(PathBuf::from(value));
        }
    }

    if let Some(steam_path) = read_windows_registry_value(
        winreg::enums::HKEY_CURRENT_USER,
        r"Software\Valve\Steam",
        "SteamPath",
    ) {
        let steam_root = PathBuf::from(steam_path.replace('/', "\\"));
        candidates.push(
            steam_root
                .join("steamapps")
                .join("common")
                .join("Stardew Valley"),
        );

        if let Some(path) = get_path_from_steam_library(&steam_root) {
            candidates.push(path);
        }
    }

    for program_files in ["C:\\Program Files", "C:\\Program Files (x86)"] {
        let root = PathBuf::from(program_files);
        candidates.push(
            root.join("GalaxyClient")
                .join("Games")
                .join("Stardew Valley"),
        );
        candidates.push(root.join("GOG Galaxy").join("Games").join("Stardew Valley"));
        candidates.push(root.join("GOG Games").join("Stardew Valley"));
        candidates.push(
            root.join("Steam")
                .join("steamapps")
                .join("common")
                .join("Stardew Valley"),
        );
    }

    for drive_letter in 'C'..='H' {
        candidates.push(PathBuf::from(format!(
            "{drive_letter}:\\Program Files\\ModifiableWindowsApps\\Stardew Valley"
        )));
    }

    candidates
}

#[cfg(windows)]
fn read_windows_registry_value(
    hive: winreg::HKEY,
    subkey: &str,
    value_name: &str,
) -> Option<String> {
    use winreg::RegKey;

    let root = RegKey::predef(hive);
    let key = root.open_subkey(subkey).ok()?;
    let value: String = key.get_value(value_name).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(windows)]
fn get_path_from_steam_library(steam_root: &Path) -> Option<PathBuf> {
    let library_folders_path = steam_root.join("steamapps").join("libraryfolders.vdf");
    let content = std::fs::read_to_string(library_folders_path).ok()?;
    let root = parse_vdf(&content)?;
    let libraries = match &root {
        VdfValue::Object(entries) => entries.get("libraryfolders")?,
        VdfValue::String(_) => return None,
    };
    let VdfValue::Object(libraries) = libraries else {
        return None;
    };

    for value in libraries.values() {
        let VdfValue::Object(library) = value else {
            continue;
        };
        let Some(path) = library.get("path").and_then(VdfValue::as_str) else {
            continue;
        };
        let Some(apps) = library.get("apps") else {
            continue;
        };
        let VdfValue::Object(apps) = apps else {
            continue;
        };
        if apps.contains_key("413150") {
            return Some(
                PathBuf::from(path.replace("\\\\", "\\"))
                    .join("steamapps")
                    .join("common")
                    .join("Stardew Valley"),
            );
        }
    }

    None
}

#[derive(Debug, Clone)]
enum VdfValue {
    String(String),
    Object(BTreeMap<String, VdfValue>),
}

impl VdfValue {
    fn as_str(&self) -> Option<&str> {
        match self {
            VdfValue::String(value) => Some(value),
            VdfValue::Object(_) => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VdfTokenKind {
    OpenBrace,
    CloseBrace,
    String,
}

#[derive(Debug, Clone)]
struct VdfToken {
    kind: VdfTokenKind,
    value: String,
}

fn parse_vdf(content: &str) -> Option<VdfValue> {
    let tokens = tokenize_vdf(content);
    if tokens.is_empty() {
        return None;
    }

    let mut cursor = 0;
    let mut entries = BTreeMap::new();
    while cursor < tokens.len() {
        let key = take_vdf_string(&tokens, &mut cursor)?;
        let value = parse_vdf_value(&tokens, &mut cursor)?;
        entries.insert(key, value);
    }

    Some(VdfValue::Object(entries))
}

fn parse_vdf_value(tokens: &[VdfToken], cursor: &mut usize) -> Option<VdfValue> {
    let token = tokens.get(*cursor)?;
    match token.kind {
        VdfTokenKind::String => {
            *cursor += 1;
            Some(VdfValue::String(token.value.clone()))
        }
        VdfTokenKind::OpenBrace => {
            *cursor += 1;
            let mut entries = BTreeMap::new();
            while *cursor < tokens.len() {
                if tokens.get(*cursor)?.kind == VdfTokenKind::CloseBrace {
                    *cursor += 1;
                    break;
                }

                let key = take_vdf_string(tokens, cursor)?;
                let value = parse_vdf_value(tokens, cursor)?;
                entries.insert(key, value);
            }
            Some(VdfValue::Object(entries))
        }
        VdfTokenKind::CloseBrace => None,
    }
}

fn take_vdf_string(tokens: &[VdfToken], cursor: &mut usize) -> Option<String> {
    let token = tokens.get(*cursor)?;
    if token.kind != VdfTokenKind::String {
        return None;
    }

    *cursor += 1;
    Some(token.value.clone())
}

fn tokenize_vdf(content: &str) -> Vec<VdfToken> {
    let bytes = content.as_bytes();
    let mut index = 0;
    let mut tokens = Vec::new();

    while index < bytes.len() {
        match bytes[index] {
            b'{' => {
                tokens.push(VdfToken {
                    kind: VdfTokenKind::OpenBrace,
                    value: String::new(),
                });
                index += 1;
            }
            b'}' => {
                tokens.push(VdfToken {
                    kind: VdfTokenKind::CloseBrace,
                    value: String::new(),
                });
                index += 1;
            }
            b'"' => {
                index += 1;
                let mut value = String::new();
                while index < bytes.len() {
                    match bytes[index] {
                        b'\\' if index + 1 < bytes.len() => {
                            value.push(bytes[index + 1] as char);
                            index += 2;
                        }
                        b'"' => {
                            index += 1;
                            break;
                        }
                        byte => {
                            value.push(byte as char);
                            index += 1;
                        }
                    }
                }
                tokens.push(VdfToken {
                    kind: VdfTokenKind::String,
                    value,
                });
            }
            b'/' if index + 1 < bytes.len() && bytes[index + 1] == b'/' => {
                index += 2;
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            _ => index += 1,
        }
    }

    tokens
}

#[cfg(test)]
#[path = "../../tests/pathing_tests.rs"]
mod tests;
