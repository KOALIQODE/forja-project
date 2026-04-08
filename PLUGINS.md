# Neovim Plugin Integration & Verification

Este documento detalla la arquitectura para integrar plugins de Neovim en Forja Editor y el funcionamiento del Middleware de seguridad.

## 🛡️ Plugin Verification Middleware

Antes de permitir que Neovim instale un plugin, Forja Editor lo pasa por un middleware de validación. Este proceso asegura que el editor se mantenga rápido, seguro y funcional.

### Criterios de Verificación:
1.  **Compatibilidad UI**: Se verifica si el plugin intenta usar elementos de terminal nativos (como `floating windows` tradicionales) que requieren una capa de adaptación en Svelte.
2.  **Seguridad**: Escaneo de dependencias sospechosas o ejecución de binarios externos no autorizados.
3.  **Rendimiento**: Evaluación de si el plugin es conocido por causar latencia en el bucle principal de Neovim.
4.  **Integridad**: Verificación de la existencia del repositorio y versión.

---

## 🛠️ Flujo de Instalación

1.  **Petición**: El usuario solicita un plugin (ej: `folke/flash.nvim`).
2.  **Middleware**: `pluginMiddleware.ts` analiza el manifiesto del plugin.
3.  **Aprobación**: Si el plugin es seguro, se genera una configuración Lua temporal.
4.  **Inyección**: Neovim recibe la orden de carga vía RPC.
5.  **Sincronización**: Svelte suscribe a los eventos RPC que el plugin emita.

---

## 🚀 Guía de Integración Técnica

### Nivel 1: Plugins de Lógica (Headless)
Plugins como `Comment.nvim` o `autopairs` funcionan sin cambios.
- **Acción**: Inyectar en el `init.lua` de Forja.

### Nivel 2: Plugins de Información (LSP/Treesitter)
Requieren que el Frontend renderice sus datos.
- **Acción**: Escuchar eventos `nvim_buf_set_lines` y `publishDiagnostics`.

### Nivel 3: Plugins de Experiencia (Telescope/Flash)
Requieren re-implementar la vista en Svelte para mantener el rendimiento de 60fps.
- **Acción**: Usar Neovim como motor de búsqueda y Svelte como visualizador de listas.

---

## ⚠️ Plugins "Blacklisted"
Por ahora, Forja Editor bloquea plugins que:
- Requieran una terminal real embebida (ej: `toggleterm.nvim`).
- Modifiquen el renderizado de la terminal de bajo nivel (ej: `neovide` específico).
