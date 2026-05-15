editor.register_theme({
  name = "misto-dark",

  colors = {
    bg             = "#0a0a0a",
    fg             = "#f4f4f5",
    cursor         = "#34d399",
    selection      = "rgba(52,211,153,0.18)",
    line_number    = "#3a3a3a",
    gutter_bg      = "#0a0a0a",
    border         = "#27272a",
    active_line    = "rgba(52,211,153,0.07)",
    cursor_blink_ms = 530,
  },

  syntax = {
    keyword       = "#a78bfa",   -- violet  — let, const, if, return, async…
    string        = "#a3e635",   -- lime    — string literals
    function_name = "#38bdf8",   -- sky     — function & method names
    variable      = "#f4f4f5",   -- white   — identifiers
    type          = "#2dd4bf",   -- teal    — TypeScript types, interfaces, generics
    constant      = "#fb923c",   -- orange  — enum values, ALL_CAPS constants
    comment       = "#52525b",   -- gray    — comments
    operator      = "#f472b6",   -- pink    — = + - => && || …
    number        = "#fdba74",   -- peach   — numeric literals
    punctuation   = "#71717a",   -- muted   — ; , { } ( ) [ ]
    attribute     = "#c4b5fd",   -- lavender — HTML attrs, decorators, annotations
    tag           = "#f87171",   -- red     — HTML / Svelte tags
    namespace     = "#34d399",   -- emerald — module paths (brand accent)
  },

  brackets = {
    "#f87171",
    "#fb923c",
    "#a3e635",
    "#34d399",
    "#a78bfa",
    "#2dd4bf",
  },

  -- UI token set for WelcomeScreen, ThemePicker, and other program surfaces.
  -- Contributors: see docs/UI_THEMES.md for the full token reference.
  ui = {
    kind = "dark",
    bg_gradient = { from = "#080808", to = "#242424", steps = 12, angle = 135 },
    preview = { bg = "#0a0a0a", accent = "#4ade80", text = "#f4f4f5" },
    vars = {
      ["--color-text-primary"]      = "#f4f4f5",    -- zinc-100
      ["--color-text-secondary"]    = "#a1a1aa",    -- zinc-300
      ["--color-text-muted"]        = "#71717a",    -- zinc-400
      ["--color-text-faint"]        = "#52525b",    -- zinc-600

      ["--color-accent"]            = "#34d399",    -- emerald-400
      ["--color-accent-alt"]        = "#2dd4bf",    -- teal-400
      ["--color-accent-glow"]       = "rgba(16,185,129,0.1)",   -- emerald-500/10
      ["--color-accent-border"]     = "rgba(16,185,129,0.5)",   -- emerald-500/50
      ["--color-accent-fill"]       = "rgba(52,211,153,0.12)",  -- emerald-400/12
      ["--color-accent-select"]     = "rgba(52,211,153,0.18)",  -- emerald-400/18
      ["--color-accent-line"]       = "rgba(52,211,153,0.07)",  -- emerald-400/07

      ["--color-surface"]           = "rgba(9,9,11,0.3)",       -- zinc-900/30
      ["--color-surface-raised"]    = "rgba(14,14,17,0.97)",    -- zinc-850/97
      ["--color-surface-base"]      = "#0a0a0a",    -- zinc-950
      ["--color-surface-overlay"]   = "rgba(9,9,11,0.85)",      -- zinc-900/85

      ["--color-border"]            = "#27272a",    -- zinc-700

      ["--color-hover-bg"]          = "rgba(16,185,129,0.05)",  -- emerald-500/05
      ["--color-hover-bg-subtle"]   = "rgba(255,255,255,0.05)",
      ["--color-sep"]               = "rgba(255,255,255,0.07)",

      ["--color-scrollbar"]         = "#1e1e1e",
      ["--color-scrollbar-hover"]   = "#2e2e2e",

      ["--color-icon"]              = "#71717a",    -- zinc-400
      ["--color-icon-hover"]        = "#34d399",    -- emerald-400

      ["--color-logo-outer"]        = "rgba(126,207,176,0.55)",
      ["--color-logo-mid"]          = "#1e3a2f",
      ["--color-logo-core"]         = "#1aab6d",
      ["--color-logo-glow"]         = "rgba(26,171,109,0.45)",

      ["--btn-hover-shadow"]        = "0 0 25px rgba(16,185,129,0.1)",
      -- ["--forja-ui-text-primary"]       = "#f4f4f5",
      -- ["--forja-ui-text-secondary"]     = "#a1a1aa",
      -- ["--forja-ui-text-muted"]         = "#71717a",
      -- ["--forja-ui-text-version"]       = "#52525b",
      -- ["--forja-ui-gradient-from"]      = "#34d399",
      -- ["--forja-ui-gradient-to"]        = "#2dd4bf",
      -- ["--forja-ui-btn-border"]         = "#27272a",
      -- ["--forja-ui-btn-bg"]             = "rgba(9,9,11,0.3)",
      -- ["--forja-ui-btn-text"]           = "#a1a1aa",
      -- ["--forja-ui-btn-hover-border"]   = "rgba(16,185,129,0.5)",
      -- ["--forja-ui-btn-hover-bg"]       = "rgba(16,185,129,0.05)",
      -- ["--forja-ui-btn-hover-text"]     = "#f4f4f5",
      -- ["--forja-ui-btn-hover-shadow"]   = "0 0 25px rgba(16,185,129,0.1)",
      -- ["--forja-ui-btn-icon"]           = "#71717a",
      -- ["--forja-ui-btn-icon-hover"]     = "#34d399",
      -- ["--forja-ui-ws-bg"]              = "transparent",
      -- ["--forja-ui-picker-bg"]          = "rgba(14,14,17,0.97)",
      -- ["--forja-ui-picker-border"]      = "#2a2a2e",
      -- ["--forja-ui-picker-text"]        = "#a1a1aa",
      -- ["--forja-ui-picker-item-hover"]  = "rgba(255,255,255,0.05)",
      -- ["--forja-ui-picker-active"]      = "rgba(52,211,153,0.12)",
      -- ["--forja-ui-picker-active-text"] = "#34d399",
      -- ["--forja-ui-logo-outer"]         = "rgba(126,207,176,0.55)",
      -- ["--forja-ui-logo-mid"]           = "#1e3a2f",
      -- ["--forja-ui-logo-core"]          = "#1aab6d",
      -- ["--forja-ui-logo-glow"]          = "rgba(26,171,109,0.45)",
    },
  },
})
