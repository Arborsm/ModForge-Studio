use super::*;
use std::fs;

fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
}

#[test]
fn prompt_eligibility_excludes_character_data_and_schedules() {
    assert_eq!(classify("Characters/Dialogue/Sam.xnb"), ("dialogue", true));
    assert_eq!(classify("Strings/Characters.xnb"), ("plain-text", true));
    assert_eq!(
        classify("Characters/schedules/Sam.xnb"),
        ("schedule", false)
    );
    assert_eq!(
        classify("Data/Characters.xnb"),
        ("structured-record", false)
    );
    assert_eq!(
        character_entity_id("Characters/Dialogue/Sam.xnb").as_deref(),
        Some("character:sam")
    );
    assert_eq!(character_entity_id("Characters/schedules/Sam.xnb"), None);
    assert!(activity_semantic_alias("guitar").unwrap().contains("音乐"));
    assert!(
        activity_semantic_alias("skateboarding")
            .unwrap()
            .contains("滑板")
    );
    assert_eq!(activity_semantic_alias("sleep"), None);
    assert!(!prompt_text_eligible("...$a"));
    assert!(!prompt_text_eligible("??HMTGF??"));
    assert!(prompt_text_eligible("I'm writing a song for my band.$h"));
    assert_eq!(
        merge_unit_entity_similarity(Some(0.9), Some(0.8)),
        Some(0.9)
    );
    assert!((merge_unit_entity_similarity(Some(0.82), Some(0.9)).unwrap() - 0.876).abs() < 1e-9);
}

fn seven_bit(mut value: usize, output: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value > 0 {
            byte |= 0x80
        }
        output.push(byte);
        if value == 0 {
            break;
        }
    }
}
fn seven_bit_string(value: &str, output: &mut Vec<u8>) {
    seven_bit(value.len(), output);
    output.extend_from_slice(value.as_bytes());
}
fn string_xnb(value: &str) -> Vec<u8> {
    let reader = "Microsoft.Xna.Framework.Content.StringReader";
    let mut payload = Vec::new();
    seven_bit(1, &mut payload);
    seven_bit_string(reader, &mut payload);
    payload.extend_from_slice(&0_i32.to_le_bytes());
    seven_bit(0, &mut payload);
    seven_bit(1, &mut payload);
    seven_bit_string(value, &mut payload);
    let mut bytes = b"XNBw\x05\x00".to_vec();
    bytes.extend_from_slice(&((10 + payload.len()) as u32).to_le_bytes());
    bytes.extend_from_slice(&payload);
    bytes
}
fn fixture() -> PathBuf {
    let root = std::env::temp_dir().join(format!("modforge-official-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("Content/Strings")).unwrap();
    fs::create_dir_all(root.join("Content/Maps")).unwrap();
    fs::create_dir_all(root.join("Content/Fonts")).unwrap();
    fs::write(root.join("Stardew Valley.dll"), []).unwrap();
    fs::write(
        root.join("Content/Strings/UI.xnb"),
        string_xnb("Welcome to Pelican Town"),
    )
    .unwrap();
    fs::write(
        root.join("Content/Fonts/SmallFont.xnb"),
        string_xnb("not localization"),
    )
    .unwrap();
    fs::write(
        root.join("Content/Strings/UI.zh-CN.xnb"),
        string_xnb("欢迎来到鹈鹕镇"),
    )
    .unwrap();
    fs::write(
        root.join("Content/Strings/NPCNames.xnb"),
        string_xnb("Abigail"),
    )
    .unwrap();
    fs::write(
        root.join("Content/Strings/NPCNames.zh-CN.xnb"),
        string_xnb("阿比盖尔"),
    )
    .unwrap();
    fs::write(
        root.join("Content/Strings/Orphan.zh-CN.xnb"),
        string_xnb("没有英文基线"),
    )
    .unwrap();
    fs::write(root.join("Content/Strings/Broken.xnb"), b"not-xnb").unwrap();
    root
}

#[test]
fn indexes_xnb_locale_pairs_and_atomically_replaces_generations() {
    let _guard = test_lock();
    let root = fixture();
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", root.join("data")) };
    let game_directory = root.to_string_lossy().into_owned();
    let mut progress = Vec::new();
    let first = rebuild_with_progress(
        RebuildOfficialLocalizationIndexRequest {
            job_id: "index-1".into(),
            game_directory: game_directory.clone(),
        },
        |value| progress.push(value),
    )
    .unwrap();
    assert_eq!(progress.first().map(|value| value.completed), Some(0));
    assert_eq!(
        progress.last().map(|value| value.phase.as_str()),
        Some("committing")
    );
    assert_eq!(
        progress.last().map(|value| value.completed),
        progress.last().map(|value| value.total)
    );
    assert!(first.indexed);
    assert_eq!(first.language_count, 2);
    assert_eq!(first.unit_count, 2);
    assert_eq!(first.error_count, 1);
    let page = search(SearchOfficialLocalizationRequest {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        query: "Welcome to Pelican Town".into(),
        asset_category: None,
        unit_kind: None,
        prompt_eligible_only: true,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.records[0].target_text, "欢迎来到鹈鹕镇");
    assert_eq!(page.records[0].unit_kind, "plain-text");
    let keyword_page = search(SearchOfficialLocalizationRequest {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        query: "Pelican".into(),
        asset_category: Some("Strings".into()),
        unit_kind: Some("plain-text".into()),
        prompt_eligible_only: true,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(keyword_page.total, 1);
    assert_eq!(
        keyword_page.records[0].source_text,
        "Welcome to Pelican Town"
    );
    let terms = find_terms_in_text("en-US", "zh-CN", "A gift for Abigail").unwrap();
    assert_eq!(terms.len(), 1);
    assert_eq!(terms[0].source_text, "Abigail");
    assert_eq!(terms[0].target_text, "阿比盖尔");
    fs::write(
        root.join("Content/Strings/UI.zh-CN.xnb"),
        string_xnb("欢迎来到星露谷"),
    )
    .unwrap();
    let second = rebuild(RebuildOfficialLocalizationIndexRequest {
        job_id: "index-2".into(),
        game_directory: game_directory.clone(),
    })
    .unwrap();
    assert_ne!(first.revision, second.revision);
    let db = open().unwrap();
    let generations: u64 = db
        .query_row("SELECT COUNT(*) FROM official_generations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(generations, 1);
    let fonts: u64 = db
        .query_row(
            "SELECT COUNT(*) FROM official_assets WHERE lower(path) LIKE 'fonts/%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(fonts, 0);
    let schema: (String, String, String) = db
        .query_row(
            "SELECT a.category,u.context,t.text_hash FROM official_assets a JOIN official_units u ON u.generation_id=a.generation_id AND u.asset_path=a.path JOIN official_texts t ON t.unit_id=u.id WHERE a.locale='en-US' LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(schema.0, "Strings");
    assert!(schema.1.starts_with("Strings/"));
    assert!(schema.1.contains(".xnb#"));
    assert_eq!(schema.2.len(), 64);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(root);
}

#[test]
fn unsafe_script_assets_are_searchable_but_never_prompt_eligible() {
    let (kind, prompt) = classify("Data/Events/Town.xnb");
    assert_eq!(kind, "event-script");
    assert!(!prompt);
    assert_eq!(
        classify("Data/ObjectInformation.xnb"),
        ("structured-record", false)
    );
    assert_eq!(classify("Strings/NPCNames.xnb"), ("term", true));
    assert_eq!(classify("Strings/Characters.xnb"), ("plain-text", true));
    let (units, kind, prompt) = extract(
        "Data/Objects.xnb",
        &serde_json::json!({"24":{"Name":"Parsnip","Price":35}}),
    );
    assert_eq!(kind, "structured-record");
    assert!(!prompt);
    assert_eq!(units.len(), 1);
    assert_eq!(units[0].0, "$");
    assert!(units[0].1.contains("Parsnip"));
}

#[test]
fn obsolete_or_incomplete_index_schema_is_discarded_instead_of_migrated() {
    let _guard = test_lock();
    let root = fixture();
    let data_root = root.join("data");
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &data_root) };
    let path = official_localization_index_path().unwrap();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let legacy = Connection::open(&path).unwrap();
    legacy
        .execute_batch(
            "CREATE TABLE legacy_rows(value TEXT NOT NULL);
             INSERT INTO legacy_rows VALUES('must-not-survive');
             PRAGMA user_version=1;",
        )
        .unwrap();
    drop(legacy);

    let current = open().unwrap();
    let version: u32 = current
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    let legacy_table_count: u32 = current
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='legacy_rows'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let generation_count: u32 = current
        .query_row("SELECT COUNT(*) FROM official_generations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(legacy_table_count, 0);
    assert_eq!(generation_count, 0);
    drop(current);
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(root);
}

#[test]
fn cancellation_state_is_cooperative() {
    jobs::cancel("official-cancel").unwrap();
    assert!(jobs::check("official-cancel").is_err());
    jobs::clear("official-cancel");
    assert!(jobs::check("official-cancel").is_ok());
}

#[cfg(feature = "installed-game-validation")]
#[test]
#[ignore = "manual regression against an installed Stardew Valley Content directory"]
fn indexes_real_installed_game_xnb_corpus() {
    let _guard = test_lock();
    let game_root = std::env::var_os("SDV_GAME_PATH")
        .map(PathBuf::from)
        .expect("set SDV_GAME_PATH to an installed Stardew Valley directory");
    assert!(game_root.join("Content").is_dir());
    let data_root = std::env::temp_dir().join(format!(
        "modforge-official-installed-{}",
        uuid::Uuid::new_v4()
    ));
    unsafe { std::env::set_var("MODFORGE_TEST_DATA_DIR", &data_root) };
    let status = rebuild(RebuildOfficialLocalizationIndexRequest {
        job_id: "installed-official-index".into(),
        game_directory: game_root.to_string_lossy().into_owned(),
    })
    .unwrap();
    assert!(status.indexed);
    assert!(
        status.unit_count > 1_000,
        "unexpectedly small official corpus"
    );
    assert!(status.language_count >= 2, "expected localized XNB pairs");
    assert!(
        status.error_count < 100,
        "official corpus reported too many parser errors: {}",
        status.error_count
    );
    let sam = search(SearchOfficialLocalizationRequest {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        query: "Sam".into(),
        asset_category: None,
        unit_kind: None,
        prompt_eligible_only: true,
        offset: 0,
        limit: 20,
    })
    .expect("real corpus Sam search should succeed");
    assert!(!sam.records.is_empty());
    assert!(matches!(
        sam.records[0].match_kind.as_str(),
        "exact" | "whole-token"
    ));
    assert!(!sam.records[0].source_text.to_lowercase().contains("same"));
    unsafe { std::env::remove_var("MODFORGE_TEST_DATA_DIR") };
    let _ = fs::remove_dir_all(data_root);
}
