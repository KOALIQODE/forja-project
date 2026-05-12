use super::detector;
use super::ecosystems::{Dependency, EcosystemHandler, ScanResult, Severity, Vulnerability};
use super::get_handlers;
use super::validate_repo;
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const CLONE_SESSION_ROOT: &str = "forja-clone-validation";
const CLONE_PROGRESS_EVENT: &str = "clone:progress";
const CLONE_SCAN_EVENT: &str = "clone:scan_results";
const INSTALL_PROGRESS_EVENT: &str = "install:progress";

static ACTIVE_CLONE_SESSION: Mutex<Option<CloneSession>> = Mutex::new(None);

#[derive(Debug, Clone)]
struct CloneSession {
    session_id: String,
    project_name: String,
    temp_path: PathBuf,
    final_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneAndValidateRequest {
    pub git_url: String,
    pub project_name: Option<String>,
    pub autofix: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneProgress {
    pub session_id: String,
    pub status: String,
    pub message: String,
    pub progress: u8,
    pub temp_path: Option<String>,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloneValidationResult {
    pub success: bool,
    pub session_id: String,
    pub temp_path: String,
    pub project_name: String,
    pub scans: Vec<ScanResult>,
    pub total_vulnerabilities: usize,
    pub critical_vulns: usize,
    pub high_vulns: usize,
    pub can_save: bool,
    pub can_safe_install: bool,
    pub confidence: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSaveRequest {
    pub session_id: String,
    pub destination_root: String,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSaveResult {
    pub success: bool,
    pub session_id: String,
    pub final_path: String,
    pub project_name: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallTarget {
    pub ecosystem: String,
    pub manifest_rel_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProjectDepsRequest {
    pub session_id: String,
    pub project_path: String,
    pub targets: Vec<InstallTarget>,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallDepsResult {
    pub success: bool,
    pub ecosystem: String,
    pub manifest_rel_path: String,
    pub mode: String,
    pub output: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallProgress {
    pub session_id: String,
    pub ecosystem: String,
    pub manifest_rel_path: String,
    pub status: String,
    pub message: String,
    pub progress: u8,
}

#[tauri::command]
pub async fn clone_and_validate(
    req: CloneAndValidateRequest,
    app: AppHandle,
) -> Result<CloneValidationResult, String> {
    let git_url = req.git_url.trim();
    if git_url.is_empty() {
        return Err("Repository URL is required.".to_string());
    }
    // Basic safety checks for repository URL
    if git_url.len() > 2048 {
        return Err("Repository URL is too long.".to_string());
    }
    if git_url.chars().any(|c| c.is_whitespace()) {
        return Err("Repository URL must not contain whitespace.".to_string());
    }
    let lower = git_url.to_ascii_lowercase();
    if lower.starts_with("file://")
        || git_url.starts_with('/')
        || git_url.starts_with("./")
        || git_url.starts_with("../")
    {
        return Err("Local file paths are not allowed for repository URL.".to_string());
    }
    // Accept http(s)://, ssh://, git://, or scp-like 'user@host:repo' formats
    let scp_re = regex::Regex::new(r"^[\w\.\-]+@[\w\.\-]+:.+").map_err(|e| e.to_string())?;
    if !(git_url.starts_with("http://")
        || git_url.starts_with("https://")
        || git_url.starts_with("ssh://")
        || git_url.starts_with("git://")
        || scp_re.is_match(git_url))
    {
        return Err(
            "Repository URL format not recognized. Use https://, ssh://, git:// or user@host:repo"
                .to_string(),
        );
    }
    // Whitelist hosts to avoid cloning arbitrary internal hosts
    let allowed_hosts = ["github.com", "gitlab.com", "bitbucket.org"];
    let host_opt = if git_url.starts_with("http://")
        || git_url.starts_with("https://")
        || git_url.starts_with("ssh://")
        || git_url.starts_with("git://")
    {
        let after_scheme = git_url.splitn(2, "://").nth(1).unwrap_or("");
        let no_user = if after_scheme.contains('@') {
            after_scheme.splitn(2, '@').nth(1).unwrap_or(after_scheme)
        } else {
            after_scheme
        };
        no_user
            .split(|c: char| c == '/' || c == ':' || c == '?')
            .next()
            .map(|s| s.to_string())
    } else {
        if let Some(at_pos) = git_url.find('@') {
            let after_at = &git_url[at_pos + 1..];
            if let Some(colon_pos) = after_at.find(':') {
                Some(after_at[..colon_pos].to_string())
            } else {
                None
            }
        } else {
            None
        }
    };
    if let Some(host) = host_opt {
        let host_allowed = allowed_hosts
            .iter()
            .any(|allowed| host.eq(allowed) || host.ends_with(&format!(".{}", allowed)));
        // Trust Hub usage disabled: rely only on built-in whitelist by default
        // let host_trusted = crate::trust::host_trusted(&host);
        if !host_allowed {
            return Err(format!(
                "Repository host '{}' is not in the allowed list.",
                host
            ));
        }
    } else {
        return Err("Unable to determine repository host for whitelist check.".to_string());
    }

    {
        let mut session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
        if let Some(existing) = session_lock.as_ref() {
            if existing.temp_path.exists() || existing.final_path.is_some() {
                return Err("Another clone validation session is already active.".to_string());
            }
            *session_lock = None;
        }
    }

    let session_id = format!("clone-{}", Utc::now().timestamp_millis());
    let requested_project_name = req
        .project_name
        .unwrap_or_else(|| derive_project_name(git_url));
    let project_name = sanitize_project_name(&requested_project_name);
    if project_name.len() > 200 {
        return Err("Project name is too long after sanitization.".to_string());
    }
    let autofix = req.autofix.unwrap_or(false);
    let session_root = clone_session_root().join(&session_id);
    let temp_project = session_root.join(&project_name);

    std::fs::create_dir_all(&session_root).map_err(|error| error.to_string())?;

    emit_clone_progress(
        &app,
        CloneProgress {
            session_id: session_id.clone(),
            status: "cloning".to_string(),
            message: format!("Cloning {git_url}"),
            progress: 10,
            temp_path: None,
            project_name: Some(project_name.clone()),
        },
    );

    let output = Command::new("git")
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "clone",
            "--depth",
            "1",
            "--quiet",
            git_url,
            temp_project.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|error| format!("Git clone failed: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = remove_path(&session_root);
        return Err(if stderr.is_empty() {
            "Clone failed.".to_string()
        } else {
            format!("Clone failed: {stderr}")
        });
    }

    emit_clone_progress(
        &app,
        CloneProgress {
            session_id: session_id.clone(),
            status: "detecting".to_string(),
            message: "Detecting dependency manifests...".to_string(),
            progress: 30,
            temp_path: Some(temp_project.to_string_lossy().to_string()),
            project_name: Some(project_name.clone()),
        },
    );

    let handlers = get_handlers();
    let manifests = detector::detect_all_manifests(&temp_project, &handlers);
    let handler_map: HashMap<&str, &Box<dyn EcosystemHandler>> = handlers
        .iter()
        .map(|handler| (handler.name(), handler))
        .collect();

    // If requested, apply autofix to supported manifests (remove '^'/'~' and pin versions)
    let autofix_requested = autofix;
    if autofix_requested && !manifests.is_empty() {
        emit_clone_progress(
            &app,
            CloneProgress {
                session_id: session_id.clone(),
                status: "autofixing".to_string(),
                message: "Applying autofix to dependency manifests (pinning versions)..."
                    .to_string(),
                progress: 35,
                temp_path: Some(temp_project.to_string_lossy().to_string()),
                project_name: Some(project_name.clone()),
            },
        );

        for (manifest_path, ecosystem_name) in manifests.iter() {
            if ecosystem_name == "npm" {
                match apply_autofix_npm(manifest_path) {
                    Ok(changed) => {
                        if changed {
                            emit_clone_progress(
                                &app,
                                CloneProgress {
                                    session_id: session_id.clone(),
                                    status: "autofix-applied".to_string(),
                                    message: format!(
                                        "Autofix applied to {}",
                                        manifest_path.display()
                                    ),
                                    progress: 38,
                                    temp_path: Some(temp_project.to_string_lossy().to_string()),
                                    project_name: Some(project_name.clone()),
                                },
                            );
                        }
                    }
                    Err(e) => {
                        let _ = emit_clone_progress(
                            &app,
                            CloneProgress {
                                session_id: session_id.clone(),
                                status: "autofix-error".to_string(),
                                message: format!(
                                    "Autofix failed for {}: {}",
                                    manifest_path.display(),
                                    e
                                ),
                                progress: 36,
                                temp_path: Some(temp_project.to_string_lossy().to_string()),
                                project_name: Some(project_name.clone()),
                            },
                        );
                    }
                }
            } else if ecosystem_name == "cargo" {
                match apply_autofix_cargo(manifest_path) {
                    Ok(changed) => {
                        if changed {
                            emit_clone_progress(
                                &app,
                                CloneProgress {
                                    session_id: session_id.clone(),
                                    status: "autofix-applied".to_string(),
                                    message: format!(
                                        "Autofix applied to {}",
                                        manifest_path.display()
                                    ),
                                    progress: 38,
                                    temp_path: Some(temp_project.to_string_lossy().to_string()),
                                    project_name: Some(project_name.clone()),
                                },
                            );
                        }
                    }
                    Err(e) => {
                        let _ = emit_clone_progress(
                            &app,
                            CloneProgress {
                                session_id: session_id.clone(),
                                status: "autofix-error".to_string(),
                                message: format!(
                                    "Autofix failed for {}: {}",
                                    manifest_path.display(),
                                    e
                                ),
                                progress: 36,
                                temp_path: Some(temp_project.to_string_lossy().to_string()),
                                project_name: Some(project_name.clone()),
                            },
                        );
                    }
                }
            }
        }
    }

    let mut scans = Vec::new();
    let mut total_critical: usize = 0;
    let mut total_high: usize = 0;
    let mut total_vulnerabilities: usize = 0;
    let mut exact_confidence = true;

    let client = Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("forja-studio/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    if manifests.is_empty() {
        scans = Vec::new();
    } else {
        for (index, (manifest_path, ecosystem_name)) in manifests.iter().enumerate() {
            emit_clone_progress(
                &app,
                CloneProgress {
                    session_id: session_id.clone(),
                    status: "auditing".to_string(),
                    message: format!(
                        "Auditing {} ({}/{})",
                        manifest_path
                            .file_name()
                            .map(|name| name.to_string_lossy().to_string())
                            .unwrap_or_else(|| ecosystem_name.clone()),
                        index + 1,
                        manifests.len()
                    ),
                    progress: 45 + (((index + 1) * 45) / manifests.len()) as u8,
                    temp_path: Some(temp_project.to_string_lossy().to_string()),
                    project_name: Some(project_name.clone()),
                },
            );

            let Some(handler) = handler_map.get(ecosystem_name.as_str()) else {
                continue;
            };

            let scan = scan_manifest_for_clone(manifest_path, handler.as_ref(), &client)
                .await
                .unwrap_or_else(|error| ScanResult {
                    manifest_path: manifest_path.to_string_lossy().to_string(),
                    ecosystem: handler.name().to_string(),
                    language: handler.language().to_string(),
                    dependencies: vec![],
                    summary: Default::default(),
                    scanned_at: Utc::now().to_rfc3339(),
                    errors: vec![error],
                });

            total_critical += scan.summary.critical as usize;
            total_high += scan.summary.high as usize;
            total_vulnerabilities += (scan.summary.critical
                + scan.summary.high
                + scan.summary.moderate
                + scan.summary.low) as usize;

            if scan
                .errors
                .iter()
                .any(|error| error.contains("manifest-only") || error.contains("Remote advisory"))
            {
                exact_confidence = false;
            }

            scans.push(scan);
        }
    }

    let can_save = true;
    let can_safe_install = total_critical == 0;
    let confidence = if scans.is_empty() {
        "no-manifests".to_string()
    } else if exact_confidence {
        "locked".to_string()
    } else {
        "manifest-only".to_string()
    };

    let message = if scans.is_empty() {
        "Repository cloned. No supported dependency manifests were detected.".to_string()
    } else if can_safe_install {
        "Repository validated. Ready to save or safe-install dependencies.".to_string()
    } else {
        "Critical vulnerabilities found. Saving is allowed, safe install is blocked.".to_string()
    };

    // Repository-level checks (plaintext .env secrets, lockfile injection, etc.)
    let mut final_scans = scans.clone();
    if let Ok(Some(repo_scan)) = validate_repo::build_repository_warning_scan(&temp_project) {
        final_scans.push(repo_scan);
    }

    let result = CloneValidationResult {
        success: true,
        session_id: session_id.clone(),
        temp_path: temp_project.to_string_lossy().to_string(),
        project_name: project_name.clone(),
        scans: final_scans.clone(),
        total_vulnerabilities,
        critical_vulns: total_critical,
        high_vulns: total_high,
        can_save,
        can_safe_install,
        confidence,
        message: message.clone(),
    };

    {
        let mut session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
        *session_lock = Some(CloneSession {
            session_id: session_id.clone(),
            project_name: project_name.clone(),
            temp_path: temp_project.clone(),
            final_path: None,
        });
    }

    // Emit scan results immediately so the UI can show the report in real-time
    let _ = emit_clone_scan(&app, result.clone());

    emit_clone_progress(
        &app,
        CloneProgress {
            session_id: session_id.clone(),
            status: "ready".to_string(),
            message,
            progress: 100,
            temp_path: Some(temp_project.to_string_lossy().to_string()),
            project_name: Some(project_name),
        },
    );

    Ok(result)
}

#[tauri::command]
pub async fn save_validated_project(
    req: ProjectSaveRequest,
    app: AppHandle,
) -> Result<ProjectSaveResult, String> {
    let (session_id, temp_path, current_project_name) = {
        let session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
        let session = session_lock
            .as_ref()
            .ok_or_else(|| "No active clone session was found.".to_string())?;

        if session.session_id != req.session_id {
            return Err("Clone session mismatch.".to_string());
        }

        (
            session.session_id.clone(),
            session.temp_path.clone(),
            session.project_name.clone(),
        )
    };

    let project_name = sanitize_project_name(
        req.project_name
            .as_deref()
            .unwrap_or(current_project_name.as_str()),
    );
    let destination_root = PathBuf::from(req.destination_root.trim());

    if destination_root.as_os_str().is_empty() {
        return Err("A destination folder is required.".to_string());
    }

    emit_clone_progress(
        &app,
        CloneProgress {
            session_id: session_id.clone(),
            status: "saving".to_string(),
            message: format!("Saving {project_name}..."),
            progress: 15,
            temp_path: Some(temp_path.to_string_lossy().to_string()),
            project_name: Some(project_name.clone()),
        },
    );

    std::fs::create_dir_all(&destination_root).map_err(|error| error.to_string())?;

    let final_path = destination_root.join(&project_name);
    if final_path.exists() {
        remove_path(&final_path)?;
    }

    move_or_copy_dir(&temp_path, &final_path)?;

    let mut session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
    let session = session_lock
        .as_mut()
        .ok_or_else(|| "No active clone session was found.".to_string())?;

    if session.session_id != req.session_id {
        return Err("Clone session mismatch.".to_string());
    }

    session.project_name = project_name.clone();
    session.final_path = Some(final_path.clone());

    emit_clone_progress(
        &app,
        CloneProgress {
            session_id: session.session_id.clone(),
            status: "saved".to_string(),
            message: format!("Project saved to {}", final_path.display()),
            progress: 100,
            temp_path: Some(final_path.to_string_lossy().to_string()),
            project_name: Some(project_name.clone()),
        },
    );

    Ok(ProjectSaveResult {
        success: true,
        session_id: session.session_id.clone(),
        final_path: final_path.to_string_lossy().to_string(),
        project_name,
        message: "Project saved successfully.".to_string(),
    })
}

#[tauri::command]
pub async fn install_project_deps(
    req: InstallProjectDepsRequest,
    app: AppHandle,
) -> Result<Vec<InstallDepsResult>, String> {
    let mode = match req.mode.as_str() {
        "safe" | "full" => req.mode.clone(),
        _ => return Err("Install mode must be `safe` or `full`.".to_string()),
    };

    let expected_project_path = {
        let session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
        let session = session_lock
            .as_ref()
            .ok_or_else(|| "No active clone session was found.".to_string())?;

        if session.session_id != req.session_id {
            return Err("Clone session mismatch.".to_string());
        }

        session
            .final_path
            .clone()
            .ok_or_else(|| "Project must be saved before installing dependencies.".to_string())?
    };

    let project_path = PathBuf::from(req.project_path.trim());
    if !project_path.exists() {
        return Err("Saved project path does not exist.".to_string());
    }
    if project_path != expected_project_path {
        return Err("Install path does not match the active validated project.".to_string());
    }

    let targets = if req.targets.is_empty() {
        let handlers = get_handlers();
        detector::detect_all_manifests(&project_path, &handlers)
            .into_iter()
            .map(|(path, ecosystem)| InstallTarget {
                ecosystem,
                manifest_rel_path: path
                    .strip_prefix(&project_path)
                    .unwrap_or(path.as_path())
                    .to_string_lossy()
                    .to_string(),
            })
            .collect::<Vec<_>>()
    } else {
        req.targets
    };

    let mut results = Vec::new();
    let total_targets = targets.len().max(1);

    for (index, target) in targets.iter().enumerate() {
        let manifest_path = project_path.join(&target.manifest_rel_path);
        if !manifest_path.exists() {
            results.push(InstallDepsResult {
                success: false,
                ecosystem: target.ecosystem.clone(),
                manifest_rel_path: target.manifest_rel_path.clone(),
                mode: mode.clone(),
                output: String::new(),
                message: "Manifest path does not exist.".to_string(),
            });
            continue;
        }

        emit_install_progress(
            &app,
            InstallProgress {
                session_id: req.session_id.clone(),
                ecosystem: target.ecosystem.clone(),
                manifest_rel_path: target.manifest_rel_path.clone(),
                status: "installing".to_string(),
                message: format!("{} ({}/{})", target.ecosystem, index + 1, total_targets),
                progress: (((index) * 100) / total_targets) as u8,
            },
        );

        let output = run_install_for_target(&manifest_path, &target.ecosystem, &mode)?;
        let success = output.status.success();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let message = if success {
            format!("{} {} completed.", target.ecosystem, mode)
        } else {
            format!("{} {} failed.", target.ecosystem, mode)
        };

        emit_install_progress(
            &app,
            InstallProgress {
                session_id: req.session_id.clone(),
                ecosystem: target.ecosystem.clone(),
                manifest_rel_path: target.manifest_rel_path.clone(),
                status: if success {
                    "done".to_string()
                } else {
                    "error".to_string()
                },
                message: message.clone(),
                progress: ((((index + 1) * 100) / total_targets) as u8).min(100),
            },
        );

        results.push(InstallDepsResult {
            success,
            ecosystem: target.ecosystem.clone(),
            manifest_rel_path: target.manifest_rel_path.clone(),
            mode: mode.clone(),
            output: format!("STDOUT:\n{stdout}\n\nSTDERR:\n{stderr}"),
            message,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn cleanup_clone_session(session_id: String) -> Result<(), String> {
    let mut session_lock = ACTIVE_CLONE_SESSION.lock().unwrap();
    let Some(session) = session_lock.as_ref() else {
        return Ok(());
    };

    if session.session_id != session_id {
        return Err("Clone session mismatch.".to_string());
    }

    let temp_root = session
        .temp_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| session.temp_path.clone());
    let _ = remove_path(&temp_root);
    *session_lock = None;
    Ok(())
}

async fn scan_manifest_for_clone(
    manifest_path: &Path,
    handler: &dyn EcosystemHandler,
    client: &Client,
) -> Result<ScanResult, String> {
    let mut dependencies = handler.parse_dependencies(manifest_path)?;
    let mut errors = Vec::new();

    if dependencies.is_empty() {
        return Ok(ScanResult {
            manifest_path: manifest_path.to_string_lossy().to_string(),
            ecosystem: handler.name().to_string(),
            language: handler.language().to_string(),
            dependencies,
            summary: Default::default(),
            scanned_at: Utc::now().to_rfc3339(),
            errors,
        });
    }

    let local_vulnerabilities: HashMap<String, Vec<Vulnerability>> =
        handler.run_audit(manifest_path).into_iter().collect();
    let local_outdated: HashMap<String, String> =
        handler.check_outdated(manifest_path).into_iter().collect();

    for dependency in &mut dependencies {
        if let Some(vulnerabilities) = local_vulnerabilities.get(&dependency.name) {
            dependency.vulnerabilities = vulnerabilities.clone();
        }
        if let Some(latest) = local_outdated.get(&dependency.name) {
            dependency.latest = Some(latest.clone());
            dependency.is_outdated = true;
        }
    }

    let lockfile_present = has_lockfile_for_manifest(manifest_path, handler.name());
    let should_use_remote =
        local_vulnerabilities.is_empty() && supports_remote_lookup(handler.name());

    if should_use_remote {
        enrich_with_remote_metadata(&mut dependencies, handler.name(), client).await?;
        if lockfile_present {
            errors.push(
                "Remote advisory lookup used because no local audit tool result was available."
                    .to_string(),
            );
        } else {
            errors
                .push("Lockfile not found; manifest-only remote advisory lookup used.".to_string());
        }
    } else if !lockfile_present {
        errors.push(
            "Lockfile not found; advisory results may be broader than the final install."
                .to_string(),
        );
    }

    dependencies.sort_by(|left, right| {
        let left_severity = left
            .vulnerabilities
            .iter()
            .map(|entry| entry.severity.score())
            .max()
            .unwrap_or(0);
        let right_severity = right
            .vulnerabilities
            .iter()
            .map(|entry| entry.severity.score())
            .max()
            .unwrap_or(0);
        right_severity.cmp(&left_severity)
    });

    // Best-practices: warn about non-exact versions and caret usage (^)
    if handler.name() == "npm" {
        if let Ok(text) = std::fs::read_to_string(manifest_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                for section in [
                    "dependencies",
                    "devDependencies",
                    "peerDependencies",
                    "optionalDependencies",
                ] {
                    if let Some(obj) = json.get(section).and_then(|v| v.as_object()) {
                        for (name, ver_val) in obj {
                            if let Some(ver_str) = ver_val.as_str() {
                                let ver_trim = ver_str.trim();
                                if ver_trim.starts_with('^') {
                                    errors.push(format!(
                                        "Manifest uses caret (^) for {}: '{}'. Consider pinning exact versions (remove '^').",
                                        name,
                                        ver_str
                                    ));
                                } else if !is_exact_version(ver_trim) {
                                    errors.push(format!(
                                        "Manifest uses non-exact version for {}: '{}'. Consider pinning exact versions.",
                                        name,
                                        ver_str
                                    ));
                                }
                                if ver_trim.eq_ignore_ascii_case("latest") || ver_trim.contains('*')
                                {
                                    errors.push(format!(
                                        "Manifest uses '{}' for {} which is not pinned. Avoid 'latest' or wildcards.",
                                        ver_str,
                                        name
                                    ));
                                }
                            }
                        }
                    }
                }

                // lifecycle script checks and suspicious remote commands
                if let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) {
                    let lifecycle_keys = [
                        "install",
                        "preinstall",
                        "postinstall",
                        "prepare",
                        "prepublish",
                        "prepublishOnly",
                        "prepack",
                    ];
                    for (k, cmd_val) in scripts {
                        let key = k.as_str();
                        let cmd_str = cmd_val.as_str().unwrap_or("").trim();
                        if lifecycle_keys.contains(&key) {
                            if !cmd_str.is_empty() {
                                errors.push(format!(
                                    "package.json contains lifecycle script '{}' -> '{}'. These run on install and can execute arbitrary code; review before installing.",
                                    key, cmd_str
                                ));
                            } else {
                                errors.push(format!(
                                    "package.json contains lifecycle script '{}' with non-string value; review before installing.",
                                    key
                                ));
                            }
                        } else if !cmd_str.is_empty() {
                            let lower = cmd_str.to_ascii_lowercase();
                            if lower.contains("curl ")
                                || lower.contains("wget ")
                                || lower.contains("| sh")
                                || lower.contains("`curl")
                                || lower.contains("python -c")
                                || lower.contains("node -e")
                            {
                                errors.push(format!(
                                    "package.json script '{}' contains potentially unsafe remote execution: '{}'. Review before running.",
                                    key, cmd_str
                                ));
                            }
                        }
                    }
                }
            }
        }
    } else {
        for dep in &dependencies {
            let ver = dep.version.trim();
            if !is_exact_version(ver) {
                errors.push(format!(
                    "Dependency '{}' uses non-exact/uncertain version '{}'. Prefer an exact version (e.g., '1.2.3') for reproducibility.",
                    dep.name,
                    dep.version
                ));
            }
            if ver.eq_ignore_ascii_case("latest") || ver.contains('*') {
                errors.push(format!(
                    "Dependency '{}' uses '{}' which is not pinned. Avoid 'latest' or wildcards.",
                    dep.name, dep.version
                ));
            }
        }
    }

    let summary = super::ecosystems::build_summary(&dependencies);

    Ok(ScanResult {
        manifest_path: manifest_path.to_string_lossy().to_string(),
        ecosystem: handler.name().to_string(),
        language: handler.language().to_string(),
        dependencies,
        summary,
        scanned_at: Utc::now().to_rfc3339(),
        errors,
    })
}

async fn enrich_with_remote_metadata(
    dependencies: &mut [Dependency],
    ecosystem: &str,
    client: &Client,
) -> Result<(), String> {
    match ecosystem {
        "npm" => {
            for dependency in dependencies {
                if let Some(latest) = fetch_npm_latest(client, &dependency.name).await? {
                    if latest != dependency.version {
                        dependency.latest = Some(latest);
                        dependency.is_outdated = true;
                    }
                }
                if dependency.vulnerabilities.is_empty() {
                    dependency.vulnerabilities = query_osv_for_package(
                        client,
                        &dependency.name,
                        "npm",
                        Some(&dependency.version),
                    )
                    .await?;
                }
            }
        }
        "cargo" => {
            for dependency in dependencies {
                if let Some(latest) = fetch_cargo_latest(client, &dependency.name).await? {
                    if latest != dependency.version {
                        dependency.latest = Some(latest);
                        dependency.is_outdated = true;
                    }
                }
                if dependency.vulnerabilities.is_empty() {
                    dependency.vulnerabilities = query_osv_for_package(
                        client,
                        &dependency.name,
                        "crates.io",
                        Some(&dependency.version),
                    )
                    .await?;
                }
            }
        }
        "pip" => {
            for dependency in dependencies {
                if let Some(latest) = fetch_pypi_latest(client, &dependency.name).await? {
                    if latest != dependency.version {
                        dependency.latest = Some(latest);
                        dependency.is_outdated = true;
                    }
                }
                if dependency.vulnerabilities.is_empty() {
                    dependency.vulnerabilities = query_osv_for_package(
                        client,
                        &dependency.name,
                        "PyPI",
                        Some(&dependency.version),
                    )
                    .await?;
                }
            }
        }
        "composer" => {
            for dependency in dependencies {
                if let Some(latest) = fetch_packagist_latest(client, &dependency.name).await? {
                    if latest != dependency.version {
                        dependency.latest = Some(latest);
                        dependency.is_outdated = true;
                    }
                }
                if dependency.vulnerabilities.is_empty() {
                    dependency.vulnerabilities = query_osv_for_package(
                        client,
                        &dependency.name,
                        "Packagist",
                        Some(&dependency.version),
                    )
                    .await?;
                }
            }
        }
        _ => {}
    }

    Ok(())
}

fn supports_remote_lookup(ecosystem: &str) -> bool {
    matches!(ecosystem, "npm" | "cargo" | "pip" | "composer")
}

fn has_lockfile_for_manifest(manifest_path: &Path, ecosystem: &str) -> bool {
    let Some(dir) = manifest_path.parent() else {
        return false;
    };

    let lockfiles: &[&str] = match ecosystem {
        "npm" => &[
            "package-lock.json",
            "npm-shrinkwrap.json",
            "yarn.lock",
            "pnpm-lock.yaml",
        ],
        "cargo" => &["Cargo.lock"],
        "pip" => &[
            "poetry.lock",
            "Pipfile.lock",
            "requirements.lock",
            "uv.lock",
        ],
        "composer" => &["composer.lock"],
        "go" => &["go.sum"],
        _ => &[],
    };

    lockfiles.iter().any(|name| dir.join(name).exists())
}

async fn fetch_npm_latest(client: &Client, package_name: &str) -> Result<Option<String>, String> {
    let encoded = encode_registry_path(package_name);
    let response = client
        .get(format!("https://registry.npmjs.org/{encoded}"))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: Value = response.json().await.map_err(|error| error.to_string())?;
    Ok(json
        .get("dist-tags")
        .and_then(|tags| tags.get("latest"))
        .and_then(Value::as_str)
        .map(str::to_string))
}

async fn fetch_cargo_latest(client: &Client, crate_name: &str) -> Result<Option<String>, String> {
    let response = client
        .get(format!("https://crates.io/api/v1/crates/{crate_name}"))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: Value = response.json().await.map_err(|error| error.to_string())?;
    Ok(json
        .get("crate")
        .and_then(Value::as_object)
        .and_then(|krate| {
            krate
                .get("max_stable_version")
                .or_else(|| krate.get("max_version"))
        })
        .and_then(Value::as_str)
        .map(str::to_string))
}

async fn fetch_pypi_latest(client: &Client, package_name: &str) -> Result<Option<String>, String> {
    let response = client
        .get(format!("https://pypi.org/pypi/{package_name}/json"))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: Value = response.json().await.map_err(|error| error.to_string())?;
    Ok(json
        .get("info")
        .and_then(Value::as_object)
        .and_then(|info| info.get("version"))
        .and_then(Value::as_str)
        .map(str::to_string))
}

async fn fetch_packagist_latest(
    client: &Client,
    package_name: &str,
) -> Result<Option<String>, String> {
    let response = client
        .get(format!("https://repo.packagist.org/p2/{package_name}.json"))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let json: Value = response.json().await.map_err(|error| error.to_string())?;
    Ok(json
        .get("packages")
        .and_then(|packages| packages.get(package_name))
        .and_then(Value::as_array)
        .and_then(|versions| versions.first())
        .and_then(|release| {
            release
                .get("version_normalized")
                .or_else(|| release.get("version"))
        })
        .and_then(Value::as_str)
        .map(str::to_string))
}

async fn query_osv_for_package(
    client: &Client,
    package_name: &str,
    ecosystem: &str,
    version: Option<&str>,
) -> Result<Vec<Vulnerability>, String> {
    let mut payload = serde_json::json!({
        "package": {
            "name": package_name,
            "ecosystem": ecosystem
        }
    });

    if let Some(version) = version.filter(|value| is_exact_version(value)) {
        payload["version"] = serde_json::json!(version);
    }

    let response = client
        .post("https://api.osv.dev/v1/query")
        .json(&payload)
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Ok(vec![]);
    }

    let json: Value = response.json().await.map_err(|error| error.to_string())?;
    let mut vulnerabilities = Vec::new();

    if let Some(entries) = json.get("vulnerabilities").and_then(Value::as_array) {
        for entry in entries {
            vulnerabilities.push(Vulnerability {
                id: entry
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                severity: osv_severity(entry),
                title: entry
                    .get("summary")
                    .and_then(Value::as_str)
                    .or_else(|| entry.get("details").and_then(Value::as_str))
                    .unwrap_or("Vulnerability")
                    .to_string(),
                description: entry
                    .get("details")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                url: entry
                    .get("references")
                    .and_then(Value::as_array)
                    .and_then(|references| references.first())
                    .and_then(|reference| reference.get("url"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                patched_versions: osv_fixed_version(entry),
            });
        }
    }

    Ok(vulnerabilities)
}

fn osv_severity(entry: &Value) -> Severity {
    if let Some(value) = entry
        .pointer("/database_specific/severity")
        .or_else(|| entry.pointer("/ecosystem_specific/severity"))
        .and_then(Value::as_str)
    {
        return map_severity_label(value);
    }

    if let Some(score) = entry
        .pointer("/database_specific/cvss/score")
        .and_then(Value::as_f64)
    {
        return cvss_to_severity(score);
    }

    Severity::Unknown
}

fn osv_fixed_version(entry: &Value) -> Option<String> {
    entry
        .get("affected")
        .and_then(Value::as_array)
        .and_then(|affected| {
            for item in affected {
                if let Some(ranges) = item.get("ranges").and_then(Value::as_array) {
                    for range in ranges {
                        if let Some(events) = range.get("events").and_then(Value::as_array) {
                            for event in events {
                                if let Some(fixed) = event.get("fixed").and_then(Value::as_str) {
                                    return Some(fixed.to_string());
                                }
                            }
                        }
                    }
                }
            }
            None
        })
}

fn map_severity_label(value: &str) -> Severity {
    match value.to_ascii_lowercase().as_str() {
        "critical" => Severity::Critical,
        "high" => Severity::High,
        "moderate" | "medium" => Severity::Moderate,
        "low" => Severity::Low,
        _ => Severity::Unknown,
    }
}

fn cvss_to_severity(score: f64) -> Severity {
    if score >= 9.0 {
        Severity::Critical
    } else if score >= 7.0 {
        Severity::High
    } else if score >= 4.0 {
        Severity::Moderate
    } else if score > 0.0 {
        Severity::Low
    } else {
        Severity::Unknown
    }
}

// Autofix helpers: remove leading ^/~ from versions in manifests for supported ecosystems
fn apply_autofix_npm(manifest_path: &Path) -> Result<bool, String> {
    let text = std::fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let mut json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut changed = false;

    for section in [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
    ] {
        if let Some(map) = json.get_mut(section).and_then(|v| v.as_object_mut()) {
            for (_name, ver_val) in map.iter_mut() {
                if let Some(s) = ver_val.as_str() {
                    let trimmed = s.trim();
                    if trimmed.starts_with('^') || trimmed.starts_with('~') {
                        let new_ver = trimmed.trim_start_matches(['^', '~', ' ']).to_string();
                        *ver_val = serde_json::Value::String(new_ver);
                        changed = true;
                    }
                }
            }
        }
    }

    if changed {
        let backup = manifest_path.with_file_name(format!(
            "{}.forja.bak",
            manifest_path.file_name().unwrap().to_string_lossy()
        ));
        let _ = std::fs::copy(manifest_path, &backup).map_err(|e| e.to_string())?;
        let new_text = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
        std::fs::write(manifest_path, new_text).map_err(|e| e.to_string())?;
    }

    Ok(changed)
}

fn apply_autofix_cargo(manifest_path: &Path) -> Result<bool, String> {
    let text = std::fs::read_to_string(manifest_path).map_err(|e| e.to_string())?;
    let mut val: toml::Value = toml::from_str(&text).map_err(|e| e.to_string())?;
    let mut changed = false;

    for section in ["dependencies", "dev-dependencies", "build-dependencies"] {
        if let Some(table) = val.get_mut(section).and_then(|v| v.as_table_mut()) {
            for (_name, spec) in table.iter_mut() {
                match spec {
                    toml::Value::String(s) => {
                        let trimmed = s.trim();
                        if trimmed.starts_with('^') || trimmed.starts_with('~') {
                            let new_s = trimmed.trim_start_matches(['^', '~', ' ']).to_string();
                            *spec = toml::Value::String(new_s);
                            changed = true;
                        }
                    }
                    toml::Value::Table(t) => {
                        if let Some(ver_value) = t.get_mut("version") {
                            if let Some(s) = ver_value.as_str() {
                                let trimmed = s.trim();
                                if trimmed.starts_with('^') || trimmed.starts_with('~') {
                                    let new_s =
                                        trimmed.trim_start_matches(['^', '~', ' ']).to_string();
                                    *ver_value = toml::Value::String(new_s);
                                    changed = true;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    if changed {
        let backup = manifest_path.with_file_name(format!(
            "{}.forja.bak",
            manifest_path.file_name().unwrap().to_string_lossy()
        ));
        let _ = std::fs::copy(manifest_path, &backup).map_err(|e| e.to_string())?;
        let new_text = toml::to_string_pretty(&val).map_err(|e| e.to_string())?;
        std::fs::write(manifest_path, new_text).map_err(|e| e.to_string())?;
    }

    Ok(changed)
}

fn is_exact_version(version: &str) -> bool {
    let trimmed = version.trim();
    !trimmed.is_empty()
        && !trimmed.eq_ignore_ascii_case("latest")
        && !trimmed.contains(['*', '^', '~', '>', '<', '=', '|', ',', ' '])
}

fn encode_registry_path(value: &str) -> String {
    value.replace('/', "%2f")
}

fn derive_project_name(git_url: &str) -> String {
    let trimmed = git_url.trim().trim_end_matches('/');
    let last_segment = trimmed
        .rsplit(['/', ':'])
        .next()
        .unwrap_or("repository")
        .trim_end_matches(".git");
    sanitize_project_name(last_segment)
}

fn sanitize_project_name(value: &str) -> String {
    let mut normalized = String::new();

    for character in value.trim().chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
            normalized.push(character);
        } else if (character.is_whitespace() || matches!(character, '/' | '\\'))
            && !normalized.ends_with('-')
        {
            normalized.push('-');
        }
    }

    let normalized = normalized.trim_matches(['-', '.']).to_string();
    if normalized.is_empty() {
        "repository".to_string()
    } else {
        normalized
    }
}

fn clone_session_root() -> PathBuf {
    std::env::temp_dir().join(CLONE_SESSION_ROOT)
}

fn move_or_copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    if let Err(rename_error) = std::fs::rename(from, to) {
        copy_dir_recursive(from, to).map_err(|error| {
            format!("Failed to save project after rename error ({rename_error}): {error}")
        })?;
        remove_path(from)?;
    }

    Ok(())
}

fn remove_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        std::fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        std::fs::remove_file(path).map_err(|error| error.to_string())
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|error| error.to_string())?;

    for entry in std::fs::read_dir(src).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let destination = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &destination)?;
        } else {
            std::fs::copy(&path, &destination).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn run_install_for_target(
    manifest_path: &Path,
    ecosystem: &str,
    mode: &str,
) -> Result<std::process::Output, String> {
    let dir = manifest_path
        .parent()
        .ok_or_else(|| "Manifest has no parent directory.".to_string())?;

    let mut command = match ecosystem {
        "npm" => {
            let mut command = Command::new("npm");
            if dir.join("package-lock.json").exists() {
                command.arg("ci");
            } else {
                command.arg("install");
            }
            command.args(["--no-audit", "--no-fund"]);
            if mode == "safe" {
                command.arg("--ignore-scripts");
            }
            command
        }
        "cargo" => {
            let mut command = Command::new("cargo");
            if mode == "safe" {
                command.arg("fetch");
            } else {
                command.arg("build");
            }
            if dir.join("Cargo.lock").exists() {
                command.arg("--locked");
            }
            command
        }
        "pip" => {
            let mut command = Command::new("python3");
            command.arg("-m").arg("pip");
            if mode == "safe" {
                let download_dir = dir.join(".forja-pip-cache");
                let _ = std::fs::create_dir_all(&download_dir);
                command.args([
                    "download",
                    "-r",
                    manifest_path.to_string_lossy().as_ref(),
                    "-d",
                    download_dir.to_string_lossy().as_ref(),
                ]);
            } else {
                command.args(["install", "-r", manifest_path.to_string_lossy().as_ref()]);
            }
            command
        }
        "go" => {
            let mut command = Command::new("go");
            if mode == "safe" {
                command.args(["mod", "download"]);
            } else {
                command.args(["build", "./..."]);
            }
            command
        }
        "composer" => {
            let mut command = Command::new("composer");
            command.arg("install").arg("--no-interaction");
            if mode == "safe" {
                command.args(["--no-scripts", "--no-plugins"]);
            }
            command
        }
        _ => return Err(format!("Auto-install is not supported for {ecosystem}.")),
    };

    command
        .current_dir(dir)
        .output()
        .map_err(|error| format!("Failed to run install command for {ecosystem}: {error}"))
}

fn emit_clone_progress(app: &AppHandle, progress: CloneProgress) {
    let _ = app.emit(CLONE_PROGRESS_EVENT, progress);
}

fn emit_clone_scan(app: &AppHandle, result: CloneValidationResult) {
    let _ = app.emit(CLONE_SCAN_EVENT, result);
}

fn emit_install_progress(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit(INSTALL_PROGRESS_EVENT, progress);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_project_name_handles_https_and_ssh() {
        assert_eq!(
            derive_project_name("https://github.com/forja/editor.git"),
            "editor"
        );
        assert_eq!(
            derive_project_name("git@github.com:forja/editor.git"),
            "editor"
        );
        assert_eq!(
            derive_project_name("ssh://git@example.com/team/space repo.git"),
            "space-repo"
        );
    }

    #[test]
    fn exact_version_detection_ignores_ranges() {
        assert!(is_exact_version("1.2.3"));
        assert!(!is_exact_version("^1.2.3"));
        assert!(!is_exact_version(">=1.2.3"));
        assert!(!is_exact_version("latest"));
    }
}
