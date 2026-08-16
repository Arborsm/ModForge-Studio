use std::collections::HashMap;

use super::io::{read_u16_le, read_u32_le};
use anyhow::{Context, bail};

#[derive(Debug, Clone, Copy)]
pub(crate) struct SoundEntry {
    pub index: usize,
    pub start: u32,
    pub length: u16,
    pub absolute_offset: usize,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SoundOffsetMatch {
    pub wave_index: u16,
    pub wave_bank_index: u16,
}

#[derive(Debug, Clone, Copy)]
struct ComplexCueEntry {
    direct_sound: bool,
    payload_offset: usize,
}

fn validate_sound_match(
    sound_match: SoundOffsetMatch,
    wave_bank_counts: &[u32],
) -> Option<SoundOffsetMatch> {
    let bank_index = sound_match.wave_bank_index as usize;
    if bank_index >= wave_bank_counts.len() {
        return None;
    }
    if sound_match.wave_index as u32 >= wave_bank_counts[bank_index] {
        return None;
    }
    Some(sound_match)
}

fn parse_sound_entry_direct_wave(xsb: &[u8], entry: &SoundEntry) -> Option<SoundOffsetMatch> {
    let start = entry.absolute_offset;
    let end = start.checked_add(entry.length as usize)?;
    let data = xsb.get(start..end)?;
    if data.len() < 12 {
        return None;
    }

    let flags = data[0];
    let complex_sound = (flags & 0x01) != 0;
    let has_rpc = (flags & 0x0E) != 0;
    let has_reverb = (flags & 0x10) != 0;

    let mut cursor = 1usize;
    cursor += 2; // category id
    cursor += 1; // volume
    cursor += 2; // pitch
    cursor += 1; // priority
    cursor += 2; // filter / flags

    if complex_sound {
        return None;
    }

    let wave_index = read_u16_le(data, cursor).ok()?;
    cursor += 2;
    let wave_bank_index = *data.get(cursor)? as u16;
    cursor += 1;

    if has_rpc {
        let rpc_len = read_u16_le(data, cursor).ok()? as usize;
        if cursor.checked_add(rpc_len)? > data.len() {
            return None;
        }
        cursor += rpc_len;
    }

    if has_reverb && cursor.checked_add(7)? > data.len() {
        return None;
    }

    Some(SoundOffsetMatch {
        wave_index,
        wave_bank_index,
    })
}

fn parse_clip_event_wave(xsb: &[u8], event_offset: usize) -> Option<SoundOffsetMatch> {
    let event_count = *xsb.get(event_offset)? as usize;
    let mut cursor = event_offset.checked_add(1)?;

    for _ in 0..event_count {
        let packed = read_u32_le(xsb, cursor).ok()?;
        cursor += 4;
        cursor += 2; // random offset

        match (packed & 0x1f) as u8 {
            1 | 4 => {
                cursor += 2; // unknown bytes
                let wave_index = read_u16_le(xsb, cursor).ok()?;
                cursor += 2;
                let wave_bank_index = *xsb.get(cursor)? as u16;
                return Some(SoundOffsetMatch {
                    wave_index,
                    wave_bank_index,
                });
            }
            3 => {
                cursor += 7; // unknown bytes, loop count, variation bounds
                let variation_count = read_u16_le(xsb, cursor).ok()? as usize;
                cursor += 2;
                cursor += 1; // variation flags
                cursor += 5; // reserved
                let wave_index = read_u16_le(xsb, cursor).ok()?;
                cursor += 2;
                let wave_bank_index = *xsb.get(cursor)? as u16;
                if variation_count > 0 {
                    return Some(SoundOffsetMatch {
                        wave_index,
                        wave_bank_index,
                    });
                }
                return None;
            }
            6 => {
                cursor += 19; // loop / variation / filter fields
                let variation_count = read_u16_le(xsb, cursor).ok()? as usize;
                cursor += 2;
                cursor += 1; // variation flags
                cursor += 5; // reserved
                let wave_index = read_u16_le(xsb, cursor).ok()?;
                cursor += 2;
                let wave_bank_index = *xsb.get(cursor)? as u16;
                if variation_count > 0 {
                    return Some(SoundOffsetMatch {
                        wave_index,
                        wave_bank_index,
                    });
                }
                return None;
            }
            8 => {
                cursor += 12; // volume event payload
            }
            _ => return None,
        }
    }

    None
}

fn parse_sound_entry_complex_wave(xsb: &[u8], entry: &SoundEntry) -> Option<SoundOffsetMatch> {
    let start = entry.absolute_offset;
    let end = start.checked_add(entry.length as usize)?;
    let data = xsb.get(start..end)?;
    if data.len() < 10 {
        return None;
    }

    let flags = data[0];
    let complex_sound = (flags & 0x01) != 0;
    let has_rpc = (flags & 0x0E) != 0;
    let has_reverb = (flags & 0x10) != 0;
    if !complex_sound {
        return None;
    }

    let mut cursor = 1usize;
    cursor += 2; // category id
    cursor += 1; // volume
    cursor += 2; // pitch
    cursor += 1; // priority
    cursor += 2; // filter / flags

    let clip_count = *data.get(cursor)? as usize;
    cursor += 1;

    if has_rpc {
        let rpc_len = read_u16_le(data, cursor).ok()? as usize;
        if cursor.checked_add(rpc_len)? > data.len() {
            return None;
        }
        cursor += rpc_len;
    }

    if has_reverb {
        if cursor.checked_add(7)? > data.len() {
            return None;
        }
        cursor += 7;
    }

    for _ in 0..clip_count {
        if cursor.checked_add(9)? > data.len() {
            return None;
        }
        let event_offset = read_u32_le(data, cursor + 1).ok()? as usize;
        if let Some(sound_match) = parse_clip_event_wave(xsb, event_offset) {
            return Some(sound_match);
        }
        cursor += 9;
    }

    None
}

#[derive(Debug)]
pub(crate) struct XsbHeader {
    pub num_simple_cues: u16,
    pub num_complex_cues: u16,
    pub num_wave_banks: u8,
    pub num_sounds: u16,
    pub cue_name_table_len: u32,
    pub simple_cues_offset: u32,
    pub complex_cues_offset: u32,
    pub cue_names_offset: u32,
    pub wave_bank_name_table_offset: u32,
    pub sounds_offset: u32,
}

pub(crate) fn parse_xsb_header(bytes: &[u8]) -> anyhow::Result<XsbHeader> {
    if bytes.len() < 80 {
        bail!("Sound bank is too small.");
    }

    let magic = std::str::from_utf8(&bytes[0..4]).unwrap_or_default();
    if magic != "SDBK" {
        bail!("Sound bank file does not start with SDBK.");
    }

    let num_simple_cues = read_u16_le(bytes, 19)?;
    let num_complex_cues = read_u16_le(bytes, 21)?;
    read_u16_le(bytes, 25)?;
    let num_wave_banks = bytes[27];
    let num_sounds = read_u16_le(bytes, 28)?;
    let cue_name_table_len = read_u32_le(bytes, 30)?;
    let simple_cues_offset = read_u32_le(bytes, 34)?;
    let complex_cues_offset = read_u32_le(bytes, 38)?;
    let cue_names_offset = read_u32_le(bytes, 42)?;
    let wave_bank_name_table_offset = read_u32_le(bytes, 58)?;
    let sounds_offset = read_u32_le(bytes, 70)?;

    Ok(XsbHeader {
        num_simple_cues,
        num_complex_cues,
        num_wave_banks,
        num_sounds,
        cue_name_table_len,
        simple_cues_offset,
        complex_cues_offset,
        cue_names_offset,
        wave_bank_name_table_offset,
        sounds_offset,
    })
}

pub(crate) fn read_xsb_cue_names(bytes: &[u8], header: &XsbHeader) -> anyhow::Result<Vec<String>> {
    let offset = header.cue_names_offset as usize;
    let length = header.cue_name_table_len as usize;
    if offset + length > bytes.len() {
        bail!("Sound bank cue name table is out of range.");
    }

    let raw = &bytes[offset..offset + length];
    let text = String::from_utf8_lossy(raw);
    let names = text
        .split('\0')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect::<Vec<_>>();

    Ok(names)
}

pub(crate) fn read_xsb_wave_bank_names(
    bytes: &[u8],
    header: &XsbHeader,
) -> anyhow::Result<Vec<String>> {
    let offset = header.wave_bank_name_table_offset as usize;
    let entry_size = 64usize;
    let total = header.num_wave_banks as usize;
    let end = offset + entry_size * total;
    if end > bytes.len() {
        bail!("Sound bank wave bank table is out of range.");
    }

    let mut names = Vec::with_capacity(total);
    for index in 0..total {
        let start = offset + index * entry_size;
        let slice = &bytes[start..start + entry_size];
        let name = String::from_utf8_lossy(slice)
            .trim_end_matches('\0')
            .to_string();
        names.push(name);
    }

    Ok(names)
}

pub(crate) fn read_sound_entries(
    bytes: &[u8],
    header: &XsbHeader,
) -> anyhow::Result<Vec<SoundEntry>> {
    let mut entries = Vec::with_capacity(header.num_sounds as usize);
    let mut offset = header.sounds_offset as usize;
    let base = offset;

    for index in 0..header.num_sounds as usize {
        if offset + 8 > bytes.len() {
            bail!("Sound entry table is out of range.");
        }
        let length = read_u16_le(bytes, offset + 7)?;
        if length == 0 {
            bail!("Sound entry length is zero.");
        }
        let length_usize = length as usize;
        if offset + length_usize > bytes.len() {
            bail!("Sound entry extends beyond file.");
        }

        entries.push(SoundEntry {
            index,
            start: (offset - base) as u32,
            length,
            absolute_offset: offset,
        });

        offset += length_usize;
    }

    Ok(entries)
}

fn find_sound_entry_by_offset(sound_entries: &[SoundEntry], target: u32) -> Option<&SoundEntry> {
    let mut low = 0usize;
    let mut high = sound_entries.len();
    while low < high {
        let mid = (low + high) / 2;
        if sound_entries[mid].start <= target {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    if low == 0 {
        return None;
    }
    let entry = &sound_entries[low - 1];
    let end = entry.start + entry.length as u32;
    if target >= entry.start && target < end {
        Some(entry)
    } else {
        None
    }
}

fn find_sound_entry_by_absolute_offset(
    sound_entries: &[SoundEntry],
    target: usize,
) -> Option<&SoundEntry> {
    sound_entries
        .binary_search_by_key(&target, |entry| entry.absolute_offset)
        .ok()
        .and_then(|index| sound_entries.get(index))
}

fn parse_complex_cue_entry(
    bytes: &[u8],
    header: &XsbHeader,
    cue_index: usize,
) -> anyhow::Result<ComplexCueEntry> {
    let complex_index = cue_index
        .checked_sub(header.num_simple_cues as usize)
        .context("Cue index is not within the complex cue range.")?;
    if complex_index >= header.num_complex_cues as usize {
        bail!("Cue index is outside the complex cue range.");
    }

    let entry_offset = header.complex_cues_offset as usize + complex_index * 15;
    if entry_offset + 15 > bytes.len() {
        bail!("Complex cue entry is out of range.");
    }

    let flags = bytes[entry_offset];
    let payload_offset = read_u32_le(bytes, entry_offset + 1)? as usize;
    Ok(ComplexCueEntry {
        direct_sound: ((flags >> 2) & 0x01) != 0,
        payload_offset,
    })
}

fn parse_complex_variation_table(
    bytes: &[u8],
    payload_offset: usize,
    sound_entries: &[SoundEntry],
    wave_bank_counts: &[u32],
    best_offsets: &HashMap<u16, usize>,
) -> Option<SoundOffsetMatch> {
    let variation_count = read_u16_le(bytes, payload_offset).ok()? as usize;
    let variation_flags = read_u16_le(bytes, payload_offset + 2).ok()?;
    let variation_type = ((variation_flags >> 3) & 0x07) as u8;
    let mut cursor = payload_offset.checked_add(8)?;

    for _ in 0..variation_count {
        match variation_type {
            0 => {
                let wave_index = read_u16_le(bytes, cursor).ok()?;
                let wave_bank_index = *bytes.get(cursor + 2)? as u16;
                cursor += 5;
                if let Some(sound_match) = validate_sound_match(
                    SoundOffsetMatch {
                        wave_index,
                        wave_bank_index,
                    },
                    wave_bank_counts,
                ) {
                    return Some(sound_match);
                }
            }
            1 => {
                let sound_offset = read_u32_le(bytes, cursor).ok()? as usize;
                cursor += 6;
                if let Some(sound_entry) =
                    find_sound_entry_by_absolute_offset(sound_entries, sound_offset)
                {
                    if let Some(sound_match) =
                        parse_sound_entry_wave(bytes, sound_entry, wave_bank_counts, best_offsets)
                    {
                        return Some(sound_match);
                    }
                }
            }
            3 => {
                let sound_offset = read_u32_le(bytes, cursor).ok()? as usize;
                cursor += 16;
                if let Some(sound_entry) =
                    find_sound_entry_by_absolute_offset(sound_entries, sound_offset)
                {
                    if let Some(sound_match) =
                        parse_sound_entry_wave(bytes, sound_entry, wave_bank_counts, best_offsets)
                    {
                        return Some(sound_match);
                    }
                }
            }
            4 => {
                let wave_index = read_u16_le(bytes, cursor).ok()?;
                let wave_bank_index = *bytes.get(cursor + 2)? as u16;
                cursor += 3;
                if let Some(sound_match) = validate_sound_match(
                    SoundOffsetMatch {
                        wave_index,
                        wave_bank_index,
                    },
                    wave_bank_counts,
                ) {
                    return Some(sound_match);
                }
            }
            _ => return None,
        }
    }

    None
}

pub(crate) fn find_sound_entry_for_simple_cue<'a>(
    bytes: &'a [u8],
    header: &'a XsbHeader,
    sound_entries: &'a [SoundEntry],
    cue_index: usize,
) -> anyhow::Result<&'a SoundEntry> {
    if cue_index >= header.num_simple_cues as usize {
        bail!("Cue index is outside simple cue range.");
    }

    let entry_offset = header.simple_cues_offset as usize + cue_index * 5;
    if entry_offset + 5 > bytes.len() {
        bail!("Simple cue entry is out of range.");
    }

    let sound_offset = read_u32_le(bytes, entry_offset + 1)? as usize;
    if let Some(entry) = find_sound_entry_by_absolute_offset(sound_entries, sound_offset) {
        return Ok(entry);
    }

    let sound_offset = sound_offset as u32;
    let b1 = bytes[entry_offset + 1] as u32;
    let b2 = bytes[entry_offset + 2] as u32;
    let b3 = bytes[entry_offset + 3] as u32;
    let raw = sound_offset;

    let candidates = [
        (b1 << 16) | (b2 << 8) | b3,
        (b3 << 16) | (b2 << 8) | b1,
        raw & 0x00ff_ffff,
        raw >> 8,
        raw,
    ];

    let sound_table_len = header
        .simple_cues_offset
        .saturating_sub(header.sounds_offset);

    if sound_offset < sound_table_len {
        if let Some(entry) = find_sound_entry_by_offset(sound_entries, sound_offset) {
            return Ok(entry);
        }
    }

    for candidate in candidates {
        if candidate == 0xffff_ff {
            continue;
        }
        if candidate >= sound_table_len {
            continue;
        }
        if let Some(entry) = find_sound_entry_by_offset(sound_entries, candidate) {
            return Ok(entry);
        }
    }

    Err(anyhow::anyhow!("Failed to locate sound entry for cue."))
}

pub(crate) fn find_sound_match_for_cue(
    bytes: &[u8],
    header: &XsbHeader,
    sound_entries: &[SoundEntry],
    cue_index: usize,
    wave_bank_counts: &[u32],
    best_offsets: &HashMap<u16, usize>,
) -> anyhow::Result<SoundOffsetMatch> {
    if cue_index < header.num_simple_cues as usize {
        let sound_entry = find_sound_entry_for_simple_cue(bytes, header, sound_entries, cue_index)?;
        return parse_sound_entry_wave(bytes, sound_entry, wave_bank_counts, best_offsets)
            .with_context(|| {
                format!(
                    "Cue did not resolve to a playable wave entry (sound index {}).",
                    sound_entry.index
                )
            });
    }

    let entry = parse_complex_cue_entry(bytes, header, cue_index)?;
    if entry.direct_sound {
        let sound_entry = find_sound_entry_by_absolute_offset(sound_entries, entry.payload_offset)
            .context("Complex cue sound entry offset did not match a sound entry.")?;
        return parse_sound_entry_wave(bytes, sound_entry, wave_bank_counts, best_offsets)
            .with_context(|| {
                format!(
                    "Complex cue did not resolve to a playable wave entry (sound index {}).",
                    sound_entry.index
                )
            });
    }

    parse_complex_variation_table(
        bytes,
        entry.payload_offset,
        sound_entries,
        wave_bank_counts,
        best_offsets,
    )
    .context("Complex cue variation table did not resolve to a playable wave entry.")
}

pub(crate) fn parse_sound_entry_wave(
    xsb: &[u8],
    entry: &SoundEntry,
    wave_bank_counts: &[u32],
    best_offsets: &HashMap<u16, usize>,
) -> Option<SoundOffsetMatch> {
    if let Some(sound_match) = parse_sound_entry_direct_wave(xsb, entry) {
        if let Some(sound_match) = validate_sound_match(sound_match, wave_bank_counts) {
            return Some(sound_match);
        }
    }

    if let Some(sound_match) = parse_sound_entry_complex_wave(xsb, entry) {
        if let Some(sound_match) = validate_sound_match(sound_match, wave_bank_counts) {
            return Some(sound_match);
        }
    }

    let length = entry.length;
    let best_offset = best_offsets.get(&length)?;
    let absolute = entry.absolute_offset + *best_offset;
    if absolute + 4 > xsb.len() {
        return None;
    }
    let wave_index = u16::from_le_bytes([xsb[absolute], xsb[absolute + 1]]);
    let wave_bank_index = u16::from_le_bytes([xsb[absolute + 2], xsb[absolute + 3]]);
    validate_sound_match(
        SoundOffsetMatch {
            wave_index,
            wave_bank_index,
        },
        wave_bank_counts,
    )
}

pub(crate) fn build_best_sound_offsets(
    xsb: &[u8],
    sound_entries: &[SoundEntry],
    wave_bank_counts: &[u32],
) -> HashMap<u16, usize> {
    let mut stats: HashMap<u16, HashMap<usize, (u32, u32)>> = HashMap::new();

    for entry in sound_entries {
        let length = entry.length as usize;
        let data = &xsb[entry.absolute_offset..entry.absolute_offset + length];
        let mut rel = 0usize;
        while rel + 3 < data.len() {
            let wave = u16::from_le_bytes([data[rel], data[rel + 1]]);
            let bank = u16::from_le_bytes([data[rel + 2], data[rel + 3]]);
            let bank_index = bank as usize;
            if bank_index < wave_bank_counts.len() && (wave as u32) < wave_bank_counts[bank_index] {
                let entry_stats = stats.entry(entry.length).or_default();
                let slot = entry_stats.entry(rel).or_insert((0, 0));
                slot.0 += 1;
                if wave != 0 {
                    slot.1 += 1;
                }
            }
            rel += 2;
        }
    }

    let mut best_offsets = HashMap::new();
    for (length, options) in stats {
        let mut best_rel = None;
        let mut best_count = 0;
        let mut best_nonzero = 0;
        for (rel, (count, nonzero)) in options {
            if count > best_count || (count == best_count && nonzero > best_nonzero) {
                best_rel = Some(rel);
                best_count = count;
                best_nonzero = nonzero;
            }
        }
        if let Some(rel) = best_rel {
            best_offsets.insert(length, rel);
        }
    }

    best_offsets
}

#[cfg(all(test, not(feature = "installed-game-validation")))]
#[path = "../../../tests/unit/infrastructure/game_formats/xact/xsb_tests.rs"]
mod tests;
