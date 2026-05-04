use super::context::SimulationContext;
use super::tokens::{parse_condition_token, ConditionModifier, INVALID_WHEN_TOKEN};
use super::types::ContentPatcherPatchStatus;
use serde_json::Value;
use std::path::{Path, PathBuf};

fn normalize_str(value: &str) -> &str {
    value.trim()
}

fn value_to_scalar_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn value_to_scalar_strings(value: &Value) -> Result<Vec<String>, String> {
    match value {
        Value::Array(values) => {
            let scalars = values
                .iter()
                .map(|entry| {
                    value_to_scalar_string(entry)
                        .ok_or_else(|| "has an unsupported non-scalar array value".to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            if scalars.is_empty() {
                return Err("has an unsupported empty array value".to_string());
            }
            Ok(scalars)
        }
        _ => value_to_scalar_string(value)
            .map(|scalar| vec![scalar])
            .ok_or_else(|| "has an unsupported value type".to_string()),
    }
}

fn try_parse_number(text: &str) -> Option<f64> {
    text.trim().parse::<f64>().ok()
}

fn scalar_matches(expected: &str, actual: &str) -> bool {
    let expected_trimmed = normalize_str(expected);
    let actual_trimmed = normalize_str(actual);

    if expected_trimmed.eq_ignore_ascii_case(actual_trimmed) {
        return true;
    }

    if let (Some(expected_num), Some(actual_num)) =
        (try_parse_number(expected_trimmed), try_parse_number(actual_trimmed))
    {
        return (expected_num - actual_num).abs() < f64::EPSILON;
    }

    false
}

fn value_matches_expected(expected: &Value, actual: &Value) -> Result<bool, String> {
    let expected_values = value_to_scalar_strings(expected)?;
    let actual_values = value_to_scalar_strings(actual)?;

    Ok(actual_values.iter().any(|actual| {
        expected_values
            .iter()
            .any(|expected| scalar_matches(expected, actual))
    }))
}

fn value_to_bool(value: &Value) -> Result<bool, String> {
    match value {
        Value::Bool(flag) => Ok(*flag),
        Value::String(text) => {
            let normalized = text.trim();
            if normalized.eq_ignore_ascii_case("true") {
                Ok(true)
            } else if normalized.eq_ignore_ascii_case("false") {
                Ok(false)
            } else {
                Err("has an unsupported non-boolean string value".to_string())
            }
        }
        _ => Err("has an unsupported non-boolean value".to_string()),
    }
}

fn path_from_relative(root: &str, relative: &str) -> PathBuf {
    let mut path = PathBuf::from(root);
    for segment in relative.split(['/', '\\']) {
        let trimmed = segment.trim();
        if !trimmed.is_empty() {
            path.push(trimmed);
        }
    }
    path
}

fn lookup_context_value<'a>(
    values: &'a std::collections::BTreeMap<String, Value>,
    token_name: &str,
) -> Option<&'a Value> {
    values
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(token_name))
        .map(|(_, value)| value)
}

fn list_contains(values: &[String], item: &str) -> bool {
    values.iter().any(|v| v.eq_ignore_ascii_case(item))
}

fn resolve_condition_value(
    raw_name: &str,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> Result<Value, String> {
    let (name, arg) = if let Some(pos) = raw_name.find(':') {
        (raw_name[..pos].trim(), Some(raw_name[pos + 1..].trim()))
    } else {
        (raw_name.trim(), None)
    };
    // Date / weather
    if name.eq_ignore_ascii_case("Season") {
        let Some(actual) = context.season.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Weather") {
        let Some(actual) = context.weather.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("DayEvent") {
        let Some(actual) = context.day_event.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Day") {
        let Some(actual) = context.day else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("DayOfWeek") {
        let Some(actual) = context.day_of_week.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("DaysPlayed") {
        let Some(actual) = context.days_played else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("Year") {
        let Some(actual) = context.year else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("Time") {
        let Some(actual) = context.time else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }

    // Player
    if name.eq_ignore_ascii_case("DailyLuck") {
        let Some(actual) = context.daily_luck else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(serde_json::Number::from_f64(actual).unwrap_or_else(|| 0.into())));
    }
    if name.eq_ignore_ascii_case("PlayerName") {
        let Some(actual) = context.player_name.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("PlayerGender") {
        let Some(actual) = context.player_gender.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("FarmName") {
        let Some(actual) = context.farm_name.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("LocationName") {
        let Some(actual) = context.location_name.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("LocationContext") {
        let Some(actual) = context.location_context.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("LocationUniqueName") {
        let Some(actual) = context.location_unique_name.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("LocationOwnerId") {
        let Some(actual) = context.location_owner_id.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Spouse") {
        let Some(actual) = context.spouse.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Roommate") {
        let Some(actual) = context.roommate.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("Hearts") {
        if let Some(npc) = arg {
            let value = context.hearts.get(npc).copied().unwrap_or(0);
            return Ok(Value::Number(value.into()));
        }
        let values = context
            .hearts
            .iter()
            .map(|(key, value)| Value::String(format!("{key}:{value}")))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasFlag") {
        if let Some(flag) = arg {
            return Ok(Value::Bool(list_contains(&context.has_flags, flag)));
        }
        let values = context
            .has_flags
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasSeenEvent") {
        if let Some(event) = arg {
            return Ok(Value::Bool(list_contains(&context.has_seen_events, event)));
        }
        let values = context
            .has_seen_events
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasCaughtFish") {
        if let Some(fish) = arg {
            return Ok(Value::Bool(list_contains(&context.has_caught_fish, fish)));
        }
        let values = context
            .has_caught_fish
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasReadLetter") {
        if let Some(letter) = arg {
            return Ok(Value::Bool(list_contains(&context.has_read_letters, letter)));
        }
        let values = context
            .has_read_letters
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasVisitedLocation") {
        if let Some(location) = arg {
            return Ok(Value::Bool(list_contains(&context.has_visited_locations, location)));
        }
        let values = context
            .has_visited_locations
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasWalletItem") {
        if let Some(item) = arg {
            return Ok(Value::Bool(list_contains(&context.has_wallet_items, item)));
        }
        let values = context
            .has_wallet_items
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasProfession") {
        if let Some(profession) = arg {
            return Ok(Value::Bool(list_contains(&context.has_professions, profession)));
        }
        let values = context
            .has_professions
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("SkillLevel") {
        if let Some(skill) = arg {
            let value = context.skill_levels.get(skill).copied().unwrap_or(0);
            return Ok(Value::Number(value.into()));
        }
        let values = context
            .skill_levels
            .iter()
            .map(|(key, value)| Value::String(format!("{key}:{value}")))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasConversationTopic") {
        if let Some(topic) = arg {
            return Ok(Value::Bool(list_contains(&context.has_conversation_topics, topic)));
        }
        let values = context
            .has_conversation_topics
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasDialogueAnswer") || name.eq_ignore_ascii_case("HasDialogueQuestionAnswered") {
        if let Some(answer) = arg {
            return Ok(Value::Bool(list_contains(&context.has_dialogue_answers, answer)));
        }
        let values = context
            .has_dialogue_answers
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasCraftingRecipe") {
        if let Some(recipe) = arg {
            return Ok(Value::Bool(list_contains(&context.has_crafting_recipes, recipe)));
        }
        let values = context
            .has_crafting_recipes
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasCookingRecipe") {
        if let Some(recipe) = arg {
            return Ok(Value::Bool(list_contains(&context.has_cooking_recipes, recipe)));
        }
        let values = context
            .has_cooking_recipes
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("IsMainPlayer") {
        let Some(actual) = context.is_main_player else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("IsOutdoors") {
        let Some(actual) = context.is_outdoors else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("StardropCount") {
        let Some(actual) = context.stardrop_count else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("HasActiveQuest") {
        if let Some(quest) = arg {
            return Ok(Value::Bool(list_contains(&context.has_active_quests, quest)));
        }
        let values = context
            .has_active_quests
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasCompletedQuest") {
        if let Some(quest) = arg {
            return Ok(Value::Bool(list_contains(&context.has_completed_quests, quest)));
        }
        let values = context
            .has_completed_quests
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasItem") {
        if let Some(item) = arg {
            return Ok(Value::Bool(list_contains(&context.has_items, item)));
        }
        let values = context
            .has_items
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasPet") {
        let Some(actual) = context.has_pet else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("PetType") {
        let Some(actual) = context.pet_type.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("PreferredPet") {
        let Some(actual) = context.preferred_pet.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("HasChildren") {
        let Some(actual) = context.has_children else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("ChildCount") {
        let Some(actual) = context.child_count else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("ChildNames") {
        let values = context
            .child_names
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("ChildGenders") {
        let values = context
            .child_genders
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HavingChild") {
        let Some(actual) = context.having_child else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("Pregnant") {
        let Some(actual) = context.pregnant else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }

    // World
    if name.eq_ignore_ascii_case("FarmType") {
        let Some(actual) = context.farm_type.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("FarmCave") {
        let Some(actual) = context.farm_cave.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("FarmMapAsset") {
        let Some(actual) = context.farm_map_asset.as_deref() else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::String(actual.to_string()));
    }
    if name.eq_ignore_ascii_case("FarmhouseUpgrade") {
        let Some(actual) = context.farmhouse_upgrade else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Number(actual.into()));
    }
    if name.eq_ignore_ascii_case("IsCommunityCenterComplete") {
        let Some(actual) = context.is_community_center_complete else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }
    if name.eq_ignore_ascii_case("IsJojaMartComplete") {
        let Some(actual) = context.is_joja_mart_complete else {
            return Err("is missing from the simulation context".to_string());
        };
        return Ok(Value::Bool(actual));
    }

    // Mod / metadata
    if name.eq_ignore_ascii_case("HasMod") {
        let values = context
            .installed_mods
            .iter()
            .map(|value| Value::String(value.clone()))
            .collect::<Vec<_>>();
        return Ok(Value::Array(values));
    }
    if name.eq_ignore_ascii_case("HasFile") {
        let relative_path = arg.ok_or_else(|| "uses `HasFile` without a file path argument".to_string())?;
        let root =
            project_root_path.ok_or_else(|| "requires a content pack root path".to_string())?;
        let candidate = path_from_relative(root, relative_path);
        return Ok(Value::Bool(
            candidate.exists() && Path::new(&candidate).is_file(),
        ));
    }
    // Game runtime conditions that cannot be evaluated in simulation
    if name.eq_ignore_ascii_case("Query") {
        return Err("requires game runtime (Query conditions are not supported in simulation)".to_string());
    }
    if name.eq_ignore_ascii_case("Random") {
        return Err("is non-deterministic (Random conditions are not supported in simulation)".to_string());
    }
    if name.eq_ignore_ascii_case("Relationship") {
        let npc = arg.ok_or_else(|| "uses `Relationship` without an NPC argument".to_string())?;
        return context
            .relationships
            .get(npc)
            .cloned()
            .map(Value::String)
            .ok_or_else(|| format!("relationship for `{npc}` is missing from the simulation context"));
    }
    if name == INVALID_WHEN_TOKEN {
        return Err("contains a malformed `When` value; expected an object".to_string());
    }
    lookup_context_value(&context.custom_tokens, name)
        .cloned()
        .or_else(|| lookup_context_value(&context.config, name).cloned())
        .ok_or_else(|| "is not supported in this simulation phase".to_string())
}

fn value_contains_term(value: &Value, expected_term: &str) -> Result<bool, String> {
    let actual_values = value_to_scalar_strings(value)?;
    let normalized_expected = normalize_str(expected_term);
    let expected_lower = normalized_expected.to_lowercase();
    Ok(actual_values.iter().any(|actual| {
        let trimmed_actual = normalize_str(actual);
        trimmed_actual.eq_ignore_ascii_case(normalized_expected)
            || trimmed_actual
                .split(',')
                .map(normalize_str)
                .any(|segment| segment.eq_ignore_ascii_case(normalized_expected))
            || trimmed_actual
                .split(';')
                .map(normalize_str)
                .any(|segment| segment.eq_ignore_ascii_case(normalized_expected))
            || trimmed_actual.to_lowercase().contains(&expected_lower)
    }))
}

fn apply_input_modifiers(modifiers: &[&ConditionModifier], value: Value) -> Result<Value, String> {
    let mut current = value;

    for modifier in modifiers {
        if modifier.name.eq_ignore_ascii_case("inputSeparator") {
            let separator = modifier
                .value
                .as_deref()
                .unwrap_or(",");
            match current {
                Value::String(text) => {
                    let parts = text
                        .split(separator)
                        .map(|s| Value::String(s.trim().to_string()))
                        .collect();
                    current = Value::Array(parts);
                }
                _ => {
                    return Err(
                        "uses an `inputSeparator` modifier on a non-string value".to_string(),
                    );
                }
            }
        } else if modifier.name.eq_ignore_ascii_case("valueAt") {
            let index = modifier
                .value
                .as_deref()
                .ok_or_else(|| "uses a `valueAt` modifier without a value".to_string())?
                .parse::<isize>()
                .map_err(|_| {
                    "uses a `valueAt` modifier with a non-numeric value".to_string()
                })?;

            match current {
                Value::Array(arr) => {
                    let resolved = if index > 0 {
                        let pos = (index - 1) as usize;
                        if pos < arr.len() { Some(arr[pos].clone()) } else { None }
                    } else if index < 0 {
                        let pos = arr.len() as isize + index;
                        if pos >= 0 { Some(arr[pos as usize].clone()) } else { None }
                    } else {
                        None
                    };
                    current = resolved.unwrap_or(Value::String(String::new()));
                }
                Value::String(text) => {
                    let parts: Vec<&str> = text
                        .split(',')
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .collect();
                    let resolved = if index > 0 {
                        let pos = (index - 1) as usize;
                        if pos < parts.len() { Some(parts[pos].to_string()) } else { None }
                    } else if index < 0 {
                        let pos = parts.len() as isize + index;
                        if pos >= 0 { Some(parts[pos as usize].to_string()) } else { None }
                    } else {
                        None
                    };
                    current = Value::String(resolved.unwrap_or_default());
                }
                _ => {
                    return Err(
                        "uses a `valueAt` modifier on a non-array value".to_string()
                    );
                }
            }
        }
    }

    Ok(current)
}

fn apply_modifier(
    modifier: &ConditionModifier,
    actual: &Value,
    expected: &Value,
) -> Result<bool, String> {
    if modifier.name.eq_ignore_ascii_case("contains") {
        let expected_contains = modifier
            .value
            .as_deref()
            .ok_or_else(|| "uses a `contains` modifier without a value".to_string())?;
        let should_contain = value_to_bool(expected)?;
        let contains = value_contains_term(actual, expected_contains)?;
        return Ok(contains == should_contain);
    }

    if modifier.name.eq_ignore_ascii_case("hasValue") {
        let expected_has_value = value_to_bool(expected)?;
        let has_value = match actual {
            Value::String(s) => !s.is_empty(),
            Value::Array(arr) => !arr.is_empty(),
            Value::Object(obj) => !obj.is_empty(),
            Value::Number(_) => true,
            Value::Bool(b) => *b,
            Value::Null => false,
        };
        return Ok(has_value == expected_has_value);
    }

    Err(format!(
        "uses modifier `{}` that is not supported in this simulation phase",
        modifier.name
    ))
}

fn evaluate_token_condition(
    token: &super::tokens::ConditionToken,
    expected: &Value,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> Result<bool, String> {
    let actual = resolve_condition_value(&token.name, context, project_root_path);

    let has_has_value = token.modifiers.iter().any(|m| m.name.eq_ignore_ascii_case("hasValue"));

    let actual = match actual {
        Ok(v) => v,
        Err(_) if has_has_value => Value::String(String::new()),
        Err(e) => return Err(e),
    };

    if token.modifiers.is_empty() {
        return value_matches_expected(expected, &actual);
    }

    let (input_modifiers, comparison_modifiers): (Vec<_>, Vec<_>) = token
        .modifiers
        .iter()
        .partition(|m| {
            m.name.eq_ignore_ascii_case("valueAt")
                || m.name.eq_ignore_ascii_case("inputSeparator")
        });

    let actual = if input_modifiers.is_empty() {
        actual
    } else {
        apply_input_modifiers(&input_modifiers, actual)?
    };

    if comparison_modifiers.is_empty() {
        return value_matches_expected(expected, &actual);
    }

    let mut matches = true;
    for modifier in &comparison_modifiers {
        matches &= apply_modifier(modifier, &actual, expected)?;
    }
    Ok(matches)
}

pub fn evaluate_patch_status(
    when: &Value,
    context: &SimulationContext,
    project_root_path: Option<&str>,
) -> ContentPatcherPatchStatus {
    let mut mismatch_reasons = Vec::new();
    let mut indeterminate_reasons = Vec::new();

    let Some(conditions) = when.as_object() else {
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "applied".to_string(),
            reasons: Vec::new(),
        };
    };

    for (raw_key, expected) in conditions {
        let token = parse_condition_token(raw_key);
        if token.name.is_empty() {
            indeterminate_reasons.push(format!("Condition key `{}` is empty.", token.raw_key));
            continue;
        }

        match evaluate_token_condition(&token, expected, context, project_root_path) {
            Ok(true) => {}
            Ok(false) => mismatch_reasons.push(format!("Condition `{}` did not match.", raw_key)),
            Err(reason) => {
                indeterminate_reasons.push(format!("Condition `{}` {}.", token.raw_key, reason))
            }
        }
    }

    if !mismatch_reasons.is_empty() {
        mismatch_reasons.extend(indeterminate_reasons);
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "skipped".to_string(),
            reasons: mismatch_reasons,
        };
    }

    if !indeterminate_reasons.is_empty() {
        return ContentPatcherPatchStatus {
            patch_id: None,
            status: "indeterminate".to_string(),
            reasons: indeterminate_reasons,
        };
    }

    ContentPatcherPatchStatus {
        patch_id: None,
        status: "applied".to_string(),
        reasons: Vec::new(),
    }
}

#[cfg(test)]
#[path = "tests/conditions_tests.rs"]
mod tests;
