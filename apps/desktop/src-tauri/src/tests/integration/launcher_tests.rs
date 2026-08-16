use crate::domain::launcher::archive::{inspect_archive_at_path, install_archive_at_path};
use crate::domain::launcher::downloads::{
    load_or_create_download_queue_at_path, save_download_queue_at_path,
};
use crate::domain::launcher::image_cache::clear_launcher_image_cache_dir;
use crate::domain::launcher::library::{
    load_or_create_library_covers_at_path, load_or_create_library_state_at_path,
    persist_auto_library_cover_at_path, save_library_state_at_path, scan_library_at_path,
    set_launcher_mod_enabled_blocking,
};
use crate::domain::launcher::runtime::launch_game_with_runner;
use crate::domain::launcher::trace::launcher_trace_event;
use crate::domain::launcher::types::{
    LauncherArchiveTreeNode, LauncherDownloadQueueItem, LauncherDownloadQueueState,
    LauncherGameLaunchTarget, LauncherLibraryChildModGroup, LauncherLibraryCover,
    LauncherLibraryCoversState, LauncherLibraryFolder, LauncherLibraryFolderClassificationMode,
    LauncherLibraryPackPreset, LauncherLibraryScopeMode, LauncherLibraryState,
    LauncherLibraryStorageFolder, LauncherSettings, LauncherUpdateSummary, LauncherUpdatesResult,
    SearchLauncherCatalogRequest, SetLauncherModEnabledRequest,
};
use crate::domain::launcher::update_cache::{
    LauncherUpdatesCacheEntryState, clear_launcher_updates_check_in_progress_at_path,
    inspect_launcher_updates_cache_at_path, invalidate_launcher_updates_cache_at_path,
    load_cached_launcher_updates_at_path, mark_launcher_updates_check_in_progress_at_path,
    normalize_launcher_updates_cache_key, save_launcher_updates_cache_at_path,
};
use crate::domain::launcher::updates::{
    SmapiRuntimeVersions, UpdateCheckCandidate, build_launcher_update_summary,
    build_smapi_update_payload, build_smapi_update_payload_with_versions,
    dedupe_update_candidates_by_mod_id, finalize_remote_mod_details_batch,
    parse_smapi_update_response, resolve_smapi_runtime_versions_with_reader,
};
use crate::domain::nexusmods::can_use_nexus_graphql;
use crate::domain::nexusmods::catalog::{
    build_catalog_graphql_payload, build_public_catalog_graphql_payload,
    parse_catalog_graphql_response,
};
use crate::domain::nexusmods::mod_detail::{
    RemoteModDetail, enrich_remote_mod_detail_with_gallery_images,
    parse_public_mod_detail_graphql_response,
};
use crate::domain::nexusmods::request::NexusRequestContext;
use crate::domain::nexusmods::updates::{
    build_update_batch_graphql_payload, parse_update_batch_graphql_response,
};
use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use crate::test_support::{create_temp_dir, write_bytes_file, write_file};
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use zip::CompressionMethod;
use zip::ZipWriter;
use zip::write::SimpleFileOptions;

fn sample_manifest(unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}"
}}"#
    )
}

fn sample_manifest_with_update_key(unique_id: &str, update_key: &str) -> String {
    format!(
        r#"{{
  "Name": "Example Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}",
  "UpdateKeys": ["{update_key}"]
}}"#
    )
}

fn sample_manifest_with_required_dependency(unique_id: &str, dependency_unique_id: &str) -> String {
    format!(
        r#"{{
  "Name": "Consumer Mod",
  "Author": "ModForge",
  "Version": "1.0.0",
  "UniqueID": "{unique_id}",
  "Dependencies": [
    {{
      "UniqueID": "{dependency_unique_id}",
      "IsRequired": true
    }}
  ]
}}"#
    )
}

fn normalized_mods_path(input: &str) -> String {
    normalize_path(&clean_input_path(input))
}

fn sample_launcher_updates_result(mods_path: &str, checked_at_ms: u128) -> LauncherUpdatesResult {
    let mods_path = normalized_mods_path(mods_path);
    LauncherUpdatesResult {
        mods_path: mods_path.clone(),
        checked_at_ms,
        is_complete: true,
        updates: vec![LauncherUpdateSummary {
            mod_id: 101,
            name: "NPC Adventures".to_string(),
            author: Some("Pathoschild".to_string()),
            current_version: Some("1.0.0".to_string()),
            latest_version: "1.2.0".to_string(),
            absolute_path: format!("{mods_path}\\NPC Adventures"),
            mod_url: "https://www.nexusmods.com/stardewvalley/mods/101".to_string(),
            image_url: Some("https://static.nexusmods.com/mods/101.webp".to_string()),
            updated_at: Some("2024-05-04T03:52:00Z".to_string()),
            file_size: Some(13_107_200),
        }],
    }
}

#[test]
fn launcher_trace_event_prefixes_action_and_quotes_only_when_needed() {
    let message = launcher_trace_event("install.start", |event| {
        event
            .field("archivePath", r"E:\Downloads\Example Pack.zip")
            .field("modsPath", r"E:\Games\Stardew Valley\Mods")
            .flag("hasBackupRoot", true)
    })
    .render();

    assert_eq!(
        message,
        r#"launcher.install.start archivePath="E:\Downloads\Example Pack.zip" modsPath="E:\Games\Stardew Valley\Mods" hasBackupRoot=true"#
    );
}

#[test]
fn launcher_trace_event_skips_blank_optional_values() {
    let message = launcher_trace_event("toggle.complete", |event| {
        event
            .field("modPath", r"E:\Games\Mods\ExamplePack")
            .optional("reason", Some("   "))
            .flag("enabled", false)
    })
    .render();

    // No whitespace in the path, so it stays unquoted.
    assert_eq!(
        message,
        r"launcher.toggle.complete modPath=E:\Games\Mods\ExamplePack enabled=false"
    );
}

fn write_library_covers_state(path: &Path, state: &LauncherLibraryCoversState) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create launcher cover test directory");
    }
    let json = serde_json::to_string_pretty(state).expect("serialize launcher cover test state");
    fs::write(path, format!("{json}\n")).expect("write launcher cover test state");
}

#[test]
fn launcher_library_state_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-library-state");
    let state_path = root.join("launcher").join("library.json");

    let default_state = load_or_create_library_state_at_path(&state_path)
        .expect("load default launcher library state");
    assert_eq!(
        default_state,
        LauncherLibraryState {
            storage_folders: vec![LauncherLibraryStorageFolder {
                id: "unsorted".to_string(),
                name: "Unsorted".to_string(),
                mod_keys: Vec::new(),
            }],
            hidden_mod_keys: Vec::new(),
            pack_presets: Vec::new(),
            child_mod_groups: Vec::new(),
            library_folders: Vec::new(),
            custom_orders: BTreeMap::new(),
            current_pack_id: None,
            scope_mode: LauncherLibraryScopeMode::All,
        }
    );
    assert!(state_path.is_file());

    let saved_state = LauncherLibraryState {
        storage_folders: vec![
            LauncherLibraryStorageFolder {
                id: "core".to_string(),
                name: "Core".to_string(),
                mod_keys: vec!["ModForge.Visible".to_string()],
            },
            LauncherLibraryStorageFolder {
                id: "unsorted".to_string(),
                name: "Unsorted".to_string(),
                mod_keys: vec!["ModForge.Hidden".to_string()],
            },
        ],
        hidden_mod_keys: vec!["ModForge.Hidden".to_string()],
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm".to_string(),
            mod_keys: vec![
                "ModForge.Visible".to_string(),
                "ModForge.Hidden".to_string(),
            ],
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
        }],
        child_mod_groups: vec![LauncherLibraryChildModGroup {
            parent_mod_key: "ModForge.Visible".to_string(),
            child_mod_keys: vec!["ModForge.Hidden".to_string()],
        }],
        library_folders: vec![LauncherLibraryFolder {
            id: "visual".to_string(),
            name: "Visual".to_string(),
            pack_id: None,
            hidden: false,
            parent_folder_id: None,
            mod_keys: vec!["ModForge.Visible".to_string()],
            cover_mod_keys: vec!["ModForge.Visible".to_string()],
        }],
        custom_orders: BTreeMap::from([
            (
                "view:pack:farm".to_string(),
                vec!["f:visual".to_string(), "m:ModForge.Visible".to_string()],
            ),
            (
                "folder:visual".to_string(),
                vec!["m:ModForge.Visible".to_string()],
            ),
        ]),
        current_pack_id: Some("farm".to_string()),
        scope_mode: LauncherLibraryScopeMode::CurrentPack,
    };
    save_library_state_at_path(&state_path, &saved_state).expect("save launcher library state");

    let reloaded = load_or_create_library_state_at_path(&state_path)
        .expect("reload saved launcher library state");
    assert_eq!(reloaded, saved_state);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_state_normalizes_invalid_entries_and_keeps_single_folder_membership() {
    let root = create_temp_dir("launcher-library-state-normalize");
    let state_path = root.join("launcher").join("library.json");

    let raw_state = LauncherLibraryState {
        storage_folders: vec![
            LauncherLibraryStorageFolder {
                id: "core".to_string(),
                name: "Core".to_string(),
                mod_keys: vec![
                    "ModForge.A".to_string(),
                    "  ModForge.A  ".to_string(),
                    "".to_string(),
                ],
            },
            LauncherLibraryStorageFolder {
                id: "addons".to_string(),
                name: "Addons".to_string(),
                mod_keys: vec!["ModForge.A".to_string(), "ModForge.B".to_string()],
            },
            LauncherLibraryStorageFolder {
                id: "core".to_string(),
                name: "Duplicate".to_string(),
                mod_keys: vec!["ModForge.C".to_string()],
            },
            LauncherLibraryStorageFolder {
                id: " ".to_string(),
                name: "Invalid".to_string(),
                mod_keys: vec!["ModForge.D".to_string()],
            },
        ],
        hidden_mod_keys: vec![
            "ModForge.Hidden".to_string(),
            " modforge.hidden ".to_string(),
        ],
        pack_presets: vec![
            LauncherLibraryPackPreset {
                id: "seasonal".to_string(),
                name: "Seasonal".to_string(),
                mod_keys: vec![
                    "ModForge.A".to_string(),
                    "ModForge.B".to_string(),
                    "ModForge.B".to_string(),
                ],
                folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
            },
            LauncherLibraryPackPreset {
                id: "seasonal".to_string(),
                name: "Duplicate".to_string(),
                mod_keys: vec!["ModForge.C".to_string()],
                folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
            },
            LauncherLibraryPackPreset {
                id: " ".to_string(),
                name: "".to_string(),
                mod_keys: vec!["ModForge.Z".to_string()],
                folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
            },
        ],
        child_mod_groups: vec![
            LauncherLibraryChildModGroup {
                parent_mod_key: "ModForge.A".to_string(),
                child_mod_keys: vec![
                    "ModForge.B".to_string(),
                    " ModForge.B ".to_string(),
                    "ModForge.A".to_string(),
                    "".to_string(),
                ],
            },
            LauncherLibraryChildModGroup {
                parent_mod_key: "ModForge.C".to_string(),
                child_mod_keys: vec!["ModForge.B".to_string(), "ModForge.D".to_string()],
            },
            LauncherLibraryChildModGroup {
                parent_mod_key: " ".to_string(),
                child_mod_keys: vec!["ModForge.E".to_string()],
            },
        ],
        library_folders: vec![
            LauncherLibraryFolder {
                id: "visual".to_string(),
                name: "Visual".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: None,
                mod_keys: vec![
                    "ModForge.A".to_string(),
                    " ModForge.A ".to_string(),
                    "".to_string(),
                ],
                cover_mod_keys: vec!["ModForge.A".to_string(), "ModForge.Missing".to_string()],
            },
            LauncherLibraryFolder {
                id: "extras".to_string(),
                name: "Extras".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: Some("visual".to_string()),
                mod_keys: vec!["ModForge.A".to_string(), "ModForge.C".to_string()],
                cover_mod_keys: vec!["ModForge.C".to_string()],
            },
            LauncherLibraryFolder {
                id: "cycle".to_string(),
                name: "Cycle".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: Some("cycle".to_string()),
                mod_keys: vec!["ModForge.D".to_string()],
                cover_mod_keys: Vec::new(),
            },
            LauncherLibraryFolder {
                id: "extras".to_string(),
                name: "Duplicate".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: None,
                mod_keys: vec!["ModForge.Z".to_string()],
                cover_mod_keys: Vec::new(),
            },
        ],
        custom_orders: BTreeMap::from([
            (
                "view:pack:seasonal".to_string(),
                vec![
                    "f:visual".to_string(),
                    "f:extras".to_string(),
                    "m:ModForge.A".to_string(),
                    "f:missing".to_string(),
                    "m:ModForge.A".to_string(),
                    "bad".to_string(),
                ],
            ),
            (
                "view:pack:missing".to_string(),
                vec!["m:ModForge.Z".to_string()],
            ),
            (
                "folder:visual".to_string(),
                vec![
                    "m:ModForge.A".to_string(),
                    "m:ModForge.C".to_string(),
                    "f:extras".to_string(),
                ],
            ),
            (
                "folder:missing".to_string(),
                vec!["m:ModForge.A".to_string()],
            ),
        ]),
        current_pack_id: Some("missing-pack".to_string()),
        scope_mode: LauncherLibraryScopeMode::CurrentPack,
    };
    save_library_state_at_path(&state_path, &raw_state).expect("save launcher library state");

    let reloaded = load_or_create_library_state_at_path(&state_path)
        .expect("reload normalized launcher library state");
    assert_eq!(
        reloaded.storage_folders,
        vec![
            LauncherLibraryStorageFolder {
                id: "core".to_string(),
                name: "Core".to_string(),
                mod_keys: vec!["ModForge.A".to_string()],
            },
            LauncherLibraryStorageFolder {
                id: "addons".to_string(),
                name: "Addons".to_string(),
                mod_keys: vec!["ModForge.B".to_string()],
            },
            LauncherLibraryStorageFolder {
                id: "unsorted".to_string(),
                name: "Unsorted".to_string(),
                mod_keys: Vec::new(),
            },
        ]
    );
    assert_eq!(
        reloaded.hidden_mod_keys,
        vec!["ModForge.Hidden".to_string()]
    );
    assert_eq!(
        reloaded.pack_presets,
        vec![LauncherLibraryPackPreset {
            id: "seasonal".to_string(),
            name: "Seasonal".to_string(),
            mod_keys: vec!["ModForge.A".to_string(), "ModForge.B".to_string()],
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
        }]
    );
    assert_eq!(reloaded.current_pack_id, None);
    assert_eq!(reloaded.scope_mode, LauncherLibraryScopeMode::CurrentPack);
    assert_eq!(
        reloaded.child_mod_groups,
        vec![
            LauncherLibraryChildModGroup {
                parent_mod_key: "ModForge.A".to_string(),
                child_mod_keys: vec!["ModForge.B".to_string()],
            },
            LauncherLibraryChildModGroup {
                parent_mod_key: "ModForge.C".to_string(),
                child_mod_keys: vec!["ModForge.D".to_string()],
            },
        ]
    );
    assert_eq!(
        reloaded.library_folders,
        vec![
            LauncherLibraryFolder {
                id: "visual".to_string(),
                name: "Visual".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: None,
                mod_keys: vec!["ModForge.A".to_string()],
                cover_mod_keys: vec!["ModForge.A".to_string()],
            },
            LauncherLibraryFolder {
                id: "extras".to_string(),
                name: "Extras".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: Some("visual".to_string()),
                mod_keys: vec!["ModForge.C".to_string()],
                cover_mod_keys: vec!["ModForge.C".to_string()],
            },
            LauncherLibraryFolder {
                id: "cycle".to_string(),
                name: "Cycle".to_string(),
                pack_id: None,
                hidden: false,
                parent_folder_id: None,
                mod_keys: vec!["ModForge.D".to_string()],
                cover_mod_keys: Vec::new(),
            },
        ]
    );
    assert_eq!(
        reloaded.custom_orders,
        BTreeMap::from([
            (
                "folder:visual".to_string(),
                vec!["m:ModForge.A".to_string(), "f:extras".to_string()],
            ),
            (
                "view:pack:seasonal".to_string(),
                vec!["f:visual".to_string(), "m:ModForge.A".to_string()],
            ),
        ])
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_state_reads_legacy_json_without_child_mod_groups_or_custom_orders() {
    let root = create_temp_dir("launcher-library-state-legacy-child-groups");
    let state_path = root.join("launcher").join("library.json");
    write_file(
        &state_path,
        r#"{
  "storageFolders": [{"id": "unsorted", "name": "Unsorted", "modKeys": []}],
  "hiddenModKeys": [],
  "packPresets": [],
  "currentPackId": null,
  "scopeMode": "all"
}"#,
    );

    let reloaded = load_or_create_library_state_at_path(&state_path)
        .expect("reload legacy launcher library state");

    assert_eq!(
        reloaded.child_mod_groups,
        Vec::<LauncherLibraryChildModGroup>::new()
    );
    assert_eq!(
        reloaded.library_folders,
        Vec::<LauncherLibraryFolder>::new()
    );
    assert_eq!(reloaded.custom_orders, BTreeMap::new());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_state_preserves_custom_order_roundtrip() {
    let root = create_temp_dir("launcher-library-state-custom-orders");
    let state_path = root.join("launcher").join("library.json");
    let state = LauncherLibraryState {
        storage_folders: vec![LauncherLibraryStorageFolder {
            id: "unsorted".to_string(),
            name: "Unsorted".to_string(),
            mod_keys: Vec::new(),
        }],
        hidden_mod_keys: Vec::new(),
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm".to_string(),
            mod_keys: vec!["ModForge.A".to_string()],
            folder_classification_mode: LauncherLibraryFolderClassificationMode::Global,
        }],
        child_mod_groups: Vec::new(),
        library_folders: vec![LauncherLibraryFolder {
            id: "visual".to_string(),
            name: "Visual".to_string(),
            pack_id: None,
            hidden: false,
            parent_folder_id: None,
            mod_keys: vec!["ModForge.A".to_string()],
            cover_mod_keys: Vec::new(),
        }],
        custom_orders: BTreeMap::from([
            (
                "view:pack:farm".to_string(),
                vec!["m:ModForge.A".to_string(), "f:visual".to_string()],
            ),
            (
                "folder:visual".to_string(),
                vec!["m:ModForge.A".to_string()],
            ),
        ]),
        current_pack_id: Some("farm".to_string()),
        scope_mode: LauncherLibraryScopeMode::CurrentPack,
    };

    save_library_state_at_path(&state_path, &state).expect("save launcher library state");
    let reloaded = load_or_create_library_state_at_path(&state_path)
        .expect("reload saved launcher library state");

    assert_eq!(reloaded.custom_orders, state.custom_orders);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_covers_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-library-covers");
    let covers_path = root.join("launcher").join("covers.json");
    let existing_cover_path = root.join("covers").join("visible.png");
    write_file(&existing_cover_path, "visible-cover");

    let default_state =
        load_or_create_library_covers_at_path(&covers_path).expect("load default covers");
    assert_eq!(
        default_state,
        LauncherLibraryCoversState { covers: Vec::new() }
    );
    assert!(covers_path.is_file());

    let saved_state = LauncherLibraryCoversState {
        covers: vec![LauncherLibraryCover {
            label_key: "ModForge.Visible".to_string(),
            image_path: existing_cover_path.to_string_lossy().to_string(),
        }],
    };
    write_library_covers_state(&covers_path, &saved_state);

    let reloaded =
        load_or_create_library_covers_at_path(&covers_path).expect("reload saved covers");
    assert_eq!(reloaded, saved_state);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_auto_cover_persistence_adds_missing_cover_without_overwriting_existing_cover() {
    let root = create_temp_dir("launcher-library-auto-cover");
    let covers_path = root.join("launcher").join("covers.json");
    let existing_cover_path = root.join("covers").join("visible.png");
    let missing_cover_path = root.join("covers").join("missing.png");
    write_file(&existing_cover_path, "visible-cover");
    write_file(&missing_cover_path, "missing-cover");

    write_library_covers_state(
        &covers_path,
        &LauncherLibraryCoversState {
            covers: vec![LauncherLibraryCover {
                label_key: "ModForge.Visible".to_string(),
                image_path: existing_cover_path.to_string_lossy().to_string(),
            }],
        },
    );

    let updated =
        persist_auto_library_cover_at_path(&covers_path, "ModForge.Missing", &missing_cover_path)
            .expect("persist missing auto cover");
    assert_eq!(updated.covers.len(), 2);
    assert!(
        updated
            .covers
            .iter()
            .any(|cover| cover.label_key == "ModForge.Missing"
                && cover.image_path == missing_cover_path.to_string_lossy())
    );

    let skipped =
        persist_auto_library_cover_at_path(&covers_path, "ModForge.Visible", &missing_cover_path)
            .expect("skip existing auto cover overwrite");
    assert_eq!(skipped.covers.len(), 2);
    assert!(
        skipped
            .covers
            .iter()
            .any(|cover| cover.label_key == "ModForge.Visible"
                && cover.image_path == existing_cover_path.to_string_lossy())
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_covers_prune_missing_files_on_load() {
    let root = create_temp_dir("launcher-library-covers-prune-missing");
    let covers_path = root.join("launcher").join("covers.json");
    let existing_cover_path = root.join("covers").join("visible.png");
    write_file(&existing_cover_path, "visible-cover");

    write_library_covers_state(
        &covers_path,
        &LauncherLibraryCoversState {
            covers: vec![
                LauncherLibraryCover {
                    label_key: "ModForge.Visible".to_string(),
                    image_path: existing_cover_path.to_string_lossy().to_string(),
                },
                LauncherLibraryCover {
                    label_key: "ModForge.Missing".to_string(),
                    image_path: root
                        .join("covers")
                        .join("missing.png")
                        .to_string_lossy()
                        .to_string(),
                },
            ],
        },
    );

    let reloaded =
        load_or_create_library_covers_at_path(&covers_path).expect("reload pruned launcher covers");

    assert_eq!(
        reloaded,
        LauncherLibraryCoversState {
            covers: vec![LauncherLibraryCover {
                label_key: "ModForge.Visible".to_string(),
                image_path: existing_cover_path.to_string_lossy().to_string(),
            }],
        }
    );

    let persisted = load_or_create_library_covers_at_path(&covers_path)
        .expect("reload persisted pruned covers");
    assert_eq!(persisted, reloaded);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_download_queue_create_default_and_reset_inflight_items() {
    let root = create_temp_dir("launcher-download-queue");
    let queue_path = root.join("launcher").join("downloads.json");

    let default_state =
        load_or_create_download_queue_at_path(&queue_path).expect("load default queue");
    assert_eq!(
        default_state,
        LauncherDownloadQueueState { items: Vec::new() }
    );
    assert!(queue_path.is_file());

    let persisted_state = LauncherDownloadQueueState {
        items: vec![LauncherDownloadQueueItem {
            id: "job-1".to_string(),
            mod_id: 101,
            file_id: Some(5001),
            title: "NPC Adventures".to_string(),
            version: Some("1.0.0".to_string()),
            image_url: None,
            source: "discover".to_string(),
            status: "downloading".to_string(),
            archive_path: None,
            installed_target_path: None,
            error: None,
            added_at: 1,
            completed_at: None,
            total_bytes: None,
            downloaded_bytes: None,
            bytes_per_second: None,
        }],
    };
    save_download_queue_at_path(&queue_path, &persisted_state).expect("save queue");

    let reloaded = load_or_create_download_queue_at_path(&queue_path).expect("reload queue");
    assert_eq!(reloaded.items.len(), 1);
    assert_eq!(reloaded.items[0].file_id, Some(5001));
    assert_eq!(reloaded.items[0].status, "queued");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_extracts_nexus_update_keys() {
    let root = create_temp_dir("launcher-library-update-keys");
    let project = root.join("Mods").join("ExamplePack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest_with_update_key("ModForge.ExamplePack", "Nexus:12345"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 1);
    assert_eq!(scan.mods[0].label_key, "12345");
    assert_eq!(scan.mods[0].nexus_mod_id, Some(12345));
    assert_eq!(
        scan.mods[0].mod_url.as_deref(),
        Some("https://www.nexusmods.com/stardewvalley/mods/12345")
    );
    assert_eq!(scan.mods[0].update_keys, vec!["Nexus:12345".to_string()]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_updates_cache_returns_unexpired_entry_for_matching_mods_path() {
    let root = create_temp_dir("launcher-updates-cache-hit");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 1_000);

    save_launcher_updates_cache_at_path(&cache_path, &cached, 1_000, 1_800_000)
        .expect("save launcher updates cache");

    let loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        1_799_999,
    )
    .expect("load launcher updates cache");

    assert_eq!(loaded, Some(cached));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_updates_cache_ignores_and_prunes_expired_entries() {
    let root = create_temp_dir("launcher-updates-cache-expired");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 1_000);

    save_launcher_updates_cache_at_path(&cache_path, &cached, 1_000, 1_800_000)
        .expect("save launcher updates cache");

    let loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        r"C:\Games\Stardew Valley\Mods",
        1_801_001,
    )
    .expect("load expired launcher updates cache");

    assert_eq!(loaded, None);

    let reloaded = load_cached_launcher_updates_at_path(
        &cache_path,
        r"C:\Games\Stardew Valley\Mods",
        1_801_001,
    )
    .expect("reload pruned launcher updates cache");
    assert_eq!(reloaded, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_updates_cache_invalidates_only_the_matching_mods_path() {
    let root = create_temp_dir("launcher-updates-cache-invalidate");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let first = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 1_000);
    let second = sample_launcher_updates_result(r"D:\Games\Stardew Valley\Mods", 2_000);

    save_launcher_updates_cache_at_path(&cache_path, &first, 1_000, 1_800_000)
        .expect("save first launcher updates cache entry");
    save_launcher_updates_cache_at_path(&cache_path, &second, 2_000, 1_800_000)
        .expect("save second launcher updates cache entry");

    invalidate_launcher_updates_cache_at_path(
        &cache_path,
        Some(normalized_mods_path(r"C:\Games\Stardew Valley\Mods").as_str()),
    )
    .expect("invalidate launcher updates cache");

    let first_loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        50_000,
    )
    .expect("load invalidated launcher updates cache");
    let second_loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        &normalized_mods_path(r"D:\Games\Stardew Valley\Mods"),
        50_000,
    )
    .expect("load remaining launcher updates cache");

    assert_eq!(first_loaded, None);
    assert_eq!(second_loaded, Some(second));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_updates_cache_preserves_incomplete_entries_for_incremental_progress() {
    let root = create_temp_dir("launcher-updates-cache-incomplete");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let mut cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 1_000);
    cached.is_complete = false;

    save_launcher_updates_cache_at_path(&cache_path, &cached, 1_000, 1_800_000)
        .expect("save incomplete launcher updates cache");

    let loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        60_000,
    )
    .expect("load incomplete launcher updates cache");

    assert_eq!(loaded, Some(cached));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_updates_cache_clears_interrupted_check_markers_without_discarding_last_success() {
    let root = create_temp_dir("launcher-updates-cache-interrupted");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 60_000);

    save_launcher_updates_cache_at_path(&cache_path, &cached, 60_000, 1_800_000)
        .expect("save launcher updates cache");
    mark_launcher_updates_check_in_progress_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        120_000,
    )
    .expect("mark launcher updates check in progress");

    clear_launcher_updates_check_in_progress_at_path(
        &cache_path,
        Some(normalized_mods_path(r"C:\Games\Stardew Valley\Mods").as_str()),
    )
    .expect("clear launcher updates check in progress");

    let loaded = load_cached_launcher_updates_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        600_000,
    )
    .expect("load cached launcher updates");

    assert_eq!(loaded, Some(cached));

    let serialized = fs::read_to_string(&cache_path).expect("read launcher updates cache");
    assert!(!serialized.contains("inProgress"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_launcher_updates_cache_reports_fresh_entry_and_in_progress_state() {
    let root = create_temp_dir("launcher-updates-cache-inspect-fresh");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 60_000);

    save_launcher_updates_cache_at_path(&cache_path, &cached, 60_000, 1_800_000)
        .expect("save launcher updates cache");
    mark_launcher_updates_check_in_progress_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        120_000,
    )
    .expect("mark launcher updates check in progress");

    let inspection = inspect_launcher_updates_cache_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        600_000,
    )
    .expect("inspect launcher updates cache");

    assert_eq!(
        inspection.cache_key,
        normalize_launcher_updates_cache_key(&normalized_mods_path(
            r"C:\Games\Stardew Valley\Mods"
        ))
    );
    assert_eq!(
        inspection.entry_state,
        LauncherUpdatesCacheEntryState::Fresh
    );
    assert_eq!(inspection.checked_at_ms, Some(60_000));
    assert_eq!(inspection.expires_at_ms, Some(1_860_000));
    assert_eq!(inspection.is_complete, Some(true));
    assert_eq!(inspection.ttl_remaining_ms, Some(1_260_000));
    assert_eq!(inspection.expired_by_ms, None);
    assert_eq!(inspection.in_progress_active_count, 1);
    assert_eq!(inspection.in_progress_started_at_ms, Some(120_000));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_launcher_updates_cache_reports_expired_entry_state() {
    let root = create_temp_dir("launcher-updates-cache-inspect-expired");
    let cache_path = root.join("launcher").join("updates-cache.json");
    let cached = sample_launcher_updates_result(r"C:\Games\Stardew Valley\Mods", 1_000);

    save_launcher_updates_cache_at_path(&cache_path, &cached, 1_000, 1_800_000)
        .expect("save launcher updates cache");

    let inspection = inspect_launcher_updates_cache_at_path(
        &cache_path,
        &normalized_mods_path(r"C:\Games\Stardew Valley\Mods"),
        1_900_000,
    )
    .expect("inspect expired launcher updates cache");

    assert_eq!(
        inspection.entry_state,
        LauncherUpdatesCacheEntryState::Expired
    );
    assert_eq!(inspection.checked_at_ms, Some(1_000));
    assert_eq!(inspection.expires_at_ms, Some(1_801_000));
    assert_eq!(inspection.is_complete, Some(true));
    assert_eq!(inspection.ttl_remaining_ms, None);
    assert_eq!(inspection.expired_by_ms, Some(99_000));
    assert_eq!(inspection.in_progress_active_count, 0);
    assert_eq!(inspection.in_progress_started_at_ms, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_keeps_unique_id_as_label_key_without_nexus_id() {
    let root = create_temp_dir("launcher-library-unique-key");
    let project = root.join("Mods").join("ExamplePack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 1);
    assert_eq!(scan.mods[0].label_key, "ModForge.ExamplePack");
    assert_eq!(scan.mods[0].nexus_mod_id, None);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn clear_launcher_image_cache_dir_removes_cached_files() {
    let root = create_temp_dir("launcher-image-cache-clear");
    let cache_dir = root.join("launcher").join("images");
    write_file(&cache_dir.join("cover.webp"), "cached");

    clear_launcher_image_cache_dir(&cache_dir).expect("clear launcher image cache");

    assert!(!cache_dir.exists());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_catalog_graphql_payload_maps_query_sort_and_page() {
    let payload = build_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: Some("tractor".to_string()),
        title_query: None,
        description_query: None,
        author_query: None,
        uploader_query: None,
        page: Some(2),
        page_size: Some(20),
        time_range: None,
        sort: Some("updated".to_string()),
        ascending: Some(false),
        category: None,
        language: None,
        tags_include: None,
        tags_exclude: None,
        include_adult: Some(false),
        min_file_size: None,
        max_file_size: None,
        min_downloads: None,
        max_downloads: None,
        min_endorsements: None,
        max_endorsements: None,
    })
    .expect("build catalog graphql payload");

    assert_eq!(payload["operationName"], "CatalogMods");
    assert_eq!(payload["variables"]["offset"], 20);
    assert_eq!(payload["variables"]["count"], 20);
    assert_eq!(
        payload["variables"]["filter"]["gameDomainName"][0]["value"],
        "stardewvalley"
    );
    assert_eq!(
        payload["variables"]["filter"]["gameDomainName"][0]["op"],
        "EQUALS"
    );
    assert_eq!(
        payload["variables"]["filter"]["name"][0]["value"],
        "tractor"
    );
    assert_eq!(payload["variables"]["filter"]["name"][0]["op"], "WILDCARD");
    assert_eq!(
        payload["variables"]["sort"][0]["updatedAt"]["direction"],
        "DESC"
    );

    let query = payload["query"].as_str().expect("graphql query string");
    assert!(query.contains("query CatalogMods"));
    assert!(query.contains("mods(filter: $filter, sort: $sort, offset: $offset, count: $count)"));
}

#[test]
fn build_public_catalog_graphql_payload_matches_browser_mod_listing_shape() {
    let payload = build_public_catalog_graphql_payload(&SearchLauncherCatalogRequest {
        query: Some("tractor".to_string()),
        title_query: None,
        description_query: Some("pelican".to_string()),
        author_query: Some("Pathoschild".to_string()),
        uploader_query: Some("Pathoschild".to_string()),
        page: Some(2),
        page_size: Some(20),
        time_range: None,
        sort: Some("updated".to_string()),
        ascending: Some(false),
        category: Some("Gameplay Mechanics".to_string()),
        language: Some("English".to_string()),
        tags_include: Some("smapi, tractor".to_string()),
        tags_exclude: Some("nsfw".to_string()),
        include_adult: Some(false),
        min_file_size: Some(1024),
        max_file_size: Some(4096),
        min_downloads: Some(100),
        max_downloads: Some(500),
        min_endorsements: Some(10),
        max_endorsements: Some(20),
    })
    .expect("build public catalog graphql payload");

    assert_eq!(payload["operationName"], "ModsListing");
    assert_eq!(payload["variables"]["count"], 20);
    assert_eq!(payload["variables"]["offset"], 20);
    assert_eq!(
        payload["variables"]["facets"]["categoryName"],
        json!(["Gameplay Mechanics"])
    );
    assert_eq!(
        payload["variables"]["facets"]["languageName"],
        json!(["English"])
    );
    assert_eq!(
        payload["variables"]["facets"]["tag"],
        json!(["smapi", "tractor"])
    );
    assert_eq!(
        payload["variables"]["filter"]["adultContent"][0]["op"],
        "EQUALS"
    );
    assert_eq!(
        payload["variables"]["filter"]["adultContent"][0]["value"],
        false
    );
    assert_eq!(
        payload["variables"]["filter"]["gameDomainName"][0]["value"],
        "stardewvalley"
    );
    assert_eq!(
        payload["variables"]["filter"]["name"][0]["value"],
        "tractor"
    );
    assert_eq!(
        payload["variables"]["filter"]["description"][0]["value"],
        "pelican"
    );
    assert_eq!(
        payload["variables"]["filter"]["description"][0]["op"],
        "MATCHES"
    );
    assert_eq!(
        payload["variables"]["filter"]["author"][0]["value"],
        "Pathoschild"
    );
    assert_eq!(
        payload["variables"]["filter"]["uploader"][0]["value"],
        "Pathoschild"
    );
    assert_eq!(payload["variables"]["filter"]["fileSize"][0]["op"], "GTE");
    assert_eq!(payload["variables"]["filter"]["fileSize"][1]["op"], "LTE");
    assert_eq!(payload["variables"]["filter"]["downloads"][0]["value"], 100);
    assert_eq!(
        payload["variables"]["filter"]["endorsements"][1]["value"],
        20
    );
    assert_eq!(
        payload["variables"]["postFilter"]["tag"][0]["value"],
        "nsfw"
    );
    assert_eq!(
        payload["variables"]["sort"]["updatedAt"]["direction"],
        "DESC"
    );

    let query = payload["query"]
        .as_str()
        .expect("public graphql query string");
    assert!(query.contains("query ModsListing"));
    assert!(query.contains("fragment ModTileFragment"));
    assert!(query.contains("thumbnailUrl"));
}

#[test]
fn parse_catalog_graphql_response_builds_catalog_page_result() {
    let payload = json!({
        "data": {
            "mods": {
                "nodes": [
                    {
                        "modId": 101,
                        "name": "Tractor Mod",
                        "summary": "Drive around Pelican Town.",
                        "pictureUrl": "https://static.nexusmods.com/tractor.png",
                        "uploader": {
                            "name": "Pathoschild"
                        }
                    },
                    {
                        "modId": 202,
                        "name": "Lookup Anything",
                        "summary": null,
                        "pictureUrl": null,
                        "uploader": null
                    }
                ],
                "totalCount": 45,
                "facetsData": {
                    "categoryName": {
                        "Gameplay Mechanics": 2800,
                        "Maps": 1244
                    },
                    "languageName": {
                        "English": 16098
                    },
                    "tag": {
                        "SMAPI": 18839,
                        "Translation": 7866
                    }
                }
            }
        }
    });

    let page =
        parse_catalog_graphql_response(&payload, 2, 20).expect("parse catalog graphql response");

    assert_eq!(page.page, 2);
    assert_eq!(page.page_size, 20);
    assert_eq!(page.total_count, 45);
    assert!(page.has_more);
    assert_eq!(page.facets.categories[0].name, "Gameplay Mechanics");
    assert_eq!(page.facets.languages[0].name, "English");
    assert_eq!(page.facets.tags[0].name, "SMAPI");
    assert_eq!(page.results.len(), 2);
    assert_eq!(page.results[0].mod_id, 101);
    assert_eq!(page.results[0].title, "Tractor Mod");
    assert_eq!(page.results[0].author.as_deref(), Some("Pathoschild"));
    assert_eq!(
        page.results[0].mod_url,
        "https://www.nexusmods.com/stardewvalley/mods/101"
    );
    assert_eq!(page.results[1].author, None);
}

#[test]
fn parse_catalog_graphql_response_falls_back_to_public_thumbnail_url() {
    let payload = json!({
        "data": {
            "mods": {
                "nodes": [
                    {
                        "modId": 101,
                        "name": "Tractor Mod",
                        "summary": "Drive around Pelican Town.",
                        "thumbnailUrl": "https://staticdelivery.nexusmods.com/tractor.png",
                        "uploader": {
                            "name": "Pathoschild"
                        }
                    }
                ],
                "total": 1
            }
        }
    });

    let page = parse_catalog_graphql_response(&payload, 1, 20)
        .expect("parse public catalog graphql response");

    assert_eq!(page.results.len(), 1);
    assert_eq!(
        page.results[0].image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/tractor.png")
    );
}
#[test]
fn enrich_remote_mod_detail_with_gallery_images_fills_missing_cover_from_images_tab() {
    let detail = RemoteModDetail {
        mod_id: 20054,
        name: Some("Vanilla Plus Professions".to_string()),
        author: Some("KediDili".to_string()),
        summary: Some("Professions expansion.".to_string()),
        description: None,
        version: Some("1.1.1".to_string()),
        mod_url: "https://www.nexusmods.com/stardewvalley/mods/20054".to_string(),
        image_url: None,
        gallery_images: Vec::new(),
        updated_at: None,
        file_size: None,
        ..RemoteModDetail::empty(0, String::new())
    };
    let images = vec![
        "https://staticdelivery.nexusmods.com/mods/1303/images/20054/20054-1716579111-984463733.png"
            .to_string(),
        "https://staticdelivery.nexusmods.com/mods/1303/images/20054/20054-1724525958-1378190888.png"
            .to_string(),
    ];

    let enriched = enrich_remote_mod_detail_with_gallery_images(detail, images);

    assert_eq!(
        enriched.image_url.as_deref(),
        Some(
            "https://staticdelivery.nexusmods.com/mods/1303/images/20054/20054-1716579111-984463733.png"
        )
    );
    assert_eq!(enriched.gallery_images.len(), 2);
}

#[test]
fn parse_public_mod_detail_graphql_response_extracts_author_version_and_description() {
    let payload = json!({
        "data": {
            "mod": {
                "modId": 44722,
                "name": "Joja Civic Center",
                "summary": "Short summary.",
                "description": "<p>Full <strong>description</strong> for the mod.</p>",
                "version": "1.0.0",
                "pictureUrl": "https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-cover.png",
                "thumbnailUrl": "https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png",
                "author": "blue704",
                "uploader": {
                    "name": "blue704"
                }
            }
        }
    });

    let detail = parse_public_mod_detail_graphql_response(&payload, 44722)
        .expect("parse public mod detail graphql");

    assert_eq!(detail.mod_id, 44722);
    assert_eq!(detail.name.as_deref(), Some("Joja Civic Center"));
    assert_eq!(detail.author.as_deref(), Some("blue704"));
    assert_eq!(detail.summary.as_deref(), Some("Short summary."));
    assert_eq!(
        detail.description.as_deref(),
        Some("<p>Full <strong>description</strong> for the mod.</p>")
    );
    assert_eq!(detail.version.as_deref(), Some("1.0.0"));
    assert_eq!(
        detail.image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-cover.png")
    );
}
#[test]
fn build_update_batch_graphql_payload_uses_legacy_mods_by_domain() {
    let payload = build_update_batch_graphql_payload(&[101, 202])
        .expect("build update batch graphql payload");

    assert_eq!(payload["operationName"], "LauncherUpdateBatch");
    assert_eq!(
        payload["variables"]["ids"][0]["gameDomain"],
        "stardewvalley"
    );
    assert_eq!(payload["variables"]["ids"][0]["modId"], 101);
    assert_eq!(payload["variables"]["ids"][1]["modId"], 202);

    let query = payload["query"].as_str().expect("graphql query string");
    assert!(query.contains("query LauncherUpdateBatch"));
    assert!(query.contains("legacyModsByDomain"));
}

#[test]
fn build_smapi_update_payload_uses_unique_ids_and_update_keys() {
    let payload = build_smapi_update_payload(&[
        UpdateCheckCandidate {
            mod_id: 541,
            unique_id: Some("Pathoschild.LookupAnything".to_string()),
            name: "Lookup Anything".to_string(),
            current_version: "1.43.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
            update_keys: vec!["Nexus:541".to_string()],
        },
        UpdateCheckCandidate {
            mod_id: 999,
            unique_id: None,
            name: "Missing Unique ID".to_string(),
            current_version: "1.0.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Missing Unique ID".to_string(),
            update_keys: vec!["Nexus:999".to_string()],
        },
    ]);

    assert_eq!(payload["ApiVersion"], "4.5.2");
    assert_eq!(payload["GameVersion"], "1.6.14");
    assert_eq!(payload["Platform"], "Windows");
    assert_eq!(payload["IncludeExtendedMetadata"], true);
    assert_eq!(payload["Mods"].as_array().map(Vec::len), Some(1));
    assert_eq!(payload["Mods"][0]["ID"], "Pathoschild.LookupAnything");
    assert_eq!(payload["Mods"][0]["Version"], "1.43.0");
    assert_eq!(payload["Mods"][0]["UpdateKeys"], json!(["Nexus:541"]));
}

#[test]
fn build_smapi_update_payload_uses_detected_versions() {
    let payload = build_smapi_update_payload_with_versions(
        &[UpdateCheckCandidate {
            mod_id: 541,
            unique_id: Some("Pathoschild.LookupAnything".to_string()),
            name: "Lookup Anything".to_string(),
            current_version: "1.43.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
            update_keys: vec!["Nexus:541".to_string()],
        }],
        &SmapiRuntimeVersions {
            api_version: "4.2.1".to_string(),
            game_version: "1.6.15".to_string(),
            platform: "Windows".to_string(),
        },
    );

    assert_eq!(payload["ApiVersion"], "4.2.1");
    assert_eq!(payload["GameVersion"], "1.6.15");
    assert_eq!(payload["Platform"], "Windows");
}

#[test]
fn resolve_smapi_runtime_versions_prefers_detected_versions() {
    let root = create_temp_dir("launcher-smapi-version-detect");
    let smapi_dll = root.join("StardewModdingAPI.dll");
    let game_dll = root.join("Stardew Valley.dll");
    write_file(&smapi_dll, "smapi");
    write_file(&game_dll, "game");

    let versions = resolve_smapi_runtime_versions_with_reader(Some(root.as_path()), |path| {
        if path == smapi_dll.as_path() {
            return Some("4.2.1.7".to_string());
        }
        if path == game_dll.as_path() {
            return Some("1.6.15-gog".to_string());
        }
        None
    });

    assert_eq!(
        versions,
        SmapiRuntimeVersions {
            api_version: "4.2.1".to_string(),
            game_version: "1.6.15".to_string(),
            platform: "Windows".to_string(),
        }
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn resolve_smapi_runtime_versions_falls_back_to_defaults() {
    let versions = resolve_smapi_runtime_versions_with_reader(None, |_| Some("9.9.9".to_string()));

    assert_eq!(
        versions,
        SmapiRuntimeVersions {
            api_version: "4.5.2".to_string(),
            game_version: "1.6.14".to_string(),
            platform: "Windows".to_string(),
        }
    );
}

#[test]
fn dedupe_update_candidates_by_mod_id_keeps_first_candidate_per_mod() {
    let deduped = dedupe_update_candidates_by_mod_id(&[
        UpdateCheckCandidate {
            mod_id: 4,
            unique_id: Some("Pathoschild.Automate".to_string()),
            name: "Automate".to_string(),
            current_version: "2.0.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Automate".to_string(),
            update_keys: vec!["Nexus:4".to_string()],
        },
        UpdateCheckCandidate {
            mod_id: 4,
            unique_id: Some("Pathoschild.Automate.Copy".to_string()),
            name: "Automate Copy".to_string(),
            current_version: "2.0.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Automate Copy".to_string(),
            update_keys: vec!["Nexus:4".to_string()],
        },
        UpdateCheckCandidate {
            mod_id: 93,
            unique_id: Some("Pathoschild.ChestsAnywhere".to_string()),
            name: "Chests Anywhere".to_string(),
            current_version: "1.0.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Chests Anywhere".to_string(),
            update_keys: vec!["Nexus:93".to_string()],
        },
    ]);

    assert_eq!(deduped.len(), 2);
    assert_eq!(deduped[0].mod_id, 4);
    assert_eq!(
        deduped[0].absolute_path,
        r"E:\Games\Stardew Valley\Mods\Automate"
    );
    assert_eq!(deduped[1].mod_id, 93);
}

#[test]
fn build_launcher_update_summary_uses_remote_detail_fields_without_file_metadata() {
    let summary = build_launcher_update_summary(
        &UpdateCheckCandidate {
            mod_id: 541,
            unique_id: Some("Pathoschild.LookupAnything".to_string()),
            name: "Lookup Anything".to_string(),
            current_version: "1.43.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
            update_keys: vec!["Nexus:541".to_string()],
        },
        &RemoteModDetail {
            mod_id: 541,
            name: Some("Lookup Anything".to_string()),
            author: Some("Pathoschild".to_string()),
            summary: Some("Inspect anything.".to_string()),
            description: None,
            version: Some("1.44.0".to_string()),
            mod_url: "https://www.nexusmods.com/stardewvalley/mods/541".to_string(),
            image_url: Some(
                "https://staticdelivery.nexusmods.com/mods/1303/images/541/541-cover.png"
                    .to_string(),
            ),
            gallery_images: Vec::new(),
            updated_at: Some("2026-04-11T08:00:00.000Z".to_string()),
            file_size: Some(13_107_200),
            ..RemoteModDetail::empty(0, String::new())
        },
    )
    .expect("remote detail should produce update summary");

    assert_eq!(summary.mod_id, 541);
    assert_eq!(summary.author.as_deref(), Some("Pathoschild"));
    assert_eq!(
        summary.updated_at.as_deref(),
        Some("2026-04-11T08:00:00.000Z")
    );
    assert_eq!(summary.file_size, Some(13_107_200));
    assert_eq!(summary.latest_version, "1.44.0");
}

#[test]
fn parse_smapi_update_response_extracts_versions_by_candidate_order() {
    let payload = json!([
        {
            "Metadata": {
                "Main": {
                    "Name": "Lookup Anything",
                    "Author": "Pathoschild",
                    "Description": "Inspect anything.",
                    "Version": "1.44.0",
                    "URL": "https://www.nexusmods.com/stardewvalley/mods/541",
                    "ImageUrl": "https://staticdelivery.nexusmods.com/mods/1303/images/541/541-cover.png"
                }
            }
        },
        {
            "Metadata": {
                "Main": {
                    "Name": "Tractor Mod",
                    "Version": "5.0.0"
                }
            }
        }
    ]);

    let details = parse_smapi_update_response(
        &payload,
        &[
            UpdateCheckCandidate {
                mod_id: 541,
                unique_id: Some("Pathoschild.LookupAnything".to_string()),
                name: "Lookup Anything".to_string(),
                current_version: "1.43.0".to_string(),
                absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
                update_keys: vec!["Nexus:541".to_string()],
            },
            UpdateCheckCandidate {
                mod_id: 1401,
                unique_id: Some("Pathoschild.TractorMod".to_string()),
                name: "Tractor Mod".to_string(),
                current_version: "4.9.9".to_string(),
                absolute_path: r"E:\Games\Stardew Valley\Mods\Tractor Mod".to_string(),
                update_keys: vec!["Nexus:1401".to_string()],
            },
        ],
    )
    .expect("parse smapi update response");

    assert_eq!(details.len(), 2);
    assert_eq!(details[&541].name.as_deref(), Some("Lookup Anything"));
    assert_eq!(details[&541].author.as_deref(), Some("Pathoschild"));
    assert_eq!(details[&541].summary.as_deref(), Some("Inspect anything."));
    assert_eq!(details[&541].version.as_deref(), Some("1.44.0"));
    assert_eq!(
        details[&541].image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/mods/1303/images/541/541-cover.png")
    );
    assert_eq!(details[&1401].name.as_deref(), Some("Tractor Mod"));
    assert_eq!(details[&1401].version.as_deref(), Some("5.0.0"));
    assert_eq!(
        details[&1401].mod_url,
        "https://www.nexusmods.com/stardewvalley/mods/1401"
    );
}

#[test]
fn parse_smapi_update_response_skips_entries_without_versions() {
    let payload = json!([
        {
            "Metadata": {
                "Main": {
                    "Name": "Lookup Anything"
                }
            }
        }
    ]);

    let details = parse_smapi_update_response(
        &payload,
        &[UpdateCheckCandidate {
            mod_id: 541,
            unique_id: Some("Pathoschild.LookupAnything".to_string()),
            name: "Lookup Anything".to_string(),
            current_version: "1.43.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
            update_keys: vec!["Nexus:541".to_string()],
        }],
    )
    .expect("parse smapi update response");

    assert!(details.is_empty());
}

#[test]
fn parse_smapi_update_response_keeps_nexus_page_url_for_external_links() {
    let payload = json!([
        {
            "Metadata": {
                "Main": {
                    "Name": "Lookup Anything",
                    "Version": "1.44.0",
                    "URL": "https://smapi.io/mods"
                }
            }
        }
    ]);

    let details = parse_smapi_update_response(
        &payload,
        &[UpdateCheckCandidate {
            mod_id: 541,
            unique_id: Some("Pathoschild.LookupAnything".to_string()),
            name: "Lookup Anything".to_string(),
            current_version: "1.43.0".to_string(),
            absolute_path: r"E:\Games\Stardew Valley\Mods\Lookup Anything".to_string(),
            update_keys: vec!["Nexus:541".to_string()],
        }],
    )
    .expect("parse smapi update response");

    assert_eq!(
        details[&541].mod_url,
        "https://www.nexusmods.com/stardewvalley/mods/541"
    );
}

#[test]
fn parse_update_batch_graphql_response_extracts_versions_by_mod_id() {
    let payload = json!({
        "data": {
            "legacyModsByDomain": {
                "nodes": [
                    {
                        "modId": 101,
                        "name": "Tractor Mod",
                        "version": "4.0.1",
                        "pictureUrl": "https://static.nexusmods.com/tractor.png"
                    },
                    {
                        "modId": 202,
                        "name": "Lookup Anything",
                        "version": "1.43.0",
                        "pictureUrl": null
                    }
                ]
            }
        }
    });

    let details =
        parse_update_batch_graphql_response(&payload).expect("parse launcher update batch payload");

    assert_eq!(details.len(), 2);
    assert_eq!(details[0].mod_id, 101);
    assert_eq!(details[0].name.as_deref(), Some("Tractor Mod"));
    assert_eq!(details[0].version.as_deref(), Some("4.0.1"));
    assert_eq!(
        details[0].mod_url,
        "https://www.nexusmods.com/stardewvalley/mods/101"
    );
    assert_eq!(details[1].image_url, None);
}

#[test]
fn finalize_remote_mod_details_batch_keeps_resolved_candidates_even_when_some_fail() {
    let mut details = std::collections::HashMap::new();
    details.insert(
        101,
        RemoteModDetail {
            mod_id: 101,
            name: Some("Tractor Mod".to_string()),
            author: Some("Pathoschild".to_string()),
            summary: None,
            description: None,
            version: Some("4.0.1".to_string()),
            mod_url: "https://www.nexusmods.com/stardewvalley/mods/101".to_string(),
            image_url: None,
            gallery_images: Vec::new(),
            updated_at: None,
            file_size: None,
            ..RemoteModDetail::empty(0, String::new())
        },
    );

    let finalized = finalize_remote_mod_details_batch(
        details,
        vec![202],
        vec!["SMAPI timeout".to_string(), "HTML 503".to_string()],
    )
    .expect("partial remote detail failures should not abort the batch");

    assert_eq!(finalized.len(), 1);
    assert_eq!(
        finalized
            .get(&101)
            .and_then(|detail| detail.name.as_deref()),
        Some("Tractor Mod")
    );
}

#[test]
fn can_use_nexus_graphql_requires_api_key() {
    assert!(!can_use_nexus_graphql(&NexusRequestContext::default()));

    assert!(can_use_nexus_graphql(&NexusRequestContext::new(Some(
        "nexus-key".to_string()
    ))));
}

#[test]
fn set_launcher_mod_enabled_renames_dot_prefixed_folder() {
    let root = create_temp_dir("launcher-enable-mod");
    let project = root.join("Mods").join(".ExamplePack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );

    let result = set_launcher_mod_enabled_blocking(SetLauncherModEnabledRequest {
        mod_path: project.to_string_lossy().to_string(),
        enabled: true,
    })
    .expect("enable mod");

    assert!(result.enabled);
    assert!(root.join("Mods").join("ExamplePack").is_dir());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_lists_installed_mods() {
    let root = create_temp_dir("launcher-library-scan");
    let project = root.join("Mods").join("ExamplePack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 1);
    assert_eq!(scan.mods[0].name, "Example Mod");
    assert_eq!(
        scan.mods[0].unique_id.as_deref(),
        Some("ModForge.ExamplePack")
    );
    assert!(scan.mods[0].enabled);
    assert!(scan.mods[0].missing_required_dependencies.is_empty());

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_finds_mod_with_chinese_folder_name() {
    let root = create_temp_dir("launcher-library-chinese-folder");
    let project = root.join("Mods").join("中文模组");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.ChinesePack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library with chinese folder");
    assert_eq!(scan.mods.len(), 1);
    assert_eq!(scan.mods[0].name, "Example Mod");
    assert_eq!(scan.mods[0].folder_name, "中文模组");
    assert!(scan.mods[0].absolute_path.contains("中文模组"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_reads_gbk_manifest() {
    let root = create_temp_dir("launcher-library-gbk-manifest");
    let project = root.join("Mods").join("GBKPack");
    let manifest = r#"{
  "Name": "中文模组",
  "Author": "作者",
  "Version": "1.0.0",
  "UniqueID": "ModForge.GBKPack"
}"#;
    let (encoded, _, had_errors) = encoding_rs::GB18030.encode(manifest);
    assert!(!had_errors);
    write_bytes_file(&project.join("manifest.json"), &encoded.into_owned());

    let scan = scan_library_at_path(&root).expect("scan launcher library with gbk manifest");
    assert_eq!(scan.mods.len(), 1);
    assert_eq!(scan.mods[0].name, "中文模组");
    assert_eq!(scan.mods[0].author.as_deref(), Some("作者"));
    assert_eq!(scan.mods[0].unique_id.as_deref(), Some("ModForge.GBKPack"));

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_marks_dot_prefixed_mod_folder_as_disabled() {
    let root = create_temp_dir("launcher-library-dot-disable");
    let project = root.join("Mods").join(".DisabledPack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.DisabledPack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    assert_eq!(scan.mods.len(), 1);
    assert!(!scan.mods[0].enabled);
    assert_eq!(scan.mods[0].folder_name, ".DisabledPack");

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn scan_library_marks_missing_required_dependencies() {
    let root = create_temp_dir("launcher-library-required-dependency");
    let consumer = root.join("Mods").join("ConsumerPack");
    let disabled_provider = root.join("Mods").join(".ProviderPack");

    write_file(
        &consumer.join("manifest.json"),
        &sample_manifest_with_required_dependency("ModForge.ConsumerPack", "ModForge.ProviderPack"),
    );
    write_file(
        &disabled_provider.join("manifest.json"),
        &sample_manifest("ModForge.ProviderPack"),
    );

    let scan = scan_library_at_path(&root).expect("scan launcher library");
    let consumer_summary = scan
        .mods
        .iter()
        .find(|item| item.unique_id.as_deref() == Some("ModForge.ConsumerPack"))
        .expect("consumer summary");
    assert_eq!(
        consumer_summary.missing_required_dependencies,
        vec!["ModForge.ProviderPack".to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launch_game_prefers_smapi_executable_when_present() {
    let root = create_temp_dir("launcher-launch-smapi");
    let smapi_executable = root.join("StardewModdingAPI.exe");
    let base_executable = root.join("Stardew Valley.exe");
    write_file(&smapi_executable, "smapi");
    write_file(&base_executable, "base");

    let settings = LauncherSettings {
        game_path: Some(root.to_string_lossy().to_string()),
        ..LauncherSettings::default()
    };
    let mut launched_paths = Vec::new();

    let result = launch_game_with_runner(&settings, |path| {
        launched_paths.push(path.to_path_buf());
        Ok(())
    })
    .expect("launch game");

    assert_eq!(result.target, LauncherGameLaunchTarget::Smapi);
    assert_eq!(launched_paths, vec![smapi_executable]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launch_game_falls_back_to_base_executable_when_smapi_is_missing() {
    let root = create_temp_dir("launcher-launch-base");
    let base_executable = root.join("Stardew Valley.exe");
    write_file(&base_executable, "base");

    let settings = LauncherSettings {
        game_path: Some(root.to_string_lossy().to_string()),
        ..LauncherSettings::default()
    };
    let mut launched_paths = Vec::new();

    let result = launch_game_with_runner(&settings, |path| {
        launched_paths.push(path.to_path_buf());
        Ok(())
    })
    .expect("launch game");

    assert_eq!(result.target, LauncherGameLaunchTarget::StardewValley);
    assert_eq!(launched_paths, vec![base_executable]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launch_game_returns_typed_error_when_game_path_is_missing() {
    let settings = LauncherSettings::default();
    let error = launch_game_with_runner(&settings, |_| Ok(())).expect_err("missing game path");

    assert!(
        error.to_string().contains("game path"),
        "expected 'game path' in error message, got {}",
        error
    );
}

#[test]
fn launch_game_returns_typed_error_when_no_executable_exists() {
    let root = create_temp_dir("launcher-launch-missing-exe");
    let settings = LauncherSettings {
        game_path: Some(root.to_string_lossy().to_string()),
        ..LauncherSettings::default()
    };

    let error = launch_game_with_runner(&settings, |_| Ok(())).expect_err("missing executable");

    assert!(
        error.to_string().contains("StardewModdingAPI.exe"),
        "expected SMAPI path in error message, got {}",
        error
    );
    assert!(
        error.to_string().contains("Stardew Valley.exe"),
        "expected base executable path in error message, got {}",
        error
    );

    fs::remove_dir_all(root).expect("cleanup");
}

fn create_zip_from_directory(source_dir: &Path, archive_path: &Path) {
    let archive_file = fs::File::create(archive_path).expect("create archive file");
    let mut archive = ZipWriter::new(archive_file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

    for relative_path in collect_relative_files(source_dir) {
        let source_path = source_dir.join(&relative_path);
        let archive_entry = relative_path.to_string_lossy().replace('\\', "/");
        archive
            .start_file(archive_entry, options)
            .expect("start archive file");
        archive
            .write_all(&fs::read(&source_path).expect("read source file"))
            .expect("write archive file");
    }

    archive.finish().expect("finish archive");
}

fn collect_relative_files(root: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    collect_relative_files_recursive(root, root, &mut files);
    files.sort();
    files
}

fn collect_relative_files_recursive(
    root: &Path,
    current_dir: &Path,
    output: &mut Vec<std::path::PathBuf>,
) {
    for entry in fs::read_dir(current_dir).expect("read directory") {
        let entry = entry.expect("directory entry");
        let entry_path = entry.path();
        if entry_path.is_dir() {
            collect_relative_files_recursive(root, &entry_path, output);
            continue;
        }
        output.push(
            entry_path
                .strip_prefix(root)
                .expect("relative path")
                .to_path_buf(),
        );
    }
}

fn collect_paths(nodes: &[LauncherArchiveTreeNode], output: &mut Vec<String>) {
    for node in nodes {
        output.push(node.path.clone());
        collect_paths(&node.children, output);
    }
}

#[test]
fn inspect_archive_detects_manifest_roots_and_builds_tree() {
    let root = create_temp_dir("launcher-inspect-archive");
    let source = root.join("source");
    write_file(
        &source.join("ModA").join("manifest.json"),
        &sample_manifest("ModForge.ModA"),
    );
    write_file(
        &source.join("ModA").join("assets").join("icon.png"),
        "png-bytes",
    );
    write_file(
        &source.join("Nested").join("ModB").join("manifest.json"),
        &sample_manifest("ModForge.ModB"),
    );
    write_file(&source.join("readme.txt"), "hello");

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect archive");
    assert_eq!(result.archive_file_name, "bundle.zip");
    assert_eq!(result.total_files, 4);
    assert_eq!(
        result
            .mod_roots
            .iter()
            .map(|root| root.path.clone())
            .collect::<Vec<_>>(),
        vec!["ModA".to_string(), "Nested/ModB".to_string()]
    );

    let mut paths = Vec::new();
    collect_paths(&result.tree, &mut paths);
    assert!(paths.contains(&"ModA".to_string()));
    assert!(paths.contains(&"ModA/manifest.json".to_string()));
    assert!(paths.contains(&"ModA/assets/icon.png".to_string()));
    assert!(paths.contains(&"Nested/ModB".to_string()));
    assert!(paths.contains(&"Nested/ModB/manifest.json".to_string()));

    let mod_manifest = result
        .tree
        .iter()
        .find(|node| node.path == "ModA")
        .and_then(|node| {
            node.children
                .iter()
                .find(|child| child.path == "ModA/manifest.json")
        })
        .expect("manifest entry");
    assert_eq!(
        mod_manifest.size_bytes,
        Some(sample_manifest("ModForge.ModA").len() as u64)
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_detects_manifest_at_archive_root() {
    let root = create_temp_dir("launcher-inspect-archive-root");
    let source = root.join("source");
    write_file(
        &source.join("manifest.json"),
        &sample_manifest("ModForge.RootManifest"),
    );
    write_file(&source.join("content.json"), "{}");

    let archive_path = root.join("root.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect archive");
    assert_eq!(
        result
            .mod_roots
            .iter()
            .map(|root| root.path.clone())
            .collect::<Vec<_>>(),
        vec![".".to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn install_archive_installs_zip_bundle_and_reports_backup_details() {
    let root = create_temp_dir("launcher-install-archive");
    let source = root.join("source");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    write_file(
        &source.join("[CP] Example Pack").join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );
    write_file(
        &source.join("[CP] Example Pack").join("content.json"),
        r#"{"Format":"2.0.0","Changes":[]}"#,
    );

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install archive");

    assert_eq!(result.installed_mods.len(), 1);
    assert_eq!(
        result.installed_mods[0].unique_id.as_deref(),
        Some("ModForge.ExamplePack")
    );
    assert!(
        mods_root
            .join("[CP] Example Pack")
            .join("manifest.json")
            .is_file()
    );
    assert!(!result.backup_id.trim().is_empty());
    assert!(
        Path::new(&result.backup_path)
            .join("metadata.json")
            .is_file()
    );

    fs::remove_dir_all(root).expect("cleanup");
}

fn create_zip_with_gbk_file_names(archive_path: &Path, entries: &[(&str, &[u8])]) {
    // zip 8.6 writer only accepts ToString names, so we hand-craft a minimal
    // stored zip with raw GBK filename bytes and no UTF-8 flag.
    let mut output: Vec<u8> = Vec::new();
    let mut central_directory: Vec<u8> = Vec::new();

    for (index, (name, content)) in entries.iter().enumerate() {
        let (encoded, _, had_errors) = encoding_rs::GB18030.encode(name);
        assert!(!had_errors);
        let file_name = encoded.into_owned();
        let crc = compute_crc32(content);
        let local_header_offset = output.len();

        // Local file header
        output.extend_from_slice(b"PK\x03\x04");
        output.extend_from_slice(&2u16.to_le_bytes()); // version needed
        output.extend_from_slice(&0u16.to_le_bytes()); // flags
        output.extend_from_slice(&0u16.to_le_bytes()); // compression method (stored)
        output.extend_from_slice(&0u16.to_le_bytes()); // mod time
        output.extend_from_slice(&0u16.to_le_bytes()); // mod date
        output.extend_from_slice(&crc.to_le_bytes());
        output.extend_from_slice(&(content.len() as u32).to_le_bytes()); // compressed size
        output.extend_from_slice(&(content.len() as u32).to_le_bytes()); // uncompressed size
        output.extend_from_slice(&(file_name.len() as u16).to_le_bytes());
        output.extend_from_slice(&0u16.to_le_bytes()); // extra field length
        output.extend_from_slice(&file_name);
        output.extend_from_slice(content);

        // Central directory header
        central_directory.extend_from_slice(b"PK\x01\x02");
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // version made by
        central_directory.extend_from_slice(&2u16.to_le_bytes()); // version needed
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // flags
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // compression method
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // mod time
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // mod date
        central_directory.extend_from_slice(&crc.to_le_bytes());
        central_directory.extend_from_slice(&(content.len() as u32).to_le_bytes());
        central_directory.extend_from_slice(&(content.len() as u32).to_le_bytes());
        central_directory.extend_from_slice(&(file_name.len() as u16).to_le_bytes());
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // extra length
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // comment length
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // disk number start
        central_directory.extend_from_slice(&0u16.to_le_bytes()); // internal file attributes
        central_directory.extend_from_slice(&0u32.to_le_bytes()); // external file attributes
        central_directory.extend_from_slice(&(local_header_offset as u32).to_le_bytes());
        central_directory.extend_from_slice(&file_name);

        let _ = index;
    }

    let central_directory_offset = output.len() as u32;
    let central_directory_size = central_directory.len() as u32;
    output.append(&mut central_directory);

    // End of central directory record
    output.extend_from_slice(b"PK\x05\x06");
    output.extend_from_slice(&0u16.to_le_bytes()); // disk number
    output.extend_from_slice(&0u16.to_le_bytes()); // disk with CD
    output.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    output.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    output.extend_from_slice(&central_directory_size.to_le_bytes());
    output.extend_from_slice(&central_directory_offset.to_le_bytes());
    output.extend_from_slice(&0u16.to_le_bytes()); // comment length

    fs::write(archive_path, output).expect("write gbk archive");
}

fn compute_crc32(data: &[u8]) -> u32 {
    let table: [u32; 256] = {
        let mut t = [0u32; 256];
        for i in 0..256 {
            let mut crc = i as u32;
            for _ in 0..8 {
                if crc & 1 != 0 {
                    crc = 0xedb88320 ^ (crc >> 1);
                } else {
                    crc >>= 1;
                }
            }
            t[i] = crc;
        }
        t
    };

    let mut crc = !0u32;
    for byte in data {
        crc = table[((crc ^ (*byte as u32)) & 0xff) as usize] ^ (crc >> 8);
    }
    !crc
}

#[test]
fn install_archive_preserves_chinese_folder_name_from_gbk_zip() {
    let root = create_temp_dir("launcher-install-gbk-zip");
    let mods_root = root.join("Mods");
    let backup_root = root.join("backups");
    let archive_path = root.join("gbk.zip");
    let folder_name = "【CP】中文模组";
    let manifest = sample_manifest("ModForge.ChinesePack");
    create_zip_with_gbk_file_names(
        &archive_path,
        &[(&format!("{folder_name}/manifest.json"), manifest.as_bytes())],
    );

    let result = install_archive_at_path(
        &archive_path,
        Some(&mods_root.to_string_lossy()),
        Some(&backup_root),
    )
    .expect("install gbk zip archive");

    assert_eq!(result.installed_mods.len(), 1);
    let installed_path = mods_root.join(folder_name);
    assert!(installed_path.join("manifest.json").is_file());
    assert_eq!(
        result.installed_mods[0].target_path,
        installed_path.to_string_lossy()
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn inspect_archive_detects_chinese_root_from_gbk_zip() {
    let root = create_temp_dir("launcher-inspect-gbk-zip");
    let archive_path = root.join("gbk.zip");
    let folder_name = "【CP】中文模组";
    let manifest = sample_manifest("ModForge.ChinesePack");
    create_zip_with_gbk_file_names(
        &archive_path,
        &[(&format!("{folder_name}/manifest.json"), manifest.as_bytes())],
    );

    let result = inspect_archive_at_path(&archive_path, None).expect("inspect gbk zip archive");
    assert_eq!(
        result
            .mod_roots
            .iter()
            .map(|root| root.path.clone())
            .collect::<Vec<_>>(),
        vec![folder_name.to_string()]
    );

    fs::remove_dir_all(root).expect("cleanup");
}
