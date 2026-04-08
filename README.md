# Forja Editor: Neovim-Powered Modern IDE

Forja es un editor de código de alto rendimiento que combina la potencia y los movimientos de **Neovim** con la fluidez y estética de una interfaz moderna construida en **Svelte 5** y **Tauri**.

El objetivo principal es resolver los problemas de rendimiento y los bugs de gestión de buffers que ocurren en Neovim tradicional cuando se escala con muchos plugins, manteniendo la compatibilidad con su ecosistema de movimientos.

## 🏗️ Arquitectura del Sistema

El proyecto utiliza una **Arquitectura Híbrida de Puente**:

- **Capa de Visualización (Frontend):** Svelte 5 + Tailwind CSS para una interfaz reactiva y ligera.
- **Motor de Estado (Neovim):** Neovim en modo `--embed` gestiona el texto, los modos y los movimientos.
- **Puente de Comunicación:** Servidor WebSocket/IPC para sincronización en tiempo real.
- **Capacidades Nativas (Backend):** Rust (Tauri) para operaciones de sistema de archivos, Git y optimización de recursos.

## 📂 Estructura del Proyecto

### Nucleo de Servidor (`src/lib/server/nvim/`)
- `client.ts`: Singleton que gestiona el proceso `nvim`.
- `bufferManager.ts`: Administración de buffers virtuales y reales.
- `buffers/`: Definiciones específicas para diferentes tipos de contenido.

### Navegación (`src/lib/navigation/`)
- `NvimNavigator.ts`: Traductor de eventos de teclado a comandos Neovim.

### Backend Rust (`src-tauri/src/`)
- `commands/`: Operaciones nativas de alta velocidad (Git, FS).

## 🚀 Roadmap de Desarrollo

1.  **Documentación y Arquitectura:** Formalización de APIs internas y creación de `ARCH.md`.
2.  **Virtualización de Buffers:** Optimización del uso de memoria manteniendo solo buffers activos en el proceso de Neovim.
3.  **Comunicación Binaria:** Migración a RPC sobre IPC nativo de Tauri para latencia cero.
4.  **Capa de Renderizado Optimizada:** Integración de un motor de visualización web de alto rendimiento.

---
*Este proyecto busca la simplicidad de uso con la profundidad de Neovim.*
