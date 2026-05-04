return {
  name    = "bracket-pair-colorizer",
  version = "1.1.0",
  kind    = "plugin",
  -- color_mode: "Consecutive" | "Independent" | "ForceIterationColorCycle"
  -- Edit main.lua → COLOR_MODE to change the active mode.
  permissions = {
    "buffer:read",
    "decorations:write"
  }
}
