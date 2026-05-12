# UI Theme System — Contributor Guide

Forja's UI theme system defines the visual personality of every app surface — Welcome Screen, Explorer, Status Bar, Title Bar, Editor canvas, and Theme Picker. All tokens are CSS custom properties applied inline on each component's root element via `themeStyle`.

---

## Where themes live

```
src/lib/themes/index.ts              ← static themes (misto-dark, misto-light)
src-tauri/lua/themes/<name>/main.lua ← plugin themes (e.g. tokyo-night-dark)
src/lib/stores/uiThemeStore.ts       ← store + persistence (don't touch)
src/lib/components/ThemePicker.svelte ← picker UI (don't touch)
```

Static themes (`index.ts`) are always available from startup. Lua plugin themes are loaded asynchronously from the backend and merged in via `loadUIThemesFromBackend()`. **Both must define all tokens listed below.**

---

## Adding a static theme (`index.ts`)

Add an entry to the `THEMES` array:

```ts
{
  id: 'my-theme',        // unique slug — localStorage key + data attribute
  name: 'My Theme',      // display name in picker
  kind: 'dark',          // 'dark' | 'light'

  bgGradient: { from: '#1a1a2e', to: '#16213e', steps: 15, angle: 180 },
  preview:    { bg: '#1a1a2e', accent: '#e94560', text: '#eaeaea' },

  vars: {
    // ── Text ──────────────────────────────────────────────────────────────
    '--forja-ui-text-primary':       '#eaeaea',   // headings, active labels
    '--forja-ui-text-secondary':     '#b0b0c0',   // body, file names
    '--forja-ui-text-muted':         '#6b6b80',   // descriptions, hints
    '--forja-ui-text-version':       '#40404f',   // version string

    // ── Tagline gradient ("workflow" word) ────────────────────────────────
    '--forja-ui-gradient-from':      '#e94560',
    '--forja-ui-gradient-to':        '#c62a47',

    // ── Buttons / interactive surfaces ───────────────────────────────────
    '--forja-ui-btn-border':         '#2a2a3e',
    '--forja-ui-btn-bg':             'rgba(26,26,46,0.4)',
    '--forja-ui-btn-text':           '#b0b0c0',
    '--forja-ui-btn-hover-border':   'rgba(233,69,96,0.5)',
    '--forja-ui-btn-hover-bg':       'rgba(233,69,96,0.06)',
    '--forja-ui-btn-hover-text':     '#eaeaea',
    '--forja-ui-btn-hover-shadow':   '0 0 20px rgba(233,69,96,0.12)',
    '--forja-ui-btn-icon':           '#6b6b80',
    '--forja-ui-btn-icon-hover':     '#e94560',

    // ── Welcome Screen background ─────────────────────────────────────────
    '--forja-ui-ws-bg':              'transparent',  // transparent = show bgGradient

    // ── Logo (3-layer diamond SVG) ────────────────────────────────────────
    '--forja-ui-logo-outer':         'rgba(233,69,96,0.35)',
    '--forja-ui-logo-mid':           '#1e1e30',   // match bg tone (dark on dark)
    '--forja-ui-logo-core':          '#e94560',
    '--forja-ui-logo-glow':          'rgba(233,69,96,0.25)',

    // ── Theme picker card ─────────────────────────────────────────────────
    '--forja-ui-picker-bg':          'rgba(18,18,30,0.97)',
    '--forja-ui-picker-border':      '#2a2a3e',
    '--forja-ui-picker-text':        '#b0b0c0',
    '--forja-ui-picker-item-hover':  'rgba(255,255,255,0.05)',
    '--forja-ui-picker-active':      'rgba(233,69,96,0.12)',
    '--forja-ui-picker-active-text': '#e94560',   // also used for dirty-dot in editor

    // ── File Explorer ─────────────────────────────────────────────────────
    '--forja-ui-explorer-bg':              '#0f0f1a',
    '--forja-ui-explorer-folder':          '#7a7a8a',  // folder icon color
    '--forja-ui-explorer-scrollbar':       '#1e1e2e',
    '--forja-ui-explorer-scrollbar-hover': '#2e2e3e',
    '--forja-ui-explorer-resize':          'rgba(82,82,91,0.5)',

    // ── Git status colors (vivid — no opacity washes) ─────────────────────
    '--forja-ui-git-modified':       '#fb923c',   // orange
    '--forja-ui-git-added':          '#4ade80',   // green
    '--forja-ui-git-renamed':        '#60a5fa',   // blue
    '--forja-ui-git-deleted':        '#f87171',   // red
    '--forja-ui-git-untracked':      '#71717a',   // gray

    // ── Editor canvas colors ──────────────────────────────────────────────
    // Used by EditorBuffer (canvas), EditorFileInfo, and scrollbar styling.
    '--forja-editor-bg':             '#0f0f1a',   // canvas fill + overlay bg
    '--forja-editor-fg':             '#eaeaea',   // default text + vim-block cursor text
    '--forja-editor-cursor':         '#e94560',   // cursor bar / block fill
    '--forja-editor-active-line':    'rgba(233,69,96,0.07)',  // no opacity wash — use rgba
    '--forja-editor-selection':      'rgba(233,69,96,0.18)',  // visual mode highlight
    '--forja-editor-line-number':    '#3a3a4e',   // inactive line numbers
    '--forja-editor-cursor-blink':   '500',        // ms between blink toggles; '0' = no blink

    // ── Editor overlay (VimCommandLine, EditorFileInfo backdrop) ──────────
    '--forja-ui-editor-overlay-bg':  'rgba(15,15,26,0.85)',
    '--forja-ui-editor-overlay-text':'#b0b0c0',
    '--forja-ui-editor-overlay-sep': 'rgba(255,255,255,0.07)',
  },
},
```

---

## Adding a Lua plugin theme

Create `src-tauri/lua/themes/<name>/main.lua`. The `ui.vars` block must include **all the same tokens** as above. The `colors` block drives the canvas directly (also read via `--forja-editor-*` vars for instant UI reactivity):

```lua
editor.register_theme({
  name = "my-theme",

  colors = {
    bg             = "#0f0f1a",
    fg             = "#eaeaea",
    cursor         = "#e94560",
    selection      = "rgba(233,69,96,0.18)",
    line_number    = "#3a3a4e",
    gutter_bg      = "#0f0f1a",
    border         = "#2a2a3e",
    active_line    = "rgba(233,69,96,0.07)",
    cursor_blink_ms = 500,   -- 0 to disable blink
  },

  syntax = { ... },
  brackets = { ... },

  ui = {
    kind = "dark",
    bg_gradient = { from = "#0f0f1a", to = "#1a1a2e", steps = 15, angle = 135 },
    preview = { bg = "#0f0f1a", accent = "#e94560", text = "#eaeaea" },
    vars = {
      -- paste all --forja-ui-* and --forja-editor-* tokens here
      -- (same values as the colors block above for --forja-editor-*)
    },
  },
})
```

> **Important:** `--forja-editor-*` vars in `ui.vars` must match the `colors` block — they are the synchronous path that makes the editor canvas update instantly when the user switches themes.

---

## Design guidelines

| Token group | Advice |
|---|---|
| `--forja-editor-cursor` | Use the theme's accent color (not fg). Must be readable over `--forja-editor-bg`. |
| `--forja-editor-active-line` | Use `rgba(accent, 0.06–0.09)`. Solid colors make text unreadable. |
| `--forja-editor-selection` | Use `rgba(accent, 0.15–0.20)`. Higher values obscure syntax colors. |
| `--forja-editor-cursor-blink` | `500` ms is standard. Use `0` for a static cursor. |
| `--forja-ui-git-*` | Use **vivid, full-opacity** colors — no `rgba()` washes. These appear as tiny badges and must be legible at small sizes. |
| `logo-mid` | Match the bg tone — **dark** on dark, **light** on light. Avoids a white gap artifact. |
| `logo-glow` | Keep opacity `0.20–0.30`. |
| `btn-hover-shadow` | `rgba(accent, 0.10–0.15)` glow is enough. |
| `bgGradient` | `steps: 12–18` for a smooth stepped look. |

---

## CSS var scope

`--forja-ui-*` and `--forja-editor-*` vars are applied **inline** on each component's root element — they never pollute `:root`. This ensures a component only reacts to the theme it was given.

---

## Themed surfaces

| Surface | Component | Key vars consumed |
|---|---|---|
| Welcome Screen | `WelcomeScreen.svelte` | `--forja-ui-*` |
| Theme Picker | `ThemePicker.svelte` | `--forja-ui-picker-*` |
| Title Bar | `TitleBar.svelte` | `--forja-ui-*` |
| Status Bar | `StatusBar.svelte` | `--forja-ui-*` |
| File Explorer | `Explorer.svelte`, `FileTreeItem.svelte` | `--forja-ui-explorer-*`, `--forja-ui-git-*` |
| Editor canvas (bg, cursor, active line) | `EditorBuffer.svelte` | `--forja-editor-*` |
| Editor file info badge | `EditorFileInfo.svelte` | `--forja-editor-bg`, `--forja-ui-*` |

---

## Built-in themes

| ID | Name | Kind | Source |
|---|---|---|---|
| `misto-dark` | Misto Dark | dark (default) | `src/lib/themes/index.ts` |
| `misto-light` | Misto Light | light | `src/lib/themes/index.ts` |
| `tokyo-night-dark` | Tokyo Night Dark | dark | `src-tauri/lua/themes/tokyo-night-dark/` |
