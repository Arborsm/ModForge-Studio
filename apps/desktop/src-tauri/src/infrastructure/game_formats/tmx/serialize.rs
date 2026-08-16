//! TMX serialization: baking per-cell properties into `TileData` objects,
//! hoisting per-cell animations into tileset definitions, and writing map/TSX
//! XML while retaining each layer's data encoding.

use anyhow::{Context, bail};
use base64::Engine;
use quick_xml::Writer;
use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use std::collections::HashMap;
use std::io::{Cursor, Write};

use crate::infrastructure::game_formats::map::{
    MapDocument, MapLayer, MapLayerDataEncoding, MapLayerOrderEntry, MapObject, MapObjectGroup,
    MapPreservedXml, MapPropertyValue, MapTileset, base_gid,
};

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
pub(crate) fn serialize_tmx_map(document: &MapDocument) -> anyhow::Result<Vec<u8>> {
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
pub(crate) fn serialize_tsx_tileset(tileset: &MapTileset) -> anyhow::Result<Vec<u8>> {
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
