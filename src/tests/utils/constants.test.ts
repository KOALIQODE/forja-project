import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEYS,
  LANG_MAP,
  EDITOR_CONFIG,
  TOKEN_COLORS,
  ANIMATION_DURATIONS,
  FILE_LIMITS,
  VALIDATION,
  COMPONENT_SIZES,
  GIT_STATUS,
  ERROR_MESSAGES,
  KEYBOARD_CONTEXTS,
  DIALOG_STATE_KEYS,
  UI_TEXT,
  CSS_CLASSES,
} from '$lib/utils/constants';

describe('constants', () => {
  describe('STORAGE_KEYS', () => {
    it('has all project keys', () => {
      expect(STORAGE_KEYS.RECENT_PROJECTS).toBe('forja-recent-projects');
      expect(STORAGE_KEYS.CURRENT_PROJECT).toBe('forja-current-project');
    });

    it('has all preferences keys', () => {
      expect(STORAGE_KEYS.PREFERENCES_PROGRAM).toBe('forja-preferences-program');
      expect(STORAGE_KEYS.PREFERENCES_BUFFER).toBe('forja-preferences-buffer');
    });

    it('has UI theme key', () => {
      expect(STORAGE_KEYS.UI_THEME).toBe('forja:ui-theme');
    });

    it('has buffer session keys', () => {
      expect(STORAGE_KEYS.BUFFERS_PREFIX).toBe('forja-buffers-');
      expect(STORAGE_KEYS.ACTIVE_BUFFER_PREFIX).toBe('forja-active-');
    });

    it('has disabled plugins key', () => {
      expect(STORAGE_KEYS.DISABLED_PLUGINS).toBe('forja:disabledPlugins');
    });

    it('all values are unique strings', () => {
      const values = Object.values(STORAGE_KEYS);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  describe('LANG_MAP', () => {
    it('maps common Rust extension', () => {
      expect(LANG_MAP['.rs']).toBe('rust');
    });

    it('maps TypeScript extensions', () => {
      expect(LANG_MAP['.ts']).toBe('typescript');
      expect(LANG_MAP['.tsx']).toBe('tsx');
    });

    it('maps JavaScript variants', () => {
      expect(LANG_MAP['.js']).toBe('javascript');
      expect(LANG_MAP['.mjs']).toBe('javascript');
      expect(LANG_MAP['.cjs']).toBe('javascript');
    });

    it('maps Python extensions', () => {
      expect(LANG_MAP['.py']).toBe('python');
      expect(LANG_MAP['.pyw']).toBe('python');
    });

    it('maps Markdown variants', () => {
      expect(LANG_MAP['.md']).toBe('markdown');
      expect(LANG_MAP['.mdx']).toBe('markdown');
      expect(LANG_MAP['.markdown']).toBe('markdown');
    });

    it('maps YAML variants', () => {
      expect(LANG_MAP['.yaml']).toBe('yaml');
      expect(LANG_MAP['.yml']).toBe('yaml');
    });

    it('maps C/C++ variants', () => {
      expect(LANG_MAP['.c']).toBe('c');
      expect(LANG_MAP['.cpp']).toBe('cpp');
      expect(LANG_MAP['.cc']).toBe('cpp');
      expect(LANG_MAP['.h']).toBe('cpp');
      expect(LANG_MAP['.hpp']).toBe('cpp');
    });

    it('all keys start with a dot', () => {
      for (const key of Object.keys(LANG_MAP)) {
        expect(key.startsWith('.')).toBe(true);
      }
    });

    it('returns undefined for unknown extension', () => {
      expect(LANG_MAP['.xyz']).toBeUndefined();
      expect(LANG_MAP['.unknownext']).toBeUndefined();
    });
  });

  describe('EDITOR_CONFIG', () => {
    it('has expected line height', () => {
      expect(EDITOR_CONFIG.LINE_HEIGHT).toBe(22);
    });

    it('has expected font size', () => {
      expect(EDITOR_CONFIG.FONT_SIZE).toBe(13);
    });

    it('has chunk size', () => {
      expect(EDITOR_CONFIG.CHUNK_SIZE).toBeGreaterThan(0);
    });

    it('has font family string', () => {
      expect(typeof EDITOR_CONFIG.FONT_FAMILY).toBe('string');
      expect(EDITOR_CONFIG.FONT_FAMILY).toContain('monospace');
    });
  });

  describe('TOKEN_COLORS', () => {
    it('has all required token types', () => {
      const required = ['Keyword', 'Function', 'Type', 'String', 'Comment', 'Number', 'Unknown'];
      for (const type of required) {
        expect(TOKEN_COLORS[type]).toBeDefined();
      }
    });

    it('all values are CSS color strings (hex or rgba)', () => {
      for (const [, color] of Object.entries(TOKEN_COLORS)) {
        expect(color).toMatch(/^#[0-9a-fA-F]{3,8}$|^rgba?\(/);
      }
    });
  });

  describe('ANIMATION_DURATIONS', () => {
    it('SHORT is less than NORMAL', () => {
      expect(ANIMATION_DURATIONS.SHORT).toBeLessThan(ANIMATION_DURATIONS.NORMAL);
    });

    it('NORMAL is less than SLOW', () => {
      expect(ANIMATION_DURATIONS.NORMAL).toBeLessThan(ANIMATION_DURATIONS.SLOW);
    });

    it('CONTEXT_RESTORE_DELAY is positive', () => {
      expect(ANIMATION_DURATIONS.CONTEXT_RESTORE_DELAY).toBeGreaterThan(0);
    });
  });

  describe('FILE_LIMITS', () => {
    it('MAX_RECENT_PROJECTS is a positive number', () => {
      expect(FILE_LIMITS.MAX_RECENT_PROJECTS).toBeGreaterThan(0);
    });
  });

  describe('VALIDATION', () => {
    it('PROJECT_PATH_MIN_LENGTH is at least 1', () => {
      expect(VALIDATION.PROJECT_PATH_MIN_LENGTH).toBeGreaterThanOrEqual(1);
    });

    it('PROJECT_NAME_MAX_LENGTH is a reasonable value', () => {
      expect(VALIDATION.PROJECT_NAME_MAX_LENGTH).toBeGreaterThan(10);
    });
  });

  describe('COMPONENT_SIZES', () => {
    it('TITLEBAR_HEIGHT is positive', () => {
      expect(COMPONENT_SIZES.TITLEBAR_HEIGHT).toBeGreaterThan(0);
    });

    it('DIALOG_WIDTH is a positive number', () => {
      expect(COMPONENT_SIZES.DIALOG_WIDTH).toBeGreaterThan(0);
    });
  });

  describe('GIT_STATUS', () => {
    it('has branch, ahead, behind', () => {
      expect(GIT_STATUS.BRANCH).toBeDefined();
      expect(GIT_STATUS.AHEAD).toBeDefined();
      expect(GIT_STATUS.BEHIND).toBeDefined();
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('all values are non-empty strings', () => {
      for (const [, msg] of Object.entries(ERROR_MESSAGES)) {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  });

  describe('UI_TEXT', () => {
    it('APP_TITLE is Forja Studio', () => {
      expect(UI_TEXT.APP_TITLE).toBe('Forja Studio');
    });

    it('all values are strings', () => {
      for (const [, val] of Object.entries(UI_TEXT)) {
        expect(typeof val).toBe('string');
      }
    });
  });
});
