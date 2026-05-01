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

    pub async fn download_binary(
        &self,
        url: &str,
        destination: &Path,
        on_progress: Box<dyn Fn(u64, u64) + Send>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let response = self.client.get(url).send().await?;
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

    pub async fn get_release_info(
        &self,
        github_repo: &str,
    ) -> Result<GitHubRelease, Box<dyn std::error::Error>> {
        let url = format!("https://api.github.com/repos/{}/releases/latest", github_repo);
        let response = self.client.get(&url).send().await?;
        let release: GitHubRelease = response.json().await?;
        Ok(release)
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub assets: Vec<GitHubAsset>,
}

#[derive(Debug, serde::Deserialize)]
pub struct GitHubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}
