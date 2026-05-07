use super::*;
use std::path::Path;
use std::process::Command;

pub struct PythonHandler;

impl EcosystemHandler for PythonHandler {
    fn name(&self) -> &'static str { "pip" }
    fn language(&self) -> &'static str { "Python" }
    fn manifest_filenames(&self) -> &'static [&'static str] {
        &["requirements.txt", "requirements-dev.txt", "requirements-test.txt",
          "pyproject.toml", "Pipfile", "setup.py", "setup.cfg"]
    }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match name.as_str() {
            n if n.starts_with("requirements") => parse_requirements_txt(path),
            "pyproject.toml" => parse_pyproject_toml(path),
            "Pipfile" => parse_pipfile(path),
            _ => Ok(vec![]),
        }
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        let dir = path.parent().unwrap();
        let out = Command::new("pip-audit")
            .args(["--format","json","-r", path.to_str().unwrap_or("requirements.txt")])
            .current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(deps) = json.as_array() {
            for dep in deps {
                let pkg = dep.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if let Some(vulns) = dep.get("vulns").and_then(|v| v.as_array()) {
                    for v in vulns {
                        let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                        let desc = v.get("description").and_then(|x| x.as_str()).map(String::from);
                        let fix = v.get("fix_versions").and_then(|x| x.as_array())
                            .and_then(|a| a.first()).and_then(|x| x.as_str()).map(String::from);
                        map.entry(pkg.clone()).or_default().push(Vulnerability {
                            id, severity: Severity::Unknown,
                            title: desc.clone().unwrap_or("Advisory".to_string()),
                            description: desc, url: None, patched_versions: fix,
                        });
                    }
                }
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let dir = path.parent().unwrap();
        let out = Command::new("pip").args(["list","--outdated","--format","json"]).current_dir(dir).output();
        let Ok(out) = out else { return vec![] };
        let text = String::from_utf8_lossy(&out.stdout);
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };
        json.as_array().unwrap_or(&vec![]).iter().filter_map(|p| {
            let name = p.get("name").and_then(|v| v.as_str())?;
            let latest = p.get("latest_version").and_then(|v| v.as_str())?;
            Some((name.to_string(), latest.to_string()))
        }).collect()
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, _dev: bool) -> Result<String, String> {
        let dir = path.parent().unwrap();
        let spec = version.map(|v| format!("{}=={}", package, v)).unwrap_or(package.to_string());
        run_cmd("pip", &["install", &spec], dir)
    }
}

fn parse_requirements_txt(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(text.lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty() && !l.starts_with('-'))
        .map(|line| {
            let (name, ver) = if let Some(i) = line.find("==") {
                (&line[..i], line[i+2..].trim().to_string())
            } else if let Some(i) = line.find(">=") {
                (&line[..i], format!(">={}", &line[i+2..].trim()))
            } else {
                (line.trim(), "*".to_string())
            };
            Dependency { name: name.trim().to_string(), version: ver,
                dep_type: "prod".to_string(), latest: None, is_outdated: false, vulnerabilities: vec![] }
        })
        .collect())
}

fn parse_pyproject_toml(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let val: toml::Value = toml::from_str(&text).map_err(|e| e.to_string())?;
    let mut deps = vec![];
    
    // PEP 621 style: project.dependencies
    if let Some(arr) = val.get("project").and_then(|p| p.get("dependencies")).and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(s) = item.as_str() {
                let parts: Vec<&str> = s.splitn(2, ['=','>','<','!',' ']).collect();
                deps.push(Dependency {
                    name: parts[0].trim().to_string(),
                    version: parts.get(1).map(|v| v.trim().to_string()).unwrap_or("*".to_string()),
                    dep_type: "prod".to_string(), latest: None, is_outdated: false, vulnerabilities: vec![]
                });
            }
        }
    }
    
    // Poetry style: tool.poetry.dependencies
    let sections = [
        (vec!["tool", "poetry", "dependencies"], "prod"),
        (vec!["tool", "poetry", "dev-dependencies"], "dev"),
        (vec!["tool", "poetry", "group", "dev", "dependencies"], "dev"),
    ];

    for (path_keys, dtype) in sections {
        let mut curr = &val;
        let mut found = true;
        for key in path_keys {
            if let Some(next) = curr.get(key) {
                curr = next;
            } else {
                found = false;
                break;
            }
        }
        if found {
            if let Some(table) = curr.as_table() {
                for (k, v) in table {
                    if k == "python" { continue; }
                    let ver = match v {
                        toml::Value::String(s) => s.clone(),
                        toml::Value::Table(t) => t.get("version").and_then(|v| v.as_str()).unwrap_or("*").to_string(),
                        _ => "*".to_string(),
                    };
                    deps.push(Dependency { name: k.clone(), version: clean_version(&ver),
                        dep_type: dtype.to_string(), latest: None, is_outdated: false, vulnerabilities: vec![] });
                }
            }
        }
    }
    Ok(deps)
}

fn parse_pipfile(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let val: toml::Value = toml::from_str(&text).map_err(|e| e.to_string())?;
    let mut deps = vec![];
    for (section, dtype) in [("packages","prod"),("dev-packages","dev")] {
        if let Some(table) = val.get(section).and_then(|v| v.as_table()) {
            for (k, v) in table {
                let ver = match v {
                    toml::Value::String(s) => clean_version(s),
                    _ => "*".to_string(),
                };
                deps.push(Dependency { name: k.clone(), version: ver,
                    dep_type: dtype.to_string(), latest: None, is_outdated: false, vulnerabilities: vec![] });
            }
        }
    }
    Ok(deps)
}

fn clean_version(v: &str) -> String {
    v.trim_start_matches(['^','~','>','=',' ']).to_string()
}
