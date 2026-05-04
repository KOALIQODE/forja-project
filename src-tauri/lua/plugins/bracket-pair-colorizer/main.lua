-- Bracket Pair Colorizer
-- Assigns colors to matching bracket pairs based on nesting depth.
-- The Rust engine maps the returned `depth` value to a palette color via:
--   color = palette[(depth - 1) % #palette + 1]   (1-based, cycling)
--
-- COLOR_MODE options
-- ─────────────────
-- "Consecutive"          (default)
--   Single shared depth counter across all bracket types ( ) [ ] { }.
--   Depth 1 → Color A, Depth 2 → Color B, Depth 3 → Color C, Depth 4 → Color A …
--   Example:  { [ ( ) ] }   →  { depth 1, [ depth 2, ( depth 3
--
-- "Independent"
--   Each bracket type maintains its own nesting counter.
--   ( ) at depth 1 is always Color A, regardless of surrounding { } or [ ].
--   Example:  { [ ( ) ] }   →  { depth 1, [ depth 1, ( depth 1
--
-- "ForceIterationColorCycle"
--   Color is assigned by the sequential occurrence order of bracket PAIRS,
--   not by depth. Sibling pairs at the same nesting level get different colors.
--   Example:  () ()   →  first pair Color A, second pair Color B
--             (())    →  outer pair Color A, inner pair Color B

local COLOR_MODE = "Consecutive"

local OPEN_CHARS  = { ["("] = ")", ["["] = "]", ["{"] = "}" }
local CLOSE_CHARS = { [")"] = "(", ["]"] = "[", ["}"] = "{" }

-- ── Mode: Consecutive ─────────────────────────────────────────────────────────
-- Single stack for all bracket types; depth = nesting level.
local function analyze_consecutive(text)
  local result = {}
  local stack  = {}

  for i = 1, #text do
    local ch = text:sub(i, i)
    if OPEN_CHARS[ch] then
      table.insert(stack, { char = ch, pos = i })
    elseif CLOSE_CHARS[ch] then
      local top = stack[#stack]
      if top and OPEN_CHARS[top.char] == ch then
        table.remove(stack)
        table.insert(result, {
          start  = top.pos,
          finish = i,
          depth  = #stack + 1,   -- nesting level of this pair (1 = outermost)
        })
      end
    end
  end

  return result
end

-- ── Mode: Independent ─────────────────────────────────────────────────────────
-- Separate stack per bracket type; depth = nesting level within that type.
local function analyze_independent(text)
  local result = {}
  local stacks = { ["("] = {}, ["["] = {}, ["{"] = {} }

  for i = 1, #text do
    local ch = text:sub(i, i)
    if OPEN_CHARS[ch] then
      table.insert(stacks[ch], { pos = i })
    elseif CLOSE_CHARS[ch] then
      local open_ch = CLOSE_CHARS[ch]     -- ")" → "(", "]" → "[", "}" → "{"
      local stack   = stacks[open_ch]
      local top     = stack[#stack]
      if top then
        table.remove(stack)
        table.insert(result, {
          start  = top.pos,
          finish = i,
          depth  = #stack + 1,   -- depth within this bracket type's own counter
        })
      end
    end
  end

  return result
end

-- ── Mode: ForceIterationColorCycle ────────────────────────────────────────────
-- Uses a global pair-occurrence counter instead of nesting depth.
-- Sibling pairs at the same depth get distinct colors; depth is ignored.
local function analyze_force_cycle(text)
  local result  = {}
  local stack   = {}
  local counter = 0   -- increments for every successfully closed pair

  for i = 1, #text do
    local ch = text:sub(i, i)
    if OPEN_CHARS[ch] then
      table.insert(stack, { char = ch, pos = i })
    elseif CLOSE_CHARS[ch] then
      local top = stack[#stack]
      if top and OPEN_CHARS[top.char] == ch then
        table.remove(stack)
        counter = counter + 1
        table.insert(result, {
          start  = top.pos,
          finish = i,
          depth  = counter,   -- sequential index → cycles through palette
        })
      end
    end
  end

  return result
end

-- ── Provider registration ─────────────────────────────────────────────────────

editor.register_bracket_provider(function(ctx)
  local text = ctx.text

  if COLOR_MODE == "Independent" then
    return analyze_independent(text)
  elseif COLOR_MODE == "ForceIterationColorCycle" then
    return analyze_force_cycle(text)
  else
    return analyze_consecutive(text)   -- default: "Consecutive"
  end
end)
