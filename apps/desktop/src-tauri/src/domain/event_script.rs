use anyhow::Context;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::LazyLock;

static DIALOGUE_PAGE_BREAK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)#?\$(?:b|e)#").expect("valid dialogue page regex"));
static GENDER_SWITCH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\$\{([^{}]+)\}\$").expect("valid dialogue gender switch regex"));

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventBranchChoice {
    pub id: String,
    pub label: String,
    pub branch_raw_commands: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDialoguePage {
    pub id: String,
    pub text: String,
    pub portrait_index: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedDialogueQuestion {
    pub prompt: String,
    pub choices: Vec<EventBranchChoice>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventCommand {
    pub id: String,
    pub index: usize,
    pub raw: String,
    pub command: String,
    pub args: Vec<String>,
    pub kind: String,
    pub title: String,
    pub detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actor_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dialogue_pages: Option<Vec<EventDialoguePage>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frame: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_frames: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_flip: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_loop: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub animation_frame_duration_ms: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delay_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub question_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub choices: Option<Vec<EventBranchChoice>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embedded_question: Option<EmbeddedDialogueQuestion>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_event_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_condition_id: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_translation_key: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fork_choice_index: Option<Option<usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait_suffix: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sprite_suffix: Option<Option<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSceneActor {
    pub id: String,
    pub actor_name: String,
    pub tile_x: i32,
    pub tile_y: i32,
    pub facing_direction: i32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSceneSetup {
    pub music_cue: Option<String>,
    pub camera_instruction: Option<String>,
    pub character_instruction: Option<String>,
    pub actors: Vec<EventSceneActor>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventScript {
    pub key: String,
    pub event_id: String,
    pub preconditions: Vec<String>,
    pub raw_script: String,
    pub raw_segments: Vec<String>,
    pub scene: EventSceneSetup,
    pub commands: Vec<EventCommand>,
}

fn split_outside_quotes(source: &str, delimiter: &str) -> Vec<String> {
    let chars: Vec<(usize, char)> = source.char_indices().collect();
    let mut result = Vec::new();
    let mut start = 0;
    let mut in_quotes = false;
    let mut cursor = 0;
    while cursor < chars.len() {
        let (byte_index, character) = chars[cursor];
        let escaped = cursor > 0 && chars[cursor - 1].1 == '\\';
        if character == '"' && !escaped {
            in_quotes = !in_quotes;
            cursor += 1;
            continue;
        }
        if !in_quotes && source[byte_index..].starts_with(delimiter) {
            result.push(source[start..byte_index].trim().to_string());
            start = byte_index + delimiter.len();
            while cursor < chars.len() && chars[cursor].0 < start {
                cursor += 1;
            }
            continue;
        }
        cursor += 1;
    }
    result.push(source[start..].trim().to_string());
    result
}

fn split_space_quote_aware(source: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut previous = '\0';
    for character in source.chars() {
        if character == '"' && previous != '\\' {
            in_quotes = !in_quotes;
            current.push(character);
        } else if !in_quotes && character.is_whitespace() {
            if !current.trim().is_empty() {
                result.push(current.trim().to_string());
            }
            current.clear();
        } else {
            current.push(character);
        }
        previous = character;
    }
    if !current.trim().is_empty() {
        result.push(current.trim().to_string());
    }
    result
}

fn strip_outer_quotes(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        value[1..value.len() - 1].replace("\\\"", "\"")
    } else {
        value.to_string()
    }
}

fn truncate(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    if chars.len() <= 88 {
        return value.to_string();
    }
    format!("{}...", chars[..85].iter().collect::<String>())
}

fn strip_portrait_command(value: &str) -> (String, u32) {
    let mut text = value.trim().to_string();
    let mut portrait_index = 0;
    loop {
        let Some(command_start) = text.rfind('$') else {
            break;
        };
        let command = &text[command_start + 1..];
        let parsed =
            command
                .parse::<u32>()
                .ok()
                .or_else(|| match command.to_ascii_lowercase().as_str() {
                    "h" => Some(1),
                    "s" => Some(2),
                    "u" => Some(3),
                    "l" => Some(4),
                    "a" => Some(5),
                    _ => None,
                });
        let Some(parsed) = parsed else { break };
        portrait_index = parsed;
        text.truncate(command_start);
        text = text.trim_end().to_string();
    }
    (text, portrait_index)
}

pub(crate) fn parse_dialogue_pages(raw: &str) -> Vec<EventDialoguePage> {
    let normalized = GENDER_SWITCH
        .replace_all(raw, |captures: &regex::Captures<'_>| {
            captures[1]
                .split('^')
                .next()
                .unwrap_or_default()
                .to_string()
        })
        .replace("\\n", "\n");
    let mut pages = Vec::new();
    for (index, page) in DIALOGUE_PAGE_BREAK.split(&normalized).enumerate() {
        let page = page.trim();
        if page.is_empty() {
            continue;
        }
        let (text, portrait_index) = strip_portrait_command(page);
        pages.push(EventDialoguePage {
            id: format!("page:{index}"),
            text: if text.is_empty() {
                page.to_string()
            } else {
                text
            },
            portrait_index,
        });
    }
    pages
}

fn embedded_dialogue_question(raw: &str) -> Option<EmbeddedDialogueQuestion> {
    let question = raw.find("$q")?;
    let payload = &raw[question..];
    let prompt_start = payload.find('#')? + 1;
    let body = &payload[prompt_start..];
    let mut sections = body.split("#$r");
    let prompt = sections
        .next()?
        .trim()
        .trim_end_matches('#')
        .trim()
        .to_string();
    let choices = sections
        .enumerate()
        .filter_map(|(index, section)| {
            let label = section
                .split_once('#')?
                .1
                .trim()
                .trim_end_matches('#')
                .trim();
            (!label.is_empty()).then(|| EventBranchChoice {
                id: format!("choice:{index}"),
                label: label.to_string(),
                branch_raw_commands: Vec::new(),
            })
        })
        .collect::<Vec<_>>();
    (!prompt.is_empty() && !choices.is_empty())
        .then_some(EmbeddedDialogueQuestion { prompt, choices })
}

/// Extracts user-visible pages, prompts, and choices from Stardew dialogue markup.
#[cfg(test)]
pub(crate) fn extract_dialogue_visible_text(unit_key: &str, raw: &str) -> Vec<(String, String)> {
    let mut output = Vec::new();
    if let Some(question_start) = raw.find("$q") {
        let leading = raw[..question_start]
            .trim()
            .trim_end_matches("#$b#")
            .trim_end_matches("#$e#")
            .trim();
        for (index, page) in parse_dialogue_pages(leading).iter().enumerate() {
            push_text(&mut output, format!("{unit_key}/page:{index}"), &page.text);
        }
        if let Some(question) = embedded_dialogue_question(&raw[question_start..]) {
            let (prompt, _) = strip_portrait_command(&question.prompt);
            push_text(&mut output, format!("{unit_key}/prompt"), &prompt);
            for (index, choice) in question.choices.iter().enumerate() {
                let (label, _) = strip_portrait_command(&choice.label);
                push_text(&mut output, format!("{unit_key}/choice:{index}"), &label);
            }
        }
    } else {
        for (index, page) in parse_dialogue_pages(raw).iter().enumerate() {
            push_text(&mut output, format!("{unit_key}/page:{index}"), &page.text);
        }
    }
    output
}

fn quick_question(raw: &str) -> (String, Vec<EventBranchChoice>) {
    let payload = raw
        .split_once(' ')
        .map(|(_, value)| value)
        .unwrap_or_default();
    let payload = strip_outer_quotes(payload);
    let sections = if payload.contains("(break)") {
        payload.split("(break)").map(str::trim).collect::<Vec<_>>()
    } else {
        payload.split('\\').map(str::trim).collect::<Vec<_>>()
    };
    let labels = sections
        .first()
        .copied()
        .unwrap_or_default()
        .split('#')
        .collect::<Vec<_>>();
    let prompt = strip_outer_quotes(labels.first().copied().unwrap_or_default());
    let choices = labels
        .iter()
        .skip(1)
        .enumerate()
        .map(|(index, label)| EventBranchChoice {
            id: format!("choice:{index}"),
            label: strip_outer_quotes(label),
            branch_raw_commands: split_outside_quotes(
                sections.get(index + 1).copied().unwrap_or_default(),
                "\\",
            ),
        })
        .collect();
    (prompt, choices)
}

fn question(args: &[String]) -> (String, String, Vec<EventBranchChoice>, Option<usize>) {
    let question_key = args.get(1).cloned().unwrap_or_default();
    let labels = split_outside_quotes(args.get(2).map(String::as_str).unwrap_or_default(), "#");
    let prompt = labels.first().cloned().unwrap_or_default();
    let fork_choice_index = question_key
        .strip_prefix("fork")
        .and_then(|value| value.parse::<usize>().ok());
    let choices = labels
        .into_iter()
        .skip(1)
        .enumerate()
        .map(|(index, label)| EventBranchChoice {
            id: format!("choice:{index}"),
            label,
            branch_raw_commands: Vec::new(),
        })
        .collect();
    (question_key, prompt, choices, fork_choice_index)
}

fn command_kind(command: &str) -> &'static str {
    match command {
        "speak" | "splitSpeak" => "dialogue",
        "message" | "textAboveHead" => "message",
        "question" | "quickQuestion" | "catQuestion" | "cave" => "choice",
        "fork" | "switchEvent" => "branch",
        "pause" | "waitForAllStationary" | "waitForOtherPlayers" => "timing",
        "end" | "beginSimultaneousCommand" | "endSimultaneousCommand" => "flow",
        _ => "action",
    }
}

fn humanize(command: &str) -> String {
    let mut output = String::new();
    for (index, character) in command.chars().enumerate() {
        if index > 0 && character.is_uppercase() {
            output.push(' ');
        }
        if index == 0 {
            output.extend(character.to_uppercase());
        } else {
            output.push(character);
        }
    }
    if output.is_empty() {
        "Command".into()
    } else {
        output
    }
}

fn command_title(command: &str, args: &[String]) -> String {
    match command {
        "speak" => format!(
            "Speak | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "splitSpeak" => format!(
            "Split Speak | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "changePortrait" => format!(
            "Change Portrait | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "changeSprite" => format!(
            "Change Sprite | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "pause" => format!(
            "Pause | {} ms",
            args.get(1).map(String::as_str).unwrap_or("0")
        ),
        "animate" => format!(
            "Animate | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "stopAnimation" => format!(
            "Stop Animation | {}",
            args.get(1).map(String::as_str).unwrap_or("Unknown")
        ),
        "fork" => format!(
            "Fork | {}",
            args.get(2)
                .or(args.get(1))
                .map(String::as_str)
                .unwrap_or("target")
        ),
        "switchEvent" => format!(
            "Switch Event | {}",
            args.get(1).map(String::as_str).unwrap_or("target")
        ),
        "end" if args.get(1).is_some_and(|value| value == "dialogue") => format!(
            "End Dialogue | {}",
            args.get(2).map(String::as_str).unwrap_or("Unknown")
        ),
        _ => humanize(command),
    }
}

fn dialogue_summary(raw: &str) -> String {
    let pages = parse_dialogue_pages(raw);
    let first = pages.first().map(|page| page.text.as_str()).unwrap_or(raw);
    if pages.len() > 1 {
        truncate(&format!("{first} (+{} more)", pages.len() - 1))
    } else {
        truncate(first)
    }
}

fn command_detail(command: &str, args: &[String], raw: &str) -> String {
    match command {
        "speak" | "splitSpeak" => {
            dialogue_summary(args.get(2).map(String::as_str).unwrap_or_default())
        }
        "message" => truncate(&args.iter().skip(1).cloned().collect::<Vec<_>>().join(" ")),
        "textAboveHead" => truncate(&args.iter().skip(2).cloned().collect::<Vec<_>>().join(" ")),
        "changePortrait" | "changeSprite" => {
            let actor = args.get(1).map(String::as_str).unwrap_or("actor");
            args.get(2)
                .map(|value| format!("{actor} -> {value}"))
                .unwrap_or_else(|| format!("{actor} -> default"))
        }
        "move" => {
            let groups = args
                .iter()
                .skip(1)
                .collect::<Vec<_>>()
                .chunks(4)
                .filter_map(|group| {
                    (group.len() == 4).then(|| {
                        format!(
                            "{} -> ({}, {}) dir {}",
                            group[0], group[1], group[2], group[3]
                        )
                    })
                })
                .collect::<Vec<_>>()
                .join(" | ");
            if groups.is_empty() {
                truncate(&args.iter().skip(1).cloned().collect::<Vec<_>>().join(" "))
            } else {
                truncate(&groups)
            }
        }
        "warp" => format!(
            "{} -> ({}, {})",
            args.get(1).map(String::as_str).unwrap_or("actor"),
            args.get(2).map(String::as_str).unwrap_or("?"),
            args.get(3).map(String::as_str).unwrap_or("?")
        ),
        "faceDirection" => format!(
            "{} -> {}",
            args.get(1).map(String::as_str).unwrap_or("actor"),
            args.get(2).map(String::as_str).unwrap_or("?")
        ),
        "showFrame" => {
            let (actor, frame) = if args.len() == 2 {
                ("farmer", args.get(1).map(String::as_str).unwrap_or("?"))
            } else {
                (
                    args.get(1).map(String::as_str).unwrap_or("actor"),
                    args.get(2).map(String::as_str).unwrap_or("?"),
                )
            };
            format!("{actor} -> frame {frame}")
        }
        "viewport" => truncate(&args.iter().skip(1).cloned().collect::<Vec<_>>().join(" ")),
        "changeLocation" => args.get(1).cloned().unwrap_or_else(|| "current map".into()),
        "changeToTemporaryMap" => args
            .get(1)
            .cloned()
            .unwrap_or_else(|| "temporary map".into()),
        "pause" => format!("{} ms", args.get(1).map(String::as_str).unwrap_or("0")),
        "animate" => format!(
            "{} | {} frames @ {} ms",
            args.get(1).map(String::as_str).unwrap_or("actor"),
            args.len().saturating_sub(5),
            args.get(4).map(String::as_str).unwrap_or("?")
        ),
        "stopAnimation" => {
            let actor = args.get(1).map(String::as_str).unwrap_or("actor");
            args.get(2)
                .map(|frame| format!("{actor} -> frame {frame}"))
                .unwrap_or_else(|| format!("{actor} -> stop"))
        }
        "question" => {
            let (_, prompt, choices, fork) = question(args);
            format!(
                "{} | {} choices{}",
                truncate(&prompt),
                choices.len(),
                fork.map(|value| format!(" | fork {value}"))
                    .unwrap_or_default()
            )
        }
        "quickQuestion" => {
            let (prompt, choices) = quick_question(raw);
            format!("{} | {} branches", truncate(&prompt), choices.len())
        }
        "fork" if args.len() >= 3 => format!("if {} -> {}", args[1], args[2]),
        "fork" => format!(
            "if event flag -> {}",
            args.get(1).map(String::as_str).unwrap_or_default()
        ),
        "switchEvent" => args.get(1).cloned().unwrap_or_default(),
        "end" if args.get(1).is_some_and(|value| value == "dialogue") => {
            dialogue_summary(args.get(3).map(String::as_str).unwrap_or_default())
        }
        _ => truncate(&args.iter().skip(1).cloned().collect::<Vec<_>>().join(" ")),
    }
}

pub(crate) fn parse_event_command(raw: &str, index: usize) -> EventCommand {
    let args = split_space_quote_aware(raw)
        .into_iter()
        .map(|value| strip_outer_quotes(&value))
        .collect::<Vec<_>>();
    let command = args.first().cloned().unwrap_or_default();
    let mut parsed = EventCommand {
        id: format!("cmd:{index}"),
        index,
        raw: raw.to_string(),
        command: command.clone(),
        args: args.clone(),
        kind: command_kind(&command).into(),
        title: command_title(&command, &args),
        detail: command_detail(&command, &args, raw),
        actor_name: None,
        text: None,
        dialogue_pages: None,
        frame: None,
        animation_frames: None,
        animation_flip: None,
        animation_loop: None,
        animation_frame_duration_ms: None,
        delay_ms: None,
        question_key: None,
        prompt: None,
        choices: None,
        embedded_question: None,
        target_event_key: None,
        target_condition_id: None,
        is_translation_key: None,
        fork_choice_index: None,
        portrait_suffix: None,
        sprite_suffix: None,
    };
    match command.as_str() {
        "speak" | "splitSpeak" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.text = Some(args.get(2).cloned().unwrap_or_default());
            parsed.embedded_question = parsed.text.as_deref().and_then(embedded_dialogue_question);
            parsed.dialogue_pages = Some(if parsed.embedded_question.is_some() {
                Vec::new()
            } else {
                parse_dialogue_pages(parsed.text.as_deref().unwrap_or_default())
            });
        }
        "message" => parsed.text = Some(args.iter().skip(1).cloned().collect::<Vec<_>>().join(" ")),
        "textAboveHead" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.text = Some(args.iter().skip(2).cloned().collect::<Vec<_>>().join(" "));
        }
        "pause" => {
            parsed.delay_ms = Some(
                args.get(1)
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0.0),
            )
        }
        "changePortrait" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.portrait_suffix = Some(args.get(2).cloned());
        }
        "changeSprite" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.sprite_suffix = Some(args.get(2).cloned());
        }
        "animate" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.animation_flip = Some(args.get(2).is_some_and(|value| value == "true"));
            parsed.animation_loop = Some(args.get(3).is_some_and(|value| value == "true"));
            parsed.animation_frame_duration_ms = args.get(4).and_then(|value| value.parse().ok());
            parsed.animation_frames = Some(
                args.iter()
                    .skip(5)
                    .filter_map(|value| value.parse().ok())
                    .collect(),
            );
        }
        "stopAnimation" => {
            parsed.actor_name = args.get(1).cloned();
            parsed.frame = args.get(2).and_then(|value| value.parse().ok());
        }
        "question" => {
            let (key, prompt, choices, fork) = question(&args);
            parsed.question_key = Some(key);
            parsed.prompt = Some(prompt);
            parsed.choices = Some(choices);
            parsed.fork_choice_index = Some(fork);
        }
        "quickQuestion" => {
            let (prompt, choices) = quick_question(raw);
            parsed.question_key = Some("quickQuestion".into());
            parsed.prompt = Some(prompt);
            parsed.choices = Some(choices);
        }
        "end" if args.get(1).is_some_and(|value| value == "dialogue") => {
            parsed.actor_name = args.get(2).cloned();
            parsed.text = Some(args.get(3).cloned().unwrap_or_default());
            parsed.dialogue_pages = Some(parse_dialogue_pages(
                parsed.text.as_deref().unwrap_or_default(),
            ));
        }
        "fork" => {
            parsed.target_condition_id = Some(if args.len() >= 3 {
                args.get(1).cloned()
            } else {
                None
            });
            parsed.target_event_key = if args.len() >= 3 {
                args.get(2).cloned()
            } else {
                args.get(1).cloned()
            };
            parsed.is_translation_key = Some(args.get(3).is_some_and(|value| value == "true"));
        }
        "switchEvent" => parsed.target_event_key = args.get(1).cloned(),
        _ => {}
    }
    parsed
}

fn parse_scene(raw_segments: &[String]) -> EventSceneSetup {
    let character_instruction = raw_segments.get(2).cloned();
    let actor_tokens = character_instruction
        .as_deref()
        .map(split_space_quote_aware)
        .unwrap_or_default();
    let actors = actor_tokens
        .chunks(4)
        .enumerate()
        .filter_map(|(index, group)| {
            if group.len() != 4 {
                return None;
            }
            Some(EventSceneActor {
                id: format!("{}:{index}", group[0]),
                actor_name: group[0].clone(),
                tile_x: group[1].parse().ok()?,
                tile_y: group[2].parse().ok()?,
                facing_direction: group[3].parse().ok()?,
            })
        })
        .collect();
    EventSceneSetup {
        music_cue: raw_segments.first().cloned(),
        camera_instruction: raw_segments.get(1).cloned(),
        character_instruction,
        actors,
    }
}

fn is_known_event_command(command: &str) -> bool {
    matches!(
        command,
        "action"
            | "addTemporaryActor"
            | "advancedMove"
            | "animate"
            | "beginSimultaneousCommand"
            | "changeLocation"
            | "changePortrait"
            | "changeSprite"
            | "changeToTemporaryMap"
            | "end"
            | "endSimultaneousCommand"
            | "emote"
            | "faceDirection"
            | "fade"
            | "fork"
            | "globalFade"
            | "globalFadeToClear"
            | "jump"
            | "loadActors"
            | "message"
            | "move"
            | "pause"
            | "playMusic"
            | "playSound"
            | "positionOffset"
            | "question"
            | "quickQuestion"
            | "screenFlash"
            | "shake"
            | "showFrame"
            | "speak"
            | "splitSpeak"
            | "stopAnimation"
            | "stopMusic"
            | "stopSound"
            | "switchEvent"
            | "textAboveHead"
            | "viewport"
            | "waitForAllStationary"
            | "waitForOtherPlayers"
            | "warp"
            | "warpFarmers"
    )
}

fn split_embedded_event_script(raw: &str) -> Vec<String> {
    let strict = split_outside_quotes(raw, "/");
    if strict.len() >= 2 {
        return strict;
    }

    let mut segments = Vec::new();
    let mut start = 0;
    for (index, _) in raw.match_indices('/') {
        let tail = &raw[index + 1..];
        let command = tail
            .split(|character: char| character.is_whitespace() || character == '/')
            .next()
            .unwrap_or_default();
        if is_known_event_command(command) {
            segments.push(raw[start..index].trim().to_string());
            start = index + 1;
        }
    }
    if start > 0 {
        segments.push(raw[start..].trim().to_string());
    }
    segments
}

/// Detects command-list strings embedded as leaves in mixed structured assets.
pub(crate) fn looks_like_event_script(raw: &str) -> bool {
    let segments = split_embedded_event_script(raw);
    if segments.len() < 2 {
        return false;
    }
    let scene = parse_scene(&segments);
    if !scene.actors.is_empty() {
        return true;
    }
    segments
        .iter()
        .filter(|segment| {
            split_space_quote_aware(segment)
                .first()
                .is_some_and(|command| is_known_event_command(command))
        })
        .take(2)
        .count()
        >= 2
}

pub(crate) fn parse_event_asset(value: &Value) -> anyhow::Result<Vec<EventScript>> {
    let entries = value
        .as_object()
        .context("Event asset root must be a JSON object.")?;
    let mut events = entries
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|script| (key, script)))
        .map(|(key, raw_script)| {
            let preconditions = split_outside_quotes(key, "/");
            let raw_segments = split_outside_quotes(raw_script, "/");
            let commands = raw_segments
                .iter()
                .skip(3)
                .enumerate()
                .map(|(index, raw)| parse_event_command(raw, index))
                .collect();
            EventScript {
                key: key.clone(),
                event_id: preconditions
                    .first()
                    .cloned()
                    .unwrap_or_else(|| key.clone()),
                preconditions,
                raw_script: raw_script.into(),
                scene: parse_scene(&raw_segments),
                raw_segments,
                commands,
            }
        })
        .collect::<Vec<_>>();
    events.sort_by(|left, right| {
        match (left.event_id.parse::<i64>(), right.event_id.parse::<i64>()) {
            (Ok(left), Ok(right)) => left.cmp(&right),
            _ => left.event_id.cmp(&right.event_id),
        }
    });
    Ok(events)
}

pub(crate) fn parse_event_asset_json(content: &str) -> anyhow::Result<Vec<EventScript>> {
    let value: Value = serde_json::from_str(content).context("Event asset is not valid JSON.")?;
    parse_event_asset(&value)
}

fn push_text(output: &mut Vec<(String, String)>, key: String, text: &str) {
    let text = text.trim();
    if !text.is_empty() {
        output.push((key, text.to_string()));
    }
}

fn visible_command_text(
    event_key: &str,
    command: &EventCommand,
    prefix: &str,
    output: &mut Vec<(String, String)>,
) {
    let base = format!(
        "{event_key}/{prefix}cmd:{}/{}",
        command.index, command.command
    );
    match command.command.as_str() {
        "speak" => {
            if let Some(question) = &command.embedded_question {
                push_text(output, format!("{base}/prompt"), &question.prompt);
                for (index, choice) in question.choices.iter().enumerate() {
                    push_text(output, format!("{base}/choice:{index}"), &choice.label);
                }
            } else {
                for (index, page) in command
                    .dialogue_pages
                    .as_deref()
                    .unwrap_or_default()
                    .iter()
                    .enumerate()
                {
                    push_text(output, format!("{base}/page:{index}"), &page.text);
                }
            }
        }
        "splitSpeak" => {
            for (variant, raw) in command.args.iter().skip(2).enumerate() {
                for (page, value) in parse_dialogue_pages(raw).iter().enumerate() {
                    push_text(
                        output,
                        format!("{base}/variant:{variant}/page:{page}"),
                        &value.text,
                    );
                }
            }
        }
        "message" | "textAboveHead" => {
            push_text(output, base, command.text.as_deref().unwrap_or_default())
        }
        "question" | "quickQuestion" => {
            push_text(
                output,
                format!("{base}/prompt"),
                command.prompt.as_deref().unwrap_or_default(),
            );
            for (choice_index, choice) in command
                .choices
                .as_deref()
                .unwrap_or_default()
                .iter()
                .enumerate()
            {
                push_text(
                    output,
                    format!("{base}/choice:{choice_index}"),
                    &choice.label,
                );
                for (branch_index, raw) in choice.branch_raw_commands.iter().enumerate() {
                    let branch = parse_event_command(raw, branch_index);
                    visible_command_text(
                        event_key,
                        &branch,
                        &format!("cmd:{}/choice:{choice_index}/", command.index),
                        output,
                    );
                }
            }
        }
        "end" if command.args.get(1).is_some_and(|value| value == "dialogue") => {
            for (index, page) in command
                .dialogue_pages
                .as_deref()
                .unwrap_or_default()
                .iter()
                .enumerate()
            {
                push_text(output, format!("{base}/page:{index}"), &page.text);
            }
        }
        _ => {}
    }
}

pub(crate) fn extract_visible_text(value: &Value) -> anyhow::Result<Vec<(String, String)>> {
    let mut output = Vec::new();
    for event in parse_event_asset(value)? {
        for command in &event.commands {
            visible_command_text(&event.key, command, "", &mut output);
        }
    }
    Ok(output)
}

/// Extracts visible text from one command-list leaf in a mixed structured asset.
pub(crate) fn extract_visible_text_from_script(
    unit_key: &str,
    raw_script: &str,
) -> Vec<(String, String)> {
    let raw_segments = split_embedded_event_script(raw_script);
    let command_start = if !parse_scene(&raw_segments).actors.is_empty() {
        3
    } else {
        0
    };
    let mut output = Vec::new();
    if command_start == 0 {
        if let Some(leading_text) = raw_segments.first().filter(|segment| {
            split_space_quote_aware(segment)
                .first()
                .is_none_or(|command| !is_known_event_command(command))
        }) {
            let normalized = leading_text.trim().trim_matches('"');
            for (page, value) in parse_dialogue_pages(normalized).iter().enumerate() {
                push_text(
                    &mut output,
                    format!("{unit_key}/leading-text/page:{page}"),
                    &value.text,
                );
            }
        }
    }
    for (index, raw) in raw_segments.iter().skip(command_start).enumerate() {
        if index == 0
            && split_space_quote_aware(raw)
                .first()
                .is_none_or(|command| !is_known_event_command(command))
        {
            continue;
        }
        let command = parse_event_command(raw, index);
        visible_command_text(unit_key, &command, "", &mut output);
    }
    output
}

#[cfg(test)]
#[path = "../tests/unit/domain/event_script_tests.rs"]
mod tests;
