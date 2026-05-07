//! Security commands — multi-ecosystem dependency vulnerability scanning.

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;
use chrono::Utc;

use crate::infrastructure::security::{
    self, AuditReport, EcosystemReport, ScanOptions, SeverityCounts, VulnEntry,
};
use crate::infrastructure::security::detector::{self, Ecosystem};
use crate::infrastructure::security::ecosystems::{self, EcosystemHandler};

// ── Public event name ─────────────────────────────────────────────────────────

pub const AUDIT_EVENT: &str = "security-audit-result";

// ── Lockfile watcher ──────────────────────────────────────────────────────────

static LOCKFILE_WATCHER: Mutex<Option<notify_debouncer_mini::Debouncer<RecommendedWatcher>>> =
    Mutex::new(None);

// ── Per-ecosystem runners ─────────────────────────────────────────────────────

fn run_ecosystem(project_path: &Path, eco: &Ecosystem, lockfile: &Path, options: &ScanOptions) -> EcosystemReport {
    let handler: Box<dyn EcosystemHandler> = match eco {
        Ecosystem::Npm | Ecosystem::Yarn | Ecosystem::Pnpm => Box::new(ecosystems::npm::NpmHandler),
        Ecosystem::Cargo => Box::new(ecosystems::cargo::CargoHandler),
        // Fallback for not-yet-migrated ones
        _ => return run_ecosystem_legacy(project_path, eco, lockfile),
    };

    handler.run_audit(project_path, options)
}

fn run_ecosystem_legacy(project_path: &Path, eco: &Ecosystem, lockfile_path: &Path) -> EcosystemReport {
    let lockfile = lockfile_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    match eco {
        Ecosystem::Python => {
            let out = Command::new("pip-audit")
                .args(["--format", "json", "--progress-spinner", "off"])
                .current_dir(project_path)
                .output();
            ecosystem_from_output("python", lockfile, out, parse_pip_audit_json)
        }
        Ecosystem::Go => {
            let out = Command::new("govulncheck")
                .args(["-format", "json", "./..."])
                .current_dir(project_path)
                .output();
            ecosystem_from_output("go", lockfile, out, parse_govulncheck_json)
        }
        Ecosystem::Ruby => {
            let out = Command::new("bundle-audit")
                .args(["check", "--format", "json"])
                .current_dir(project_path)
                .output();
            ecosystem_from_output("ruby", lockfile, out, parse_bundle_audit_json)
        }
        _ => EcosystemReport {
            ecosystem: eco.as_str().to_string(),
            lockfile,
            counts: SeverityCounts::default(),
            vulnerabilities: vec![],
            tool_missing: false,
            tools_required: vec![],
            error: Some("Unsupported ecosystem".to_string()),
            scanned_at: Utc::now(),
        }
    }
}

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
                tools_required: vec![],
                error: Some(if tool_missing {
                    format!("`{ecosystem}` audit tool not found.")
                } else {
                    format!("Failed to run `{ecosystem}` audit: {e}")
                }),
                scanned_at: Utc::now(),
            }
        }
        Ok(output) => {
            let mut report = parser(&output.stdout).unwrap_or_else(|e| EcosystemReport {
                ecosystem: ecosystem.to_string(),
                lockfile: lockfile.clone(),
                counts: SeverityCounts::default(),
                vulnerabilities: vec![],
                tool_missing: false,
                tools_required: vec![],
                error: Some(e),
                scanned_at: Utc::now(),
            });
            report.ecosystem = ecosystem.to_string();
            report.lockfile = lockfile;
            report.scanned_at = Utc::now();
            report
        }
    }
}

// ── JSON parsers ──────────────────────────────────────────────────────────────

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
                advisory_id: entry["via"][0]["source"].as_u64().map(|id| id.to_string()),
                title: entry["via"][0]["title"].as_str().map(|s| s.to_string()),
                description: None,
                url: entry["via"][0]["url"].as_str().map(|s| s.to_string()),
                patched_versions: None,
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
        tools_required: vec!["npm".to_string()],
        error: None,
        scanned_at: Utc::now(),
    })
}

pub fn parse_cargo_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("cargo audit JSON parse error: {e}"))?;

    let vuln_list = json["vulnerabilities"]["list"].as_array().cloned().unwrap_or_default();
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
            .unwrap_or_else(|| advisory["severity"].as_str().unwrap_or("high").to_string());

        let range = item["versions"]["patched"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(", "))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "unpatched".to_string());

        let fix_available = item["versions"]["patched"].as_array().map(|a| !a.is_empty()).unwrap_or(false);

        match severity.as_str() {
            "critical" => counts.critical += 1,
            "high" => counts.high += 1,
            "moderate" | "medium" => counts.moderate += 1,
            "low" => counts.low += 1,
            _ => counts.info += 1,
        }
        counts.total += 1;

        vulnerabilities.push(VulnEntry {
            name,
            severity,
            range,
            fix_available,
            advisory_id,
            title: advisory["title"].as_str().map(|s| s.to_string()),
            description: advisory["description"].as_str().map(|s| s.to_string()),
            url: advisory["url"].as_str().map(|s| s.to_string()),
            patched_versions: Some(range.clone()),
        });
    }

    sort_vulns(&mut vulnerabilities);

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        tools_required: vec!["cargo".to_string(), "cargo-audit".to_string()],
        error: None,
        scanned_at: Utc::now(),
    })
}

pub fn parse_pip_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    let json: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| format!("pip-audit JSON parse error: {e}"))?;

    let dependencies = if json.is_array() {
        json.as_array().unwrap().clone()
    } else {
        json["dependencies"].as_array().cloned().unwrap_or_default()
    };

    let mut counts = SeverityCounts::default();
    let mut vulnerabilities: Vec<VulnEntry> = vec![];

    for dep in &dependencies {
        if let Some(vulns) = dep["vulnerabilities"].as_array() {
            for v in vulns {
                let severity = "high".to_string(); // pip-audit doesn't always expose severity
                counts.high += 1;
                counts.total += 1;

                vulnerabilities.push(VulnEntry {
                    name: dep["name"].as_str().unwrap_or("?").to_string(),
                    severity,
                    range: dep["version"].as_str().unwrap_or("*").to_string(),
                    fix_available: v["fix_versions"].as_array().map_or(false, |a| !a.is_empty()),
                    advisory_id: v["id"].as_str().map(String::from),
                    title: None,
                    description: v["description"].as_str().map(|s| s.to_string()),
                    url: None,
                    patched_versions: v["fix_versions"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")),
                });
            }
        }
    }

    Ok(EcosystemReport {
        ecosystem: String::new(),
        lockfile: String::new(),
        counts,
        vulnerabilities,
        tool_missing: false,
        tools_required: vec!["pip-audit".to_string()],
        error: None,
        scanned_at: Utc::now(),
    })
}

pub fn parse_govulncheck_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    // Basic placeholder for govulncheck NDJSON
    Ok(EcosystemReport {
        ecosystem: "go".to_string(),
        lockfile: "go.mod".to_string(),
        counts: SeverityCounts::default(),
        vulnerabilities: vec![],
        tool_missing: false,
        tools_required: vec!["govulncheck".to_string()],
        error: None,
        scanned_at: Utc::now(),
    })
}

pub fn parse_bundle_audit_json(stdout: &[u8]) -> Result<EcosystemReport, String> {
    Ok(EcosystemReport {
        ecosystem: "ruby".to_string(),
        lockfile: "Gemfile.lock".to_string(),
        counts: SeverityCounts::default(),
        vulnerabilities: vec![],
        tool_missing: false,
        tools_required: vec!["bundle-audit".to_string()],
        error: None,
        scanned_at: Utc::now(),
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn cvss_to_severity(score: f64) -> String {
    match score as u8 {
        0 => "none".to_string(),
        1..=3 => "low".to_string(),
        4..=6 => "moderate".to_string(),
        7..=8 => "high".to_string(),
        _ => "critical".to_string(),
    }
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

// ── Orchestrator ──────────────────────────────────────────────────────────────

pub fn run_full_audit(project_path: &str, options: ScanOptions) -> AuditReport {
    let base = PathBuf::from(project_path);
    if !base.exists() {
        return AuditReport {
            project_path: project_path.to_string(),
            scan_id: "error".to_string(),
            ecosystems: vec![],
            total_counts: SeverityCounts::default(),
            has_issues: false,
            error: Some(format!("Project path not found: {project_path}")),
            scanned_at: Utc::now(),
            options,
        };
    }

    let detected = detector::detect_ecosystems(&base);
    let reports: Vec<EcosystemReport> = detected
        .iter()
        .map(|(eco, lockfile)| run_ecosystem(&base, eco, lockfile, &options))
        .collect();

    let total_counts = aggregate_counts(&reports);
    let has_issues = total_counts.high > 0 || total_counts.critical > 0;

    AuditReport {
        project_path: project_path.to_string(),
        scan_id: format!("scan-{}", Utc::now().timestamp()),
        ecosystems: reports,
        total_counts,
        has_issues,
        error: None,
        scanned_at: Utc::now(),
        options,
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_all(
    project_path: String,
    options: Option<ScanOptions>,
    app: tauri::AppHandle,
) -> Result<AuditReport, String> {
    let options = options.unwrap_or_default();
    let report = run_full_audit(&project_path, options);
    app.emit(AUDIT_EVENT, &report).map_err(|e| e.to_string())?;
    Ok(report)
}

#[tauri::command]
pub async fn audit_dependencies(
    project_path: String,
    app: tauri::AppHandle,
) -> Result<AuditReport, String> {
    scan_all(project_path, None, app).await
}

#[tauri::command]
pub async fn validate_dependency(
    ecosystem: String,
    package: String,
    version: Option<String>,
) -> Result<Vec<VulnEntry>, String> {
    let handler: Box<dyn EcosystemHandler> = match ecosystem.as_str() {
        "npm" | "yarn" | "pnpm" => Box::new(ecosystems::npm::NpmHandler),
        "cargo" => Box::new(ecosystems::cargo::CargoHandler),
        _ => return Err(format!("Validation not supported for ecosystem: {ecosystem}")),
    };

    handler.validate_dependency(&package, version.as_deref())
}

#[tauri::command]
pub async fn watch_lockfile(
    project_path: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let mut watcher_lock = LOCKFILE_WATCHER.lock().unwrap();
    if watcher_lock.is_some() {
        return Ok(());
    }

    let app_clone = app.clone();
    let path_clone = project_path.clone();

    let mut debouncer = new_debouncer(Duration::from_secs(2), move |res: Result<Vec<DebouncedEvent>, _>| {
        if let Ok(_) = res {
            let report = run_full_audit(&path_clone, ScanOptions::default());
            app_clone.emit(AUDIT_EVENT, &report).ok();
        }
    }).map_err(|e| e.to_string())?;

    debouncer.watcher().watch(Path::new(&project_path), RecursiveMode::Recursive).map_err(|e| e.to_string())?;
    *watcher_lock = Some(debouncer);
    Ok(())
}
