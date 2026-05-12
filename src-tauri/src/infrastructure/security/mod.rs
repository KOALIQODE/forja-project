use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use chrono::{DateTime, Utc};

pub mod detector;
pub mod ecosystems;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanOptions {
    pub parse_only: bool,
    pub run_audit: bool,
    pub run_outdated: bool,
    pub parallelism: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SeverityCounts {
    pub info: u32,
    pub low: u32,
    pub moderate: u32,
    pub high: u32,
    pub critical: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VulnEntry {
    pub name: String,
    pub severity: String,
    pub range: String,
    pub fix_available: bool,
    pub advisory_id: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub patched_versions: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcosystemReport {
    pub ecosystem: String,
    pub lockfile: String,
    pub counts: SeverityCounts,
    pub vulnerabilities: Vec<VulnEntry>,
    pub tool_missing: bool,
    pub tools_required: Vec<String>,
    pub error: Option<String>,
    pub scanned_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub project_path: String,
    pub scan_id: String,
    pub ecosystems: Vec<EcosystemReport>,
    pub total_counts: SeverityCounts,
    pub has_issues: bool,
    pub error: Option<String>,
    pub scanned_at: DateTime<Utc>,
    pub options: ScanOptions,
}

pub fn is_tool_available(cmd: &str) -> bool {
    std::process::Command::new(cmd)
        .arg("--version")
        .output()
        .is_ok()
}
