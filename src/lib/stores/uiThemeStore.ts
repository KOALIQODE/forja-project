/**
 * UI Theme Store
 *
 * Manages the active UI theme. Theme definitions come from the Rust/Lua plugin
 * system (via plugin_get_themes). A static fallback list is used until the
 * backend responds so the UI is never blank.
 *
 * To add a theme, create a Lua plugin under src-tauri/lua/themes/ that calls
 * editor.register_theme() with a `ui = { ... }` block. See docs/UI_THEMES.md.
 */

import { writable, derived } from 'svelte/store';
import { THEMES, DEFAULT_THEME_ID, type UITheme } from '$lib/themes/index';
import { pluginGetThemes, type ThemeDefinition } from '$lib/utils/pluginClient';
import { STORAGE_KEYS } from '$lib/utils/constants';

function loadStoredThemeId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;
  return localStorage.getItem(STORAGE_KEYS.UI_THEME) ?? DEFAULT_THEME_ID;
}

/** All available UI themes. Initialized with static fallbacks, updated from backend. */
export const allUIThemes = writable<UITheme[]>(THEMES);

export const activeUIThemeId = writable<string>(loadStoredThemeId());

/** Active theme — derived reactively from both stores. */
export const activeUITheme = derived(
  [activeUIThemeId, allUIThemes],
  ([$id, $themes]) => $themes.find((t) => t.id === $id) ?? $themes[0]
);

export function setUITheme(id: string): void {
  activeUIThemeId.set(id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.UI_THEME, id);
  }
}

export function applyUITheme(theme: UITheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
}

/** Convert a backend ThemeDefinition (with ui block) to a UITheme. */
function toUITheme(def: ThemeDefinition): UITheme | null {
  if (!def.ui) return null;
  return {
    id: def.name,
    name: def.name
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    kind: def.ui.kind as 'dark' | 'light',
    bgGradient: {
      from: def.ui.bg_gradient.from,
      to: def.ui.bg_gradient.to,
      steps: def.ui.bg_gradient.steps,
      angle: def.ui.bg_gradient.angle,
    },
    preview: {
      bg: def.ui.preview.bg,
      accent: def.ui.preview.accent,
      text: def.ui.preview.text,
    },
    vars: def.ui.vars,
  };
}

/**
 * Load UI themes from the Rust backend and update the store.
 * Called by initPlugins() and after any plugin enable/disable.
 *
 * Strategy: always keep static THEMES (misto-dark, misto-light) as the base;
 * merge in any additional backend themes that have a `ui` block (e.g. tokyo-night-dark).
 * Falls back silently — static themes remain if the backend call fails.
 */
export async function loadUIThemesFromBackend(): Promise<void> {
  try {
    const defs = await pluginGetThemes();
    const staticIds = new Set(THEMES.map((t) => t.id));
    const extras = defs
      .map(toUITheme)
      .filter((t): t is UITheme => t !== null && !staticIds.has(t.id));
    allUIThemes.set([...THEMES, ...extras]);
  } catch (e) {
    console.warn('[uiThemeStore] failed to load themes from backend, using fallback:', e);
  }
}

// NOTE: applyUITheme is intentionally NOT called globally here.
// Theme CSS vars are scoped per-component (e.g. WelcomeScreen) via inline styles.
