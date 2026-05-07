pub mod detector;
pub mod ecosystems;
pub mod clone;

use ecosystems::{
    npm::NpmHandler,
    cargo::CargoHandler,
    python::PythonHandler,
    golang::GoHandler,
    maven::MavenHandler,
    gradle::GradleHandler,
    ruby::RubyHandler,
    dotnet::DotNetHandler,
    composer::ComposerHandler,
    cpp::CppHandler,
    EcosystemHandler,
};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

struct ActiveWatcher {
    root: String,
    _watcher: notify::RecommendedWatcher,
}

static DEPS_WATCHER: Mutex<Option<ActiveWatcher>> = Mutex::new(None);

pub(crate) fn get_handlers() -> Vec<Box<dyn EcosystemHandler>> {
    vec![
        Box::new(NpmHandler),
        Box::new(CargoHandler),
        Box::new(PythonHandler),
        Box::new(GoHandler),
        Box::new(MavenHandler),
        Box::new(GradleHandler),
        Box::new(RubyHandler),
        Box::new(DotNetHandler),
        Box::new(ComposerHandler),
        Box::new(CppHandler),
    ]
}

/// Detecta y escanea TODOS los manifiestos en un directorio
#[tauri::command]
pub async fn scan_all(root: String) -> Result<Vec<ecosystems::ScanResult>, String> {
    let handlers = get_handlers();
    let manifests = detector::detect_all_manifests(Path::new(&root), &handlers);
    let handler_map: HashMap<&str, &Box<dyn EcosystemHandler>> =
        handlers.iter().map(|h| (h.name(), h)).collect();

    let mut results = Vec::new();
    for (manifest_path, ecosystem_name) in &manifests {
        if let Some(handler) = handler_map.get(ecosystem_name.as_str()) {
            match scan_with_handler(manifest_path, *handler) {
                Ok(result) => results.push(result),
                Err(e) => eprintln!("Error scanning {:?}: {}", manifest_path, e),
            }
        }
    }

    results.sort_by(|left, right| left.manifest_path.cmp(&right.manifest_path));
    Ok(results)
}

/// Escanea un manifiesto específico
#[tauri::command]
pub async fn scan_manifest(manifest_path: String) -> Result<ecosystems::ScanResult, String> {
    let path = PathBuf::from(&manifest_path);
    let handlers = get_handlers();
    let handler = handlers.iter()
        .find(|h| h.is_manifest(&path))
        .ok_or_else(|| format!("Ecosistema no soportado para: {}", manifest_path))?;
    scan_with_handler(&path, handler)
}

pub(crate) fn scan_with_handler(
    path: &Path,
    handler: &Box<dyn EcosystemHandler>,
) -> Result<ecosystems::ScanResult, String> {
    let mut deps = handler.parse_dependencies(path)?;

    if deps.is_empty() {
        return Ok(ecosystems::ScanResult {
            manifest_path: path.to_string_lossy().to_string(),
            ecosystem: handler.name().to_string(),
            language: handler.language().to_string(),
            dependencies: deps,
            summary: ecosystems::Summary::default(),
            scanned_at: chrono::Utc::now().to_rfc3339(),
            errors: vec![],
        });
    }

    // Enriquecer con audit
    let vulns_map: HashMap<String, Vec<ecosystems::Vulnerability>> =
        handler.run_audit(path).into_iter().collect();

    // Enriquecer con outdated
    let outdated_map: HashMap<String, String> =
        handler.check_outdated(path).into_iter().collect();

    for dep in &mut deps {
        if let Some(vulns) = vulns_map.get(&dep.name) {
            dep.vulnerabilities = vulns.clone();
        }
        if let Some(latest) = outdated_map.get(&dep.name) {
            dep.latest = Some(latest.clone());
            dep.is_outdated = true;
        }
    }

    // Ordenar: críticos primero
    deps.sort_by(|a, b| {
        let a_sev = a.vulnerabilities.iter().map(|v| v.severity.score()).max().unwrap_or(0);
        let b_sev = b.vulnerabilities.iter().map(|v| v.severity.score()).max().unwrap_or(0);
        b_sev.cmp(&a_sev)
    });

    let summary = ecosystems::build_summary(&deps);

    Ok(ecosystems::ScanResult {
        manifest_path: path.to_string_lossy().to_string(),
        ecosystem: handler.name().to_string(),
        language: handler.language().to_string(),
        dependencies: deps,
        summary,
        scanned_at: chrono::Utc::now().to_rfc3339(),
        errors: vec![],
    })
}

fn matches_manifest_pattern(file_name: &str, pattern: &str) -> bool {
    if pattern.starts_with("*.") {
        file_name.ends_with(&pattern[1..])
    } else {
        file_name == pattern
    }
}

/// Instala una dependencia
#[tauri::command]
pub async fn install_dep(
    manifest_path: String,
    package: String,
    version: Option<String>,
    dev: bool,
) -> Result<String, String> {
    let path = PathBuf::from(&manifest_path);
    let handlers = get_handlers();
    let handler = handlers.iter()
        .find(|h| h.is_manifest(&path))
        .ok_or("Ecosistema no soportado")?;
    handler.install(&path, &package, version.as_deref(), dev)
}

/// Valida una dependencia antes de instalarla
#[tauri::command]
pub async fn validate_dependency(
    ecosystem: String,
    package: String,
    version: Option<String>,
) -> Result<Vec<ecosystems::Vulnerability>, String> {
    let handlers = get_handlers();
    let handler = handlers.iter()
        .find(|h| h.name() == ecosystem)
        .ok_or_else(|| format!("Ecosistema no soportado: {}", ecosystem))?;
    handler.validate_dependency(&package, version.as_deref())
}

/// File watcher: re-emite evento cuando cambia cualquier manifiesto
#[tauri::command]
pub async fn start_watcher(app: AppHandle, root: String) -> Result<(), String> {
    use notify::{RecursiveMode, Watcher};

    let handlers = get_handlers();
    let known_names: Vec<String> = handlers.iter()
        .flat_map(|h| h.manifest_filenames().iter().map(|s| s.to_string()))
        .collect();

    let mut watcher_state = DEPS_WATCHER.lock().unwrap();
    if watcher_state
        .as_ref()
        .map(|active| active.root == root)
        .unwrap_or(false)
    {
        return Ok(());
    }

    let app_handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return; };

        for path in event.paths {
            let file_name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_default();

            if known_names
                .iter()
                .any(|pattern| matches_manifest_pattern(&file_name, pattern))
            {
                let _ = app_handle.emit("deps:changed", path.to_string_lossy().to_string());
            }
        }
    }).map_err(|error| error.to_string())?;

    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|error| error.to_string())?;

    *watcher_state = Some(ActiveWatcher {
        root,
        _watcher: watcher,
    });

    Ok(())
}

#[tauri::command]
pub async fn stop_watcher() -> Result<(), String> {
    let mut watcher_state = DEPS_WATCHER.lock().unwrap();
    *watcher_state = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    struct MockHandler {
        deps: Vec<ecosystems::Dependency>,
        audit_calls: Arc<AtomicUsize>,
        outdated_calls: Arc<AtomicUsize>,
    }

    impl EcosystemHandler for MockHandler {
        fn name(&self) -> &'static str { "mock" }

        fn language(&self) -> &'static str { "Mock" }

        fn manifest_filenames(&self) -> &'static [&'static str] { &["mock.json"] }

        fn parse_dependencies(&self, _manifest_path: &Path) -> Result<Vec<ecosystems::Dependency>, String> {
            Ok(self.deps.clone())
        }

        fn run_audit(&self, _manifest_path: &Path) -> Vec<(String, Vec<ecosystems::Vulnerability>)> {
            self.audit_calls.fetch_add(1, Ordering::SeqCst);
            vec![]
        }

        fn check_outdated(&self, _manifest_path: &Path) -> Vec<(String, String)> {
            self.outdated_calls.fetch_add(1, Ordering::SeqCst);
            vec![]
        }

        fn install(
            &self,
            _manifest_path: &Path,
            _package: &str,
            _version: Option<&str>,
            _dev: bool,
        ) -> Result<String, String> {
            Ok(String::new())
        }
    }

    #[test]
    fn scan_with_handler_skips_audit_and_outdated_for_empty_manifests() {
        let audit_calls = Arc::new(AtomicUsize::new(0));
        let outdated_calls = Arc::new(AtomicUsize::new(0));
        let handler: Box<dyn EcosystemHandler> = Box::new(MockHandler {
            deps: vec![],
            audit_calls: Arc::clone(&audit_calls),
            outdated_calls: Arc::clone(&outdated_calls),
        });

        let tempdir = tempfile::tempdir().unwrap();
        let manifest_path = tempdir.path().join("mock.json");
        std::fs::write(&manifest_path, "{}").unwrap();

        let result = scan_with_handler(&manifest_path, &handler).unwrap();

        assert!(result.dependencies.is_empty());
        assert_eq!(result.summary.total, 0);
        assert_eq!(audit_calls.load(Ordering::SeqCst), 0);
        assert_eq!(outdated_calls.load(Ordering::SeqCst), 0);
    }
}
