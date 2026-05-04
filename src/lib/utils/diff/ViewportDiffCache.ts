/**
 * diff/ViewportDiffCache.ts — Phase 2
 *
 * Caches diff decorations (gutter colour bars and minimap dots) for the
 * currently visible viewport.  Updated in O(visible changed lines) on each
 * diff result.
 *
 * Consumers call:
 *   - `update(result, visibleStart, visibleEnd)` after a new diff arrives or
 *     after a scroll event changes the visible range.
 *   - `getDecoration(line)` per line during canvas rendering to get the colour.
 *   - `getDeletedMarkersInViewport()` to get the thin red lines between gutter rows.
 */

import type { LineDiffResult, DiffDecoration, DeletedMarker } from './types';
import { DIFF_COLORS } from './types';

export class ViewportDiffCache {
	/** Per-line decorations for the current viewport. */
	private decorations = new Map<number, DiffDecoration>();
	/** Deleted-line markers visible in the current viewport. */
	private deletedMarkers: DeletedMarker[] = [];

	/** The last diff result applied (kept so re-scrolling can rebuild cheaply). */
	private lastResult: LineDiffResult | null = null;
	private lastVisibleStart = 0;
	private lastVisibleEnd   = 0;

	// ── Update ────────────────────────────────────────────────────────────────

	/**
	 * Rebuilds the viewport cache from a new diff result.
	 *
	 * @param result       Latest diff result from DiffScheduler.
	 * @param visibleStart First visible line (0-indexed, inclusive).
	 * @param visibleEnd   Last visible line (0-indexed, inclusive).
	 */
	update(result: LineDiffResult, visibleStart: number, visibleEnd: number): void {
		this.lastResult       = result;
		this.lastVisibleStart = visibleStart;
		this.lastVisibleEnd   = visibleEnd;
		this._rebuild(result, visibleStart, visibleEnd);
	}

	/**
	 * Re-runs the cache rebuild for a new viewport range using the LAST diff
	 * result.  Call this on scroll without waiting for a new diff.
	 */
	scroll(visibleStart: number, visibleEnd: number): void {
		this.lastVisibleStart = visibleStart;
		this.lastVisibleEnd   = visibleEnd;
		if (this.lastResult) {
			this._rebuild(this.lastResult, visibleStart, visibleEnd);
		}
	}

	// ── Queries ───────────────────────────────────────────────────────────────

	/**
	 * Returns the decoration for `line`, or null if the line is unchanged.
	 */
	getDecoration(line: number): DiffDecoration | null {
		return this.decorations.get(line) ?? null;
	}

	/**
	 * Returns all deleted-line markers whose anchor falls within the visible range.
	 */
	getDeletedMarkersInViewport(): readonly DeletedMarker[] {
		return this.deletedMarkers;
	}

	/**
	 * True if any decoration exists in the viewport (cheap check before drawing).
	 */
	get hasDecorations(): boolean {
		return this.decorations.size > 0 || this.deletedMarkers.length > 0;
	}

	/** Clears all cached decorations. */
	clear(): void {
		this.decorations.clear();
		this.deletedMarkers = [];
		this.lastResult     = null;
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	private _rebuild(
		result:       LineDiffResult,
		visibleStart: number,
		visibleEnd:   number
	): void {
		this.decorations.clear();
		this.deletedMarkers = [];

		// Build decorations for visible changed lines
		for (const [line, status] of result.diffMap) {
			if (line < visibleStart || line > visibleEnd) continue;
			this.decorations.set(line, {
				line,
				status,
				color: DIFF_COLORS[status],
			});
		}

		// Build deleted-block markers whose anchor is visible
		for (const block of result.deletedBlocks) {
			const anchor = block.afterLine;
			// Show the marker if its anchor line is within ±1 line of the viewport
			if (anchor >= visibleStart - 1 && anchor <= visibleEnd + 1) {
				this.deletedMarkers.push({
					afterLine: anchor,
					count:     block.oldEnd - block.oldStart,
				});
			}
		}
	}
}
