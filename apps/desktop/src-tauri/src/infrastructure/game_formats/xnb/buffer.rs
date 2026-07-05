use anyhow::{Context, bail};
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

    pub fn set_position(&mut self, pos: usize) -> anyhow::Result<()> {
        if pos > self.data.len() {
            bail!("Seek out of bounds.");
        }
        self.pos = pos;
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn read_bytes(&mut self, count: usize) -> anyhow::Result<Vec<u8>> {
        if self.pos + count > self.data.len() {
            bail!("Unexpected end of buffer.");
        }
        let out = self.data[self.pos..self.pos + count].to_vec();
        self.pos += count;
        Ok(out)
    }

    pub fn read_u8(&mut self) -> anyhow::Result<u8> {
        let bytes = self.read_bytes(1)?;
        Ok(bytes[0])
    }

    pub fn read_i8(&mut self) -> anyhow::Result<i8> {
        Ok(self.read_u8()? as i8)
    }

    pub fn read_u16_le(&mut self) -> anyhow::Result<u16> {
        let bytes = self.read_bytes(2)?;
        Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
    }

    pub fn read_i16_le(&mut self) -> anyhow::Result<i16> {
        Ok(self.read_u16_le()? as i16)
    }

    pub fn read_u32_le(&mut self) -> anyhow::Result<u32> {
        let bytes = self.read_bytes(4)?;
        Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    pub fn read_i32_le(&mut self) -> anyhow::Result<i32> {
        Ok(self.read_u32_le()? as i32)
    }

    pub fn read_f32_le(&mut self) -> anyhow::Result<f32> {
        let bytes = self.read_bytes(4)?;
        Ok(f32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }

    pub fn read_f64_le(&mut self) -> anyhow::Result<f64> {
        let bytes = self.read_bytes(8)?;
        Ok(f64::from_le_bytes([
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        ]))
    }

    pub fn read_string_exact(&mut self, count: usize) -> anyhow::Result<String> {
        let bytes = self.read_bytes(count)?;
        let value = str::from_utf8(&bytes).with_context(|| format!("Invalid UTF-8"))?;
        Ok(value.to_string())
    }

    pub fn read_7bit_int(&mut self) -> anyhow::Result<u32> {
        let mut result: u32 = 0;
        let mut bits_read = 0;

        loop {
            let byte = self.read_u8()?;
            if bits_read >= 32 {
                bail!("Invalid 7-bit encoded integer.");
            }
            if bits_read == 28 && (byte & 0x70) != 0 {
                bail!("Invalid 7-bit encoded integer.");
            }
            result |= ((byte & 0x7F) as u32) << bits_read;
            if (byte & 0x80) == 0 {
                break;
            }
            bits_read += 7;
        }

        Ok(result)
    }

    pub fn read_7bit_string(&mut self) -> anyhow::Result<String> {
        let length = self.read_7bit_int()? as usize;
        self.read_string_exact(length)
    }

    pub fn read_lzx_int16(&mut self) -> anyhow::Result<u16> {
        let ls_b = self.read_u8()? as u16;
        let ms_b = self.read_u8()? as u16;
        Ok((ls_b << 8) | ms_b)
    }
}

#[cfg(test)]
mod tests {
    use super::CursorReader;

    #[test]
    fn malformed_7bit_int_returns_error_instead_of_panicking() {
        let mut reader = CursorReader::new(vec![0x80, 0x80, 0x80, 0x80, 0x80, 0x00]);
        let error = reader.read_7bit_int().expect_err("malformed varint");
        assert!(error.to_string().contains("Invalid 7-bit"));
    }

    #[test]
    fn overflowing_fifth_7bit_int_byte_returns_error() {
        let mut reader = CursorReader::new(vec![0x80, 0x80, 0x80, 0x80, 0x10]);
        let error = reader.read_7bit_int().expect_err("overflowing varint");
        assert!(error.to_string().contains("Invalid 7-bit"));
    }

    #[test]
    fn maximum_u32_7bit_int_value_is_allowed() {
        let mut reader = CursorReader::new(vec![0xff, 0xff, 0xff, 0xff, 0x0f]);
        assert_eq!(reader.read_7bit_int().expect("max u32"), u32::MAX);
    }
}
