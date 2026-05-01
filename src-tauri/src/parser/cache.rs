use std::path::PathBuf;
use std::fs;

pub struct CacheManager {
    pub cache_dir: PathBuf,
}

impl CacheManager {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let cache_dir = Self::get_cache_dir()?;
        fs::create_dir_all(&cache_dir)?;
        fs::create_dir_all(cache_dir.join("parsers"))?;
        fs::create_dir_all(cache_dir.join("downloads"))?;
        fs::create_dir_all(cache_dir.join("metadata"))?;
        Ok(CacheManager { cache_dir })
    }

    fn get_cache_dir() -> Result<PathBuf, Box<dyn std::error::Error>> {
        #[cfg(target_os = "windows")]
        {
            let local_appdata = std::env::var("LOCALAPPDATA")?;
            Ok(PathBuf::from(local_appdata).join("forja"))
        }
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME")?;
            Ok(PathBuf::from(home).join("Library").join("Application Support").join("forja"))
        }
        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME")?;
            Ok(PathBuf::from(home).join(".local").join("share").join("forja"))
        }
    }

    pub fn parser_dir(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("parsers").join(parser_name)
    }

    pub fn binary_path(&self, parser_name: &str) -> PathBuf {
        let mut path = self.parser_dir(parser_name).join("parser");
        #[cfg(target_os = "windows")]
        path.set_extension("dll");
        #[cfg(target_os = "macos")]
        path.set_extension("dylib");
        #[cfg(target_os = "linux")]
        path.set_extension("so");
        path
    }

    pub fn queries_path(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("parsers").join(parser_name).join("highlights.scm")
    }

    pub fn is_parser_installed(&self, parser_name: &str) -> bool {
        self.binary_path(parser_name).exists()
    }

    pub fn is_parser_ready(&self, parser_name: &str) -> bool {
        self.binary_path(parser_name).exists() && self.queries_path(parser_name).exists()
    }

    pub fn metadata_path(&self, parser_name: &str) -> PathBuf {
        self.cache_dir.join("metadata").join(format!("{}.json", parser_name))
    }
}
