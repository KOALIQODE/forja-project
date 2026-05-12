import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { ViewportDiffCache } from '$lib/utils/diff/ViewportDiffCache';
import { DIFF_COLORS, type LineDiffResult } from '$lib/utils/diff/types';

function createResult(): LineDiffResult {
  return {
    diffMap: new Map([
      [1, 'added'],
      [3, 'modified'],
      [8, 'added'],
    ]),
    deletedBlocks: [
      {
        afterLine: 4,
        oldStart: 2,
        oldEnd: 4,
        oldContent: ['gone 1', 'gone 2'],
      },
    ],
  };
}

describe('ViewportDiffCache', () => {
  let cache: ViewportDiffCache;

  beforeEach(() => {
    cache = new ViewportDiffCache();
  });

  it('update caches decorations for visible changed lines', () => {
    cache.update(createResult(), 0, 5);

    expect(cache.getDecoration(1)).toEqual({
      line: 1,
      status: 'added',
      color: DIFF_COLORS.added,
    });
    expect(cache.getDecoration(3)).toEqual({
      line: 3,
      status: 'modified',
      color: DIFF_COLORS.modified,
    });
  });

  it('getDecoration returns null for unchanged or out-of-viewport lines', () => {
    cache.update(createResult(), 0, 5);

    expect(cache.getDecoration(2)).toBeNull();
    expect(cache.getDecoration(8)).toBeNull();
  });

  it('hasDecorations becomes true after an update with visible changes', () => {
    cache.update(createResult(), 0, 5);

    expect(cache.hasDecorations).toBe(true);
  });

  it('scroll rebuilds decorations from the last diff result for a new viewport', () => {
    cache.update(createResult(), 0, 5);

    cache.scroll(7, 9);

    expect(cache.getDecoration(1)).toBeNull();
    expect(cache.getDecoration(8)).toEqual({
      line: 8,
      status: 'added',
      color: DIFF_COLORS.added,
    });
  });

  it('getDeletedMarkersInViewport returns deleted markers whose anchor is visible', () => {
    cache.update(createResult(), 3, 5);

    expect(cache.getDeletedMarkersInViewport()).toEqual([{ afterLine: 4, count: 2 }]);
  });

  it('clear removes cached decorations and deleted markers', () => {
    cache.update(createResult(), 0, 5);

    cache.clear();

    expect(cache.getDecoration(1)).toBeNull();
    expect(cache.getDeletedMarkersInViewport()).toEqual([]);
    expect(cache.hasDecorations).toBe(false);
  });
});
