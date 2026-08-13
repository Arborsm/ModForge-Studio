use anyhow::{Context, bail};
use base64::Engine;
use flate2::read::{GzDecoder, ZlibDecoder};
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::{Reader, Writer};
use serde::Deserialize;
use serde::de::Error as _;
use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::game_formats::map::{
    MapDocument, MapFormat, MapLayer, MapLayerDataEncoding, MapLayerOrderEntry, MapObject,
    MapObjectGroup, MapPreservedXml, MapPropertyValue, MapTileset, MapTilesetAnimationFrame,
    base_gid,
};

#[derive(Debug, Deserialize)]
struct RawMap {
    #[serde(rename = "@version")]
    version: Option<String>,
    #[serde(rename = "@tiledversion")]
    tiled_version: Option<String>,
    #[serde(rename = "@orientation", default)]
    orientation: String,
    #[serde(rename = "@renderorder", default)]
    render_order: String,
    #[serde(rename = "@width", deserialize_with = "deserialize_u32")]
    width: u32,
    #[serde(rename = "@height", deserialize_with = "deserialize_u32")]
    height: u32,
    #[serde(rename = "@tilewidth", deserialize_with = "deserialize_u32")]
    tile_width: u32,
    #[serde(rename = "@tileheight", deserialize_with = "deserialize_u32")]
    tile_height: u32,
    #[serde(rename = "@infinite", default, deserialize_with = "deserialize_u8")]
    infinite: u8,
    #[serde(
        rename = "@nextlayerid",
        default,
        deserialize_with = "deserialize_optional_u32"
    )]
    next_layer_id: Option<u32>,
    #[serde(
        rename = "@nextobjectid",
        default,
        deserialize_with = "deserialize_optional_u32"
    )]
    next_object_id: Option<u32>,
    properties: Option<RawProperties>,
    #[serde(rename = "tileset", default)]
    tilesets: Vec<RawTilesetReference>,
    #[serde(rename = "layer", default)]
    layers: Vec<RawLayer>,
    #[serde(rename = "objectgroup", default)]
    object_groups: Vec<RawObjectGroup>,
}

#[derive(Debug, Deserialize)]
struct RawTilesetReference {
    #[serde(rename = "@firstgid", deserialize_with = "deserialize_u32")]
    first_gid: u32,
    #[serde(rename = "@source")]
    source: Option<String>,
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@tilewidth", default, deserialize_with = "deserialize_u32")]
    tile_width: u32,
    #[serde(rename = "@tileheight", default, deserialize_with = "deserialize_u32")]
    tile_height: u32,
    #[serde(rename = "@tilecount", default, deserialize_with = "deserialize_u32")]
    tile_count: u32,
    #[serde(rename = "@columns", default, deserialize_with = "deserialize_u32")]
    columns: u32,
    #[serde(rename = "@margin", default, deserialize_with = "deserialize_u32")]
    margin: u32,
    #[serde(rename = "@spacing", default, deserialize_with = "deserialize_u32")]
    spacing: u32,
    tileoffset: Option<RawTileOffset>,
    image: Option<RawImage>,
    properties: Option<RawProperties>,
    #[serde(rename = "tile", default)]
    tiles: Vec<RawTilesetTile>,
}

impl RawTilesetReference {
    fn into_inline_tileset(self) -> RawTileset {
        RawTileset {
            name: self.name,
            tile_width: self.tile_width,
            tile_height: self.tile_height,
            tile_count: self.tile_count,
            columns: self.columns,
            margin: self.margin,
            spacing: self.spacing,
            tileoffset: self.tileoffset,
            image: self.image,
            properties: self.properties,
            tiles: self.tiles,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
struct RawTileset {
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@tilewidth", default, deserialize_with = "deserialize_u32")]
    tile_width: u32,
    #[serde(rename = "@tileheight", default, deserialize_with = "deserialize_u32")]
    tile_height: u32,
    #[serde(rename = "@tilecount", default, deserialize_with = "deserialize_u32")]
    tile_count: u32,
    #[serde(rename = "@columns", default, deserialize_with = "deserialize_u32")]
    columns: u32,
    #[serde(rename = "@margin", default, deserialize_with = "deserialize_u32")]
    margin: u32,
    #[serde(rename = "@spacing", default, deserialize_with = "deserialize_u32")]
    spacing: u32,
    tileoffset: Option<RawTileOffset>,
    image: Option<RawImage>,
    properties: Option<RawProperties>,
    #[serde(rename = "tile", default)]
    tiles: Vec<RawTilesetTile>,
}

#[derive(Debug, Default, Clone)]
struct TilesetExtensions {
    attributes: HashMap<String, String>,
    children: Vec<MapPreservedXml>,
    tile_attributes: HashMap<u32, HashMap<String, String>>,
    tile_children: HashMap<u32, Vec<MapPreservedXml>>,
}

#[derive(Debug, Deserialize)]
struct RawTileOffset {
    #[serde(rename = "@x", default, deserialize_with = "deserialize_i32")]
    x: i32,
    #[serde(rename = "@y", default, deserialize_with = "deserialize_i32")]
    y: i32,
}

#[derive(Debug, Deserialize)]
struct RawImage {
    #[serde(rename = "@source")]
    source: String,
    #[serde(
        rename = "@width",
        default,
        deserialize_with = "deserialize_optional_u32"
    )]
    width: Option<u32>,
    #[serde(
        rename = "@height",
        default,
        deserialize_with = "deserialize_optional_u32"
    )]
    height: Option<u32>,
    #[serde(rename = "@trans")]
    trans: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawTilesetTile {
    #[serde(rename = "@id", deserialize_with = "deserialize_u32")]
    id: u32,
    properties: Option<RawProperties>,
    animation: Option<RawAnimation>,
}

#[derive(Debug, Deserialize)]
struct RawAnimation {
    #[serde(rename = "frame", default)]
    frames: Vec<RawAnimationFrame>,
}

#[derive(Debug, Deserialize)]
struct RawAnimationFrame {
    #[serde(rename = "@tileid", deserialize_with = "deserialize_u32")]
    tile_id: u32,
    #[serde(rename = "@duration", deserialize_with = "deserialize_u32")]
    duration: u32,
}

#[derive(Debug, Deserialize)]
struct RawLayer {
    #[serde(rename = "@id", deserialize_with = "deserialize_u32")]
    id: u32,
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@width", deserialize_with = "deserialize_u32")]
    width: u32,
    #[serde(rename = "@height", deserialize_with = "deserialize_u32")]
    height: u32,
    #[serde(
        rename = "@visible",
        default = "default_one",
        deserialize_with = "deserialize_u8"
    )]
    visible: u8,
    #[serde(
        rename = "@opacity",
        default = "default_opacity",
        deserialize_with = "deserialize_f32"
    )]
    opacity: f32,
    #[serde(rename = "@offsetx", default, deserialize_with = "deserialize_f32")]
    offset_x: f32,
    #[serde(rename = "@offsety", default, deserialize_with = "deserialize_f32")]
    offset_y: f32,
    properties: Option<RawProperties>,
    data: RawLayerData,
}

#[derive(Debug, Deserialize)]
struct RawLayerData {
    #[serde(rename = "@encoding")]
    encoding: Option<String>,
    #[serde(rename = "@compression")]
    compression: Option<String>,
    #[serde(rename = "$text", default)]
    text: String,
    #[serde(rename = "tile", default)]
    tiles: Vec<RawLayerTile>,
}

#[derive(Debug, Deserialize)]
struct RawLayerTile {
    #[serde(rename = "@gid", default, deserialize_with = "deserialize_u32")]
    gid: u32,
}

#[derive(Debug, Deserialize)]
struct RawObjectGroup {
    #[serde(rename = "@id", deserialize_with = "deserialize_u32")]
    id: u32,
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(
        rename = "@visible",
        default = "default_one",
        deserialize_with = "deserialize_u8"
    )]
    visible: u8,
    #[serde(
        rename = "@opacity",
        default = "default_opacity",
        deserialize_with = "deserialize_f32"
    )]
    opacity: f32,
    #[serde(rename = "@draworder", default)]
    draw_order: String,
    properties: Option<RawProperties>,
    #[serde(rename = "object", default)]
    objects: Vec<RawObject>,
}

#[derive(Debug, Deserialize)]
struct RawObject {
    #[serde(rename = "@id", deserialize_with = "deserialize_u32")]
    id: u32,
    #[serde(rename = "@name", default)]
    name: String,
    #[serde(rename = "@type", default)]
    object_type: String,
    #[serde(rename = "@class")]
    class: Option<String>,
    #[serde(rename = "@x", default, deserialize_with = "deserialize_f32")]
    x: f32,
    #[serde(rename = "@y", default, deserialize_with = "deserialize_f32")]
    y: f32,
    #[serde(rename = "@width", default, deserialize_with = "deserialize_f32")]
    width: f32,
    #[serde(rename = "@height", default, deserialize_with = "deserialize_f32")]
    height: f32,
    #[serde(rename = "@rotation", default, deserialize_with = "deserialize_f32")]
    rotation: f32,
    #[serde(
        rename = "@visible",
        default = "default_one",
        deserialize_with = "deserialize_u8"
    )]
    visible: u8,
    #[serde(
        rename = "@gid",
        default,
        deserialize_with = "deserialize_optional_u32"
    )]
    gid: Option<u32>,
    #[serde(rename = "@template")]
    template: Option<String>,
    properties: Option<RawProperties>,
    ellipse: Option<RawMarker>,
    point: Option<RawMarker>,
    polygon: Option<RawPoints>,
    polyline: Option<RawPoints>,
    text: Option<RawMarker>,
}

#[derive(Debug, Deserialize)]
struct RawMarker {}

#[derive(Debug, Deserialize)]
struct RawPoints {
    #[serde(rename = "@points", default)]
    _points: String,
}

#[derive(Debug, Deserialize)]
struct RawProperties {
    #[serde(rename = "property", default)]
    values: Vec<RawProperty>,
}

#[derive(Debug, Deserialize)]
struct RawProperty {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@type", default)]
    property_type: String,
    #[serde(rename = "@propertytype")]
    custom_property_type: Option<String>,
    #[serde(rename = "@value")]
    attribute_value: Option<String>,
    #[serde(rename = "$text", default)]
    text_value: String,
}

fn default_one() -> u8 {
    1
}

fn default_opacity() -> f32 {
    1.0
}

fn deserialize_u32<'de, D>(deserializer: D) -> Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer)?
        .parse::<u32>()
        .map_err(D::Error::custom)
}

fn deserialize_optional_u32<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer)?
        .map(|value| value.parse::<u32>().map_err(D::Error::custom))
        .transpose()
}

fn deserialize_u8<'de, D>(deserializer: D) -> Result<u8, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer)?
        .parse::<u8>()
        .map_err(D::Error::custom)
}

fn deserialize_i32<'de, D>(deserializer: D) -> Result<i32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer)?
        .parse::<i32>()
        .map_err(D::Error::custom)
}

fn deserialize_f32<'de, D>(deserializer: D) -> Result<f32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    String::deserialize(deserializer)?
        .parse::<f32>()
        .map_err(D::Error::custom)
}

/// Parses a Stardew-compatible finite orthogonal TMX map and its external TSX dependencies.
pub fn parse_tmx_map(
    bytes: &[u8],
    map_path: &Path,
    relative_path: &str,
) -> anyhow::Result<MapDocument> {
    let xml = std::str::from_utf8(bytes)
        .with_context(|| format!("TMX is not valid UTF-8: {}", normalize_path(map_path)))?;
    let structural_xml = strip_preserved_top_level_layers(xml, map_path)?;
    let raw: RawMap =
        deserialize_xml_with_location(&structural_xml, "TMX", map_path, &normalize_path(map_path))?;
    let inline_tileset_extensions = scan_map_tileset_extensions(xml)?;

    if raw.infinite != 0 {
        bail!(
            "TMX map is infinite and cannot be edited in Stardew mode. [path={}]",
            normalize_path(map_path)
        );
    }
    if !raw.orientation.eq_ignore_ascii_case("orthogonal") {
        bail!(
            "TMX orientation '{}' is incompatible with Stardew editing; expected orthogonal. [path={}]",
            raw.orientation,
            normalize_path(map_path)
        );
    }
    if raw.tile_width != 16 || raw.tile_height != 16 {
        bail!(
            "TMX tile size {}x{} is incompatible with Stardew editing; expected 16x16. [path={}]",
            raw.tile_width,
            raw.tile_height,
            normalize_path(map_path)
        );
    }

    let mut tilesets = Vec::with_capacity(raw.tilesets.len());
    for (tileset_index, reference) in raw.tilesets.into_iter().enumerate() {
        let first_gid = reference.first_gid;
        let source_reference = reference.source.clone();
        let (source, tileset, tileset_path, extensions) = if let Some(source) = source_reference {
            let path = resolve_dependency_path(map_path, &source)?;
            let tsx = std::fs::read_to_string(&path).with_context(|| {
                format!(
                    "Failed to read external TSX dependency {} referenced by {}",
                    normalize_path(&path),
                    normalize_path(map_path)
                )
            })?;
            let reference_chain = format!(
                "{} -> {} -> {}",
                normalize_path(map_path),
                source,
                normalize_path(&path)
            );
            let parsed = deserialize_xml_with_location::<RawTileset>(
                &tsx,
                "external TSX",
                &path,
                &reference_chain,
            )?;
            let extensions = scan_tileset_extension_fragment(&tsx)?;
            (Some(source), parsed, path, extensions)
        } else {
            (
                None,
                reference.into_inline_tileset(),
                map_path.to_path_buf(),
                inline_tileset_extensions
                    .get(tileset_index)
                    .cloned()
                    .unwrap_or_default(),
            )
        };
        tilesets.push(convert_tileset(
            first_gid,
            source,
            tileset,
            &tileset_path,
            extensions,
        )?);
    }

    let mut layers = Vec::with_capacity(raw.layers.len());
    for layer in raw.layers {
        let gids =
            decode_layer_data(&layer.data, layer.width, layer.height).with_context(|| {
                format!(
                    "Failed to decode layer '{}' in {}",
                    layer.name,
                    normalize_path(map_path)
                )
            })?;
        let non_empty_tiles = gids.iter().filter(|gid| **gid != 0).count() as u32;
        layers.push(MapLayer {
            id: layer.id,
            name: layer.name,
            kind: "tile".to_string(),
            width: layer.width,
            height: layer.height,
            visible: layer.visible != 0,
            opacity: layer.opacity,
            offset_x: layer.offset_x,
            offset_y: layer.offset_y,
            properties: convert_properties(layer.properties)?,
            gids,
            non_empty_tiles,
            data_encoding: parse_encoding(layer.data.encoding.as_deref())?,
            data_compression: layer.data.compression,
            cell_properties: HashMap::new(),
            cell_animations: HashMap::new(),
            preserved_xml: Vec::new(),
        });
    }

    let object_groups = raw
        .object_groups
        .into_iter()
        .map(convert_object_group)
        .collect::<anyhow::Result<Vec<_>>>()?;
    let (layer_order, preserved_xml) = scan_layer_order(xml)?;
    let name = map_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Unnamed")
        .to_string();

    Ok(MapDocument {
        name,
        format: MapFormat::Tmx,
        source_path: normalize_path(map_path),
        relative_path: relative_path.to_string(),
        width: raw.width,
        height: raw.height,
        tile_width: raw.tile_width,
        tile_height: raw.tile_height,
        orientation: raw.orientation,
        render_order: if raw.render_order.is_empty() {
            "right-down".to_string()
        } else {
            raw.render_order
        },
        tmx_version: raw.version,
        tiled_version: raw.tiled_version,
        next_layer_id: raw.next_layer_id,
        next_object_id: raw.next_object_id,
        infinite: false,
        properties: convert_properties(raw.properties)?,
        tilesets,
        layers,
        object_groups,
        layer_order,
        preserved_xml,
    })
}

fn deserialize_xml_with_location<'de, T: Deserialize<'de>>(
    xml: &'de str,
    kind: &str,
    path: &Path,
    reference_chain: &str,
) -> anyhow::Result<T> {
    let mut deserializer = quick_xml::de::Deserializer::from_str(xml);
    T::deserialize(&mut deserializer).map_err(|error| {
        let position = deserializer.get_ref().get_ref().error_position() as usize;
        let (line, column) = xml_line_column(xml, position);
        anyhow::anyhow!(
            "Failed to parse {kind} XML. [path={}] [line={line}] [column={column}] [byte={position}] [referenceChain={reference_chain}] {error}",
            normalize_path(path)
        )
    })
}

fn xml_line_column(xml: &str, byte_offset: usize) -> (usize, usize) {
    let mut offset = byte_offset.min(xml.len());
    while offset > 0 && !xml.is_char_boundary(offset) {
        offset -= 1;
    }
    let prefix = &xml[..offset];
    let line = prefix.bytes().filter(|byte| *byte == b'\n').count() + 1;
    let line_start = prefix.rfind('\n').map_or(0, |index| index + 1);
    let column = prefix[line_start..].chars().count() + 1;
    (line, column)
}

fn strip_preserved_top_level_layers(xml: &str, map_path: &Path) -> anyhow::Result<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut depth = 0usize;
    let mut layers = Vec::new();
    let mut object_groups = Vec::new();
    loop {
        let event_start = reader.buffer_position() as usize;
        let event = reader.read_event().map_err(|error| {
            let position = reader.error_position() as usize;
            let (line, column) = xml_line_column(xml, position);
            anyhow::anyhow!(
                "Failed to scan TMX XML. [path={}] [line={line}] [column={column}] [byte={position}] [referenceChain={}] {error}",
                normalize_path(map_path),
                normalize_path(map_path)
            )
        })?;
        match event {
            Event::Start(start) => {
                if depth == 1 {
                    match start.name().as_ref() {
                        b"layer" => {
                            layers.push(read_preserved_element_with_diagnostics(
                                &mut reader,
                                xml,
                                event_start,
                                map_path,
                            )?);
                            continue;
                        }
                        b"objectgroup" => {
                            object_groups.push(read_preserved_element_with_diagnostics(
                                &mut reader,
                                xml,
                                event_start,
                                map_path,
                            )?);
                            continue;
                        }
                        b"group" | b"imagelayer" => {
                            read_preserved_element_with_diagnostics(
                                &mut reader,
                                xml,
                                event_start,
                                map_path,
                            )?;
                            continue;
                        }
                        _ => {}
                    }
                }
                writer.write_event(Event::Start(start.into_owned()))?;
                depth += 1;
            }
            Event::Empty(empty) => {
                if depth == 1 {
                    let event_end = reader.buffer_position() as usize;
                    match empty.name().as_ref() {
                        b"layer" => layers.push(xml[event_start..event_end].to_string()),
                        b"objectgroup" => {
                            object_groups.push(xml[event_start..event_end].to_string())
                        }
                        b"group" | b"imagelayer" => continue,
                        _ => writer.write_event(Event::Empty(empty.into_owned()))?,
                    }
                } else {
                    writer.write_event(Event::Empty(empty.into_owned()))?;
                }
            }
            Event::End(end) => {
                depth = depth.saturating_sub(1);
                if depth == 0 && end.name().as_ref() == b"map" {
                    for fragment in layers.iter().chain(&object_groups) {
                        writer.get_mut().extend_from_slice(fragment.as_bytes());
                    }
                }
                writer.write_event(Event::End(end.into_owned()))?;
            }
            Event::Eof => break,
            event => writer.write_event(event.into_owned())?,
        }
    }
    String::from_utf8(writer.into_inner()).context("TMX structural XML was not valid UTF-8")
}

fn read_preserved_element_with_diagnostics(
    reader: &mut Reader<&[u8]>,
    xml: &str,
    event_start: usize,
    map_path: &Path,
) -> anyhow::Result<String> {
    read_preserved_element(reader, xml, event_start).map_err(|error| {
        let position = reader.error_position() as usize;
        let (line, column) = xml_line_column(xml, position);
        anyhow::anyhow!(
            "Failed to scan TMX XML. [path={}] [line={line}] [column={column}] [byte={position}] [referenceChain={}] {error:#}",
            normalize_path(map_path),
            normalize_path(map_path)
        )
    })
}

fn resolve_dependency_path(owner: &Path, source: &str) -> anyhow::Result<PathBuf> {
    let candidate = owner
        .parent()
        .unwrap_or(owner)
        .join(source.replace('/', "\\"));
    let canonical_parent = owner
        .parent()
        .unwrap_or(owner)
        .canonicalize()
        .with_context(|| {
            format!(
                "Failed to resolve dependency root for {}",
                normalize_path(owner)
            )
        })?;
    let canonical = candidate.canonicalize().with_context(|| {
        format!(
            "Missing dependency '{}' referenced by {}",
            source,
            normalize_path(owner)
        )
    })?;
    if !canonical.starts_with(&canonical_parent) {
        bail!(
            "Dependency '{}' escapes the map directory. [owner={}] [resolved={}]",
            source,
            normalize_path(owner),
            normalize_path(&canonical)
        );
    }
    Ok(canonical)
}

fn convert_tileset(
    first_gid: u32,
    source: Option<String>,
    raw: RawTileset,
    owner_path: &Path,
    extensions: TilesetExtensions,
) -> anyhow::Result<MapTileset> {
    let image = raw.image;
    let image_source = image.as_ref().map(|value| value.source.clone());
    let image_path = image_source.as_ref().map(|value| {
        normalize_path(
            &owner_path
                .parent()
                .unwrap_or(owner_path)
                .join(value.replace('/', "\\")),
        )
    });
    let offset = raw.tileoffset;
    let mut tile_properties = HashMap::new();
    let mut animations = HashMap::new();
    for tile in raw.tiles {
        let properties = convert_properties(tile.properties)?;
        if !properties.is_empty() {
            tile_properties.insert(tile.id, properties);
        }
        if let Some(animation) = tile.animation {
            animations.insert(
                tile.id,
                animation
                    .frames
                    .into_iter()
                    .map(|frame| MapTilesetAnimationFrame {
                        tile_id: frame.tile_id,
                        duration: frame.duration,
                    })
                    .collect(),
            );
        }
    }
    Ok(MapTileset {
        first_gid,
        name: raw.name,
        tile_width: raw.tile_width,
        tile_height: raw.tile_height,
        tile_count: raw.tile_count,
        columns: raw.columns,
        source,
        margin: raw.margin,
        spacing: raw.spacing,
        tile_offset_x: offset.as_ref().map_or(0, |value| value.x),
        tile_offset_y: offset.as_ref().map_or(0, |value| value.y),
        image_source,
        image_path,
        image_width: image.as_ref().and_then(|value| value.width),
        image_height: image.as_ref().and_then(|value| value.height),
        image_trans: image.and_then(|value| value.trans),
        properties: convert_properties(raw.properties)?,
        tile_properties,
        animations,
        preserved_attributes: extensions.attributes,
        tile_preserved_attributes: extensions.tile_attributes,
        tile_preserved_xml: extensions.tile_children,
        preserved_xml: extensions.children,
    })
}

fn convert_object_group(raw: RawObjectGroup) -> anyhow::Result<MapObjectGroup> {
    let objects = raw
        .objects
        .into_iter()
        .map(|object| {
            let shape = if object.ellipse.is_some() {
                "ellipse"
            } else if object.point.is_some() {
                "point"
            } else if object.polygon.is_some() {
                "polygon"
            } else if object.polyline.is_some() {
                "polyline"
            } else if object.text.is_some() {
                "text"
            } else {
                "rectangle"
            };
            Ok(MapObject {
                id: object.id,
                name: object.name,
                r#type: object.object_type,
                x: object.x,
                y: object.y,
                width: object.width,
                height: object.height,
                rotation: object.rotation,
                visible: object.visible != 0,
                gid: object.gid,
                template: object.template,
                class: object.class,
                shape: shape.to_string(),
                properties: convert_properties(object.properties)?,
                preserved_xml: Vec::new(),
            })
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    Ok(MapObjectGroup {
        id: raw.id,
        name: raw.name,
        kind: "object".to_string(),
        visible: raw.visible != 0,
        opacity: raw.opacity,
        draw_order: raw.draw_order,
        properties: convert_properties(raw.properties)?,
        objects,
        preserved_xml: Vec::new(),
    })
}

fn convert_properties(
    raw: Option<RawProperties>,
) -> anyhow::Result<HashMap<String, MapPropertyValue>> {
    raw.map(|properties| {
        properties
            .values
            .into_iter()
            .map(|property| {
                let value = property.attribute_value.unwrap_or(property.text_value);
                let mapped = match property.property_type.as_str() {
                    "bool" => MapPropertyValue::Bool(value.parse::<bool>().with_context(|| {
                        format!(
                            "Property '{}' has invalid bool value '{}'",
                            property.name, value
                        )
                    })?),
                    "int" | "float" => {
                        MapPropertyValue::Number(value.parse::<f64>().with_context(|| {
                            format!(
                                "Property '{}' has invalid number value '{}'",
                                property.name, value
                            )
                        })?)
                    }
                    _ => MapPropertyValue::String(value),
                };
                let mapped = if !property.property_type.is_empty()
                    || property.custom_property_type.is_some()
                {
                    MapPropertyValue::Typed {
                        value: Box::new(mapped),
                        tmx_type: property.property_type,
                        property_type: property.custom_property_type,
                    }
                } else {
                    mapped
                };
                Ok((property.name, mapped))
            })
            .collect()
    })
    .unwrap_or_else(|| Ok(HashMap::new()))
}

fn parse_encoding(value: Option<&str>) -> anyhow::Result<MapLayerDataEncoding> {
    match value {
        Some("csv") => Ok(MapLayerDataEncoding::Csv),
        Some("base64") => Ok(MapLayerDataEncoding::Base64),
        None | Some("") => Ok(MapLayerDataEncoding::Xml),
        Some(other) => bail!("Unsupported TMX layer encoding '{other}'."),
    }
}

fn decode_layer_data(data: &RawLayerData, width: u32, height: u32) -> anyhow::Result<Vec<u32>> {
    let expected = usize::try_from(u64::from(width) * u64::from(height))
        .context("Layer dimensions exceed addressable storage")?;
    let gids = match parse_encoding(data.encoding.as_deref())? {
        MapLayerDataEncoding::Csv => data
            .text
            .split(|character: char| character == ',' || character.is_whitespace())
            .filter(|value| !value.is_empty())
            .map(|value| {
                value
                    .parse::<u32>()
                    .with_context(|| format!("Invalid CSV GID '{value}'"))
            })
            .collect::<anyhow::Result<Vec<_>>>()?,
        MapLayerDataEncoding::Xml => data.tiles.iter().map(|tile| tile.gid).collect(),
        MapLayerDataEncoding::Base64 => {
            let encoded = data
                .text
                .chars()
                .filter(|character| !character.is_whitespace())
                .collect::<String>();
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .context("Invalid base64 layer data")?;
            let decoded = decompress_layer(bytes, data.compression.as_deref())?;
            if decoded.len() % 4 != 0 {
                bail!(
                    "Decoded layer byte length {} is not divisible by four.",
                    decoded.len()
                );
            }
            decoded
                .chunks_exact(4)
                .map(|chunk| u32::from_le_bytes(chunk.try_into().expect("four-byte chunk")))
                .collect()
        }
    };
    if gids.len() != expected {
        bail!("Layer expected {expected} GIDs but decoded {}.", gids.len());
    }
    Ok(gids)
}

fn decompress_layer(bytes: Vec<u8>, compression: Option<&str>) -> anyhow::Result<Vec<u8>> {
    let mut output = Vec::new();
    match compression {
        None | Some("") => return Ok(bytes),
        Some("zlib") => ZlibDecoder::new(Cursor::new(bytes))
            .read_to_end(&mut output)
            .context("Invalid zlib layer data")?,
        Some("gzip") => GzDecoder::new(Cursor::new(bytes))
            .read_to_end(&mut output)
            .context("Invalid gzip layer data")?,
        Some("zstd") => {
            return zstd::stream::decode_all(Cursor::new(bytes)).context("Invalid zstd layer data");
        }
        Some(other) => bail!("Unsupported TMX layer compression '{other}'."),
    };
    Ok(output)
}

fn scan_layer_order(xml: &str) -> anyhow::Result<(Vec<MapLayerOrderEntry>, Vec<MapPreservedXml>)> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    let mut order = Vec::new();
    let mut preserved = Vec::new();
    loop {
        let event_start = reader.buffer_position() as usize;
        match reader
            .read_event()
            .context("Failed to scan TMX layer order")?
        {
            Event::Start(event) => {
                if depth == 1 {
                    if let Some(entry) = known_layer_order(&event) {
                        order.push(entry);
                    } else if !is_known_non_layer_child(event.name().as_ref()) {
                        let xml_fragment = read_preserved_element(&mut reader, xml, event_start)?;
                        let index = preserved.len() as u32;
                        preserved.push(MapPreservedXml { xml: xml_fragment });
                        order.push(MapLayerOrderEntry::Preserved(index));
                        continue;
                    }
                }
                depth += 1;
            }
            Event::Empty(event) => {
                if depth == 1 {
                    if let Some(entry) = known_layer_order(&event) {
                        order.push(entry);
                    } else if !is_known_non_layer_child(event.name().as_ref()) {
                        let event_end = reader.buffer_position() as usize;
                        let index = preserved.len() as u32;
                        preserved.push(MapPreservedXml {
                            xml: xml[event_start..event_end].to_string(),
                        });
                        order.push(MapLayerOrderEntry::Preserved(index));
                    }
                }
            }
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok((order, preserved))
}

fn known_layer_order(event: &BytesStart<'_>) -> Option<MapLayerOrderEntry> {
    let id = event
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == b"id")
        .and_then(|attribute| {
            std::str::from_utf8(attribute.value.as_ref())
                .ok()?
                .parse::<u32>()
                .ok()
        });
    match (event.name().as_ref(), id) {
        (b"layer", Some(id)) => Some(MapLayerOrderEntry::TileLayer(id)),
        (b"objectgroup", Some(id)) => Some(MapLayerOrderEntry::ObjectGroup(id)),
        _ => None,
    }
}

fn is_known_non_layer_child(name: &[u8]) -> bool {
    matches!(name, b"properties" | b"tileset")
}

fn read_preserved_element(
    reader: &mut Reader<&[u8]>,
    xml: &str,
    event_start: usize,
) -> anyhow::Result<String> {
    let mut nested_depth = 1usize;
    while nested_depth > 0 {
        match reader
            .read_event()
            .context("Failed to preserve unsupported TMX element")?
        {
            Event::Start(_) => nested_depth += 1,
            Event::End(_) => nested_depth -= 1,
            Event::Eof => bail!("Unsupported TMX element ended unexpectedly."),
            _ => {}
        }
    }
    let event_end = reader.buffer_position() as usize;
    Ok(xml[event_start..event_end].to_string())
}

fn scan_map_tileset_extensions(xml: &str) -> anyhow::Result<Vec<TilesetExtensions>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    let mut extensions = Vec::new();
    loop {
        let event_start = reader.buffer_position() as usize;
        match reader
            .read_event()
            .context("Failed to scan TMX tileset extensions")?
        {
            Event::Start(event) if depth == 1 && event.name().as_ref() == b"tileset" => {
                let fragment = read_preserved_element(&mut reader, xml, event_start)?;
                extensions.push(scan_tileset_extension_fragment(&fragment)?);
            }
            Event::Empty(event) if depth == 1 && event.name().as_ref() == b"tileset" => {
                let event_end = reader.buffer_position() as usize;
                extensions.push(scan_tileset_extension_fragment(
                    &xml[event_start..event_end],
                )?);
            }
            Event::Start(_) => depth += 1,
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(extensions)
}

fn scan_tileset_extension_fragment(xml: &str) -> anyhow::Result<TilesetExtensions> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    let mut extensions = TilesetExtensions::default();
    loop {
        let event_start = reader.buffer_position() as usize;
        match reader
            .read_event()
            .context("Failed to scan tileset extension XML")?
        {
            Event::Start(event) if depth == 0 && event.name().as_ref() == b"tileset" => {
                extensions.attributes = collect_preserved_attributes(
                    &event,
                    &[
                        "firstgid",
                        "source",
                        "name",
                        "tilewidth",
                        "tileheight",
                        "tilecount",
                        "columns",
                        "margin",
                        "spacing",
                    ],
                )?;
                depth = 1;
            }
            Event::Empty(event) if depth == 0 && event.name().as_ref() == b"tileset" => {
                extensions.attributes = collect_preserved_attributes(
                    &event,
                    &[
                        "firstgid",
                        "source",
                        "name",
                        "tilewidth",
                        "tileheight",
                        "tilecount",
                        "columns",
                        "margin",
                        "spacing",
                    ],
                )?;
                break;
            }
            Event::Start(event) if depth == 1 && event.name().as_ref() == b"tile" => {
                let fragment = read_preserved_element(&mut reader, xml, event_start)?;
                scan_tile_extension_fragment(&fragment, &mut extensions)?;
            }
            Event::Empty(event) if depth == 1 && event.name().as_ref() == b"tile" => {
                let event_end = reader.buffer_position() as usize;
                scan_tile_extension_fragment(&xml[event_start..event_end], &mut extensions)?;
            }
            Event::Start(event) if depth == 1 && !is_known_tileset_child(event.name().as_ref()) => {
                let fragment = read_preserved_element(&mut reader, xml, event_start)?;
                extensions.children.push(MapPreservedXml { xml: fragment });
            }
            Event::Empty(event) if depth == 1 && !is_known_tileset_child(event.name().as_ref()) => {
                let event_end = reader.buffer_position() as usize;
                extensions.children.push(MapPreservedXml {
                    xml: xml[event_start..event_end].to_string(),
                });
            }
            Event::Start(_) => depth += 1,
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(extensions)
}

fn scan_tile_extension_fragment(
    xml: &str,
    extensions: &mut TilesetExtensions,
) -> anyhow::Result<()> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut depth = 0usize;
    let mut tile_id = None;
    loop {
        let event_start = reader.buffer_position() as usize;
        match reader
            .read_event()
            .context("Failed to scan tileset tile extension XML")?
        {
            Event::Start(event) if depth == 0 && event.name().as_ref() == b"tile" => {
                tile_id = attribute_u32(&event, b"id");
                if let Some(id) = tile_id {
                    let attributes = collect_preserved_attributes(&event, &["id"])?;
                    if !attributes.is_empty() {
                        extensions.tile_attributes.insert(id, attributes);
                    }
                }
                depth = 1;
            }
            Event::Empty(event) if depth == 0 && event.name().as_ref() == b"tile" => {
                if let Some(id) = attribute_u32(&event, b"id") {
                    let attributes = collect_preserved_attributes(&event, &["id"])?;
                    if !attributes.is_empty() {
                        extensions.tile_attributes.insert(id, attributes);
                    }
                }
                break;
            }
            Event::Start(event) if depth == 1 && !is_known_tile_child(event.name().as_ref()) => {
                let fragment = read_preserved_element(&mut reader, xml, event_start)?;
                if let Some(id) = tile_id {
                    extensions
                        .tile_children
                        .entry(id)
                        .or_default()
                        .push(MapPreservedXml { xml: fragment });
                }
            }
            Event::Empty(event) if depth == 1 && !is_known_tile_child(event.name().as_ref()) => {
                let event_end = reader.buffer_position() as usize;
                if let Some(id) = tile_id {
                    extensions
                        .tile_children
                        .entry(id)
                        .or_default()
                        .push(MapPreservedXml {
                            xml: xml[event_start..event_end].to_string(),
                        });
                }
            }
            Event::Start(_) => depth += 1,
            Event::End(_) => depth = depth.saturating_sub(1),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(())
}

fn collect_preserved_attributes(
    event: &BytesStart<'_>,
    known: &[&str],
) -> anyhow::Result<HashMap<String, String>> {
    let mut attributes = HashMap::new();
    for attribute in event.attributes().with_checks(false) {
        let attribute = attribute.context("Invalid tileset extension attribute")?;
        if known
            .iter()
            .any(|name| name.as_bytes() == attribute.key.as_ref())
        {
            continue;
        }
        let key = std::str::from_utf8(attribute.key.as_ref())
            .context("Tileset extension attribute name is not UTF-8")?
            .to_string();
        let raw = std::str::from_utf8(attribute.value.as_ref())
            .context("Tileset extension attribute value is not UTF-8")?;
        let value = quick_xml::escape::unescape(raw)
            .context("Tileset extension attribute escape is invalid")?
            .into_owned();
        attributes.insert(key, value);
    }
    Ok(attributes)
}

fn attribute_u32(event: &BytesStart<'_>, name: &[u8]) -> Option<u32> {
    event
        .attributes()
        .flatten()
        .find(|attribute| attribute.key.as_ref() == name)
        .and_then(|attribute| {
            std::str::from_utf8(attribute.value.as_ref())
                .ok()?
                .parse()
                .ok()
        })
}

fn is_known_tileset_child(name: &[u8]) -> bool {
    matches!(name, b"tileoffset" | b"image" | b"properties" | b"tile")
}

fn is_known_tile_child(name: &[u8]) -> bool {
    matches!(name, b"properties" | b"animation")
}

/// Object groups written by [`serialize_tmx_map`] after baking per-cell properties.
struct BakedObjectGroups {
    groups: Vec<MapObjectGroup>,
    /// Maps a tile layer id to the id of the object group created for that layer.
    new_group_after_layer: HashMap<u32, u32>,
}

/// Materializes per-cell tile properties as `TileData` objects for TMX output.
///
/// xTile and Tiled attach per-tile instance properties to the `TileData`
/// rectangle objects of an object group named after the tile layer; the
/// in-memory [`MapLayer::cell_properties`] form has no native TMX carrier, so
/// it is baked into such objects at serialize time. Cells whose gid is empty
/// after masking flip/rotation flags produce no objects, and existing
/// `TileData` objects already covering a cell win over the baked values so
/// previously-baked documents do not get duplicates. The returned view is
/// transient and never mutates the input document.
fn bake_cell_properties(document: &MapDocument) -> BakedObjectGroups {
    let mut groups = document.object_groups.clone();
    let mut next_group_id = document
        .next_layer_id
        .unwrap_or(0)
        .max(
            document
                .layers
                .iter()
                .map(|layer| layer.id)
                .max()
                .unwrap_or(0),
        )
        .max(groups.iter().map(|group| group.id).max().unwrap_or(0));
    let mut next_object_id = document.next_object_id.unwrap_or(0).max(
        groups
            .iter()
            .flat_map(|group| group.objects.iter())
            .map(|object| object.id)
            .max()
            .unwrap_or(0),
    );
    let mut new_group_after_layer = HashMap::new();
    let tile_width = document.tile_width as f32;
    let tile_height = document.tile_height as f32;

    for layer in &document.layers {
        if layer.kind != "tile" || layer.cell_properties.is_empty() {
            continue;
        }
        let group_index = match groups.iter().position(|group| group.name == layer.name) {
            Some(index) => index,
            None => {
                next_group_id += 1;
                let group_id = next_group_id;
                groups.push(MapObjectGroup {
                    id: group_id,
                    name: layer.name.clone(),
                    kind: "object".to_string(),
                    visible: true,
                    opacity: 1.0,
                    draw_order: "topdown".to_string(),
                    properties: HashMap::new(),
                    objects: Vec::new(),
                    preserved_xml: Vec::new(),
                });
                new_group_after_layer.insert(layer.id, group_id);
                groups.len() - 1
            }
        };
        let width = layer.width.max(1);
        let mut cell_indices = layer.cell_properties.keys().copied().collect::<Vec<_>>();
        cell_indices.sort_unstable();
        for cell_index in cell_indices {
            let gid = layer.gids.get(cell_index as usize).copied().unwrap_or(0);
            if base_gid(gid) == 0 {
                continue;
            }
            let pixel_x = (cell_index % width) as f32 * tile_width;
            let pixel_y = (cell_index / width) as f32 * tile_height;
            let already_covered = groups[group_index].objects.iter().any(|object| {
                object.name == "TileData"
                    && object.x <= pixel_x
                    && pixel_x + tile_width <= object.x + object.width
                    && object.y <= pixel_y
                    && pixel_y + tile_height <= object.y + object.height
            });
            if already_covered {
                continue;
            }
            next_object_id += 1;
            groups[group_index].objects.push(MapObject {
                id: next_object_id,
                name: "TileData".to_string(),
                r#type: "TileData".to_string(),
                x: pixel_x,
                y: pixel_y,
                width: tile_width,
                height: tile_height,
                rotation: 0.0,
                visible: true,
                gid: None,
                template: None,
                class: None,
                shape: "rectangle".to_string(),
                properties: layer.cell_properties[&cell_index].clone(),
                preserved_xml: Vec::new(),
            });
        }
    }

    BakedObjectGroups {
        groups,
        new_group_after_layer,
    }
}

/// Hoists per-cell tile animations into the definition-level `animations` of
/// their owning tilesets for TMX output.
///
/// TMX has no per-cell animation carrier: the game reads `<tile><animation>`
/// from the tileset definition only, so each animated cell's frame list is
/// promoted to the definition of its base tile id, mirroring the official
/// TMXTile save behavior. Cells sharing a base id are first-writer-wins — a
/// definition-level animation already present (either original or hoisted
/// earlier in the sorted pass) silently wins and later cells are skipped — and
/// the cell gid itself is never remapped, so static instances of the base tile
/// start animating too. Cells whose base gid is empty or falls outside every
/// tileset range are skipped. The returned view is transient and never mutates
/// the input document.
fn hoist_cell_animations(document: &MapDocument) -> Vec<MapTileset> {
    let mut tilesets = document.tilesets.clone();
    for layer in &document.layers {
        if layer.kind != "tile" || layer.cell_animations.is_empty() {
            continue;
        }
        let mut cell_indices = layer.cell_animations.keys().copied().collect::<Vec<_>>();
        cell_indices.sort_unstable();
        for cell_index in cell_indices {
            let gid = layer.gids.get(cell_index as usize).copied().unwrap_or(0);
            let base = base_gid(gid);
            if base == 0 {
                continue;
            }
            let Some((tileset_index, local_tile_id)) =
                tilesets
                    .iter()
                    .enumerate()
                    .rev()
                    .find_map(|(index, tileset)| {
                        let local = base.checked_sub(tileset.first_gid)?;
                        (local < tileset.tile_count).then_some((index, local))
                    })
            else {
                continue;
            };
            let tileset = &mut tilesets[tileset_index];
            if tileset.animations.contains_key(&local_tile_id) {
                continue;
            }
            tileset
                .animations
                .insert(local_tile_id, layer.cell_animations[&cell_index].clone());
        }
    }
    tilesets
}

/// Serializes a map document to a Stardew-compatible TMX file while retaining layer encodings.
pub fn serialize_tmx_map(document: &MapDocument) -> anyhow::Result<Vec<u8>> {
    if document.infinite
        || !document.orientation.eq_ignore_ascii_case("orthogonal")
        || document.tile_width != 16
        || document.tile_height != 16
    {
        bail!("Map is not compatible with Stardew TMX output (finite orthogonal 16x16 required).");
    }
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    writer.write_event(Event::Decl(quick_xml::events::BytesDecl::new(
        "1.0",
        Some("UTF-8"),
        None,
    )))?;
    let mut attributes = vec![
        (
            "version",
            document
                .tmx_version
                .clone()
                .unwrap_or_else(|| "1.10".to_string()),
        ),
        ("orientation", document.orientation.clone()),
        ("renderorder", document.render_order.clone()),
        ("width", document.width.to_string()),
        ("height", document.height.to_string()),
        ("tilewidth", document.tile_width.to_string()),
        ("tileheight", document.tile_height.to_string()),
        ("infinite", "0".to_string()),
    ];
    if let Some(value) = &document.tiled_version {
        attributes.push(("tiledversion", value.clone()));
    }
    if let Some(value) = document.next_layer_id {
        attributes.push(("nextlayerid", value.to_string()));
    }
    if let Some(value) = document.next_object_id {
        attributes.push(("nextobjectid", value.to_string()));
    }
    write_start(&mut writer, "map", &attributes)?;
    write_properties(&mut writer, &document.properties)?;
    let baked = bake_cell_properties(document);
    let hoisted_tilesets = hoist_cell_animations(document);
    for tileset in &hoisted_tilesets {
        write_tileset(&mut writer, tileset)?;
    }
    let mut written_layers = std::collections::HashSet::new();
    let mut written_groups = std::collections::HashSet::new();
    let mut written_preserved = std::collections::HashSet::new();
    for entry in &document.layer_order {
        match entry {
            MapLayerOrderEntry::TileLayer(id) => {
                if let Some(layer) = document.layers.iter().find(|layer| layer.id == *id) {
                    write_layer(&mut writer, layer)?;
                    written_layers.insert(*id);
                    if let Some(group_id) = baked.new_group_after_layer.get(id) {
                        if let Some(group) = baked.groups.iter().find(|group| group.id == *group_id)
                        {
                            write_object_group(&mut writer, group)?;
                            written_groups.insert(*group_id);
                        }
                    }
                }
            }
            MapLayerOrderEntry::ObjectGroup(id) => {
                if let Some(group) = baked.groups.iter().find(|group| group.id == *id) {
                    write_object_group(&mut writer, group)?;
                    written_groups.insert(*id);
                }
            }
            MapLayerOrderEntry::Preserved(index) => {
                if let Some(fragment) = document.preserved_xml.get(*index as usize) {
                    write_raw_fragment(&mut writer, fragment);
                    written_preserved.insert(*index as usize);
                }
            }
        }
    }
    for layer in document
        .layers
        .iter()
        .filter(|layer| !written_layers.contains(&layer.id))
    {
        write_layer(&mut writer, layer)?;
        if let Some(group_id) = baked.new_group_after_layer.get(&layer.id) {
            if let Some(group) = baked.groups.iter().find(|group| group.id == *group_id) {
                write_object_group(&mut writer, group)?;
                written_groups.insert(*group_id);
            }
        }
    }
    for group in baked
        .groups
        .iter()
        .filter(|group| !written_groups.contains(&group.id))
    {
        write_object_group(&mut writer, group)?;
    }
    for (index, fragment) in document.preserved_xml.iter().enumerate() {
        if !written_preserved.contains(&index) {
            write_raw_fragment(&mut writer, fragment);
        }
    }
    writer.write_event(Event::End(BytesEnd::new("map")))?;
    Ok(writer.into_inner())
}

fn write_start(
    writer: &mut Writer<Vec<u8>>,
    name: &str,
    attributes: &[(impl AsRef<str>, String)],
) -> anyhow::Result<()> {
    let mut event = BytesStart::new(name);
    for (key, value) in attributes {
        event.push_attribute((key.as_ref(), value.as_str()));
    }
    writer.write_event(Event::Start(event))?;
    Ok(())
}

fn write_empty(
    writer: &mut Writer<Vec<u8>>,
    name: &str,
    attributes: &[(impl AsRef<str>, String)],
) -> anyhow::Result<()> {
    let mut event = BytesStart::new(name);
    for (key, value) in attributes {
        event.push_attribute((key.as_ref(), value.as_str()));
    }
    writer.write_event(Event::Empty(event))?;
    Ok(())
}

fn write_properties(
    writer: &mut Writer<Vec<u8>>,
    properties: &HashMap<String, MapPropertyValue>,
) -> anyhow::Result<()> {
    if properties.is_empty() {
        return Ok(());
    }
    write_start(writer, "properties", &[] as &[(String, String)])?;
    let mut values = properties.iter().collect::<Vec<_>>();
    values.sort_by_key(|(name, _)| *name);
    for (name, value) in values {
        let (property_type, custom_property_type, serialized) = match value {
            MapPropertyValue::Bool(value) => (Some("bool"), None, value.to_string()),
            MapPropertyValue::Number(value) if value.fract() == 0.0 => {
                (Some("int"), None, format!("{value:.0}"))
            }
            MapPropertyValue::Number(value) => (Some("float"), None, value.to_string()),
            MapPropertyValue::String(value) => (None, None, value.clone()),
            MapPropertyValue::Typed {
                value,
                tmx_type,
                property_type,
            } => {
                let serialized = match value.untyped() {
                    MapPropertyValue::Bool(value) => value.to_string(),
                    MapPropertyValue::Number(value) if tmx_type == "int" => format!("{value:.0}"),
                    MapPropertyValue::Number(value) => value.to_string(),
                    MapPropertyValue::String(value) => value.clone(),
                    MapPropertyValue::Typed { .. } => unreachable!("untyped removes wrappers"),
                };
                (
                    (!tmx_type.is_empty()).then_some(tmx_type.as_str()),
                    property_type.as_deref(),
                    serialized,
                )
            }
        };
        let mut attributes = vec![("name", name.clone()), ("value", serialized)];
        if let Some(property_type) = property_type {
            attributes.push(("type", property_type.to_string()));
        }
        if let Some(custom_property_type) = custom_property_type {
            attributes.push(("propertytype", custom_property_type.to_string()));
        }
        write_empty(writer, "property", &attributes)?;
    }
    writer.write_event(Event::End(BytesEnd::new("properties")))?;
    Ok(())
}

fn write_tileset(writer: &mut Writer<Vec<u8>>, tileset: &MapTileset) -> anyhow::Result<()> {
    if let Some(source) = &tileset.source {
        return write_empty(
            writer,
            "tileset",
            &[
                ("firstgid", tileset.first_gid.to_string()),
                ("source", source.clone()),
            ],
        );
    }
    write_tileset_definition(writer, tileset, true)
}

/// Serializes the resolved definition of an external tileset without TMX-only firstgid metadata.
pub fn serialize_tsx_tileset(tileset: &MapTileset) -> anyhow::Result<Vec<u8>> {
    let mut writer = Writer::new_with_indent(Vec::new(), b' ', 2);
    writer.write_event(Event::Decl(quick_xml::events::BytesDecl::new(
        "1.0",
        Some("UTF-8"),
        None,
    )))?;
    write_tileset_definition(&mut writer, tileset, false)?;
    Ok(writer.into_inner())
}

fn write_tileset_definition(
    writer: &mut Writer<Vec<u8>>,
    tileset: &MapTileset,
    include_first_gid: bool,
) -> anyhow::Result<()> {
    let mut preserved_attributes = tileset.preserved_attributes.iter().collect::<Vec<_>>();
    preserved_attributes.sort_by_key(|(name, _)| *name);
    let mut attributes = preserved_attributes
        .into_iter()
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect::<Vec<_>>();
    if include_first_gid {
        attributes.push(("firstgid".to_string(), tileset.first_gid.to_string()));
    }
    attributes.extend([
        ("name".to_string(), tileset.name.clone()),
        ("tilewidth".to_string(), tileset.tile_width.to_string()),
        ("tileheight".to_string(), tileset.tile_height.to_string()),
        ("tilecount".to_string(), tileset.tile_count.to_string()),
        ("columns".to_string(), tileset.columns.to_string()),
        ("margin".to_string(), tileset.margin.to_string()),
        ("spacing".to_string(), tileset.spacing.to_string()),
    ]);
    write_start(writer, "tileset", &attributes)?;
    if tileset.tile_offset_x != 0 || tileset.tile_offset_y != 0 {
        write_empty(
            writer,
            "tileoffset",
            &[
                ("x", tileset.tile_offset_x.to_string()),
                ("y", tileset.tile_offset_y.to_string()),
            ],
        )?;
    }
    if let Some(source) = &tileset.image_source {
        let mut attributes = vec![("source", source.clone())];
        if let Some(value) = tileset.image_width {
            attributes.push(("width", value.to_string()));
        }
        if let Some(value) = tileset.image_height {
            attributes.push(("height", value.to_string()));
        }
        if let Some(value) = &tileset.image_trans {
            attributes.push(("trans", value.clone()));
        }
        write_empty(writer, "image", &attributes)?;
    }
    write_properties(writer, &tileset.properties)?;
    let mut tile_ids = tileset
        .tile_properties
        .keys()
        .chain(tileset.animations.keys())
        .chain(tileset.tile_preserved_attributes.keys())
        .chain(tileset.tile_preserved_xml.keys())
        .copied()
        .collect::<Vec<_>>();
    tile_ids.sort_unstable();
    tile_ids.dedup();
    for tile_id in tile_ids {
        let mut tile_attributes = tileset
            .tile_preserved_attributes
            .get(&tile_id)
            .into_iter()
            .flat_map(|attributes| attributes.iter())
            .collect::<Vec<_>>();
        tile_attributes.sort_by_key(|(name, _)| *name);
        let mut tile_attributes = tile_attributes
            .into_iter()
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect::<Vec<_>>();
        tile_attributes.push(("id".to_string(), tile_id.to_string()));
        write_start(writer, "tile", &tile_attributes)?;
        if let Some(properties) = tileset.tile_properties.get(&tile_id) {
            write_properties(writer, properties)?;
        }
        if let Some(frames) = tileset.animations.get(&tile_id) {
            write_start(writer, "animation", &[] as &[(String, String)])?;
            for frame in frames {
                write_empty(
                    writer,
                    "frame",
                    &[
                        ("tileid", frame.tile_id.to_string()),
                        ("duration", frame.duration.to_string()),
                    ],
                )?;
            }
            writer.write_event(Event::End(BytesEnd::new("animation")))?;
        }
        if let Some(fragments) = tileset.tile_preserved_xml.get(&tile_id) {
            write_raw_fragments(writer, fragments);
        }
        writer.write_event(Event::End(BytesEnd::new("tile")))?;
    }
    write_raw_fragments(writer, &tileset.preserved_xml);
    writer.write_event(Event::End(BytesEnd::new("tileset")))?;
    Ok(())
}

fn write_layer(writer: &mut Writer<Vec<u8>>, layer: &MapLayer) -> anyhow::Result<()> {
    let attributes = vec![
        ("id", layer.id.to_string()),
        ("name", layer.name.clone()),
        ("width", layer.width.to_string()),
        ("height", layer.height.to_string()),
        ("visible", u8::from(layer.visible).to_string()),
        ("opacity", layer.opacity.to_string()),
        ("offsetx", layer.offset_x.to_string()),
        ("offsety", layer.offset_y.to_string()),
    ];
    write_start(writer, "layer", &attributes)?;
    write_properties(writer, &layer.properties)?;
    match layer.data_encoding {
        MapLayerDataEncoding::Csv => {
            write_start(writer, "data", &[("encoding", "csv".to_string())])?;
            let text = layer
                .gids
                .chunks(layer.width.max(1) as usize)
                .map(|row| row.iter().map(u32::to_string).collect::<Vec<_>>().join(","))
                .collect::<Vec<_>>()
                .join(",\n");
            writer.write_event(Event::Text(BytesText::new(&text)))?;
            writer.write_event(Event::End(BytesEnd::new("data")))?;
        }
        MapLayerDataEncoding::Xml => {
            write_start(writer, "data", &[] as &[(String, String)])?;
            for gid in &layer.gids {
                write_empty(writer, "tile", &[("gid", gid.to_string())])?;
            }
            writer.write_event(Event::End(BytesEnd::new("data")))?;
        }
        MapLayerDataEncoding::Base64 => {
            let mut bytes = Vec::with_capacity(layer.gids.len() * 4);
            for gid in &layer.gids {
                bytes.extend_from_slice(&gid.to_le_bytes());
            }
            let encoded_bytes = compress_layer(bytes, layer.data_compression.as_deref())?;
            let mut attributes = vec![("encoding", "base64".to_string())];
            if let Some(value) = &layer.data_compression {
                attributes.push(("compression", value.clone()));
            }
            write_start(writer, "data", &attributes)?;
            writer.write_event(Event::Text(BytesText::new(
                &base64::engine::general_purpose::STANDARD.encode(encoded_bytes),
            )))?;
            writer.write_event(Event::End(BytesEnd::new("data")))?;
        }
    }
    write_raw_fragments(writer, &layer.preserved_xml);
    writer.write_event(Event::End(BytesEnd::new("layer")))?;
    Ok(())
}

fn compress_layer(bytes: Vec<u8>, compression: Option<&str>) -> anyhow::Result<Vec<u8>> {
    match compression {
        None | Some("") => Ok(bytes),
        Some("zlib") => {
            let mut encoder =
                flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&bytes)?;
            Ok(encoder.finish()?)
        }
        Some("gzip") => {
            let mut encoder =
                flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&bytes)?;
            Ok(encoder.finish()?)
        }
        Some("zstd") => zstd::stream::encode_all(Cursor::new(bytes), 0)
            .context("Failed to encode zstd layer data"),
        Some(other) => bail!("Unsupported TMX layer compression '{other}'."),
    }
}

fn write_object_group(writer: &mut Writer<Vec<u8>>, group: &MapObjectGroup) -> anyhow::Result<()> {
    let attributes = vec![
        ("id", group.id.to_string()),
        ("name", group.name.clone()),
        ("visible", u8::from(group.visible).to_string()),
        ("opacity", group.opacity.to_string()),
        ("draworder", group.draw_order.clone()),
    ];
    write_start(writer, "objectgroup", &attributes)?;
    write_properties(writer, &group.properties)?;
    for object in &group.objects {
        let mut attributes = vec![
            ("id", object.id.to_string()),
            ("name", object.name.clone()),
            ("type", object.r#type.clone()),
            ("x", object.x.to_string()),
            ("y", object.y.to_string()),
            ("width", object.width.to_string()),
            ("height", object.height.to_string()),
            ("rotation", object.rotation.to_string()),
            ("visible", u8::from(object.visible).to_string()),
        ];
        if let Some(value) = object.gid {
            attributes.push(("gid", value.to_string()));
        }
        if let Some(value) = &object.template {
            attributes.push(("template", value.clone()));
        }
        if let Some(value) = &object.class {
            attributes.push(("class", value.clone()));
        }
        write_start(writer, "object", &attributes)?;
        write_properties(writer, &object.properties)?;
        match object.shape.as_str() {
            "ellipse" | "point" => {
                write_empty(writer, object.shape.as_str(), &[] as &[(String, String)])?
            }
            _ => {}
        }
        write_raw_fragments(writer, &object.preserved_xml);
        writer.write_event(Event::End(BytesEnd::new("object")))?;
    }
    write_raw_fragments(writer, &group.preserved_xml);
    writer.write_event(Event::End(BytesEnd::new("objectgroup")))?;
    Ok(())
}

fn write_raw_fragments(writer: &mut Writer<Vec<u8>>, fragments: &[MapPreservedXml]) {
    for fragment in fragments {
        write_raw_fragment(writer, fragment);
    }
}

fn write_raw_fragment(writer: &mut Writer<Vec<u8>>, fragment: &MapPreservedXml) {
    writer.get_mut().extend_from_slice(fragment.xml.as_bytes());
}
