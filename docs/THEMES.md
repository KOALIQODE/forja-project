# 🎨 Integración de Temas de Neovim en Forja Editor

Este documento detalla la arquitectura necesaria para extraer y aplicar cualquier tema de la comunidad de Neovim (Tokyonight, Catppuccin, Gruvbox, etc.) directamente en la interfaz de Svelte.

## 1. El Concepto: Interpretación de Highlights
A diferencia de un emulador de terminal, Forja no renderiza píxeles. En su lugar, consulta los **Highlight Groups** de Neovim y los mapea a **Variables CSS**. Esto asegura que la UI y el código tengan una estética 100% coherente.

## 2. Flujo de Extracción de Colores

1.  **Carga**: El usuario ejecuta `:colorscheme tokyonight` en Neovim.
2.  **Consulta RPC**: Forja solicita los valores hexadecimales de los grupos principales (Normal, CursorLine, Comment, etc.).
3.  **Inyección**: Los colores se inyectan en el `:root` de Svelte mediante variables CSS.

### Mapeo de Grupos Principales:
| Grupo Neovim | Variable CSS | Uso en la UI |
| :--- | :--- | :--- |
| `Normal` | `--base-bg` | Fondo del editor y sidebar. |
| `Normal` | `--base-fg` | Color de texto principal. |
| `CursorLine` | `--ui-line-active` | Fondo de la línea donde está el cursor. |
| `Comment` | `--syntax-comment` | Color de los comentarios. |
| `Keyword` | `--syntax-keyword` | Color de `if`, `while`, `return`. |
| `Function` | `--syntax-function` | Color de nombres de funciones. |

## 3. Implementación del Puente (RPC)

Para sincronizar en tiempo real, se debe añadir un Auto-comando en el Neovim interno:

```lua
function SyncForjaTheme()
    local groups = {"Normal", "Comment", "Keyword", "Function", "String", "CursorLine"}
    local theme = {}
    for _, g in ipairs(groups) do
        local hl = vim.api.nvim_get_hl(0, {name = g})
        theme[g] = {
            fg = string.format("#%06x", hl.fg or 0),
            bg = string.format("#%06x", hl.bg or 0)
        }
    end
    vim.fn.rpcnotify(0, "theme_updated", theme)
end

vim.api.nvim_create_autocmd("ColorScheme", { callback = SyncForjaTheme })
```

## 4. Ventajas de este Enfoque
*   **Consistencia Total**: Si el usuario cambia el tema en su config de Neovim, Forja Editor se actualiza completo.
*   **Sin Latencia**: Solo se ejecuta cuando el tema cambia, no afecta el rendimiento de escritura.
*   **Personalización**: Permite que los componentes de Svelte (como el File Explorer) usen los mismos colores exactos que el código.
