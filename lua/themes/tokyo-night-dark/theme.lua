editor.register_theme({
  name = "tokyo-night-dark",

  colors = {
    bg          = "#1a1b26",
    fg          = "#c0caf5",
    cursor      = "#c0caf5",
    selection   = "#33467c",
    line_number = "#3b4261",
    gutter_bg   = "#1a1b26",
    border      = "#27283d",
    active_line = "#1e202e",
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

  -- Bracket pair colors indexed by nesting depth (depth 1 → index 1)
  brackets = {
    "#f7768e",  -- depth 1
    "#e0af68",  -- depth 2
    "#9ece6a",  -- depth 3
    "#7aa2f7",  -- depth 4
    "#bb9af7",  -- depth 5
    "#2ac3de",  -- depth 6
  }
})
