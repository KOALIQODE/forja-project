/**
 * diff/DirtyRangeNormalizer.ts
 *
 * Accumulates line ranges that have been touched by text edits since the last
 * diff computation, then merges overlapping / adjacent ranges so the scheduler
 * can make a cheap "is anything dirty?" check before firing a full diff.
 *
 * Line numbers here are NEW-file coordinates (current editor content).
 *
 * All methods are O(n log n) at most, where n is the number of pending ranges
 * (typically very small — a few edits between repaints).
 */

import type { DirtyRange } from './types';

export class DirtyRangeNormalizer {
	private ranges: DirtyRange[] = [];
	private _isDirty = false;

	// ── Recording edits ───────────────────────────────────────────────────────

	/**
	 * Records that lines [startLine, endLine] (both inclusive, 0-indexed) have
	 * been modified.  Call this once per text-edit event.
	 *
	 * @param startLine  First dirty line (0-indexed, inclusive).
	 * @param endLine    Last dirty line (0-indexed, inclusive).
	 *                   Pass `startLine` for a single-line edit.
	 */
	markDirty(startLine: number, endLine: number): void {
		const start = Math.max(0, startLine);
		const end   = Math.max(start, endLine);
		this.ranges.push([start, end]);
		this._isDirty = true;
	}

	/**
	 * Helper for tracking insert operations that shift line numbers.
	 *
	 * When `count` lines are inserted starting at `atLine`, all ranges that
	 * start at or after `atLine` are shifted down by `count`.  Newly inserted
	 * lines are also marked dirty.
	 */
	notifyInsert(atLine: number, count: number): void {
		if (count <= 0) return;
		// Shift existing ranges below the insertion point
		this.ranges = this.ranges.map(([s, e]) => [
			s >= atLine ? s + count : s,
			e >= atLine ? e + count : e,
		] as DirtyRange);
		this.markDirty(atLine, atLine + count - 1);
	}

	/**
	 * Helper for tracking delete operations that compress line numbers.
	 *
	 * When `count` lines are deleted starting at `atLine`, ranges overlapping
	 * the deleted span are clamped or removed, and subsequent ranges are shifted
	 * up by `count`.
	 */
	notifyDelete(atLine: number, count: number): void {
		if (count <= 0) return;
		const delEnd = atLine + count - 1;
		this.ranges = this.ranges
			.map(([s, e]) => {
				if (e < atLine)           return [s, e] as DirtyRange;       // before delete
				if (s > delEnd)           return [s - count, e - count] as DirtyRange; // after delete
				// overlaps delete range — clamp to the anchor line
				return [Math.min(s, atLine), Math.max(atLine - 1, 0)] as DirtyRange;
			})
			.filter(([s, e]) => s <= e);
		// The line at atLine (now the joined boundary) is dirty
		this.markDirty(Math.max(0, atLine - 1), atLine);
	}

	// ── Querying ──────────────────────────────────────────────────────────────

	get isDirty(): boolean {
		return this._isDirty;
	}

	/**
	 * Returns the merged, sorted dirty ranges.
	 * Does NOT clear the dirty state — call `clear()` after consuming.
	 */
	getNormalizedRanges(): DirtyRange[] {
		return merge(this.ranges);
	}

	/**
	 * Returns the union bounding box [minStart, maxEnd] of all dirty ranges,
	 * or null if nothing is dirty.  Useful for quick "what changed" estimates.
	 */
	getBoundingRange(): DirtyRange | null {
		if (!this._isDirty || this.ranges.length === 0) return null;
		let min = Infinity, max = -Infinity;
		for (const [s, e] of this.ranges) {
			if (s < min) min = s;
			if (e > max) max = e;
		}
		return [min, max];
	}

	/** Clears all recorded dirty ranges after a diff has been computed. */
	clear(): void {
		this.ranges  = [];
		this._isDirty = false;
	}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Merges overlapping / adjacent ranges. Returns a sorted, non-overlapping list. */
function merge(ranges: DirtyRange[]): DirtyRange[] {
	if (ranges.length === 0) return [];
	const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
	const result: DirtyRange[] = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const top  = result[result.length - 1];
		const curr = sorted[i];
		if (curr[0] <= top[1] + 1) {
			// Overlapping or adjacent — extend
			if (curr[1] > top[1]) top[1] = curr[1];
		} else {
			result.push(curr);
		}
	}
	return result;
}
