use super::*;
use std::path::Path;
use std::process::Command;

/// Soporta: vcpkg.json, conanfile.txt, conanfile.py, CMakeLists.txt (FetchContent)
pub struct CppHandler;

impl EcosystemHandler for CppHandler {
    fn name(&self) -> &'static str { "cpp" }
    fn language(&self) -> &'static str { "C / C++" }
    fn manifest_filenames(&self) -> &'static [&'static str] {
        &["vcpkg.json", "conanfile.txt", "conanfile.py", "CMakeLists.txt"]
    }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match fname.as_str() {
            "vcpkg.json"     => parse_vcpkg(path),
            "conanfile.txt"  => parse_conan_txt(path),
            "conanfile.py"   => parse_conan_py(path),
            "CMakeLists.txt" => parse_cmake_fetchcontent(path),
            _                => Ok(vec![]),
        }
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match fname.as_str() {
            "vcpkg.json"    => audit_vcpkg(path),
            "conanfile.txt" | "conanfile.py" => audit_conan(path),
            _ => vec![],
        }
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match fname.as_str() {
            "vcpkg.json"    => outdated_vcpkg(path),
            "conanfile.txt" | "conanfile.py" => outdated_conan(path),
            _ => vec![],
        }
    }

    fn install(&self, path: &Path, package: &str, version: Option<&str>, _dev: bool) -> Result<String, String> {
        let fname = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dir = path.parent().unwrap();
        match fname.as_str() {
            "vcpkg.json" => {
                // vcpkg add port <name>
                // Si hay versión, se edita vcpkg.json directamente (vcpkg no tiene --version en CLI add)
                let result = run_cmd("vcpkg", &["add", "port", package], dir)?;
                if let Some(v) = version {
                    // Agregar overrides en vcpkg.json
                    add_vcpkg_override(path, package, v)?;
                }
                Ok(result)
            }
            "conanfile.txt" | "conanfile.py" => {
                // Conan no tiene "install single pkg" — instrucciones claras
                let spec = version.map(|v| format!("{}/{}", package, v)).unwrap_or(package.to_string());
                Err(format!(
                    "Para Conan, agrega manualmente en [requires]:\n  {}\nLuego corre: conan install . --build=missing",
                    spec
                ))
            }
            _ => Err("Instalar desde CMakeLists.txt no está soportado automáticamente. Usa vcpkg o Conan.".to_string()),
        }
    }
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/// vcpkg.json — formato JSON estándar
fn parse_vcpkg(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut deps = vec![];

    // dependencies: array de strings o objetos { name, version-gte, features }
    if let Some(arr) = json.get("dependencies").and_then(|v| v.as_array()) {
        for item in arr {
            let (name, version, dtype) = match item {
                serde_json::Value::String(s) => (s.clone(), "*".to_string(), "prod"),
                serde_json::Value::Object(obj) => {
                    let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let ver  = obj.get("version-gte").and_then(|v| v.as_str())
                        .or_else(|| obj.get("version").and_then(|v| v.as_str()))
                        .unwrap_or("*").to_string();
                    let host = obj.get("host").and_then(|v| v.as_bool()).unwrap_or(false);
                    (name, ver, if host { "host" } else { "prod" })
                }
                _ => continue,
            };
            if name.is_empty() { continue; }
            deps.push(Dependency {
                name, version, dep_type: dtype.to_string(),
                latest: None, is_outdated: false, vulnerabilities: vec![],
            });
        }
    }

    // overrides — versiones fijadas
    if let Some(arr) = json.get("overrides").and_then(|v| v.as_array()) {
        for item in arr {
            if let serde_json::Value::Object(obj) = item {
                let name = obj.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let ver  = obj.get("version").and_then(|v| v.as_str()).unwrap_or("*").to_string();
                if !name.is_empty() {
                    // Actualizar versión si ya existe, o agregar
                    if let Some(dep) = deps.iter_mut().find(|d| d.name == name) {
                        dep.version = ver; // override tiene precedencia
                    }
                }
            }
        }
    }

    Ok(deps)
}

/// conanfile.txt — secciones INI-like
fn parse_conan_txt(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut deps = vec![];
    let mut in_requires = false;
    let mut in_tool_requires = false;

    for line in text.lines() {
        let t = line.trim();
        if t.starts_with('[') {
            in_requires      = t == "[requires]";
            in_tool_requires = t == "[tool_requires]";
            continue;
        }
        if (in_requires || in_tool_requires) && !t.is_empty() && !t.starts_with('#') {
            // formato: name/version[@user/channel]
            let parts: Vec<&str> = t.splitn(2, '/').collect();
            let name = parts[0].trim().to_string();
            let version = parts.get(1)
                .map(|v| v.split('@').next().unwrap_or(v).trim().to_string())
                .unwrap_or("*".to_string());
            deps.push(Dependency {
                name, version,
                dep_type: if in_tool_requires { "tool" } else { "prod" }.to_string(),
                latest: None, is_outdated: false, vulnerabilities: vec![],
            });
        }
    }
    Ok(deps)
}

/// conanfile.py — parseo estático básico de self.requires(...)
fn parse_conan_py(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut deps = vec![];

    for line in text.lines() {
        let t = line.trim();
        // self.requires("name/version") o self.tool_requires("name/version")
        let is_tool = t.starts_with("self.tool_requires(");
        if t.starts_with("self.requires(") || is_tool {
            // Extraer string entre comillas
            let content = extract_string_arg(t);
            let parts: Vec<&str> = content.splitn(2, '/').collect();
            let name    = parts[0].trim().to_string();
            let version = parts.get(1)
                .map(|v| v.split('@').next().unwrap_or(v).trim().to_string())
                .unwrap_or("*".to_string());
            if !name.is_empty() {
                deps.push(Dependency {
                    name, version,
                    dep_type: if is_tool { "tool" } else { "prod" }.to_string(),
                    latest: None, is_outdated: false, vulnerabilities: vec![],
                });
            }
        }
    }
    Ok(deps)
}

/// CMakeLists.txt — detecta FetchContent_Declare y find_package
fn parse_cmake_fetchcontent(path: &Path) -> Result<Vec<Dependency>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut deps = vec![];
    let lower = text.to_lowercase();

    // FetchContent_Declare(<name> GIT_TAG <tag> ...)
    let mut pos = 0;
    while let Some(idx) = lower[pos..].find("fetchcontent_declare") {
        let abs = pos + idx;
        let chunk = &text[abs..std::cmp::min(abs + 500, text.len())];
        if let Some(name) = extract_cmake_arg(chunk, 1) {
            let tag = extract_cmake_keyword(chunk, "GIT_TAG")
                .unwrap_or_else(|| "*".to_string());
            let url = extract_cmake_keyword(chunk, "GIT_REPOSITORY");
            deps.push(Dependency {
                name: name.to_lowercase(),
                version: tag,
                dep_type: "fetchcontent".to_string(),
                latest: None, is_outdated: false, vulnerabilities: vec![],
            });
            // guardamos la URL como contexto (no en el struct, pero podría extenderse)
            let _ = url;
        }
        pos = abs + 1;
    }

    // find_package(<name> <version> REQUIRED)
    pos = 0;
    while let Some(idx) = lower[pos..].find("find_package(") {
        let abs = pos + idx;
        let chunk = &text[abs..std::cmp::min(abs + 200, text.len())];
        let end = chunk.find(')').unwrap_or(chunk.len());
        let inner = &chunk[..end];
        let tokens: Vec<&str> = inner
            .trim_start_matches("find_package(")
            .split_whitespace()
            .collect();
        if let Some(name) = tokens.first() {
            let version = tokens.get(1)
                .filter(|v| v.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false))
                .map(|v| v.to_string())
                .unwrap_or("*".to_string());
            deps.push(Dependency {
                name: name.to_string(),
                version,
                dep_type: "system".to_string(),
                latest: None, is_outdated: false, vulnerabilities: vec![],
            });
        }
        pos = abs + 1;
    }

    // Deduplicar por nombre
    deps.dedup_by(|a, b| a.name == b.name);
    Ok(deps)
}

// ─── Audit ────────────────────────────────────────────────────────────────────

fn audit_vcpkg(path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
    // vcpkg no tiene audit nativo — consultamos OSV.dev API por cada dep
    // Parseamos deps y hacemos batch query a https://api.osv.dev/v1/querybatch
    let Ok(deps) = parse_vcpkg(path) else { return vec![] };
    if deps.is_empty() { return vec![]; }

    // Construir batch request para OSV
    let queries: Vec<serde_json::Value> = deps.iter().map(|d| serde_json::json!({
        "package": { "name": d.name, "ecosystem": "OSS-Fuzz" },
        "version": d.version
    })).collect();

    let body = serde_json::json!({ "queries": queries });
    let body_str = serde_json::to_string(&body).unwrap_or_default();

    // curl a OSV batch API
    let out = Command::new("curl")
        .args(["-s", "-X", "POST",
               "https://api.osv.dev/v1/querybatch",
               "-H", "Content-Type: application/json",
               "-d", &body_str,
               "--max-time", "15"])
        .output();

    let Ok(out) = out else { return vec![] };
    let text = String::from_utf8_lossy(&out.stdout);
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };

    let mut results = vec![];
    if let Some(responses) = json.get("results").and_then(|v| v.as_array()) {
        for (dep, resp) in deps.iter().zip(responses.iter()) {
            if let Some(vulns) = resp.get("vulns").and_then(|v| v.as_array()) {
                let mapped: Vec<Vulnerability> = vulns.iter().map(|v| {
                    let id = v.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let summary = v.get("summary").and_then(|x| x.as_str()).unwrap_or("Advisory").to_string();
                    let severity = v.pointer("/severity/0/score")
                        .and_then(|x| x.as_str())
                        .map(cvss_to_severity)
                        .unwrap_or(Severity::Unknown);
                    Vulnerability {
                        id, severity, title: summary,
                        description: None,
                        url: Some(format!("https://osv.dev/vulnerability/{}", v.get("id").and_then(|x| x.as_str()).unwrap_or(""))),
                        patched_versions: None,
                    }
                }).collect();
                if !mapped.is_empty() {
                    results.push((dep.name.clone(), mapped));
                }
            }
        }
    }
    results
}

fn audit_conan(path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
    // conan audit — disponible en Conan 2.x con plugin conan-audit
    // Fallback: OSV.dev igual que vcpkg
    let dir = path.parent().unwrap();
    let out = Command::new("conan")
        .args(["audit", "list", "--format=json"])
        .current_dir(dir).output();

    if let Ok(out) = out {
        let text = String::from_utf8_lossy(&out.stdout);
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(vulns) = json.get("vulnerabilities").and_then(|v| v.as_array()) {
                let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
                for v in vulns {
                    let pkg = v.get("reference").and_then(|x| x.as_str())
                        .map(|r| r.split('/').next().unwrap_or(r).to_string())
                        .unwrap_or_default();
                    let id = v.get("cve").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("Advisory").to_string();
                    map.entry(pkg).or_default().push(Vulnerability {
                        id, severity: Severity::Unknown, title,
                        description: None, url: None, patched_versions: None,
                    });
                }
                return map.into_iter().collect();
            }
        }
    }
    vec![] // conan audit no disponible, silencioso
}

// ─── Outdated ─────────────────────────────────────────────────────────────────

fn outdated_vcpkg(path: &Path) -> Vec<(String, String)> {
    // vcpkg update — lista ports con versiones nuevas disponibles
    let dir = path.parent().unwrap();
    let out = Command::new("vcpkg")
        .args(["update"])
        .current_dir(dir).output();
    let Ok(out) = out else { return vec![] };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut results = vec![];
    for line in text.lines() {
        // "  name    old-ver -> new-ver"
        if line.contains("->") {
            let parts: Vec<&str> = line.split("->").collect();
            if parts.len() == 2 {
                let pkg    = parts[0].trim().split_whitespace().next().unwrap_or("").to_string();
                let latest = parts[1].trim().to_string();
                if !pkg.is_empty() { results.push((pkg, latest)); }
            }
        }
    }
    results
}

fn outdated_conan(_path: &Path) -> Vec<(String, String)> {
    // No hay comando directo; conan search puede consultar el registry
    // Retornamos vacío — en un futuro podría consultarse ConanCenter API
    vec![]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn extract_string_arg(line: &str) -> String {
    for delim in ['"', '\''] {
        if let Some(start) = line.find(delim) {
            let rest = &line[start + 1..];
            if let Some(end) = rest.find(delim) {
                return rest[..end].to_string();
            }
        }
    }
    String::new()
}

fn extract_cmake_arg(chunk: &str, n: usize) -> Option<String> {
    let inner = chunk.find('(')?;
    let close = chunk.find(')')?;
    let tokens: Vec<&str> = chunk[inner+1..close].split_whitespace().collect();
    tokens.get(n - 1).map(|s| s.to_string())
}

fn extract_cmake_keyword(chunk: &str, keyword: &str) -> Option<String> {
    let lower = chunk.to_uppercase();
    let pos = lower.find(keyword)? + keyword.len();
    chunk[pos..].split_whitespace().next().map(|s| s.to_string())
}

fn add_vcpkg_override(path: &Path, name: &str, version: &str) -> Result<(), String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let overrides = json.get_mut("overrides")
        .and_then(|v| v.as_array_mut())
        .ok_or("vcpkg.json no tiene campo overrides")?;
    overrides.push(serde_json::json!({ "name": name, "version": version }));
    let pretty = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    std::fs::write(path, pretty).map_err(|e| e.to_string())
}

fn cvss_to_severity(score_str: &str) -> Severity {
    score_str.parse::<f32>().map(|s| match s as u8 {
        9..=10 => Severity::Critical,
        7..=8  => Severity::High,
        4..=6  => Severity::Moderate,
        1..=3  => Severity::Low,
        _      => Severity::Unknown,
    }).unwrap_or(Severity::Unknown)
}
