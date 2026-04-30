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

Al instalar un plugin, el cliente:

```rust
// Descarga desde registry oficial, nunca desde GitHub
let package = registry.download("bracket-colorizer", "1.0.0").await?;

// Recalcula hash SHA-256
let computed_hash = sha256(&package.bytes);
assert_eq!(computed_hash, package.metadata.hash);

// Verifica firma con clave pública del registry
verify_signature(&package.bytes, &package.signature, &REGISTRY_PUBLIC_KEY)?;

// Si todo OK, instala
plugin_host.install(package)?;
```

Si el hash no coincide o la firma es inválida, la instalación es **rechazada silenciosamente** y se registra en logs.

---

## 8. Registry API (Endpoints Públicos)

```
GET  /plugins
     → lista de plugins aprobados con metadata básica

GET  /plugins/:name
     → detalle de un plugin (versiones, permisos, autor)

GET  /plugins/:name/:version/download
     → descarga del paquete firmado

GET  /themes
     → lista de themes aprobados

GET  /themes/:name/:version/download
     → descarga del theme firmado
```

Respuesta ejemplo:
```json
[
  {
    "name":        "bracket-pair-colorizer",
    "version":     "1.0.0",
    "category":    "plugin",
    "description": "Colorize matching bracket pairs by nesting depth",
    "author":      "user",
    "permissions": ["buffer:read", "decorations:write"],
    "approved":    true
  }
]
```

---

## 9. Fases de Implementación del Registry

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

## 10. "Verified Publisher"

Después de varias versiones aprobadas sin incidentes, un autor puede recibir el badge de **Verified Publisher**. Esto:
- Acelera el proceso de revisión (fast-track)
- Muestra un indicador visual en el marketplace
- **No exime** de revisión por versión — cada release sigue siendo revisado

---

## 11. Resumen de Seguridad

| Capa | Mecanismo |
|---|---|
| Código fuente | Repositorio público auditable |
| Revisión por commit | Siempre tag/SHA, nunca branch |
| Análisis automático | Scanner AST + detección de patrones |
| Revisión humana | Panel de moderación privado |
| Integridad del paquete | SHA-256 + firma del registry |
| Instalación controlada | Solo desde registry oficial |
| Runtime | Sandbox Lua con mlua + límites de memoria/CPU |
