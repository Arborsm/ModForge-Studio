use super::*;

fn assert_round_trip(asset: &str, source: Value) -> StructuredTranslationDocument {
    let document = parse(asset, &source).unwrap().unwrap();
    assert_eq!(
        document.apply_translations(&HashMap::new()).unwrap(),
        source
    );
    document
}

#[test]
fn legacy_slash_records_preserve_all_protocol_fields() {
    let cases = [
        (
            "Data/Monsters.xnb",
            serde_json::json!({"Dust Spirit":"40/6/0/0/false/1000/382 .5 433 .01/2/.00/4/3/.00/true/2/Dust Sprite"}),
        ),
        (
            "Data/Quests.xnb",
            serde_json::json!({"22":"Basic/Fish Casserole/Description/Objective/-1/-1/0/-1/true"}),
        ),
        (
            "Data/Bundles.xnb",
            serde_json::json!({"Vault/23":"2,500g/O 220 3/-1 2500 2500/4///2,500g"}),
        ),
        (
            "Data/Boots.xnb",
            serde_json::json!({"878":"Crystal Shoes/Safe shoes./1000/3/5/18/Crystal Shoes"}),
        ),
        (
            "Data/hats.xnb",
            serde_json::json!({"41":"Magic Hat/Made with love./false/true//Magic Hat/41"}),
        ),
    ];
    for (asset, source) in cases {
        let document = assert_round_trip(asset, source.clone());
        let translations = document
            .units()
            .iter()
            .map(|unit| (unit.id.clone(), format!("译：{}", unit.text)))
            .collect();
        let restored = document.apply_translations(&translations).unwrap();
        let original = source
            .as_object()
            .unwrap()
            .values()
            .next()
            .unwrap()
            .as_str()
            .unwrap();
        let translated = restored
            .as_object()
            .unwrap()
            .values()
            .next()
            .unwrap()
            .as_str()
            .unwrap();
        assert_eq!(
            original.matches('/').count(),
            translated.matches('/').count()
        );
    }
}

#[test]
fn mail_restores_commands_page_breaks_and_title_marker_in_place() {
    let source = serde_json::json!({
        "Gus":"[letterbg 2][textcolor blue]Dear @, this is 100% organic.^A little %unknown treat. %action AddMail test %% %item id (O)224 1 %%Enjoy it.^-Gus[#]A Gift From Gus",
        "Festival":"Your secret friend is: %secretsanta.^Don't tell anyone![#]Secret Gift-Giver",
        "Gendered":"[letterbg]Dear ${sir^madam^friend}$.¦Greetings ${mister¦miss¦friend}$, unknown [textcolor] remains.[#]A Formal Letter",
        "Malformed":"This incomplete %item command and [letterbg nope] stay readable.[#]Broken Reward"
    });
    let document = assert_round_trip("Data/mail.xnb", source);
    assert!(
        document
            .units()
            .iter()
            .all(|unit| !unit.text.contains("%item id (O)224 1 %%")
                && !unit.text.contains("%action AddMail test %%")
                && !unit.text.contains("[letterbg 2]")
                && !unit.text.contains("[textcolor blue]"))
    );
    assert!(
        document
            .units()
            .iter()
            .any(|unit| unit.text.contains("%item command"))
    );
    let translations = document
        .units()
        .iter()
        .map(|unit| (unit.id.clone(), format!("译{}", unit.text)))
        .collect();
    let restored = document.apply_translations(&translations).unwrap();
    let gus = restored["Gus"].as_str().unwrap();
    assert!(gus.contains("%item id (O)224 1 %%"));
    assert!(gus.contains("%action AddMail test %%"));
    assert!(gus.contains('@'));
    assert!(gus.contains("100% organic"));
    assert!(gus.contains("%unknown"));
    assert!(gus.contains("[letterbg 2][textcolor blue]"));
    assert!(gus.contains("[#]"));
    assert_eq!(gus.matches('^').count(), 2);
    assert!(
        restored["Festival"]
            .as_str()
            .unwrap()
            .contains("%secretsanta")
    );
    assert!(
        restored["Malformed"]
            .as_str()
            .unwrap()
            .contains("%item command and [letterbg nope]")
    );
    let gendered = restored["Gendered"].as_str().unwrap();
    assert!(gendered.contains("${译sir^译madam^译friend}$"));
    assert!(gendered.contains("¦译Greetings ${译mister¦译miss¦译friend}$"));
    assert!(gendered.contains("[letterbg]"));
    assert!(gendered.contains("[textcolor]"));
}

#[test]
fn current_monster_layout_is_required_before_exposing_display_name() {
    let source = serde_json::json!({
        "Current":"40/6/0/0/false/1000/382 .5/2/.00/4/3/.00/true/2/Dust Sprite",
        "InvalidRuntime":"40/6/0/0/not-a-bool/1000/382 nope/2/.00/4/3/.00/true/2/Not A Monster",
        "Obsolete":"40/6/0/false/1000/382 .5/true/2/Not A Current Record"
    });
    let document = assert_round_trip("Data/Monsters.xnb", source);
    assert_eq!(
        document
            .units()
            .iter()
            .map(|unit| unit.id.as_str())
            .collect::<Vec<_>>(),
        ["Current/display-name"]
    );
}

#[test]
fn mail_exposes_one_stable_corpus_body_without_changing_round_trip_parts() {
    let source = serde_json::json!({
        "RobinCooking":"Dear @,^here is an old recipe.   ^   -Robin%item cookingRecipe %%[#]Robin's Family Recipe"
    });
    let document = assert_round_trip("Data/mail.xnb", source);
    assert_eq!(
        document
            .units()
            .iter()
            .map(|unit| unit.id.as_str())
            .collect::<Vec<_>>(),
        [
            "RobinCooking/body/part:0",
            "RobinCooking/body/part:1",
            "RobinCooking/body/part:2",
            "RobinCooking/title",
        ]
    );
    assert_eq!(
        document
            .corpus_units()
            .iter()
            .map(|unit| (unit.id.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            (
                "RobinCooking/body",
                "Dear @,\nhere is an old recipe.\n-Robin"
            ),
            ("RobinCooking/title", "Robin's Family Recipe"),
        ]
    );
}

#[test]
fn unknown_legacy_slash_layouts_remain_opaque() {
    let source = serde_json::json!({
        "Quest":"Basic/Title/Description/Objective/Target/next/not-a-number/reward/maybe",
        "GiftTaste":"Love/not-an-id/Like/2/Dislike/3/Hate/4/Neutral/"
    });
    let quests = assert_round_trip("Data/Quests.xnb", source.clone());
    assert!(quests.units().is_empty());
    let tastes = assert_round_trip("Data/NPCGiftTastes.xnb", source);
    assert!(tastes.units().is_empty());
}

#[test]
fn gift_tastes_restores_dialogue_item_id_pairs() {
    let source = serde_json::json!({
        "Caroline":"Love line/(O)213 Book_PriceCatalogue/Like line/-7 18/Dislike line/-5 -79/Hate line/80 330/Neutral line//"
    });
    let document = assert_round_trip("Data/NPCGiftTastes.xnb", source);
    assert_eq!(document.units().len(), 5);
    let translations = document
        .units()
        .iter()
        .map(|unit| (unit.id.clone(), format!("译{}", unit.text)))
        .collect();
    let restored = document.apply_translations(&translations).unwrap();
    let value = restored["Caroline"].as_str().unwrap();
    assert_eq!(
        value,
        "译Love line/(O)213 Book_PriceCatalogue/译Like line/-7 18/译Dislike line/-5 -79/译Hate line/80 330/译Neutral line//"
    );
}

#[test]
fn extra_dialogue_preserves_branch_markup() {
    let source = serde_json::json!({
        "Morris":"Welcome.#$b#$q -1 -1#Invest ${sir^madam}$?$h#$r -1 -1 Yes#${Yes^Oui}$#$r -1 -1 No#No"
    });
    let document = assert_round_trip("Data/ExtraDialogue.xnb", source);
    assert_eq!(
        document
            .units()
            .iter()
            .map(|unit| unit.text.as_str())
            .collect::<Vec<_>>(),
        ["Welcome.", "Invest", "sir", "madam", "Yes", "Oui", "No"]
    );
    let translations = document
        .units()
        .iter()
        .map(|unit| (unit.id.clone(), format!("译{}", unit.text)))
        .collect();
    let restored = document.apply_translations(&translations).unwrap();
    assert_eq!(
        restored["Morris"],
        "译Welcome.#$b#$q -1 -1#译Invest ${译sir^译madam}$?$h#$r -1 -1 Yes#${译Yes^译Oui}$#$r -1 -1 No#译No"
    );
}

#[test]
fn extra_dialogue_keeps_all_dll_command_arguments_opaque() {
    let source = serde_json::json!({
        "Commands":"Before#$p answered#After|Fallback#$d cc#Done#$t topic 3#End",
        "Quick":"$y 'Question_Yes_Great!*Again_No_Okay'",
        "Gender":"Welcome ${sir^madam^friend}$.^Farewell¦Goodbye",
        "Query":"$query TRUE#Yes|No"
    });
    let document = assert_round_trip("Data/ExtraDialogue.xnb", source);
    assert_eq!(
        document
            .units()
            .iter()
            .map(|unit| (unit.id.as_str(), unit.text.as_str()))
            .collect::<Vec<_>>(),
        [
            ("Commands/page:0", "Before"),
            ("Commands/page:1", "After"),
            ("Commands/page:2", "Fallback"),
            ("Commands/page:3", "Done"),
            ("Commands/page:4", "End"),
            ("Gender/page:0", "Welcome"),
            ("Gender/gender:0/branch:0", "sir"),
            ("Gender/gender:0/branch:1", "madam"),
            ("Gender/gender:0/branch:2", "friend"),
            ("Gender/page:2", "Farewell"),
            ("Gender/page:3", "Goodbye"),
            ("Query/page:1", "Yes"),
            ("Query/page:2", "No"),
            ("Quick/quick:0/part:0", "Question"),
            ("Quick/quick:1/part:0", "Yes"),
            ("Quick/quick:2/part:0", "Great!"),
            ("Quick/quick:2/part:1", "Again"),
            ("Quick/quick:3/part:0", "No"),
            ("Quick/quick:4/part:0", "Okay"),
        ]
    );
}

#[test]
fn extra_dialogue_keeps_embedded_event_scripts_opaque_for_lossless_round_trip() {
    let source = serde_json::json!({
        "SkullCavern_100_event":"clubloop/-100 -100/farmer 6 6 2 MrQi 10 7 0/pause 3500/speak MrQi \"Well, well... you made it.#$b#Come closer.\"/message \"The taste is awful.\"/pause 500/end"
    });
    let document = assert_round_trip("Data/ExtraDialogue.xnb", source);
    assert!(document.units().is_empty());
}

#[test]
fn secret_notes_preserve_layout_and_reveal_commands() {
    let source = serde_json::json!({
        "10":"Someone is ^    waiting for you ^        on level 100 ^         in^          the^             skull cavern...",
        "4":"[letterbg 1]It's 100% Maru's note^^Parts %unknown still needed!\n*Gold Bar^*Diamond%revealtaste:Maru:336%revealtaste:Maru:72"
    });
    let document = assert_round_trip("Data/SecretNotes.xnb", source);
    assert!(document.units().iter().all(|unit| {
        !unit.text.contains('^') && !unit.text.contains('\n') && !unit.text.contains("%revealtaste")
    }));
    assert!(
        document
            .units()
            .iter()
            .all(|unit| !unit.text.starts_with('*'))
    );
    let translations = document
        .units()
        .iter()
        .map(|unit| (unit.id.clone(), format!("译{}", unit.text)))
        .collect();
    let restored = document.apply_translations(&translations).unwrap();
    assert_eq!(restored["10"].as_str().unwrap().matches('^').count(), 5);
    assert_eq!(restored["4"].as_str().unwrap().matches('^').count(), 3);
    assert_eq!(restored["4"].as_str().unwrap().matches('\n').count(), 1);
    assert!(
        restored["4"]
            .as_str()
            .unwrap()
            .ends_with("%revealtaste:Maru:336%revealtaste:Maru:72")
    );
    assert!(restored["4"].as_str().unwrap().contains("100%"));
    assert!(restored["4"].as_str().unwrap().contains("%unknown"));
    assert!(restored["4"].as_str().unwrap().contains("[letterbg 1]"));
}

#[test]
fn secret_note_images_remain_opaque() {
    let document = assert_round_trip(
        "Data/SecretNotes.xnb",
        serde_json::json!({"1004":"!image 10", "1005":"Visible note"}),
    );
    assert!(document.units().iter().all(|unit| unit.id != "1004"));
    assert_eq!(
        document
            .units()
            .iter()
            .map(|unit| unit.text.as_str())
            .collect::<Vec<_>>(),
        ["Visible note"]
    );
}

#[cfg(feature = "installed-game-validation")]
#[test]
#[ignore = "manual regression against installed Stardew Valley mail assets"]
fn installed_mail_locales_use_stable_corpus_keys_and_round_trip_losslessly() {
    let game_root = std::env::var_os("SDV_GAME_PATH")
        .map(std::path::PathBuf::from)
        .expect("set SDV_GAME_PATH to an installed Stardew Valley directory");
    let content = game_root.join("Content");
    let source = crate::infrastructure::game_formats::xnb::read_xnb_from_path(
        &content.join("Data/mail.xnb"),
    )
    .unwrap()
    .content
    .to_json();
    let target = crate::infrastructure::game_formats::xnb::read_xnb_from_path(
        &content.join("Data/mail.zh-CN.xnb"),
    )
    .unwrap()
    .content
    .to_json();
    let source_document = assert_round_trip("Data/mail.xnb", source.clone());
    let target_document = assert_round_trip("Data/mail.xnb", target.clone());

    let source_keys = source_document
        .corpus_units()
        .iter()
        .map(|unit| unit.id.as_str())
        .collect::<Vec<_>>();
    let target_keys = target_document
        .corpus_units()
        .iter()
        .map(|unit| unit.id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(source_keys, target_keys);
    assert!(source_keys.iter().all(|key| !key.contains("/body/part:")));
    assert!(source_keys.contains(&"elliottLetter3/body"));
    assert!(source_keys.contains(&"elliottLetter3/title"));

    let source_pages = source["elliottLetter3"]
        .as_str()
        .unwrap()
        .matches('^')
        .count();
    let target_pages = target["elliottLetter3"]
        .as_str()
        .unwrap()
        .matches('^')
        .count();
    assert_ne!(source_pages, target_pages);
}

#[cfg(feature = "installed-game-validation")]
#[test]
#[ignore = "manual regression against installed Stardew Valley structured assets"]
fn installed_structured_assets_match_current_dll_layouts() {
    let game_root = std::env::var_os("SDV_GAME_PATH")
        .map(std::path::PathBuf::from)
        .expect("set SDV_GAME_PATH to an installed Stardew Valley directory");
    let content = game_root.join("Content/Data");
    let read = |name: &str| {
        crate::infrastructure::game_formats::xnb::read_xnb_from_path(&content.join(name))
            .unwrap()
            .content
            .to_json()
    };

    let secret_notes = assert_round_trip("Data/SecretNotes.xnb", read("SecretNotes.xnb"));
    assert!(
        secret_notes
            .units()
            .iter()
            .all(|unit| !unit.text.starts_with("!image"))
    );

    let monsters = assert_round_trip("Data/Monsters.xnb", read("Monsters.xnb"));
    assert_eq!(monsters.units().len(), 51);
    assert!(
        monsters
            .units()
            .iter()
            .all(|unit| unit.id.ends_with("/display-name"))
    );
}
