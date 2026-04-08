# Arquitectura Técnica de Forja Editor

Este documento detalla el diseño interno y el flujo de datos del editor Forja.

## 1. Modelo de Interacción: El Puente (The Bridge)

Forja no es un wrapper de terminal; es una aplicación que utiliza Neovim como un motor de estado (State Engine).

### Flujo de Datos
1.  **Input del Usuario:** Capturado en Svelte (`src/routes/+page.svelte`).
2.  **Procesamiento de Comandos:** `NvimNavigator.ts` evalúa la tecla y decide si enviarla a Neovim o manejarla localmente.
3.  **Ejecución en Motor:** El comando se envía al proceso `nvim --embed` vía `neovim` (node library).
4.  **Sincronización de UI:** Neovim notifica cambios de cursor o buffer, los cuales se envían por WebSocket al frontend para actualizar el estado reactivo de Svelte.

## 2. Componentes del Servidor (Editor Core)

### NvimEmbedClient (`src/lib/server/nvim/client.ts`)
Responsable del ciclo de vida del proceso de Neovim.
- **Modo:** `--embed`.
- **Comunicación:** MessagePack RPC.
- **Responsabilidad:** Ejecutar comandos de bajo nivel, gestionar opciones globales (`set noswapfile`).

### BufferManager (`src/lib/server/nvim/bufferManager.ts`)
Administra la relación entre los buffers internos de Neovim y los componentes visuales de Svelte.
- **Estrategia:** Cada componente (Ej: WelcomeScreen, FileEditor) tiene una estrategia de navegación propia.
- **Virtualización:** Los buffers que no están visibles deben mantenerse en estado "suspendido" para evitar sobrecargar el proceso de Neovim.

## 3. Navegación y Modos

Forja implementa un sistema de navegación híbrido:
- **Modos de Neovim:** Se respetan los modos `Normal`, `Insert`, `Visual`.
- **Intercepciones Locales:** Ciertos shortcuts (Ej: `Ctrl+P`) son interceptados por Svelte/Tauri antes de llegar a Neovim para mejorar la UX.

## 4. Backend Nativo (Rust)

El código en `src-tauri` se encarga de:
- **FileSystem:** Lectura/Escritura de archivos usando los hilos de Rust para no bloquear la UI.
- **Git:** Integración profunda con `git2-rs` para estados de repositorio ultra rápidos.
- **Configuración:** Almacenamiento de preferencias del usuario en formato nativo.

## 5. Próximas Evoluciones

- **Zero-Latency Communication:** Migrar de WebSocket JSON a un protocolo binario directo entre el frontend y Neovim a través de Tauri IPC.
- **Dynamic LSP UI:** Renderizar los menús de autocompletado nativos de LSP de Neovim como componentes flotantes de Svelte para mejor legibilidad.
