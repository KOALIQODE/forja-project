<div align="center">

# 🔥 Forja Studio Editor

**Un IDE de escritorio de alto rendimiento construido con Tauri + Svelte 5 + Rust**

*Donde la potencia nativa se une a la elegancia moderna*

![Version](https://img.shields.io/badge/version-0.1.0-orange?style=flat-square)
![License](https://img.shields.io/badge/license-Elastic--2.0-purple?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-1.75+-orange?style=flat-square&logo=rust)
![Svelte](https://img.shields.io/badge/Svelte-5.0-red?style=flat-square&logo=svelte)
![Tauri](https://img.shields.io/badge/Tauri-2.0-blue?style=flat-square&logo=tauri)
![Status](https://img.shields.io/badge/estado-desarrollo%20activo-green?style=flat-square)

</div>

---

## ¿Qué es Forja?

**Forja** es un editor de código de escritorio que adopta una arquitectura inspirada en [Zed](https://zed.dev): un núcleo de alto rendimiento escrito en **Rust** que impulsa una interfaz fluida en **Svelte 5**, empaquetado como aplicación nativa con **Tauri v2**.

El nombre *Forja* lo dice todo: aquí el código se **forja**, no simplemente se escribe.

### El problema que resuelve

Los editores modernos sufren de uno de dos males:
- **Demasiado pesados** (VS Code, JetBrains): alto consumo de memoria, startup lento.
- **Demasiado primitivos** (editores minimalistas): sin funciones modernas, difíciles de extender.

Forja ataca el punto medio: **rendimiento nativo de Rust** con **una interfaz de usuario moderna y extensible**, sin sacrificar ninguno de los dos.

---

## ✨ Características Actuales

### 🖊️ Editor de Código
- **Gestor de Buffers** con modelo de documento eficiente usando [Ropey](https://github.com/cessen/ropey) (estructura rope para edición O(log n))
- **Sintaxis highlighting** en tiempo real via **Tree-sitter** (arquitectura idéntica a Zed/Helix)
- **Parsers dinámicos**: descarga e instala gramáticas de lenguajes bajo demanda
- Soporte para múltiples buffers y pestañas simultáneas

### 🔍 Búsqueda e Indexación
- Motor de búsqueda ultrarrápido con **Aho-Corasick** y **Regex** compilados
- Procesamiento paralelo con **Rayon** para búsquedas en proyectos grandes
- Indexación de archivos con **memmap2** (mapeo directo en memoria)
- Watcher de archivos en tiempo real con **Notify**

### 🌳 Explorador de Proyecto
- Árbol de directorios reactivo con soporte de `.gitignore`
- Apertura rápida de archivos con previews
- Menú contextual nativo integrado

### 🔗 Integración Git
- Operaciones Git nativas via **libgit2** (sin depender de `git` en PATH)
- Vista de diffs con resaltado carácter a carácter
- Estado de archivos en tiempo real (modificado, staged, untracked)
- Historial de commits y operaciones básicas

### 🔌 Sistema de Plugins (Lua)
- Runtime Lua 5.4 **sandboxed** embebido con [mlua](https://github.com/mlua-rs/mlua)
- Cada plugin corre en su propia VM aislada
- **Sistema de permisos declarativo**: los plugins declaran qué necesitan, Rust lo ejecuta de forma segura
- API de eventos (event bus) para comunicación reactiva entre plugins y el editor
- Soporte para themes via plugins Lua

```lua
-- Ejemplo de manifest de plugin Forja
return {
  name        = "mi-plugin",
  version     = "1.0.0",
  kind        = "plugin",
  permissions = { "buffer:read", "buffer:write" }
}
```

### 🧠 Cliente LSP
- Comunicación con Language Servers (LSP) para diagnósticos, autocompletado e ir-a-definición
- Arquitectura asíncrona con Tokio para no bloquear la UI

### 🎨 Interfaz de Usuario
- Ventana sin decoraciones del sistema con **TitleBar personalizada**
- **StatusBar** con información del editor en tiempo real
- **WelcomeScreen** con proyectos recientes
- **TodoSidebar** integrado
- **ParserManager** y **ParserCompiler** para gestión de gramáticas Tree-sitter
- Diseño con **Tailwind CSS v4** y fuente **Montserrat Variable**

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                   FORJA STUDIO EDITOR               │
├─────────────────────────────────────────────────────┤
│                                                     │
│   ┌─────────────────────────────────────────────┐   │
│   │         FRONTEND  (Svelte 5 + TS)           │   │
│   │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │   │
│   │  │  Editor  │ │Explorer  │ │  Plugins   │  │   │
│   │  │ Buffers  │ │  Git UI  │ │   Store    │  │   │
│   │  └──────────┘ └──────────┘ └────────────┘  │   │
│   └──────────────────┬──────────────────────────┘   │
│                      │  Tauri IPC  (invoke/emit)     │
│   ┌──────────────────▼──────────────────────────┐   │
│   │           BACKEND  (Rust + Tokio)           │   │
│   │                                             │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │   │
│   │  │  Buffer  │  │  Parser  │  │   LSP    │  │   │
│   │  │  Plugin  │  │  Manager │  │  Client  │  │   │
│   │  └──────────┘  └──────────┘  └──────────┘  │   │
│   │                                             │   │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │   │
│   │  │   Git    │  │ Explorer │  │  Plugin  │  │   │
│   │  │  Plugin  │  │  Plugin  │  │   Host   │  │   │
│   │  └──────────┘  └──────────┘  └──────────┘  │   │
│   │                                             │   │
│   │  ┌─────────────────────────────────────┐   │   │
│   │  │   Lua Sandbox Runtime  (mlua)        │   │   │
│   │  │  Permisos · Event Bus · VM Aislada   │   │   │
│   │  └─────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Stack Tecnológico

| Capa | Tecnología | Propósito |
|------|-----------|-----------|
| UI | Svelte 5 + SvelteKit | Interfaz reactiva con runes |
| Estilos | Tailwind CSS v4 | Utilidades CSS zero-runtime |
| Desktop | Tauri v2 | Empaquetado nativo multiplataforma |
| Backend | Rust (edición 2021) | Núcleo de alto rendimiento |
| Async | Tokio | Operaciones I/O no bloqueantes |
| Text Buffer | Ropey | Edición eficiente O(log n) |
| Syntax | Tree-sitter | Parsing incremental |
| Git | libgit2 (git2-rs) | Operaciones Git nativas |
| Plugins | mlua (Lua 5.4) | Runtime sandboxed extensible |
| Búsqueda | Aho-Corasick + Rayon | Búsqueda paralela ultrarrápida |
| Concurrencia | DashMap + parking_lot | Estructuras concurrentes sin contención |

---

## 🚀 Inicio Rápido

### Prerrequisitos

```bash
# Rust (toolchain estable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Dependencias del sistema en Linux
sudo apt install \
  libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libglib2.0-dev

# macOS: solo necesitas Xcode Command Line Tools
xcode-select --install
```

### Instalación y Ejecución

```bash
# 1. Clonar el repositorio
git clone https://github.com/KOALIQODE/forja-project.git
cd forja-project

# 2. Instalar dependencias de Node
npm install

# 3. Modo desarrollo (lanza Tauri + Vite en paralelo)
npm run tauri dev

# 4. Build de producción
npm run tauri build
```

### Solo el frontend (sin Tauri)

```bash
npm run dev        # Servidor Vite en localhost:5173
npm run build      # Build de producción
npm run preview    # Preview del build
npm run check      # Type-check con svelte-check
```

---

## 🔌 Desarrollar un Plugin

Forja cuenta con un sistema de plugins Lua 5.4 completamente sandboxed. Ver [docs/PLUGIN_API.md](docs/PLUGIN_API.md) para la guía completa.

**Estructura mínima de un plugin:**

```
mi-plugin/
├── manifest.lua   # Metadatos y permisos declarados
└── main.lua       # Lógica del plugin
```

```lua
-- manifest.lua
return {
  name        = "mi-plugin",
  version     = "1.0.0",
  kind        = "plugin",      -- "plugin" | "theme"
  description = "Descripción corta",
  permissions = {
    "buffer:read",
    "buffer:write",
  }
}
```

```lua
-- main.lua
local editor = require("editor")

editor.on("buffer:open", function(buf)
  editor.log("Buffer abierto: " .. buf.path)
end)
```

**Contrato de seguridad del plugin:**

| Los plugins PUEDEN | Los plugins NO PUEDEN |
|---|---|
| Registrar comandos | Acceder al sistema de archivos |
| Reaccionar a eventos | Ejecutar procesos externos |
| Modificar buffers | Abrir sockets de red |
| Definir themes | Usar `os`, `io`, `debug` de Lua |

---

## 🗺️ Roadmap

### ✅ Completado
- [x] Arquitectura base Tauri v2 + Svelte 5
- [x] Sistema de buffers con Ropey (rope data structure)
- [x] Highlighting via Tree-sitter con descarga dinámica de gramáticas
- [x] Integración Git nativa (libgit2) sin depender de `git` en PATH
- [x] Vista de diffs (carácter a carácter + git diff)
- [x] Sistema de plugins Lua sandboxed con permisos declarativos
- [x] Cliente LSP básico
- [x] Explorador de archivos reactivo con soporte `.gitignore`
- [x] Sistema de stores reactivos con Svelte 5 runes
- [x] TodoSidebar integrado

### 🔄 En Progreso
- [ ] Refinamiento de la API de plugins Lua
- [ ] Formalización de APIs internas (`ARCH.md`)

> **Nota técnica:** La virtualización de buffers y la migración a RPC binario sobre IPC nativo son optimizaciones válidas a largo plazo, pero no son cuellos de botella en la etapa actual. El `DocumentManager` con Ropey + `FileIndex` con `memmap2`, y el batching de edits por `requestAnimationFrame` en el `DocumentBridge`, son suficientemente eficientes para el caso de uso presente.

### 🎯 Próxima Meta — Clonación y Ejecución Segura de Proyectos

El siguiente hito de Forja es convertirse en un entorno de desarrollo completo donde puedas gestionar proyectos desde cero de forma segura:

- **Clonar repositorios** directamente desde la UI (GitHub, GitLab, repos privados con SSH/HTTPS)
- **Detección automática del stack** tecnológico (Node.js, Rust, Python, Go, etc.)
- **Ejecución sandboxed de proyectos**: los proyectos clonados se ejecutan con permisos restringidos
- **Aislamiento de credenciales**: los proyectos ejecutados no tienen acceso a las credenciales del sistema ni a datos sensibles del usuario
- **Terminal integrada** con soporte para comandos del proyecto bajo control de Forja
- **Auditoría de dependencias**: análisis de seguridad antes de instalar paquetes de terceros

### 🌐 Próxima Meta — Cliente HTTP Integrado

Forja tendrá su propio cliente HTTP nativo, eliminando la necesidad de herramientas externas como Postman o Insomnia:

- **Interfaz visual de requests**: construye y lanza peticiones GET, POST, PUT, DELETE, PATCH, etc. desde dentro del editor
- **Variables de entorno por proyecto**: define `{{BASE_URL}}`, `{{TOKEN}}` y reutilízalos en todas las requests
- **Historial de requests**: guarda y organiza colecciones de peticiones ligadas a cada proyecto
- **Vista de respuesta inteligente**: JSON con syntax highlighting, headers, timing y código de estado
- **Importar desde código**: detecta `fetch`, `axios`, `curl` en el buffer abierto y genera la request automáticamente
- **Backend Rust**: peticiones HTTP via `reqwest` (ya presente en el proyecto) para máximo rendimiento

### 🗄️ Próxima Meta — Cliente de Base de Datos

Conexión y gestión de bases de datos directamente desde Forja, sin salir del editor:

- **Múltiples motores**: PostgreSQL, MySQL/MariaDB, SQLite, MongoDB y Redis
- **Explorador de esquemas**: visualiza tablas, columnas, índices y relaciones en un panel lateral
- **Editor SQL integrado**: syntax highlighting para SQL con autocompletado de tablas y columnas via LSP
- **Resultados como tabla**: visualización tabular de queries con soporte de paginación
- **Conexiones seguras**: credenciales cifradas y almacenadas localmente, nunca en texto plano
- **Snippets de queries**: guarda queries frecuentes ligadas al proyecto

### 💻 Próxima Meta — Command Input (Terminal Integrada)

Una terminal de comandos de primera clase integrada en la UI de Forja:

- **Panel de terminal embebido**: ejecuta comandos del sistema sin salir del editor (similar a VS Code)
- **Múltiples instancias**: varias terminales en tabs, una por proyecto o tarea
- **Contexto automático**: se abre directamente en el directorio del proyecto activo
- **Command palette**: input rápido de comandos con historial y autocompletado (tipo `Ctrl+P` pero para ejecución)
- **Integración con el editor**: ejecuta scripts, tests y builds y muestra los errores directamente en el gutter del código
- **Sandboxing de ejecución**: control de qué procesos puede lanzar cada proyecto

### 🤖 Meta Futura — Forja AI (Asistente IA Propio)

Forja integrará su propio asistente de IA diseñado específicamente para el flujo de desarrollo:

- **Contexto completo del proyecto**: el asistente conoce el código abierto, el historial git, los diagnósticos LSP y la estructura del proyecto
- **Local-first**: posibilidad de usar modelos locales (Ollama, llama.cpp) sin enviar código a servidores externos
- **Acciones directas sobre el editor**: puede editar buffers, ejecutar comandos, lanzar requests HTTP y consultar la base de datos, no solo dar respuestas de texto
- **Construido sobre el sistema de plugins**: implementado como plugin Forja, extensible y reemplazable por cualquier backend de IA
- **Privacidad por diseño**: tu código nunca sale de tu máquina si no lo decides explícitamente

---

## 🤝 Contribuir

El proyecto está en desarrollo activo. Si quieres contribuir en herramientas o themes para el gusto y productividad de la comunidad:

Revisa la documentación en `docs/` antes de trabajar en el sistema de plugins o el parser engine.

---

## 📖 Documentación Técnica

| Documento | Descripción |
|-----------|-------------|
| [PLUGIN_API.md](docs/PLUGIN_API.md) | API completa para desarrolladores de plugins Lua |
| [LUA_PLUGIN_RUNTIME.md](docs/LUA_PLUGIN_RUNTIME.md) | Arquitectura del runtime Lua sandboxed |
| [PLUGIN_REGISTRY.md](docs/PLUGIN_REGISTRY.md) | Sistema de registro y distribución de plugins |

---

## 📄 Licencia

Este proyecto está disponible públicamente bajo la **[Elastic License 2.0](./LICENSE)**.

- ✅ Puedes ver, estudiar y contribuir al código
- ✅ Puedes usar el código para desarrollo personal o interno
- ❌ No puedes forkear y redistribuir el proyecto
- ❌ No puedes ofrecer Forja como servicio gestionado/hosted sin permiso escrito
- ❌ No puedes eliminar avisos de copyright o marcas de KOALIQODE

Copyright © 2026 [KOALIQODE](https://github.com/KOALIQODE). Todos los derechos reservados.

---

<div align="center">

*Forja: donde el código se forja, no solo se escribe.*

</div>
