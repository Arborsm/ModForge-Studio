//! XML preservation scanning for TMX parsing.
//!
//! Preserves unsupported XML fragments verbatim (so round-trips don't drop
//! unknown elements), scans layer ordering, and collects tileset/tile
//! extension attributes and children for later serialization.

use anyhow::{Context, bail};
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, Writer};
use std::collections::HashMap;
use std::path::Path;

use crate::infrastructure::fs::pathing::normalize_path;
use crate::infrastructure::game_formats::map::{MapLayerOrderEntry, MapPreservedXml};

#[derive(Debug, Default, Clone)]
pub(crate) struct TilesetExtensions {
    pub(crate) attributes: HashMap<String, String>,
    pub(crate) children: Vec<MapPreservedXml>,
    pub(crate) tile_attributes: HashMap<u32, HashMap<String, String>>,
    pub(crate) tile_children: HashMap<u32, Vec<MapPreservedXml>>,
}

pub(crate) fn xml_line_column(xml: &str, byte_offset: usize) -> (usize, usize) {
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

pub(crate) fn strip_preserved_top_level_layers(
    xml: &str,
    map_path: &Path,
) -> anyhow::Result<String> {
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

pub(crate) fn scan_layer_order(
    xml: &str,
) -> anyhow::Result<(Vec<MapLayerOrderEntry>, Vec<MapPreservedXml>)> {
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

pub(crate) fn scan_map_tileset_extensions(xml: &str) -> anyhow::Result<Vec<TilesetExtensions>> {
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

pub(crate) fn scan_tileset_extension_fragment(xml: &str) -> anyhow::Result<TilesetExtensions> {
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
