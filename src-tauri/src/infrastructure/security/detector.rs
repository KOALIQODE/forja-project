use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Ecosystem {
    Npm,
    Yarn,
    Pnpm,
    Cargo,
    Python,
    Go,
    Ruby,
}

impl Ecosystem {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Npm => "npm",
            Self::Yarn => "yarn",
            Self::Pnpm => "pnpm",
            Self::Cargo => "cargo",
            Self::Python => "python",
            Self::Go => "go",
            Self::Ruby => "ruby",
        }
    }
}

pub fn detect_ecosystems(project_path: &Path) -> Vec<(Ecosystem, PathBuf)> {
    let candidates: &[(&str, Ecosystem)] = &[
        ("package-lock.json", Ecosystem::Npm),
        ("yarn.lock", Ecosystem::Yarn),
        ("pnpm-lock.yaml", Ecosystem::Pnpm),
        ("Cargo.lock", Ecosystem::Cargo),
        ("requirements.txt", Ecosystem::Python),
        ("pyproject.toml", Ecosystem::Python),
        ("Pipfile", Ecosystem::Python),
        ("go.mod", Ecosystem::Go),
        ("Gemfile.lock", Ecosystem::Ruby),
    ];

    let mut found: Vec<(Ecosystem, PathBuf)> = Vec::new();
    let mut seen_ecosystems: Vec<Ecosystem> = Vec::new();

    for (filename, eco) in candidates {
        let path = project_path.join(filename);
        if path.exists() && !seen_ecosystems.contains(eco) {
            seen_ecosystems.push(eco.clone());
            found.push((eco.clone(), path));
        }
    }

    found
}
