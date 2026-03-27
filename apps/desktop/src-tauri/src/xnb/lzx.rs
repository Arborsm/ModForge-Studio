use super::buffer::CursorReader;

const MIN_MATCH: usize = 2;
const MAX_MATCH: usize = 257;
const NUM_CHARS: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BlockType {
    Invalid = 0,
    Verbatim = 1,
    Aligned = 2,
    Uncompressed = 3,
}

const PRETREE_NUM_ELEMENTS: usize = 20;
const ALIGNED_NUM_ELEMENTS: usize = 8;
const NUM_PRIMARY_LENGTHS: usize = 7;
const NUM_SECONDARY_LENGTHS: usize = 249;
const PRETREE_MAXSYMBOLS: usize = PRETREE_NUM_ELEMENTS;
const PRETREE_TABLEBITS: usize = 6;
const MAINTREE_MAXSYMBOLS: usize = NUM_CHARS + 50 * 8;
const MAINTREE_TABLEBITS: usize = 12;
const LENGTH_MAXSYMBOLS: usize = NUM_SECONDARY_LENGTHS + 1;
const LENGTH_TABLEBITS: usize = 12;
const ALIGNED_MAXSYMBOLS: usize = ALIGNED_NUM_ELEMENTS;
const ALIGNED_TABLEBITS: usize = 7;

pub struct LzxDecoder {
    window_size: usize,
    main_elements: usize,
    r0: usize,
    r1: usize,
    r2: usize,
    header_read: bool,
    block_remaining: i32,
    block_type: BlockType,
    window_posn: usize,
    pretree_table: Vec<u16>,
    pretree_len: Vec<u8>,
    aligned_table: Vec<u16>,
    aligned_len: Vec<u8>,
    length_table: Vec<u16>,
    length_len: Vec<u8>,
    maintree_table: Vec<u16>,
    maintree_len: Vec<u8>,
    win: Vec<u8>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LengthTableKind {
    Main,
    Length,
}

impl LzxDecoder {
    pub fn new(window_bits: u8) -> Result<Self, String> {
        if window_bits < 15 || window_bits > 21 {
            return Err("LZX window size out of range.".to_string());
        }

        let window_size = 1usize << window_bits;
        let posn_slots = if window_bits == 21 {
            50
        } else if window_bits == 20 {
            42
        } else {
            (window_bits as usize) << 1
        };

        let main_elements = NUM_CHARS + (posn_slots << 3);

        Ok(Self {
            window_size,
            main_elements,
            r0: 1,
            r1: 1,
            r2: 1,
            header_read: false,
            block_remaining: 0,
            block_type: BlockType::Invalid,
            window_posn: 0,
            pretree_table: vec![0; (1 << PRETREE_TABLEBITS) + (PRETREE_MAXSYMBOLS * 2)],
            pretree_len: vec![0; PRETREE_MAXSYMBOLS],
            aligned_table: vec![0; (1 << ALIGNED_TABLEBITS) + (ALIGNED_MAXSYMBOLS * 2)],
            aligned_len: vec![0; ALIGNED_MAXSYMBOLS],
            length_table: vec![0; (1 << LENGTH_TABLEBITS) + (LENGTH_MAXSYMBOLS * 2)],
            length_len: vec![0; LENGTH_MAXSYMBOLS],
            maintree_table: vec![0; (1 << MAINTREE_TABLEBITS) + (MAINTREE_MAXSYMBOLS * 2)],
            maintree_len: vec![0; MAINTREE_MAXSYMBOLS],
            win: vec![0; window_size],
        })
    }

    pub fn decompress(
        &mut self,
        buffer: &mut CursorReader,
        frame_size: usize,
        _block_size: usize,
    ) -> Result<Vec<u8>, String> {
        if !self.header_read {
            let intel = buffer.read_lzx_bits(1)?;
            if intel != 0 {
                return Err("Intel E8 call found in LZX stream.".to_string());
            }
            self.header_read = true;
        }

        let mut togo = frame_size as i32;

        while togo > 0 {
            if self.block_remaining == 0 {
                let block_type = buffer.read_lzx_bits(3)?;
                self.block_type = match block_type {
                    1 => BlockType::Verbatim,
                    2 => BlockType::Aligned,
                    3 => BlockType::Uncompressed,
                    _ => BlockType::Invalid,
                };

                let hi = buffer.read_lzx_bits(16)? as i32;
                let lo = buffer.read_lzx_bits(8)? as i32;
                self.block_remaining = (hi << 8) | lo;

                match self.block_type {
                    BlockType::Aligned => {
                        for i in 0..ALIGNED_NUM_ELEMENTS {
                            self.aligned_len[i] = buffer.read_lzx_bits(3)? as u8;
                        }
                        self.aligned_table = self.decode_table(ALIGNED_MAXSYMBOLS, ALIGNED_TABLEBITS, &self.aligned_len)?;
                        self.read_lengths(buffer, LengthTableKind::Main, 0, 256)?;
                        self.read_lengths(buffer, LengthTableKind::Main, 256, self.main_elements)?;
                        for i in self.main_elements..MAINTREE_MAXSYMBOLS {
                            self.maintree_len[i] = 0;
                        }
                        self.maintree_table =
                            self.decode_table(MAINTREE_MAXSYMBOLS, MAINTREE_TABLEBITS, &self.maintree_len)?;
                        self.read_lengths(buffer, LengthTableKind::Length, 0, NUM_SECONDARY_LENGTHS)?;
                        for i in NUM_SECONDARY_LENGTHS..LENGTH_MAXSYMBOLS {
                            self.length_len[i] = 0;
                        }
                        self.length_table =
                            self.decode_table(LENGTH_MAXSYMBOLS, LENGTH_TABLEBITS, &self.length_len)?;
                    }
                    BlockType::Verbatim => {
                        self.read_lengths(buffer, LengthTableKind::Main, 0, 256)?;
                        self.read_lengths(buffer, LengthTableKind::Main, 256, self.main_elements)?;
                        for i in self.main_elements..MAINTREE_MAXSYMBOLS {
                            self.maintree_len[i] = 0;
                        }
                        self.maintree_table =
                            self.decode_table(MAINTREE_MAXSYMBOLS, MAINTREE_TABLEBITS, &self.maintree_len)?;
                        self.read_lengths(buffer, LengthTableKind::Length, 0, NUM_SECONDARY_LENGTHS)?;
                        for i in NUM_SECONDARY_LENGTHS..LENGTH_MAXSYMBOLS {
                            self.length_len[i] = 0;
                        }
                        self.length_table =
                            self.decode_table(LENGTH_MAXSYMBOLS, LENGTH_TABLEBITS, &self.length_len)?;
                    }
                    BlockType::Uncompressed => {
                        buffer.align_lzx()?;
                        self.r0 = buffer.read_i32_le()? as usize;
                        self.r1 = buffer.read_i32_le()? as usize;
                        self.r2 = buffer.read_i32_le()? as usize;
                    }
                    BlockType::Invalid => {
                        return Err("Invalid LZX block type.".to_string());
                    }
                }
            }

            let mut this_run = self.block_remaining;
            while this_run > 0 && togo > 0 {
                let mut run = this_run;
                if run > togo {
                    run = togo;
                }

                togo -= run;
                self.block_remaining -= run;

                self.window_posn &= self.window_size - 1;
                if self.window_posn + run as usize > self.window_size {
                    return Err("LZX window overrun.".to_string());
                }

                match self.block_type {
                    BlockType::Aligned | BlockType::Verbatim => {
                        let aligned = self.block_type == BlockType::Aligned;
                        let mut run_remaining = run;
                        while run_remaining > 0 {
                            let mut main_element = self.read_huff_symbol(
                                buffer,
                                &self.maintree_table,
                                &self.maintree_len,
                                MAINTREE_MAXSYMBOLS,
                                MAINTREE_TABLEBITS,
                            )? as usize;
                            if main_element >= self.main_elements {
                                return Err("LZX main element out of range.".to_string());
                            }

                            if main_element < NUM_CHARS {
                                self.win[self.window_posn] = main_element as u8;
                                self.window_posn += 1;
                                run_remaining -= 1;
                                continue;
                            }

                            main_element -= NUM_CHARS;
                            let mut match_length = main_element & NUM_PRIMARY_LENGTHS;
                            if match_length == NUM_PRIMARY_LENGTHS {
                                let length_footer = self.read_huff_symbol(
                                    buffer,
                                    &self.length_table,
                                    &self.length_len,
                                    LENGTH_MAXSYMBOLS,
                                    LENGTH_TABLEBITS,
                                )? as usize;
                                match_length += length_footer;
                            }
                            match_length += MIN_MATCH;

                            let mut match_offset = main_element >> 3;

                            if match_offset > 2 {
                                let offset_slot = match_offset;
                                if offset_slot >= EXTRA_BITS.len() || offset_slot >= POSITION_BASE.len() {
                                    return Err("LZX match offset out of range.".to_string());
                                }
                                let mut extra = EXTRA_BITS[offset_slot];
                                match_offset = POSITION_BASE[offset_slot] - 2;
                                if aligned {
                                    if extra > 3 {
                                        extra -= 3;
                                        let verbatim_bits = buffer.read_lzx_bits(extra as u32)? as usize;
                                        match_offset += verbatim_bits << 3;
                                        let aligned_bits = self.read_huff_symbol(
                                            buffer,
                                            &self.aligned_table,
                                            &self.aligned_len,
                                            ALIGNED_MAXSYMBOLS,
                                            ALIGNED_TABLEBITS,
                                        )? as usize;
                                        match_offset += aligned_bits;
                                    } else if extra == 3 {
                                        let aligned_bits = self.read_huff_symbol(
                                            buffer,
                                            &self.aligned_table,
                                            &self.aligned_len,
                                            ALIGNED_MAXSYMBOLS,
                                            ALIGNED_TABLEBITS,
                                        )? as usize;
                                        match_offset += aligned_bits;
                                    } else if extra > 0 {
                                        match_offset += buffer.read_lzx_bits(extra as u32)? as usize;
                                    } else {
                                        match_offset = 1;
                                    }
                                } else if offset_slot != 3 {
                                    let verbatim_bits = buffer.read_lzx_bits(extra as u32)? as usize;
                                    match_offset = POSITION_BASE[offset_slot] - 2 + verbatim_bits;
                                } else {
                                    match_offset = 1;
                                }

                                self.r2 = self.r1;
                                self.r1 = self.r0;
                                self.r0 = match_offset;
                            } else if match_offset == 0 {
                                match_offset = self.r0;
                            } else if match_offset == 1 {
                                let temp = self.r1;
                                self.r1 = self.r0;
                                self.r0 = temp;
                                match_offset = self.r0;
                            } else {
                                let temp = self.r2;
                                self.r2 = self.r0;
                                self.r0 = temp;
                                match_offset = self.r0;
                            }

                            let mut runsrc;
                            let mut rundest = self.window_posn;
                            run_remaining -= match_length as i32;

                            if self.window_posn >= match_offset {
                                runsrc = rundest - match_offset;
                            } else {
                                runsrc = rundest + (self.window_size - match_offset);
                                let mut copy_length = match_offset - self.window_posn;
                                if copy_length < match_length {
                                    match_length -= copy_length;
                                    self.window_posn += copy_length;
                                    while copy_length > 0 {
                                        self.win[rundest] = self.win[runsrc];
                                        rundest += 1;
                                        runsrc += 1;
                                        copy_length -= 1;
                                    }
                                    runsrc = 0;
                                }
                            }

                            self.window_posn += match_length;
                            let mut remaining = match_length;
                            while remaining > 0 {
                                self.win[rundest] = self.win[runsrc];
                                rundest += 1;
                                runsrc += 1;
                                remaining -= 1;
                            }
                        }
                    }
                    BlockType::Uncompressed => {
                        for _ in 0..run {
                            let value = buffer.read_u8()? as u8;
                            self.win[self.window_posn] = value;
                            self.window_posn += 1;
                        }
                    }
                    BlockType::Invalid => {
                        return Err("Invalid LZX block type.".to_string());
                    }
                }

                this_run = self.block_remaining;
            }
        }

        if togo != 0 {
            return Err("LZX frame ended early.".to_string());
        }

        buffer.align_lzx()?;
        let start_window_pos = if self.window_posn == 0 {
            self.window_size - frame_size
        } else {
            self.window_posn - frame_size
        };
        Ok(self.win[start_window_pos..start_window_pos + frame_size].to_vec())
    }

    fn read_lengths(
        &mut self,
        buffer: &mut CursorReader,
        kind: LengthTableKind,
        first: usize,
        last: usize,
    ) -> Result<(), String> {
        for i in 0..PRETREE_NUM_ELEMENTS {
            self.pretree_len[i] = buffer.read_lzx_bits(4)? as u8;
        }

        self.pretree_table = self.decode_table(PRETREE_MAXSYMBOLS, PRETREE_TABLEBITS, &self.pretree_len)?;

        let mut i = first;
        while i < last {
            let mut symbol = self.read_huff_symbol(
                buffer,
                &self.pretree_table,
                &self.pretree_len,
                PRETREE_MAXSYMBOLS,
                PRETREE_TABLEBITS,
            )? as i32;

            if symbol == 17 {
                let zeros = buffer.read_lzx_bits(4)? as usize + 4;
                for _ in 0..zeros {
                    match kind {
                        LengthTableKind::Main => self.maintree_len[i] = 0,
                        LengthTableKind::Length => self.length_len[i] = 0,
                    }
                    i += 1;
                }
            } else if symbol == 18 {
                let zeros = buffer.read_lzx_bits(5)? as usize + 20;
                for _ in 0..zeros {
                    match kind {
                        LengthTableKind::Main => self.maintree_len[i] = 0,
                        LengthTableKind::Length => self.length_len[i] = 0,
                    }
                    i += 1;
                }
            } else if symbol == 19 {
                let same = buffer.read_lzx_bits(1)? as usize + 4;
                symbol = self.read_huff_symbol(
                    buffer,
                    &self.pretree_table,
                    &self.pretree_len,
                    PRETREE_MAXSYMBOLS,
                    PRETREE_TABLEBITS,
                )? as i32;
                let current_value = match kind {
                    LengthTableKind::Main => self.maintree_len[i],
                    LengthTableKind::Length => self.length_len[i],
                };
                let mut value = current_value as i32 - symbol;
                if value < 0 {
                    value += 17;
                }
                for _ in 0..same {
                    match kind {
                        LengthTableKind::Main => self.maintree_len[i] = value as u8,
                        LengthTableKind::Length => self.length_len[i] = value as u8,
                    }
                    i += 1;
                }
            } else {
                let current_value = match kind {
                    LengthTableKind::Main => self.maintree_len[i],
                    LengthTableKind::Length => self.length_len[i],
                };
                let mut value = current_value as i32 - symbol;
                if value < 0 {
                    value += 17;
                }
                match kind {
                    LengthTableKind::Main => self.maintree_len[i] = value as u8,
                    LengthTableKind::Length => self.length_len[i] = value as u8,
                }
                i += 1;
            }
        }

        Ok(())
    }

    fn decode_table(
        &self,
        symbols: usize,
        bits: usize,
        length: &[u8],
    ) -> Result<Vec<u16>, String> {
        let mut table = vec![0u16; (1 << bits) + (symbols * 2)];
        let mut pos = 0usize;
        let mut table_mask = 1usize << bits;
        let mut bit_mask = table_mask >> 1;

        for bit_num in 1..=bits {
            for symbol in 0..symbols {
                if length[symbol] as usize == bit_num {
                    let mut leaf = pos;
                    pos += bit_mask;
                    if pos > table_mask {
                        return Err("LZX decode table overrun.".to_string());
                    }
                    let mut fill = bit_mask;
                    while fill > 0 {
                        table[leaf] = symbol as u16;
                        leaf += 1;
                        fill -= 1;
                    }
                }
            }
            bit_mask >>= 1;
        }

        if pos == table_mask {
            return Ok(table);
        }

        for symbol in pos..table_mask {
            table[symbol] = 0xFFFF;
        }

        let mut next_symbol = if (table_mask >> 1) < symbols {
            symbols
        } else {
            table_mask >> 1
        };

        pos <<= 16;
        table_mask <<= 16;
        bit_mask = 1 << 15;

        for bit_num in (bits + 1)..=16 {
            for symbol in 0..symbols {
                if length[symbol] as usize != bit_num {
                    continue;
                }

                let mut leaf = pos >> 16;
                for fill in 0..(bit_num - bits) {
                    if table[leaf] == 0xFFFF {
                        let base = next_symbol << 1;
                        if base + 1 >= table.len() {
                            table.resize(base + 2, 0xFFFF);
                        }
                        table[base] = 0xFFFF;
                        table[base + 1] = 0xFFFF;
                        table[leaf] = next_symbol as u16;
                        next_symbol += 1;
                    }
                    leaf = (table[leaf] as usize) << 1;
                    if ((pos >> (15 - fill)) & 1) != 0 {
                        leaf += 1;
                    }
                }
                if leaf >= table.len() {
                    table.resize(leaf + 1, 0);
                }
                table[leaf] = symbol as u16;

                pos += bit_mask;
                if pos > table_mask {
                    return Err("LZX decode table overrun.".to_string());
                }
            }
            bit_mask >>= 1;
        }

        if pos == table_mask {
            Ok(table)
        } else {
            Err("LZX decode table did not reach table mask.".to_string())
        }
    }

    fn read_huff_symbol(
        &self,
        buffer: &mut CursorReader,
        table: &[u16],
        length: &[u8],
        symbols: usize,
        bits: usize,
    ) -> Result<u16, String> {
        let bit = buffer.peek_lzx_bits(32)? as u32;
        let mut i = table[buffer.peek_lzx_bits(bits as u32)? as usize] as usize;

        if i >= symbols {
            let mut j = 1u32 << (32 - bits);
            loop {
                j >>= 1;
                i <<= 1;
                i |= if (bit & j) != 0 { 1 } else { 0 };
                if j == 0 {
                    return Ok(0);
                }
                if i >= table.len() {
                    return Err("LZX huffman table overrun.".to_string());
                }
                i = table[i] as usize;
                if i < symbols {
                    break;
                }
            }
        }

        let advance = length[i] as i32;
        buffer.set_bit_position(buffer.bit_offset() as i32 + advance)?;
        Ok(i as u16)
    }
}

const EXTRA_BITS: [usize; 51] = [
    0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14,
    14, 15, 15, 16, 16, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17,
];

const POSITION_BASE: [usize; 51] = [
    0, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072,
    4096, 6144, 8192, 12288, 16384, 24576, 32768, 49152, 65536, 98304, 131072, 196608, 262144, 393216, 524288,
    655360, 786432, 917504, 1048576, 1179648, 1310720, 1441792, 1572864, 1703936, 1835008, 1966080, 2097152,
];
