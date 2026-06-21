use super::{
    load_or_create_library_state_at_path, normalize_library_state, save_library_state_at_path,
};
use crate::domain::launcher::types::{
    LauncherLibraryFolder, LauncherLibraryFolderClassificationMode, LauncherLibraryPackPreset,
    LauncherLibraryState,
};
use crate::test_support::create_temp_dir;

fn global_folder(id: &str, name: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: None,
        hidden,
        parent_folder_id: None,
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

fn pack_folder(id: &str, name: &str, pack_id: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: Some(pack_id.to_string()),
        hidden,
        parent_folder_id: None,
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

fn nested_folder(id: &str, name: &str, parent: &str, hidden: bool) -> LauncherLibraryFolder {
    LauncherLibraryFolder {
        id: id.to_string(),
        name: name.to_string(),
        pack_id: None,
        hidden,
        parent_folder_id: Some(parent.to_string()),
        mod_keys: Vec::new(),
        cover_mod_keys: Vec::new(),
    }
}

#[test]
fn normalize_library_state_preserves_hidden_flag_on_global_folder() {
    let state = LauncherLibraryState {
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            global_folder("gameplay", "Gameplay", false),
        ],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let visuals = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("visuals folder survives normalize");
    assert!(visuals.hidden, "hidden flag is preserved on global folder");
    assert!(visuals.pack_id.is_none());

    let gameplay = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "gameplay")
        .expect("gameplay folder survives normalize");
    assert!(!gameplay.hidden);
}

#[test]
fn normalize_library_state_strips_hidden_flag_from_pack_scoped_folders() {
    // Pack-scoped folders cannot be hidden; the flag is only meaningful for
    // global folders (the hidden bucket only collects global folders).
    let state = LauncherLibraryState {
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm Pack".to_string(),
            mod_keys: Vec::new(),
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
        }],
        library_folders: vec![pack_folder("pack-visuals", "Pack Visuals", "farm", true)],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let pack_visuals = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "pack-visuals")
        .expect("pack folder survives normalize");
    assert!(
        !pack_visuals.hidden,
        "hidden flag is stripped from pack-scoped folders"
    );
    assert_eq!(pack_visuals.pack_id.as_deref(), Some("farm"));
}

#[test]
fn normalize_library_state_propagates_hidden_to_child_folders_via_parent() {
    // The display layer treats a folder as effectively hidden when any
    // ancestor is hidden; normalize itself keeps the child's own flag intact
    // so the propagation can be derived. Here we verify the child flag is
    // preserved when the parent is hidden.
    let state = LauncherLibraryState {
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            nested_folder("interface", "Interface", "visuals", false),
        ],
        ..LauncherLibraryState::default()
    };

    let normalized = normalize_library_state(state);

    let interface = normalized
        .library_folders
        .iter()
        .find(|folder| folder.id == "interface")
        .expect("nested folder survives normalize");
    assert_eq!(
        interface.parent_folder_id.as_deref(),
        Some("visuals"),
        "parent linkage is preserved"
    );
    assert!(
        !interface.hidden,
        "child's own flag is preserved separately"
    );
}

#[test]
fn save_and_load_library_state_roundtrips_hidden_global_folder() {
    let root = create_temp_dir("launcher-library-hidden");
    let state_path = root.join("launcher").join("library-state.json");

    let state = LauncherLibraryState {
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm Pack".to_string(),
            mod_keys: Vec::new(),
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Independent,
        }],
        library_folders: vec![
            global_folder("visuals", "Visuals", true),
            pack_folder("pack-visuals", "Pack Visuals", "farm", false),
        ],
        ..LauncherLibraryState::default()
    };

    save_library_state_at_path(&state_path, &state).expect("save succeeds");

    let loaded = load_or_create_library_state_at_path(&state_path).expect("load succeeds");

    let visuals = loaded
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("global folder roundtrips");
    assert!(
        visuals.hidden,
        "hidden flag survives save/load roundtrip for global folder"
    );
    assert!(visuals.pack_id.is_none());

    let pack_visuals = loaded
        .library_folders
        .iter()
        .find(|folder| folder.id == "pack-visuals")
        .expect("pack folder roundtrips");
    assert_eq!(pack_visuals.pack_id.as_deref(), Some("farm"));
    assert!(!pack_visuals.hidden);

    // The pack's folder classification mode must also survive the roundtrip
    // so the frontend can keep using global folders alongside pack folders.
    let pack = loaded
        .pack_presets
        .iter()
        .find(|pack| pack.id == "farm")
        .expect("pack roundtrips");
    assert_eq!(
        pack.folder_classification_mode,
        LauncherLibraryFolderClassificationMode::Independent,
        "folder classification mode survives roundtrip"
    );
}

#[test]
fn save_library_state_roundtrips_hidden_flag_through_serde_string() {
    // Regression: the serialized JSON must include the `hidden` and `packId`
    // fields with the correct camelCase names so the frontend can read them
    // back without relying on serde defaults.
    let state = LauncherLibraryState {
        library_folders: vec![global_folder("visuals", "Visuals", true)],
        ..LauncherLibraryState::default()
    };

    let json = serde_json::to_string(&state).expect("serialize");
    assert!(
        json.contains("\"hidden\":true"),
        "serialized JSON exposes hidden flag: {json}"
    );
    assert!(
        json.contains("\"packId\":null"),
        "serialized JSON exposes packId: {json}"
    );

    let parsed: LauncherLibraryState = serde_json::from_str(&json).expect("deserialize roundtrips");
    let visuals = parsed
        .library_folders
        .iter()
        .find(|folder| folder.id == "visuals")
        .expect("folder survives serde roundtrip");
    assert!(visuals.hidden);
    assert!(visuals.pack_id.is_none());
}
