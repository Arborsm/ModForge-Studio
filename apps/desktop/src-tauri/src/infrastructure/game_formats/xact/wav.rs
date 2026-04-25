#[derive(Debug, Clone, Copy)]
pub(crate) struct MiniWaveFormat {
    pub format_tag: u32,
    pub channels: u32,
    pub samples_per_sec: u32,
    block_align_raw: u32,
    bits_per_sample_flag: u32,
}

impl MiniWaveFormat {
    pub const TAG_PCM: u32 = 0x0;
    pub const TAG_XMA: u32 = 0x1;
    pub const TAG_ADPCM: u32 = 0x2;
    pub const TAG_WMA: u32 = 0x3;
    const ADPCM_BLOCKALIGN_CONVERSION_OFFSET: u32 = 22;

    pub fn from_packed(value: u32) -> Self {
        Self {
            format_tag: value & 0x3,
            channels: (value >> 2) & 0x7,
            samples_per_sec: (value >> 5) & 0x3ffff,
            block_align_raw: (value >> 23) & 0xff,
            bits_per_sample_flag: (value >> 31) & 0x1,
        }
    }

    pub fn bits_per_sample(&self) -> u16 {
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

    pub fn block_align(&self) -> u16 {
        match self.format_tag {
            Self::TAG_PCM => self.block_align_raw as u16,
            Self::TAG_XMA => ((self.channels * 16) / 8) as u16,
            Self::TAG_ADPCM => {
                ((self.block_align_raw + Self::ADPCM_BLOCKALIGN_CONVERSION_OFFSET) * self.channels)
                    as u16
            }
            Self::TAG_WMA => {
                const WMA_BLOCK_ALIGN: [u32; 17] = [
                    929, 1487, 1280, 2230, 8917, 8192, 4459, 5945, 2304, 1536, 1485, 1008, 2731,
                    4096, 6827, 5462, 1280,
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

    pub fn adpcm_samples_per_block(&self) -> u16 {
        let block_align =
            (self.block_align_raw + Self::ADPCM_BLOCKALIGN_CONVERSION_OFFSET) * self.channels;
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

fn build_pcm_wav_bytes(
    channels: u16,
    sample_rate: u32,
    bits_per_sample: u16,
    data: &[u8],
) -> Vec<u8> {
    let block_align = channels.saturating_mul(bits_per_sample / 8);
    let avg_bytes_per_sec = sample_rate.saturating_mul(block_align as u32);

    let mut fmt_chunk = Vec::new();
    fmt_chunk.extend_from_slice(&1u16.to_le_bytes());
    fmt_chunk.extend_from_slice(&channels.to_le_bytes());
    fmt_chunk.extend_from_slice(&sample_rate.to_le_bytes());
    fmt_chunk.extend_from_slice(&avg_bytes_per_sec.to_le_bytes());
    fmt_chunk.extend_from_slice(&block_align.to_le_bytes());
    fmt_chunk.extend_from_slice(&bits_per_sample.to_le_bytes());

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

    wav
}

fn decode_ms_adpcm(
    data: &[u8],
    channels: usize,
    block_align: usize,
    samples_per_block: usize,
) -> Result<Vec<i16>, String> {
    if channels == 0 {
        return Err("ADPCM channel count is zero.".to_string());
    }
    if block_align == 0 {
        return Err("ADPCM block alignment is zero.".to_string());
    }
    if samples_per_block < 2 {
        return Err("ADPCM samples per block is invalid.".to_string());
    }

    const COEFFS: [(i16, i16); 7] = [
        (256, 0),
        (512, -256),
        (0, 0),
        (192, 64),
        (240, 0),
        (460, -208),
        (392, -232),
    ];
    const ADAPTATION: [i16; 16] = [
        230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230,
    ];

    #[derive(Clone, Copy)]
    struct ChannelState {
        predictor: usize,
        delta: i32,
        sample1: i32,
        sample2: i32,
    }

    let mut output = Vec::with_capacity(data.len().saturating_mul(2));
    let mut offset = 0usize;

    while offset + block_align <= data.len() {
        let block = &data[offset..offset + block_align];
        let mut cursor = 0usize;
        let header_len = channels
            .checked_mul(7)
            .ok_or_else(|| "ADPCM block header is too large.".to_string())?;
        if cursor + header_len > block.len() {
            return Err("ADPCM block header is incomplete.".to_string());
        }

        let mut predictors = Vec::with_capacity(channels);
        for _ in 0..channels {
            predictors.push(block[cursor] as usize);
            cursor += 1;
        }

        let mut deltas = Vec::with_capacity(channels);
        for _ in 0..channels {
            let delta = i16::from_le_bytes([block[cursor], block[cursor + 1]]) as i32;
            deltas.push(delta.max(16));
            cursor += 2;
        }

        let mut sample1s = Vec::with_capacity(channels);
        for _ in 0..channels {
            let sample1 = i16::from_le_bytes([block[cursor], block[cursor + 1]]) as i32;
            sample1s.push(sample1);
            cursor += 2;
        }

        let mut sample2s = Vec::with_capacity(channels);
        for _ in 0..channels {
            let sample2 = i16::from_le_bytes([block[cursor], block[cursor + 1]]) as i32;
            sample2s.push(sample2);
            cursor += 2;
        }

        let mut states = Vec::with_capacity(channels);
        for channel in 0..channels {
            let predictor = predictors[channel];
            if predictor >= COEFFS.len() {
                return Err("ADPCM predictor index is out of range.".to_string());
            }

            states.push(ChannelState {
                predictor,
                delta: deltas[channel],
                sample1: sample1s[channel],
                sample2: sample2s[channel],
            });
        }

        for state in &states {
            output.push(state.sample2.clamp(i16::MIN as i32, i16::MAX as i32) as i16);
        }
        for state in &states {
            output.push(state.sample1.clamp(i16::MIN as i32, i16::MAX as i32) as i16);
        }

        let mut nibble_index = 0usize;
        let mut byte_index = cursor;
        let frames = samples_per_block - 2;

        for _ in 0..frames {
            for state in states.iter_mut() {
                if byte_index >= block.len() {
                    return Ok(output);
                }
                let byte = block[byte_index];
                let nibble = if nibble_index == 0 {
                    byte >> 4
                } else {
                    byte & 0x0f
                };
                nibble_index ^= 1;
                if nibble_index == 0 {
                    byte_index += 1;
                }

                let signed = if nibble >= 8 {
                    (nibble as i8) - 16
                } else {
                    nibble as i8
                } as i32;
                let (c1, c2) = COEFFS[state.predictor];
                let predicted = (state.sample1 * c1 as i32 + state.sample2 * c2 as i32) / 256;
                let mut sample = predicted + signed * state.delta;
                sample = sample.clamp(i16::MIN as i32, i16::MAX as i32);

                state.sample2 = state.sample1;
                state.sample1 = sample;
                let mut next_delta = (ADAPTATION[nibble as usize] as i32 * state.delta) / 256;
                if next_delta < 16 {
                    next_delta = 16;
                }
                state.delta = next_delta;

                output.push(sample as i16);
            }
        }

        offset += block_align;
    }

    Ok(output)
}

pub(crate) fn build_wav_bytes(format: MiniWaveFormat, data: &[u8]) -> Result<Vec<u8>, String> {
    match format.format_tag {
        MiniWaveFormat::TAG_PCM => {
            let channels = format.channels as u16;
            let sample_rate = format.samples_per_sec as u32;
            let bits_per_sample = format.bits_per_sample();
            Ok(build_pcm_wav_bytes(
                channels,
                sample_rate,
                bits_per_sample,
                data,
            ))
        }
        MiniWaveFormat::TAG_ADPCM => {
            let channels = format.channels as usize;
            let sample_rate = format.samples_per_sec as u32;
            let block_align = format.block_align() as usize;
            if block_align == 0 {
                return Err("Invalid ADPCM block alignment.".to_string());
            }
            let samples_per_block = format.adpcm_samples_per_block() as usize;
            let decoded = decode_ms_adpcm(data, channels, block_align, samples_per_block)?;
            let mut pcm_bytes = Vec::with_capacity(decoded.len().saturating_mul(2));
            for sample in decoded {
                pcm_bytes.extend_from_slice(&sample.to_le_bytes());
            }
            Ok(build_pcm_wav_bytes(
                channels as u16,
                sample_rate,
                16,
                &pcm_bytes,
            ))
        }
        MiniWaveFormat::TAG_WMA => Err("WMA audio is not supported for preview.".to_string()),
        MiniWaveFormat::TAG_XMA => Err("XMA audio is not supported for preview.".to_string()),
        _ => Err("Unsupported audio format tag.".to_string()),
    }
}
