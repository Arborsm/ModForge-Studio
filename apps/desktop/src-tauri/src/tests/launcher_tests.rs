use super::archive::inspect_archive_at_path;
use super::catalog::{
    build_catalog_graphql_payload, build_public_catalog_graphql_payload,
    build_update_batch_graphql_payload, parse_public_mod_detail_graphql_response,
    can_use_nexus_graphql, parse_catalog_graphql_response, parse_catalog_results,
    parse_remote_mod_detail_html, parse_update_batch_graphql_response,
};
use super::downloads::{load_or_create_download_queue_at_path, save_download_queue_at_path};
use super::launch::launch_game_with_runner;
use super::library::{
    load_or_create_library_covers_at_path, load_or_create_library_state_at_path,
    save_library_covers_at_path, save_library_state_at_path, scan_library_at_path,
    set_launcher_mod_enabled,
};
use super::settings::{load_or_create_settings_at_path, save_settings_at_path};
use super::trace::format_launcher_trace_message;
use super::types::{
    LauncherArchiveTreeNode, LauncherDownloadQueueItem, LauncherDownloadQueueState,
    LauncherGameLaunchErrorCode, LauncherGameLaunchTarget, LauncherLibraryCover,
    LauncherLibraryCoversState, LauncherLibraryPackPreset, LauncherLibraryScopeMode,
    LauncherLibraryState, LauncherLibraryStorageFolder, LauncherSettings,
    SetLauncherModEnabledRequest,
};
use crate::test_support::{create_temp_dir, write_file};
use serde_json::json;
use std::fs;
#[cfg(target_os = "windows")]
use std::path::Path;
#[cfg(target_os = "windows")]
use std::process::Command;

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

#[test]
fn launcher_trace_message_prefixes_action_and_quotes_values() {
    let message = format_launcher_trace_message(
        "install.start",
        &[
            ("archivePath", r"E:\Downloads\Example Pack.zip".to_string()),
            ("modsPath", r"E:\Games\Stardew Valley\Mods".to_string()),
            ("hasBackupRoot", "true".to_string()),
        ],
    );

    assert_eq!(
        message,
        r#"launcher.install.start archivePath="E:\\Downloads\\Example Pack.zip" modsPath="E:\\Games\\Stardew Valley\\Mods" hasBackupRoot="true""#
    );
}

#[test]
fn launcher_trace_message_skips_blank_values() {
    let message = format_launcher_trace_message(
        "toggle.complete",
        &[
            ("modPath", r"E:\Games\Mods\ExamplePack".to_string()),
            ("reason", "   ".to_string()),
            ("enabled", "false".to_string()),
        ],
    );

    assert_eq!(
        message,
        r#"launcher.toggle.complete modPath="E:\\Games\\Mods\\ExamplePack" enabled="false""#
    );
}

#[test]
fn launcher_settings_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-settings");
    let settings_path = root.join("launcher").join("settings.json");

    let default_settings = load_or_create_settings_at_path(&settings_path).expect("load defaults");
    assert_eq!(default_settings, LauncherSettings::default());
    assert!(settings_path.is_file());

    let saved_settings = LauncherSettings {
        game_path: Some(r"C:\Games\Stardew Valley".to_string()),
        mods_path: Some(r"C:\Games\Stardew Valley\Mods".to_string()),
        download_path: Some(r"C:\Users\Example\Downloads\ModForge Studio".to_string()),
        nexus_api_key: Some("nexus-key".to_string()),
        nexus_cookie: Some("cookie=value".to_string()),
        auto_install_downloads: true,
        keep_downloaded_archives: true,
    };
    save_settings_at_path(&settings_path, &saved_settings).expect("save settings");

    let reloaded = load_or_create_settings_at_path(&settings_path).expect("reload settings");
    assert_eq!(reloaded, saved_settings);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_state_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-library-state");
    let state_path = root.join("launcher").join("library.json");

    let default_state =
        load_or_create_library_state_at_path(&state_path).expect("load default launcher library state");
    assert_eq!(
        default_state,
        LauncherLibraryState {
            storage_folders: vec![LauncherLibraryStorageFolder {
                id: "unsorted".to_string(),
                name: "Unsorted".to_string(),
                mod_keys: Vec::new(),
            }],
            pack_presets: Vec::new(),
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
        pack_presets: vec![LauncherLibraryPackPreset {
            id: "farm".to_string(),
            name: "Farm".to_string(),
            mod_keys: vec!["ModForge.Visible".to_string(), "ModForge.Hidden".to_string()],
        }],
        current_pack_id: Some("farm".to_string()),
        scope_mode: LauncherLibraryScopeMode::CurrentPack,
    };
    save_library_state_at_path(&state_path, &saved_state).expect("save launcher library state");

    let reloaded =
        load_or_create_library_state_at_path(&state_path).expect("reload saved launcher library state");
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
        pack_presets: vec![
            LauncherLibraryPackPreset {
                id: "seasonal".to_string(),
                name: "Seasonal".to_string(),
                mod_keys: vec![
                    "ModForge.A".to_string(),
                    "ModForge.B".to_string(),
                    "ModForge.B".to_string(),
                ],
            },
            LauncherLibraryPackPreset {
                id: "seasonal".to_string(),
                name: "Duplicate".to_string(),
                mod_keys: vec!["ModForge.C".to_string()],
            },
            LauncherLibraryPackPreset {
                id: " ".to_string(),
                name: "".to_string(),
                mod_keys: vec!["ModForge.Z".to_string()],
            },
        ],
        current_pack_id: Some("missing-pack".to_string()),
        scope_mode: LauncherLibraryScopeMode::CurrentPack,
    };
    save_library_state_at_path(&state_path, &raw_state).expect("save launcher library state");

    let reloaded =
        load_or_create_library_state_at_path(&state_path).expect("reload normalized launcher library state");
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
        reloaded.pack_presets,
        vec![LauncherLibraryPackPreset {
            id: "seasonal".to_string(),
            name: "Seasonal".to_string(),
            mod_keys: vec!["ModForge.A".to_string(), "ModForge.B".to_string()],
        }]
    );
    assert_eq!(reloaded.current_pack_id, None);
    assert_eq!(reloaded.scope_mode, LauncherLibraryScopeMode::CurrentPack);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_library_covers_create_default_and_save_roundtrip() {
    let root = create_temp_dir("launcher-library-covers");
    let covers_path = root.join("launcher").join("covers.json");

    let default_state =
        load_or_create_library_covers_at_path(&covers_path).expect("load default covers");
    assert_eq!(default_state, LauncherLibraryCoversState { covers: Vec::new() });
    assert!(covers_path.is_file());

    let saved_state = LauncherLibraryCoversState {
        covers: vec![LauncherLibraryCover {
            label_key: "ModForge.Visible".to_string(),
            image_path: r"C:\Covers\visible.png".to_string(),
        }],
    };
    save_library_covers_at_path(&covers_path, &saved_state).expect("save library covers");

    let reloaded =
        load_or_create_library_covers_at_path(&covers_path).expect("reload saved covers");
    assert_eq!(reloaded, saved_state);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn launcher_download_queue_create_default_and_reset_inflight_items() {
    let root = create_temp_dir("launcher-download-queue");
    let queue_path = root.join("launcher").join("downloads.json");

    let default_state =
        load_or_create_download_queue_at_path(&queue_path).expect("load default queue");
    assert_eq!(default_state, LauncherDownloadQueueState { items: Vec::new() });
    assert!(queue_path.is_file());

    let persisted_state = LauncherDownloadQueueState {
        items: vec![LauncherDownloadQueueItem {
            id: "job-1".to_string(),
            mod_id: 101,
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
        }],
    };
    save_download_queue_at_path(&queue_path, &persisted_state).expect("save queue");

    let reloaded = load_or_create_download_queue_at_path(&queue_path).expect("reload queue");
    assert_eq!(reloaded.items.len(), 1);
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
    assert_eq!(scan.mods[0].nexus_mod_id, Some(12345));
    assert_eq!(scan.mods[0].mod_url.as_deref(), Some("https://www.nexusmods.com/stardewvalley/mods/12345"));
    assert_eq!(scan.mods[0].update_keys, vec!["Nexus:12345".to_string()]);

    fs::remove_dir_all(root).expect("cleanup");
}

#[test]
fn build_catalog_graphql_payload_maps_query_sort_and_page() {
    let payload = build_catalog_graphql_payload(Some("tractor"), 2, "updated", false)
        .expect("build catalog graphql payload");

    assert_eq!(payload["operationName"], "CatalogMods");
    assert_eq!(payload["variables"]["offset"], 20);
    assert_eq!(payload["variables"]["count"], 20);
    assert_eq!(payload["variables"]["filter"]["gameDomainName"][0]["value"], "stardewvalley");
    assert_eq!(payload["variables"]["filter"]["gameDomainName"][0]["op"], "EQUALS");
    assert_eq!(payload["variables"]["filter"]["name"][0]["value"], "tractor");
    assert_eq!(payload["variables"]["filter"]["name"][0]["op"], "WILDCARD");
    assert_eq!(payload["variables"]["sort"][0]["updatedAt"]["direction"], "DESC");

    let query = payload["query"].as_str().expect("graphql query string");
    assert!(query.contains("query CatalogMods"));
    assert!(query.contains("mods(filter: $filter, sort: $sort, offset: $offset, count: $count)"));
}

#[test]
fn build_public_catalog_graphql_payload_matches_browser_mod_listing_shape() {
    let payload = build_public_catalog_graphql_payload(Some("tractor"), 2, "updated", false)
        .expect("build public catalog graphql payload");

    assert_eq!(payload["operationName"], "ModsListing");
    assert_eq!(payload["variables"]["count"], 20);
    assert_eq!(payload["variables"]["offset"], 20);
    assert_eq!(payload["variables"]["facets"]["categoryName"], json!([]));
    assert_eq!(payload["variables"]["facets"]["languageName"], json!([]));
    assert_eq!(payload["variables"]["facets"]["tag"], json!([]));
    assert_eq!(payload["variables"]["filter"]["adultContent"][0]["op"], "EQUALS");
    assert_eq!(payload["variables"]["filter"]["adultContent"][0]["value"], false);
    assert_eq!(payload["variables"]["filter"]["gameDomainName"][0]["value"], "stardewvalley");
    assert_eq!(payload["variables"]["filter"]["name"][0]["value"], "tractor");
    assert_eq!(payload["variables"]["sort"][0]["updatedAt"]["direction"], "DESC");

    let query = payload["query"].as_str().expect("public graphql query string");
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
                "totalCount": 45
            }
        }
    });

    let page = parse_catalog_graphql_response(&payload, 2).expect("parse catalog graphql response");

    assert_eq!(page.page, 2);
    assert!(page.has_more);
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
                "totalCount": 1
            }
        }
    });

    let page = parse_catalog_graphql_response(&payload, 1).expect("parse public catalog graphql response");

    assert_eq!(page.results.len(), 1);
    assert_eq!(
        page.results[0].image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/tractor.png")
    );
}

#[test]
fn parse_catalog_results_extracts_public_widget_cards_without_credentials() {
    let html = r#"
<div class="mod-tile">
  <div class="tile-name">
    <a href="/stardewvalley/mods/101">Tractor Mod</a>
  </div>
  <img class="fore" src="https://static.nexusmods.com/tractor.png" />
  <div class="tile-description">Drive around <strong>Pelican Town</strong>.</div>
  <span>Created by Pathoschild</span>
</div>
"#;

    let results = parse_catalog_results(html);

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].mod_id, 101);
    assert_eq!(results[0].title, "Tractor Mod");
    assert_eq!(results[0].summary.as_deref(), Some("Drive around Pelican Town"));
    assert_eq!(results[0].author.as_deref(), Some("Pathoschild"));
    assert_eq!(
        results[0].mod_url,
        "https://www.nexusmods.com/stardewvalley/mods/101"
    );
    assert_eq!(
        results[0].image_url.as_deref(),
        Some("https://static.nexusmods.com/tractor.png")
    );
}

#[test]
fn parse_remote_mod_detail_html_extracts_summary_version_and_gallery() {
    let html = r#"
<meta property="og:title" content="Joja Civic Center" />
<meta property="og:description" content="Welcome to the Joja Civic Center." />
<meta property="og:image" content="https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png" />
<meta property="twitter:label1" content="Version" />
<meta property="twitter:data1" content="1.0.0" />
<div id="sidebargallery" class="clearfix modimages">
  <ul class="thumbgallery gallery clearfix">
    <li class="thumb"
      data-src="https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-a.png"
      data-exthumbimage="https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-a.png">
    </li>
    <li class="thumb"
      data-src="https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-b.png"
      data-exthumbimage="https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-b.png">
    </li>
  </ul>
</div>
"#;

    let detail = parse_remote_mod_detail_html(html, 44722).expect("parse remote mod detail html");

    assert_eq!(detail.mod_id, 44722);
    assert_eq!(detail.name.as_deref(), Some("Joja Civic Center"));
    assert_eq!(detail.summary.as_deref(), Some("Welcome to the Joja Civic Center."));
    assert_eq!(detail.version.as_deref(), Some("1.0.0"));
    assert_eq!(
        detail.image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png")
    );
    assert_eq!(detail.gallery_images.len(), 2);
    assert_eq!(
        detail.gallery_images[0],
        "https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-a.png"
    );
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

    let detail =
        parse_public_mod_detail_graphql_response(&payload, 44722).expect("parse public mod detail graphql");

    assert_eq!(detail.mod_id, 44722);
    assert_eq!(detail.name.as_deref(), Some("Joja Civic Center"));
    assert_eq!(detail.author.as_deref(), Some("blue704"));
    assert_eq!(detail.summary.as_deref(), Some("Full description for the mod."));
    assert_eq!(detail.version.as_deref(), Some("1.0.0"));
    assert_eq!(
        detail.image_url.as_deref(),
        Some("https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-cover.png")
    );
}

#[test]
fn build_update_batch_graphql_payload_uses_legacy_mods_by_domain() {
    let payload =
        build_update_batch_graphql_payload(&[101, 202]).expect("build update batch graphql payload");

    assert_eq!(payload["operationName"], "LauncherUpdateBatch");
    assert_eq!(payload["variables"]["ids"][0]["gameDomain"], "stardewvalley");
    assert_eq!(payload["variables"]["ids"][0]["modId"], 101);
    assert_eq!(payload["variables"]["ids"][1]["modId"], 202);

    let query = payload["query"].as_str().expect("graphql query string");
    assert!(query.contains("query LauncherUpdateBatch"));
    assert!(query.contains("legacyModsByDomain"));
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
fn can_use_nexus_graphql_requires_api_key_or_cookie() {
    assert!(!can_use_nexus_graphql(&LauncherSettings::default()));

    assert!(can_use_nexus_graphql(&LauncherSettings {
        nexus_api_key: Some("nexus-key".to_string()),
        ..LauncherSettings::default()
    }));

    assert!(can_use_nexus_graphql(&LauncherSettings {
        nexus_cookie: Some("session=value".to_string()),
        ..LauncherSettings::default()
    }));
}

#[test]
fn set_launcher_mod_enabled_renames_dot_prefixed_folder() {
    let root = create_temp_dir("launcher-enable-mod");
    let project = root.join("Mods").join(".ExamplePack");
    write_file(
        &project.join("manifest.json"),
        &sample_manifest("ModForge.ExamplePack"),
    );

    let result = set_launcher_mod_enabled(SetLauncherModEnabledRequest {
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
    assert_eq!(scan.mods[0].unique_id.as_deref(), Some("ModForge.ExamplePack"));
    assert!(scan.mods[0].enabled);
    assert!(scan.mods[0].missing_required_dependencies.is_empty());

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

    assert_eq!(error.code, LauncherGameLaunchErrorCode::MissingGamePath);
}

#[test]
fn launch_game_returns_typed_error_when_no_executable_exists() {
    let root = create_temp_dir("launcher-launch-missing-exe");
    let settings = LauncherSettings {
        game_path: Some(root.to_string_lossy().to_string()),
        ..LauncherSettings::default()
    };

    let error = launch_game_with_runner(&settings, |_| Ok(())).expect_err("missing executable");

    assert_eq!(error.code, LauncherGameLaunchErrorCode::MissingExecutable);
    assert!(
        error.message.contains("StardewModdingAPI.exe"),
        "expected SMAPI path in error message, got {}",
        error.message
    );
    assert!(
        error.message.contains("Stardew Valley.exe"),
        "expected base executable path in error message, got {}",
        error.message
    );

    fs::remove_dir_all(root).expect("cleanup");
}

#[cfg(target_os = "windows")]
fn create_zip_from_directory(source_dir: &Path, archive_path: &Path) {
    let source = source_dir.to_string_lossy().replace('\'', "''");
    let archive = archive_path.to_string_lossy().replace('\'', "''");
    let status = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(format!(
            "Add-Type -AssemblyName 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::CreateFromDirectory('{source}', '{archive}')"
        ))
        .status()
        .expect("create archive");
    assert!(status.success(), "expected archive creation to succeed");
}

fn collect_paths(nodes: &[LauncherArchiveTreeNode], output: &mut Vec<String>) {
    for node in nodes {
        output.push(node.path.clone());
        collect_paths(&node.children, output);
    }
}

#[cfg(target_os = "windows")]
#[test]
fn inspect_archive_detects_manifest_roots_and_builds_tree() {
    let root = create_temp_dir("launcher-inspect-archive");
    let source = root.join("source");
    write_file(&source.join("ModA").join("manifest.json"), &sample_manifest("ModForge.ModA"));
    write_file(&source.join("ModA").join("assets").join("icon.png"), "png-bytes");
    write_file(
        &source.join("Nested").join("ModB").join("manifest.json"),
        &sample_manifest("ModForge.ModB"),
    );
    write_file(&source.join("readme.txt"), "hello");

    let archive_path = root.join("bundle.zip");
    create_zip_from_directory(&source, &archive_path);

    let result = inspect_archive_at_path(&archive_path).expect("inspect archive");
    assert_eq!(result.archive_file_name, "bundle.zip");
    assert_eq!(result.total_files, 4);
    assert_eq!(
        result.mod_roots,
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
        .and_then(|node| node.children.iter().find(|child| child.path == "ModA/manifest.json"))
        .expect("manifest entry");
    assert_eq!(mod_manifest.size_bytes, Some(sample_manifest("ModForge.ModA").len() as u64));

    fs::remove_dir_all(root).expect("cleanup");
}

#[cfg(target_os = "windows")]
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

    let result = inspect_archive_at_path(&archive_path).expect("inspect archive");
    assert_eq!(result.mod_roots, vec![".".to_string()]);

    fs::remove_dir_all(root).expect("cleanup");
}
