use super::{
    ProjectAssetBatchWriteInput, commit_project_asset_batch, commit_project_asset_write,
    copy_project_assets_at_dir, delete_project_assets_at_dir, import_project_asset_paths_at_dir,
    import_project_assets_at_dir, project_assets_dir, read_project_asset_at_dir,
    read_verified_project_asset_at_dir, rename_project_asset_at_dir, rollback_project_asset_import,
    rollback_project_asset_write, stage_project_asset_delete_at_dir, write_project_asset_at_dir,
    write_project_assets_at_dir,
};
use crate::domain::cp_maker::types::ProjectAssetSource;
use crate::infrastructure::game_formats::tmx::parse_tmx_map;
use crate::test_support::{create_temp_dir, write_file};
use std::fs;

#[test]
fn imports_project_assets_as_files_and_lightweight_refs() {
    let root = create_temp_dir("cp-maker-project-assets-import");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("manifest.json"), "{}");
    write_file(&source.join("content.json"), "{}");

    write_file(&source.join("i18n/default.json"), "{}");
    write_file(
        &source.join("assets/maps/town.tmx"),
        r#"<map><tileset firstgid="1" source="town.tsx"/></map>"#,
    );
    write_file(
        &source.join("assets/maps/town.tsx"),
        r#"<tileset><image source="sheet.png"/></tileset>"#,
    );
    fs::create_dir_all(source.join("assets/maps")).unwrap();
    fs::write(source.join("assets/maps/sheet.png"), [1u8, 2, 3, 4]).unwrap();

    let assets =
        import_project_assets_at_dir(&source, &projects, "draft-1").expect("import project assets");

    assert_eq!(assets.len(), 3);
    assert!(assets.iter().all(|asset| asset.size_bytes > 0));
    assert!(assets.iter().all(|asset| asset.sha256.len() == 64));
    let tmx = assets
        .iter()
        .find(|asset| asset.relative_path.ends_with("town.tmx"))
        .unwrap();
    assert_eq!(tmx.dependencies[0].relative_path, "assets/maps/town.tsx");
    assert_eq!(tmx.dependencies[0].kind, "tileset");
    let tsx = assets
        .iter()
        .find(|asset| asset.relative_path.ends_with("town.tsx"))
        .unwrap();
    assert_eq!(tsx.dependencies[0].relative_path, "assets/maps/sheet.png");
    assert_eq!(tsx.dependencies[0].kind, "image");
    assert!(
        assets
            .iter()
            .all(|asset| asset.storage_key == asset.relative_path)
    );
    assert!(
        !assets
            .iter()
            .any(|asset| asset.relative_path == "manifest.json")
    );
    assert!(
        project_assets_dir(&projects, "draft-1")
            .join("assets/maps/town.tmx")
            .is_file()
    );
    assert!(
        !project_assets_dir(&projects, "draft-1")
            .join("i18n/default.json")
            .exists()
    );

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn imports_selected_files_and_directories_with_dependencies_and_rollback() {
    let root = create_temp_dir("cp-maker-selected-project-assets");
    let sources = root.join("sources");
    let projects = root.join("projects");
    let loose_map = sources.join("town.tmx");
    let bundle = sources.join("map-pack");
    write_file(&loose_map, "<map/>");
    write_file(
        &bundle.join("map.tmx"),
        r#"<map><tileset firstgid="1" source="tiles/map.tsx"/></map>"#,
    );
    write_file(
        &bundle.join("tiles/map.tsx"),
        r#"<tileset><image source="../sheet.png"/></tileset>"#,
    );
    fs::write(bundle.join("sheet.png"), vec![7u8; 1024 * 1024]).unwrap();

    let batch = import_project_asset_paths_at_dir(
        &projects,
        "draft",
        &[
            loose_map.to_string_lossy().into_owned(),
            bundle.to_string_lossy().into_owned(),
        ],
        "assets",
        &[],
    )
    .expect("import selected project assets");

    assert_eq!(batch.assets.len(), 4);
    let tmx = batch
        .assets
        .iter()
        .find(|asset| asset.relative_path == "assets/map-pack/map.tmx")
        .unwrap();
    assert_eq!(
        tmx.dependencies[0].relative_path,
        "assets/map-pack/tiles/map.tsx"
    );
    let tsx = batch
        .assets
        .iter()
        .find(|asset| asset.relative_path.ends_with("tiles/map.tsx"))
        .unwrap();
    assert_eq!(
        tsx.dependencies[0].relative_path,
        "assets/map-pack/sheet.png"
    );
    assert_eq!(
        batch
            .assets
            .iter()
            .find(|asset| asset.relative_path.ends_with("sheet.png"))
            .unwrap()
            .size_bytes,
        1024 * 1024
    );

    let second = import_project_asset_paths_at_dir(
        &projects,
        "draft",
        &[loose_map.to_string_lossy().into_owned()],
        "assets",
        &batch.assets,
    )
    .expect("allocate a non-colliding selected asset path");
    assert_eq!(second.assets[0].relative_path, "assets/town (2).tmx");

    rollback_project_asset_import(&second);
    rollback_project_asset_import(&batch);
    assert!(
        !project_assets_dir(&projects, "draft")
            .join("assets/town.tmx")
            .exists()
    );
    assert!(
        !project_assets_dir(&projects, "draft")
            .join("assets/map-pack")
            .exists()
    );
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn copies_and_deletes_project_asset_directories_with_the_draft() {
    let root = create_temp_dir("cp-maker-project-assets-copy-delete");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/map.tmx"), "<map/>");
    import_project_assets_at_dir(&source, &projects, "source-draft").unwrap();

    copy_project_assets_at_dir(&projects, "source-draft", "copied-draft")
        .expect("copy project assets");
    assert!(
        project_assets_dir(&projects, "copied-draft")
            .join("assets/map.tmx")
            .is_file()
    );

    delete_project_assets_at_dir(&projects, "source-draft").expect("delete source assets");
    assert!(!projects.join("source-draft").exists());
    assert!(projects.join("copied-draft").exists());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn reads_lazily_and_atomically_replaces_project_assets() {
    let root = create_temp_dir("cp-maker-project-assets-read-write");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/map.tmx"), "old");
    let mut assets = import_project_assets_at_dir(&source, &projects, "draft").unwrap();

    let original = read_project_asset_at_dir(&projects, "draft", "assets/map.tmx", &assets)
        .expect("read imported asset");
    assert!(!original.bytes_base64.is_empty());

    let (updated, _destination, backup) = write_project_asset_at_dir(
        &projects,
        "draft",
        "assets/map.tmx",
        "application/xml",
        b"updated",
        ProjectAssetSource::Edited,
        &assets,
    )
    .expect("replace asset");
    assets[0] = updated.clone();
    commit_project_asset_write(backup).expect("commit asset replacement");
    let payload = read_project_asset_at_dir(&projects, "draft", "assets/map.tmx", &assets)
        .expect("read replaced asset");
    assert_eq!(payload.asset.size_bytes, 7);

    let (_discarded, destination, backup) = write_project_asset_at_dir(
        &projects,
        "draft",
        "assets/map.tmx",
        "application/xml",
        b"not-committed",
        ProjectAssetSource::Edited,
        &assets,
    )
    .expect("stage second replacement");
    rollback_project_asset_write(&destination, backup.as_deref());
    assert_eq!(fs::read(destination).unwrap(), b"updated");

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn atomically_writes_related_project_assets_as_one_batch() {
    let root = create_temp_dir("cp-maker-project-assets-batch");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/map.tmx"), "old map");
    let assets = import_project_assets_at_dir(&source, &projects, "draft").unwrap();

    let batch = write_project_assets_at_dir(
        &projects,
        "draft",
        vec![
            ProjectAssetBatchWriteInput {
                relative_path: "assets/map.tsx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: b"tileset".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
            ProjectAssetBatchWriteInput {
                relative_path: "assets/map.tmx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: b"new map".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
        ],
        &assets,
    )
    .expect("stage related map assets");
    assert_eq!(batch.assets.len(), 2);
    commit_project_asset_batch(batch).expect("commit related map assets");
    let asset_root = project_assets_dir(&projects, "draft");
    assert_eq!(
        fs::read(asset_root.join("assets/map.tsx")).unwrap(),
        b"tileset"
    );
    assert_eq!(
        fs::read(asset_root.join("assets/map.tmx")).unwrap(),
        b"new map"
    );

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rolls_back_every_staged_asset_when_a_later_batch_write_fails() {
    let root = create_temp_dir("cp-maker-project-assets-batch-rollback");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/map.tmx"), "original map");
    let assets = import_project_assets_at_dir(&source, &projects, "draft").unwrap();
    let asset_root = project_assets_dir(&projects, "draft");
    write_file(&asset_root.join("blocked"), "not a directory");

    let error = write_project_assets_at_dir(
        &projects,
        "draft",
        vec![
            ProjectAssetBatchWriteInput {
                relative_path: "assets/map.tmx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: b"partial replacement".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
            ProjectAssetBatchWriteInput {
                relative_path: "blocked/map.tsx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: b"never written".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
        ],
        &assets,
    )
    .expect_err("reject a batch whose later destination cannot be created");
    assert!(error.to_string().contains("directory"));
    assert_eq!(
        fs::read(asset_root.join("assets/map.tmx")).unwrap(),
        b"original map"
    );

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn reloads_a_committed_tmx_and_tsx_batch_from_project_storage() {
    let root = create_temp_dir("cp-maker-project-assets-batch-reload");
    let projects = root.join("projects");
    let mut refs = Vec::new();
    let batch = write_project_assets_at_dir(
        &projects,
        "draft",
        vec![
            ProjectAssetBatchWriteInput {
                relative_path: "assets/maps/sheet.tsx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: br#"<tileset name="sheet" tilewidth="16" tileheight="16" tilecount="1" columns="1"><image source="sheet.png" width="16" height="16"/></tileset>"#.to_vec(),
                source_type: ProjectAssetSource::Generated,
            },
            ProjectAssetBatchWriteInput {
                relative_path: "assets/maps/map.tmx".to_string(),
                media_type: "application/xml".to_string(),
                bytes: br#"<map version="1.10" orientation="orthogonal" renderorder="right-down" width="1" height="1" tilewidth="16" tileheight="16" infinite="0"><tileset firstgid="1" source="sheet.tsx"/><layer id="1" name="Back" width="1" height="1"><data encoding="csv">1</data></layer></map>"#.to_vec(),
                source_type: ProjectAssetSource::Generated,
            },
        ],
        &refs,
    )
    .expect("stage generated map dependency batch");
    refs.extend(batch.assets.iter().cloned());
    commit_project_asset_batch(batch).expect("commit generated map dependency batch");

    let (_asset, map_path, bytes) =
        read_verified_project_asset_at_dir(&projects, "draft", "assets/maps/map.tmx", &refs)
            .expect("reload committed project map bytes");
    let document = parse_tmx_map(&bytes, &map_path, "assets/maps/map.tmx")
        .expect("parse the reloaded project map with its committed TSX");
    assert_eq!(document.layers[0].name, "Back");
    assert_eq!(document.tilesets[0].source.as_deref(), Some("sheet.tsx"));

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn renames_and_stages_deletes_without_losing_recoverable_bytes() {
    let root = create_temp_dir("cp-maker-project-assets-rename-delete");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/maps/old.tmx"), "map bytes");
    let mut assets = import_project_assets_at_dir(&source, &projects, "draft").unwrap();

    let (renamed, old_path, new_path) = rename_project_asset_at_dir(
        &projects,
        "draft",
        "assets/maps/old.tmx",
        "assets/maps/new.tmx",
        &assets,
    )
    .expect("rename asset");
    assert!(!old_path.exists());
    assert_eq!(fs::read(&new_path).unwrap(), b"map bytes");
    assets[0] = renamed;

    let (source_path, staged_path) =
        stage_project_asset_delete_at_dir(&projects, "draft", "assets/maps/new.tmx", &assets)
            .expect("stage delete");
    assert!(!source_path.exists());
    assert_eq!(fs::read(&staged_path).unwrap(), b"map bytes");
    fs::rename(&staged_path, &source_path).expect("rollback staged delete");
    assert_eq!(fs::read(source_path).unwrap(), b"map bytes");

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_rename_collisions_without_moving_the_source() {
    let root = create_temp_dir("cp-maker-project-assets-rename-collision");
    let source = root.join("source");
    let projects = root.join("projects");
    write_file(&source.join("assets/a.tmx"), "a");
    write_file(&source.join("assets/b.tmx"), "b");
    let assets = import_project_assets_at_dir(&source, &projects, "draft").unwrap();

    let error =
        rename_project_asset_at_dir(&projects, "draft", "assets/a.tmx", "ASSETS/B.TMX", &assets)
            .expect_err("reject case-insensitive collision");
    assert!(error.to_string().contains("collides"));
    assert!(
        project_assets_dir(&projects, "draft")
            .join("assets/a.tmx")
            .is_file()
    );
    assert!(
        project_assets_dir(&projects, "draft")
            .join("assets/b.tmx")
            .is_file()
    );

    fs::remove_dir_all(root).unwrap();
}

#[cfg(not(windows))]
#[test]
fn writes_backslash_project_assets_as_nested_directories() {
    let root = create_temp_dir("cp-maker-project-assets-backslash-write");
    let projects = root.join("projects");
    let assets_root = project_assets_dir(&projects, "draft");

    let (_asset, destination, backup) = write_project_asset_at_dir(
        &projects,
        "draft",
        r"assets\maps\foo.png",
        "image/png",
        b"png bytes",
        ProjectAssetSource::Edited,
        &[],
    )
    .expect("write backslash project asset");
    commit_project_asset_write(backup).expect("commit backslash asset");

    assert_eq!(fs::read(&destination).unwrap(), b"png bytes");
    assert!(assets_root.join("assets/maps/foo.png").is_file());
    // On Linux/macOS a backslash is an ordinary file-name character, so the
    // asset must land in nested directories rather than a single legacy file.
    assert!(!assets_root.join(r"assets\maps\foo.png").exists());

    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_batch_write_duplicate_paths_across_separator_styles() {
    let root = create_temp_dir("cp-maker-project-assets-batch-duplicate");
    let projects = root.join("projects");

    let error = write_project_assets_at_dir(
        &projects,
        "draft",
        vec![
            ProjectAssetBatchWriteInput {
                relative_path: "assets/maps/foo.png".to_string(),
                media_type: "image/png".to_string(),
                bytes: b"first".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
            ProjectAssetBatchWriteInput {
                relative_path: r"assets\maps\foo.png".to_string(),
                media_type: "image/png".to_string(),
                bytes: b"second".to_vec(),
                source_type: ProjectAssetSource::Edited,
            },
        ],
        &[],
    )
    .expect_err("reject duplicate batch paths after separator normalization");

    let message = error.to_string();
    assert!(message.contains("duplicate"), "{message}");
    assert!(message.contains("assets/maps/foo.png"), "{message}");
    fs::remove_dir_all(root).unwrap();
}
