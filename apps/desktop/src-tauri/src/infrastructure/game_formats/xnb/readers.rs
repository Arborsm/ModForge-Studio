use std::collections::BTreeMap;
use std::sync::{Mutex, OnceLock};

use super::buffer::CursorReader;
use super::schema::{CustomTypeSchema, schema_registry};
use super::values::{TextureData, XnbValue};

#[derive(Debug, Clone)]
pub enum TypeReader {
    Boolean,
    Char,
    Int32,
    UInt32,
    Single,
    Double,
    String,
    Vector2,
    Vector3,
    Vector4,
    Rectangle,
    Color,
    Point,
    Nullable(Box<TypeReader>),
    Array(Box<TypeReader>),
    List(Box<TypeReader>),
    Dictionary(Box<TypeReader>, Box<TypeReader>),
    Texture2D,
    SpriteFont,
    BmFont,
    TBin,
    Object,
    Custom(String),
}

#[derive(Debug, Clone)]
pub struct ReaderResolver {
    readers: Vec<TypeReader>,
}

#[derive(Debug, Clone)]
struct CompiledObjectSchema {
    members: Vec<CompiledSchemaMember>,
}

#[derive(Debug, Clone)]
struct CompiledSchemaMember {
    name: String,
    reader: TypeReader,
}

#[derive(Debug, Clone)]
struct CompiledEnumSchema {
    underlying: EnumUnderlying,
    values: BTreeMap<i32, String>,
}

#[derive(Debug, Clone)]
enum CompiledCustomType {
    Object(CompiledObjectSchema),
    Enum(CompiledEnumSchema),
}

#[derive(Debug, Clone, Copy)]
enum EnumUnderlying {
    Int8,
    UInt8,
    Int16,
    UInt16,
    Int32,
    UInt32,
}

impl ReaderResolver {
    pub fn new(readers: Vec<TypeReader>) -> Self {
        Self { readers }
    }

    pub fn read(&self, reader: &mut CursorReader) -> Result<XnbValue, String> {
        let index = reader.read_7bit_int()? as i32 - 1;
        if index < 0 {
            return Ok(XnbValue::Null);
        }
        let index = index as usize;
        let type_reader = self
            .readers
            .get(index)
            .ok_or_else(|| format!("Invalid reader index {index}"))?;
        type_reader.read(reader, self)
    }
}

impl TypeReader {
    pub fn read(
        &self,
        reader: &mut CursorReader,
        resolver: &ReaderResolver,
    ) -> Result<XnbValue, String> {
        match self {
            TypeReader::Boolean => Ok(XnbValue::Bool(reader.read_u8()? != 0)),
            TypeReader::Char => Ok(XnbValue::String(read_utf8_char(reader)?)),
            TypeReader::Int32 => Ok(XnbValue::Int(reader.read_i32_le()?)),
            TypeReader::UInt32 => Ok(XnbValue::UInt(reader.read_u32_le()?)),
            TypeReader::Single => Ok(XnbValue::Float(reader.read_f32_le()?)),
            TypeReader::Double => Ok(XnbValue::Double(reader.read_f64_le()?)),
            TypeReader::String => Ok(XnbValue::String(reader.read_7bit_string()?)),
            TypeReader::Vector2 => Ok(XnbValue::Vector2 {
                x: reader.read_f32_le()?,
                y: reader.read_f32_le()?,
            }),
            TypeReader::Vector3 => Ok(XnbValue::Vector3 {
                x: reader.read_f32_le()?,
                y: reader.read_f32_le()?,
                z: reader.read_f32_le()?,
            }),
            TypeReader::Vector4 => Ok(XnbValue::Vector4 {
                x: reader.read_f32_le()?,
                y: reader.read_f32_le()?,
                z: reader.read_f32_le()?,
                w: reader.read_f32_le()?,
            }),
            TypeReader::Rectangle => Ok(XnbValue::Rectangle {
                x: reader.read_i32_le()?,
                y: reader.read_i32_le()?,
                width: reader.read_i32_le()?,
                height: reader.read_i32_le()?,
            }),
            TypeReader::Color => Ok(XnbValue::Color {
                r: reader.read_u8()?,
                g: reader.read_u8()?,
                b: reader.read_u8()?,
                a: reader.read_u8()?,
            }),
            TypeReader::Point => Ok(XnbValue::Point {
                x: reader.read_i32_le()?,
                y: reader.read_i32_le()?,
            }),
            TypeReader::Nullable(inner) => {
                let has_value = reader.read_u8()? != 0;
                if has_value {
                    inner.read(reader, resolver)
                } else {
                    Ok(XnbValue::Null)
                }
            }
            TypeReader::Array(inner) | TypeReader::List(inner) => {
                let count = reader.read_u32_le()? as usize;
                let mut values = Vec::with_capacity(count);
                for index in 0..count {
                    let value = read_member_value(inner, reader, resolver)
                        .map_err(|error| format!("[{index}]: {error}"))?;
                    values.push(value);
                }
                if matches!(self, TypeReader::Array(_)) {
                    Ok(XnbValue::Array(values))
                } else {
                    Ok(XnbValue::List(values))
                }
            }
            TypeReader::Dictionary(key_reader, value_reader) => {
                let count = reader.read_u32_le()? as usize;
                let mut entries = Vec::with_capacity(count);
                for index in 0..count {
                    let key = read_member_value(key_reader, reader, resolver)
                        .map_err(|error| format!("[{index}].key: {error}"))?;
                    let key_label = key
                        .json_object_key()
                        .unwrap_or_else(|| key.to_json().to_string());
                    let value = read_member_value(value_reader, reader, resolver)
                        .map_err(|error| format!("[{index}].value({key_label}): {error}"))?;
                    entries.push((key, value));
                }
                Ok(XnbValue::Dictionary(entries))
            }
            TypeReader::Texture2D => {
                let format = reader.read_i32_le()?;
                let width = reader.read_u32_le()?;
                let height = reader.read_u32_le()?;
                let mip_count = reader.read_u32_le()?;
                if mip_count == 0 {
                    return Err("Texture2D declared zero mip levels.".to_string());
                }
                let first_data_size = reader.read_u32_le()? as usize;
                let data = reader.read_bytes(first_data_size)?;
                for mip_index in 1..mip_count {
                    let data_size = reader.read_u32_le()? as usize;
                    reader
                        .read_bytes(data_size)
                        .map_err(|error| format!("Texture2D mip level {mip_index}: {error}"))?;
                }
                let rgba = decode_texture_data(format, width as usize, height as usize, &data)?;
                Ok(XnbValue::Texture(TextureData {
                    width,
                    height,
                    rgba,
                }))
            }
            TypeReader::SpriteFont => {
                let texture = resolver.read(reader)?;
                let glyphs = resolver.read(reader)?;
                let cropping = resolver.read(reader)?;
                let character_map = resolver.read(reader)?;
                let vertical_line_spacing = XnbValue::Int(reader.read_i32_le()?);
                let horizontal_spacing = XnbValue::Float(reader.read_f32_le()?);
                let kerning = resolver.read(reader)?;
                let default_character =
                    TypeReader::Nullable(Box::new(TypeReader::Char)).read(reader, resolver)?;

                Ok(XnbValue::Object(vec![
                    ("Texture".to_string(), texture),
                    ("Glyphs".to_string(), glyphs),
                    ("Cropping".to_string(), cropping),
                    ("CharacterMap".to_string(), character_map),
                    ("VerticalLineSpacing".to_string(), vertical_line_spacing),
                    ("HorizontalSpacing".to_string(), horizontal_spacing),
                    ("Kerning".to_string(), kerning),
                    ("DefaultCharacter".to_string(), default_character),
                ]))
            }
            TypeReader::BmFont => Ok(XnbValue::String(reader.read_7bit_string()?)),
            TypeReader::TBin => {
                let size = reader.read_i32_le()? as usize;
                let data = reader.read_bytes(size)?;
                Ok(XnbValue::Bytes(data))
            }
            TypeReader::Object => resolver.read(reader),
            TypeReader::Custom(type_name) => read_custom_type(type_name, reader, resolver),
        }
    }

    pub fn is_value_type(&self) -> bool {
        match self {
            TypeReader::Boolean
            | TypeReader::Char
            | TypeReader::Int32
            | TypeReader::UInt32
            | TypeReader::Single
            | TypeReader::Double
            | TypeReader::Vector2
            | TypeReader::Vector3
            | TypeReader::Vector4
            | TypeReader::Rectangle
            | TypeReader::Color
            | TypeReader::Point
            | TypeReader::Nullable(_) => true,
            TypeReader::Custom(type_name) => schema_registry()
                .get(type_name)
                .is_some_and(|schema| matches!(schema, CustomTypeSchema::Enum(_))),
            _ => false,
        }
    }
}

pub fn build_readers(type_names: &[String]) -> Result<Vec<TypeReader>, String> {
    type_names
        .iter()
        .map(|name| build_reader_from_type_name(name))
        .collect()
}

fn read_member_value(
    reader_type: &TypeReader,
    reader: &mut CursorReader,
    resolver: &ReaderResolver,
) -> Result<XnbValue, String> {
    if reader_type.is_value_type() {
        reader_type.read(reader, resolver)
    } else {
        resolver.read(reader)
    }
}

fn read_custom_type(
    type_name: &str,
    reader: &mut CursorReader,
    resolver: &ReaderResolver,
) -> Result<XnbValue, String> {
    match compiled_custom_type(type_name)? {
        CompiledCustomType::Object(schema) => {
            let mut values = Vec::with_capacity(schema.members.len());
            for member in &schema.members {
                let value = read_member_value(&member.reader, reader, resolver)
                    .map_err(|error| format!("{type_name}.{}: {error}", member.name))?;
                let value = coerce_member_value(type_name, &member.name, value);
                values.push((member.name.clone(), value));
            }
            Ok(XnbValue::Object(values))
        }
        CompiledCustomType::Enum(schema) => {
            let raw_value = match schema.underlying {
                EnumUnderlying::Int8 => reader.read_i8()? as i32,
                EnumUnderlying::UInt8 => reader.read_u8()? as i32,
                EnumUnderlying::Int16 => reader.read_i16_le()? as i32,
                EnumUnderlying::UInt16 => reader.read_u16_le()? as i32,
                EnumUnderlying::Int32 => reader.read_i32_le()?,
                EnumUnderlying::UInt32 => reader.read_u32_le()? as i32,
            };
            Ok(XnbValue::String(
                schema
                    .values
                    .get(&raw_value)
                    .cloned()
                    .or_else(|| format_flags_enum(&schema.values, raw_value))
                    .unwrap_or_else(|| raw_value.to_string()),
            ))
        }
    }
}

fn coerce_member_value(type_name: &str, member_name: &str, value: XnbValue) -> XnbValue {
    match (type_name, member_name, value) {
        (type_name, _, XnbValue::Vector2 { x, y })
            if type_name.starts_with("StardewValley.GameData.Buildings.") =>
        {
            XnbValue::String(format!("{}, {}", compact_f32(x), compact_f32(y)))
        }
        (
            "StardewValley.GameData.FarmAnimals.FarmAnimalData",
            "UpDownPetHitboxTileSize"
            | "LeftRightPetHitboxTileSize"
            | "BabyUpDownPetHitboxTileSize"
            | "BabyLeftRightPetHitboxTileSize",
            XnbValue::Vector2 { x, y },
        ) => XnbValue::String(format!("{}, {}", compact_f32(x), compact_f32(y))),
        (
            "StardewValley.GameData.Fences.FenceData",
            "HeldObjectDrawOffset",
            XnbValue::Vector2 { x, y },
        ) => XnbValue::String(format!("{}, {}", compact_f32(x), compact_f32(y))),
        (
            "StardewValley.GameData.Pets.PetSummitPerfectionEventData",
            "Motion",
            XnbValue::Vector2 { x, y },
        ) => XnbValue::String(format!("{}, {}", compact_f32(x), compact_f32(y))),
        (
            "StardewValley.GameData.TemporaryAnimatedSpriteDefinition",
            "PositionOffset",
            XnbValue::Vector2 { x, y },
        ) => XnbValue::String(format!("{}, {}", compact_f32(x), compact_f32(y))),
        (_, _, value) => value,
    }
}

fn format_flags_enum(values: &BTreeMap<i32, String>, raw_value: i32) -> Option<String> {
    if raw_value <= 0 {
        return None;
    }

    let mut flags = values
        .iter()
        .filter_map(|(&value, name)| {
            if value > 0 && (value as u32).is_power_of_two() {
                Some((value, name.as_str()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    if flags.is_empty() {
        return None;
    }

    flags.sort_by_key(|(value, _)| *value);
    let mut remaining = raw_value;
    let mut names = Vec::new();

    for (value, name) in flags.into_iter().rev() {
        if (remaining & value) == value {
            remaining &= !value;
            names.push(name);
        }
    }

    if remaining != 0 || names.is_empty() {
        return None;
    }

    names.reverse();
    Some(names.join(", "))
}

fn compact_f32(value: f32) -> String {
    let mut text = value.to_string();
    if text.contains('.') {
        text = text.trim_end_matches('0').trim_end_matches('.').to_string();
    }
    if text == "-0" { "0".to_string() } else { text }
}

fn compiled_custom_type(type_name: &str) -> Result<CompiledCustomType, String> {
    static CACHE: OnceLock<Mutex<BTreeMap<String, CompiledCustomType>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(BTreeMap::new()));

    if let Some(existing) = cache
        .lock()
        .expect("XNB reader cache mutex should not be poisoned")
        .get(type_name)
        .cloned()
    {
        return Ok(existing);
    }

    let compiled = match schema_registry().get(type_name) {
        Some(CustomTypeSchema::Object(schema)) => {
            CompiledCustomType::Object(CompiledObjectSchema {
                members: schema
                    .members
                    .iter()
                    .map(|member| {
                        Ok(CompiledSchemaMember {
                            name: member.name.clone(),
                            reader: build_reader_from_type_name(&member.type_name)?,
                        })
                    })
                    .collect::<Result<Vec<_>, String>>()?,
            })
        }
        Some(CustomTypeSchema::Enum(schema)) => CompiledCustomType::Enum(CompiledEnumSchema {
            underlying: parse_enum_underlying(&schema.underlying_type)?,
            values: schema.values.clone(),
        }),
        None => {
            return Err(format!(
                "Unsupported XNB reader type: {type_name} ({type_name})"
            ));
        }
    };

    cache
        .lock()
        .expect("XNB reader cache mutex should not be poisoned")
        .insert(type_name.to_string(), compiled.clone());
    Ok(compiled)
}

fn parse_enum_underlying(type_name: &str) -> Result<EnumUnderlying, String> {
    match type_name {
        "System.SByte" => Ok(EnumUnderlying::Int8),
        "System.Byte" => Ok(EnumUnderlying::UInt8),
        "System.Int16" => Ok(EnumUnderlying::Int16),
        "System.UInt16" => Ok(EnumUnderlying::UInt16),
        "System.Int32" => Ok(EnumUnderlying::Int32),
        "System.UInt32" => Ok(EnumUnderlying::UInt32),
        other => Err(format!("Unsupported enum underlying type: {other}")),
    }
}

fn build_reader_from_type_name(type_name: &str) -> Result<TypeReader, String> {
    let full = type_name.trim();
    let normalized_custom = normalize_custom_type_name(leading_type_name(full));
    if normalized_custom.ends_with("[]") {
        let inner = &normalized_custom[..normalized_custom.len() - 2];
        return Ok(TypeReader::Array(Box::new(build_reader_from_type_name(
            inner,
        )?)));
    }

    match normalized_custom.as_str() {
        "Microsoft.Xna.Framework.Content.BooleanReader" | "System.Boolean" => {
            Ok(TypeReader::Boolean)
        }
        "Microsoft.Xna.Framework.Content.CharReader" | "System.Char" => Ok(TypeReader::Char),
        "Microsoft.Xna.Framework.Content.Int32Reader" | "System.Int32" => Ok(TypeReader::Int32),
        "Microsoft.Xna.Framework.Content.UInt32Reader" | "System.UInt32" => Ok(TypeReader::UInt32),
        "Microsoft.Xna.Framework.Content.SingleReader" | "System.Single" => Ok(TypeReader::Single),
        "Microsoft.Xna.Framework.Content.DoubleReader" | "System.Double" => Ok(TypeReader::Double),
        "Microsoft.Xna.Framework.Content.StringReader" | "System.String" => Ok(TypeReader::String),
        "System.Object" => Ok(TypeReader::Object),
        "Microsoft.Xna.Framework.Content.Vector2Reader" | "Microsoft.Xna.Framework.Vector2" => {
            Ok(TypeReader::Vector2)
        }
        "Microsoft.Xna.Framework.Content.Vector3Reader" | "Microsoft.Xna.Framework.Vector3" => {
            Ok(TypeReader::Vector3)
        }
        "Microsoft.Xna.Framework.Content.Vector4Reader" | "Microsoft.Xna.Framework.Vector4" => {
            Ok(TypeReader::Vector4)
        }
        "Microsoft.Xna.Framework.Content.RectangleReader" | "Microsoft.Xna.Framework.Rectangle" => {
            Ok(TypeReader::Rectangle)
        }
        "Microsoft.Xna.Framework.Content.ColorReader" | "Microsoft.Xna.Framework.Color" => {
            Ok(TypeReader::Color)
        }
        "Microsoft.Xna.Framework.Content.PointReader" | "Microsoft.Xna.Framework.Point" => {
            Ok(TypeReader::Point)
        }
        "Microsoft.Xna.Framework.Content.Texture2DReader" => Ok(TypeReader::Texture2D),
        "Microsoft.Xna.Framework.Content.SpriteFontReader" => Ok(TypeReader::SpriteFont),
        "BmFont.XmlSourceReader" => Ok(TypeReader::BmFont),
        "xTile.Pipeline.TideReader" | "xTile.Pipeline.TbinReader" | "xTile.Pipeline.TBinReader" => {
            Ok(TypeReader::TBin)
        }
        "Microsoft.Xna.Framework.Content.ReflectiveReader" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 1 {
                return Err(format!("Reflective reader is missing subtype: {full}"));
            }
            build_reader_from_type_name(&subtypes[0])
        }
        "Microsoft.Xna.Framework.Content.EnumReader" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 1 {
                return Err(format!("Enum reader is missing subtype: {full}"));
            }
            build_reader_from_type_name(&subtypes[0])
        }
        "Microsoft.Xna.Framework.Content.NullableReader" | "System.Nullable" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 1 {
                return Err(format!("Nullable type is missing subtype: {full}"));
            }
            Ok(TypeReader::Nullable(Box::new(build_reader_from_type_name(
                &subtypes[0],
            )?)))
        }
        "Microsoft.Xna.Framework.Content.ListReader" | "System.Collections.Generic.List" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 1 {
                return Err(format!("List type is missing subtype: {full}"));
            }
            Ok(TypeReader::List(Box::new(build_reader_from_type_name(
                &subtypes[0],
            )?)))
        }
        "Microsoft.Xna.Framework.Content.ArrayReader" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 1 {
                return Err(format!("Array type is missing subtype: {full}"));
            }
            Ok(TypeReader::Array(Box::new(build_reader_from_type_name(
                &subtypes[0],
            )?)))
        }
        "Microsoft.Xna.Framework.Content.DictionaryReader"
        | "System.Collections.Generic.Dictionary" => {
            let subtypes = parse_generic_args(full)?;
            if subtypes.len() != 2 {
                return Err(format!("Dictionary type is missing subtypes: {full}"));
            }
            Ok(TypeReader::Dictionary(
                Box::new(build_reader_from_type_name(&subtypes[0])?),
                Box::new(build_reader_from_type_name(&subtypes[1])?),
            ))
        }
        _ if schema_registry().contains(&normalized_custom) => {
            Ok(TypeReader::Custom(normalized_custom))
        }
        _ => Err(format!(
            "Unsupported XNB reader type: {} ({full})",
            leading_type_name(full)
        )),
    }
}

fn normalize_custom_type_name(type_name: &str) -> String {
    type_name.trim().replace('+', "/")
}

fn leading_type_name(type_name: &str) -> &str {
    let trimmed = type_name.trim();
    let candidate = trimmed.split('<').next().unwrap_or(trimmed);
    let candidate = candidate.split('`').next().unwrap_or(candidate);
    candidate.split(',').next().unwrap_or(candidate).trim()
}

fn parse_generic_args(full: &str) -> Result<Vec<String>, String> {
    if full.contains("[[") {
        let values = parse_bracket_subtypes(full);
        if !values.is_empty() {
            return Ok(values);
        }
    }

    if full.contains('[') {
        let values = parse_single_bracket_subtypes(full);
        if !values.is_empty() {
            return Ok(values);
        }
    }

    if let Some(values) = parse_angle_subtypes(full) {
        return Ok(values);
    }

    if let Some(values) = parse_suffix_subtypes(full) {
        return Ok(values);
    }

    Err(format!("Generic type is missing subtypes: {full}"))
}

fn parse_bracket_subtypes(full: &str) -> Vec<String> {
    let mut subtypes = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();

    for ch in full.chars() {
        if ch == '[' {
            depth += 1;
            if depth == 2 {
                current.clear();
            } else if depth > 2 {
                current.push(ch);
            }
            continue;
        }
        if ch == ']' {
            if depth > 2 {
                current.push(ch);
            }
            if depth == 2 {
                if !current.is_empty() {
                    subtypes.push(current.trim().to_string());
                }
                current.clear();
            }
            depth = depth.saturating_sub(1);
            continue;
        }
        if depth >= 2 {
            current.push(ch);
        }
    }

    subtypes
}

#[cfg(test)]
#[path = "tests/readers_tests.rs"]
mod tests;

fn parse_angle_subtypes(full: &str) -> Option<Vec<String>> {
    let start = full.find('<')?;
    let end = full.rfind('>')?;
    if end <= start {
        return None;
    }

    let mut values = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();
    for ch in full[start + 1..end].chars() {
        match ch {
            '<' => {
                depth += 1;
                current.push(ch);
            }
            '>' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                values.push(current.trim().to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    if !current.trim().is_empty() {
        values.push(current.trim().to_string());
    }
    Some(values)
}

fn parse_single_bracket_subtypes(full: &str) -> Vec<String> {
    let start = match full.find('[') {
        Some(index) => index,
        None => return Vec::new(),
    };
    let end = match full.rfind(']') {
        Some(index) if index > start => index,
        _ => return Vec::new(),
    };
    let inner = full[start + 1..end]
        .trim()
        .trim_matches(&['[', ']'][..])
        .trim();
    if inner.is_empty() {
        return Vec::new();
    }

    if generic_arity(full) == Some(1) {
        return vec![inner.to_string()];
    }

    let mut values = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();
    for ch in inner.chars() {
        match ch {
            '[' => {
                depth += 1;
                current.push(ch);
            }
            ']' => {
                depth = depth.saturating_sub(1);
                current.push(ch);
            }
            ',' if depth == 0 => {
                values.push(current.trim().trim_matches(&['[', ']'][..]).to_string());
                current.clear();
            }
            _ => current.push(ch),
        }
    }

    if !current.trim().is_empty() {
        values.push(current.trim().trim_matches(&['[', ']'][..]).to_string());
    }

    values.retain(|value| !value.is_empty());
    values
}

fn parse_suffix_subtypes(full: &str) -> Option<Vec<String>> {
    let arity = generic_arity(full)?;
    if arity != 1 {
        return None;
    }

    let tick = full.find('`')?;
    let suffix = full[tick + 1 + arity.to_string().len()..].trim();
    if suffix.is_empty() {
        return None;
    }

    Some(vec![
        suffix.trim_matches(&['[', ']'][..]).trim().to_string(),
    ])
}

fn generic_arity(full: &str) -> Option<usize> {
    let tick = full.find('`')?;
    let digits: String = full[tick + 1..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

fn read_utf8_char(reader: &mut CursorReader) -> Result<String, String> {
    let first = reader.read_u8()?;
    let width = utf8_char_width(first);
    let mut bytes = Vec::with_capacity(width);
    bytes.push(first);
    if width > 1 {
        bytes.extend_from_slice(&reader.read_bytes(width - 1)?);
    }
    String::from_utf8(bytes)
        .map_err(|error| format!("Invalid UTF-8 character in XNB stream: {error}"))
}

fn utf8_char_width(first: u8) -> usize {
    match first {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        0xF0..=0xF7 => 4,
        _ => 1,
    }
}

fn decode_texture_data(
    format: i32,
    width: usize,
    height: usize,
    data: &[u8],
) -> Result<Vec<u8>, String> {
    let mut rgba = match format {
        0 => data.to_vec(),
        4 => decode_dxt1(data, width, height)?,
        5 => decode_dxt3(data, width, height)?,
        6 => decode_dxt5(data, width, height)?,
        2 => return Err("Texture2D format ECT1 is not supported.".to_string()),
        _ => return Err(format!("Unsupported Texture2D format ({format}).")),
    };

    unpremultiply_alpha(&mut rgba);
    Ok(rgba)
}

fn unpremultiply_alpha(rgba: &mut [u8]) {
    for chunk in rgba.chunks_exact_mut(4) {
        let alpha = chunk[3] as u32;
        if alpha == 0 {
            chunk[0] = 0;
            chunk[1] = 0;
            chunk[2] = 0;
            continue;
        }
        let factor = 255u32;
        chunk[0] = ((chunk[0] as u32 * factor) / alpha).min(255) as u8;
        chunk[1] = ((chunk[1] as u32 * factor) / alpha).min(255) as u8;
        chunk[2] = ((chunk[2] as u32 * factor) / alpha).min(255) as u8;
    }
}

fn decode_dxt1(data: &[u8], width: usize, height: usize) -> Result<Vec<u8>, String> {
    decode_dxt(data, width, height, DxtFormat::Dxt1)
}

fn decode_dxt3(data: &[u8], width: usize, height: usize) -> Result<Vec<u8>, String> {
    decode_dxt(data, width, height, DxtFormat::Dxt3)
}

fn decode_dxt5(data: &[u8], width: usize, height: usize) -> Result<Vec<u8>, String> {
    decode_dxt(data, width, height, DxtFormat::Dxt5)
}

enum DxtFormat {
    Dxt1,
    Dxt3,
    Dxt5,
}

fn decode_dxt(
    data: &[u8],
    width: usize,
    height: usize,
    format: DxtFormat,
) -> Result<Vec<u8>, String> {
    let block_bytes = match format {
        DxtFormat::Dxt1 => 8,
        DxtFormat::Dxt3 | DxtFormat::Dxt5 => 16,
    };
    let blocks_wide = (width + 3) / 4;
    let blocks_high = (height + 3) / 4;
    let expected = blocks_wide * blocks_high * block_bytes;
    if data.len() < expected {
        return Err("DXT buffer is smaller than expected.".to_string());
    }

    let mut output = vec![0u8; width * height * 4];
    let mut offset = 0usize;

    for by in 0..blocks_high {
        for bx in 0..blocks_wide {
            let (alpha_values, color_offset) = match format {
                DxtFormat::Dxt1 => (None, offset),
                DxtFormat::Dxt3 => {
                    let alpha = decode_dxt3_alpha(&data[offset..offset + 8]);
                    (Some(alpha), offset + 8)
                }
                DxtFormat::Dxt5 => {
                    let alpha = decode_dxt5_alpha(&data[offset..offset + 8]);
                    (Some(alpha), offset + 8)
                }
            };

            let colors = decode_dxt_colors(
                &data[color_offset..color_offset + 8],
                matches!(format, DxtFormat::Dxt1),
            );
            let indices = u32::from_le_bytes([
                data[color_offset + 4],
                data[color_offset + 5],
                data[color_offset + 6],
                data[color_offset + 7],
            ]);

            for py in 0..4 {
                for px in 0..4 {
                    let x = bx * 4 + px;
                    let y = by * 4 + py;
                    if x >= width || y >= height {
                        continue;
                    }
                    let index = ((indices >> (2 * (py * 4 + px))) & 0x03) as usize;
                    let color = colors[index];
                    let alpha = match &alpha_values {
                        Some(values) => values[py * 4 + px],
                        None => color[3],
                    };
                    let pixel_index = (y * width + x) * 4;
                    output[pixel_index] = color[0];
                    output[pixel_index + 1] = color[1];
                    output[pixel_index + 2] = color[2];
                    output[pixel_index + 3] = alpha;
                }
            }

            offset += block_bytes;
        }
    }

    Ok(output)
}

fn decode_dxt_colors(data: &[u8], use_dxt1_alpha: bool) -> [[u8; 4]; 4] {
    let c0 = u16::from_le_bytes([data[0], data[1]]);
    let c1 = u16::from_le_bytes([data[2], data[3]]);
    let color0 = rgb565_to_rgba(c0, 255);
    let color1 = rgb565_to_rgba(c1, 255);

    let mut colors = [[0u8; 4]; 4];
    colors[0] = color0;
    colors[1] = color1;

    if !use_dxt1_alpha || c0 > c1 {
        colors[2] = [
            ((2 * color0[0] as u16 + color1[0] as u16) / 3) as u8,
            ((2 * color0[1] as u16 + color1[1] as u16) / 3) as u8,
            ((2 * color0[2] as u16 + color1[2] as u16) / 3) as u8,
            255,
        ];
        colors[3] = [
            ((color0[0] as u16 + 2 * color1[0] as u16) / 3) as u8,
            ((color0[1] as u16 + 2 * color1[1] as u16) / 3) as u8,
            ((color0[2] as u16 + 2 * color1[2] as u16) / 3) as u8,
            255,
        ];
    } else {
        colors[2] = [
            ((color0[0] as u16 + color1[0] as u16) / 2) as u8,
            ((color0[1] as u16 + color1[1] as u16) / 2) as u8,
            ((color0[2] as u16 + color1[2] as u16) / 2) as u8,
            255,
        ];
        colors[3] = [0, 0, 0, 0];
    }

    colors
}

fn rgb565_to_rgba(value: u16, alpha: u8) -> [u8; 4] {
    let r = ((value >> 11) & 0x1f) as u32;
    let g = ((value >> 5) & 0x3f) as u32;
    let b = (value & 0x1f) as u32;
    [
        ((r * 255 + 15) / 31) as u8,
        ((g * 255 + 31) / 63) as u8,
        ((b * 255 + 15) / 31) as u8,
        alpha,
    ]
}

fn decode_dxt3_alpha(data: &[u8]) -> [u8; 16] {
    let mut alphas = [0u8; 16];
    let mut bit_index = 0usize;
    for byte in data {
        let lo = byte & 0x0F;
        let hi = (byte >> 4) & 0x0F;
        alphas[bit_index] = lo * 17;
        alphas[bit_index + 1] = hi * 17;
        bit_index += 2;
    }
    alphas
}

fn decode_dxt5_alpha(data: &[u8]) -> [u8; 16] {
    let alpha0 = data[0];
    let alpha1 = data[1];
    let mut codes = [0u8; 8];
    codes[0] = alpha0;
    codes[1] = alpha1;
    if alpha0 > alpha1 {
        for i in 2..8 {
            codes[i] =
                (((8 - i) as u16 * alpha0 as u16 + (i - 1) as u16 * alpha1 as u16) / 7) as u8;
        }
    } else {
        for i in 2..6 {
            codes[i] =
                (((6 - i) as u16 * alpha0 as u16 + (i - 1) as u16 * alpha1 as u16) / 5) as u8;
        }
        codes[6] = 0;
        codes[7] = 255;
    }

    let mut alpha_indices = [0u8; 16];
    let mut bits: u64 = 0;
    for i in 0..6 {
        bits |= (data[2 + i] as u64) << (8 * i);
    }
    for i in 0..16 {
        let index = ((bits >> (3 * i)) & 0x07) as usize;
        alpha_indices[i] = codes[index];
    }

    alpha_indices
}
