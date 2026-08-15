mod buffer;
mod readers;
mod schema;
mod values;

use crate::infrastructure::fs::pathing::clean_input_path;
use std::path::Path;

use lz4_flex::block::decompress as lz4_decompress;
use lzxd::{Lzxd, WindowSize};

pub use readers::{ReaderResolver, build_readers};
pub use values::{TextureData, XnbValue};

use anyhow::{Context, bail};
use buffer::CursorReader;
const XNB_MAGIC: &str = "XNB";
const XNB_COMPRESSED_PROLOGUE_SIZE: usize = 14;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompressionKind {
    None,
    Lzx,
    Lz4,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TypeReaderInfo {
    pub name: String,
    pub version: i32,
}

#[derive(Debug, Clone)]
// `readers` is consumed by the installed-game-validation map_validation API,
// which is feature-gated, so the struct keeps the allow for default builds.
#[allow(dead_code)]
pub struct XnbFile {
    pub readers: Vec<TypeReaderInfo>,
    pub content: XnbValue,
}

pub fn read_xnb_from_path(path: &Path) -> anyhow::Result<XnbFile> {
    let resolved_path = clean_input_path(&path.to_string_lossy());
    let bytes = std::fs::read(&resolved_path)
        .with_context(|| format!("Failed to read XNB file {}", path.to_string_lossy()))?;
    read_xnb_from_bytes(bytes)
}

pub fn read_xnb_from_bytes(bytes: Vec<u8>) -> anyhow::Result<XnbFile> {
    if bytes.len() < 10 {
        bail!("XNB file is too small.");
    }

    let mut reader = CursorReader::new(bytes.clone());
    let magic = reader.read_string_exact(3)?;
    if magic != XNB_MAGIC {
        bail!("Invalid XNB header.");
    }

    reader.read_string_exact(1)?;
    reader.read_u8()?;
    let flags = reader.read_u8()?;

    let compressed = (flags & 0x80) != 0 || (flags & 0x40) != 0;
    let compression = if (flags & 0x80) != 0 {
        CompressionKind::Lzx
    } else if (flags & 0x40) != 0 {
        CompressionKind::Lz4
    } else {
        CompressionKind::None
    };

    reader.read_u32_le()?;

    let mut payload = bytes;
    let mut content_offset = 10usize;
    if compressed {
        let decompressed_size = reader.read_u32_le()? as usize;
        content_offset = XNB_COMPRESSED_PROLOGUE_SIZE;
        let compressed_bytes = reader.read_bytes(payload.len().saturating_sub(content_offset))?;
        let decompressed = match compression {
            CompressionKind::Lzx => {
                let mut lzx_reader = CursorReader::new(compressed_bytes);
                let mut decoder = Lzxd::new(WindowSize::KB64);
                let mut output = Vec::new();
                while lzx_reader.position() < lzx_reader.len() {
                    let flag = lzx_reader.read_u8()?;
                    let (frame_size, block_size) = if flag == 0xFF {
                        let frame_size = lzx_reader.read_lzx_int16()? as usize;
                        let block_size = lzx_reader.read_lzx_int16()? as usize;
                        (frame_size, block_size)
                    } else {
                        lzx_reader.set_position(lzx_reader.position().saturating_sub(1))?;
                        let block_size = lzx_reader.read_lzx_int16()? as usize;
                        (0x8000usize, block_size)
                    };

                    if block_size == 0 || frame_size == 0 {
                        break;
                    }

                    let chunk = lzx_reader.read_bytes(block_size)?;
                    let frame = decoder
                        .decompress_next(&chunk, frame_size)
                        .with_context(|| format!("Failed to decompress LZX payload"))?;
                    output.extend_from_slice(&frame);
                }

                if output.len() < decompressed_size {
                    bail!("LZX decompression returned fewer bytes than expected.");
                }
                output.truncate(decompressed_size);
                output
            }
            CompressionKind::Lz4 => lz4_decompress(&compressed_bytes, decompressed_size)
                .with_context(|| format!("Failed to decompress LZ4 payload"))?,
            CompressionKind::None => compressed_bytes,
        };

        let mut rebuilt = Vec::with_capacity(content_offset + decompressed.len());
        rebuilt.extend_from_slice(&payload[..content_offset]);
        rebuilt.extend_from_slice(&decompressed);
        payload = rebuilt;
    }

    let mut reader = CursorReader::new(payload).with_position(content_offset);
    let reader_count = reader.read_7bit_int()? as usize;
    let mut reader_infos = Vec::with_capacity(reader_count);
    let mut reader_names = Vec::with_capacity(reader_count);

    for _ in 0..reader_count {
        let type_name = reader.read_7bit_string()?;
        let version = reader.read_i32_le()?;
        reader_infos.push(TypeReaderInfo {
            name: type_name.clone(),
            version,
        });
        reader_names.push(type_name);
    }

    let shared_resources = reader.read_7bit_int()?;
    if shared_resources != 0 {
        bail!("Unexpected shared resource count: {shared_resources}");
    }

    let readers = build_readers(&reader_names)?;
    let resolver = ReaderResolver::new(readers);
    let content = resolver.read(&mut reader)?;

    Ok(XnbFile {
        readers: reader_infos,
        content,
    })
}
