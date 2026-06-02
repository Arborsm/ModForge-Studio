use super::{
    SoundEntry, find_sound_match_for_cue, parse_clip_event_wave, parse_complex_cue_entry,
    parse_sound_entry_complex_wave, parse_sound_entry_direct_wave, parse_xsb_header,
    read_sound_entries,
};
use std::collections::HashMap;

#[test]
fn parses_direct_simple_sound_wave_reference() {
    let bytes = vec![
        0x00, 0x03, 0x00, 0xB4, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x14, 0x00, 0x00,
    ];
    let entry = SoundEntry {
        index: 0,
        start: 0,
        length: bytes.len() as u16,
        absolute_offset: 0,
    };

    let parsed =
        parse_sound_entry_direct_wave(&bytes, &entry).expect("expected direct simple sound parse");
    assert_eq!(parsed.wave_index, 20);
    assert_eq!(parsed.wave_bank_index, 0);
}

#[test]
fn parses_complex_sound_play_wave_event_type_4() {
    let bytes = vec![
        0x01, 0x03, 0x00, 0x76, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x01, 0xb4, 0x13, 0x00, 0x00, 0x00,
        0xc0, 0x5d, 0xe8, 0x03, 0x01, 0x04, 0x00, 0x00, 0x20, 0x00, 0x00, 0xff, 0x0c, 0x09, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1e, 0xfe, 0xa0, 0x01, 0x97, 0xd6, 0x00, 0x00, 0x7a,
        0x44, 0x00, 0x00, 0x7a, 0x44, 0x00, 0x00, 0xf0, 0x41, 0x00, 0x00, 0xf0, 0x41, 0x00, 0x10,
    ];
    let entry = SoundEntry {
        index: 0,
        start: 0,
        length: bytes.len() as u16,
        absolute_offset: 0,
    };

    let parsed =
        parse_sound_entry_complex_wave(&bytes, &entry).expect("expected complex sound parse");
    assert_eq!(parsed.wave_index, 9);
    assert_eq!(parsed.wave_bank_index, 0);
}

#[test]
fn parses_complex_sound_play_wave_event_type_4_with_rpc() {
    let bytes = vec![
        0x03, 0x03, 0x00, 0xbc, 0xa8, 0xfd, 0x00, 0x43, 0x00, 0x01, 0x07, 0x00, 0x01, 0x66, 0x01,
        0x00, 0x00, 0xb4, 0x1a, 0x00, 0x00, 0x00, 0xc0, 0x5d, 0xe8, 0x03, 0x01, 0x04, 0x00, 0x00,
        0x20, 0x00, 0x00, 0xff, 0x0c, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x24, 0xff,
        0x23, 0x02, 0xd0, 0xff, 0x00, 0x00, 0x7a, 0x44, 0x00, 0x00, 0x7a, 0x44, 0x00, 0x00, 0xf0,
        0x41, 0x00, 0x00, 0xf0, 0x41, 0x00, 0x30,
    ];
    let entry = SoundEntry {
        index: 0,
        start: 0,
        length: bytes.len() as u16,
        absolute_offset: 0,
    };

    let parsed =
        parse_sound_entry_complex_wave(&bytes, &entry).expect("expected rpc complex sound parse");
    assert_eq!(parsed.wave_index, 15);
    assert_eq!(parsed.wave_bank_index, 0);
}

#[test]
fn parses_clip_event_type_1_wave_reference() {
    let bytes = vec![
        0x01, 0x01, 0x00, 0x00, 0x20, 0x00, 0x00, 0xff, 0x0c, 0x2c, 0x00, 0x00, 0xff, 0x00, 0x00,
        0x00,
    ];
    let parsed = parse_clip_event_wave(&bytes, 0).expect("expected play-wave clip event parse");
    assert_eq!(parsed.wave_index, 44);
    assert_eq!(parsed.wave_bank_index, 0);
}

#[test]
fn parses_complex_cue_entry_direct_sound_flag() {
    let mut bytes = vec![0u8; 95];
    bytes[0..4].copy_from_slice(b"SDBK");
    bytes[19..21].copy_from_slice(&1u16.to_le_bytes());
    bytes[21..23].copy_from_slice(&1u16.to_le_bytes());
    bytes[25..27].copy_from_slice(&2u16.to_le_bytes());
    bytes[38..42].copy_from_slice(&80u32.to_le_bytes());
    bytes[80] = 0x05;
    bytes[81..85].copy_from_slice(&422u32.to_le_bytes());

    let header = parse_xsb_header(&bytes).expect("expected xsb header");
    let entry = parse_complex_cue_entry(&bytes, &header, 1).expect("expected complex cue entry");
    assert!(entry.direct_sound);
    assert_eq!(entry.payload_offset, 422);
}

#[test]
fn resolves_complex_cue_variation_mode_1_to_first_valid_sound() {
    let mut bytes = vec![0u8; 220];
    bytes[0..4].copy_from_slice(b"SDBK");
    bytes[19..21].copy_from_slice(&1u16.to_le_bytes());
    bytes[21..23].copy_from_slice(&1u16.to_le_bytes());
    bytes[25..27].copy_from_slice(&2u16.to_le_bytes());
    bytes[28..30].copy_from_slice(&1u16.to_le_bytes());
    bytes[34..38].copy_from_slice(&80u32.to_le_bytes());
    bytes[38..42].copy_from_slice(&85u32.to_le_bytes());
    bytes[70..74].copy_from_slice(&120u32.to_le_bytes());

    bytes[85] = 0x01;
    bytes[86..90].copy_from_slice(&100u32.to_le_bytes());
    bytes[90..94].copy_from_slice(&u32::MAX.to_le_bytes());

    bytes[100..102].copy_from_slice(&2u16.to_le_bytes());
    bytes[102..104].copy_from_slice(&0x000b_u16.to_le_bytes());
    bytes[120..132].copy_from_slice(&[
        0x00, 0x03, 0x00, 0xB4, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x14, 0x00, 0x00,
    ]);
    bytes[108..112].copy_from_slice(&120u32.to_le_bytes());
    bytes[114..118].copy_from_slice(&120u32.to_le_bytes());

    let header = parse_xsb_header(&bytes).expect("expected xsb header");
    let sound_entries = read_sound_entries(&bytes, &header).expect("expected sound entries");
    let resolved =
        find_sound_match_for_cue(&bytes, &header, &sound_entries, 1, &[512], &HashMap::new())
            .expect("expected complex cue wave resolution");
    assert_eq!(resolved.wave_index, 20);
    assert_eq!(resolved.wave_bank_index, 0);
}
