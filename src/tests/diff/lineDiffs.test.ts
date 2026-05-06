import { describe, it, expect } from 'vitest';
import { myersDiff, computeLineDiffs, lineCacheToArray } from '$lib/utils/diff/lineDiffs';

describe('myersDiff', () => {
  it('returns empty for two empty arrays', () => {
    const ops = myersDiff([], []);
    expect(ops).toHaveLength(0);
  });

  it('returns a single insert for empty old + non-empty new', () => {
    const ops = myersDiff([], ['a', 'b']);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('insert');
    expect(ops[0].newEnd).toBe(2);
  });

  it('returns a single delete for non-empty old + empty new', () => {
    const ops = myersDiff(['a', 'b'], []);
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('delete');
    expect(ops[0].oldEnd).toBe(2);
  });

  it('returns equal op for identical arrays', () => {
    const ops = myersDiff(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(ops.every((op) => op.type === 'equal')).toBe(true);
    const joined = ops.map((op) => `${op.oldStart}-${op.oldEnd}`).join(',');
    expect(joined).toBe('0-3');
  });

  it('detects a single line insertion', () => {
    const old = ['line1', 'line3'];
    const new_ = ['line1', 'line2', 'line3'];
    const ops  = myersDiff(old, new_);
    const inserts = ops.filter((op) => op.type === 'insert');
    expect(inserts.length).toBeGreaterThan(0);
    const totalInserted = inserts.reduce((s, op) => s + (op.newEnd - op.newStart), 0);
    expect(totalInserted).toBe(1);
  });

  it('detects a single line deletion', () => {
    const old  = ['line1', 'line2', 'line3'];
    const new_ = ['line1', 'line3'];
    const ops  = myersDiff(old, new_);
    const deletes = ops.filter((op) => op.type === 'delete');
    expect(deletes.length).toBeGreaterThan(0);
    const totalDeleted = deletes.reduce((s, op) => s + (op.oldEnd - op.oldStart), 0);
    expect(totalDeleted).toBe(1);
  });

  it('handles identical first and last with middle change', () => {
    const old  = ['a', 'b', 'c'];
    const new_ = ['a', 'X', 'c'];
    const ops  = myersDiff(old, new_);
    // Should include equal ops for 'a' and 'c'
    const equals = ops.filter((op) => op.type === 'equal');
    expect(equals.length).toBeGreaterThan(0);
  });
});

describe('computeLineDiffs', () => {
  it('empty baseline and current → empty result', () => {
    const result = computeLineDiffs([], []);
    expect(result.diffMap.size).toBe(0);
    expect(result.deletedBlocks).toHaveLength(0);
  });

  it('identical content → no changes', () => {
    const lines = ['a', 'b', 'c'];
    const result = computeLineDiffs(lines, [...lines]);
    expect(result.diffMap.size).toBe(0);
    expect(result.deletedBlocks).toHaveLength(0);
  });

  it('all new lines added → all marked added', () => {
    const result = computeLineDiffs([], ['x', 'y', 'z']);
    expect(result.diffMap.size).toBe(3);
    for (const status of result.diffMap.values()) {
      expect(status).toBe('added');
    }
  });

  it('all lines deleted → deletedBlock at top', () => {
    const result = computeLineDiffs(['a', 'b'], []);
    expect(result.diffMap.size).toBe(0);
    expect(result.deletedBlocks.length).toBeGreaterThan(0);
    expect(result.deletedBlocks[0].afterLine).toBe(-1);
  });

  it('line appended at bottom → marked added', () => {
    const baseline = ['line1', 'line2'];
    const current  = ['line1', 'line2', 'line3'];
    const result   = computeLineDiffs(baseline, current);
    expect(result.diffMap.get(2)).toBe('added');
  });

  it('changed line → marked as added or modified', () => {
    const baseline = ['aaa'];
    const current  = ['bbb'];
    const result   = computeLineDiffs(baseline, current);
    // A 1→1 line replace may be annotated as 'added' + deleted block
    // or 'modified' depending on op ordering. Either is a valid diff annotation.
    const lineStatus = result.diffMap.get(0);
    const hasDeletedBlock = result.deletedBlocks.length > 0;
    expect(lineStatus === 'added' || lineStatus === 'modified' || hasDeletedBlock).toBe(true);
  });

  it('deletedBlocks contain old content', () => {
    const baseline = ['kept', 'removed_line', 'also_kept'];
    const current  = ['kept', 'also_kept'];
    const result   = computeLineDiffs(baseline, current);
    expect(result.deletedBlocks.some((b) => b.oldContent.includes('removed_line'))).toBe(true);
  });
});

describe('lineCacheToArray', () => {
  it('returns empty array for zero totalLines', () => {
    const arr = lineCacheToArray(new Map(), 0);
    expect(arr).toHaveLength(0);
  });

  it('fills missing lines with empty string', () => {
    const cache = new Map([[0, 'hello']]);
    const arr   = lineCacheToArray(cache, 3);
    expect(arr[0]).toBe('hello');
    expect(arr[1]).toBe('');
    expect(arr[2]).toBe('');
  });

  it('maps all provided lines correctly', () => {
    const cache = new Map([[0, 'a'], [1, 'b'], [2, 'c']]);
    const arr   = lineCacheToArray(cache, 3);
    expect(arr).toEqual(['a', 'b', 'c']);
  });
});
