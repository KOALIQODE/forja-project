import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { BaselineMapManager } from '$lib/utils/diff/BaselineMapManager';

describe('BaselineMapManager', () => {
  let manager: BaselineMapManager;

  beforeEach(() => {
    manager = new BaselineMapManager();
  });

  it('starts empty and not ready', () => {
    expect(manager.isReady).toBe(false);
    expect(manager.totalLines).toBe(0);
    expect(manager.filePath).toBe('');
    expect(manager.getLines()).toEqual([]);
  });

  it('setFromContent splits LF and CRLF content and stores filePath', () => {
    manager.setFromContent('first\r\nsecond\nthird', '/project/file.ts');

    expect(manager.getLines()).toEqual(['first', 'second', 'third']);
    expect(manager.totalLines).toBe(3);
    expect(manager.filePath).toBe('/project/file.ts');
    expect(manager.isReady).toBe(true);
  });

  it('setFromLines uses a defensive copy', () => {
    const lines = ['alpha', 'beta'];

    manager.setFromLines(lines, '/project/from-lines.ts');
    lines[0] = 'changed';

    expect(manager.getLines()).toEqual(['alpha', 'beta']);
    expect(manager.totalLines).toBe(2);
    expect(manager.filePath).toBe('/project/from-lines.ts');
  });

  it('setFromLineCache builds a dense array from the cache', () => {
    manager.setFromLineCache(
      new Map([
        [0, 'zero'],
        [2, 'two'],
      ]),
      4,
      '/project/cache.ts',
    );

    expect(manager.getLines()).toEqual(['zero', '', 'two', '']);
    expect(manager.totalLines).toBe(4);
    expect(manager.filePath).toBe('/project/cache.ts');
  });

  it('getLine returns an empty string for out-of-range indexes', () => {
    manager.setFromLines(['only'], '/project/one-line.ts');

    expect(manager.getLine(0)).toBe('only');
    expect(manager.getLine(10)).toBe('');
    expect(manager.getLine(-1)).toBe('');
  });

  it('clear resets all baseline state', () => {
    manager.setFromContent('a\nb', '/project/file.ts');

    manager.clear();

    expect(manager.getLines()).toEqual([]);
    expect(manager.totalLines).toBe(0);
    expect(manager.filePath).toBe('');
    expect(manager.isReady).toBe(false);
  });
});
