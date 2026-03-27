use std::path::{Path, PathBuf};

pub fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

pub fn clean_input_path(path: &str) -> PathBuf {
    PathBuf::from(path.trim().trim_matches('"'))
}

pub fn collect_known_game_paths() -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from(r"E:\SteamLibrary\steamapps\common\Stardew Valley"),
        PathBuf::from(r"D:\SteamLibrary\steamapps\common\Stardew Valley"),
        PathBuf::from(r"C:\Program Files (x86)\Steam\steamapps\common\Stardew Valley"),
    ];

    if let Ok(program_files) = std::env::var("ProgramFiles(x86)") {
        candidates.push(
            Path::new(&program_files)
                .join("Steam")
                .join("steamapps")
                .join("common")
                .join("Stardew Valley"),
        );
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
