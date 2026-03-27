use base64::Engine;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::pathing::{clean_input_path, normalize_path};

#[derive(Debug, Clone, Copy)]
struct MiniWaveFormat {
    format_tag: u32,
    channels: u32,
    samples_per_sec: u32,
    block_align_raw: u32,
    bits_per_sample_flag: u32,
}

impl MiniWaveFormat {
    const TAG_PCM: u32 = 0x0;
    const TAG_XMA: u32 = 0x1;
    const TAG_ADPCM: u32 = 0x2;
    const TAG_WMA: u32 = 0x3;
    const ADPCM_BLOCKALIGN_CONVERSION_OFFSET: u32 = 22;

    fn from_packed(value: u32) -> Self {
        Self {
            format_tag: value & 0x3,
            channels: (value >> 2) & 0x7,
            samples_per_sec: (value >> 5) & 0x3ffff,
            block_align_raw: (value >> 23) & 0xff,
            bits_per_sample_flag: (value >> 31) & 0x1,
        }
    }

    fn bits_per_sample(&self) -> u16 {
        match self.format_tag {
            Self::TAG_XMA | Self::TAG_WMA => 16,
            Self::TAG_ADPCM => 4,
            _ => {
                if self.bits_per_sample_flag == 1 {
                    16
                } else {
                    8
                }
            }
        }
    }

    fn block_align(&self) -> u16 {
        match self.format_tag {
            Self::TAG_PCM => self.block_align_raw as u16,
            Self::TAG_XMA => ((self.channels * 16) / 8) as u16,
            Self::TAG_ADPCM => ((self.block_align_raw + Self::ADPCM_BLOCKALIGN_CONVERSION_OFFSET) * self.channels) as u16,
            Self::TAG_WMA => {
                const WMA_BLOCK_ALIGN: [u32; 17] = [
                    929, 1487, 1280, 2230, 8917, 8192, 4459, 5945, 2304, 1536, 1485, 1008, 2731, 4096, 6827, 5462, 1280,
                ];
                let index = (self.block_align_raw & 0x1f) as usize;
                if index < WMA_BLOCK_ALIGN.len() {
                    WMA_BLOCK_ALIGN[index] as u16
                } else {
                    0
                }
            }
            _ => 0,
        }
    }

    fn avg_bytes_per_sec(&self) -> u32 {
        match self.format_tag {
            Self::TAG_PCM => self.samples_per_sec * self.block_align_raw,
            Self::TAG_XMA => self.samples_per_sec * self.block_align() as u32,
            Self::TAG_ADPCM => {
                let block_align = self.block_align() as u32;
                let samples_per_block = self.adpcm_samples_per_block() as u32;
                if samples_per_block == 0 {
                    0
                } else {
                    block_align * self.samples_per_sec / samples_per_block
                }
            }
            Self::TAG_WMA => {
                const WMA_AVG_BYTES: [u32; 7] = [12000, 24000, 4000, 6000, 8000, 20000, 2500];
                let index = (self.block_align_raw >> 5) as usize;
                if index < WMA_AVG_BYTES.len() {
                    WMA_AVG_BYTES[index]
                } else {
                    0
                }
            }
            _ => 0,
        }
    }

    fn adpcm_samples_per_block(&self) -> u16 {
        let block_align = (self.block_align_raw + Self::ADPCM_BLOCKALIGN_CONVERSION_OFFSET) * self.channels;
        if self.channels == 0 {
            return 0;
        }
        let samples = block_align * 2 / self.channels;
        if samples >= 12 {
            (samples - 12) as u16
        } else {
            0
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct WaveBankSegment {
    offset: u32,
    length: u32,
}

#[derive(Debug)]
struct WaveBankInfo {
    flags: u32,
    entry_count: u32,
    entry_meta_size: u32,
    entry_name_size: u32,
    alignment: u32,
    compact_format: MiniWaveFormat,
}

#[derive(Debug, Clone, Copy)]
struct WaveBankEntry {
    format: MiniWaveFormat,
    play_offset: u32,
    play_length: u32,
    loop_start: u32,
    loop_length: u32,
    duration: u32,
}

#[derive(Debug)]
struct SoundEntry {
    index: usize,
    start: u32,
    length: u16,
    absolute_offset: usize,
}

#[derive(Debug)]
struct SoundOffsetMatch {
    wave_index: u16,
    wave_bank_index: u16,
}

#[derive(Debug)]
struct XsbHeader {
    num_simple_cues: u16,
    num_complex_cues: u16,
    num_total_cues: u16,
    num_wave_banks: u8,
    num_sounds: u16,
    cue_name_table_len: u32,
    simple_cues_offset: u32,
    complex_cues_offset: u32,
    cue_names_offset: u32,
    wave_bank_name_table_offset: u32,
    sounds_offset: u32,
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    if offset + 2 > bytes.len() {
        return Err("Unexpected end of buffer.".to_string());
    }
    Ok(u16::from_le_bytes([bytes[offset], bytes[offset + 1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    if offset + 4 > bytes.len() {
        return Err("Unexpected end of buffer.".to_string());
    }
    Ok(u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]))
}

fn read_exact_at(file: &mut fs::File, offset: u64, size: usize) -> Result<Vec<u8>, String> {
    let mut buffer = vec![0u8; size];
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek audio file: {error}"))?;
    file.read_exact(&mut buffer)
        .map_err(|error| format!("Failed to read audio file: {error}"))?;
    Ok(buffer)
}

fn parse_wave_bank_header(file: &mut fs::File) -> Result<(Vec<WaveBankSegment>, WaveBankInfo), String> {
    let header = read_exact_at(file, 0, 12)?;
    let magic = std::str::from_utf8(&header[0..4]).unwrap_or_default();
    if magic != "WBND" {
        return Err("Wave bank file does not start with WBND.".to_string());
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
        return Err("Wave bank segment table is empty.".to_string());
    }

    let bank_data = read_exact_at(file, segments[0].offset as u64, segments[0].length as usize)?;
    if bank_data.len() < 96 {
        return Err("Wave bank header data is incomplete.".to_string());
    }

    let flags = read_u32_le(&bank_data, 0)?;
    let entry_count = read_u32_le(&bank_data, 4)?;
    let entry_meta_size = read_u32_le(&bank_data, 72)?;
    let entry_name_size = read_u32_le(&bank_data, 76)?;
    let alignment = read_u32_le(&bank_data, 80)?;
    let compact_format = MiniWaveFormat::from_packed(read_u32_le(&bank_data, 84)?);

    Ok((
        segments,
        WaveBankInfo {
            flags,
            entry_count,
            entry_meta_size,
            entry_name_size,
            alignment,
            compact_format,
        },
    ))
}

fn read_wave_bank_entry(
    file: &mut fs::File,
    segments: &[WaveBankSegment],
    bank_info: &WaveBankInfo,
    entry_index: u32,
) -> Result<WaveBankEntry, String> {
    if entry_index >= bank_info.entry_count {
        return Err(format!("Wave index {entry_index} is out of range."));
    }

    const FLAGS_COMPACT: u32 = 0x00020000;
    if (bank_info.flags & FLAGS_COMPACT) != 0 {
        return Err("Compact wave banks are not supported yet.".to_string());
    }

    let entry_meta_offset = segments
        .get(1)
        .ok_or_else(|| "Wave bank entry metadata segment is missing.".to_string())?
        .offset as u64;
    let entry_size = bank_info.entry_meta_size as usize;
    if entry_size < 24 {
        return Err("Wave bank entry metadata size is invalid.".to_string());
    }

    let entry_bytes = read_exact_at(
        file,
        entry_meta_offset + (entry_index as u64 * entry_size as u64),
        24,
    )?;
    let flags_duration = read_u32_le(&entry_bytes, 0)?;
    let format = MiniWaveFormat::from_packed(read_u32_le(&entry_bytes, 4)?);
    let play_offset = read_u32_le(&entry_bytes, 8)?;
    let play_length = read_u32_le(&entry_bytes, 12)?;
    let loop_start = read_u32_le(&entry_bytes, 16)?;
    let loop_length = read_u32_le(&entry_bytes, 20)?;

    Ok(WaveBankEntry {
        format,
        play_offset,
        play_length,
        loop_start,
        loop_length,
        duration: flags_duration >> 4,
    })
}

fn build_wav_bytes(format: MiniWaveFormat, data: &[u8]) -> Result<Vec<u8>, String> {
    match format.format_tag {
        MiniWaveFormat::TAG_PCM | MiniWaveFormat::TAG_ADPCM => {}
        MiniWaveFormat::TAG_WMA => return Err("WMA audio is not supported for preview.".to_string()),
        MiniWaveFormat::TAG_XMA => return Err("XMA audio is not supported for preview.".to_string()),
        _ => return Err("Unsupported audio format tag.".to_string()),
    }

    let channels = format.channels as u16;
    let sample_rate = format.samples_per_sec as u32;
    let block_align = format.block_align();
    if block_align == 0 {
        return Err("Invalid block alignment for wave format.".to_string());
    }

    let bits_per_sample = format.bits_per_sample();
    let avg_bytes_per_sec = format.avg_bytes_per_sec();

    let mut fmt_chunk = Vec::new();
    if format.format_tag == MiniWaveFormat::TAG_PCM {
        fmt_chunk.extend_from_slice(&1u16.to_le_bytes());
        fmt_chunk.extend_from_slice(&channels.to_le_bytes());
        fmt_chunk.extend_from_slice(&sample_rate.to_le_bytes());
        fmt_chunk.extend_from_slice(&avg_bytes_per_sec.to_le_bytes());
        fmt_chunk.extend_from_slice(&block_align.to_le_bytes());
        fmt_chunk.extend_from_slice(&bits_per_sample.to_le_bytes());
    } else {
        let samples_per_block = format.adpcm_samples_per_block();
        fmt_chunk.extend_from_slice(&2u16.to_le_bytes());
        fmt_chunk.extend_from_slice(&channels.to_le_bytes());
        fmt_chunk.extend_from_slice(&sample_rate.to_le_bytes());
        fmt_chunk.extend_from_slice(&avg_bytes_per_sec.to_le_bytes());
        fmt_chunk.extend_from_slice(&block_align.to_le_bytes());
        fmt_chunk.extend_from_slice(&bits_per_sample.to_le_bytes());
        fmt_chunk.extend_from_slice(&(32u16).to_le_bytes());
        fmt_chunk.extend_from_slice(&samples_per_block.to_le_bytes());
        fmt_chunk.extend_from_slice(&(7u16).to_le_bytes());
        let coeffs: [(i16, i16); 7] = [
            (256, 0),
            (512, -256),
            (0, 0),
            (192, 64),
            (240, 0),
            (460, -208),
            (392, -232),
        ];
        for (c1, c2) in coeffs {
            fmt_chunk.extend_from_slice(&c1.to_le_bytes());
            fmt_chunk.extend_from_slice(&c2.to_le_bytes());
        }
    }

    let fmt_size = fmt_chunk.len() as u32;
    let data_size = data.len() as u32;
    let riff_size = 4 + (8 + fmt_size) + (8 + data_size);

    let mut wav = Vec::with_capacity((8 + riff_size) as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&riff_size.to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&fmt_size.to_le_bytes());
    wav.extend_from_slice(&fmt_chunk);
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());
    wav.extend_from_slice(data);

    Ok(wav)
}

fn parse_xsb_header(bytes: &[u8]) -> Result<XsbHeader, String> {
    if bytes.len() < 80 {
        return Err("Sound bank is too small.".to_string());
    }

    let magic = std::str::from_utf8(&bytes[0..4]).unwrap_or_default();
    if magic != "SDBK" {
        return Err("Sound bank file does not start with SDBK.".to_string());
    }

    let num_simple_cues = read_u16_le(bytes, 19)?;
    let num_complex_cues = read_u16_le(bytes, 21)?;
    let num_total_cues = read_u16_le(bytes, 25)?;
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
        num_total_cues,
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

fn read_xsb_cue_names(bytes: &[u8], header: &XsbHeader) -> Result<Vec<String>, String> {
    let offset = header.cue_names_offset as usize;
    let length = header.cue_name_table_len as usize;
    if offset + length > bytes.len() {
        return Err("Sound bank cue name table is out of range.".to_string());
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

fn read_xsb_wave_bank_names(bytes: &[u8], header: &XsbHeader) -> Result<Vec<String>, String> {
    let offset = header.wave_bank_name_table_offset as usize;
    let entry_size = 64usize;
    let total = header.num_wave_banks as usize;
    let end = offset + entry_size * total;
    if end > bytes.len() {
        return Err("Sound bank wave bank table is out of range.".to_string());
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

fn read_sound_entries(bytes: &[u8], header: &XsbHeader) -> Result<Vec<SoundEntry>, String> {
    let mut entries = Vec::with_capacity(header.num_sounds as usize);
    let mut offset = header.sounds_offset as usize;
    let base = offset;

    for index in 0..header.num_sounds as usize {
        if offset + 8 > bytes.len() {
            return Err("Sound entry table is out of range.".to_string());
        }
        let length = read_u16_le(bytes, offset + 7)?;
        if length == 0 {
            return Err("Sound entry length is zero.".to_string());
        }
        let length_usize = length as usize;
        if offset + length_usize > bytes.len() {
            return Err("Sound entry extends beyond file.".to_string());
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

fn find_sound_entry_for_simple_cue(
    bytes: &[u8],
    header: &XsbHeader,
    sound_entries: &[SoundEntry],
    cue_index: usize,
) -> Result<&SoundEntry, String> {
    if cue_index >= header.num_simple_cues as usize {
        return Err("Cue index is outside simple cue range.".to_string());
    }

    let entry_offset = header.simple_cues_offset as usize + cue_index * 5;
    if entry_offset + 5 > bytes.len() {
        return Err("Simple cue entry is out of range.".to_string());
    }

    let b1 = bytes[entry_offset + 1] as u32;
    let b2 = bytes[entry_offset + 2] as u32;
    let b3 = bytes[entry_offset + 3] as u32;
    let raw = read_u32_le(bytes, entry_offset + 1)?;

    let candidates = [
        (b1 << 16) | (b2 << 8) | b3,
        (b3 << 16) | (b2 << 8) | b1,
        raw & 0x00ff_ffff,
        raw >> 8,
        raw,
    ];

    let sound_table_len = header
        .simple_cues_offset
        .saturating_sub(header.sounds_offset) as u32;

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

    Err("Failed to locate sound entry for cue.".to_string())
}

fn parse_sound_entry_wave(
    xsb: &[u8],
    entry: &SoundEntry,
    wave_bank_counts: &[u32],
    best_offsets: &std::collections::HashMap<u16, usize>,
) -> Option<SoundOffsetMatch> {
    let length = entry.length;
    let best_offset = best_offsets.get(&length)?;
    let absolute = entry.absolute_offset + *best_offset;
    if absolute + 4 > xsb.len() {
        return None;
    }
    let wave_index = u16::from_le_bytes([xsb[absolute], xsb[absolute + 1]]);
    let wave_bank_index = u16::from_le_bytes([xsb[absolute + 2], xsb[absolute + 3]]);
    let bank_index = wave_bank_index as usize;
    if bank_index >= wave_bank_counts.len() {
        return None;
    }
    if wave_index as u32 >= wave_bank_counts[bank_index] {
        return None;
    }

    Some(SoundOffsetMatch { wave_index, wave_bank_index })
}

fn build_best_sound_offsets(
    xsb: &[u8],
    sound_entries: &[SoundEntry],
    wave_bank_counts: &[u32],
) -> std::collections::HashMap<u16, usize> {
    let mut stats: std::collections::HashMap<u16, std::collections::HashMap<usize, (u32, u32)>> =
        std::collections::HashMap::new();

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

    let mut best_offsets = std::collections::HashMap::new();
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

fn read_wave_bank_entry_count(path: &Path) -> Result<u32, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Failed to open wave bank {}: {error}", normalize_path(path)))?;
    let (_, bank_info) = parse_wave_bank_header(&mut file)?;
    Ok(bank_info.entry_count)
}

#[tauri::command]
pub fn load_xact_audio_data_url(root_path: String, cue: String) -> Result<String, String> {
    let root = clean_input_path(&root_path);
    let cue_name = cue.trim();
    if cue_name.is_empty() {
        return Err("Cue name is empty.".to_string());
    }

    let xact_root = root.join("Content").join("XACT");
    let xsb_path = xact_root.join("Sound Bank.xsb");
    if !xsb_path.exists() {
        return Err(format!(
            "Sound bank file does not exist: {}",
            normalize_path(&xsb_path)
        ));
    }

    let xsb = fs::read(&xsb_path)
        .map_err(|error| format!("Failed to read sound bank {}: {error}", normalize_path(&xsb_path)))?;
    let header = parse_xsb_header(&xsb)?;
    let cue_names = read_xsb_cue_names(&xsb, &header)?;

    let cue_index = cue_names
        .iter()
        .position(|name| name.eq_ignore_ascii_case(cue_name))
        .ok_or_else(|| format!("Cue not found in sound bank: {cue_name}"))?;

    if cue_index >= header.num_simple_cues as usize {
        return Err("Complex cues are not supported yet.".to_string());
    }

    let wave_bank_names = read_xsb_wave_bank_names(&xsb, &header)?;
    if wave_bank_names.is_empty() {
        return Err("No wave banks are listed in the sound bank.".to_string());
    }

    let mut wave_bank_paths = Vec::with_capacity(wave_bank_names.len());
    let mut wave_bank_counts = Vec::with_capacity(wave_bank_names.len());
    for name in &wave_bank_names {
        let path = xact_root.join(format!("{name}.xwb"));
        if !path.exists() {
            return Err(format!("Wave bank file does not exist: {}", normalize_path(&path)));
        }
        let entry_count = read_wave_bank_entry_count(&path)?;
        wave_bank_paths.push(path);
        wave_bank_counts.push(entry_count);
    }

    let sound_entries = read_sound_entries(&xsb, &header)?;
    let best_offsets = build_best_sound_offsets(&xsb, &sound_entries, &wave_bank_counts);
    let sound_entry = find_sound_entry_for_simple_cue(&xsb, &header, &sound_entries, cue_index)?;
    let sound_match =
        parse_sound_entry_wave(&xsb, sound_entry, &wave_bank_counts, &best_offsets).ok_or_else(|| {
            format!(
                "Cue {cue_name} did not resolve to a playable wave entry (sound index {}).",
                sound_entry.index
            )
        })?;

    let bank_index = sound_match.wave_bank_index as usize;
    let wave_index = sound_match.wave_index as u32;
    let wave_path = wave_bank_paths
        .get(bank_index)
        .ok_or_else(|| "Wave bank index is out of range.".to_string())?;

    let mut wave_file = fs::File::open(wave_path)
        .map_err(|error| format!("Failed to open wave bank {}: {error}", normalize_path(wave_path)))?;
    let (segments, bank_info) = parse_wave_bank_header(&mut wave_file)?;
    let entry = read_wave_bank_entry(&mut wave_file, &segments, &bank_info, wave_index)?;
    let wave_data_segment = segments
        .get(4)
        .ok_or_else(|| "Wave data segment is missing from the wave bank.".to_string())?;
    let data_offset = wave_data_segment.offset as u64 + entry.play_offset as u64;
    let data_length = entry.play_length as usize;
    let wave_data = read_exact_at(&mut wave_file, data_offset, data_length)?;
    let wav_bytes = build_wav_bytes(entry.format, &wave_data)?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(wav_bytes);
    Ok(format!("data:audio/wav;base64,{encoded}"))
}
