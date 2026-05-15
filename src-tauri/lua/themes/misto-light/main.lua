editor.register_theme({
  name = "misto-light",

  colors = {
    bg              = "#ffffff",
    fg              = "#111111",
    cursor          = "#16a34a",
    selection       = "rgba(22,163,74,0.18)",
    line_number     = "#aaaaaa",
    gutter_bg       = "#f5f5f5",
    border          = "#d4d4d4",
    active_line     = "rgba(22,163,74,0.07)",
    cursor_blink_ms = 600,
  },

  syntax = {
    keyword       = "#16a34a",
    string        = "#15803d",
    function_name = "#0d9488",
    variable      = "#111111",
    type          = "#16a34a",
    constant      = "#ea580c",
    comment       = "#8a8a8a",
    operator      = "#475569",
    number        = "#ea580c",
    punctuation   = "#475569",
    attribute     = "#7c3aed",
    tag           = "#dc2626",
    namespace     = "#0d9488",
  },

  brackets = {
    "#dc2626",
    "#ea580c",
    "#16a34a",
    "#0d9488",
    "#7c3aed",
    "#2563eb",
  },

  -- UI token set for WelcomeScreen, ThemePicker, and other program surfaces.
  -- Contributors: see docs/UI_THEMES.md for the full token reference.
  ui = {
    kind = "light",
    bg_gradient = { from = "#ffffff", to = "#bdd0c8", steps = 12, angle = 135 };
    preview = { bg = "#f5f5f5", accent = "#16a34a", text = "#111111" },
    vars = {
      ["--color-text-primary"]    = "#111111",
      ["--color-text-secondary"]  = "#3a3a3a",
      ["--color-text-muted"]      = "#5c5c5c",
      ["--color-text-faint"]      = "#8a8a8a",

      ["--color-accent"]          = "#16a34a",
      ["--color-accent-alt"]      = "#0d9488",
      ["--color-accent-glow"]     = "rgba(22,163,74,0.12)",
      ["--color-accent-border"]   = "rgba(22,163,74,0.5)",
      ["--color-accent-fill"]     = "rgba(22,163,74,0.10)",
      ["--color-accent-select"]   = "rgba(22,163,74,0.18)",
      ["--color-accent-line"]     = "rgba(22,163,74,0.07)",

      ["--color-surface"]         = "rgba(255,255,255,0.6)",
      ["--color-surface-raised"]  = "rgba(250,250,250,0.97)",
      ["--color-surface-base"]    = "#f5f5f5",
      ["--color-surface-overlay"] = "rgba(245,245,245,0.97)",

      ["--color-border"]          = "#d4d4d4",

      ["--color-hover-bg"]        = "rgba(22,163,74,0.05)",
      ["--color-hover-bg-subtle"] = "rgba(0,0,0,0.05)",
      ["--color-sep"]             = "rgba(0,0,0,0.07)",

      ["--color-scrollbar"]       = "#e0e0e0",
      ["--color-scrollbar-hover"] = "#cccccc",

      ["--color-icon"]            = "#8a8a8a",
      ["--color-icon-hover"]      = "#16a34a",

      ["--color-logo-outer"]      = "rgba(134,239,172,0.5)",
      ["--color-logo-mid"]        = "#f0fdf4",
      ["--color-logo-core"]       = "#16a34a",
      ["--color-logo-glow"]       = "rgba(22,163,74,0.35)",

      ["--btn-hover-shadow"]      = "0 0 25px rgba(22,163,74,0.12)",
      -- ["--forja-ui-text-primary"]       = "#111111",
      -- ["--forja-ui-text-secondary"]     = "#3a3a3a",
      -- ["--forja-ui-text-muted"]         = "#5c5c5c",
      -- ["--forja-ui-text-version"]       = "#8a8a8a",
      -- ["--forja-ui-gradient-from"]      = "#16a34a",
      -- ["--forja-ui-gradient-to"]        = "#0d9488",
      -- ["--forja-ui-btn-border"]         = "#d4d4d4",
      -- ["--forja-ui-btn-bg"]             = "rgba(255,255,255,0.6)",
      -- ["--forja-ui-btn-text"]           = "#3a3a3a",
      -- ["--forja-ui-btn-hover-border"]   = "rgba(22,163,74,0.5)",
      -- ["--forja-ui-btn-hover-bg"]       = "rgba(22,163,74,0.05)",
      -- ["--forja-ui-btn-hover-text"]     = "#111111",
      -- ["--forja-ui-btn-hover-shadow"]   = "0 0 25px rgba(22,163,74,0.12)",
      -- ["--forja-ui-btn-icon"]           = "#8a8a8a",
      -- ["--forja-ui-btn-icon-hover"]     = "#16a34a",
      -- ["--forja-ui-ws-bg"]              = "rgba(245,245,245,0.97)",
      -- ["--forja-ui-picker-bg"]          = "rgba(250,250,250,0.97)",
      -- ["--forja-ui-picker-border"]      = "#d4d4d4",
      -- ["--forja-ui-picker-text"]        = "#3a3a3a",
      -- ["--forja-ui-picker-item-hover"]  = "rgba(0,0,0,0.05)",
      -- ["--forja-ui-picker-active"]      = "rgba(22,163,74,0.10)",
      -- ["--forja-ui-picker-active-text"] = "#16a34a",
      -- ["--forja-ui-logo-outer"]         = "rgba(134,239,172,0.5)",
      -- ["--forja-ui-logo-mid"]           = "#f0fdf4",
      -- ["--forja-ui-logo-core"]          = "#16a34a",
      -- ["--forja-ui-logo-glow"]          = "rgba(22,163,74,0.35)",
    },
  },
})
