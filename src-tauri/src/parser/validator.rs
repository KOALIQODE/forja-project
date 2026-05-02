// SUPERSEDED — canonical implementation moved to `crate::infrastructure::parser::validator`.
// This file is kept as historical reference and is NOT compiled (see parser/mod.rs shim).

#![allow(dead_code)]
use sha2::{Sha256, Digest};
use std::fs::File;
use std::io::Read;
use std::path::Path;

pub struct BinaryValidator;

impl BinaryValidator {
    pub fn validate_checksum(
        file_path: &Path,
        expected_sha256: &str,
    ) -> Result<bool, Box<dyn std::error::Error>> {
        let mut file = File::open(file_path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0; 8192];
        loop {
            let count = file.read(&mut buffer)?;
            if count == 0 { break; }
            hasher.update(&buffer[..count]);
        }
        let result = hasher.finalize();
        let hash_string = format!("{:x}", result);
        Ok(hash_string.eq_ignore_ascii_case(expected_sha256))
    }

    pub fn validate_binary_format(file_path: &Path) -> Result<bool, Box<dyn std::error::Error>> {
        let mut file = File::open(file_path)?;
        let mut magic = [0u8; 4];
        file.read_exact(&mut magic)?;
        #[cfg(target_os = "windows")]
        let is_valid = magic[0] == 0x4d && magic[1] == 0x5a;
        #[cfg(target_os = "macos")]
        let is_valid = magic[0] == 0xfe && magic[1] == 0xed && magic[2] == 0xfa;
        #[cfg(target_os = "linux")]
        let is_valid = magic[0] == 0x7f && magic[1] == b'E' && magic[2] == b'L' && magic[3] == b'F';
        Ok(is_valid)
    }

    pub fn validate_download(
        path: &Path,
        expected_sha256: &str,
        max_size_mb: u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let metadata = std::fs::metadata(path)?;
        if metadata.len() > max_size_mb * 1024 * 1024 {
            return Err("Archivo demasiado grande".into());
        }
        Self::validate_checksum(path, expected_sha256)?;
        Self::validate_binary_format(path)?;
        Ok(())
    }
}
