use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserInfo {
    pub name: String,
    pub language: String,
    pub version: String,
    pub source_url: String,
    pub binary_url: String,
    pub sha256: String,
    pub file_size: u64,
    pub supported_platforms: Vec<String>,
    pub installed: bool,
    pub installed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub parser: String,
    pub downloaded: u64,
    pub total: u64,
    pub percentage: f32,
    pub status: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserRegistry {
    pub parsers: Vec<ParserInfo>,
    pub last_updated: String,
}
