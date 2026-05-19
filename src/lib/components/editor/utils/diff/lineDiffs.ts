/**
 * diff/lineDiffs.ts — Myers O(N·D) line diff + result builder.
 *
 * ## Algorithm
 * Classic Myers diff (1986) operating on string arrays.
 * Time:  O((N+M)·D)  where D = edit distance
 * Space: O((N+M)·D)  for backtracking snapshots
 *
 * For typical editor usage (small incremental edits) D stays tiny, making
 * this effectively O(N+M) per recompute.
 *
 * ## Output
 * Raw DiffOp[] is post-processed into:
 *   - DiffMap:        Map<newLine, 'added' | 'modified'>
 *   - DeletedBlock[]: contiguous deleted ranges with their content
 */

import type { DiffOp, DiffMap, DeletedBlock, LineDiffResult } from './types';

// ── Myers core ────────────────────────────────────────────────────────────────

/**
 * Computes the shortest edit script between `a` (old) and `b` (new).
 * Returns a sequence of non-overlapping DiffOp covering [0,a.length) × [0,b.length).
 */
export function myersDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
	const N = a.length;
	const M = b.length;

	if (N === 0 && M === 0) return [];
	if (N === 0) return [{ type: 'insert', oldStart: 0, oldEnd: 0, newStart: 0, newEnd: M }];
	if (M === 0) return [{ type: 'delete', oldStart: 0, oldEnd: N, newStart: 0, newEnd: 0 }];

	const MAX    = N + M;
	const OFFSET = MAX; // shift k index so negatives are valid
	// v[k + OFFSET] = furthest x reachable on diagonal k
	const v = new Int32Array(2 * MAX + 2);
	// Sentinel: diagonal k=1, x=0 — lets k=0 use the insert branch on d=0
	v[1 + OFFSET] = 0;

	// trace[d] = snapshot of v saved at the START of iteration d
	// (i.e. the state produced by processing d−1 steps)
	const trace: Int32Array[] = [];
	let endD = -1;

	outer: for (let d = 0; d <= MAX; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			const ki = k + OFFSET;
			let x: number;
			// Choose: insert (from diagonal k+1, x stays) or delete (from diagonal k-1, x+1)
			if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
				x = v[ki + 1]; // insert: move down
			} else {
				x = v[ki - 1] + 1; // delete: move right
			}
			let y = x - k;
			// Extend snake along equal lines
			while (x < N && y < M && a[x] === b[y]) { x++; y++; }
			v[ki] = x;
			if (x >= N && y >= M) { endD = d; break outer; }
		}
	}

	// ── Backtrack to reconstruct the edit script ──────────────────────────────

	const ops: DiffOp[] = [];
	let x = N;
	let y = M;

	for (let d = endD; d > 0; d--) {
		const vPrev = trace[d]; // state at START of step d  (= end of step d−1)
		const k  = x - y;
		const ki = k + OFFSET;

		// Was the move an insert (from k+1) or delete (from k−1)?
		let prevK: number;
		if (k === -d || (k !== d && vPrev[ki - 1] < vPrev[ki + 1])) {
			prevK = k + 1; // insert
		} else {
			prevK = k - 1; // delete
		}

		const prevX = vPrev[prevK + OFFSET];
		const prevY = prevX - prevK;

		if (prevK === k + 1) {
			// Insert: y advanced by 1, x stayed
			const midX = prevX;
			const midY = prevY + 1;
			if (x > midX) {
				ops.unshift({ type: 'equal', oldStart: midX, oldEnd: x, newStart: midY, newEnd: y });
			}
			ops.unshift({ type: 'insert', oldStart: prevX, oldEnd: prevX, newStart: prevY, newEnd: midY });
		} else {
			// Delete: x advanced by 1, y stayed
			const midX = prevX + 1;
			const midY = prevY;
			if (y > midY) {
				ops.unshift({ type: 'equal', oldStart: midX, oldEnd: x, newStart: midY, newEnd: y });
			}
			ops.unshift({ type: 'delete', oldStart: prevX, oldEnd: midX, newStart: prevY, newEnd: prevY });
		}

		x = prevX;
		y = prevY;
	}

	// Remaining prefix (common head when d=0 extended a snake)
	if (x > 0 || y > 0) {
		ops.unshift({ type: 'equal', oldStart: 0, oldEnd: x, newStart: 0, newEnd: y });
	}

	return ops;
}

// ── Post-processing: ops → DiffMap + DeletedBlocks ───────────────────────────

/**
 * Merges adjacent delete+insert operations into 'modified' annotations.
 * A "replace" in Myers is represented as a delete immediately followed by
 * an insert on the same position — we collapse these into 'modified' lines.
 */
export function computeLineDiffs(
	baselineLines: string[],
	currentLines:  string[]
): LineDiffResult {
	const ops = myersDiff(baselineLines, currentLines);
	return opsToResult(ops, baselineLines, currentLines);
}

function opsToResult(
	ops:           DiffOp[],
	baselineLines: string[],
	currentLines:  string[]
): LineDiffResult {
	const diffMap: DiffMap       = new Map();
	const deletedBlocks: DeletedBlock[] = [];

	// Track the last new-file line we've "passed" so we know where to anchor deletions
	let lastNewLine = -1; // one before the first visible line

	let i = 0;
	while (i < ops.length) {
		const op = ops[i];

		if (op.type === 'equal') {
			lastNewLine = op.newEnd - 1;
			i++;
			continue;
		}

		if (op.type === 'insert') {
			// Check if the NEXT op is a delete (replace = modified)
			const next = ops[i + 1];
			if (next && next.type === 'delete' && next.oldStart === op.oldStart) {
				// Replace: mark as modified
				for (let l = op.newStart; l < op.newEnd; l++) diffMap.set(l, 'modified');
				// Excess deletions (if old had more lines than new)
				if (next.oldEnd - next.oldStart > op.newEnd - op.newStart) {
					deletedBlocks.push({
						afterLine:  op.newEnd - 1,
						oldStart:   next.oldStart + (op.newEnd - op.newStart),
						oldEnd:     next.oldEnd,
						oldContent: baselineLines.slice(next.oldStart + (op.newEnd - op.newStart), next.oldEnd),
					});
				}
				lastNewLine = op.newEnd - 1;
				i += 2; // consume insert + delete
				continue;
			}

			// Pure insert
			for (let l = op.newStart; l < op.newEnd; l++) diffMap.set(l, 'added');
			lastNewLine = op.newEnd - 1;
			i++;
			continue;
		}

		if (op.type === 'delete') {
			// Check if PREVIOUS op was an insert that already consumed this (shouldn't happen
			// since Myers outputs delete before insert in some implementations — handle both orderings)
			const prev = ops[i - 1];
			if (prev && prev.type === 'insert' && prev.newStart === op.newStart) {
				// Already handled above in the insert branch (alternate ordering)
				i++;
				continue;
			}

			// Pure deletion
			deletedBlocks.push({
				afterLine:  lastNewLine,
				oldStart:   op.oldStart,
				oldEnd:     op.oldEnd,
				oldContent: baselineLines.slice(op.oldStart, op.oldEnd),
			});
			i++;
			continue;
		}

		i++;
	}

	return { diffMap, deletedBlocks };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts a lineCache Map<number, string> to a dense string[] for diffing. */
export function lineCacheToArray(
	lineCache:  Map<number, string>,
	totalLines: number
): string[] {
	const arr: string[] = new Array(totalLines);
	for (let i = 0; i < totalLines; i++) {
		arr[i] = lineCache.get(i) ?? '';
	}
	return arr;
}
