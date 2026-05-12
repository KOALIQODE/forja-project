import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Must mock Tauri before any store imports
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

import {
  openBuffer,
  closeBuffer,
  openBuffers,
  activeBufferId,
  activeBuffer,
} from '$lib/stores/bufferStore';
import { LANG_MAP } from '$lib/utils/constants';

describe('bufferStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset stores to empty state
    openBuffers.set(new Map());
    activeBufferId.set(null);
  });

  describe('openBuffer', () => {
    it('adds a buffer to openBuffers', () => {
      openBuffer('/project/main.rs');
      expect(get(openBuffers).has('/project/main.rs')).toBe(true);
    });

    it('sets the new buffer as active', () => {
      openBuffer('/project/main.rs');
      expect(get(activeBufferId)).toBe('/project/main.rs');
    });

    it('uses filePath as buffer id', () => {
      openBuffer('/project/index.ts');
      const buf = get(openBuffers).get('/project/index.ts');
      expect(buf?.id).toBe('/project/index.ts');
      expect(buf?.filePath).toBe('/project/index.ts');
    });

    it('sets lastModified', () => {
      openBuffer('/project/app.svelte');
      const buf = get(openBuffers).get('/project/app.svelte');
      expect(buf?.lastModified).toBeDefined();
      expect(buf?.lastModified).toBeGreaterThan(0);
    });

    it('can open multiple buffers', () => {
      openBuffer('/project/a.ts');
      openBuffer('/project/b.ts');
      expect(get(openBuffers).size).toBe(2);
    });

    it('opening same file again just updates it', () => {
      openBuffer('/project/a.ts');
      openBuffer('/project/b.ts');
      openBuffer('/project/a.ts');
      expect(get(openBuffers).size).toBe(2);
      expect(get(activeBufferId)).toBe('/project/a.ts');
    });

    describe('language detection via LANG_MAP', () => {
      const cases: [string, string][] = Object.entries(LANG_MAP).map(([ext, lang]) => [
        `/project/file${ext}`,
        lang,
      ]);

      for (const [filePath, expectedLang] of cases) {
        it(`${filePath} → ${expectedLang}`, () => {
          openBuffer(filePath);
          const buf = get(openBuffers).get(filePath);
          expect(buf?.language).toBe(expectedLang);
        });
      }

      it('unknown extension → unknown', () => {
        openBuffer('/project/file.xyz123');
        const buf = get(openBuffers).get('/project/file.xyz123');
        expect(buf?.language).toBe('unknown');
      });

      it('no extension → unknown', () => {
        openBuffer('/project/Makefile');
        const buf = get(openBuffers).get('/project/Makefile');
        expect(buf?.language).toBe('unknown');
      });
    });
  });

  describe('closeBuffer', () => {
    it('removes the buffer from openBuffers', () => {
      openBuffer('/project/main.ts');
      closeBuffer('/project/main.ts');
      expect(get(openBuffers).has('/project/main.ts')).toBe(false);
    });

    it('sets activeBufferId to null when last buffer is closed', () => {
      openBuffer('/project/main.ts');
      closeBuffer('/project/main.ts');
      expect(get(activeBufferId)).toBeNull();
    });

    it('switches active to the last remaining buffer when active is closed', () => {
      openBuffer('/project/a.ts');
      openBuffer('/project/b.ts');
      closeBuffer('/project/b.ts');
      // a.ts should become active (last key remaining)
      expect(get(activeBufferId)).toBe('/project/a.ts');
    });

    it('does not change activeBufferId when a non-active buffer is closed', () => {
      openBuffer('/project/a.ts');
      openBuffer('/project/b.ts');
      // b.ts is now active; close a.ts
      closeBuffer('/project/a.ts');
      expect(get(activeBufferId)).toBe('/project/b.ts');
    });

    it('closing non-existent buffer is a no-op', () => {
      openBuffer('/project/a.ts');
      closeBuffer('/project/nonexistent.ts');
      expect(get(openBuffers).size).toBe(1);
    });
  });

  describe('activeBuffer derived store', () => {
    it('returns null when no buffer is active', () => {
      expect(get(activeBuffer)).toBeNull();
    });

    it('returns the active buffer object', () => {
      openBuffer('/project/main.rs');
      const buf = get(activeBuffer);
      expect(buf?.filePath).toBe('/project/main.rs');
      expect(buf?.language).toBe('rust');
    });

    it('updates when activeBufferId changes', () => {
      openBuffer('/project/a.ts');
      openBuffer('/project/b.rs');
      activeBufferId.set('/project/a.ts');
      expect(get(activeBuffer)?.language).toBe('typescript');
    });
  });
});
