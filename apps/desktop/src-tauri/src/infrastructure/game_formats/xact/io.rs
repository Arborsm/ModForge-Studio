use std::fs;
use std::io::{Read, Seek, SeekFrom};

pub fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    if offset + 2 > bytes.len() {
        return Err("Unexpected end of buffer.".to_string());
    }
    Ok(u16::from_le_bytes([bytes[offset], bytes[offset + 1]]))
}

pub fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
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

pub fn read_exact_at(file: &mut fs::File, offset: u64, size: usize) -> Result<Vec<u8>, String> {
    let mut buffer = vec![0u8; size];
    file.seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Failed to seek audio file: {error}"))?;
    file.read_exact(&mut buffer)
        .map_err(|error| format!("Failed to read audio file: {error}"))?;
    Ok(buffer)
}
