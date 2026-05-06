//! Security commands — multi-ecosystem dependency vulnerability scanning.
//!
//! # Supported ecosystems
//!
//! | Ecosystem | Lockfile detected          | Tool used          |
//! |-----------|----------------------------|--------------------|
//! | npm       | `package-lock.json`        | `npm audit --json` |
//! | yarn      | `yarn.lock`                | `yarn audit --json`|
//! | pnpm      | `pnpm-lock.yaml`           | `pnpm audit --json`|
//! | cargo     | `Cargo.lock`               | `cargo audit --json` |
//! | python    | `requirements.txt` / `pyproject.toml` / `Pipfile` | `pip-audit --format json` |
//! | go        | `go.mod`                   | `govulncheck -format json ./...` |
//! | ruby      | `Gemfile.lock`             | `bundle-audit check --format json` |
//!
//! # Tauri commands
//! - [`audit_dependencies`] — run audit for all detected ecosystems in `project_path`.
//! - [`watch_lockfile`] — watch every lockfile; re-audit on any change.
//!
//! # Events emitted
//! - `security-audit-result` — payload: [`AuditReport`]

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

// ── Public event name ─────────────────────────────────────────────────────────

pub const AUDIT_EVENT: &str = "security-audit-result";

// ── Ecosystem detection ───────────────────────────────────────────────────────

/// A package ecosystem and the lockfile that triggered its detection.
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

/// Returns every ecosystem found in `project_path`, in detection order.
/// Multiple ecosystems can coexist (e.g. a Tauri app → npm + cargo).
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

// ── DTOs ──────────────────────────────────────────────────────────────────────

/// Summary counts by severity level.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SeverityCounts {
    pub info: u32,
    pub low: u32,
    pub moderate: u32,
    pub high: u32,
    pub critical: u32,
    pub total: u32,
}

/// One vulnerable package entry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VulnEntry {
    pub name: String,
    pub severity: String,
    pub range: String,
    pub fix_available: bool,
    /// Advisory / CVE id when available.
    pub advisory_id: Option<String>,
}

/// Result for a single ecosystem within a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcosystemReport {
    pub ecosystem: String,
    /// Relative lockfile path that triggered this scan.
    pub lockfile: String,
    pub counts: SeverityCounts,
    pub vulnerabilities: Vec<VulnEntry>,
    /// `true` when the required tool is not installed on the system.
    pub tool_missing: bool,
    pub error: Option<String>,
}

/// Aggregated audit result for the whole project, covering all ecosystems.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditReport {
    pub project_path: String,
    pub ecosystems: Vec<EcosystemReport>,
    /// Aggregated counts across all ecosystems.
    pub total_counts: SeverityCounts,
    /// `true` when any ecosystem has `critical` or `high` vulnerabilities.
    pub has_issues: bool,
    /// Top-level error (e.g. project not found). Ecosystem-level errors live in `ecosystems`.
    pub error: Option<String>,
}

// ── Lockfile watcher ──────────────────────────────────────────────────────────

static LOCKFILE_WATCHER: Mutex<Option<notify_debouncer_mini::Debouncer<RecommendedWatcher>>> =
    Mutex::new(None);

// ── Per-ecosystem runners ─────────────────────────────────────────────────────

fn run_ecosystem(project_path: &Path, eco: &Ecosystem, lockfile: &Path) -> EcosystemReport {
    let lockfile_str = lockfile
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    match eco {
        Ecosystem::Npm => run_npm(project_path, lockfile_str),
        Ecosystem::Yarn => run_yarn(project_path, lockfile_str),
        Ecosystem::Pnpm => run_pnpm(project_path, lockfile_str),
        Ecosystem::Cargo => run_cargo(project_path, lockfile_str),
        Ecosystem::Python => run_python(project_path, lockfile_str),
        Ecosystem::Go => run_go(project_path, lockfile_str),
        Ecosystem::Ruby => run_ruby(project_path, lockfile_str),
    }
}

fn run_npm(project_path: &Path, lockfile: String) -> EcosystemReport {
    let project_str = project_path.to_string_lossy();
    let out = Command::new("npm")
        .args(["audit", "--json", "--prefix", &project_str])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("npm", lockfile, out, parse_npm_audit_json)
}

fn run_yarn(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("yarn")
        .args(["audit", "--json"])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("yarn", lockfile, out, parse_yarn_audit_json)
}

fn run_pnpm(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("pnpm")
        .args(["audit", "--json"])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("pnpm", lockfile, out, parse_npm_audit_json)
}

fn run_cargo(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("cargo")
        .args(["audit", "--json"])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("cargo", lockfile, out, parse_cargo_audit_json)
}

fn run_python(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("pip-audit")
        .args(["--format", "json", "--progress-spinner", "off"])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("python", lockfile, out, parse_pip_audit_json)
}

fn run_go(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("govulncheck")
        .args(["-format", "json", "./..."])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("go", lockfile, out, parse_govulncheck_json)
}

fn run_ruby(project_path: &Path, lockfile: String) -> EcosystemReport {
    let out = Command::new("bundle-audit")
        .args(["check", "--format", "json"])
        .current_dir(project_path)
        .output();

    ecosystem_from_output("ruby", lockfile, out, parse_bundle_audit_json)
}

// ── Generic runner helper ─────────────────────────────────────────────────────

fn ecosystem_from_output<F>(
    ecosystem: &str,
    lockfile: String,
    out: std::io::Result<std::process::Output>,
    parser: F,
) -> EcosystemReport
where
    F: Fn(&[u8]) -> Result<EcosystemReport, String>,
{
    match out {
        Err(e) => {
            let tool_missing = e.kind() == std::io::ErrorKind::NotFound;
            EcosystemReport {
                ecosystem: ecosystem.to_string(),
                lockfile,
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing,
                error: Some(if tool_missing {
                    format!("`{ecosystem}` audit tool not found. Please install it.")
                } else {
                    format!("Failed to run `{ecosystem}` audit: {e}")
                }),
            }
        }
        Ok(output) => {
            let mut report = parser(&output.stdout).unwrap_or_else(|e| EcosystemReport {
                ecosystem: ecosystem.to_string(),
                lockfile: lockfile.clone(),
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: false,
                error: Some(e),
            });
            report.ecosystem = ecosystem.to_string();
            report.lockfile = lockfile;
            report
        }
    }
}

// ── JSON parsers (pure — used in tests) ──────────────────────────────────────

/// Parse `npm audit --json` output (npm v7+ audit report v2).
/// Also used for pnpm which emits the same format.
pub fn parse_npm_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("npm audit JSON parse error: {e}"))?;

    let meta = &json["metadata"]["vulnerabilities"];
    let counts = SeverityCounts {
        info: meta["info"].as_u64().unwrap_or(0) as u32,
        low: meta["low"].as_u64().unwrap_or(0) as u32,
        moderate: meta["moderate"].as_u64().unwrap_or(0) as u32,
        high: meta["high"].as_u64().unwrap_or(0) as u32,
        critical: meta["critical"].as_u64().unwrap_or(0) as u32,
        total: meta["total"].as_u64().unwrap_or(0) as u32,
    };

    let mut vulnerabilities: Vec<VulnEntry> = vec![];
    if let Some(vulns) = json["vulnerabilities"].as_object() {
        for (name, entry) in vulns {
            let severity = entry["severity"].as_str().unwrap_or("unknown").to_string();
            let range = entry["range"].as_str().unwrap_or("*").to_string();
            let fix_available = match &entry["fixAvailable"] {
                serde_json::Value::Bool(b) => *b,
                serde_json::Value::Object(_) => true,
                _ => false,
            };
            vulnerabilities.push(VulnEntry {
                name: name.clone(),
                severity,
                range,
                fix_available,
                advisory_id: entry["via"][0]["source"]
                    .as_u64()
                    .map(|id| id.to_string()),
            });
        }
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(), // filled by caller
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

/// Parse `yarn audit --json` NDJSON output (one JSON object per line).
pub fn parse_yarn_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let text = std::str::from_utf8(stdout).map_err(|e| e.to_string())?;

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];

    for line in text.lines() {
        let Ok(json) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if json["type"] == "auditAdvisory" {
            let advisory = &json["data"]["advisory"];
            let severity = advisory["severity"].as_str().unwrap_or("unknown").to_string();
            let name = advisory["module_name"].as_str().unwrap_or("?").to_string();
            let range = advisory["vulnerable_versions"].as_str().unwrap_or("*").to_string();
            let fix_available = advisory["patched_versions"].as_str().map_or(false, |v| v != "<0.0.0");
            let advisory_id = advisory["cves"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
                .map(String::from);

            match severity.as_str() {
                "info" => counts.info += 1,
                "low" => counts.low += 1,
                "moderate" => counts.moderate += 1,
                "high" => counts.high += 1,
                "critical" => counts.critical += 1,
                _ => {}
            }
            counts.total += 1;

            vulnerabilities.push(VulnEntry { name, severity, range, fix_available, advisory_id });
        }
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

/// Parse `cargo audit --json` output.
pub fn parse_cargo_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("cargo audit JSON parse error: {e}"))?;

    let vuln_list = json["vulnerabilities"]["list"]
        .as_array()
        .cloned()
        .unwrap_or_default();

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];

    for item in &vuln_list {
        let advisory = &item["advisory"];
        let name = advisory["package"].as_str().unwrap_or("?").to_string();
        let advisory_id = advisory["id"].as_str().map(String::from);
        let severity = advisory["cvss"]
            .as_object()
            .and_then(|c| c.get("score"))
            .and_then(|s| s.as_f64())
            .map(cvss_to_severity)
            .unwrap_or_else(|| {
                // Fallback: rustsec uses "severity" field in some versions
                advisory["severity"]
                    .as_str()
                    .unwrap_or("high")
                    .to_string()
            });

        let range = item["versions"]["patched"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| v.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unpatched".to_string());

        let fix_available = item["versions"]["patched"]
            .as_array()
            .map(|a| !a.is_empty())
            .unwrap_or(false);

        match severity.as_str() {
            "critical" => counts.critical += 1,
            "high" => counts.high += 1,
            "moderate" | "medium" => counts.moderate += 1,
            "low" => counts.low += 1,
            _ => counts.info += 1,
        }
        counts.total += 1;

        vulnerabilities.push(VulnEntry { name, severity, range, fix_available, advisory_id });
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

/// Parse `pip-audit --format json` output.
pub fn parse_pip_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("pip-audit JSON parse error: {e}"))?;

    let deps = json["dependencies"]
        .as_array()
        .or_else(|| json.as_array())
        .cloned()
        .unwrap_or_default();

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];

    for dep in &deps {
        let name = dep["name"].as_str().unwrap_or("?").to_string();
        let vulns = dep["vulns"].as_array().cloned().unwrap_or_default();
        for v in &vulns {
            let advisory_id = v["id"].as_str().map(String::from);
            let fix_available = v["fix_versions"]
                .as_array()
                .map(|a| !a.is_empty())
                .unwrap_or(false);
            // pip-audit doesn't always expose severity; default to high
            let severity = v["severity"]
                .as_str()
                .unwrap_or("high")
                .to_string();
            let range = dep["version"].as_str().unwrap_or("*").to_string();

            match severity.as_str() {
                "critical" => counts.critical += 1,
                "high" => counts.high += 1,
                "moderate" | "medium" => counts.moderate += 1,
                "low" => counts.low += 1,
                _ => counts.info += 1,
            }
            counts.total += 1;

            vulnerabilities.push(VulnEntry {
                name: name.clone(),
                severity,
                range,
                fix_available,
                advisory_id,
            });
        }
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

/// Parse `govulncheck -format json ./...` NDJSON output.
pub fn parse_govulncheck_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let text = std::str::from_utf8(stdout).map_err(|e| e.to_string())?;

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];
    let mut seen_ids = std::collections::HashSet::new();

    for line in text.lines() {
        let Ok(json) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if let Some(finding) = json.get("finding") {
            let osv_id = finding["osv"].as_str().unwrap_or("?").to_string();
            if !seen_ids.insert(osv_id.clone()) {
                continue; // deduplicate
            }
            let name = finding["trace"][0]["module"]
                .as_str()
                .unwrap_or(&osv_id)
                .to_string();
            let fix_available = finding["fixed_version"].as_str().is_some();
            let range = finding["fixed_version"]
                .as_str()
                .map(|v| format!("fixed in {v}"))
                .unwrap_or_else(|| "unfixed".to_string());

            // govulncheck doesn't expose severity; default to high
            counts.high += 1;
            counts.total += 1;

            vulnerabilities.push(VulnEntry {
                name,
                severity: "high".to_string(),
                range,
                fix_available,
                advisory_id: Some(osv_id),
            });
        }
    }

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

/// Parse `bundle-audit check --format json` output.
pub fn parse_bundle_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("bundle-audit JSON parse error: {e}"))?;

    let results = json["results"].as_array().cloned().unwrap_or_default();

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];

    for item in &results {
        let advisory = &item["advisory"];
        let name = item["gem"]["name"].as_str().unwrap_or("?").to_string();
        let severity = advisory["criticality"].as_str().unwrap_or("high").to_string();
        let advisory_id = advisory["cve"].as_str().map(String::from)
            .or_else(|| advisory["osvdb"].as_str().map(String::from));
        let fix_available = advisory["patched_versions"].as_str().is_some();
        let range = item["gem"]["version"].as_str().unwrap_or("*").to_string();

        match severity.as_str() {
            "critical" => counts.critical += 1,
            "high" => counts.high += 1,
            "medium" | "moderate" => counts.moderate += 1,
            "low" => counts.low += 1,
            _ => counts.info += 1,
        }
        counts.total += 1;

        vulnerabilities.push(VulnEntry { name, severity, range, fix_available, advisory_id });
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        error: None,
    })
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/// Run audits for all detected ecosystems and aggregate into one [`AuditReport`].
pub fn run_full_audit(project_path: &str) -> AuditReport {
    let base = PathBuf::from(project_path);
    if !base.exists() {
        return AuditReport {
            project_path: project_path.to_string(),
            ecosystems: vec![],
            total_counts: SeverityCounts::default(),
            has_issues: false,
            error: Some(format!("Project path not found: {project_path}")),
        };
    }

    let detected = detect_ecosystems(&base);
    if detected.is_empty() {
        return AuditReport {
            project_path: project_path.to_string(),
            ecosystems: vec![],
            total_counts: SeverityCounts::default(),
            has_issues: false,
            error: Some(
                "No supported lockfile found. Supported: package-lock.json, yarn.lock, \
                 pnpm-lock.yaml, Cargo.lock, requirements.txt, pyproject.toml, Pipfile, go.mod, Gemfile.lock"
                    .to_string(),
            ),
        };
    }

    let reports: Vec<EcosystemReport> = detected
        .iter()
        .map(|(eco, lockfile)| run_ecosystem(&base, eco, lockfile))
        .collect();

    let total_counts = aggregate_counts(&reports);
    let has_issues = total_counts.high > 0 || total_counts.critical > 0;

    AuditReport {
        project_path: project_path.to_string(),
        ecosystems: reports,
        total_counts,
        has_issues,
        error: None,
    }
}

// ── Utility ───────────────────────────────────────────────────────────────────

fn aggregate_counts(reports: &[EcosystemReport]) -> SeverityCounts {
    reports.iter().fold(SeverityCounts::default(), |mut acc, r| {
        acc.info += r.counts.info;
        acc.low += r.counts.low;
        acc.moderate += r.counts.moderate;
        acc.high += r.counts.high;
        acc.critical += r.counts.critical;
        acc.total += r.counts.total;
        acc
    })
}

fn sort_vulns(vulns: &mut Vec<VulnEntry>) {
    vulns.sort_by_key(|v| match v.severity.as_str() {
        "critical" => 0u8,
        "high" => 1,
        "moderate" | "medium" => 2,
        "low" => 3,
        _ => 4,
    });
}

fn cvss_to_severity(score: f64) -> String {
    match score as u8 {
        0 => "none".to_string(),
        1..=3 => "low".to_string(),
        4..=6 => "moderate".to_string(),
        7..=8 => "high".to_string(),
        _ => "critical".to_string(),
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Run audits for all detected ecosystems in `project_path`, emit
/// `security-audit-result`, and return the aggregated [`AuditReport`].
#[tauri::command]
pub async fn audit_dependencies(
    project_path: String,
    app: tauri::AppHandle,
) -> Result<AuditReport, String> {
    let report = run_full_audit(&project_path);
    app.emit(AUDIT_EVENT, &report).map_err(|e| e.to_string())?;
    Ok(report)
}

/// Watch every lockfile in `project_path`. On any change, re-run the full
/// audit and emit `security-audit-result`.
///
/// Replaces any previously registered watcher (one active at a time).
#[tauri::command]
pub async fn watch_lockfile(
    project_path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let watch_base = project_path.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(800),
        move |res: Result<Vec<DebouncedEvent>, _>| {
            if res.is_ok() {
                let report = run_full_audit(&project_path);
                app.emit(AUDIT_EVENT, &report).ok();
            }
        },
    )
    .map_err(|e| e.to_string())?;

    let base = PathBuf::from(&watch_base);
    let all_lockfiles = [
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "Cargo.lock",
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "go.mod",
        "Gemfile.lock",
    ];

    for lf in &all_lockfiles {
        let lf_path = base.join(lf);
        if lf_path.exists() {
            debouncer
                .watcher()
                .watch(&lf_path, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
        }
    }

    let mut guard = LOCKFILE_WATCHER.lock().unwrap();
    *guard = Some(debouncer);

    Ok(())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    // ── detect_ecosystems ─────────────────────────────────────────────────────

    #[test]
    fn detects_npm_from_package_lock() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package-lock.json"), "{}").unwrap();
        let result = detect_ecosystems(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, Ecosystem::Npm);
    }

    #[test]
    fn detects_cargo_from_cargo_lock() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("Cargo.lock"), "").unwrap();
        let result = detect_ecosystems(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, Ecosystem::Cargo);
    }

    #[test]
    fn detects_multiple_ecosystems_in_tauri_project() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package-lock.json"), "{}").unwrap();
        fs::write(dir.path().join("Cargo.lock"), "").unwrap();
        let result = detect_ecosystems(dir.path());
        assert_eq!(result.len(), 2);
        let ecos: Vec<_> = result.iter().map(|(e, _)| e).collect();
        assert!(ecos.contains(&&Ecosystem::Npm));
        assert!(ecos.contains(&&Ecosystem::Cargo));
    }

    #[test]
    fn prefers_package_lock_over_yarn_lock_for_separate_ecosystems() {
        // Both npm and yarn lockfiles coexist → both detected as separate ecosystems
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("package-lock.json"), "{}").unwrap();
        fs::write(dir.path().join("yarn.lock"), "").unwrap();
        let result = detect_ecosystems(dir.path());
        // Should include npm (package-lock.json) and yarn (yarn.lock) separately
        let ecos: Vec<_> = result.iter().map(|(e, _)| e.as_str()).collect();
        assert!(ecos.contains(&"npm"));
        assert!(ecos.contains(&"yarn"));
    }

    #[test]
    fn returns_empty_for_project_with_no_lockfiles() {
        let dir = TempDir::new().unwrap();
        let result = detect_ecosystems(dir.path());
        assert!(result.is_empty());
    }

    #[test]
    fn detects_python_from_requirements_txt() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("requirements.txt"), "requests==2.19.0").unwrap();
        let result = detect_ecosystems(dir.path());
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].0, Ecosystem::Python);
    }

    #[test]
    fn deduplicates_python_ecosystem_when_multiple_python_files_exist() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("requirements.txt"), "").unwrap();
        fs::write(dir.path().join("pyproject.toml"), "").unwrap();
        let result = detect_ecosystems(dir.path());
        // Python should appear only once
        let python_count = result.iter().filter(|(e, _)| *e == Ecosystem::Python).count();
        assert_eq!(python_count, 1);
    }

    // ── parse_npm_audit_json ──────────────────────────────────────────────────

    #[test]
    fn npm_parses_clean_report() {
        let json = r#"{
          "auditReportVersion": 2,
          "vulnerabilities": {},
          "metadata": {
            "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0 }
          }
        }"#;
        let report = parse_npm_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 0);
        assert!(report.vulnerabilities.is_empty());
    }

    #[test]
    fn npm_parses_vulnerabilities() {
        let json = r#"{
          "auditReportVersion": 2,
          "vulnerabilities": {
            "lodash": {
              "severity": "high",
              "range": "<4.17.21",
              "fixAvailable": true,
              "via": [{ "source": 1084796 }]
            },
            "ansi-html": {
              "severity": "critical",
              "range": "*",
              "fixAvailable": false,
              "via": []
            }
          },
          "metadata": {
            "vulnerabilities": { "info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 1, "total": 2 }
          }
        }"#;
        let report = parse_npm_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.high, 1);
        assert_eq!(report.counts.critical, 1);
        assert_eq!(report.counts.total, 2);
        assert_eq!(report.vulnerabilities.len(), 2);
        // Critical should sort first
        assert_eq!(report.vulnerabilities[0].severity, "critical");
    }

    #[test]
    fn npm_handles_malformed_json() {
        let result = parse_npm_audit_json(b"not json at all");
        assert!(result.is_err());
    }

    #[test]
    fn npm_handles_empty_input() {
        let result = parse_npm_audit_json(b"");
        assert!(result.is_err());
    }

    #[test]
    fn npm_fix_available_bool_false() {
        let json = r#"{
          "vulnerabilities": {
            "pkg": { "severity": "low", "range": "*", "fixAvailable": false, "via": [] }
          },
          "metadata": { "vulnerabilities": { "info":0,"low":1,"moderate":0,"high":0,"critical":0,"total":1 } }
        }"#;
        let report = parse_npm_audit_json(json.as_bytes()).unwrap();
        assert!(!report.vulnerabilities[0].fix_available);
    }

    #[test]
    fn npm_fix_available_object_means_true() {
        let json = r#"{
          "vulnerabilities": {
            "pkg": { "severity": "high", "range": "*", "fixAvailable": { "name": "pkg", "version": "2.0.0", "isSemVerMajor": false }, "via": [] }
          },
          "metadata": { "vulnerabilities": { "info":0,"low":0,"moderate":0,"high":1,"critical":0,"total":1 } }
        }"#;
        let report = parse_npm_audit_json(json.as_bytes()).unwrap();
        assert!(report.vulnerabilities[0].fix_available);
    }

    // ── parse_cargo_audit_json ────────────────────────────────────────────────

    #[test]
    fn cargo_parses_clean_report() {
        let json = r#"{ "vulnerabilities": { "list": [], "count": 0 }, "warnings": {} }"#;
        let report = parse_cargo_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 0);
        assert!(report.vulnerabilities.is_empty());
    }

    #[test]
    fn cargo_parses_vulnerabilities_with_cvss() {
        let json = r#"{
          "vulnerabilities": {
            "count": 1,
            "list": [{
              "advisory": {
                "id": "RUSTSEC-2021-0001",
                "package": "openssl",
                "title": "Memory corruption",
                "severity": "high",
                "cvss": { "score": 7.5 }
              },
              "versions": { "patched": [">=1.0.2u", ">=1.1.1n"] },
              "affected": null
            }]
          },
          "warnings": {}
        }"#;
        let report = parse_cargo_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 1);
        assert_eq!(report.vulnerabilities[0].name, "openssl");
        assert_eq!(report.vulnerabilities[0].severity, "high");
        assert!(report.vulnerabilities[0].fix_available);
        assert_eq!(
            report.vulnerabilities[0].advisory_id.as_deref(),
            Some("RUSTSEC-2021-0001")
        );
    }

    #[test]
    fn cargo_maps_cvss_score_to_severity() {
        assert_eq!(cvss_to_severity(0.0), "none");
        assert_eq!(cvss_to_severity(2.5), "low");
        assert_eq!(cvss_to_severity(5.0), "moderate");
        assert_eq!(cvss_to_severity(7.5), "high");
        assert_eq!(cvss_to_severity(9.0), "critical");
    }

    #[test]
    fn cargo_handles_malformed_json() {
        let result = parse_cargo_audit_json(b"{invalid");
        assert!(result.is_err());
    }

    // ── parse_pip_audit_json ──────────────────────────────────────────────────

    #[test]
    fn pip_parses_clean_report() {
        let json = r#"{ "dependencies": [] }"#;
        let report = parse_pip_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 0);
    }

    #[test]
    fn pip_parses_vulnerabilities() {
        let json = r#"{
          "dependencies": [{
            "name": "requests",
            "version": "2.19.1",
            "vulns": [{
              "id": "PYSEC-2023-74",
              "fix_versions": ["2.31.0"],
              "aliases": ["CVE-2023-32681"],
              "description": "..."
            }]
          }]
        }"#;
        let report = parse_pip_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 1);
        assert_eq!(report.vulnerabilities[0].name, "requests");
        assert!(report.vulnerabilities[0].fix_available);
        assert_eq!(
            report.vulnerabilities[0].advisory_id.as_deref(),
            Some("PYSEC-2023-74")
        );
    }

    #[test]
    fn pip_handles_flat_array_format() {
        // Some versions of pip-audit return a plain array instead of { dependencies: [...] }
        let json = r#"[{ "name": "urllib3", "version": "1.26.0", "vulns": [] }]"#;
        let report = parse_pip_audit_json(json.as_bytes()).unwrap();
        assert_eq!(report.counts.total, 0);
    }

    // ── parse_govulncheck_json ────────────────────────────────────────────────

    #[test]
    fn govulncheck_parses_findings() {
        let ndjson = r#"{"config":{"protocol_version":"1.0.0"}}
{"finding":{"osv":"GO-2023-1234","fixed_version":"v1.2.3","trace":[{"module":"golang.org/x/text","version":"v0.3.7"}]}}
{"finding":{"osv":"GO-2023-5678","trace":[{"module":"github.com/pkg/errors"}]}}"#;

        let report = parse_govulncheck_json(ndjson.as_bytes()).unwrap();
        assert_eq!(report.vulnerabilities.len(), 2);
        assert_eq!(report.counts.high, 2);
        assert!(report.vulnerabilities[0].fix_available); // has fixed_version
        assert!(!report.vulnerabilities[1].fix_available); // no fixed_version
    }

    #[test]
    fn govulncheck_deduplicates_same_osv_id() {
        let ndjson = r#"{"finding":{"osv":"GO-2023-1234","trace":[{"module":"mod"}]}}
{"finding":{"osv":"GO-2023-1234","trace":[{"module":"mod2"}]}}"#;
        let report = parse_govulncheck_json(ndjson.as_bytes()).unwrap();
        assert_eq!(report.vulnerabilities.len(), 1);
    }

    // ── aggregate_counts ──────────────────────────────────────────────────────

    #[test]
    fn aggregate_sums_counts_across_ecosystems() {
        let reports = vec![
            EcosystemReport {
                ecosystem: "npm".into(),
                lockfile: "package-lock.json".into(),
                counts: SeverityCounts { high: 1, critical: 0, total: 1, ..Default::default() },
                vulnerabilities: vec![],
                tool_missing: false,
                error: None,
            },
            EcosystemReport {
                ecosystem: "cargo".into(),
                lockfile: "Cargo.lock".into(),
                counts: SeverityCounts { high: 0, critical: 2, total: 2, ..Default::default() },
                vulnerabilities: vec![],
                tool_missing: false,
                error: None,
            },
        ];
        let total = aggregate_counts(&reports);
        assert_eq!(total.high, 1);
        assert_eq!(total.critical, 2);
        assert_eq!(total.total, 3);
    }

    // ── run_full_audit ────────────────────────────────────────────────────────

    #[test]
    fn full_audit_returns_error_for_nonexistent_path() {
        let report = run_full_audit("/does/not/exist/at/all");
        assert!(report.error.is_some());
        assert!(!report.has_issues);
    }

    #[test]
    fn full_audit_returns_error_when_no_lockfiles_found() {
        let dir = TempDir::new().unwrap();
        let report = run_full_audit(dir.path().to_str().unwrap());
        assert!(report.error.is_some());
        assert!(report.ecosystems.is_empty());
    }
}
