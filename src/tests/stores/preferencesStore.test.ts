import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';

import {
  programPreferences,
  bufferPreferences,
  setProgramPreference,
  setBufferPreference,
  resetProgramPreferences,
  resetBufferPreferences,
  DEFAULT_PROGRAM_PREFERENCES,
  DEFAULT_BUFFER_PREFERENCES,
  PROGRAM_FONT_OPTIONS,
  BUFFER_FONT_OPTIONS,
} from '$lib/stores/preferencesStore';
import { STORAGE_KEYS } from '$lib/utils/constants';

describe('preferencesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProgramPreferences();
    resetBufferPreferences();
  });

  describe('default values', () => {
    it('programPreferences has expected defaults', () => {
      const prefs = get(programPreferences);
      expect(prefs.fontFamily).toBe(DEFAULT_PROGRAM_PREFERENCES.fontFamily);
      expect(prefs.fontSize).toBe(DEFAULT_PROGRAM_PREFERENCES.fontSize);
      expect(prefs.explorerWidth).toBe(DEFAULT_PROGRAM_PREFERENCES.explorerWidth);
      expect(prefs.reduceMotion).toBe(false);
    });

    it('bufferPreferences has expected defaults', () => {
      const prefs = get(bufferPreferences);
      expect(prefs.fontSize).toBe(DEFAULT_BUFFER_PREFERENCES.fontSize);
      expect(prefs.lineHeight).toBe(DEFAULT_BUFFER_PREFERENCES.lineHeight);
      expect(prefs.vimModeEnabled).toBe(false);
      expect(prefs.showLineNumbers).toBe(true);
      expect(prefs.highlightActiveLine).toBe(true);
      expect(prefs.softWrapEnabled).toBe(true);
    });
  });

  describe('PROGRAM_FONT_OPTIONS / BUFFER_FONT_OPTIONS', () => {
    it('PROGRAM_FONT_OPTIONS is non-empty', () => {
      expect(PROGRAM_FONT_OPTIONS.length).toBeGreaterThan(0);
    });

    it('BUFFER_FONT_OPTIONS contains JetBrains Mono', () => {
      const hasJB = BUFFER_FONT_OPTIONS.some((o) => o.label.includes('JetBrains'));
      expect(hasJB).toBe(true);
    });

    it('each option has label and value', () => {
      for (const opt of [...PROGRAM_FONT_OPTIONS, ...BUFFER_FONT_OPTIONS]) {
        expect(opt.label.length).toBeGreaterThan(0);
        expect(opt.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe('setProgramPreference', () => {
    it('updates fontSize', () => {
      setProgramPreference('fontSize', 16);
      expect(get(programPreferences).fontSize).toBe(16);
    });

    it('clamps fontSize below minimum (10)', () => {
      setProgramPreference('fontSize', 1);
      expect(get(programPreferences).fontSize).toBe(10);
    });

    it('clamps fontSize above maximum (18)', () => {
      setProgramPreference('fontSize', 99);
      expect(get(programPreferences).fontSize).toBe(18);
    });

    it('updates explorerWidth', () => {
      setProgramPreference('explorerWidth', 300);
      expect(get(programPreferences).explorerWidth).toBe(300);
    });

    it('clamps explorerWidth to minimum (220)', () => {
      setProgramPreference('explorerWidth', 10);
      expect(get(programPreferences).explorerWidth).toBe(220);
    });

    it('clamps explorerWidth to maximum (420)', () => {
      setProgramPreference('explorerWidth', 9999);
      expect(get(programPreferences).explorerWidth).toBe(420);
    });

    it('updates reduceMotion', () => {
      setProgramPreference('reduceMotion', true);
      expect(get(programPreferences).reduceMotion).toBe(true);
    });

    it('persists to localStorage with correct key', () => {
      setProgramPreference('fontSize', 14);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES_PROGRAM)!);
      expect(stored.fontSize).toBe(14);
    });
  });

  describe('setBufferPreference', () => {
    it('updates fontSize', () => {
      setBufferPreference('fontSize', 18);
      expect(get(bufferPreferences).fontSize).toBe(18);
    });

    it('clamps fontSize below minimum (11)', () => {
      setBufferPreference('fontSize', 5);
      expect(get(bufferPreferences).fontSize).toBe(11);
    });

    it('clamps fontSize above maximum (24)', () => {
      setBufferPreference('fontSize', 100);
      expect(get(bufferPreferences).fontSize).toBe(24);
    });

    it('updates lineHeight', () => {
      setBufferPreference('lineHeight', 28);
      expect(get(bufferPreferences).lineHeight).toBe(28);
    });

    it('clamps lineHeight to minimum (18)', () => {
      setBufferPreference('lineHeight', 5);
      expect(get(bufferPreferences).lineHeight).toBe(18);
    });

    it('clamps lineHeight to maximum (34)', () => {
      setBufferPreference('lineHeight', 99);
      expect(get(bufferPreferences).lineHeight).toBe(34);
    });

    it('updates vimModeEnabled', () => {
      setBufferPreference('vimModeEnabled', true);
      expect(get(bufferPreferences).vimModeEnabled).toBe(true);
    });

    it('updates showLineNumbers', () => {
      setBufferPreference('showLineNumbers', false);
      expect(get(bufferPreferences).showLineNumbers).toBe(false);
    });

    it('updates softWrapEnabled', () => {
      setBufferPreference('softWrapEnabled', false);
      expect(get(bufferPreferences).softWrapEnabled).toBe(false);
    });

    it('persists to localStorage with correct key', () => {
      setBufferPreference('vimModeEnabled', true);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.PREFERENCES_BUFFER)!);
      expect(stored.vimModeEnabled).toBe(true);
    });
  });

  describe('resetProgramPreferences', () => {
    it('restores defaults', () => {
      setProgramPreference('fontSize', 18);
      resetProgramPreferences();
      expect(get(programPreferences).fontSize).toBe(DEFAULT_PROGRAM_PREFERENCES.fontSize);
    });
  });

  describe('resetBufferPreferences', () => {
    it('restores defaults', () => {
      setBufferPreference('fontSize', 24);
      resetBufferPreferences();
      expect(get(bufferPreferences).fontSize).toBe(DEFAULT_BUFFER_PREFERENCES.fontSize);
    });
  });
});
