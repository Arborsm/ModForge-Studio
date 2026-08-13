use super::super::assets::{LoadedMapAsset, load_map_patch_asset};
use super::super::schema::coerce_u32;
use super::super::types::{ContentPatcherMapDebugSummary, ContentPatcherProjectSnapshot};
use crate::infrastructure::game_formats::map::{
    MapLayerDataEncoding, MapLayerOrderEntry, base_gid, gid_flags,
};
use crate::infrastructure::game_formats::tbin::{MapDocument, MapLayer, MapPropertyValue};
use anyhow::{Context, bail};
use serde_json::Value;
use std::collections::HashMap;

fn push_unique(values: &mut Vec<String>, next: String) {
    if !values.iter().any(|value| value == &next) {
        values.push(next);
    }
}

fn json_to_map_property_value(value: &Value) -> MapPropertyValue {
    match value {
        Value::Bool(b) => MapPropertyValue::Bool(*b),
        Value::Number(n) => MapPropertyValue::Number(n.as_f64().unwrap_or(0.0)),
        _ => MapPropertyValue::String(value.as_str().unwrap_or(&value.to_string()).to_string()),
    }
}

// ── Area parsing (shared with EditImage) ──

#[derive(Clone, Copy)]
struct AreaDefaults {
    x: Option<u32>,
    y: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
}

impl AreaDefaults {
    fn source() -> Self {
        Self {
            x: Some(0),
            y: Some(0),
            width: None,
            height: None,
        }
    }

    fn destination(width: u32, height: u32) -> Self {
        Self {
            x: Some(0),
            y: Some(0),
            width: Some(width),
            height: Some(height),
        }
    }
}

fn contains_unresolved_token(text: &str) -> bool {
    text.contains("{{") && text.contains("}}")
}

fn parse_object_area(
    values: &serde_json::Map<String, Value>,
    defaults: AreaDefaults,
) -> anyhow::Result<(u32, u32, u32, u32)> {
    let read = |key: &str, default: Option<u32>| -> anyhow::Result<u32> {
        match values.get(key) {
            Some(value) => {
                if let Value::String(text) = value {
                    if contains_unresolved_token(text) {
                        bail!("Image area `{key}` contains an unresolved token.");
                    }
                }
                coerce_u32(value)
                    .with_context(|| format!("Image area `{key}` must be an unsigned integer."))
            }
            None => default.with_context(|| format!("Image area object is missing `{key}`.")),
        }
    };

    Ok((
        read("X", defaults.x)?,
        read("Y", defaults.y)?,
        read("Width", defaults.width)?,
        read("Height", defaults.height)?,
    ))
}

fn parse_area_value(
    value: Option<&Value>,
    defaults: AreaDefaults,
) -> anyhow::Result<Option<(u32, u32, u32, u32)>> {
    let Some(value) = value else {
        return Ok(None);
    };

    match value {
        Value::Array(values) if values.len() == 4 => {
            let numbers = values
                .iter()
                .map(|entry| {
                    if let Value::String(text) = entry {
                        if contains_unresolved_token(text) {
                            bail!("Image area array contains an unresolved token.");
                        }
                    }
                    coerce_u32(entry).context("Image area array values must be unsigned integers.")
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Some((numbers[0], numbers[1], numbers[2], numbers[3])))
        }
        Value::String(text) => {
            if contains_unresolved_token(text) {
                bail!("Image area string contains an unresolved token.");
            }
            let parts = text
                .split(',')
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(|part| {
                    if contains_unresolved_token(part) {
                        bail!("Image area string contains an unresolved token.");
                    }
                    part.parse::<u32>()
                        .with_context(|| format!("Invalid image area segment `{part}`"))
                })
                .collect::<Result<Vec<_>, _>>()?;
            if parts.len() != 4 {
                bail!("Image area string must contain four comma-separated integers.");
            }
            Ok(Some((parts[0], parts[1], parts[2], parts[3])))
        }
        Value::Object(values) => Ok(Some(parse_object_area(values, defaults)?)),
        _ => Err(anyhow::anyhow!(
            "Image area must be an array, object, or comma-separated string."
        )),
    }
}

// ── Map operations ──

fn extend_map_to_fit(document: &mut MapDocument, min_width: u32, min_height: u32) {
    if document.width >= min_width && document.height >= min_height {
        return;
    }
    let new_width = document.width.max(min_width);
    let new_height = document.height.max(min_height);

    for layer in &mut document.layers {
        if layer.width == new_width && layer.height == new_height {
            continue;
        }
        let old_width = layer.width;
        let mut new_gids = vec![0u32; (new_width * new_height) as usize];
        for y in 0..layer.height {
            for x in 0..old_width {
                let old_idx = (y * old_width + x) as usize;
                let new_idx = (y * new_width + x) as usize;
                new_gids[new_idx] = layer.gids[old_idx];
            }
        }
        layer.cell_properties = layer
            .cell_properties
            .drain()
            .map(|(index, value)| {
                let x = index % old_width;
                let y = index / old_width;
                (y * new_width + x, value)
            })
            .collect();
        layer.cell_animations = layer
            .cell_animations
            .drain()
            .map(|(index, value)| {
                let x = index % old_width;
                let y = index / old_width;
                (y * new_width + x, value)
            })
            .collect();
        layer.gids = new_gids;
        layer.width = new_width;
        layer.height = new_height;
    }
    document.width = new_width;
    document.height = new_height;
}

fn merge_source_tilesets(document: &mut MapDocument, source: &MapDocument) -> HashMap<u32, u32> {
    let mut gid_mapping: HashMap<u32, u32> = HashMap::new();

    for source_tileset in &source.tilesets {
        let source_image = normalized_tileset_image(source_tileset.image_source.as_deref());
        if let Some(target_tileset) = document.tilesets.iter().find(|target| {
            target.name == source_tileset.name
                && normalized_tileset_image(target.image_source.as_deref()) == source_image
        }) {
            for i in 0..source_tileset.tile_count {
                let source_gid = source_tileset.first_gid + i;
                let target_gid = target_tileset.first_gid + i;
                gid_mapping.insert(source_gid, target_gid);
            }
            continue;
        }

        // Add as a new tileset
        let new_first_gid = if document.tilesets.is_empty() {
            1
        } else {
            let max_tileset = document
                .tilesets
                .iter()
                .max_by_key(|t| t.first_gid)
                .expect("tilesets is non-empty in else branch");
            max_tileset.first_gid + max_tileset.tile_count
        };

        let mut new_tileset = source_tileset.clone();
        new_tileset.first_gid = new_first_gid;
        if document
            .tilesets
            .iter()
            .any(|target| target.name == new_tileset.name)
        {
            let base_name = format!("z_{}", new_tileset.name.trim_start_matches("z_"));
            let mut candidate = base_name.clone();
            let mut suffix = 2u32;
            while document
                .tilesets
                .iter()
                .any(|target| target.name == candidate)
            {
                candidate = format!("{base_name}_{suffix}");
                suffix += 1;
            }
            new_tileset.name = candidate;
        }
        document.tilesets.push(new_tileset);

        for i in 0..source_tileset.tile_count {
            let source_gid = source_tileset.first_gid + i;
            let target_gid = new_first_gid + i;
            gid_mapping.insert(source_gid, target_gid);
        }
    }

    gid_mapping
}

fn normalized_tileset_image(value: Option<&str>) -> String {
    let mut segments = Vec::new();
    let normalized = value.unwrap_or_default().replace('\\', "/");
    for segment in normalized.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            value => segments.push(value.to_lowercase()),
        }
    }
    segments.join("/")
}

fn remap_gid(gid: u32, mapping: &HashMap<u32, u32>) -> u32 {
    let base = base_gid(gid);
    mapping.get(&base).copied().unwrap_or(base) | gid_flags(gid)
}

#[allow(clippy::too_many_arguments)]
fn remap_sparse_cells<T: Clone>(
    source: &HashMap<u32, T>,
    source_width: u32,
    target_width: u32,
    source_x: u32,
    source_y: u32,
    source_width_area: u32,
    source_height_area: u32,
    target_x: u32,
    target_y: u32,
) -> HashMap<u32, T> {
    source
        .iter()
        .filter_map(|(source_index, value)| {
            let x = *source_index % source_width;
            let y = *source_index / source_width;
            (x >= source_x
                && x < source_x + source_width_area
                && y >= source_y
                && y < source_y + source_height_area)
                .then(|| {
                    let target_index =
                        (target_y + y - source_y) * target_width + target_x + x - source_x;
                    (target_index, value.clone())
                })
        })
        .collect()
}

fn apply_map_properties(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    map_properties: &serde_json::Map<String, Value>,
) -> usize {
    let mut count = 0;
    for (key, value) in map_properties {
        if value.is_null() {
            document.properties.remove(key);
        } else {
            document
                .properties
                .insert(key.clone(), json_to_map_property_value(value));
        }
        push_unique(&mut debug.properties, key.clone());
        count += 1;
    }
    count
}

fn validate_warp(warp: &str) -> anyhow::Result<()> {
    let parts: Vec<&str> = warp.split(' ').collect();
    if parts.len() != 5 {
        bail!("warp must have exactly five fields: fromX fromY toMap toX toY");
    }
    for (i, part) in parts.iter().enumerate() {
        if i == 2 {
            if part.trim().is_empty() {
                bail!("warp map name cannot be blank");
            }
        } else {
            if part.parse::<i32>().is_err() {
                bail!("can't parse '{part}' as a tile coordinate");
            }
        }
    }
    Ok(())
}

fn apply_warps(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    add_warps: &Value,
    property_name: &str,
) -> anyhow::Result<usize> {
    let warp_strings: Vec<String> = match add_warps {
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| {
                v.as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned)
            })
            .collect(),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        _ => bail!("{property_name} must be a string or array."),
    };

    let valid_warps: Vec<String> = warp_strings
        .into_iter()
        .filter(|w| validate_warp(w).is_ok())
        .collect();

    if valid_warps.is_empty() {
        return Ok(0);
    }

    let prev_warps = document
        .properties
        .get(property_name)
        .and_then(|v| match v.untyped() {
            MapPropertyValue::String(s) => Some(s.clone()),
            _ => None,
        })
        .unwrap_or_default();

    // Content Patcher prepends each declaration as it iterates, so later entries win.
    let new_warps = valid_warps
        .iter()
        .rev()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join(" ");
    let combined = if prev_warps.is_empty() {
        new_warps
    } else {
        format!("{new_warps} {prev_warps}")
    };

    document.properties.insert(
        property_name.to_string(),
        MapPropertyValue::String(combined),
    );
    push_unique(&mut debug.warps, property_name.to_string());

    Ok(valid_warps.len())
}

fn require_u32_no_token(value: Option<&Value>, field: &str) -> anyhow::Result<u32> {
    let Some(value) = value else {
        bail!("{field} must be a non-negative integer.");
    };
    if let Value::String(text) = value {
        if contains_unresolved_token(text) {
            bail!("{field} contains an unresolved token.");
        }
    }
    value
        .as_u64()
        .with_context(|| format!("{field} must be a non-negative integer."))
        .map(|v| v as u32)
}

fn optional_u32_no_token(value: Option<&Value>, field: &str) -> anyhow::Result<Option<u32>> {
    let Some(value) = value else {
        return Ok(None);
    };
    if let Some(text) = value.as_str() {
        if contains_unresolved_token(text) {
            bail!("{field} contains an unresolved token.");
        }
        return text
            .parse::<u32>()
            .with_context(|| format!("{field} '{text}' is not a valid non-negative integer."))
            .map(Some);
    }
    value
        .as_u64()
        .and_then(|number| u32::try_from(number).ok())
        .with_context(|| format!("{field} must be a non-negative integer."))
        .map(Some)
}

fn apply_map_tiles(document: &mut MapDocument, map_tiles: &Value) -> anyhow::Result<usize> {
    let tiles = map_tiles.as_array().context("MapTiles must be an array.")?;
    let mut applied = 0;

    for tile in tiles {
        let obj = tile
            .as_object()
            .context("MapTiles entry must be an object.")?;

        let layer_name = obj
            .get("Layer")
            .and_then(Value::as_str)
            .context("MapTiles entry missing Layer.")?;
        let position = obj
            .get("Position")
            .and_then(Value::as_object)
            .context("MapTiles entry missing Position.")?;
        let pos_x = require_u32_no_token(position.get("X"), "Position.X")?;
        let pos_y = require_u32_no_token(position.get("Y"), "Position.Y")?;

        let set_tilesheet = obj
            .get("SetTilesheet")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let set_index = optional_u32_no_token(obj.get("SetIndex"), "SetIndex")?;
        let remove = match obj.get("Remove") {
            Some(Value::Bool(value)) => *value,
            Some(Value::String(value)) => value.eq_ignore_ascii_case("true"),
            _ => false,
        };

        let layer_idx = document
            .layers
            .iter()
            .position(|l| l.name == layer_name)
            .with_context(|| format!("Layer '{layer_name}' not found."))?;

        let layer = &document.layers[layer_idx];
        if pos_x >= layer.width || pos_y >= layer.height {
            bail!(
                "Position ({pos_x}, {pos_y}) is outside layer bounds ({}x{}).",
                layer.width,
                layer.height
            );
        }

        let idx = (pos_y * layer.width + pos_x) as usize;
        let mut current_gid = layer.gids[idx];

        if remove {
            let layer = &mut document.layers[layer_idx];
            layer.gids[idx] = 0;
            layer.cell_properties.remove(&(idx as u32));
            layer.cell_animations.remove(&(idx as u32));
            current_gid = 0;
        }

        let has_edits =
            set_tilesheet.is_some() || set_index.is_some() || obj.get("SetProperties").is_some();

        if !has_edits {
            if remove {
                let layer = &mut document.layers[layer_idx];
                layer.non_empty_tiles = layer.gids.iter().filter(|&&g| g != 0).count() as u32;
                applied += 1;
            }
            continue;
        }

        // Determine new gid using only immutable borrows
        let new_gid = match (set_tilesheet, set_index) {
            (Some(tilesheet_name), Some(index)) => {
                let tileset = document
                    .tilesets
                    .iter()
                    .find(|t| t.name == tilesheet_name)
                    .with_context(|| {
                        format!("SetTilesheet specifies '{tilesheet_name}' which doesn't exist.")
                    })?;
                if index >= tileset.tile_count {
                    bail!(
                        "SetIndex {index} is outside tileset '{tilesheet_name}' ({} tiles).",
                        tileset.tile_count
                    );
                }
                tileset.first_gid + index
            }
            (Some(tilesheet_name), None) => {
                if current_gid == 0 {
                    bail!(
                        "No tile at {layer_name} ({pos_x}, {pos_y}). To set tilesheet without index, the tile must exist."
                    );
                }
                let current_base_gid = base_gid(current_gid);
                let current_first_gid = document
                    .tilesets
                    .iter()
                    .find(|t| {
                        current_base_gid >= t.first_gid
                            && current_base_gid < t.first_gid + t.tile_count
                    })
                    .map(|t| t.first_gid)
                    .context("Cannot resolve current tileset.")?;
                let local_id = current_base_gid - current_first_gid;
                let tileset = document
                    .tilesets
                    .iter()
                    .find(|t| t.name == tilesheet_name)
                    .with_context(|| {
                        format!("SetTilesheet specifies '{tilesheet_name}' which doesn't exist.")
                    })?;
                (tileset.first_gid + local_id) | gid_flags(current_gid)
            }
            (None, Some(index)) => {
                if current_gid == 0 {
                    bail!(
                        "No tile at {layer_name} ({pos_x}, {pos_y}). To add a tile, SetTilesheet and SetIndex must both be set."
                    );
                }
                let current_base_gid = base_gid(current_gid);
                let current_tileset = document
                    .tilesets
                    .iter()
                    .find(|t| {
                        current_base_gid >= t.first_gid
                            && current_base_gid < t.first_gid + t.tile_count
                    })
                    .context("Cannot resolve current tileset.")?;
                if index >= current_tileset.tile_count {
                    bail!(
                        "SetIndex {index} is outside tileset '{}' ({} tiles).",
                        current_tileset.name,
                        current_tileset.tile_count
                    );
                }
                (current_tileset.first_gid + index) | gid_flags(current_gid)
            }
            (None, None) => current_gid,
        };

        // Apply the new gid
        {
            let layer = &mut document.layers[layer_idx];
            layer.gids[idx] = new_gid;
            layer.non_empty_tiles = layer.gids.iter().filter(|&&g| g != 0).count() as u32;
        }

        // Content Patcher SetProperties changes this tile instance, not its tileset definition.
        if let Some(props) = obj.get("SetProperties").and_then(Value::as_object) {
            if new_gid != 0 {
                let entry = document.layers[layer_idx]
                    .cell_properties
                    .entry(idx as u32)
                    .or_insert_with(HashMap::new);
                for (key, value) in props {
                    if value.is_null() {
                        entry.remove(key);
                    } else {
                        entry.insert(key.clone(), json_to_map_property_value(value));
                    }
                }
            }
        }

        applied += 1;
    }

    Ok(applied)
}

fn apply_map_patch(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    source: &MapDocument,
    from_area: Option<(u32, u32, u32, u32)>,
    to_area: Option<(u32, u32, u32, u32)>,
    patch_mode: &str,
) -> anyhow::Result<String> {
    let (source_x, source_y, source_w, source_h) =
        from_area.unwrap_or((0, 0, source.width, source.height));
    let (target_x, target_y, target_w, target_h) = to_area.unwrap_or((0, 0, source_w, source_h));

    if source_w != target_w || source_h != target_h {
        bail!(
            "FromArea size ({source_w}x{source_h}) doesn't match ToArea size ({target_w}x{target_h})."
        );
    }

    extend_map_to_fit(document, target_x + target_w, target_y + target_h);

    let gid_mapping = merge_source_tilesets(document, source);

    let is_overlay = patch_mode.eq_ignore_ascii_case("Overlay");
    let is_replace = patch_mode.eq_ignore_ascii_case("Replace");
    let is_replace_by_layer = patch_mode.eq_ignore_ascii_case("ReplaceByLayer");
    if !is_overlay && !is_replace && !is_replace_by_layer {
        bail!("Unsupported EditMap PatchMode '{patch_mode}'.");
    }

    // Update existing layers
    for target_layer in document.layers.iter_mut() {
        let source_layer = source.layers.iter().find(|l| l.name == target_layer.name);

        if let Some(source_layer) = source_layer {
            target_layer.properties = source_layer.properties.clone();
            for dy in 0..target_h {
                for dx in 0..target_w {
                    let sx = source_x + dx;
                    let sy = source_y + dy;
                    let tx = target_x + dx;
                    let ty = target_y + dy;

                    if sx >= source_layer.width || sy >= source_layer.height {
                        continue;
                    }

                    let source_idx = (sy * source_layer.width + sx) as usize;
                    let target_idx = (ty * target_layer.width + tx) as usize;
                    let source_gid = source_layer.gids[source_idx];

                    if is_overlay && source_gid == 0 {
                        continue;
                    }

                    target_layer.gids[target_idx] = remap_gid(source_gid, &gid_mapping);
                    let source_cell = source_idx as u32;
                    let target_cell = target_idx as u32;
                    if let Some(properties) = source_layer.cell_properties.get(&source_cell) {
                        target_layer
                            .cell_properties
                            .insert(target_cell, properties.clone());
                    } else {
                        target_layer.cell_properties.remove(&target_cell);
                    }
                    if let Some(animation) = source_layer.cell_animations.get(&source_cell) {
                        target_layer
                            .cell_animations
                            .insert(target_cell, animation.clone());
                    } else {
                        target_layer.cell_animations.remove(&target_cell);
                    }
                }
            }
        } else if is_replace {
            for dy in 0..target_h {
                for dx in 0..target_w {
                    let tx = target_x + dx;
                    let ty = target_y + dy;
                    let target_idx = (ty * target_layer.width + tx) as usize;
                    target_layer.gids[target_idx] = 0;
                    target_layer.cell_properties.remove(&(target_idx as u32));
                    target_layer.cell_animations.remove(&(target_idx as u32));
                }
            }
        }
        target_layer.non_empty_tiles = target_layer
            .gids
            .iter()
            .filter(|gid| base_gid(**gid) != 0)
            .count() as u32;
    }

    // All patch modes materialize layers that exist only in the patch source.
    for source_layer in &source.layers {
        if !document.layers.iter().any(|l| l.name == source_layer.name) {
            let mut new_gids = vec![0u32; (document.width * document.height) as usize];
            for dy in 0..target_h {
                for dx in 0..target_w {
                    let sx = source_x + dx;
                    let sy = source_y + dy;
                    if sx < source_layer.width && sy < source_layer.height {
                        let source_idx = (sy * source_layer.width + sx) as usize;
                        let target_idx =
                            ((target_y + dy) * document.width + (target_x + dx)) as usize;
                        let source_gid = source_layer.gids[source_idx];
                        new_gids[target_idx] = remap_gid(source_gid, &gid_mapping);
                    }
                }
            }
            let non_empty_tiles = new_gids.iter().filter(|&&g| g != 0).count() as u32;
            let new_id = document.layers.iter().map(|l| l.id).max().unwrap_or(0) + 1;
            document.layers.push(MapLayer {
                id: new_id,
                name: source_layer.name.clone(),
                kind: "tile".to_string(),
                width: document.width,
                height: document.height,
                visible: source_layer.visible,
                opacity: source_layer.opacity,
                offset_x: source_layer.offset_x,
                offset_y: source_layer.offset_y,
                properties: source_layer.properties.clone(),
                gids: new_gids,
                non_empty_tiles,
                data_encoding: source_layer.data_encoding,
                data_compression: source_layer.data_compression.clone(),
                cell_properties: remap_sparse_cells(
                    &source_layer.cell_properties,
                    source_layer.width,
                    document.width,
                    source_x,
                    source_y,
                    source_w,
                    source_h,
                    target_x,
                    target_y,
                ),
                cell_animations: remap_sparse_cells(
                    &source_layer.cell_animations,
                    source_layer.width,
                    document.width,
                    source_x,
                    source_y,
                    source_w,
                    source_h,
                    target_x,
                    target_y,
                ),
                preserved_xml: source_layer.preserved_xml.clone(),
            });
            document
                .layer_order
                .push(MapLayerOrderEntry::TileLayer(new_id));
        }
    }

    // Update debug
    for layer in &document.layers {
        push_unique(&mut debug.layers, layer.name.clone());
    }

    Ok(format!(
        "patched map {}x{} at {},{} (mode: {})",
        target_w, target_h, target_x, target_y, patch_mode
    ))
}

fn apply_remove_layer(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    remove_layer: &Value,
) -> anyhow::Result<usize> {
    let layer_names: Vec<String> = match remove_layer {
        Value::String(name) => {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| {
                v.as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned)
            })
            .collect(),
        _ => bail!("RemoveLayer must be a string or an array of strings."),
    };

    let mut removed = 0;
    for name in &layer_names {
        let before = document.layers.len();
        document.layers.retain(|l| l.name != *name);
        if document.layers.len() < before {
            push_unique(&mut debug.layers, format!("-{name}"));
            removed += 1;
        }
    }
    Ok(removed)
}

fn apply_add_layer(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    add_layer: &Value,
) -> anyhow::Result<usize> {
    let layer_names: Vec<String> = match add_layer {
        Value::String(name) => {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| {
                v.as_str()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(ToOwned::to_owned)
            })
            .collect(),
        _ => bail!("AddLayer must be a string or an array of strings."),
    };

    let mut added = 0;
    for name in &layer_names {
        if document.layers.iter().any(|l| l.name == *name) {
            continue;
        }
        // Create an empty layer with the same dimensions as the map
        let non_empty_tiles = 0;
        let new_id = document.layers.iter().map(|l| l.id).max().unwrap_or(0) + 1;
        document.layers.push(MapLayer {
            id: new_id,
            name: name.clone(),
            kind: "tile".to_string(),
            width: document.width,
            height: document.height,
            visible: true,
            opacity: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            properties: HashMap::new(),
            gids: vec![0; (document.width * document.height) as usize],
            non_empty_tiles,
            data_encoding: MapLayerDataEncoding::Csv,
            data_compression: None,
            cell_properties: HashMap::new(),
            cell_animations: HashMap::new(),
            preserved_xml: Vec::new(),
        });
        push_unique(&mut debug.layers, format!("+{name}"));
        added += 1;
    }
    Ok(added)
}

// ── TextOperations (simplified for MapProperties only) ──

fn apply_delimited_operation(
    text: &str,
    operation: &str,
    value: &str,
    delimiter: &str,
    search: Option<&str>,
    replace_mode: &str,
) -> String {
    let parts: Vec<&str> = text.split(delimiter).collect();
    let trimmed_parts: Vec<&str> = parts.iter().map(|p| p.trim()).collect();

    let mode_lower = replace_mode.to_ascii_lowercase();
    let is_first = mode_lower == "first";
    let is_all = mode_lower != "last";

    match operation.to_ascii_lowercase().as_str() {
        "append" => {
            if text.is_empty() {
                value.to_string()
            } else {
                format!("{text}{delimiter}{value}")
            }
        }
        "prepend" => {
            if text.is_empty() {
                value.to_string()
            } else {
                format!("{value}{delimiter}{text}")
            }
        }
        "removedelimited" => {
            let search_term = search.unwrap_or(value);
            trimmed_parts
                .into_iter()
                .filter(|p| *p != search_term)
                .collect::<Vec<_>>()
                .join(delimiter)
        }
        "replacedelimited" => {
            let search_term = search.unwrap_or(value);
            let mut replaced = false;
            let mut result = Vec::new();

            for part in trimmed_parts {
                if part == search_term {
                    if !replaced || is_all {
                        result.push(value);
                        if is_first {
                            replaced = true;
                        }
                        continue;
                    }
                }
                result.push(part);
            }

            result.join(delimiter)
        }
        _ => text.to_string(),
    }
}

fn apply_text_operations_to_map(
    document: &mut MapDocument,
    debug: &mut ContentPatcherMapDebugSummary,
    patch: &serde_json::Map<String, Value>,
) -> anyhow::Result<usize> {
    let Some(ops) = patch.get("TextOperations").and_then(Value::as_array) else {
        return Ok(0);
    };

    let mut applied = 0;

    for op in ops {
        let obj = op
            .as_object()
            .context("TextOperations item must be an object.")?;

        let target = obj
            .get("Target")
            .and_then(Value::as_array)
            .context("TextOperations item is missing Target array.")?;
        if target.len() != 2 {
            bail!(
                "EditMap TextOperations target must have exactly 2 segments: ['MapProperties', 'PropertyName']."
            );
        }
        let root = target[0].as_str().unwrap_or("").trim().to_ascii_lowercase();
        if root != "mapproperties" {
            bail!("EditMap TextOperations target root must be 'MapProperties', got '{root}'.");
        }
        let property_name = target[1]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .context("TextOperations property name must be a non-empty string.")?;

        let operation = obj
            .get("Operation")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("")
            .to_ascii_lowercase();

        let value = obj
            .get("Value")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("");

        let delimiter = obj
            .get("Delimiter")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or(" ");

        let search = obj.get("Search").and_then(Value::as_str).map(str::trim);

        let replace_mode = obj
            .get("ReplaceMode")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("All");

        let current_text = document
            .properties
            .get(property_name)
            .and_then(|v| match v.untyped() {
                MapPropertyValue::String(s) => Some(s.as_str()),
                _ => None,
            })
            .unwrap_or("");

        let new_text = match operation.as_str() {
            "append" | "prepend" => apply_delimited_operation(
                current_text,
                &operation,
                value,
                delimiter,
                None,
                replace_mode,
            ),
            "removedelimited" => {
                let search_term = search.unwrap_or(value);
                apply_delimited_operation(
                    current_text,
                    &operation,
                    "",
                    delimiter,
                    Some(search_term),
                    replace_mode,
                )
            }
            "replacedelimited" => {
                let search_term = search.unwrap_or("");
                apply_delimited_operation(
                    current_text,
                    &operation,
                    value,
                    delimiter,
                    Some(search_term),
                    replace_mode,
                )
            }
            other => bail!("Unsupported TextOperation: {other}"),
        };

        if !new_text.is_empty() {
            document.properties.insert(
                property_name.to_string(),
                MapPropertyValue::String(new_text),
            );
        } else if document.properties.contains_key(property_name) {
            document.properties.remove(property_name);
        }

        push_unique(&mut debug.properties, property_name.to_string());
        applied += 1;
    }

    Ok(applied)
}

// ── Main entry point ──

pub fn apply_edit_map_patch(
    snapshot: &ContentPatcherProjectSnapshot,
    result_map: &mut LoadedMapAsset,
    patch: &serde_json::Map<String, Value>,
    source_path: &str,
) -> anyhow::Result<String> {
    let document = &mut result_map.document;
    let debug = &mut result_map.debug;
    let mut changed = Vec::new();

    // 1. FromFile map patch
    if let Some(from_file) = patch
        .get("FromFile")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let source = load_map_patch_asset(snapshot, source_path, from_file)?;
        let from_area = parse_area_value(patch.get("FromArea"), AreaDefaults::source())?;
        let to_area = parse_area_value(
            patch.get("ToArea"),
            AreaDefaults::destination(
                from_area
                    .map(|(_, _, w, _h)| w)
                    .unwrap_or(source.document.width),
                from_area
                    .map(|(_, _, _w, h)| h)
                    .unwrap_or(source.document.height),
            ),
        )?;
        let patch_mode = patch
            .get("PatchMode")
            .and_then(Value::as_str)
            .map(str::trim)
            .unwrap_or("ReplaceByLayer");

        let summary = apply_map_patch(
            document,
            debug,
            &source.document,
            from_area,
            to_area,
            patch_mode,
        )?;
        changed.push(summary);
    }

    // 2. MapTiles
    if let Some(map_tiles) = patch.get("MapTiles") {
        let count = apply_map_tiles(document, map_tiles)?;
        if count > 0 {
            changed.push(format!("{count} tiles"));
        }
    }

    // 3. MapProperties
    if let Some(map_properties) = patch.get("MapProperties").and_then(Value::as_object) {
        let count = apply_map_properties(document, debug, map_properties);
        if count > 0 {
            changed.push(format!("{count} properties"));
        }
    }

    // 4. AddNpcWarps
    if let Some(add_npc_warps) = patch.get("AddNpcWarps") {
        let count = apply_warps(document, debug, add_npc_warps, "NPCWarp")?;
        if count > 0 {
            changed.push(format!("{count} NPC warps"));
        }
    }

    // 5. AddWarps
    if let Some(add_warps) = patch.get("AddWarps") {
        let count = apply_warps(document, debug, add_warps, "Warp")?;
        if count > 0 {
            changed.push(format!("{count} warps"));
        }
    }

    // 6. RemoveLayer
    if let Some(remove_layer) = patch.get("RemoveLayer") {
        let removed = apply_remove_layer(document, debug, remove_layer)?;
        if removed > 0 {
            changed.push(format!("{removed} layers removed"));
        }
    }

    // 7. AddLayer
    if let Some(add_layer) = patch.get("AddLayer") {
        let added = apply_add_layer(document, debug, add_layer)?;
        if added > 0 {
            changed.push(format!("{added} layers added"));
        }
    }

    // 8. TextOperations
    let text_count = apply_text_operations_to_map(document, debug, patch)?;
    if text_count > 0 {
        changed.push(format!("{text_count} text ops"));
    }

    if changed.is_empty() {
        bail!(
            "EditMap patch must specify at least one of: FromFile, MapTiles, MapProperties, AddNpcWarps, AddWarps, RemoveLayer, AddLayer, or TextOperations."
        );
    }

    Ok(format!("updated {}", changed.join(", ")))
}

#[cfg(test)]
#[path = "../../../tests/unit/domain/content_patcher/apply/edit_map_tests.rs"]
mod tests;
