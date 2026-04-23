# Documentación de Arquitectura: Sintaxis y Gestión de Buffers

Este documento detalla los cambios realizados en **Forja Studio** para implementar un sistema de resaltado de sintaxis robusto (estilo Zed) y una gestión de buffers persistente por proyecto.

## 1. Arquitectura de Sintaxis (Estilo Zed)

Hemos migrado de un sistema de compilación en runtime (frágil) a un sistema de **Binarios Precompilados**.

### Componentes:
- **`LanguageRegistry` (Rust):** Gestiona la descarga y carga de parsers.
- **Lazy Loading:** Los parsers no se incluyen en el ejecutable. Se descargan solo cuando el usuario los necesita.
- **Binarios (.so / .dll / .dylib):** Se descarga el parser ya compilado para la arquitectura específica (Linux, Windows, macOS).
- **Queries (.scm):** Se descargan archivos de consulta que definen qué partes del código son funciones, palabras clave, etc. Esto permite colores reales y profesionales.
- **`libloading`:** Inyecta dinámicamente el parser descargado en el motor de Forja sin reiniciar la app.

### Flujo de Instalación:
1. Usuario abre un archivo (ej. `.svelte`).
2. Un **Toast** en la esquina inferior derecha recomienda instalar el soporte.
3. Al aceptar, Forja descarga:
   - `parser.so` (binario)
   - `highlights.scm` (definiciones de color)
4. El resaltado se activa instantáneamente a través de un evento global `parser-ready`.

## 2. Gestión de Buffers por Proyecto

Se resolvió el problema de "fuga de buffers" entre proyectos.

- **Persistencia Scoped:** Los buffers abiertos se guardan en el `localStorage` usando una clave basada en el path del proyecto (`base64`).
- **Limpieza Automática:** Al cerrar un proyecto o cambiar a otro, Forja restaura exactamente el estado (archivos abiertos y archivo activo) de ese proyecto específico.
- **Store Unificado:** `bufferStore.ts` ahora escucha cambios en `projectStore.ts` para sincronizar el estado del disco con la memoria.

## 3. Interfaz de Usuario (UX)

### StatusBar Integrado
El StatusBar ahora vive **dentro** del editor (`EditorBuffer.svelte`) y sigue los lineamientos estéticos de la app:
- **Glassmorphism:** Fondo `bg-black/15` con `backdrop-blur-xl`.
- **Breadcrumbs:** Muestra la posición del código en tiempo real (ej. `modulo > clase > función`) usando Tree-Sitter.
- **Cursor Info:** Posición exacta `Ln X, Col Y`.
- **Buffer List:** Un acceso rápido para ver y cambiar entre todos los archivos abiertos del proyecto.

### Iconografía Profesional
- Se migraron todos los iconos a `@lucide/svelte`.
- **Colores Sobrios:** Se ajustó `fileIcons.ts` para usar tonos menos saturados y más profesionales, evitando el ruido visual en el explorador.

## 4. Pendientes / Siguientes Pasos

Para que el sistema sea 100% funcional, se requiere preparar los assets:

1. **Servidor de Assets:**
   - Actualmente apunta a: `https://github.com/KOALIQODE/forja-assets/releases/download/parsers`
   - Se deben subir los binarios compilados para cada plataforma:
     - `rust-linux-x64.so`, `rust-windows-x64.dll`, etc.
     - `rust-highlights.scm` (archivo de texto con las queries).

2. **Diagnósticos:**
   - La sección de Errores y Advertencias en el StatusBar está preparada pero actualmente usa valores mock (0). Falta integrar el motor de linting o LSP.

3. **Mapeo de Lenguajes:**
   - Se añadieron Rust, JavaScript, Python, JSON y Svelte. Se pueden añadir más fácilmente extendiendo el `LanguageRegistry` en Rust.

---
*Forja Studio - Manual de Arquitectura v1.0*
