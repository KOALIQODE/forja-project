# Plugin Registry & Moderation Pipeline — Forja Editor

Este documento describe el flujo completo de publicación, revisión y distribución de plugins y temas para Forja Editor.

---

## 1. Principio de Seguridad

El editor **nunca instala plugins directamente desde repositorios externos**. Todo pasa por el registry oficial:

```
GitHub repo (autor)
      ↓
Moderation Backend (Rust)
      ↓
Revisión Automática + Manual
      ↓
Registry Oficial (paquetes firmados)
      ↓
Cliente Tauri (solo desde registry)
```

Esto garantiza 4 capas de seguridad:
1. Código fuente auditable públicamente
2. Revisión por commit hash exacto
3. Firma oficial de cada release
4. Instalación solo desde registry controlado

---

## 2. Requisitos del Repositorio

El autor mantiene un repositorio público (GitHub, GitLab, etc.) con estructura obligatoria:

```
mi-plugin/
 ├── manifest.lua    # Metadata y permisos (obligatorio)
 ├── main.lua        # Lógica principal (obligatorio)
 ├── README.md       # Documentación (obligatorio)
 └── assets/         # Recursos opcionales (imágenes, ejemplos)
```

No se aceptan:
- Archivos `.zip` manuales
- Bytecode Lua precompilado (`.luac`)
- Binarios de ningún tipo

El repositorio es la fuente de verdad auditable.

---

## 3. Flujo de Publicación

### Paso 1 — El autor envía su plugin

Formulario público en `plugins.forja.dev/submit`:

| Campo | Ejemplo |
|---|---|
| Repository URL | `https://github.com/user/bracket-colorizer` |
| Version Tag | `v1.0.0` |
| Category | `plugin` \| `theme` |
| Description | Breve descripción |

El sistema registra:
```json
{
  "submission_id": "sub_abc123",
  "repo_url": "https://github.com/user/bracket-colorizer",
  "tag": "v1.0.0",
  "status": "pending_review"
}
```

### Paso 2 — Backend clona el commit exacto

```bash
git clone https://github.com/user/bracket-colorizer
git checkout v1.0.0  # tag específico, nunca main/master
```

La revisión siempre se hace sobre un **commit SHA fijo**, no sobre una branch. Esto garantiza que el código aprobado no pueda cambiar después.

### Paso 3 — Scanner automático

El scanner analiza:
- AST del código Lua (detección de APIs prohibidas)
- Permisos declarados en `manifest.lua`
- Archivos presentes en el repositorio
- Complejidad y tamaño del código

Produce un reporte:
```json
{
  "risk": "low",
  "permissions": ["buffer:read", "decorations:write"],
  "hooks": ["on_save"],
  "warnings": [],
  "blocked_patterns": []
}
```

### Paso 4 — Cola de revisión manual

El revisor accede al panel privado y ve:

```
Plugin: bracket-pair-colorizer
Autor:  github.com/user
Commit: a84f9d2
Tag:    v1.0.0

Permisos solicitados:
  ✅ buffer:read
  ✅ decorations:write

Risk Score: LOW
Warnings:   ninguno

[ Diff completo ]   [ Aprobar ]   [ Rechazar ]
```

### Paso 5 — Aprobación y firma

Al aprobar, el backend:
1. Empaqueta el plugin (`plugin-name-1.0.0.pkg`)
2. Genera hash SHA-256
3. Firma el paquete con la clave privada del registry
4. Almacena en el bucket de distribución

Metadata guardada:
```json
{
  "plugin":    "bracket-pair-colorizer",
  "version":   "1.0.0",
  "commit":    "a84f9d2",
  "hash":      "sha256:e3b0c44298fc1c...",
  "approved":  true,
  "signature": "...",
  "published_at": "2026-04-30T12:00:00Z"
}
```

### Paso 6 — Publicación en el registry

El plugin aparece en:
```
GET https://registry.forja.dev/plugins
GET https://registry.forja.dev/themes
```

---

## 4. Arquitectura del Backend de Moderación

```
Frontend (SvelteKit)
 ├── /submit          → formulario público de envío
 └── /admin/review    → panel privado de moderación

Backend (Rust)
 ├── POST /submissions      → recibe envíos
 ├── GET  /submissions      → lista pending (admin)
 ├── POST /submissions/:id/approve
 ├── POST /submissions/:id/reject
 └── GET  /plugins          → registry público (solo aprobados)

Base de Datos (PostgreSQL)
 ├── plugins    (id, name, author, repo_url)
 └── versions   (plugin_id, version, commit, hash, approved, signature)

Storage (S3 / bucket)
 └── paquetes firmados + archivos .sig
```

---

## 5. Panel de Moderación (Admin)

El panel privado es una aplicación SvelteKit con acceso restringido (OAuth GitHub o usuario/contraseña).

### Vista: Cola de Revisión

| Plugin | Versión | Autor | Risk | Estado | Acciones |
|---|---|---|---|---|---|
| bracket-colorizer | v1.0.0 | user | LOW | Pending | Revisar |
| tokyo-night | v2.1.0 | author2 | LOW | Pending | Revisar |

### Vista: Detalle de Revisión

- Repositorio y commit
- Diff completo de archivos
- Reporte del scanner (permisos, warnings, patterns detectados)
- Historial del autor (versiones previas aprobadas)
- Botones: **Aprobar** / **Rechazar** + campo de motivo

---

## 6. Política de Versiones

- Se aprueba **versión + commit**, nunca "el plugin" de forma global
- Cada actualización requiere nueva revisión
- El diff entre versiones se muestra en el panel para agilizar revisiones

```
formatter v1.0.0  →  approved  (commit: a84f9d2)
formatter v1.1.0  →  pending   (commit: f3c91aa)
formatter v1.2.0  →  rejected  (motivo: patron os.execute detectado)
```

---

## 7. Verificación en el Cliente Tauri

El cliente implementa dos comandos de instalación, ambos con verificación SHA-256 obligatoria:

### `plugin_install_from_registry(name, version)`

Instalación de alto nivel desde el registry oficial. El cliente:

1. Descarga `GET {REGISTRY}/plugins/{name}/{version}/meta.json` → hashes esperados
2. Descarga `manifest.lua` y `main.lua` del registry
3. Verifica SHA-256 de **ambos** archivos **antes** de escribir en disco
4. Guarda en `~/.local/share/forja/plugins/{plugins|themes}/{name}/`
5. Carga la VM Lua en el runtime (un único lock breve, sin await en medio)

```rust
let meta: RegistryMeta = client.get(&meta_url).send().await?.json().await?;

let manifest_src = client.get(&manifest_url).send().await?.text().await?;
let main_src     = client.get(&main_url).send().await?.text().await?;

// Verificación ANTES de tocar disco — archivo alterado = rechazo
verify_sha256(&manifest_src, &meta.manifest_sha256, "manifest.lua")?;
verify_sha256(&main_src,     &meta.main_sha256,     "main.lua")?;

// Solo si ambos hashes son válidos, se guarda y carga
save_to_disk(&plugin_dir, &manifest_src, &main_src)?;
load_plugin_from_dir(&mut host, &plugin_dir)
```

### `plugin_install_from_url(manifest_url, main_url, manifest_sha256, main_sha256)`

Instalación de bajo nivel con URLs explícitas. Requiere que el llamante proporcione los hashes. Usado cuando el frontend ya conoce las URLs exactas (ej: respuesta del registry con URLs completas).

```typescript
// TypeScript (pluginClient.ts)
await pluginInstallFromUrl(
  "https://registry.forja.dev/plugins/formatter/1.0.0/manifest.lua",
  "https://registry.forja.dev/plugins/formatter/1.0.0/main.lua",
  "a3f9d2...",  // SHA-256 de manifest.lua
  "b7c1e0..."   // SHA-256 de main.lua
);
```

La verificación de hashes es **siempre obligatoria** en ambos comandos. No existe modo de bypass desde el cliente.

---

## 8. Switch de Seguridad — `FORJA_DEV_MODE`

Por defecto, **solo se permiten URLs del registry oficial**. Para desarrollo/testing se puede activar el modo dev:

| Modo | Configuración | URLs permitidas |
|---|---|---|
| **Producción** (default) | Sin env var | Solo `https://registry.forja.dev` |
| **Desarrollo** | `FORJA_DEV_MODE=1` | Cualquier URL `https://` (GitHub raw, localhost, etc.) |

```bash
# Modo desarrollo — permite instalar plugins desde GitHub directamente
FORJA_DEV_MODE=1 cargo tauri dev

# Nunca usar en release builds
```

Cuando `FORJA_DEV_MODE` está activo, el backend imprime una advertencia en stderr para cada URL no-oficial:

```
[security] FORJA_DEV_MODE active — allowing unofficial source: https://raw.githubusercontent.com/...
```

**La verificación de hashes SHA-256 es obligatoria incluso en dev mode.** El switch solo controla qué dominios se aceptan, no si se valida la integridad del archivo.

### Cambiar el registry (self-hosted)

Para usar un registry propio, cambiar la constante en `src-tauri/src/plugin_host/mod.rs` y recompilar:

```rust
// Una sola línea — fuente única de verdad
pub const OFFICIAL_REGISTRY: &str = "https://mi-registry.ejemplo.com";
```

---

## 9. Registry API (Endpoints Públicos)

```
GET  /plugins
     → lista de plugins aprobados con metadata básica

GET  /plugins/:name
     → detalle de un plugin (versiones, permisos, autor)

GET  /plugins/:name/:version/meta.json
     → hashes SHA-256 para verificación de integridad
     → { name, version, manifest_sha256, main_sha256, commit, approved }

GET  /plugins/:name/:version/manifest.lua
     → fuente del manifest

GET  /plugins/:name/:version/main.lua
     → fuente del plugin

GET  /themes
     → lista de themes aprobados

GET  /themes/:name/:version/meta.json
     → igual que plugins

GET  /themes/:name/:version/{manifest.lua,main.lua}
     → igual que plugins
```

Respuesta ejemplo de `/plugins`:
```json
[
  {
    "name":        "bracket-pair-colorizer",
    "version":     "1.0.0",
    "category":    "plugin",
    "description": "Colorize matching bracket pairs by nesting depth",
    "author":      "user",
    "permissions": ["buffer:read", "decorations:write"],
    "approved":    true,
    "commit":      "a84f9d2"
  }
]
```

Respuesta de `meta.json`:
```json
{
  "name":             "bracket-pair-colorizer",
  "version":          "1.0.0",
  "commit":           "a84f9d2",
  "manifest_sha256":  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4...",
  "main_sha256":      "b94d27b9934d3e08a52e52d7da7dabfa...",
  "approved":         true,
  "published_at":     "2026-04-30T12:00:00Z"
}
```

---

## 10. Fases de Implementación del Registry

### Fase MVP
- Formulario de envío (página pública simple)
- Aprobación por CLI (`approve-plugin submission_abc`)
- Registry como archivo JSON estático servido

### Fase 2 — Panel Web
- Panel privado SvelteKit con tabla de pendientes
- Botones aprobar/rechazar
- Diff del repositorio embebido

### Fase 3 — Automatización
- Scanner automático en CI
- Score de riesgo automático
- Notificaciones al autor (email/webhook)

### Fase 4 — Marketplace Visual
- Búsqueda y filtros
- Ratings y reseñas
- Página de detalle por plugin
- "Verified Publisher" badge para autores con historial limpio

---

## 11. "Verified Publisher"

Después de varias versiones aprobadas sin incidentes, un autor puede recibir el badge de **Verified Publisher**. Esto:
- Acelera el proceso de revisión (fast-track)
- Muestra un indicador visual en el marketplace
- **No exime** de revisión por versión — cada release sigue siendo revisado

---

## 12. Resumen de Seguridad

| Capa | Mecanismo |
|---|---|
| Código fuente | Repositorio público auditable |
| Revisión por commit | Siempre tag/SHA, nunca branch |
| Análisis automático | Scanner AST + detección de patrones |
| Revisión humana | Panel de moderación privado |
| Integridad del paquete | SHA-256 verificado antes de escribir en disco |
| URL origen | Solo `OFFICIAL_REGISTRY` (producción) · `FORJA_DEV_MODE` para dev |
| Instalación controlada | Solo desde registry oficial (o self-hosted recompilando) |
| Runtime | Sandbox Lua con mlua + límites de memoria/CPU |
