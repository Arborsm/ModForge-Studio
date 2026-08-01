use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::infrastructure::fs::pathing::normalize_path;
#[allow(unused_imports)]
pub use crate::infrastructure::game_formats::map::{
    MapDocument, MapFormat, MapLayer, MapLayerDataEncoding, MapLayerOrderEntry, MapObject,
    MapObjectGroup, MapPropertyValue, MapTileset, MapTilesetAnimationFrame, base_gid, gid_flags,
};
use anyhow::{Context, bail};

#[derive(Debug, Clone)]
struct Cursor<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    fn read_u8(&mut self) -> anyhow::Result<u8> {
        if self.pos >= self.data.len() {
            bail!("Unexpected end of TBin buffer.");
        }
        let value = self.data[self.pos];
        self.pos += 1;
        Ok(value)
    }

    fn read_i32(&mut self) -> anyhow::Result<i32> {
        if self.pos + 4 > self.data.len() {
            bail!("Unexpected end of TBin buffer.");
        }
        let bytes = &self.data[self.pos..self.pos + 4];
        self.pos += 4;
        Ok(i32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_f32(&mut self) -> anyhow::Result<f32> {
        if self.pos + 4 > self.data.len() {
            bail!("Unexpected end of TBin buffer.");
        }
        let bytes = &self.data[self.pos..self.pos + 4];
        self.pos += 4;
        Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    fn read_string(&mut self) -> anyhow::Result<String> {
        let len = self.read_i32()? as usize;
        if self.pos + len > self.data.len() {
            bail!("Unexpected end of TBin string.");
        }
        let raw = &self.data[self.pos..self.pos + len];
        self.pos += len;
        let value = std::str::from_utf8(raw).with_context(|| format!("Invalid UTF-8"))?;
        Ok(value.to_string())
    }
}

#[derive(Debug, Clone)]
struct Vector2i {
    x: i32,
    y: i32,
}

impl Vector2i {
    fn read(cursor: &mut Cursor<'_>) -> anyhow::Result<Self> {
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

fn read_properties(cursor: &mut Cursor<'_>) -> anyhow::Result<HashMap<String, PropertyValue>> {
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
            _ => bail!("Unknown TBin property type {kind}."),
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

fn read_tile_sheet(cursor: &mut Cursor<'_>) -> anyhow::Result<TileSheet> {
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

fn read_static_tile(cursor: &mut Cursor<'_>, current_tilesheet: &str) -> anyhow::Result<Tile> {
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

fn read_animated_tile(cursor: &mut Cursor<'_>) -> anyhow::Result<Tile> {
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
            _ => bail!("Bad animated tile data."),
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

fn read_layer(cursor: &mut Cursor<'_>) -> anyhow::Result<Layer> {
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
                _ => bail!("Bad layer tile data."),
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

fn read_map(cursor: &mut Cursor<'_>) -> anyhow::Result<Map> {
    let magic = {
        if cursor.data.len() < 6 {
            bail!("TBin buffer is too small.");
        }
        let raw = &cursor.data[cursor.pos..cursor.pos + 6];
        cursor.pos += 6;
        std::str::from_utf8(raw)?.to_string()
    };

    if magic != "tBIN10" {
        bail!("File is not a tbin file.");
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

fn push_u8(bytes: &mut Vec<u8>, value: u8) {
    bytes.push(value);
}

fn push_i32(bytes: &mut Vec<u8>, value: i32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn push_f32(bytes: &mut Vec<u8>, value: f32) {
    bytes.extend_from_slice(&value.to_le_bytes());
}

fn checked_i32_from_u32(label: &str, value: u32) -> anyhow::Result<i32> {
    i32::try_from(value).with_context(|| format!("{label} value {value} exceeds tBIN limits."))
}

fn checked_i32_from_usize(label: &str, value: usize) -> anyhow::Result<i32> {
    i32::try_from(value).with_context(|| format!("{label} value {value} exceeds tBIN limits."))
}

fn push_string(bytes: &mut Vec<u8>, value: &str) -> anyhow::Result<()> {
    push_i32(bytes, checked_i32_from_usize("String length", value.len())?);
    bytes.extend_from_slice(value.as_bytes());
    Ok(())
}

fn push_vector(bytes: &mut Vec<u8>, x: i32, y: i32) {
    push_i32(bytes, x);
    push_i32(bytes, y);
}

fn write_properties(
    bytes: &mut Vec<u8>,
    properties: &HashMap<String, MapPropertyValue>,
) -> anyhow::Result<()> {
    let mut entries = properties.iter().collect::<Vec<_>>();
    entries.sort_by(|(left_key, _), (right_key, _)| left_key.cmp(right_key));

    push_i32(
        bytes,
        checked_i32_from_usize("Property count", entries.len())?,
    );
    for (key, value) in entries {
        push_string(bytes, key)?;
        write_property_value(bytes, key, value)?;
    }

    Ok(())
}

fn write_property_value(
    bytes: &mut Vec<u8>,
    key: &str,
    value: &MapPropertyValue,
) -> anyhow::Result<()> {
    match value {
        MapPropertyValue::Bool(value) => {
            push_u8(bytes, 0);
            push_u8(bytes, u8::from(*value));
        }
        MapPropertyValue::Number(value) => {
            if !value.is_finite() {
                bail!("Property '{key}' has unsupported non-finite number {value}.");
            }

            if value.fract() == 0.0 && *value >= i32::MIN as f64 && *value <= i32::MAX as f64 {
                push_u8(bytes, 1);
                push_i32(bytes, *value as i32);
            } else if *value >= f32::MIN as f64 && *value <= f32::MAX as f64 {
                push_u8(bytes, 2);
                push_f32(bytes, *value as f32);
            } else {
                bail!("Property '{key}' number {value} is out of range for tBIN serialization.");
            }
        }
        MapPropertyValue::String(value) => {
            push_u8(bytes, 3);
            push_string(bytes, value)?;
        }
        MapPropertyValue::Typed {
            value,
            tmx_type,
            property_type,
        } => {
            if property_type.is_some()
                || !matches!(tmx_type.as_str(), "" | "string" | "bool" | "int" | "float")
            {
                bail!(
                    "Property '{key}' uses TMX type '{tmx_type}' or custom property type '{}' which tBIN cannot preserve. Save as TMX instead.",
                    property_type.as_deref().unwrap_or("")
                );
            }
            write_property_value(bytes, key, value)?;
        }
    }
    Ok(())
}

fn write_optional_properties(
    bytes: &mut Vec<u8>,
    properties: Option<&HashMap<String, MapPropertyValue>>,
) -> anyhow::Result<()> {
    match properties {
        Some(properties) => write_properties(bytes, properties),
        None => {
            push_i32(bytes, 0);
            Ok(())
        }
    }
}

fn tileset_sheet_size(tileset: &MapTileset) -> anyhow::Result<(i32, i32)> {
    if tileset.columns == 0
        || tileset.tile_count == 0
        || tileset.tile_width == 0
        || tileset.tile_height == 0
    {
        bail!("Tileset '{}' has invalid tileset dimensions.", tileset.name);
    }

    if tileset.tile_count % tileset.columns != 0 {
        bail!(
            "Tileset '{}' has a non-rectangular sheet and cannot be serialized to tBIN.",
            tileset.name
        );
    }

    Ok((
        checked_i32_from_u32("Tileset columns", tileset.columns)?,
        checked_i32_from_u32("Tileset rows", tileset.tile_count / tileset.columns)?,
    ))
}

fn sorted_tilesets(document: &MapDocument) -> anyhow::Result<Vec<&MapTileset>> {
    let mut tilesets = document.tilesets.iter().collect::<Vec<_>>();
    tilesets.sort_by_key(|tileset| tileset.first_gid);

    let mut previous_name: Option<&str> = None;
    let mut previous_end_exclusive = 0u64;

    for tileset in &tilesets {
        if tileset.first_gid == 0 {
            bail!("Tileset '{}' has invalid first_gid 0.", tileset.name);
        }

        tileset_sheet_size(tileset)?;

        let start = u64::from(tileset.first_gid);
        let end_exclusive = start
            .checked_add(u64::from(tileset.tile_count))
            .with_context(|| format!("Tileset '{}' exceeds tBIN gid limits.", tileset.name))?;

        if start < previous_end_exclusive {
            bail!(
                "Tileset ranges overlap between '{}' and '{}'.",
                previous_name.unwrap_or("<unknown>"),
                tileset.name
            );
        }

        previous_name = Some(tileset.name.as_str());
        previous_end_exclusive = end_exclusive;
    }

    Ok(tilesets)
}

fn resolve_tileset_for_gid<'a>(
    gid: u32,
    tilesets: &[&'a MapTileset],
) -> anyhow::Result<(&'a MapTileset, u32)> {
    let gid = u64::from(base_gid(gid));

    for tileset in tilesets {
        let start = u64::from(tileset.first_gid);
        let end_exclusive = start + u64::from(tileset.tile_count);
        if gid >= start && gid < end_exclusive {
            return Ok((tileset, (gid - start) as u32));
        }
    }

    Err(anyhow::anyhow!("GID {gid} is outside all tileset ranges."))
}

fn write_static_tile(
    bytes: &mut Vec<u8>,
    local_tile_id: u32,
    properties: Option<&HashMap<String, MapPropertyValue>>,
) -> anyhow::Result<()> {
    push_u8(bytes, b'S');
    push_i32(bytes, checked_i32_from_u32("Tile id", local_tile_id)?);
    push_u8(bytes, 0);
    write_optional_properties(bytes, properties)
}

fn write_animated_tile(
    bytes: &mut Vec<u8>,
    tileset: &MapTileset,
    local_tile_id: u32,
    frames: &[MapTilesetAnimationFrame],
    properties: Option<&HashMap<String, MapPropertyValue>>,
) -> anyhow::Result<()> {
    let first_frame = frames.first().with_context(|| {
        format!(
            "Tileset '{}' tile {} has an animation with no frames.",
            tileset.name, local_tile_id
        )
    })?;

    if frames
        .iter()
        .any(|frame| frame.duration != first_frame.duration)
    {
        bail!(
            "Tileset '{}' tile {} has mixed-duration animation frames.",
            tileset.name,
            local_tile_id
        );
    }

    if frames
        .iter()
        .any(|frame| frame.tile_id >= tileset.tile_count)
    {
        bail!(
            "Tileset '{}' tile {} has an animation that references a different tileset or an out-of-range tile.",
            tileset.name,
            local_tile_id
        );
    }

    push_u8(bytes, b'A');
    push_i32(
        bytes,
        checked_i32_from_u32("Animation interval", first_frame.duration)?,
    );
    push_i32(
        bytes,
        checked_i32_from_usize("Animation frame count", frames.len())?,
    );
    push_u8(bytes, b'T');
    push_string(bytes, &tileset.name)?;

    for frame in frames {
        push_u8(bytes, b'S');
        push_i32(
            bytes,
            checked_i32_from_u32("Animation frame tile id", frame.tile_id)?,
        );
        push_u8(bytes, 0);
        push_i32(bytes, 0);
    }

    write_optional_properties(bytes, properties)
}

pub fn parse_tbin_map(
    bytes: &[u8],
    map_path: &Path,
    relative_path: &str,
) -> anyhow::Result<MapDocument> {
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
            source: None,
            margin: 0,
            spacing: 0,
            tile_offset_x: 0,
            tile_offset_y: 0,
            image_source,
            image_path,
            image_width,
            image_height,
            image_trans: None,
            properties: convert_properties(&sheet.properties),
            tile_properties: HashMap::new(),
            animations: HashMap::new(),
            preserved_attributes: HashMap::new(),
            tile_preserved_attributes: HashMap::new(),
            tile_preserved_xml: HashMap::new(),
            preserved_xml: Vec::new(),
        });

        next_gid = next_gid.saturating_add(tile_count.max(1));
    }

    let mut layers = Vec::with_capacity(map.layers.len());
    let mut next_layer_id = 1u32;

    for layer in &map.layers {
        let mut gids = vec![0u32; (layer.layer_size.x * layer.layer_size.y) as usize];
        let mut non_empty_tiles = 0u32;
        let mut cell_properties = HashMap::new();
        let mut cell_animations = HashMap::new();

        for (index, tile) in layer.tiles.iter().enumerate() {
            if tile.is_null() {
                continue;
            }

            if tile.animation_frames.is_empty() {
                if let Some(gid) = resolve_gid(&tilesheet_gid, tile) {
                    gids[index] = gid;
                    if gid != 0 {
                        non_empty_tiles += 1;
                    }
                }
            } else {
                if let Some(gid) = resolve_animated_gid(&tilesheet_gid, tile) {
                    gids[index] = gid;
                    if let Some(first_frame) = tile.animation_frames.first() {
                        let duration = tile.animation_interval.max(0) as u32;
                        let frames = tile
                            .animation_frames
                            .iter()
                            .filter(|frame| {
                                frame.tilesheet == first_frame.tilesheet && frame.tile_index >= 0
                            })
                            .map(|frame| MapTilesetAnimationFrame {
                                tile_id: frame.tile_index as u32,
                                duration,
                            })
                            .collect::<Vec<_>>();
                        if !frames.is_empty() {
                            cell_animations.insert(index as u32, frames);
                        }
                    }
                    if gid != 0 {
                        non_empty_tiles += 1;
                    }
                }
            }
            if !tile.properties.is_empty() {
                cell_properties.insert(index as u32, convert_properties(&tile.properties));
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
            data_encoding: MapLayerDataEncoding::Csv,
            data_compression: None,
            cell_properties,
            cell_animations,
            preserved_xml: Vec::new(),
        });
        next_layer_id += 1;
    }

    let layer_order = layers
        .iter()
        .map(|layer| MapLayerOrderEntry::TileLayer(layer.id))
        .collect();
    let document = MapDocument {
        name: map.id.clone(),
        format: if map_path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("tbin"))
        {
            MapFormat::Tbin
        } else {
            MapFormat::Xnb
        },
        source_path: normalize_path(map_path),
        relative_path: relative_path.to_string(),
        width: map_width,
        height: map_height,
        tile_width,
        tile_height,
        orientation: "orthogonal".to_string(),
        render_order: "right-down".to_string(),
        tmx_version: None,
        tiled_version: None,
        next_layer_id: Some(next_layer_id),
        next_object_id: None,
        infinite: false,
        properties: convert_properties(&map.properties),
        tilesets,
        layers,
        object_groups: Vec::new(),
        layer_order,
        preserved_xml: Vec::new(),
    };

    Ok(document)
}

pub fn serialize_tbin_map(document: &MapDocument) -> anyhow::Result<Vec<u8>> {
    if !document.object_groups.is_empty() {
        bail!("Object groups are not supported by tBIN serialization. Save as TMX instead.");
    }

    if !document.preserved_xml.is_empty()
        || document
            .layers
            .iter()
            .any(|layer| !layer.preserved_xml.is_empty())
        || document
            .tilesets
            .iter()
            .any(|tileset| !tileset.preserved_xml.is_empty())
    {
        bail!("tBIN cannot preserve unsupported TMX extension nodes. Save as TMX instead.");
    }

    if document
        .layers
        .iter()
        .flat_map(|layer| layer.gids.iter())
        .any(|gid| gid_flags(*gid) != 0)
    {
        bail!(
            "tBIN cannot represent flipped or rotated tiles. Save as TMX or bake the transforms into a tilesheet first."
        );
    }

    if document.tilesets.iter().any(|tileset| {
        tileset.margin != 0
            || tileset.spacing != 0
            || tileset.tile_offset_x != 0
            || tileset.tile_offset_y != 0
            || tileset.image_trans.is_some()
    }) {
        bail!(
            "tBIN cannot preserve tileset margin, spacing, tile offsets, or transparent-color metadata. Save as TMX instead."
        );
    }

    if document
        .tilesets
        .iter()
        .any(|tileset| !tileset.tile_properties.is_empty() || !tileset.animations.is_empty())
    {
        bail!(
            "tBIN cannot preserve definition-level tile properties or animations. Convert them to map-cell instances or save as TMX instead."
        );
    }

    if document.layers.iter().any(|layer| {
        (layer.opacity - 1.0).abs() > f32::EPSILON
            || layer.offset_x.abs() > f32::EPSILON
            || layer.offset_y.abs() > f32::EPSILON
    }) {
        bail!("tBIN cannot preserve layer opacity or offsets. Reset them or save as TMX instead.");
    }

    let layer_tile_width = checked_i32_from_u32("Layer tile width", document.tile_width)?;
    let layer_tile_height = checked_i32_from_u32("Layer tile height", document.tile_height)?;
    let sorted_tilesets = sorted_tilesets(document)?;

    let mut bytes = Vec::new();
    bytes.extend_from_slice(b"tBIN10");

    push_string(&mut bytes, &document.name)?;
    push_string(&mut bytes, "")?;
    write_properties(&mut bytes, &document.properties)?;

    push_i32(
        &mut bytes,
        checked_i32_from_usize("Tileset count", sorted_tilesets.len())?,
    );
    for tileset in &sorted_tilesets {
        let (sheet_width, sheet_height) = tileset_sheet_size(tileset)?;

        push_string(&mut bytes, &tileset.name)?;
        push_string(&mut bytes, "")?;
        push_string(
            &mut bytes,
            tileset.image_source.as_deref().unwrap_or_default(),
        )?;
        push_vector(&mut bytes, sheet_width, sheet_height);
        push_vector(
            &mut bytes,
            checked_i32_from_u32("Tileset tile width", tileset.tile_width)?,
            checked_i32_from_u32("Tileset tile height", tileset.tile_height)?,
        );
        push_vector(&mut bytes, 0, 0);
        push_vector(&mut bytes, 0, 0);
        write_properties(&mut bytes, &tileset.properties)?;
    }

    push_i32(
        &mut bytes,
        checked_i32_from_usize("Layer count", document.layers.len())?,
    );
    for layer in &document.layers {
        if layer.kind != "tile" {
            bail!(
                "Layer '{}' has unsupported kind '{}'; only tile layers can be serialized to tBIN.",
                layer.name,
                layer.kind
            );
        }

        let layer_width = checked_i32_from_u32("Layer width", layer.width)?;
        let layer_height = checked_i32_from_u32("Layer height", layer.height)?;
        let expected_gid_count = usize::try_from(u64::from(layer.width) * u64::from(layer.height))
            .with_context(|| format!("Layer '{}' exceeds addressable tile storage.", layer.name))?;

        if layer.gids.len() != expected_gid_count {
            bail!(
                "Layer '{}' expected {} gids but found {}.",
                layer.name,
                expected_gid_count,
                layer.gids.len()
            );
        }

        push_string(&mut bytes, &layer.name)?;
        push_u8(&mut bytes, u8::from(layer.visible));
        push_string(&mut bytes, "")?;
        push_vector(&mut bytes, layer_width, layer_height);
        push_vector(&mut bytes, layer_tile_width, layer_tile_height);
        write_properties(&mut bytes, &layer.properties)?;

        let row_width = layer.width as usize;
        let row_count = layer.height as usize;
        let mut current_tileset_name: Option<&str> = None;

        for row_index in 0..row_count {
            let row_start = row_index * row_width;
            let row_end = row_start + row_width;
            let row = &layer.gids[row_start..row_end];
            let mut column_index = 0usize;

            while column_index < row.len() {
                let gid = row[column_index];
                if gid == 0 {
                    let mut zero_run = 1usize;
                    while column_index + zero_run < row.len() && row[column_index + zero_run] == 0 {
                        zero_run += 1;
                    }

                    push_u8(&mut bytes, b'N');
                    push_i32(
                        &mut bytes,
                        checked_i32_from_usize("Zero-tile run length", zero_run)?,
                    );
                    column_index += zero_run;
                    continue;
                }

                let (tileset, local_tile_id) = resolve_tileset_for_gid(gid, &sorted_tilesets)?;
                let cell_index = (row_start + column_index) as u32;
                let properties = layer
                    .cell_properties
                    .get(&cell_index)
                    .or_else(|| tileset.tile_properties.get(&local_tile_id));
                if current_tileset_name != Some(tileset.name.as_str()) {
                    push_u8(&mut bytes, b'T');
                    push_string(&mut bytes, &tileset.name)?;
                    current_tileset_name = Some(tileset.name.as_str());
                }

                if let Some(frames) = layer
                    .cell_animations
                    .get(&cell_index)
                    .or_else(|| tileset.animations.get(&local_tile_id))
                {
                    write_animated_tile(&mut bytes, tileset, local_tile_id, frames, properties)?;
                } else {
                    write_static_tile(&mut bytes, local_tile_id, properties)?;
                }

                column_index += 1;
            }
        }
    }

    Ok(bytes)
}

fn resolve_gid(tilesheet_gid: &HashMap<String, u32>, tile: &Tile) -> Option<u32> {
    let tilesheet_first_gid = tilesheet_gid.get(&tile.tilesheet)?;

    if tile.tile_index < 0 {
        return Some(0);
    }

    let tile_id = tile.tile_index as u32;
    let gid = tilesheet_first_gid.saturating_add(tile_id);
    Some(gid)
}

fn resolve_animated_gid(tilesheet_gid: &HashMap<String, u32>, tile: &Tile) -> Option<u32> {
    let first_frame = tile.animation_frames.first()?;
    let tilesheet_first_gid = tilesheet_gid.get(&first_frame.tilesheet)?;
    let tile_id = first_frame.tile_index.max(0) as u32;
    let gid = tilesheet_first_gid.saturating_add(tile_id);

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
