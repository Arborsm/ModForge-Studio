use serde::Serialize;
use std::collections::BTreeMap;

use crate::domain::assets;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRegistryEntry {
    pub id: String,
    pub kind: String,
    pub value: String,
    pub label: String,
    pub source: String,
    pub source_kind: String,
    pub category: Option<String>,
    pub metadata: BTreeMap<String, String>,
    pub relative_path: Option<String>,
    pub absolute_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRegistry {
    pub entries: Vec<ResourceRegistryEntry>,
    pub warnings: Vec<String>,
}

fn push_entry(
    entries: &mut Vec<ResourceRegistryEntry>,
    kind: &str,
    value: String,
    label: String,
    source: &str,
    source_kind: &str,
    category: Option<String>,
    metadata: BTreeMap<String, String>,
    relative_path: Option<String>,
    absolute_path: Option<String>,
) {
    entries.push(ResourceRegistryEntry {
        id: format!("{kind}:{source_kind}:{value}"),
        kind: kind.to_string(),
        value,
        label,
        source: source.to_string(),
        source_kind: source_kind.to_string(),
        category,
        metadata,
        relative_path,
        absolute_path,
    });
}

pub(crate) fn parse_item_entries(
    content: &str,
    entries: &mut Vec<ResourceRegistryEntry>,
    source: &str,
    qualifier: &str,
    asset_path: &str,
    asset_label: &str,
) -> Result<(), String> {
    let parsed: BTreeMap<String, serde_json::Value> = serde_json::from_str(content)
        .map_err(|error| format!("Failed to parse {asset_label}: {error}"))?;

    for (item_id, value) in parsed {
        let display_name = value
            .get("DisplayName")
            .and_then(|field| field.as_str())
            .or_else(|| value.get("Name").and_then(|field| field.as_str()))
            .unwrap_or(&item_id)
            .trim();
        let item_value = format!("{qualifier}{item_id}");
        let mut metadata = BTreeMap::new();
        metadata.insert("id".to_string(), item_id.clone());
        metadata.insert("qualifiedId".to_string(), item_value.clone());
        metadata.insert("asset".to_string(), asset_label.to_string());
        push_entry(
            entries,
            "item",
            item_value.clone(),
            format!("{display_name} {item_value}"),
            source,
            "game",
            Some(asset_label.trim_start_matches("Data/").to_string()),
            metadata,
            Some(asset_path.to_string()),
            None,
        );
    }

    Ok(())
}

pub(crate) fn parse_character_entries(
    content: &str,
    entries: &mut Vec<ResourceRegistryEntry>,
    source: &str,
) -> Result<(), String> {
    let parsed: BTreeMap<String, serde_json::Value> = serde_json::from_str(content)
        .map_err(|error| format!("Failed to parse Data/Characters: {error}"))?;

    for (key, value) in parsed {
        let display_name = value
            .get("DisplayName")
            .and_then(|field| field.as_str())
            .unwrap_or(&key)
            .trim()
            .to_string();
        push_entry(
            entries,
            "actor",
            key,
            display_name,
            source,
            "game",
            Some("Characters".to_string()),
            BTreeMap::new(),
            Some("Content/Data/Characters.xnb".to_string()),
            None,
        );
    }

    Ok(())
}

pub(crate) fn load_resource_registry(
    root_path: String,
    locale: Option<String>,
) -> Result<ResourceRegistry, String> {
    let mut entries = Vec::new();
    let mut warnings = Vec::new();
    let source = "Game assets";

    match assets::scan_maps(root_path.clone(), locale.clone()) {
        Ok(maps) => {
            for map in maps {
                push_entry(
                    &mut entries,
                    "location",
                    map.name.clone(),
                    map.name,
                    source,
                    "game",
                    Some("Maps".to_string()),
                    BTreeMap::new(),
                    Some(map.relative_path),
                    Some(map.absolute_path),
                );
            }
        }
        Err(error) => warnings.push(error),
    }

    match assets::scan_audio_assets(root_path.clone()) {
        Ok(audio_assets) => {
            for asset in audio_assets {
                let kind = if asset.kind == "music" {
                    "music"
                } else {
                    "sound"
                };
                push_entry(
                    &mut entries,
                    kind,
                    asset.cue.clone(),
                    asset.cue,
                    source,
                    "game",
                    Some(if kind == "music" { "Music" } else { "Sound" }.to_string()),
                    BTreeMap::new(),
                    Some(asset.relative_path),
                    Some(asset.absolute_path),
                );
            }
        }
        Err(error) => warnings.push(error),
    }

    for item_asset in item_asset_specs() {
        match assets::load_text_asset(
            root_path.clone(),
            item_asset.asset_path.to_string(),
            locale.clone(),
        ) {
            Ok(asset) => {
                if let Err(error) = parse_item_entries(
                    &asset.content,
                    &mut entries,
                    source,
                    item_asset.qualifier,
                    item_asset.asset_path,
                    item_asset.label,
                ) {
                    warnings.push(error);
                }
            }
            Err(error) => warnings.push(error),
        }
    }

    match assets::load_text_asset(root_path, "Content/Data/Characters.xnb".to_string(), locale) {
        Ok(asset) => {
            if let Err(error) = parse_character_entries(&asset.content, &mut entries, source) {
                warnings.push(error);
            }
        }
        Err(error) => warnings.push(error),
    }

    entries.sort_by(|left, right| {
        left.kind
            .cmp(&right.kind)
            .then_with(|| left.value.cmp(&right.value))
            .then_with(|| left.label.to_lowercase().cmp(&right.label.to_lowercase()))
    });
    entries.dedup_by(|left, right| left.kind == right.kind && left.value == right.value);

    Ok(ResourceRegistry { entries, warnings })
}

struct ItemAssetSpec {
    label: &'static str,
    asset_path: &'static str,
    qualifier: &'static str,
}

fn item_asset_specs() -> &'static [ItemAssetSpec] {
    &[
        ItemAssetSpec {
            label: "Data/Objects",
            asset_path: "Content/Data/Objects.xnb",
            qualifier: "(O)",
        },
        ItemAssetSpec {
            label: "Data/Crops",
            asset_path: "Content/Data/Crops.xnb",
            qualifier: "(O)",
        },
        ItemAssetSpec {
            label: "Data/Fish",
            asset_path: "Content/Data/Fish.xnb",
            qualifier: "(O)",
        },
        ItemAssetSpec {
            label: "Data/BigCraftables",
            asset_path: "Content/Data/BigCraftables.xnb",
            qualifier: "(BC)",
        },
        ItemAssetSpec {
            label: "Data/Weapons",
            asset_path: "Content/Data/Weapons.xnb",
            qualifier: "(W)",
        },
        ItemAssetSpec {
            label: "Data/Tools",
            asset_path: "Content/Data/Tools.xnb",
            qualifier: "(T)",
        },
        ItemAssetSpec {
            label: "Data/Shirts",
            asset_path: "Content/Data/Shirts.xnb",
            qualifier: "(S)",
        },
        ItemAssetSpec {
            label: "Data/Pants",
            asset_path: "Content/Data/Pants.xnb",
            qualifier: "(P)",
        },
        ItemAssetSpec {
            label: "Data/Trinkets",
            asset_path: "Content/Data/Trinkets.xnb",
            qualifier: "(TR)",
        },
        ItemAssetSpec {
            label: "Data/Hats",
            asset_path: "Content/Data/Hats.xnb",
            qualifier: "(H)",
        },
        ItemAssetSpec {
            label: "Data/Boots",
            asset_path: "Content/Data/Boots.xnb",
            qualifier: "(B)",
        },
        ItemAssetSpec {
            label: "Data/Furniture",
            asset_path: "Content/Data/Furniture.xnb",
            qualifier: "(F)",
        },
    ]
}

#[cfg(test)]
#[path = "../tests/resource_registry_tests.rs"]
mod tests;
