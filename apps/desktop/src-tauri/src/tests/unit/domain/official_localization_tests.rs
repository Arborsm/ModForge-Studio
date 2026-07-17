use super::*;
use std::fs;

fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    crate::test_support::process_environment_lock()
}

#[test]
fn eligibility_excludes_character_data_and_schedules_from_unsafe_uses() {
    assert_eq!(
        classify("Characters/Dialogue/Sam.xnb"),
        ("dialogue", UnitEligibility::PROMPT_SAFE)
    );
    assert_eq!(
        classify("Strings/Characters.xnb"),
        ("plain-text", UnitEligibility::PROMPT_SAFE)
    );
    assert_eq!(
        classify("Characters/schedules/Sam.xnb"),
        ("schedule", UnitEligibility::SEARCHABLE_ONLY)
    );
    assert_eq!(
        classify("Data/Characters.xnb"),
        ("structured-record", UnitEligibility::SEARCHABLE_ONLY)
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
        allow_literal_scan: false,
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
        allow_literal_scan: false,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(keyword_page.total, 1);
    assert_eq!(
        keyword_page.records[0].source_text,
        "Welcome to Pelican Town"
    );
    let fallback_page = search(SearchOfficialLocalizationRequest {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        query: "Welcome back, farmer".into(),
        asset_category: Some("Strings".into()),
        unit_kind: Some("plain-text".into()),
        prompt_eligible_only: true,
        allow_literal_scan: false,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(fallback_page.total, 1);
    assert_eq!(fallback_page.records[0].match_kind, "keyword");
    assert_eq!(fallback_page.records[0].retrieval_mode, "lexical");
    let prompt_examples =
        find_prompt_examples_batch("en-US", "zh-CN", &["Welcome back, farmer".into()]).unwrap();
    assert_eq!(prompt_examples.len(), 1);
    assert_eq!(prompt_examples[0].len(), 1);
    assert_eq!(prompt_examples[0][0].match_kind, "keyword");
    let one_character_page = search(SearchOfficialLocalizationRequest {
        source_locale: "en-US".into(),
        target_locale: "zh-CN".into(),
        query: "a".into(),
        asset_category: Some("Strings".into()),
        unit_kind: Some("plain-text".into()),
        prompt_eligible_only: true,
        allow_literal_scan: true,
        offset: 0,
        limit: 20,
    })
    .unwrap();
    assert_eq!(one_character_page.total, 1);
    assert_eq!(one_character_page.records[0].retrieval_mode, "lexical");
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
    let (kind, eligibility) = classify("Data/Events/Town.xnb");
    assert_eq!(kind, "event-script");
    assert_eq!(eligibility, UnitEligibility::SEARCHABLE_ONLY);
    assert_eq!(
        classify("Data/ObjectInformation.xnb"),
        ("structured-record", UnitEligibility::SEARCHABLE_ONLY)
    );
    assert_eq!(
        classify("Strings/NPCNames.xnb"),
        ("term", UnitEligibility::PROMPT_SAFE)
    );
    assert_eq!(
        classify("Strings/Characters.xnb"),
        ("plain-text", UnitEligibility::PROMPT_SAFE)
    );
    let units = extract(
        "Data/Objects.xnb",
        &serde_json::json!({"24":{"Name":"Parsnip","Description":"A spring vegetable.","Price":35}}),
    )
    .unwrap();
    assert_eq!(
        units
            .iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            ("24/Description", "A spring vegetable."),
            ("24/Name", "Parsnip"),
        ]
    );
    let description = units
        .iter()
        .find(|unit| unit.key == "24/Description")
        .unwrap();
    assert_eq!(description.eligibility, UnitEligibility::PROMPT_SAFE);
    let internal_name = units.iter().find(|unit| unit.key == "24/Name").unwrap();
    assert_eq!(internal_name.eligibility, UnitEligibility::SEARCHABLE_ONLY);
    assert!(
        !units
            .iter()
            .any(|unit| unit.key == "$" || unit.text.contains("Price"))
    );

    let festival = extract(
        "Data/Festivals/summer28.xnb",
        &serde_json::json!({
            "Abigail":"Such a rare and exciting thing...",
            "Alex":"I can't wait to see it tonight!",
            "mainEvent":"pause 500/globalFade/speak Lewis \"The glow of summer has faded, now... and the moonlight jellies carry on toward the great unknown.\"/move Lewis 0 1 2/festivalEnd/end",
            "Metadata":{"Chance":0.25}
        }),
    )
    .unwrap();
    assert_eq!(festival.len(), 3);
    assert_eq!(festival[0].key, "Abigail");
    assert_eq!(festival[0].kind, "structured-record");
    assert_eq!(festival[1].key, "Alex");
    assert_eq!(festival[2].key, "mainEvent/cmd:2/speak/page:0");
    assert_eq!(festival[2].kind, "event-script");
    assert!(!festival[2].eligibility.prompt_eligible);
    assert_eq!(
        festival[2].text,
        "The glow of summer has faded, now... and the moonlight jellies carry on toward the great unknown."
    );
    assert!(festival.iter().all(|unit| unit.key != "$"
        && !unit.text.starts_with('{')
        && !unit.text.contains("/move ")));
    let event_units = extract(
        "Events/Town.xnb",
        &serde_json::json!({
            "10/f Abigail 1000": "none/-1000 -1000/farmer 1 2 2/speak Abigail \"Meet me by the moon.\"/move farmer 1 0 2/message \"Look up!\""
        }),
    )
    .unwrap();
    assert_eq!(
        event_units
            .iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (
                "10/f Abigail 1000/cmd:0/speak/page:0",
                "Meet me by the moon."
            ),
            ("10/f Abigail 1000/cmd:2/message", "Look up!"),
        ]
    );
    assert!(event_units.iter().all(|unit| unit.kind == "event-script"
        && !unit.eligibility.prompt_eligible
        && !unit.text.contains("/move ")));

    let locations = extract(
        "Strings/Locations.xnb",
        &serde_json::json!({
            "IslandSecret_Event_BirdieIntro":"tropical_island_day_ambient/-1000 -1000/farmer 20 58 3/skippable/pause 1000/speak Birdie \"Come closer, child.\"/move Birdie 0 1 2/textAboveHead Birdie \"Come...\"",
            "MoonlightJelliesBanner":"Moonlight Jellies"
        }),
    )
    .unwrap();
    assert!(locations.iter().all(|unit| !unit.text.contains("/pause ")));
    assert!(locations.iter().any(|unit| {
        unit.key == "IslandSecret_Event_BirdieIntro/cmd:2/speak/page:0"
            && unit.text == "Come closer, child."
            && unit.kind == "event-script"
            && !unit.eligibility.prompt_eligible
    }));
    assert!(locations.iter().any(|unit| {
        unit.key == "MoonlightJelliesBanner"
            && unit.text == "Moonlight Jellies"
            && unit.kind == "plain-text"
            && unit.eligibility.prompt_eligible
    }));

    let monsters = extract(
        "Data/Monsters.xnb",
        &serde_json::json!({"Dust Spirit":"40/6/0/0/false/1000/382 .5 433 .01/2/.00/4/3/.00/true/2/Dust Sprite"}),
    )
    .unwrap();
    assert_eq!(monsters.len(), 1);
    assert_eq!(monsters[0].key, "Dust Spirit/display-name");
    assert_eq!(monsters[0].text, "Dust Sprite");
    assert_eq!(monsters[0].kind, "term");

    let quests = extract(
        "Data/Quests.xnb",
        &serde_json::json!({"22":"Basic/Fish Casserole/Jodi swung by the farm to ask you to dinner at 7:00 PM./Enter Jodi's house with a largemouth bass at 7:00 PM./-1/-1/0/-1/true"}),
    )
    .unwrap();
    assert_eq!(
        quests
            .iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            ("22/title", "Fish Casserole"),
            (
                "22/description",
                "Jodi swung by the farm to ask you to dinner at 7:00 PM."
            ),
            (
                "22/objective",
                "Enter Jodi's house with a largemouth bass at 7:00 PM."
            ),
        ]
    );

    let bundles = extract(
        "Data/Bundles.xnb",
        &serde_json::json!({"Vault/23":"2,500g/O 220 3/-1 2500 2500/4///2,500g"}),
    )
    .unwrap();
    assert_eq!(bundles.len(), 1);
    assert_eq!(bundles[0].key, "Vault/23/display-name");
    assert_eq!(bundles[0].text, "2,500g");

    let boots = extract(
        "Data/Boots.xnb",
        &serde_json::json!({"878":"Crystal Shoes/These sparkling shoes will keep your feet very safe./1000/3/5/18/Crystal Shoes"}),
    )
    .unwrap();
    assert_eq!(
        boots
            .iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (
                "878/description",
                "These sparkling shoes will keep your feet very safe."
            ),
            ("878/display-name", "Crystal Shoes"),
        ]
    );

    let extra_dialogue = extract(
        "Data/ExtraDialogue.xnb",
        &serde_json::json!({
            "Morris_BuyMovieTheater":"Ah, our favorite customer...#$b#$q -1 -1#Invest 500,000g?$h#$r -1 -1 Yes#Yes#$r -1 -1 No#No"
        }),
    )
    .unwrap();
    assert_eq!(extra_dialogue.len(), 4);
    assert!(extra_dialogue.iter().all(|unit| {
        unit.kind == "dialogue"
            && unit.eligibility.prompt_eligible
            && !unit.text.contains("#$")
            && !unit.text.contains("$q")
            && !unit.text.contains("$r")
    }));

    let extra_dialogue_event = extract(
        "Data/ExtraDialogue.xnb",
        &serde_json::json!({
            "SkullCavern_100_event":"clubloop/-100 -100/farmer 6 6 2 MrQi 10 7 0/pause 500/speak MrQi \"You made it.#$b#Come closer.\"/animate MrQi false false 100 0 1/pause 500/end"
        }),
    )
    .unwrap();
    assert_eq!(
        extra_dialogue_event
            .iter()
            .map(|unit| (
                unit.text.as_str(),
                unit.kind,
                unit.eligibility.prompt_eligible
            ))
            .collect::<Vec<_>>(),
        [
            ("You made it.", "event-script", false),
            ("Come closer.", "event-script", false),
        ]
    );

    let secret_notes = extract(
        "Data/SecretNotes.xnb",
        &serde_json::json!({
            "4":"It's a note^^*Gold Bar^*Diamond%revealtaste:Maru:336%revealtaste:Maru:72"
        }),
    )
    .unwrap();
    assert!(secret_notes.iter().all(|unit| {
        !unit.text.contains('^')
            && !unit.text.contains("%revealtaste")
            && !unit.text.starts_with('*')
    }));

    let paged_string = extract(
        "Strings/1_6_Strings.xnb",
        &serde_json::json!({
            "Fizz_Intro_1":"Nice to meet ya.#$b#I'm Fizz.$h#$b#Let's get to business.$b#No pressure.$h"
        }),
    )
    .unwrap();
    assert_eq!(
        paged_string
            .iter()
            .map(|unit| unit.text.as_str())
            .collect::<Vec<_>>(),
        [
            "Nice to meet ya.",
            "I'm Fizz.",
            "Let's get to business.",
            "No pressure."
        ]
    );

    let hats = extract(
        "Data/hats.xnb",
        &serde_json::json!({
            "41":"Emily's Magic Hat/Made with love by Emily. 100% organic!/false/true//Emily's Magic Hat/41"
        }),
    )
    .unwrap();
    assert_eq!(
        hats.iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str(), unit.kind))
            .collect::<Vec<_>>(),
        [
            (
                "41/description",
                "Made with love by Emily. 100% organic!",
                "plain-text"
            ),
            ("41/display-name", "Emily's Magic Hat", "term"),
        ]
    );

    let mail = extract(
        "Data/mail.xnb",
        &serde_json::json!({
            "Gus":"@!^I made you a little treat this morning. Dig in!^-Your friend, Gus %item id (O)224 1 (O)213 1 %%[#]A Gift From Gus",
            "NoTitle":"To Haley and Emily^I hope you are both well!"
        }),
    )
    .unwrap();
    assert!(mail.iter().all(|unit| !unit.key.starts_with("Gus/body/")));
    assert!(mail.iter().any(|unit| {
        unit.key == "Gus/body"
            && unit.text == "@!\nI made you a little treat this morning. Dig in!\n-Your friend, Gus"
            && unit.kind == "dialogue"
    }));
    assert!(mail.iter().any(|unit| {
        unit.key == "Gus/title" && unit.text == "A Gift From Gus" && unit.kind == "plain-text"
    }));
    assert_eq!(
        mail.iter()
            .filter(|unit| unit.key == "NoTitle/body")
            .map(|unit| unit.text.as_str())
            .collect::<Vec<_>>(),
        ["To Haley and Emily\nI hope you are both well!"]
    );
    assert!(mail.iter().all(|unit| {
        !unit.text.contains("%item")
            && !unit.text.contains("%revealtaste")
            && !unit.text.contains("[#]")
    }));

    let gift_tastes = extract(
        "Data/NPCGiftTastes.xnb",
        &serde_json::json!({
            "Caroline":"You got this just for me? I'm speechless./213 614 593 907/I really like this. Thank you!/-7 18 402/I don't really like this./-5 -79/No, no, no.../80 330/Oh, a present! Thank you.//",
            "Universal_Love":"74 434 446"
        }),
    )
    .unwrap();
    assert_eq!(
        gift_tastes
            .iter()
            .map(|unit| (unit.key.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (
                "Caroline/love/page:0",
                "You got this just for me? I'm speechless."
            ),
            ("Caroline/like/page:0", "I really like this. Thank you!"),
            ("Caroline/dislike/page:0", "I don't really like this."),
            ("Caroline/hate/page:0", "No, no, no..."),
            ("Caroline/neutral/page:0", "Oh, a present! Thank you."),
        ]
    );
    assert!(gift_tastes.iter().all(|unit| {
        unit.kind == "dialogue"
            && unit.eligibility.prompt_eligible
            && !unit.text.contains("213 614")
            && !unit.key.starts_with("Universal_")
    }));

    let mut binary = Vec::new();
    flatten(
        &serde_json::json!({"Data":"QUFB".repeat(100),"Text":"Readable text"}),
        "",
        &mut binary,
    );
    assert_eq!(binary, [("Text".into(), "Readable text".into())]);
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
        allow_literal_scan: false,
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
