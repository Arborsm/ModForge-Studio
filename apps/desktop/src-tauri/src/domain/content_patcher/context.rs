use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SimulationContext {
    // Date / weather
    pub season: Option<String>,
    pub weather: Option<String>,
    pub day: Option<u32>,
    pub day_of_week: Option<String>,
    pub days_played: Option<u32>,
    pub year: Option<u32>,
    pub time: Option<u32>,

    // Player
    pub player_name: Option<String>,
    pub player_gender: Option<String>,
    pub farm_name: Option<String>,
    pub location_name: Option<String>,
    pub spouse: Option<String>,
    pub is_main_player: Option<bool>,
    pub stardrop_count: Option<u32>,
    pub has_flags: Vec<String>,
    pub has_seen_events: Vec<String>,
    pub has_conversation_topics: Vec<String>,
    pub has_dialogue_answers: Vec<String>,
    pub has_wallet_items: Vec<String>,
    pub has_professions: Vec<String>,
    pub has_crafting_recipes: Vec<String>,
    pub has_cooking_recipes: Vec<String>,
    pub skill_levels: BTreeMap<String, u32>,
    pub has_active_quests: Vec<String>,
    pub has_completed_quests: Vec<String>,
    pub has_items: Vec<String>,
    pub has_pet: Option<bool>,
    pub pet_type: Option<String>,
    pub has_children: Option<bool>,
    pub child_count: Option<u32>,
    pub daily_luck: Option<f64>,
    pub has_caught_fish: Vec<String>,
    pub has_read_letters: Vec<String>,
    pub has_visited_locations: Vec<String>,
    pub is_outdoors: Option<bool>,
    pub location_context: Option<String>,
    pub location_unique_name: Option<String>,
    pub location_owner_id: Option<String>,
    pub preferred_pet: Option<String>,
    pub farm_cave: Option<String>,
    pub farm_map_asset: Option<String>,
    pub having_child: Option<bool>,
    pub pregnant: Option<bool>,
    pub roommate: Option<String>,
    pub hearts: BTreeMap<String, i32>,
    pub relationships: BTreeMap<String, String>,
    pub child_names: Vec<String>,
    pub child_genders: Vec<String>,
    pub day_event: Option<String>,

    // World
    pub farm_type: Option<String>,
    pub farmhouse_upgrade: Option<u32>,
    pub is_community_center_complete: Option<bool>,
    pub is_joja_mart_complete: Option<bool>,

    // Language / i18n
    pub language: Option<String>,

    // Mod / config
    pub config: BTreeMap<String, Value>,
    pub installed_mods: Vec<String>,
    pub custom_tokens: BTreeMap<String, Value>,

    /// If true, ignore When conditions inside individual EditData Entries and show all entries.
    pub ignore_entry_when_conditions: Option<bool>,
}
