use std::str;

#[derive(Debug, Clone)]
pub struct CursorReader {
    data: Vec<u8>,
    pos: usize,
}

impl CursorReader {
    pub fn new(data: Vec<u8>) -> Self {
        Self { data, pos: 0 }
    }

    pub fn with_position(mut self, pos: usize) -> Self {
        self.pos = pos;
        self
    }

    pub fn position(&self) -> usize {
        self.pos
    }

    pub fn set_position(&mut self, pos: usize) -> Result<(), String> {
        if pos > self.data.len() {
            return Err("Seek out of bounds.".to_string());
        }
        self.pos = pos;
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.data.len()
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

    pub fn read_lzx_int16(&mut self) -> Result<u16, String> {
        let ls_b = self.read_u8()? as u16;
        let ms_b = self.read_u8()? as u16;
        Ok((ls_b << 8) | ms_b)
    }
}
