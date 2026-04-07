use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::pathing::normalize_path;

#[derive(Debug, Clone)]
struct Cursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        if self.pos >= self.data.len() {
            return Err("Unexpected end of TBin buffer.".to_string());
        }
        let value = self.data[self.pos];
        self.pos += 1;
        Ok(value)
    }

    fn read_i32(&mut self) -> Result<i32, String> {
        if self.pos + 4 > self.data.len() {
            return Err("Unexpected end of TBin buffer.".to_string());
        }
        let bytes = &self.data[self.pos..self.pos + 4];
        self.pos += 4;
        Ok(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_f32(&mut self) -> Result<f32, String> {
        if self.pos + 4 > self.data.len() {
            return Err("Unexpected end of TBin buffer.".to_string());
        }
        let bytes = &self.data[self.pos..self.pos + 4];
        self.pos += 4;
        Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_string(&mut self) -> Result<String, String> {
        let len = self.read_i32()? as usize;
        if self.pos + len > self.data.len() {
            return Err("Unexpected end of TBin string.".to_string());
        }
        let raw = &self.data[self.pos..self.pos + len];
        self.pos += len;
        let value = std::str::from_utf8(raw).map_err(|error| format!("Invalid UTF-8: {error}"))?;
        Ok(value.to_string())
    }
}

#[derive(Debug, Clone)]
struct Vector2i {
    x: i32,
    y: i32,
}

impl Vector2i {
    fn read(cursor: &mut Cursor<'_>) -> Result<Self, String> {
        Ok(Self {
            x: cursor.read_i32()?,
            y: cursor.read_i32()?,
        })
    }
}

#[derive(Debug, Clone)]
enum PropertyValue {
    Bool(bool),
    Integer(i32),
    Float(f32),
    String(String),
}

fn read_properties(cursor: &mut Cursor<'_>) -> Result<HashMap<String, PropertyValue>, String> {
    let count = cursor.read_i32()? as usize;
    let mut map = HashMap::with_capacity(count);
    for _ in 0..count {
        let key = cursor.read_string()?;
        let kind = cursor.read_u8()?;
        let value = match kind {
            0 => PropertyValue::Bool(cursor.read_u8()? > 0),
            1 => PropertyValue::Integer(cursor.read_i32()?),
            2 => PropertyValue::Float(cursor.read_f32()?),
            3 => PropertyValue::String(cursor.read_string()?),
            _ => return Err(format!("Unknown TBin property type {kind}.")),
        };
        map.insert(key, value);
    }
    Ok(map)
}

#[derive(Debug, Clone)]
struct TileSheet {
    id: String,
    image: String,
    sheet_size: Vector2i,
    tile_size: Vector2i,
    properties: HashMap<String, PropertyValue>,
}

#[derive(Debug, Clone)]
struct Tile {
    tilesheet: String,
    tile_index: i32,
    properties: HashMap<String, PropertyValue>,
    animation_interval: i32,
    animation_frames: Vec<Tile>,
}

impl Tile {
    fn null() -> Self {
        Self {
            tilesheet: String::new(),
            tile_index: -1,
            properties: HashMap::new(),
            animation_interval: 0,
            animation_frames: Vec::new(),
        }
    }

    fn is_null(&self) -> bool {
        self.tile_index == -1 && self.animation_frames.is_empty()
    }
}

#[derive(Debug, Clone)]
struct Layer {
    id: String,
    visible: bool,
    layer_size: Vector2i,
    tile_size: Vector2i,
    properties: HashMap<String, PropertyValue>,
    tiles: Vec<Tile>,
}

#[derive(Debug, Clone)]
struct Map {
    id: String,
    properties: HashMap<String, PropertyValue>,
    tilesheets: Vec<TileSheet>,
    layers: Vec<Layer>,
}

fn read_tile_sheet(cursor: &mut Cursor<'_>) -> Result<TileSheet, String> {
    let id = cursor.read_string()?;
    let _desc = cursor.read_string()?;
    let image = cursor.read_string()?;
    let sheet_size = Vector2i::read(cursor)?;
    let tile_size = Vector2i::read(cursor)?;
    let _margin = Vector2i::read(cursor)?;
    let _spacing = Vector2i::read(cursor)?;
    let properties = read_properties(cursor)?;

    Ok(TileSheet {
        id,
        image,
        sheet_size,
        tile_size,
        properties,
    })
}

fn read_static_tile(cursor: &mut Cursor<'_>, current_tilesheet: &str) -> Result<Tile, String> {
    let tile_index = cursor.read_i32()?;
    let _blend_mode = cursor.read_u8()?;
    let properties = read_properties(cursor)?;

    Ok(Tile {
        tilesheet: current_tilesheet.to_string(),
        tile_index,
        properties,
        animation_interval: 0,
        animation_frames: Vec::new(),
    })
}

fn read_animated_tile(cursor: &mut Cursor<'_>) -> Result<Tile, String> {
    let interval = cursor.read_i32()?;
    let frame_count = cursor.read_i32()? as usize;
    let mut frames = Vec::with_capacity(frame_count);
    let mut current_tilesheet = String::new();

    let mut read_frames = 0usize;
    while read_frames < frame_count {
        let token = cursor.read_u8()? as char;
        match token {
            'T' => {
                current_tilesheet = cursor.read_string()?;
            }
            'S' => {
                frames.push(read_static_tile(cursor, &current_tilesheet)?);
                read_frames += 1;
            }
            _ => return Err("Bad animated tile data.".to_string()),
        }
    }

    Ok(Tile {
        tilesheet: String::new(),
        tile_index: -1,
        properties: read_properties(cursor)?,
        animation_interval: interval,
        animation_frames: frames,
    })
}

fn read_layer(cursor: &mut Cursor<'_>) -> Result<Layer, String> {
    let id = cursor.read_string()?;
    let visible = cursor.read_u8()? > 0;
    let _desc = cursor.read_string()?;
    let layer_size = Vector2i::read(cursor)?;
    let tile_size = Vector2i::read(cursor)?;
    let properties = read_properties(cursor)?;
    let mut tiles = vec![Tile::null(); (layer_size.x * layer_size.y) as usize];
    let mut current_tilesheet = String::new();

    for iy in 0..layer_size.y {
        let mut ix = 0;
        while ix < layer_size.x {
            let token = cursor.read_u8()? as char;
            match token {
                'N' => {
                    let skip = cursor.read_i32()?;
                    ix += skip;
                }
                'S' => {
                    let tile = read_static_tile(cursor, &current_tilesheet)?;
                    let index = (ix + iy * layer_size.x) as usize;
                    tiles[index] = tile;
                    ix += 1;
                }
                'A' => {
                    let tile = read_animated_tile(cursor)?;
                    let index = (ix + iy * layer_size.x) as usize;
                    tiles[index] = tile;
                    ix += 1;
                }
                'T' => {
                    current_tilesheet = cursor.read_string()?;
                }
                _ => return Err("Bad layer tile data.".to_string()),
            }
        }
    }

    Ok(Layer {
        id,
        visible,
        layer_size,
        tile_size,
        properties,
        tiles,
    })
}

fn read_map(cursor: &mut Cursor<'_>) -> Result<Map, String> {
    let magic = {
        if cursor.data.len() < 6 {
            return Err("TBin buffer is too small.".to_string());
        }
        let raw = &cursor.data[cursor.pos..cursor.pos + 6];
        cursor.pos += 6;
        std::str::from_utf8(raw)
            .map_err(|_| "Invalid TBin header.".to_string())?
            .to_string()
    };

    if magic != "tBIN10" {
        return Err("File is not a tbin file.".to_string());
    }

    let id = cursor.read_string()?;
    let _desc = cursor.read_string()?;
    let properties = read_properties(cursor)?;
    let tilesheet_count = cursor.read_i32()? as usize;
    let mut tilesheets = Vec::with_capacity(tilesheet_count);
    for _ in 0..tilesheet_count {
        tilesheets.push(read_tile_sheet(cursor)?);
    }

    let layer_count = cursor.read_i32()? as usize;
    let mut layers = Vec::with_capacity(layer_count);
    for _ in 0..layer_count {
        layers.push(read_layer(cursor)?);
    }

    Ok(Map {
        id,
        properties,
        tilesheets,
        layers,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapDocument {
    pub name: String,
    pub format: String,
    pub source_path: String,
    pub relative_path: String,
    pub width: u32,
    pub height: u32,
    pub tile_width: u32,
    pub tile_height: u32,
    pub orientation: String,
    pub render_order: String,
    pub properties: HashMap<String, MapPropertyValue>,
    pub tilesets: Vec<MapTileset>,
    pub layers: Vec<MapLayer>,
    pub object_groups: Vec<MapObjectGroup>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum MapPropertyValue {
    String(String),
    Number(f64),
    Bool(bool),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTileset {
    pub first_gid: u32,
    pub name: String,
    pub tile_width: u32,
    pub tile_height: u32,
    pub tile_count: u32,
    pub columns: u32,
    pub image_source: Option<String>,
    pub image_path: Option<String>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub properties: HashMap<String, MapPropertyValue>,
    pub tile_properties: HashMap<u32, HashMap<String, MapPropertyValue>>,
    pub animations: HashMap<u32, Vec<MapTilesetAnimationFrame>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapTilesetAnimationFrame {
    pub tile_id: u32,
    pub duration: u32,
}

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Serialize)]
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
}

#[derive(Debug, Serialize)]
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
    pub properties: HashMap<String, MapPropertyValue>,
}

fn property_to_value(value: &PropertyValue) -> MapPropertyValue {
    match value {
        PropertyValue::Bool(value) => MapPropertyValue::Bool(*value),
        PropertyValue::Integer(value) => MapPropertyValue::Number(*value as f64),
        PropertyValue::Float(value) => MapPropertyValue::Number(*value as f64),
        PropertyValue::String(value) => MapPropertyValue::String(value.clone()),
    }
}

fn convert_properties(
    values: &HashMap<String, PropertyValue>,
) -> HashMap<String, MapPropertyValue> {
    values
        .iter()
        .map(|(key, value)| (key.clone(), property_to_value(value)))
        .collect()
}

pub fn parse_tbin_map(
    bytes: &[u8],
    map_path: &Path,
    relative_path: &str,
) -> Result<MapDocument, String> {
    let mut cursor = Cursor::new(bytes);
    let map = read_map(&mut cursor)?;

    let (map_width, map_height, tile_width, tile_height) = map.layers.iter().fold(
        (0u32, 0u32, 0u32, 0u32),
        |(map_width, map_height, tile_width, tile_height), layer| {
            (
                map_width.max(layer.layer_size.x.max(0) as u32),
                map_height.max(layer.layer_size.y.max(0) as u32),
                tile_width.max(layer.tile_size.x.max(0) as u32),
                tile_height.max(layer.tile_size.y.max(0) as u32),
            )
        },
    );

    let content_root = resolve_content_root(map_path);
    let mut tilesets = Vec::with_capacity(map.tilesheets.len());
    let mut tilesheet_gid = HashMap::<String, u32>::new();
    let mut next_gid = 1u32;

    for sheet in &map.tilesheets {
        let tile_count = (sheet.sheet_size.x.max(0) * sheet.sheet_size.y.max(0)) as u32;
        let columns = sheet.sheet_size.x.max(0) as u32;
        let image_width = sheet
            .sheet_size
            .x
            .checked_mul(sheet.tile_size.x)
            .map(|value| value.max(0) as u32);
        let image_height = sheet
            .sheet_size
            .y
            .checked_mul(sheet.tile_size.y)
            .map(|value| value.max(0) as u32);

        let image_source = if sheet.image.is_empty() {
            None
        } else {
            Some(sheet.image.clone())
        };
        let image_path = image_source
            .as_ref()
            .and_then(|source| resolve_tilesheet_path(map_path, &content_root, source));

        tilesheet_gid.insert(sheet.id.clone(), next_gid);

        tilesets.push(MapTileset {
            first_gid: next_gid,
            name: sheet.id.clone(),
            tile_width: sheet.tile_size.x.max(0) as u32,
            tile_height: sheet.tile_size.y.max(0) as u32,
            tile_count,
            columns,
            image_source,
            image_path,
            image_width,
            image_height,
            properties: convert_properties(&sheet.properties),
            tile_properties: HashMap::new(),
            animations: HashMap::new(),
        });

        next_gid = next_gid.saturating_add(tile_count.max(1));
    }

    let mut tilesets_by_name: HashMap<String, usize> = HashMap::new();
    for (index, tileset) in tilesets.iter().enumerate() {
        tilesets_by_name.insert(tileset.name.clone(), index);
    }

    let mut layers = Vec::with_capacity(map.layers.len());
    let mut next_layer_id = 1u32;

    for layer in &map.layers {
        let mut gids = vec![0u32; (layer.layer_size.x * layer.layer_size.y) as usize];
        let mut non_empty_tiles = 0u32;

        for (index, tile) in layer.tiles.iter().enumerate() {
            if tile.is_null() {
                continue;
            }

            if tile.animation_frames.is_empty() {
                if let Some(gid) =
                    resolve_gid(&tilesheet_gid, &tilesets_by_name, &mut tilesets, tile)
                {
                    gids[index] = gid;
                    if gid != 0 {
                        non_empty_tiles += 1;
                    }
                }
            } else {
                if let Some(gid) =
                    resolve_animated_gid(&tilesheet_gid, &tilesets_by_name, &mut tilesets, tile)
                {
                    gids[index] = gid;
                    if gid != 0 {
                        non_empty_tiles += 1;
                    }
                }
            }
        }

        layers.push(MapLayer {
            id: next_layer_id,
            name: layer.id.clone(),
            kind: "tile".to_string(),
            width: layer.layer_size.x.max(0) as u32,
            height: layer.layer_size.y.max(0) as u32,
            visible: layer.visible,
            opacity: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            properties: convert_properties(&layer.properties),
            gids,
            non_empty_tiles,
        });
        next_layer_id += 1;
    }

    let document = MapDocument {
        name: map.id.clone(),
        format: "xnb".to_string(),
        source_path: normalize_path(map_path),
        relative_path: relative_path.to_string(),
        width: map_width,
        height: map_height,
        tile_width,
        tile_height,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        properties: convert_properties(&map.properties),
        tilesets,
        layers,
        object_groups: Vec::new(),
    };

    Ok(document)
}

fn resolve_gid(
    tilesheet_gid: &HashMap<String, u32>,
    tilesets_by_name: &HashMap<String, usize>,
    tilesets: &mut [MapTileset],
    tile: &Tile,
) -> Option<u32> {
    let tilesheet_first_gid = tilesheet_gid.get(&tile.tilesheet)?;
    let tileset_index = tilesets_by_name.get(&tile.tilesheet)?;
    let tileset = tilesets.get_mut(*tileset_index)?;

    if tile.tile_index < 0 {
        return Some(0);
    }

    let tile_id = tile.tile_index as u32;
    let gid = tilesheet_first_gid.saturating_add(tile_id);
    if !tile.properties.is_empty() {
        let entry = tileset
            .tile_properties
            .entry(tile_id)
            .or_insert_with(HashMap::new);
        for (key, value) in &tile.properties {
            entry.insert(key.clone(), property_to_value(value));
        }
    }
    Some(gid)
}

fn resolve_animated_gid(
    tilesheet_gid: &HashMap<String, u32>,
    tilesets_by_name: &HashMap<String, usize>,
    tilesets: &mut [MapTileset],
    tile: &Tile,
) -> Option<u32> {
    let first_frame = tile.animation_frames.first()?;
    let tilesheet_first_gid = tilesheet_gid.get(&first_frame.tilesheet)?;
    let tileset_index = tilesets_by_name.get(&first_frame.tilesheet)?;
    let tileset = tilesets.get_mut(*tileset_index)?;
    let tile_id = first_frame.tile_index.max(0) as u32;
    let gid = tilesheet_first_gid.saturating_add(tile_id);

    let frame_duration = tile.animation_interval.max(0) as u32;
    let frames = tile
        .animation_frames
        .iter()
        .filter_map(|frame| {
            if frame.tilesheet != first_frame.tilesheet || frame.tile_index < 0 {
                return None;
            }
            Some(MapTilesetAnimationFrame {
                tile_id: frame.tile_index as u32,
                duration: frame_duration,
            })
        })
        .collect::<Vec<_>>();

    if !frames.is_empty() {
        tileset.animations.insert(tile_id, frames);
    }
    if !tile.properties.is_empty() {
        let entry = tileset
            .tile_properties
            .entry(tile_id)
            .or_insert_with(HashMap::new);
        for (key, value) in &tile.properties {
            entry.insert(key.clone(), property_to_value(value));
        }
    }

    Some(gid)
}

fn resolve_content_root(map_path: &Path) -> PathBuf {
    let mut current = map_path;
    while let Some(parent) = current.parent() {
        if parent
            .file_name()
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("Content"))
        {
            return parent.to_path_buf();
        }
        current = parent;
    }
    map_path.parent().unwrap_or(map_path).to_path_buf()
}

fn resolve_tilesheet_path(map_path: &Path, content_root: &Path, source: &str) -> Option<String> {
    let normalized = source.replace(['/', '\\'], "\\");
    let source_path = PathBuf::from(normalized);
    let mut candidates = Vec::new();

    if source_path.is_absolute() {
        candidates.push(source_path.clone());
    } else {
        let map_directory = map_path.parent().unwrap_or(content_root);
        candidates.push(map_directory.join(&source_path));
        candidates.push(content_root.join(&source_path));
    }

    for candidate in candidates {
        for resolved in candidate_with_extensions(candidate) {
            if resolved.exists() {
                return Some(normalize_path(&resolved));
            }
        }
    }

    let fallback = if source_path.is_absolute() {
        candidate_with_extensions(source_path).into_iter().next()
    } else {
        let map_directory = map_path.parent().unwrap_or(content_root);
        candidate_with_extensions(map_directory.join(&source_path))
            .into_iter()
            .next()
            .or_else(|| {
                candidate_with_extensions(content_root.join(&source_path))
                    .into_iter()
                    .next()
            })
    }?;

    Some(normalize_path(&fallback))
}

fn candidate_with_extensions(path: PathBuf) -> Vec<PathBuf> {
    if path.extension().is_some() {
        return vec![path];
    }

    let mut xnb = path.clone();
    xnb.set_extension("xnb");

    let mut png = path.clone();
    png.set_extension("png");

    vec![xnb, png]
}
