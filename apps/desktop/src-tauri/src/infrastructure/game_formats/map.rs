use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub const TMX_FLIPPED_HORIZONTALLY_FLAG: u32 = 0x8000_0000;
pub const TMX_FLIPPED_VERTICALLY_FLAG: u32 = 0x4000_0000;
pub const TMX_FLIPPED_DIAGONALLY_FLAG: u32 = 0x2000_0000;
pub const TMX_ROTATED_HEXAGONAL_120_FLAG: u32 = 0x1000_0000;
pub const TMX_GID_FLAGS: u32 = TMX_FLIPPED_HORIZONTALLY_FLAG
    | TMX_FLIPPED_VERTICALLY_FLAG
    | TMX_FLIPPED_DIAGONALLY_FLAG
    | TMX_ROTATED_HEXAGONAL_120_FLAG;

/// Returns the tileset GID without TMX flip or rotation flags.
pub fn base_gid(gid: u32) -> u32 {
    gid & !TMX_GID_FLAGS
}

/// Returns only the TMX flip and rotation flags attached to a GID.
pub fn gid_flags(gid: u32) -> u32 {
    gid & TMX_GID_FLAGS
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MapFormat {
    Tmx,
    Tbin,
    Xnb,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MapLayerDataEncoding {
    Csv,
    Xml,
    Base64,
}

impl Default for MapLayerDataEncoding {
    fn default() -> Self {
        Self::Csv
    }
}

fn default_visible() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MapLayerOrderEntry {
    TileLayer(u32),
    ObjectGroup(u32),
    Preserved(u32),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapPreservedXml {
    pub xml: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapDocument {
    pub name: String,
    pub format: MapFormat,
    pub source_path: String,
    pub relative_path: String,
    pub width: u32,
    pub height: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub orientation: String,
    pub render_order: String,
    #[serde(default)]
    pub tmx_version: Option<String>,
    #[serde(default)]
    pub tiled_version: Option<String>,
    #[serde(default)]
    pub next_layer_id: Option<u32>,
    #[serde(default)]
    pub next_object_id: Option<u32>,
    #[serde(default)]
    pub infinite: bool,
    pub properties: HashMap<String, MapPropertyValue>,
    pub tilesets: Vec<MapTileset>,
    pub layers: Vec<MapLayer>,
    pub object_groups: Vec<MapObjectGroup>,
    #[serde(default)]
    pub layer_order: Vec<MapLayerOrderEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preserved_xml: Vec<MapPreservedXml>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MapPropertyValue {
    String(String),
    Number(f64),
    Bool(bool),
    Typed {
        value: Box<MapPropertyValue>,
        tmx_type: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        property_type: Option<String>,
    },
}

impl MapPropertyValue {
    pub fn untyped(&self) -> &Self {
        match self {
            Self::Typed { value, .. } => value.untyped(),
            value => value,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTileset {
    pub first_gid: u32,
    pub name: String,
    pub tile_width: u32,
    pub tile_height: u32,
    pub tile_count: u32,
    pub columns: u32,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub margin: u32,
    #[serde(default)]
    pub spacing: u32,
    #[serde(default)]
    pub tile_offset_x: i32,
    #[serde(default)]
    pub tile_offset_y: i32,
    pub image_source: Option<String>,
    pub image_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    #[serde(default)]
    pub image_trans: Option<String>,
    pub properties: HashMap<String, MapPropertyValue>,
    pub tile_properties: HashMap<u32, HashMap<String, MapPropertyValue>>,
    pub animations: HashMap<u32, Vec<MapTilesetAnimationFrame>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub preserved_attributes: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub tile_preserved_attributes: HashMap<u32, HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub tile_preserved_xml: HashMap<u32, Vec<MapPreservedXml>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preserved_xml: Vec<MapPreservedXml>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTilesetAnimationFrame {
    pub tile_id: u32,
    pub duration: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapLayer {
    pub id: u32,
    pub name: String,
    pub kind: String,
    pub width: u32,
    pub height: u32,
    pub visible: bool,
    pub opacity: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub properties: HashMap<String, MapPropertyValue>,
    pub gids: Vec<u32>,
    pub non_empty_tiles: u32,
    #[serde(default)]
    pub data_encoding: MapLayerDataEncoding,
    #[serde(default)]
    pub data_compression: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub cell_properties: HashMap<u32, HashMap<String, MapPropertyValue>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub cell_animations: HashMap<u32, Vec<MapTilesetAnimationFrame>>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preserved_xml: Vec<MapPreservedXml>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapObjectGroup {
    pub id: u32,
    pub name: String,
    pub kind: String,
    pub visible: bool,
    pub opacity: f32,
    pub draw_order: String,
    pub properties: HashMap<String, MapPropertyValue>,
    pub objects: Vec<MapObject>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preserved_xml: Vec<MapPreservedXml>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapObject {
    pub id: u32,
    pub name: String,
    #[serde(rename = "type")]
    pub r#type: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub rotation: f32,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default)]
    pub gid: Option<u32>,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub class: Option<String>,
    #[serde(default)]
    pub shape: String,
    pub properties: HashMap<String, MapPropertyValue>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preserved_xml: Vec<MapPreservedXml>,
}
