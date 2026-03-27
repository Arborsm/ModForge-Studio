use std::str;

#[derive(Debug, Clone)]
pub struct CursorReader {
    data: Vec<u8>,
    pos: usize,
    bit_offset: u32,
}

impl CursorReader {
    pub fn new(data: Vec<u8>) -> Self {
        Self {
            data,
            pos: 0,
            bit_offset: 0,
        }
    }

    pub fn with_position(mut self, pos: usize) -> Self {
        self.pos = pos;
        self
    }

    pub fn position(&self) -> usize {
        self.pos
    }

    pub fn bit_offset(&self) -> u32 {
        self.bit_offset
    }

    pub fn set_position(&mut self, pos: usize) -> Result<(), String> {
        if pos > self.data.len() {
            return Err("Seek out of bounds.".to_string());
        }
        self.pos = pos;
        Ok(())
    }

    pub fn data(&self) -> &[u8] {
        &self.data
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn remaining(&self) -> usize {
        self.data.len().saturating_sub(self.pos)
    }

    pub fn read_bytes(&mut self, count: usize) -> Result<Vec<u8>, String> {
        if self.pos + count > self.data.len() {
            return Err("Unexpected end of buffer.".to_string());
        }
        let out = self.data[self.pos..self.pos + count].to_vec();
        self.pos += count;
        Ok(out)
    }

    pub fn read_u8(&mut self) -> Result<u8, String> {
        let bytes = self.read_bytes(1)?;
        Ok(bytes[0])
    }

    pub fn read_i8(&mut self) -> Result<i8, String> {
        Ok(self.read_u8()? as i8)
    }

    pub fn read_u16_le(&mut self) -> Result<u16, String> {
        let bytes = self.read_bytes(2)?;
        Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    pub fn read_i16_le(&mut self) -> Result<i16, String> {
        Ok(self.read_u16_le()? as i16)
    }

    pub fn read_u32_le(&mut self) -> Result<u32, String> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    pub fn read_i32_le(&mut self) -> Result<i32, String> {
        Ok(self.read_u32_le()? as i32)
    }

    pub fn read_f32_le(&mut self) -> Result<f32, String> {
        let bytes = self.read_bytes(4)?;
        Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    pub fn read_f64_le(&mut self) -> Result<f64, String> {
        let bytes = self.read_bytes(8)?;
        Ok(f64::from_le_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]))
    }

    pub fn read_string_exact(&mut self, count: usize) -> Result<String, String> {
        let bytes = self.read_bytes(count)?;
        let value = str::from_utf8(&bytes).map_err(|error| format!("Invalid UTF-8: {error}"))?;
        Ok(value.to_string())
    }

    pub fn read_7bit_int(&mut self) -> Result<u32, String> {
        let mut result: u32 = 0;
        let mut bits_read = 0;

        loop {
            let byte = self.read_u8()?;
            result |= ((byte & 0x7F) as u32) << bits_read;
            if (byte & 0x80) == 0 {
                break;
            }
            bits_read += 7;
            if bits_read > 35 {
                return Err("Invalid 7-bit encoded integer.".to_string());
            }
        }

        Ok(result)
    }

    pub fn read_7bit_string(&mut self) -> Result<String, String> {
        let length = self.read_7bit_int()? as usize;
        self.read_string_exact(length)
    }

    pub fn read_lzx_bits(&mut self, bits: u32) -> Result<u32, String> {
        let mut bits_left = bits as i32;
        let mut read: u32 = 0;

        while bits_left > 0 {
            let peek = self.peek_u16_le()?;
            let bits_in_frame = std::cmp::min(bits_left, 16 - self.bit_offset as i32);
            let offset = 16 - self.bit_offset as i32 - bits_in_frame;
            let mask = ((1u32 << bits_in_frame) - 1) << offset;
            let value = ((peek as u32) & mask) >> offset;

            bits_left -= bits_in_frame;
            self.set_bit_position(self.bit_offset as i32 + bits_in_frame)?;
            read |= value << bits_left;
        }

        Ok(read)
    }

    pub fn peek_lzx_bits(&mut self, bits: u32) -> Result<u32, String> {
        let bit_pos = self.bit_offset;
        let byte_pos = self.pos;
        let read = self.read_lzx_bits(bits)?;
        self.bit_offset = bit_pos;
        self.pos = byte_pos;
        Ok(read)
    }

    pub fn read_lzx_int16(&mut self) -> Result<u16, String> {
        let ls_b = self.read_u8()? as u16;
        let ms_b = self.read_u8()? as u16;
        Ok((ls_b << 8) | ms_b)
    }

    pub fn align_lzx(&mut self) -> Result<(), String> {
        if self.bit_offset > 0 {
            self.set_bit_position(self.bit_offset as i32 + (16 - self.bit_offset as i32))?;
        }
        Ok(())
    }

    fn peek_u16_le(&mut self) -> Result<u16, String> {
        if self.pos + 2 > self.data.len() {
            return Err("Unexpected end of buffer.".to_string());
        }
        Ok(u16::from_le_bytes([self.data[self.pos], self.data[self.pos + 1]]))
    }

    pub fn set_bit_position(&mut self, offset: i32) -> Result<(), String> {
        let mut adjusted = offset;
        if adjusted < 0 {
            adjusted = 16 - adjusted;
        }
        self.bit_offset = (adjusted as u32) % 16;
        let byte_seek = ((adjusted - (adjusted.abs() % 16)) / 16) * 2;
        if byte_seek != 0 {
            let new_pos = (self.pos as i32 + byte_seek) as i64;
            if new_pos < 0 {
                return Err("Seek out of bounds.".to_string());
            }
            self.pos = new_pos as usize;
            if self.pos > self.data.len() {
                return Err("Seek out of bounds.".to_string());
            }
        }
        Ok(())
    }
}
