//! TMX reading/parsing: raw XML structs, serde helpers, dependency resolution,
//! conversion to [`crate::infrastructure::game_formats::map`] types and layer
//! data decoding.

use anyhow::{Context, bail};
use base64::Engine;
use flate2::read::{GzDecoder, ZlibDecoder};
use serde::Deserialize;
use serde::de::Error as _;
use std::collections::HashMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use super::scan::{
    TilesetExtensions, scan_layer_order, scan_map_tileset_extensions,
    scan_tileset_extension_fragment, strip_preserved_top_level_layers, xml_line_column,
};
use crate::infrastructure::fs::pathing::{game_path_to_pathbuf, normalize_path};
use crate::infrastructure::game_formats::map::{
    MapDocument, MapFormat, MapLayer, MapLayerDataEncoding, MapObject, MapObjectGroup,
    MapPropertyValue, MapTileset, MapTilesetAnimationFrame,
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
pub(crate) fn parse_tmx_map(
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

fn resolve_dependency_path(owner: &Path, source: &str) -> anyhow::Result<PathBuf> {
    let candidate = owner
        .parent()
        .unwrap_or(owner)
        .join(game_path_to_pathbuf(source));
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
                .join(game_path_to_pathbuf(value)),
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
