#[path = "xact/io.rs"]
mod io;
#[path = "xact/wav.rs"]
mod wav;
#[path = "xact/xsb.rs"]
mod xsb;
#[path = "xact/xwb.rs"]
mod xwb;

use base64::Engine;
use std::fs;

use crate::infrastructure::fs::pathing::{clean_input_path, normalize_path};
use io::read_exact_at;
use wav::build_wav_bytes;
use xsb::{
    build_best_sound_offsets, find_sound_match_for_cue, parse_xsb_header, read_sound_entries,
    read_xsb_cue_names, read_xsb_wave_bank_names,
};
use xwb::{parse_wave_bank_header, read_wave_bank_entries, read_wave_bank_entry_count};

#[allow(dead_code)]
pub fn load_xact_audio_data_url(root_path: String, cue: String) -> Result<String, String> {
    load_xact_audio_data_url_for_paths(&root_path, &cue)
}

pub fn load_xact_audio_data_url_for_paths(root_path: &str, cue: &str) -> Result<String, String> {
    let root = clean_input_path(root_path);
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

    let xsb = fs::read(&xsb_path).map_err(|error| {
        format!(
            "Failed to read sound bank {}: {error}",
            normalize_path(&xsb_path)
        )
    })?;
    let header = parse_xsb_header(&xsb)?;
    let cue_names = read_xsb_cue_names(&xsb, &header)?;

    let cue_index = cue_names
        .iter()
        .position(|name| name.eq_ignore_ascii_case(cue_name))
        .ok_or_else(|| format!("Cue not found in sound bank: {cue_name}"))?;

    let wave_bank_names = read_xsb_wave_bank_names(&xsb, &header)?;
    if wave_bank_names.is_empty() {
        return Err("No wave banks are listed in the sound bank.".to_string());
    }

    let mut wave_bank_paths = Vec::with_capacity(wave_bank_names.len());
    let mut wave_bank_counts = Vec::with_capacity(wave_bank_names.len());
    for name in &wave_bank_names {
        let path = xact_root.join(format!("{name}.xwb"));
        if !path.exists() {
            return Err(format!(
                "Wave bank file does not exist: {}",
                normalize_path(&path)
            ));
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
    .map_err(|error| format!("Cue {cue_name} did not resolve to a playable wave entry: {error}"))?;

    let bank_index = sound_match.wave_bank_index as usize;
    let wave_index = sound_match.wave_index as u32;
    let wave_path = wave_bank_paths
        .get(bank_index)
        .ok_or_else(|| "Wave bank index is out of range.".to_string())?;

    let mut wave_file = fs::File::open(wave_path).map_err(|error| {
        format!(
            "Failed to open wave bank {}: {error}",
            normalize_path(wave_path)
        )
    })?;
    let (segments, bank_info) = parse_wave_bank_header(&mut wave_file)?;
    let entries = read_wave_bank_entries(&mut wave_file, &segments, &bank_info)?;
    let entry = entries
        .get(wave_index as usize)
        .ok_or_else(|| format!("Wave index {wave_index} is out of range."))?;
    let wave_data_segment = segments
        .get(4)
        .ok_or_else(|| "Wave data segment is missing from the wave bank.".to_string())?;
    let data_offset = wave_data_segment.offset as u64 + entry.play_offset as u64;
    let data_length = entry.play_length as usize;
    if data_length == 0 {
        return Err("Wave entry has no playable data.".to_string());
    }
    let wave_data = read_exact_at(&mut wave_file, data_offset, data_length)?;
    let wav_bytes = build_wav_bytes(entry.format, &wave_data)?;

    let encoded = base64::engine::general_purpose::STANDARD.encode(wav_bytes);
    Ok(format!("data:audio/wav;base64,{encoded}"))
}
