use super::*;
use std::path::Path;
use std::process::Command;

pub struct GradleHandler;

impl EcosystemHandler for GradleHandler {
    fn name(&self) -> &'static str { "gradle" }
    fn language(&self) -> &'static str { "Java / Kotlin (Gradle)" }
    fn manifest_filenames(&self) -> &'static [&'static str] {
        &["build.gradle", "build.gradle.kts"]
    }

    fn parse_dependencies(&self, path: &Path) -> Result<Vec<Dependency>, String> {
        let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        let mut deps = vec![];

        for line in text.lines() {
            let t = line.trim();
            // implementation("group:artifact:version") o implementation 'group:artifact:version'
            let config = ["implementation", "api", "testImplementation", "compileOnly",
                          "runtimeOnly", "annotationProcessor", "kapt", "classpath"]
                .iter().find(|c| t.starts_with(*c));

            if let Some(cfg) = config {
                let raw = extract_gradle_dep(t);
                // formato GAV: group:artifact:version
                let parts: Vec<&str> = raw.splitn(3, ':').collect();
                if parts.len() >= 2 {
                    let name = format!("{}:{}", parts[0], parts[1]);
                    let version = parts.get(2).map(|v| v.trim().trim_matches(['"','\'',')','(',' ']).to_string())
                        .unwrap_or("*".to_string());
                    let dtype = match *cfg {
                        "testImplementation" => "test",
                        "compileOnly"        => "compileOnly",
                        "runtimeOnly"        => "runtime",
                        _                    => "prod",
                    };
                    deps.push(Dependency {
                        name, version, dep_type: dtype.to_string(),
                        latest: None, is_outdated: false, vulnerabilities: vec![],
                    });
                }
            }
        }
        Ok(deps)
    }

    fn run_audit(&self, path: &Path) -> Vec<(String, Vec<Vulnerability>)> {
        // ./gradlew dependencyCheckAnalyze --format JSON
        let dir = path.parent().unwrap();
        let gradle_cmd = if cfg!(windows) { "gradlew.bat" } else { "./gradlew" };
        let _ = Command::new(gradle_cmd)
            .args(["dependencyCheckAnalyze", "--format", "JSON"])
            .current_dir(dir).output();

        // Leer build/reports/dependency-check-report.json
        let report = dir.join("build/reports/dependency-check-report.json");
        let Ok(text) = std::fs::read_to_string(&report) else { return vec![] };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };

        let mut map: std::collections::HashMap<String, Vec<Vulnerability>> = Default::default();
        if let Some(deps) = json.pointer("/dependencies").and_then(|v| v.as_array()) {
            for dep in deps {
                let pkg = dep.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_string();
                for v in dep.get("vulnerabilities").and_then(|v| v.as_array()).unwrap_or(&vec![]) {
                    let id  = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
                    let sev = match v.get("severity").and_then(|x| x.as_str()).unwrap_or("") {
                        "CRITICAL" => Severity::Critical, "HIGH" => Severity::High,
                        "MEDIUM"   => Severity::Moderate, "LOW"  => Severity::Low,
                        _ => Severity::Unknown,
                    };
                    map.entry(pkg.clone()).or_default().push(Vulnerability {
                        id, severity: sev,
                        title: v.get("description").and_then(|x| x.as_str()).unwrap_or("CVE").to_string(),
                        description: None, url: None, patched_versions: None,
                    });
                }
            }
        }
        map.into_iter().collect()
    }

    fn check_outdated(&self, path: &Path) -> Vec<(String, String)> {
        // ./gradlew dependencyUpdates --output-formatter json
        let dir = path.parent().unwrap();
        let gradle_cmd = if cfg!(windows) { "gradlew.bat" } else { "./gradlew" };
        let _ = Command::new(gradle_cmd)
            .args(["dependencyUpdates", "--output-formatter", "json"])
            .current_dir(dir).output();

        let report = dir.join("build/dependencyUpdates/report.json");
        let Ok(text) = std::fs::read_to_string(&report) else { return vec![] };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { return vec![] };

        json.pointer("/outdated/dependencies").and_then(|v| v.as_array())
            .unwrap_or(&vec![]).iter().filter_map(|d| {
                let group    = d.get("group").and_then(|v| v.as_str())?;
                let name     = d.get("name").and_then(|v| v.as_str())?;
                let latest   = d.pointer("/available/release").and_then(|v| v.as_str())?;
                Some((format!("{}:{}", group, name), latest.to_string()))
            }).collect()
    }

    fn install(&self, _path: &Path, package: &str, version: Option<&str>, dev: bool) -> Result<String, String> {
        let ver = version.map(|v| format!(":{}", v)).unwrap_or_default();
        let config = if dev { "testImplementation" } else { "implementation" };
        Err(format!(
            "Agrega en build.gradle:\n  {} \"{}{}\"",
            config, package, ver
        ))
    }
}

fn extract_gradle_dep(line: &str) -> String {
    for delim in ['"', '\''] {
        if let Some(s) = line.find(delim) {
            let rest = &line[s+1..];
            if let Some(e) = rest.find(delim) {
                return rest[..e].to_string();
            }
        }
    }
    String::new()
}
