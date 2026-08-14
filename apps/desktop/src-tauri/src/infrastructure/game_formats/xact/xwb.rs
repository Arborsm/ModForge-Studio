use std::fs;
use std::path::Path;

use crate::infrastructure::fs::pathing::normalize_path;

use super::io::{read_exact_at, read_u32_le};
use super::wav::MiniWaveFormat;
use anyhow::{Context, bail};

#[derive(Debug, Clone, Copy)]
pub(crate) struct WaveBankSegment {
    pub offset: u32,
    pub length: u32,
}

#[derive(Debug)]
pub(crate) struct WaveBankInfo {
    pub flags: u32,
    pub entry_count: u32,
    pub entry_meta_size: u32,
    pub alignment: u32,
    pub compact_format: MiniWaveFormat,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct WaveBankEntry {
    pub format: MiniWaveFormat,
    pub play_offset: u32,
    pub play_length: u32,
}

pub(crate) fn parse_wave_bank_header(
    file: &mut fs::File,
) -> anyhow::Result<(Vec<WaveBankSegment>, WaveBankInfo)> {
    let header = read_exact_at(file, 0, 12)?;
    let magic = std::str::from_utf8(&header[0..4]).unwrap_or_default();
    if magic != "WBND" {
        bail!("Wave bank file does not start with WBND.");
    }
    let _tool_version = read_u32_le(&header, 4)?;
    let _file_version = read_u32_le(&header, 8)?;

    let mut segments = Vec::with_capacity(5);
    for i in 0..5 {
        let offset = 12 + i * 8;
        let segment = read_exact_at(file, offset as u64, 8)?;
        let seg_offset = read_u32_le(&segment, 0)?;
        let seg_length = read_u32_le(&segment, 4)?;
        segments.push(WaveBankSegment {
            offset: seg_offset,
            length: seg_length,
        });
    }

    if segments.is_empty() {
        bail!("Wave bank segment table is empty.");
    }

    let bank_data = read_exact_at(file, segments[0].offset as u64, segments[0].length as usize)?;
    if bank_data.len() < 96 {
        bail!("Wave bank header data is incomplete.");
    }

    let flags = read_u32_le(&bank_data, 0)?;
    let entry_count = read_u32_le(&bank_data, 4)?;
    let entry_meta_size = read_u32_le(&bank_data, 72)?;
    read_u32_le(&bank_data, 76)?;
    let alignment = read_u32_le(&bank_data, 80)?;
    let compact_format = MiniWaveFormat::from_packed(read_u32_le(&bank_data, 84)?);

    Ok((
        segments,
        WaveBankInfo {
            flags,
            entry_count,
            entry_meta_size,
            alignment,
            compact_format,
        },
    ))
}

pub(crate) fn read_wave_bank_entries(
    file: &mut fs::File,
    segments: &[WaveBankSegment],
    bank_info: &WaveBankInfo,
) -> anyhow::Result<Vec<WaveBankEntry>> {
    if bank_info.entry_count == 0 {
        return Ok(Vec::new());
    }

    const FLAGS_COMPACT: u32 = 0x00020000;
    let entry_meta_offset = segments
        .get(1)
        .context("Wave bank entry metadata segment is missing.")?
        .offset as u64;
    let entry_size = bank_info.entry_meta_size as usize;
    let entry_count = bank_info.entry_count as usize;

    if (bank_info.flags & FLAGS_COMPACT) != 0 {
        if entry_size < 4 {
            bail!("Compact wave bank entry size is invalid.");
        }
        let total_bytes = entry_size
            .checked_mul(entry_count)
            .context("Wave bank entry table is too large.")?;
        let table = read_exact_at(file, entry_meta_offset, total_bytes)?;

        let mut offsets = Vec::with_capacity(entry_count);
        let mut deviations = Vec::with_capacity(entry_count);
        for index in 0..entry_count {
            let base = index * entry_size;
            let value = read_u32_le(&table, base)?;
            let compact_offset = value & 0x1f_ffff;
            let length_deviation = (value >> 21) & 0x7ff;
            offsets.push(compact_offset.saturating_mul(bank_info.alignment));
            deviations.push(length_deviation);
        }

        let wave_data_segment = segments
            .get(4)
            .context("Wave data segment is missing from the wave bank.")?;
        let mut entries = Vec::with_capacity(entry_count);
        for index in 0..entry_count {
            let play_offset = offsets[index];
            let next_offset = offsets
                .get(index + 1)
                .copied()
                .unwrap_or(wave_data_segment.length);
            let play_length = next_offset
                .saturating_sub(play_offset)
                .saturating_sub(deviations[index]);

            entries.push(WaveBankEntry {
                format: bank_info.compact_format,
                play_offset,
                play_length,
            });
        }

        return Ok(entries);
    }

    if entry_size < 24 {
        bail!("Wave bank entry metadata size is invalid.");
    }

    let total_bytes = entry_size
        .checked_mul(entry_count)
        .context("Wave bank entry table is too large.")?;
    let table = read_exact_at(file, entry_meta_offset, total_bytes)?;
    let mut entries = Vec::with_capacity(entry_count);

    for index in 0..entry_count {
        let base = index * entry_size;
        read_u32_le(&table, base)?;
        let format = MiniWaveFormat::from_packed(read_u32_le(&table, base + 4)?);
        let play_offset = read_u32_le(&table, base + 8)?;
        let play_length = read_u32_le(&table, base + 12)?;
        read_u32_le(&table, base + 16)?;
        read_u32_le(&table, base + 20)?;

        entries.push(WaveBankEntry {
            format,
            play_offset,
            play_length,
        });
    }

    Ok(entries)
}

pub(crate) fn read_wave_bank_entry_count(path: &Path) -> anyhow::Result<u32> {
    let mut file = fs::File::open(path)
        .with_context(|| format!("Failed to open wave bank {}", normalize_path(path)))?;
    let (_, bank_info) = parse_wave_bank_header(&mut file)?;
    Ok(bank_info.entry_count)
}
