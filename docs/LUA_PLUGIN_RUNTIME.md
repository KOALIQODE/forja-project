# Lua Plugin Runtime — Forja Editor

Este documento describe el diseño completo del sistema de plugins Lua para Forja Editor: arquitectura del sandbox, API declarativa, sistema de permisos, manejo de temas, event bus y pipeline de seguridad.

---

## 1. Objetivo

El runtime de plugins Lua permite a los desarrolladores extender el editor sin comprometer la seguridad ni el rendimiento. El contrato fundamental es:

| Plugins Lua pueden… | Plugins Lua NO pueden… |
|---|---|
| Registrar comandos | Acceder al sistema de archivos |
| Reaccionar a eventos | Ejecutar procesos externos |
| Modificar buffers/documentos | Abrir sockets de red |
| Leer configuración del editor | Renderizar UI directamente |
| Consumir APIs expuestas por Rust | Usar librerías Lua peligrosas (`os`, `io`, `debug`) |

**Principio rector:** Plugins Lua = lógica declarativa + hooks. Core Rust = ejecución segura + UI + permisos.

---

## 2. Arquitectura General

```
Lua Plugin
   ↓
Lua Sandbox Runtime (Rust + mlua)
   ↓
Plugin API Host
   ↓
Core Editor Services
   ↓
Tauri Commands / Svelte UI
```

### Estructura del host en Rust

```
src-tauri/src/plugin_host/
 ├── manifest.rs      # Carga y valida manifest.lua
 ├── permissions.rs   # Valida permisos declarados vs. usados
 ├── runtime.rs       # VM Lua aislada por plugin (mlua)
 ├── event_bus.rs     # Cola serial de eventos
 ├── mod.rs           # PluginHost state + Tauri commands
 └── api/
      ├── mod.rs
      └── themes.rs   # ThemeDefinition struct
```

---

## 3. Runtime Lua Embebido (mlua)

Se usa **mlua** como runtime Lua embebido en Rust:

```toml
# Cargo.toml
mlua = { version = "0.10", features = ["lua54", "vendored"] }
```

Ventajas:
- Sandbox controlado desde Rust
- Exposición de funciones Rust a Lua sin FFI manual
- Eliminación de librerías peligrosas en tiempo de inicio
- Control de memoria y tiempo de ejecución por VM

### VM aislada por plugin

Cada plugin tiene su **propia instancia Lua**. Nunca se comparte una VM global.

```
Plugin A → Lua VM A  (8 MB RAM, 50 ms CPU)
Plugin B → Lua VM B  (8 MB RAM, 50 ms CPU)
```

Esto evita contaminación de estado global y aísla fallos.

---

## 4. Sandbox Obligatorio

Al crear la VM se cargan únicamente las librerías seguras:

| Librería | Estado |
|---|---|
| `base` | ✅ Permitida |
| `table` | ✅ Permitida |
| `string` | ✅ Permitida |
| `math` | ✅ Permitida |
| `utf8` | ✅ Permitida |
| `os` | ❌ Eliminada |
| `io` | ❌ Eliminada |
| `debug` | ❌ Eliminada |
| `package` | ❌ Eliminada |
| `coroutine` | ❌ Eliminada (opcional) |

```rust
// lua_runtime.rs
lua.globals().set("os", LuaValue::Nil)?;
lua.globals().set("io", LuaValue::Nil)?;
lua.globals().set("debug", LuaValue::Nil)?;
lua.globals().set("package", LuaValue::Nil)?;
```

### Límites de recursos

```rust
lua.set_memory_limit(8 * 1024 * 1024)?; // 8 MB por plugin

lua.set_hook(LuaHookTriggers::every_nth_instruction(1_000), |_lua, _debug| {
    // abortar si excede 50 ms de CPU
    Err(LuaError::RuntimeError("execution timeout".into()))
})?;
```

---

## 5. Estructura de un Plugin

Todo plugin debe seguir esta estructura:

```
mi-plugin/
 ├── manifest.lua   # Metadata + permisos declarados
 ├── main.lua       # Lógica principal
 └── README.md      # Documentación pública
```

### manifest.lua

```lua
return {
  name    = "bracket-pair-colorizer",
  version = "1.0.0",
  kind    = "plugin",  -- "plugin" | "theme"

  permissions = {
    "buffer:read",
    "decorations:write",
    "events:on_save"
  }
}
```

---

## 6. API Declarativa del Editor

Los plugins solo pueden acceder al namespace `editor`. No existe ninguna otra API global.

### Comandos

```lua
-- Registrar un comando invocable desde la paleta
editor.command("Format", function()
  local text = editor.get_buffer()
  editor.set_buffer(format(text))
end)
```

### Eventos

```lua
-- Reaccionar a eventos del ciclo de vida del editor
editor.on_event("on_save", function(ctx)
  -- ctx.text, ctx.language, ctx.filepath (si permiso workspace:read)
end)
```

Eventos disponibles:

| Evento | Descripción |
|---|---|
| `on_open` | Buffer abierto |
| `on_save` | Buffer guardado |
| `on_change` | Contenido modificado |
| `on_command` | Comando invocado |

### Buffer

```lua
local text = editor.get_buffer()   -- requiere buffer:read
editor.set_buffer(new_text)         -- requiere buffer:write
```

### Providers de decoraciones

```lua
editor.register_bracket_provider(function(ctx)
  -- ctx.text, ctx.language
  local result = {}
  -- análisis de brackets...
  return result  -- [{ start, finish, depth }, ...]
end)
```

El plugin **devuelve datos**, nunca pinta directamente. El core Rust aplica los colores.

### Themes

```lua
editor.register_theme({
  name = "tokyo-night-dark",
  colors = {
    bg        = "#1a1b26",
    fg        = "#c0caf5",
    selection = "#33467c",
  },
  syntax = {
    keyword       = "#7aa2f7",
    string        = "#9ece6a",
    function_name = "#7dcfff",
    comment       = "#565f89",
  },
  brackets = {
    "#f7768e", "#e0af68", "#9ece6a", "#7aa2f7", "#bb9af7"
  }
})
```

---

## 7. Sistema de Permisos Granular

### Permisos disponibles

| Permiso | Descripción |
|---|---|
| `buffer:read` | Leer contenido del buffer activo |
| `buffer:write` | Escribir en el buffer activo |
| `events:on_open` | Escuchar apertura de buffer |
| `events:on_save` | Escuchar guardado de buffer |
| `events:on_change` | Escuchar cambios en buffer |
| `decorations:write` | Registrar decoraciones visuales |
| `theme:register` | Registrar un tema |
| `workspace:read` | Leer metadatos del workspace |

### Validación en Rust

```rust
// permission_validator.rs
if !plugin.has_permission("buffer:write") {
    return Err(PluginError::PermissionDenied("buffer:write"));
}
```

El sistema compara los permisos declarados en `manifest.lua` contra los permisos que el plugin intenta usar en tiempo de ejecución. Si hay discrepancia, la llamada falla y se registra en logs.

---

## 8. Event Bus — Cola Serial

Para evitar race conditions entre plugins que modifiquen el mismo buffer:

```
Plugin Event Queue

[ on_save: plugin-A ] → ejecutar → commit state
[ on_save: plugin-B ] → ejecutar → commit state
```

Los handlers se ejecutan **en serie**, nunca en paralelo. Rust gestiona la cola y garantiza que los cambios de estado se apliquen en orden.

---

## 9. Temas Lua — Solo Datos

Los themes son 100% declarativos. **No pueden** usar `editor.on_event`, `editor.command`, ni ninguna API de comportamiento.

```
theme.lua → Rust ThemeEngine → CSS vars → Svelte UI
```

```rust
// themes.rs
let theme: ThemeDefinition = lua.from_value(value)?;
palette.background = theme.colors.bg;
palette.keyword    = theme.syntax.keyword;
```

El frontend aplica:

```css
--editor-bg: #1a1b26;
--syntax-keyword: #7aa2f7;
```

---

## 10. Render Pipeline de Decoraciones

```
Lua Plugin
   ↓ devuelve Vec<BracketRange> { start, finish, depth }
Rust Decoration Engine
   ↓ asigna color por depth usando theme.brackets[]
Theme Colors
   ↓
Canvas / SVG Renderer (Svelte)
```

El plugin y el theme trabajan en conjunto pero están desacoplados:
- El **plugin** decide el nesting (lógica)
- El **theme** decide los colores (visual)

---

## 11. Validación Estática de Código Lua

Antes de que un plugin sea aprobado en el registry, se analiza su AST:

Herramientas candidatas: `full_moon` (Rust), `luaparse`

Patrones prohibidos detectados automáticamente:

```
os.execute    os.getenv    os.exit
io.open       io.read      io.write
load          loadstring   loadfile
require       dofile       rawget / rawset
```

Si aparece cualquiera de estos, el plugin es **rechazado automáticamente** en la primera fase de revisión.

---

## 12. Firma y Verificación de Integridad

Cada versión aprobada es firmada:

```json
{
  "plugin":   "bracket-pair-colorizer",
  "version":  "1.0.0",
  "commit":   "a84f9d2",
  "hash":     "sha256:e3b0c44298fc1c...",
  "approved": true,
  "signature": "..."
}
```

Al instalar, el cliente Tauri:
1. Descarga el paquete desde el registry propio (nunca desde GitHub directo)
2. Recalcula el hash SHA-256
3. Verifica la firma
4. Rechaza si no coincide

---

## 13. Fases de Implementación

### Fase 1 — Themes Lua
- Solo `editor.register_theme()`
- Sin eventos ni comandos
- Permiso único: `theme:register`

### Fase 2 — Commands Lua
- `editor.command(name, fn)`
- Ejecución manual desde paleta de comandos
- Permisos: `buffer:read`, `buffer:write`

### Fase 3 — Event Bus
- `editor.on_event("on_save", fn)`
- `editor.on_event("on_open", fn)`
- Cola serial de eventos

### Fase 4 — Decoration Providers
- `editor.register_bracket_provider(fn)`
- Contexto limitado: solo `text` y `language`

### Fase 5 — Permisos + Firma
- Validación estática AST
- Firma de releases
- Verificación en cliente

### Fase 6 — Registry Oficial
- Backend de moderación
- Panel de revisión privado
- Marketplace público

---

## 14. Compatibilidad con Estilo Neovim

No se pretende compatibilidad 1:1 con la API de Neovim. El objetivo es **familiaridad conceptual** para autores Lua:

| Neovim | Forja |
|---|---|
| `vim.api.nvim_buf_get_lines` | `editor.get_buffer()` |
| `vim.api.nvim_create_user_command` | `editor.command()` |
| `vim.api.nvim_create_autocmd` | `editor.on_event()` |
| `vim.keymap.set` | `editor.keymap()` *(fase futura)* |

Esto permite que autores Lua se adapten rápidamente sin cargar la complejidad del runtime de Neovim.

---

## 15. Gestión de Plugins desde la UI

El modal **Extensions** (accesible desde la barra de estado o paleta de comandos) expone tres pestañas:

### Pestaña Plugins
- Lista todos los plugins Lua activos en tiempo de ejecución
- Muestra: nombre, versión, permisos como badges con color semántico, comandos registrados
- Botón **Disable**: llama a `plugin_unload(name)` — desactiva sin reiniciar el editor
- Para **re-activar**: el plugin debe recargarse desde disco via `plugin_load_from_path(dir_path)` (campo expuesto en `PluginInfo`)

### Pestaña Themes
- Lista todos los temas Lua registrados
- Botón **Activate**: aplica el tema inmediatamente via `activateThemeByName(name)` → convierte colores a CSS vars en `:root`
- El tema activo se resalta visualmente (borde violeta, badge "Active")
- Solo un tema puede estar activo a la vez

### Pestaña Language Servers
- Lista los LSP servers disponibles (descarga bajo demanda)
- Sin cambios respecto a la implementación anterior

### Flujo de carga al inicio
```
App onMount
   → initPlugins()
      → plugin_load_builtins()     # seed + carga desde ~/.local/share/forja/plugins/
      → plugin_scan_user_plugins() # escanea subdirs plugins/ y themes/
      → refreshPlugins()           # actualiza store loadedPlugins
      → applyFirstTheme()          # aplica el primer tema disponible
```

### Tipos TypeScript expuestos
```typescript
interface PluginInfo {
  name: string;
  version: string;
  kind: "plugin" | "theme";
  permissions: string[];
  commands: string[];
  dir_path: string; // ruta absoluta en disco — permite reload/re-enable
}
```

### Stores Svelte
| Store | Tipo | Descripción |
|---|---|---|
| `loadedPlugins` | `writable<PluginInfo[]>` | Lista de plugins activos |
| `activeTheme` | `writable<ThemeDefinition \| null>` | Tema aplicado actualmente |
| `bracketRanges` | `writable<BracketRange[]>` | Rangos del bracket colorizer |
| `pluginLoading` | `writable<boolean>` | Indicador de carga |
| `pluginList$` | `derived` | Solo plugins (kind = "plugin") |
| `themeList$` | `derived` | Solo themes (kind = "theme") |

---

## 16. Instalación de Plugins desde el Registry

### Comandos Tauri disponibles

| Comando | Descripción |
|---|---|
| `plugin_install_from_registry(name, version)` | Instala desde el registry oficial con meta.json |
| `plugin_install_from_url(manifest_url, main_url, manifest_sha256, main_sha256)` | Instala desde URLs explícitas (seguridad validada) |
| `plugin_registry_info()` | Devuelve la URL del registry y si dev_mode está activo |

### Flujo de instalación

```
pluginInstallFromRegistry("formatter", "1.0.0")
         ↓
   GET /plugins/formatter/1.0.0/meta.json   ← hashes SHA-256
         ↓
   GET /plugins/formatter/1.0.0/manifest.lua
   GET /plugins/formatter/1.0.0/main.lua
         ↓
   verify_sha256(manifest) → OK
   verify_sha256(main.lua) → OK
         ↓
   ~/.local/share/forja/plugins/plugins/formatter/
     ├── manifest.lua
     └── main.lua
         ↓
   load_plugin_from_dir() → Lua VM
```

### Dónde van los plugins instalados

```
~/.local/share/forja/plugins/      (Linux)
~/Library/Application Support/forja/plugins/  (macOS)
%APPDATA%\forja\plugins\           (Windows)
  ├── plugins/
  │    └── formatter/
  │         ├── manifest.lua
  │         └── main.lua
  └── themes/
       └── mi-theme/
            ├── manifest.lua
            └── main.lua
```

Los built-ins (`tokyo-night-dark`, `bracket-pair-colorizer`) se **seed** en este directorio en el primer arranque y luego se leen desde disco — nunca desde el binario.

### Security switch

```
Sin FORJA_DEV_MODE   →  solo registry.forja.dev         (producción)
FORJA_DEV_MODE=1     →  cualquier URL https://          (desarrollo)
```

Cambiar el registry: editar `OFFICIAL_REGISTRY` en `plugin_host/mod.rs` y recompilar. Ver `docs/PLUGIN_REGISTRY.md` para el detalle completo.

