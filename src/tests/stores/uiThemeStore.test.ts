import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/utils/pluginClient', () => ({
  pluginGetThemes: vi.fn().mockResolvedValue([]),
}));

import {
  allUIThemes,
  activeUIThemeId,
  activeUITheme,
  setUITheme,
} from '$lib/stores/uiThemeStore';
import { THEMES, DEFAULT_THEME_ID } from '$lib/themes/index';
import { STORAGE_KEYS } from '$lib/utils/constants';

describe('uiThemeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    activeUIThemeId.set(DEFAULT_THEME_ID);
    allUIThemes.set(THEMES);
  });

  describe('initial state', () => {
    it('starts with the static themes', () => {
      const themes = get(allUIThemes);
      expect(themes.length).toBeGreaterThanOrEqual(2);
    });

    it('contains misto-dark', () => {
      const themes = get(allUIThemes);
      expect(themes.some((t) => t.id === 'misto-dark')).toBe(true);
    });

    it('contains misto-light', () => {
      const themes = get(allUIThemes);
      expect(themes.some((t) => t.id === 'misto-light')).toBe(true);
    });

    it('activeUIThemeId defaults to DEFAULT_THEME_ID', () => {
      expect(get(activeUIThemeId)).toBe(DEFAULT_THEME_ID);
    });

    it('activeUITheme resolves to misto-dark by default', () => {
      const theme = get(activeUITheme);
      expect(theme?.id).toBe(DEFAULT_THEME_ID);
    });
  });

  describe('setUITheme', () => {
    it('changes the activeUIThemeId', () => {
      setUITheme('misto-light');
      expect(get(activeUIThemeId)).toBe('misto-light');
    });

    it('persists to localStorage with correct key', () => {
      setUITheme('misto-light');
      expect(localStorage.getItem(STORAGE_KEYS.UI_THEME)).toBe('misto-light');
    });

    it('activeUITheme reflects the change', () => {
      setUITheme('misto-light');
      const theme = get(activeUITheme);
      expect(theme?.id).toBe('misto-light');
    });
  });

  describe('activeUITheme derived store', () => {
    it('falls back to first theme for unknown id', () => {
      activeUIThemeId.set('nonexistent-theme');
      const theme = get(activeUITheme);
      // Should fall back to first theme
      expect(theme).toBe(get(allUIThemes)[0]);
    });

    it('updates when allUIThemes changes', () => {
      const customTheme = {
        id: 'custom',
        name: 'Custom',
        kind: 'dark' as const,
        bgGradient: { from: '#000', to: '#111', steps: 12, angle: 135 },
        preview: { bg: '#000', accent: '#fff', text: '#fff' },
        vars: {},
      };
      activeUIThemeId.set('custom');
      allUIThemes.set([...THEMES, customTheme]);
      expect(get(activeUITheme)?.id).toBe('custom');
    });
  });

  describe('theme structure', () => {
    it('each theme has required properties', () => {
      for (const theme of THEMES) {
        expect(theme.id).toBeTruthy();
        expect(theme.name).toBeTruthy();
        expect(['dark', 'light']).toContain(theme.kind);
        expect(typeof theme.vars).toBe('object');
        expect(theme.bgGradient.from).toBeTruthy();
        expect(theme.bgGradient.to).toBeTruthy();
        expect(theme.preview.bg).toBeTruthy();
        expect(theme.preview.accent).toBeTruthy();
        expect(theme.preview.text).toBeTruthy();
      }
    });

    it('misto-dark has editor CSS vars', () => {
      const theme = THEMES.find((t) => t.id === 'misto-dark')!;
      expect(theme.vars['--forja-editor-bg']).toBeTruthy();
      expect(theme.vars['--forja-editor-fg']).toBeTruthy();
      expect(theme.vars['--forja-editor-cursor']).toBeTruthy();
    });

    it('misto-light has different colors from misto-dark', () => {
      const dark  = THEMES.find((t) => t.id === 'misto-dark')!;
      const light = THEMES.find((t) => t.id === 'misto-light')!;
      expect(dark.vars['--forja-editor-bg']).not.toBe(light.vars['--forja-editor-bg']);
    });
  });
});
