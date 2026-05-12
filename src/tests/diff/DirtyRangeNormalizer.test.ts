import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }));

import { DirtyRangeNormalizer } from '$lib/utils/diff/DirtyRangeNormalizer';

describe('DirtyRangeNormalizer', () => {
  let normalizer: DirtyRangeNormalizer;

  beforeEach(() => {
    normalizer = new DirtyRangeNormalizer();
  });

  it('starts clean', () => {
    expect(normalizer.isDirty).toBe(false);
    expect(normalizer.getNormalizedRanges()).toEqual([]);
  });

  it('markDirty records dirty ranges and sets isDirty to true', () => {
    normalizer.markDirty(2, 4);

    expect(normalizer.isDirty).toBe(true);
    expect(normalizer.getNormalizedRanges()).toEqual([[2, 4]]);
  });

  it('getNormalizedRanges returns sorted merged ranges', () => {
    normalizer.markDirty(5, 5);
    normalizer.markDirty(1, 2);
    normalizer.markDirty(2, 4);
    normalizer.markDirty(10, 11);

    expect(normalizer.getNormalizedRanges()).toEqual([
      [1, 5],
      [10, 11],
    ]);
  });

  it('getNormalizedRanges does not clear dirty state on its own', () => {
    normalizer.markDirty(0, 0);

    normalizer.getNormalizedRanges();

    expect(normalizer.isDirty).toBe(true);
  });

  it('notifyInsert shifts ranges at or after the insertion point and marks inserted lines dirty', () => {
    normalizer.markDirty(5, 6);

    normalizer.notifyInsert(4, 2);

    expect(normalizer.getNormalizedRanges()).toEqual([
      [4, 5],
      [7, 8],
    ]);
  });

  it('notifyDelete clamps overlapping ranges and shifts later ranges upward', () => {
    normalizer.markDirty(2, 4);
    normalizer.markDirty(8, 9);

    normalizer.notifyDelete(3, 3);

    expect(normalizer.getNormalizedRanges()).toEqual([
      [2, 3],
      [5, 6],
    ]);
  });

  it('clear resets dirty state and removes all ranges', () => {
    normalizer.markDirty(1, 3);

    normalizer.clear();

    expect(normalizer.isDirty).toBe(false);
    expect(normalizer.getNormalizedRanges()).toEqual([]);
    expect(normalizer.getBoundingRange()).toBeNull();
  });
});
