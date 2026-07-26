use super::*;

#[test]
fn parses_quoted_slashes_dialogue_pages_and_escaped_quotes() {
    let value = serde_json::json!({
        "10/f Abigail 1000": "spring_day_ambient/-1000 -1000/farmer 1 2 2 Abigail 3 4 1/speak Abigail \"Visit https://example.test/a/b#$b#She said \\\"hello\\\".$h\"/pause 500"
    });
    let events = parse_event_asset(&value).unwrap();
    assert_eq!(events[0].commands.len(), 2);
    assert_eq!(
        events[0].commands[0].dialogue_pages.as_ref().unwrap()[0].text,
        "Visit https://example.test/a/b"
    );
    assert_eq!(
        events[0].commands[0].dialogue_pages.as_ref().unwrap()[1].text,
        "She said \"hello\"."
    );
}

#[test]
fn extracts_only_visible_event_text_with_stable_command_keys() {
    let value = serde_json::json!({
        "20": "none/-1000 -1000/farmer 1 2 2/speak Elliott \"$q 1 null#Which book?#$r 1 1 a#Mystery#$r 2 1 b#Romance\"/move farmer 1 0 2/message \"Look up!\"/textAboveHead Abigail \"Moon!\"/end dialogue Leah \"Good night.#$b#See you.\""
    });
    let units = extract_visible_text(&value).unwrap();
    assert_eq!(
        units,
        vec![
            ("20/cmd:0/speak/prompt".into(), "Which book?".into()),
            ("20/cmd:0/speak/choice:0".into(), "Mystery".into()),
            ("20/cmd:0/speak/choice:1".into(), "Romance".into()),
            ("20/cmd:2/message".into(), "Look up!".into()),
            ("20/cmd:3/textAboveHead".into(), "Moon!".into()),
            ("20/cmd:4/end/page:0".into(), "Good night.".into()),
            ("20/cmd:4/end/page:1".into(), "See you.".into()),
        ]
    );
}

#[test]
fn extracts_quick_question_labels_and_visible_branch_messages() {
    let command = parse_event_command(
        "quickQuestion \"Hold the lantern?#Yes#No(break)glow farmer\\message You steady the light.(break)screenFlash\"",
        0,
    );
    assert_eq!(command.prompt.as_deref(), Some("Hold the lantern?"));
    assert_eq!(
        command.choices.as_ref().unwrap()[0].branch_raw_commands,
        ["glow farmer", "message You steady the light."]
    );
    let value = serde_json::json!({ "30": format!("none/-1 -1/farmer 0 0 2/{}", command.raw) });
    let units = extract_visible_text(&value).unwrap();
    assert!(units.contains(&(
        "30/cmd:0/quickQuestion/prompt".into(),
        "Hold the lantern?".into()
    )));
    assert!(units.contains(&("30/cmd:0/quickQuestion/choice:0".into(), "Yes".into())));
    assert!(
        units
            .iter()
            .any(|(_, text)| text == "You steady the light.")
    );
}

#[test]
fn rejects_non_object_event_assets() {
    let error = parse_event_asset(&serde_json::json!([])).unwrap_err();
    assert!(error.to_string().contains("root must be a JSON object"));
}

#[test]
fn extracts_dialogue_pages_questions_and_choices_without_control_markup() {
    let raw = "Ah, our favorite customer...#$b#$q -1 -1#Invest 500,000g?$h#$r -1 -1 Yes#Yes#$r -1 -1 No#No";
    assert_eq!(
        extract_dialogue_visible_text("Morris_BuyMovieTheater", raw),
        [
            (
                "Morris_BuyMovieTheater/page:0".into(),
                "Ah, our favorite customer...".into()
            ),
            (
                "Morris_BuyMovieTheater/prompt".into(),
                "Invest 500,000g?".into()
            ),
            ("Morris_BuyMovieTheater/choice:0".into(), "Yes".into()),
            ("Morris_BuyMovieTheater/choice:1".into(), "No".into()),
        ]
    );
}

#[test]
fn detects_and_extracts_command_lists_embedded_in_structured_assets() {
    let script = "pause 500/globalFade/viewport -1000 -1000/speak Lewis \"The moon is here.\"/move Lewis 0 1 2/message \"Look up!\"/festivalEnd/end";
    assert!(looks_like_event_script(script));
    assert_eq!(
        extract_visible_text_from_script("mainEvent", script),
        [
            (
                "mainEvent/cmd:3/speak/page:0".into(),
                "The moon is here.".into()
            ),
            ("mainEvent/cmd:5/message".into(), "Look up!".into()),
        ]
    );
    assert!(!looks_like_event_script(
        "The moonlight jellies are close.../and beautiful."
    ));

    let malformed = "If I hadn't met you...#$b#I'd be lost.$h\"/emote farmer 16/pause 1000/speak Shane \"But I'm doing better now.\"";
    assert!(looks_like_event_script(malformed));
    assert_eq!(
        extract_visible_text_from_script("SummitEvent_Dialogue3_Shane", malformed),
        [
            (
                "SummitEvent_Dialogue3_Shane/leading-text/page:0".into(),
                "If I hadn't met you...".into()
            ),
            (
                "SummitEvent_Dialogue3_Shane/leading-text/page:1".into(),
                "I'd be lost.".into()
            ),
            (
                "SummitEvent_Dialogue3_Shane/cmd:3/speak/page:0".into(),
                "But I'm doing better now.".into()
            ),
        ]
    );
}
