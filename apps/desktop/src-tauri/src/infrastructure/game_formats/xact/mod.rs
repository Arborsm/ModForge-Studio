pub(crate) mod commands;
mod io;
mod wav;
mod xsb;
mod xwb;

use base64::Engine;
use std::fs;

use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use anyhow::{Context, bail};
use io::read_exact_at;
use wav::build_wav_bytes;
use xsb::{
    build_best_sound_offsets, find_sound_match_for_cue, parse_xsb_header, read_sound_entries,
    read_xsb_cue_names, read_xsb_wave_bank_names,
};
use xwb::{parse_wave_bank_header, read_wave_bank_entries, read_wave_bank_entry_count};

pub fn scan_xact_cues(root_path: &str) -> anyhow::Result<Vec<String>> {
    let root = clean_input_path(root_path);
    let xsb_path = root.join("Content").join("XACT").join("Sound Bank.xsb");
    if !xsb_path.exists() {
        return Ok(Vec::new());
    }

    let xsb = fs::read(&xsb_path)
        .with_context(|| format!("Failed to read sound bank {}", normalize_path(&xsb_path)))?;
    let header = parse_xsb_header(&xsb)?;
    read_xsb_cue_names(&xsb, &header)
}

pub fn load_xact_audio_data_url(root_path: &str, cue: &str) -> anyhow::Result<String> {
    let root = clean_input_path(root_path);
    let cue_name = cue.trim();
    if cue_name.is_empty() {
        bail!("Cue name is empty.");
    }

    let xact_root = root.join("Content").join("XACT");
    let xsb_path = xact_root.join("Sound Bank.xsb");
    if !xsb_path.exists() {
        bail!(
            "Sound bank file does not exist: {}",
            normalize_path(&xsb_path)
        );
    }

    let xsb = fs::read(&xsb_path)
        .with_context(|| format!("Failed to read sound bank {}", normalize_path(&xsb_path)))?;
    let header = parse_xsb_header(&xsb)?;
    let cue_names = read_xsb_cue_names(&xsb, &header)?;

    let cue_index = cue_names
        .iter()
        .position(|name| name.eq_ignore_ascii_case(cue_name))
        .with_context(|| format!("Cue not found in sound bank: {cue_name}"))?;

    let wave_bank_names = read_xsb_wave_bank_names(&xsb, &header)?;
    if wave_bank_names.is_empty() {
        bail!("No wave banks are listed in the sound bank.");
    }

    let mut wave_bank_paths = Vec::with_capacity(wave_bank_names.len());
    let mut wave_bank_counts = Vec::with_capacity(wave_bank_names.len());
    for name in &wave_bank_names {
        let path = xact_root.join(format!("{name}.xwb"));
        if !path.exists() {
            bail!("Wave bank file does not exist: {}", normalize_path(&path));
        }
        let entry_count = read_wave_bank_entry_count(&path)?;
        wave_bank_paths.push(path);
        wave_bank_counts.push(entry_count);
    }

    let sound_entries = read_sound_entries(&xsb, &header)?;
    let best_offsets = build_best_sound_offsets(&xsb, &sound_entries, &wave_bank_counts);
    let sound_match = find_sound_match_for_cue(
        &xsb,
        &header,
        &sound_entries,
        cue_index,
        &wave_bank_counts,
        &best_offsets,
    )
    .with_context(|| format!("Cue {cue_name} did not resolve to a playable wave entry"))?;

    let bank_index = sound_match.wave_bank_index as usize;
    let wave_index = sound_match.wave_index as u32;
    let wave_path = wave_bank_paths
        .get(bank_index)
        .context("Wave bank index is out of range.")?;

    let mut wave_file = fs::File::open(wave_path)
        .with_context(|| format!("Failed to open wave bank {}", normalize_path(wave_path)))?;
    let (segments, bank_info) = parse_wave_bank_header(&mut wave_file)?;
    let entries = read_wave_bank_entries(&mut wave_file, &segments, &bank_info)?;
    let entry = entries
        .get(wave_index as usize)
        .with_context(|| format!("Wave index {wave_index} is out of range."))?;
    let wave_data_segment = segments
        .get(4)
        .context("Wave data segment is missing from the wave bank.")?;
    let data_offset = wave_data_segment.offset as u64 + entry.play_offset as u64;
    let data_length = entry.play_length as usize;
    if data_length == 0 {
        bail!("Wave entry has no playable data.");
    }
    let wave_data = read_exact_at(&mut wave_file, data_offset, data_length)?;
    let wav_bytes = build_wav_bytes(entry.format, &wave_data)?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(wav_bytes);
    Ok(format!("data:audio/wav;base64,{encoded}"))
}
