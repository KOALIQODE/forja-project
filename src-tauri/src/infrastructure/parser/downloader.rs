use futures_util::StreamExt;
use reqwest::Client;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

pub struct BinaryDownloader {
    client: Client,
}

impl BinaryDownloader {
    pub fn new() -> Self {
        BinaryDownloader {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .user_agent("Forja-Studio")
                .build()
                .expect("Failed to build reqwest client"),
        }
    }

    /// Download a binary from a direct URL (used for the Forja CDN).
    /// Returns an error if the URL responds with a non-2xx status.
    pub async fn download_from_url(
        &self,
        url: &str,
        destination: &Path,
        on_progress: Box<dyn Fn(u64, u64) + Send>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let response = self.client.get(url).send().await?;

        if !response.status().is_success() {
            return Err(format!("HTTP {} fetching {}", response.status(), url).into());
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut stream = response.bytes_stream();

        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let mut file = File::create(destination).await?;
        let mut downloaded = 0u64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;
            on_progress(downloaded, total_size);
        }
        file.flush().await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binary_downloader_new_doesnt_panic() {
        let _dl = BinaryDownloader::new();
    }
}
