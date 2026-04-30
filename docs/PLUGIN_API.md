# Plugin Developer API — Forja Editor

Esta guía es para desarrolladores que quieren crear plugins o themes para Forja Editor usando Lua.

---

## Resumen del modelo

Forja usa un runtime Lua sandboxed. Cada plugin corre en su propia VM aislada (sin acceso al sistema de archivos, red, ni procesos). El plugin **declara lo que quiere hacer** y el core de Rust **lo ejecuta de forma segura**.

```
Tu plugin Lua → editor.* API → Rust Core → UI (Svelte/Canvas)
```

---

## Estructura obligatoria de un plugin

```
mi-plugin/
 ├── manifest.lua   ← metadatos + permisos declarados
 └── main.lua       ← lógica del plugin
```

---

## manifest.lua

Cada plugin DEBE exportar una tabla con estos campos:

```lua
return {
  name    = "mi-plugin",       -- identificador único (sin espacios)
  version = "1.0.0",           -- semver
  kind    = "plugin",          -- "plugin" | "theme"
  permissions = {
    "buffer:read",
    "buffer:write",
  }
}
```

### Permisos disponibles

| Permiso | Descripción |
|---|---|
| `buffer:read` | Leer el contenido del buffer activo |
| `buffer:write` | Modificar el contenido del buffer activo |
| `events:on_save` | Reaccionar al evento de guardado de archivo |
| `events:on_open` | Reaccionar al evento de apertura de archivo |
| `events:on_change` | Reaccionar a cambios en el buffer |
| `theme:register` | Registrar un tema de color |
| `decorations:write` | Registrar un proveedor de decoraciones (ej: bracket colorizer) |

> ⚠️ Si tu plugin llama a una API sin el permiso declarado, el runtime lanzará un error y el plugin no se cargará.

---

## API disponible en main.lua

El objeto global `editor` expone todas las funciones disponibles para tu plugin.

### `editor.command(name, fn)`

Registra un comando que el usuario puede ejecutar desde la paleta de comandos.

```lua
-- Permiso requerido: buffer:read y/o buffer:write
editor.command("UpperCase", function()
  local text = editor.get_buffer()
  editor.set_buffer(text:upper())
end)
```

### `editor.on_event(event_name, fn)`

Suscribe el plugin a un evento del editor. La función recibe un `ctx` con información del contexto.

```lua
-- Permiso requerido: events:<event_name>
editor.on_event("on_save", function(ctx)
  -- ctx.text     → contenido del buffer (string)
  -- ctx.language → lenguaje del archivo (string, ej: "rust", "lua")
  -- ctx.filepath → ruta absoluta del archivo (string)
  local word_count = 0
  for _ in ctx.text:gmatch("%S+") do word_count = word_count + 1 end
  print("Palabras al guardar: " .. word_count)
end)
```

Eventos disponibles: `on_save`, `on_open`, `on_change`

### `editor.get_buffer()` → string

Lee el contenido completo del buffer activo.

```lua
-- Permiso requerido: buffer:read
local text = editor.get_buffer()
```

### `editor.set_buffer(text)`

Reemplaza el contenido completo del buffer activo.

```lua
-- Permiso requerido: buffer:write
editor.set_buffer("nuevo contenido")
```

### `editor.register_theme(table)`

Registra un tema de color. Solo disponible para plugins con `kind = "theme"`.

```lua
-- Permiso requerido: theme:register
editor.register_theme({
  name = "mi-tema",

  colors = {
    bg          = "#1a1b26",   -- fondo del editor
    fg          = "#c0caf5",   -- texto por defecto
    cursor      = "#c0caf5",   -- color del cursor
    selection   = "#33467c",   -- fondo de selección
    line_number = "#3b4261",   -- números de línea
    gutter_bg   = "#1a1b26",   -- fondo del gutter
    border      = "#27283d",   -- bordes del editor
    active_line = "#1e202e",   -- fondo de la línea activa
  },

  syntax = {
    keyword       = "#7aa2f7",
    string        = "#9ece6a",
    function_name = "#7dcfff",
    variable      = "#c0caf5",
    type          = "#2ac3de",
    constant      = "#ff9e64",
    comment       = "#565f89",
    operator      = "#89ddff",
    number        = "#ff9e64",
    punctuation   = "#89ddff",
    attribute     = "#bb9af7",
    tag           = "#f7768e",
    namespace     = "#2ac3de",
  },

  -- Colores de bracket pairs por profundidad de anidamiento (depth 1 → índice 1)
  brackets = {
    "#f7768e",  -- depth 1
    "#e0af68",  -- depth 2
    "#9ece6a",  -- depth 3
    "#7aa2f7",  -- depth 4
    "#bb9af7",  -- depth 5
  }
})
```

> Los themes son **100% declarativos**. No pueden usar eventos, comandos ni leer el buffer.

### `editor.register_bracket_provider(fn)`

Registra una función que analiza el texto y devuelve rangos de brackets para colorear.

```lua
-- Permiso requerido: decorations:write
editor.register_bracket_provider(function(ctx)
  -- ctx.text     → contenido completo del buffer
  -- ctx.language → lenguaje del archivo

  local result = {}
  local stack  = {}
  local OPEN   = { ["("] = ")", ["["] = "]", ["{"] = "}" }
  local CLOSE  = { [")"] = true, ["]"] = true, ["}"] = true }

  for i = 1, #ctx.text do
    local ch = ctx.text:sub(i, i)
    if OPEN[ch] then
      table.insert(stack, { char = ch, pos = i })
    elseif CLOSE[ch] then
      local top = stack[#stack]
      if top and OPEN[top.char] == ch then
        table.remove(stack)
        table.insert(result, {
          start  = top.pos,
          finish = i,
          depth  = #stack + 1
        })
      end
    end
  end

  return result
  -- Devuelve: [ { start=N, finish=N, depth=N }, ... ]
  -- start/finish son índices 1-based (convención Lua)
  -- depth es la profundidad de anidamiento (1 = más externo)
end)
```

---

## Librerías Lua disponibles

Solo están disponibles estas librerías estándar de Lua (seguras):

| Librería | Descripción |
|---|---|
| `string` | Operaciones de texto |
| `table` | Operaciones de tablas |
| `math` | Funciones matemáticas |
| `utf8` | Soporte para Unicode |
| *(base)* | `print`, `type`, `tostring`, `tonumber`, `pairs`, `ipairs`, etc. |

**Prohibidas** (eliminadas del sandbox):

| Librería | Motivo |
|---|---|
| `os` | Acceso al sistema operativo |
| `io` | Acceso al sistema de archivos |
| `debug` | Introspección de la VM |
| `package` / `require` | Carga de módulos arbitrarios |
| `load` / `loadstring` / `loadfile` / `dofile` | Ejecución de código arbitrario |

---

## Límites del runtime

| Recurso | Límite |
|---|---|
| Memoria por plugin | 8 MB |
| Librerías del sistema | ❌ Prohibidas |
| Acceso a red | ❌ Prohibido |
| Acceso al filesystem | ❌ Prohibido |
| Una VM por plugin | ✅ Aislado |

---

## Ejemplo completo: formateador de texto

**manifest.lua**
```lua
return {
  name    = "trim-whitespace",
  version = "1.0.0",
  kind    = "plugin",
  permissions = { "buffer:read", "buffer:write" }
}
```

**main.lua**
```lua
editor.command("TrimWhitespace", function()
  local text = editor.get_buffer()

  -- Eliminar espacios al final de cada línea
  local result = text:gsub("[ \t]+(\n)", "%1")
  result = result:gsub("[ \t]+$", "")

  editor.set_buffer(result)
end)

-- También al guardar
editor.on_event("on_save", function(ctx)
  local cleaned = ctx.text:gsub("[ \t]+(\n)", "%1")
  editor.set_buffer(cleaned)
end)
```

---

## Ejemplo completo: theme mínimo

**manifest.lua**
```lua
return {
  name    = "dracula-minimal",
  version = "1.0.0",
  kind    = "theme",
  permissions = { "theme:register" }
}
```

**main.lua**
```lua
editor.register_theme({
  name = "dracula-minimal",
  colors = {
    bg  = "#282a36",
    fg  = "#f8f8f2",
  },
  syntax = {
    keyword       = "#ff79c6",
    string        = "#f1fa8c",
    comment       = "#6272a4",
    function_name = "#50fa7b",
    type          = "#8be9fd",
    constant      = "#bd93f9",
  },
  brackets = { "#ff79c6", "#50fa7b", "#8be9fd", "#ffb86c" }
})
```

---

## Dónde se instalan los plugins

Los plugins se guardan en:

| SO | Ruta |
|---|---|
| Linux | `~/.local/share/forja/plugins/` |
| macOS | `~/Library/Application Support/forja/plugins/` |
| Windows | `%APPDATA%\forja\plugins\` |

Estructura dentro de la carpeta:
```
plugins/
 ├── themes/
 │   └── tokyo-night-dark/
 │       ├── manifest.lua
 │       └── main.lua   (o theme.lua)
 └── plugins/
     └── bracket-pair-colorizer/
         ├── manifest.lua
         └── main.lua
```

> Los plugins built-in se copian automáticamente a esta carpeta en el primer arranque. El usuario puede inspeccionarlos y modificarlos.

---

## Proceso de publicación

Para publicar un plugin en el registry oficial de Forja:

1. Crea un repositorio en GitHub con la estructura `manifest.lua` + `main.lua`
2. Crea un tag de versión (`v1.0.0`)
3. Envía el repositorio + tag para revisión
4. El scanner automático analiza: permisos, APIs usadas, código sospechoso
5. Revisión manual del equipo
6. Si se aprueba: se empaqueta, se firma y se publica en el registry

Ver `PLUGIN_REGISTRY.md` para más detalles del pipeline de moderación.

---

## Compatibilidad conceptual con Neovim

Si vienes de Neovim/Lua, este mapa puede ayudarte:

| Neovim | Forja |
|---|---|
| `vim.api.nvim_buf_get_lines` | `editor.get_buffer()` |
| `vim.api.nvim_buf_set_lines` | `editor.set_buffer(text)` |
| `vim.api.nvim_create_user_command` | `editor.command(name, fn)` |
| `vim.api.nvim_create_autocmd` | `editor.on_event(event, fn)` |
| Colorscheme tables | `editor.register_theme({...})` |

> Forja NO tiene compatibilidad 1:1 con Neovim. El objetivo es familiaridad conceptual, no reemplazar el runtime de Neovim.
