-- Bracket Pair Colorizer
-- Analyzes matching brackets/parens/braces and returns nesting depth ranges.
-- The core Rust engine applies colors from the active theme's `brackets` palette.
-- This plugin never touches the UI — it only returns data.

local OPEN_CHARS  = { ["("] = ")", ["["] = "]", ["{"] = "}" }
local CLOSE_CHARS = { [")"] = true, ["]"] = true, ["}"] = true }

editor.register_bracket_provider(function(ctx)
  local text   = ctx.text
  local result = {}
  local stack  = {}

  for i = 1, #text do
    local ch = text:sub(i, i)

    if OPEN_CHARS[ch] then
      -- Push open bracket onto the stack with its position
      table.insert(stack, { char = ch, pos = i })

    elseif CLOSE_CHARS[ch] then
      -- Only pop if the last open bracket matches
      local top = stack[#stack]
      if top and OPEN_CHARS[top.char] == ch then
        table.remove(stack)
        local depth = #stack + 1   -- depth after closing the pair
        table.insert(result, {
          start  = top.pos,
          finish = i,
          depth  = depth
        })
      end
      -- Unmatched close bracket: silently ignore (safe)
    end
  end

  -- Unmatched open brackets left in stack are silently dropped
  return result
end)
