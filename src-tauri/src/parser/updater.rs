use crate::parser::downloader::BinaryDownloader;

pub struct ParserUpdater {
    downloader: BinaryDownloader,
}

impl ParserUpdater {
    pub fn new() -> Self {
        ParserUpdater {
            downloader: BinaryDownloader::new(),
        }
    }

    pub async fn check_for_updates(&self) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        // Compare local versions with GitHub releases and return list of outdated parsers
        let outdated: Vec<String> = Vec::new();
        Ok(outdated)
    }

    pub async fn auto_update_parsers(&self) -> Result<(), Box<dyn std::error::Error>> {
        // Run in background, e.g., every 7 days
        Ok(())
    }
}
