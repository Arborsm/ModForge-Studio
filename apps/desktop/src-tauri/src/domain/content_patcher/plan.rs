use super::conditions::evaluate_patch_status;
use super::context::SimulationContext;
use super::patch_fields::{parse_from_file_values, parse_target_values};
use super::project::{
    include_from_file, normalize_relative_path, patch_action_is_include,
    resolve_include_relative_path,
};
use super::schema::parse_json_str;
use super::tokens::INVALID_WHEN_TOKEN;
use super::types::{
    ContentPatcherPatchPlan, ContentPatcherPlannedPatch, ContentPatcherProjectSnapshot,
};
use anyhow::{Context, bail};
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

#[derive(Debug, Clone, Default)]
struct PatchFieldContext {
    target: Option<String>,
    from_file: Option<String>,
}

fn normalize_action(patch: &Map<String, Value>) -> String {
    patch
        .get("Action")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "Unknown".to_string())
}

fn parse_priority(
    patch: &Map<String, Value>,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> i32 {
    match patch.get("Priority") {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) as i32,
        Some(Value::String(s)) => {
            let resolved = resolve_template_tokens(s, |token_name| {
                resolve_patch_token(
                    token_name,
                    snapshot,
                    context,
                    &PatchFieldContext::default(),
                    false,
                    false,
                )
            });
            resolved.trim().parse::<i32>().unwrap_or(0)
        }
        _ => 0,
    }
}

fn parse_update(patch: &Map<String, Value>) -> Vec<String> {
    match patch.get("Update") {
        Some(Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn parse_when(patch: &Map<String, Value>) -> BTreeMap<String, Value> {
    match patch.get("When") {
        Some(Value::Object(when)) => when
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        Some(value) => {
            let mut unresolved = BTreeMap::new();
            unresolved.insert(INVALID_WHEN_TOKEN.to_string(), value.clone());
            unresolved
        }
        None => BTreeMap::new(),
    }
}

fn merge_when(
    inherited: &BTreeMap<String, Value>,
    local: &BTreeMap<String, Value>,
) -> BTreeMap<String, Value> {
    let mut merged = inherited.clone();
    for (key, value) in local {
        merged.insert(key.clone(), value.clone());
    }
    merged
}

fn parse_config_defaults(root: &Value) -> BTreeMap<String, Value> {
    root.get("ConfigSchema")
        .and_then(Value::as_object)
        .map(|schema| {
            schema
                .iter()
                .filter_map(|(key, field)| {
                    field
                        .as_object()
                        .and_then(|field| field.get("Default"))
                        .map(|value| (key.clone(), value.clone()))
                })
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default()
}

fn with_config_defaults(context: &SimulationContext, root: &Value) -> SimulationContext {
    let mut config = parse_config_defaults(root);
    for (key, value) in &context.config {
        config.insert(key.clone(), value.clone());
    }

    SimulationContext {
        season: context.season.clone(),
        weather: context.weather.clone(),
        day: context.day,
        day_of_week: context.day_of_week.clone(),
        days_played: context.days_played,
        year: context.year,
        time: context.time,
        player_name: context.player_name.clone(),
        player_gender: context.player_gender.clone(),
        farm_name: context.farm_name.clone(),
        location_name: context.location_name.clone(),
        spouse: context.spouse.clone(),
        is_main_player: context.is_main_player,
        stardrop_count: context.stardrop_count,
        has_flags: context.has_flags.clone(),
        has_seen_events: context.has_seen_events.clone(),
        has_conversation_topics: context.has_conversation_topics.clone(),
        has_dialogue_answers: context.has_dialogue_answers.clone(),
        has_wallet_items: context.has_wallet_items.clone(),
        has_professions: context.has_professions.clone(),
        has_crafting_recipes: context.has_crafting_recipes.clone(),
        has_cooking_recipes: context.has_cooking_recipes.clone(),
        skill_levels: context.skill_levels.clone(),
        has_active_quests: context.has_active_quests.clone(),
        has_completed_quests: context.has_completed_quests.clone(),
        has_items: context.has_items.clone(),
        has_pet: context.has_pet,
        pet_type: context.pet_type.clone(),
        has_children: context.has_children,
        child_count: context.child_count,
        daily_luck: context.daily_luck,
        has_caught_fish: context.has_caught_fish.clone(),
        has_read_letters: context.has_read_letters.clone(),
        has_visited_locations: context.has_visited_locations.clone(),
        is_outdoors: context.is_outdoors,
        location_context: context.location_context.clone(),
        location_unique_name: context.location_unique_name.clone(),
        location_owner_id: context.location_owner_id.clone(),
        preferred_pet: context.preferred_pet.clone(),
        farm_cave: context.farm_cave.clone(),
        farm_map_asset: context.farm_map_asset.clone(),
        having_child: context.having_child,
        pregnant: context.pregnant,
        roommate: context.roommate.clone(),
        hearts: context.hearts.clone(),
        relationships: context.relationships.clone(),
        child_names: context.child_names.clone(),
        child_genders: context.child_genders.clone(),
        day_event: context.day_event.clone(),
        farm_type: context.farm_type.clone(),
        farmhouse_upgrade: context.farmhouse_upgrade,
        is_community_center_complete: context.is_community_center_complete,
        is_joja_mart_complete: context.is_joja_mart_complete,
        language: context.language.clone(),
        config,
        installed_mods: context.installed_mods.clone(),
        custom_tokens: context.custom_tokens.clone(),
        ignore_entry_when_conditions: context.ignore_entry_when_conditions,
    }
}

pub fn build_effective_context(
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> anyhow::Result<SimulationContext> {
    let root_source = snapshot
        .sources
        .iter()
        .find(|source| source.path == "content.json")
        .context("Snapshot sources are missing content.json.")?;
    let parsed_root = parse_json_str(&root_source.raw_json, &root_source.path)?;
    Ok(with_config_defaults(context, &parsed_root))
}

fn parse_log_name(
    patch: &Map<String, Value>,
    action: &str,
    target: &str,
    source_index: usize,
) -> String {
    patch
        .get("LogName")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| {
            if target.is_empty() {
                format!("{action} #{source_index}")
            } else {
                format!("{action} -> {target}")
            }
        })
}

fn build_patch_id(
    lineage: &[String],
    source_index: usize,
    target_index: usize,
    from_index: usize,
) -> String {
    format!(
        "{}:{source_index}#target:{target_index}#from:{from_index}",
        lineage.join("->")
    )
}

fn token_value_to_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn find_named_context_value(values: &BTreeMap<String, Value>, token_name: &str) -> Option<String> {
    values
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(token_name))
        .and_then(|(_, value)| token_value_to_string(value))
}

fn target_path_only(target: &str) -> String {
    let segments = target
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.len() <= 1 {
        String::new()
    } else {
        segments[..segments.len() - 1].join("/")
    }
}

fn target_without_path(target: &str) -> String {
    target
        .split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .next_back()
        .unwrap_or(target)
        .to_string()
}

fn resolve_template_tokens<F>(template: &str, mut resolver: F) -> String
where
    F: FnMut(&str) -> Option<String>,
{
    let mut resolved = String::with_capacity(template.len());
    let mut remainder = template;

    loop {
        let Some(start) = remainder.find("{{") else {
            resolved.push_str(remainder);
            break;
        };

        resolved.push_str(&remainder[..start]);
        let token_source = &remainder[start + 2..];

        let mut depth = 0;
        let mut end = None;
        for (i, window) in token_source.as_bytes().windows(2).enumerate() {
            if window == b"{{" {
                depth += 1;
            } else if window == b"}}" {
                if depth == 0 {
                    end = Some(i);
                    break;
                }
                depth -= 1;
            }
        }

        let Some(end) = end else {
            resolved.push_str(&remainder[start..]);
            break;
        };

        let token = &token_source[..end];
        if let Some(value) = resolver(token.trim()) {
            resolved.push_str(&value);
        } else {
            resolved.push_str("{{");
            resolved.push_str(token);
            resolved.push_str("}}");
        }

        remainder = &token_source[end + 2..];
    }

    resolved
}

fn template_references_token(template: &str, token_name: &str) -> bool {
    let mut remainder = template;

    loop {
        let Some(start) = remainder.find("{{") else {
            return false;
        };
        let token_source = &remainder[start + 2..];

        let mut depth = 0;
        let mut end = None;
        for (i, window) in token_source.as_bytes().windows(2).enumerate() {
            if window == b"{{" {
                depth += 1;
            } else if window == b"}}" {
                if depth == 0 {
                    end = Some(i);
                    break;
                }
                depth -= 1;
            }
        }

        let Some(end) = end else {
            return false;
        };

        if token_source[..end].trim().eq_ignore_ascii_case(token_name) {
            return true;
        }
        remainder = &token_source[end + 2..];
    }
}

fn resolve_arg(
    raw_arg: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    fields: &PatchFieldContext,
    allow_target_tokens: bool,
    allow_from_file_tokens: bool,
) -> String {
    resolve_template_tokens(raw_arg, |token_name| {
        resolve_patch_token(
            token_name,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        )
    })
}

fn resolve_patch_token(
    token_name: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    fields: &PatchFieldContext,
    allow_target_tokens: bool,
    allow_from_file_tokens: bool,
) -> Option<String> {
    let (name, arg) = if let Some(pos) = token_name.find(':') {
        (token_name[..pos].trim(), Some(token_name[pos + 1..].trim()))
    } else {
        (token_name.trim(), None)
    };

    if allow_target_tokens {
        if name.eq_ignore_ascii_case("Target") {
            return fields.target.clone();
        }
        if name.eq_ignore_ascii_case("TargetPathOnly") {
            return fields.target.as_deref().map(target_path_only);
        }
        if name.eq_ignore_ascii_case("TargetWithoutPath") {
            return fields.target.as_deref().map(target_without_path);
        }
    }

    if allow_from_file_tokens && name.eq_ignore_ascii_case("FromFile") {
        return fields.from_file.clone();
    }

    // Metadata
    if name.eq_ignore_ascii_case("ModId") {
        return snapshot.summary.unique_id.clone();
    }
    if name.eq_ignore_ascii_case("Language") {
        return context.language.clone();
    }

    // Date / weather
    if name.eq_ignore_ascii_case("Season") {
        return context.season.clone();
    }
    if name.eq_ignore_ascii_case("Weather") {
        return context.weather.clone();
    }
    if name.eq_ignore_ascii_case("DayEvent") {
        return context.day_event.clone();
    }
    if name.eq_ignore_ascii_case("Day") {
        return context.day.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("DayOfWeek") {
        return context.day_of_week.clone();
    }
    if name.eq_ignore_ascii_case("DaysPlayed") {
        return context.days_played.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("Year") {
        return context.year.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("Time") {
        return context.time.map(|v| v.to_string());
    }

    // Player
    if name.eq_ignore_ascii_case("DailyLuck") {
        return context.daily_luck.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("PlayerName") {
        return context.player_name.clone();
    }
    if name.eq_ignore_ascii_case("PlayerGender") {
        return context.player_gender.clone();
    }
    if name.eq_ignore_ascii_case("FarmName") {
        return context.farm_name.clone();
    }
    if name.eq_ignore_ascii_case("LocationName") {
        return context.location_name.clone();
    }
    if name.eq_ignore_ascii_case("LocationContext") {
        return context.location_context.clone();
    }
    if name.eq_ignore_ascii_case("LocationUniqueName") {
        return context.location_unique_name.clone();
    }
    if name.eq_ignore_ascii_case("LocationOwnerId") {
        return context.location_owner_id.clone();
    }
    if name.eq_ignore_ascii_case("Spouse") {
        return context.spouse.clone();
    }
    if name.eq_ignore_ascii_case("Roommate") {
        return context.roommate.clone();
    }
    if name.eq_ignore_ascii_case("Hearts") {
        return arg.and_then(|npc| context.hearts.get(npc).map(|v| v.to_string()));
    }
    if name.eq_ignore_ascii_case("IsMainPlayer") {
        return context.is_main_player.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("IsOutdoors") {
        return context.is_outdoors.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("StardropCount") {
        return context.stardrop_count.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("HasFlag") {
        if let Some(flag) = arg {
            return Some(
                context
                    .has_flags
                    .iter()
                    .any(|f| f.eq_ignore_ascii_case(flag))
                    .to_string(),
            );
        }
        return Some(context.has_flags.join(", "));
    }
    if name.eq_ignore_ascii_case("HasSeenEvent") {
        if let Some(event) = arg {
            return Some(
                context
                    .has_seen_events
                    .iter()
                    .any(|e| e.eq_ignore_ascii_case(event))
                    .to_string(),
            );
        }
        return Some(context.has_seen_events.join(", "));
    }
    if name.eq_ignore_ascii_case("HasCaughtFish") {
        if let Some(fish) = arg {
            return Some(
                context
                    .has_caught_fish
                    .iter()
                    .any(|f| f.eq_ignore_ascii_case(fish))
                    .to_string(),
            );
        }
        return Some(context.has_caught_fish.join(", "));
    }
    if name.eq_ignore_ascii_case("HasReadLetter") {
        if let Some(letter) = arg {
            return Some(
                context
                    .has_read_letters
                    .iter()
                    .any(|l| l.eq_ignore_ascii_case(letter))
                    .to_string(),
            );
        }
        return Some(context.has_read_letters.join(", "));
    }
    if name.eq_ignore_ascii_case("HasVisitedLocation") {
        if let Some(location) = arg {
            return Some(
                context
                    .has_visited_locations
                    .iter()
                    .any(|l| l.eq_ignore_ascii_case(location))
                    .to_string(),
            );
        }
        return Some(context.has_visited_locations.join(", "));
    }
    if name.eq_ignore_ascii_case("HasWalletItem") {
        if let Some(item) = arg {
            return Some(
                context
                    .has_wallet_items
                    .iter()
                    .any(|i| i.eq_ignore_ascii_case(item))
                    .to_string(),
            );
        }
        return Some(context.has_wallet_items.join(", "));
    }
    if name.eq_ignore_ascii_case("HasProfession") {
        if let Some(profession) = arg {
            return Some(
                context
                    .has_professions
                    .iter()
                    .any(|p| p.eq_ignore_ascii_case(profession))
                    .to_string(),
            );
        }
        return Some(context.has_professions.join(", "));
    }
    if name.eq_ignore_ascii_case("HasConversationTopic") {
        if let Some(topic) = arg {
            return Some(
                context
                    .has_conversation_topics
                    .iter()
                    .any(|t| t.eq_ignore_ascii_case(topic))
                    .to_string(),
            );
        }
        return Some(context.has_conversation_topics.join(", "));
    }
    if name.eq_ignore_ascii_case("HasDialogueAnswer")
        || name.eq_ignore_ascii_case("HasDialogueQuestionAnswered")
    {
        if let Some(answer) = arg {
            return Some(
                context
                    .has_dialogue_answers
                    .iter()
                    .any(|a| a.eq_ignore_ascii_case(answer))
                    .to_string(),
            );
        }
        return Some(context.has_dialogue_answers.join(", "));
    }
    if name.eq_ignore_ascii_case("HasCraftingRecipe") {
        if let Some(recipe) = arg {
            return Some(
                context
                    .has_crafting_recipes
                    .iter()
                    .any(|r| r.eq_ignore_ascii_case(recipe))
                    .to_string(),
            );
        }
        return Some(context.has_crafting_recipes.join(", "));
    }
    if name.eq_ignore_ascii_case("HasCookingRecipe") {
        if let Some(recipe) = arg {
            return Some(
                context
                    .has_cooking_recipes
                    .iter()
                    .any(|r| r.eq_ignore_ascii_case(recipe))
                    .to_string(),
            );
        }
        return Some(context.has_cooking_recipes.join(", "));
    }
    if name.eq_ignore_ascii_case("HasActiveQuest") {
        if let Some(quest) = arg {
            return Some(
                context
                    .has_active_quests
                    .iter()
                    .any(|q| q.eq_ignore_ascii_case(quest))
                    .to_string(),
            );
        }
        return Some(context.has_active_quests.join(", "));
    }
    if name.eq_ignore_ascii_case("HasCompletedQuest") {
        if let Some(quest) = arg {
            return Some(
                context
                    .has_completed_quests
                    .iter()
                    .any(|q| q.eq_ignore_ascii_case(quest))
                    .to_string(),
            );
        }
        return Some(context.has_completed_quests.join(", "));
    }
    if name.eq_ignore_ascii_case("HasItem") {
        if let Some(item) = arg {
            return Some(
                context
                    .has_items
                    .iter()
                    .any(|i| i.eq_ignore_ascii_case(item))
                    .to_string(),
            );
        }
        return Some(context.has_items.join(", "));
    }
    if name.eq_ignore_ascii_case("SkillLevel") {
        if let Some(skill) = arg {
            return context.skill_levels.get(skill).map(|v| v.to_string());
        }
        return Some(
            context
                .skill_levels
                .iter()
                .map(|(k, v)| format!("{k}:{v}"))
                .collect::<Vec<_>>()
                .join(", "),
        );
    }
    if name.eq_ignore_ascii_case("HasPet") {
        return context.has_pet.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("PetType") {
        return context.pet_type.clone();
    }
    if name.eq_ignore_ascii_case("HasChildren") {
        return context.has_children.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("ChildCount") {
        return context.child_count.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("ChildNames") {
        return Some(context.child_names.join(", "));
    }
    if name.eq_ignore_ascii_case("ChildGenders") {
        return Some(context.child_genders.join(", "));
    }
    if name.eq_ignore_ascii_case("HavingChild") {
        return context.having_child.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("Pregnant") {
        return context.pregnant.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("PreferredPet") {
        return context.preferred_pet.clone();
    }

    // World
    if name.eq_ignore_ascii_case("FarmType") {
        return context.farm_type.clone();
    }
    if name.eq_ignore_ascii_case("FarmCave") {
        return context.farm_cave.clone();
    }
    if name.eq_ignore_ascii_case("FarmMapAsset") {
        return context.farm_map_asset.clone();
    }
    if name.eq_ignore_ascii_case("FarmhouseUpgrade") {
        return context.farmhouse_upgrade.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("IsCommunityCenterComplete") {
        return context.is_community_center_complete.map(|v| v.to_string());
    }
    if name.eq_ignore_ascii_case("IsJojaMartComplete") {
        return context.is_joja_mart_complete.map(|v| v.to_string());
    }

    // String manipulation
    if name.eq_ignore_ascii_case("HasValue") {
        let input = arg.unwrap_or("");
        let has_value = !input.is_empty() && !input.eq_ignore_ascii_case("null");
        return Some(has_value.to_string());
    }
    if name.eq_ignore_ascii_case("Lowercase") {
        return arg.map(|v| v.to_lowercase());
    }
    if name.eq_ignore_ascii_case("Uppercase") {
        return arg.map(|v| v.to_uppercase());
    }
    if name.eq_ignore_ascii_case("Merge") {
        return arg.map(|v| v.split(',').map(str::trim).collect::<Vec<_>>().join(""));
    }

    // Computational tokens
    if name.eq_ignore_ascii_case("Range") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let parts: Vec<&str> = resolved.split(',').map(str::trim).collect();
        if parts.len() < 2 {
            return Some(String::new());
        }
        let min = parts[0].parse::<i32>().ok()?;
        let max = parts[1].parse::<i32>().ok()?;
        let step = parts
            .get(2)
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(1);
        if max > 5000 {
            return Some(String::new());
        }
        let mut values = Vec::new();
        let mut current = min;
        if step > 0 {
            while current <= max {
                values.push(current.to_string());
                current += step;
            }
        } else if step < 0 {
            while current >= max {
                values.push(current.to_string());
                current += step;
            }
        }
        return Some(values.join(", "));
    }

    if name.eq_ignore_ascii_case("Round") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let parts: Vec<&str> = resolved.split(',').map(str::trim).collect();
        if parts.is_empty() {
            return Some(String::new());
        }
        let value = parts[0].parse::<f64>().ok()?;
        let digits = parts
            .get(1)
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(0);
        let direction = parts.get(2).map(|s| s.to_lowercase()).unwrap_or_default();

        let multiplier = 10f64.powi(digits);
        let scaled = value * multiplier;
        let rounded = match direction.as_str() {
            "up" => scaled.ceil(),
            "down" => scaled.floor(),
            _ => scaled.round(),
        };
        let result = rounded / multiplier;

        return if digits <= 0 {
            Some(format!("{:.0}", result))
        } else {
            Some(format!("{:.1$}", result, digits as usize))
        };
    }

    if name.eq_ignore_ascii_case("Render") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        return Some(resolved);
    }

    if name.eq_ignore_ascii_case("Count") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        if resolved.trim().is_empty() {
            return Some("0".to_string());
        }
        let count = resolved
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .count();
        return Some(count.to_string());
    }

    if name.eq_ignore_ascii_case("PathPart") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let parts: Vec<&str> = resolved.split(',').map(str::trim).collect();
        if parts.len() < 2 {
            return Some(String::new());
        }
        let path = parts[0];
        let index = parts[1].parse::<i32>().ok()?;
        let segments: Vec<&str> = path
            .split(['/', '\\'])
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if segments.is_empty() {
            return Some(String::new());
        }
        let part = if index > 0 {
            segments.get((index - 1) as usize).copied()
        } else if index < 0 {
            let rev = (-index) as usize;
            if rev <= segments.len() {
                Some(segments[segments.len() - rev])
            } else {
                None
            }
        } else {
            None
        };
        return Some(part.unwrap_or("").to_string());
    }

    if name.eq_ignore_ascii_case("FormatAssetName") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let file_name = resolved
            .split(['/', '\\'])
            .next_back()
            .unwrap_or(&resolved)
            .trim();
        let without_ext = if let Some(pos) = file_name.rfind('.') {
            &file_name[..pos]
        } else {
            file_name
        };
        return Some(without_ext.to_string());
    }

    if name.eq_ignore_ascii_case("FirstValidFile") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let project_root = snapshot.summary.absolute_path.as_deref()?;
        for candidate in resolved.split(',').map(str::trim).filter(|s| !s.is_empty()) {
            let full_path = Path::new(project_root).join(candidate);
            if full_path.exists() {
                return Some(candidate.to_string());
            }
        }
        return Some(String::new());
    }

    if name.eq_ignore_ascii_case("AbsoluteFilePath") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let project_root = snapshot.summary.absolute_path.as_deref()?;
        let relative = resolved.trim();
        if relative.is_empty() {
            return Some(String::new());
        }
        let full_path = Path::new(project_root).join(relative);
        return Some(full_path.to_string_lossy().to_string());
    }

    if name.eq_ignore_ascii_case("HasFile") {
        let input = arg.unwrap_or("");
        let resolved = resolve_arg(
            input,
            snapshot,
            context,
            fields,
            allow_target_tokens,
            allow_from_file_tokens,
        );
        let project_root = snapshot.summary.absolute_path.as_deref()?;
        let relative = resolved.trim();
        if relative.is_empty() {
            return Some("false".to_string());
        }
        let full_path = Path::new(project_root).join(relative);
        return Some(full_path.exists().to_string());
    }

    // Tokens that are inherently non-deterministic or require game runtime
    // cannot be resolved during planning and are left as-is for the simulator.
    if name.eq_ignore_ascii_case("Random") || name.eq_ignore_ascii_case("Query") {
        return None;
    }

    find_named_context_value(&context.custom_tokens, token_name)
        .or_else(|| find_named_context_value(&context.config, token_name))
}

fn resolve_target_string(
    template: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    from_file: Option<&str>,
) -> String {
    resolve_template_tokens(template, |token_name| {
        resolve_patch_token(
            token_name,
            snapshot,
            context,
            &PatchFieldContext {
                from_file: from_file.map(ToOwned::to_owned),
                ..PatchFieldContext::default()
            },
            false,
            true,
        )
    })
}

fn resolve_from_file_string(
    template: &str,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    target: Option<&str>,
) -> String {
    resolve_template_tokens(template, |token_name| {
        resolve_patch_token(
            token_name,
            snapshot,
            context,
            &PatchFieldContext {
                target: target.map(ToOwned::to_owned),
                ..PatchFieldContext::default()
            },
            true,
            false,
        )
    })
}

fn resolve_patch_paths(
    raw_target: &str,
    raw_from_file: Option<&str>,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> (String, Option<String>) {
    let base_target = resolve_target_string(raw_target, snapshot, context, None);
    let base_from_file =
        raw_from_file.map(|value| resolve_from_file_string(value, snapshot, context, None));

    let final_from_file = if template_references_token(raw_target, "FromFile") {
        let first_target =
            resolve_target_string(&base_target, snapshot, context, base_from_file.as_deref());
        base_from_file
            .map(|value| resolve_from_file_string(&value, snapshot, context, Some(&first_target)))
    } else {
        base_from_file
            .map(|value| resolve_from_file_string(&value, snapshot, context, Some(&base_target)))
    };

    let final_target =
        resolve_target_string(&base_target, snapshot, context, final_from_file.as_deref());
    (final_target, final_from_file)
}

fn collect_patches_from_source(
    source_path: &str,
    source_values: &BTreeMap<String, Value>,
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
    inherited_when: &BTreeMap<String, Value>,
    lineage: &[String],
    stack: &mut BTreeSet<String>,
    patches: &mut Vec<ContentPatcherPlannedPatch>,
) -> anyhow::Result<()> {
    if !stack.insert(source_path.to_string()) {
        bail!("Include cycle detected at {source_path}");
    }

    let source = source_values
        .get(source_path)
        .with_context(|| format!("Included file not found in snapshot sources: {source_path}"))?;
    let changes = source
        .get("Changes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for (source_index, change) in changes.iter().enumerate() {
        let Some(patch) = change.as_object() else {
            continue;
        };
        let action = normalize_action(patch);
        if patch_action_is_include(patch) {
            let Some(from_file) = include_from_file(patch) else {
                continue;
            };
            let include_rel_path =
                resolve_include_relative_path(Path::new(source_path), &from_file)?;
            let include_rel = normalize_relative_path(&include_rel_path);
            let include_when = parse_when(patch);
            let merged_when = merge_when(inherited_when, &include_when);
            let mut include_lineage = lineage.to_vec();
            include_lineage.push(format!("{include_rel}#include:{source_index}"));
            collect_patches_from_source(
                &include_rel,
                source_values,
                snapshot,
                context,
                &merged_when,
                &include_lineage,
                stack,
                patches,
            )?;
            continue;
        }

        // EnableWhen: if present and doesn't match, skip this patch entirely
        if let Some(enable_when) = patch.get("EnableWhen") {
            let status = evaluate_patch_status(
                enable_when,
                context,
                snapshot.summary.absolute_path.as_deref(),
            );
            if status.status != "applied" {
                continue;
            }
        }

        let patch_when = parse_when(patch);
        let merged_when = merge_when(inherited_when, &patch_when);
        let targets = parse_target_values(patch);
        let from_files = parse_from_file_values(patch);
        let priority = parse_priority(patch, snapshot, context);
        let update = parse_update(patch);

        for (target_index, raw_target) in targets.iter().enumerate() {
            for (from_index, raw_from_file) in from_files.iter().enumerate() {
                let (target, from_file) =
                    resolve_patch_paths(raw_target, raw_from_file.as_deref(), snapshot, context);
                patches.push(ContentPatcherPlannedPatch {
                    id: build_patch_id(lineage, source_index, target_index, from_index),
                    action: action.clone(),
                    target: target.clone(),
                    log_name: parse_log_name(patch, &action, &target, source_index),
                    from_file,
                    when: merged_when.clone(),
                    source_path: source_path.to_string(),
                    priority,
                    update: update.clone(),
                });
            }
        }
    }

    stack.remove(source_path);
    Ok(())
}

fn resolve_dynamic_tokens(
    snapshot: &ContentPatcherProjectSnapshot,
    source_values: &BTreeMap<String, Value>,
    base_context: &SimulationContext,
) -> BTreeMap<String, Value> {
    let mut tokens: BTreeMap<String, Value> = BTreeMap::new();

    for source in &snapshot.sources {
        let Some(parsed) = source_values.get(&source.path) else {
            continue;
        };
        let Some(arr) = parsed.get("DynamicTokens").and_then(Value::as_array) else {
            continue;
        };

        for entry in arr {
            let Some(obj) = entry.as_object() else {
                continue;
            };
            let name = obj
                .get("Name")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty());
            let value = obj.get("Value");
            let (Some(name), Some(value)) = (name, value) else {
                continue;
            };

            let applies = match obj.get("When") {
                Some(when) => {
                    let status = evaluate_patch_status(
                        when,
                        base_context,
                        snapshot.summary.absolute_path.as_deref(),
                    );
                    status.status == "applied"
                }
                None => true,
            };

            if !applies {
                continue;
            }

            let mut temp_context = base_context.clone();
            temp_context.custom_tokens = tokens.clone();

            let value_str = match value {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            let resolved = resolve_template_tokens(&value_str, |token_name| {
                resolve_patch_token(
                    token_name,
                    snapshot,
                    &temp_context,
                    &PatchFieldContext::default(),
                    false,
                    false,
                )
            });

            tokens.insert(name.to_string(), Value::String(resolved));
        }
    }

    tokens
}

#[allow(dead_code)]
pub fn build_patch_plan(
    snapshot: &ContentPatcherProjectSnapshot,
) -> anyhow::Result<ContentPatcherPatchPlan> {
    build_patch_plan_with_context(snapshot, &SimulationContext::default())
}

pub fn build_patch_plan_with_context(
    snapshot: &ContentPatcherProjectSnapshot,
    context: &SimulationContext,
) -> anyhow::Result<ContentPatcherPatchPlan> {
    let mut source_values = BTreeMap::new();
    for source in &snapshot.sources {
        let parsed = parse_json_str(&source.raw_json, &source.path)?;
        source_values.insert(source.path.clone(), parsed);
    }

    let root_source = source_values
        .get("content.json")
        .context("Snapshot sources are missing content.json.")?;
    let mut effective_context = with_config_defaults(context, root_source);

    let dynamic_tokens = resolve_dynamic_tokens(snapshot, &source_values, &effective_context);
    for (key, value) in dynamic_tokens {
        effective_context.custom_tokens.insert(key, value);
    }

    let mut patches = Vec::new();
    let mut stack = BTreeSet::new();
    let lineage = vec!["content.json".to_string()];
    collect_patches_from_source(
        "content.json",
        &source_values,
        snapshot,
        &effective_context,
        &BTreeMap::new(),
        &lineage,
        &mut stack,
        &mut patches,
    )?;

    // Sort by priority descending; stable sort preserves original order for equal priorities
    patches.sort_by(|a, b| b.priority.cmp(&a.priority));

    Ok(ContentPatcherPatchPlan { patches })
}

#[cfg(test)]
#[path = "../../tests/unit/domain/content_patcher/plan_tests.rs"]
mod tests;
