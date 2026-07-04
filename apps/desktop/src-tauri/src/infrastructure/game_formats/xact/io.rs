use anyhow::{Context, bail};
use std::fs;
use std::io::{Read, Seek, SeekFrom};

pub fn read_u16_le(bytes: &[u8], offset: usize) -> anyhow::Result<u16> {
    if offset + 2 > bytes.len() {
        bail!("Unexpected end of buffer.");
    }
    Ok(u16::from_le_bytes([bytes[offset], bytes[offset + 1]]))
}

pub fn read_u32_le(bytes: &[u8], offset: usize) -> anyhow::Result<u32> {
    if offset + 4 > bytes.len() {
        bail!("Unexpected end of buffer.");
    }
    Ok(u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ]))
}

pub fn read_exact_at(file: &mut fs::File, offset: u64, size: usize) -> anyhow::Result<Vec<u8>> {
    let mut buffer = vec![0u8; size];
    file.seek(SeekFrom::Start(offset))
        .with_context(|| format!("Failed to seek audio file"))?;
    file.read_exact(&mut buffer)
        .with_context(|| format!("Failed to read audio file"))?;
    Ok(buffer)
}
