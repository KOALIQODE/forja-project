use super::ecosystems::ScanResult;
use chrono::Utc;
use regex::Regex;
use serde_json::Value;
use std::path::Path;

pub(crate) fn build_repository_warning_scan(root: &Path) -> Result<Option<ScanResult>, String> {
    let warnings = collect_repository_warnings(root)?;
    if warnings.is_empty() {
        return Ok(None);
    }

    Ok(Some(ScanResult {
        manifest_path: root.to_string_lossy().to_string(),
        ecosystem: "repository".to_string(),
        language: "Repository".to_string(),
        dependencies: vec![],
        summary: Default::default(),
        scanned_at: Utc::now().to_rfc3339(),
        errors: warnings,
    }))
}

fn collect_repository_warnings(root: &Path) -> Result<Vec<String>, String> {
    let mut warnings = find_repo_env_plaintext_secrets(root)?;
    warnings.extend(check_npm_lockfile_injection(root)?);
    Ok(warnings)
}

fn find_repo_env_plaintext_secrets(root: &Path) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();
    let secret_re = Regex::new(r"(?i)^\s*([a-z0-9_.-]*?(secret|password|api[_-]?key|token|bearer|private_key|access[_-]?token|secret_key|aws_secret_access_key|db_password|passwd)[a-z0-9_.-]*)\s*=")
        .map_err(|error| error.to_string())?;

    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }

            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if !file_name.starts_with(".env")
                && !file_name.ends_with(".env")
                && !file_name.contains(".env.")
            {
                continue;
            }

            let content = match std::fs::read_to_string(&path) {
                Ok(content) => content,
                Err(_) => continue,
            };

            for (index, line) in content.lines().enumerate() {
                if secret_re.is_match(line) {
                    warnings.push(format!(
                        "{}: line {}: {}",
                        path.display(),
                        index + 1,
                        line.trim()
                    ));
                }
            }
        }
    }

    Ok(warnings)
}

fn check_npm_lockfile_injection(root: &Path) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();
    let lock_path = root.join("package-lock.json");
    if !lock_path.exists() {
        return Ok(warnings);
    }

    let text = std::fs::read_to_string(&lock_path).map_err(|error| error.to_string())?;
    let json: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;

    fn traverse(value: &Value, warnings: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                if let Some(Value::String(resolved)) = map.get("resolved") {
                    let resolved = resolved.trim();
                    if resolved.starts_with("file:") {
                        warnings.push(format!(
                            "package-lock.json contains file: resolved url: {}",
                            resolved
                        ));
                    }
                    if resolved.starts_with("http://") {
                        warnings.push(format!(
                            "package-lock.json contains non-HTTPS resolved url: {}",
                            resolved
                        ));
                    }
                    if resolved.contains("localhost")
                        || resolved.contains("127.")
                        || resolved.contains("192.168.")
                        || resolved.contains("10.")
                        || resolved.contains("172.")
                    {
                        warnings.push(format!(
                            "package-lock.json contains resolved url to local/private host: {}",
                            resolved
                        ));
                    }
                    if !map.contains_key("integrity") {
                        warnings.push(format!(
                            "package-lock.json entry '{}' has no integrity field",
                            resolved
                        ));
                    }
                }

                for nested in map.values() {
                    traverse(nested, warnings);
                }
            }
            Value::Array(items) => {
                for item in items {
                    traverse(item, warnings);
                }
            }
            _ => {}
        }
    }

    traverse(&json, &mut warnings);
    Ok(warnings)
}
