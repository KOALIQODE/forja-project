use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Dependency {
    pub name: String,
    pub version: String,
    pub dep_type: String,       // "prod" | "dev" | "build" | "optional"
    pub latest: Option<String>,
    pub is_outdated: bool,
    pub vulnerabilities: Vec<Vulnerability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vulnerability {
    pub id: String,             // CVE-xxx / GHSA-xxx / RUSTSEC-xxx
    pub severity: Severity,
    pub title: String,
    pub description: Option<String>,
    pub url: Option<String>,
    pub patched_versions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity { Critical, High, Moderate, Low, Unknown }

impl Severity {
    pub fn score(&self) -> u8 {
        match self {
            Self::Critical => 4, Self::High => 3,
            Self::Moderate => 2, Self::Low => 1, Self::Unknown => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub manifest_path: String,
    pub ecosystem: String,      // "npm" | "cargo" | "pip" | "go" | "maven" | etc.
    pub language: String,       // "JavaScript" | "Rust" | "Python" | etc.
    pub dependencies: Vec<Dependency>,
    pub summary: Summary,
    pub scanned_at: String,
    pub errors: Vec<String>,    // warnings no fatales
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Summary {
    pub total: u32,
    pub critical: u32,
    pub high: u32,
    pub moderate: u32,
    pub low: u32,
    pub outdated: u32,
    pub vulnerable: u32,
}

pub mod npm;
pub mod cargo;
pub mod python;
pub mod golang;
pub mod maven;
pub mod gradle;
pub mod ruby;
pub mod dotnet;
pub mod composer;
pub mod cpp;

/// Trait que cada ecosistema debe implementar
pub trait EcosystemHandler: Send + Sync {
    /// Nombre del ecosistema ("npm", "cargo", "pip"...)
    fn name(&self) -> &'static str;
    /// Lenguaje humano ("JavaScript", "Rust", "Python"...)
    fn language(&self) -> &'static str;
    /// Archivos de manifiesto que reconoce
    fn manifest_filenames(&self) -> &'static [&'static str];
    /// ¿Este archivo es un manifiesto válido para este ecosistema?
    fn is_manifest(&self, path: &Path) -> bool {
        if let Some(name) = path.file_name().map(|n| n.to_string_lossy()) {
            // soporta glob básico: "*.csproj"
            self.manifest_filenames().iter().any(|pat| {
                if pat.starts_with("*.") {
                    name.ends_with(&pat[1..])
                } else {
                    name.as_ref() == *pat
                }
            })
        } else { false }
    }
    /// Parsea el manifiesto y retorna dependencias básicas (sin audit)
    fn parse_dependencies(&self, manifest_path: &Path) -> Result<Vec<Dependency>, String>;
    /// Corre el audit de vulnerabilidades (puede ser online o local)
    fn run_audit(&self, manifest_path: &Path) -> Vec<(String, Vec<Vulnerability>)>;
    /// Verifica versiones outdated
    fn check_outdated(&self, manifest_path: &Path) -> Vec<(String, String)>; // (name, latest)
    /// Instala una dependencia
    fn install(&self, manifest_path: &Path, package: &str, version: Option<&str>, dev: bool)
        -> Result<String, String>;
    /// Valida una dependencia antes de instalarla
    fn validate_dependency(&self, _package: &str, _version: Option<&str>) -> Result<Vec<Vulnerability>, String> {
        Ok(vec![]) // Por defecto no reporta nada o no soportado
    }
}

pub fn build_summary(deps: &[Dependency]) -> Summary {
    let mut s = Summary { total: deps.len() as u32, ..Default::default() };
    for d in deps {
        if d.is_outdated { s.outdated += 1; }
        if !d.vulnerabilities.is_empty() { s.vulnerable += 1; }
        for v in &d.vulnerabilities {
            match v.severity {
                Severity::Critical => s.critical += 1,
                Severity::High     => s.high += 1,
                Severity::Moderate => s.moderate += 1,
                Severity::Low      => s.low += 1,
                _ => {}
            }
        }
    }
    s
}

/// Ejecuta un comando y retorna stdout+stderr combinado
pub fn run_cmd(cmd: &str, args: &[&str], dir: &Path) -> Result<String, String> {
    let out = std::process::Command::new(cmd)
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("No se pudo ejecutar `{}`: {}", cmd, e))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if out.status.success() {
        Ok(format!("{}\n{}", stdout, stderr))
    } else {
        Err(format!("Error ({}):\n{}\n{}", out.status, stdout, stderr))
    }
}
