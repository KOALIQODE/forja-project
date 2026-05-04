/**
 * UI Theme Store
 *
 * Manages the active UI theme, persists the selection to localStorage,
 * and applies CSS custom properties to :root whenever the theme changes.
 */

import { writable, derived } from 'svelte/store';
import { THEMES, DEFAULT_THEME_ID, getThemeById, type UITheme } from '$lib/themes/index';

const STORAGE_KEY = 'forja:ui-theme';

function loadStoredThemeId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_THEME_ID;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
}

export const activeUIThemeId = writable<string>(loadStoredThemeId());

export const activeUITheme = derived(activeUIThemeId, ($id) => getThemeById($id));

export const allUIThemes = THEMES;

export function setUITheme(id: string): void {
  activeUIThemeId.set(id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, id);
  }
}

export function applyUITheme(theme: UITheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
}

// NOTE: applyUITheme is intentionally NOT called globally here.
// Theme CSS vars are scoped per-component (e.g. WelcomeScreen) via inline styles.
