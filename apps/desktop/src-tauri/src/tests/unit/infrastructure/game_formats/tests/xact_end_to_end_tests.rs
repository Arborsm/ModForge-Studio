use crate::infrastructure::game_formats::xact::load_xact_audio_data_url_for_paths;
use std::fs;

fn write_u16_le(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn write_u32_le(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn packed_pcm_format() -> u32 {
    let format_tag = 0u32;
    let channels = 1u32;
    let samples_per_sec = 8_000u32;
    let block_align = 1u32;
    let bits_per_sample_16 = 0u32;

    format_tag
        | (channels << 2)
        | (samples_per_sec << 5)
        | (block_align << 23)
        | (bits_per_sample_16 << 31)
}

fn minimal_sound_bank_bytes() -> Vec<u8> {
    const SOUNDS_OFFSET: usize = 80;
    const SIMPLE_CUES_OFFSET: usize = 92;
    const CUE_NAMES_OFFSET: usize = 97;
    const WAVE_BANK_NAMES_OFFSET: usize = 106;
    const CUE_NAME: &[u8] = b"tinyCue\0";
    const WAVE_BANK_NAME: &[u8] = b"TinyBank";

    let mut bytes = vec![0u8; WAVE_BANK_NAMES_OFFSET + 64];
    bytes[0..4].copy_from_slice(b"SDBK");
    write_u16_le(&mut bytes, 19, 1);
    write_u16_le(&mut bytes, 21, 0);
    write_u16_le(&mut bytes, 25, 1);
    bytes[27] = 1;
    write_u16_le(&mut bytes, 28, 1);
    write_u32_le(&mut bytes, 30, CUE_NAME.len() as u32);
    write_u32_le(&mut bytes, 34, SIMPLE_CUES_OFFSET as u32);
    write_u32_le(&mut bytes, 38, 0);
    write_u32_le(&mut bytes, 42, CUE_NAMES_OFFSET as u32);
    write_u32_le(&mut bytes, 58, WAVE_BANK_NAMES_OFFSET as u32);
    write_u32_le(&mut bytes, 70, SOUNDS_OFFSET as u32);

    bytes[SOUNDS_OFFSET..SOUNDS_OFFSET + 12].copy_from_slice(&[
        0x00, // direct simple sound flags
        0x03, 0x00, // category id
        0xB4, // volume
        0x00, 0x00, // pitch
        0x00, // priority
        0x0C, 0x00, // filter / flags
        0x00, 0x00, // wave index
        0x00, // wave bank index
    ]);

    bytes[SIMPLE_CUES_OFFSET] = 0;
    write_u32_le(&mut bytes, SIMPLE_CUES_OFFSET + 1, SOUNDS_OFFSET as u32);
    bytes[CUE_NAMES_OFFSET..CUE_NAMES_OFFSET + CUE_NAME.len()].copy_from_slice(CUE_NAME);
    bytes[WAVE_BANK_NAMES_OFFSET..WAVE_BANK_NAMES_OFFSET + WAVE_BANK_NAME.len()]
        .copy_from_slice(WAVE_BANK_NAME);

    bytes
}

fn minimal_wave_bank_bytes() -> Vec<u8> {
    const HEADER_SEGMENT_OFFSET: usize = 52;
    const ENTRY_METADATA_OFFSET: usize = 148;
    const WAVE_DATA_OFFSET: usize = 172;
    const WAVE_DATA: &[u8] = &[0x80, 0x90, 0x70, 0x80];

    let mut bytes = vec![0u8; WAVE_DATA_OFFSET + WAVE_DATA.len()];
    bytes[0..4].copy_from_slice(b"WBND");
    write_u32_le(&mut bytes, 4, 44);
    write_u32_le(&mut bytes, 8, 46);

    write_u32_le(&mut bytes, 12, HEADER_SEGMENT_OFFSET as u32);
    write_u32_le(&mut bytes, 16, 96);
    write_u32_le(&mut bytes, 20, ENTRY_METADATA_OFFSET as u32);
    write_u32_le(&mut bytes, 24, 24);
    write_u32_le(&mut bytes, 28, 0);
    write_u32_le(&mut bytes, 32, 0);
    write_u32_le(&mut bytes, 36, 0);
    write_u32_le(&mut bytes, 40, 0);
    write_u32_le(&mut bytes, 44, WAVE_DATA_OFFSET as u32);
    write_u32_le(&mut bytes, 48, WAVE_DATA.len() as u32);

    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET, 0);
    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET + 4, 1);
    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET + 72, 24);
    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET + 76, 0);
    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET + 80, 1);
    write_u32_le(&mut bytes, HEADER_SEGMENT_OFFSET + 84, packed_pcm_format());

    write_u32_le(
        &mut bytes,
        ENTRY_METADATA_OFFSET,
        WAVE_DATA.len() as u32 * 8,
    );
    write_u32_le(&mut bytes, ENTRY_METADATA_OFFSET + 4, packed_pcm_format());
    write_u32_le(&mut bytes, ENTRY_METADATA_OFFSET + 8, 0);
    write_u32_le(
        &mut bytes,
        ENTRY_METADATA_OFFSET + 12,
        WAVE_DATA.len() as u32,
    );
    write_u32_le(&mut bytes, ENTRY_METADATA_OFFSET + 16, 0);
    write_u32_le(&mut bytes, ENTRY_METADATA_OFFSET + 20, 0);

    bytes[WAVE_DATA_OFFSET..WAVE_DATA_OFFSET + WAVE_DATA.len()].copy_from_slice(WAVE_DATA);
    bytes
}

#[test]
fn loads_self_contained_xact_fixture_as_wav_data_url() {
    let root = std::env::temp_dir().join("modforge-xact-self-contained-fixture");
    let xact_root = root.join("Content").join("XACT");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&xact_root).expect("create xact fixture directory");
    fs::write(xact_root.join("Sound Bank.xsb"), minimal_sound_bank_bytes())
        .expect("write sound bank");
    fs::write(xact_root.join("TinyBank.xwb"), minimal_wave_bank_bytes()).expect("write wave bank");

    let data_url = load_xact_audio_data_url_for_paths(root.to_string_lossy().as_ref(), "tinyCue")
        .expect("load minimal xact cue");

    assert!(data_url.starts_with("data:audio/wav;base64,"));
    let encoded = data_url
        .strip_prefix("data:audio/wav;base64,")
        .expect("wav data url prefix");
    let decoded = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .expect("decode wav bytes");
    let expected_wav = [
        b'R', b'I', b'F', b'F', 40, 0, 0, 0, b'W', b'A', b'V', b'E', b'f', b'm', b't', b' ', 16, 0,
        0, 0, 1, 0, 1, 0, 0x40, 0x1f, 0, 0, 0x40, 0x1f, 0, 0, 1, 0, 8, 0, b'd', b'a', b't', b'a',
        4, 0, 0, 0, 0x80, 0x90, 0x70, 0x80,
    ];
    assert_eq!(decoded, expected_wav);

    let error = load_xact_audio_data_url_for_paths(root.to_string_lossy().as_ref(), "missingCue")
        .expect_err("unknown cue should fail");
    assert!(error.to_string().contains("missingCue"));

    fs::remove_dir_all(root).expect("cleanup");
}
