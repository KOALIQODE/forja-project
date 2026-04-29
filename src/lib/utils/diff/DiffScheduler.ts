/**
 * diff/DiffScheduler.ts
 *
 * Central coordinator for the incremental diff pipeline.
 *
 * Flow:
 *   1. EditorBuffer calls `notifyEdit(startLine, endLine)` on every text change.
 *   2. DirtyRangeNormalizer accumulates dirty ranges.
 *   3. On the next animation frame the scheduler runs the full diff via
 *      `lineDiffs.computeLineDiffs(baseline, current)` and emits the result.
 *   4. Downstream consumers (DiffRenderInvalidationManager, GitHunkManager,
 *      ViewportDiffCache) react to the `onDiffReady` callback.
 *
 * Performance notes:
 *   - RAF-debounced: at most one diff per frame regardless of keystroke rate.
 *   - In-flight scheduling is cancelled when new edits arrive before the frame fires.
 *   - Myers diff is O((N+M)·D) — for typical edits D << N so it's effectively O(N+M).
 */

import { BaselineMapManager }  from './BaselineMapManager';
import { DirtyRangeNormalizer } from './DirtyRangeNormalizer';
import { computeLineDiffs, lineCacheToArray } from './lineDiffs';
import type { LineDiffResult } from './types';

export type DiffReadyCallback = (result: LineDiffResult) => void;

export class DiffScheduler {
	private readonly baseline   = new BaselineMapManager();
	private readonly dirty      = new DirtyRangeNormalizer();
	private callbacks: DiffReadyCallback[] = [];

	private rafId: number | null = null;
	private currentLines: Map<number, string> = new Map();
	private currentTotalLines = 0;

	/**
	 * Resets internal state for a new file WITHOUT clearing subscribers.
	 * Call this when switching files so existing `onDiffReady` callbacks survive.
	 */
	reset(): void {
		this._cancelScheduled();
		this.baseline.clear();
		this.dirty.clear();
		this.currentLines      = new Map();
		this.currentTotalLines = 0;
	}

	// ── Baseline management ───────────────────────────────────────────────────

	/**
	 * Initialises the baseline from raw file content.
	 * Call this when a file is first opened.
	 * Automatically schedules a diff if current content is already known.
	 */
	initBaseline(content: string, filePath: string): void {
		this.baseline.setFromContent(content, filePath);
		// Always schedule a full-file diff after a baseline change.
		// _runDiff handles the case where currentTotalLines is still 0 gracefully.
		this._scheduleForcedCompute();
	}

	/**
	 * Resets the baseline to the current editor content (re-baseline on save).
	 * After this call, all lines appear unchanged until new edits arrive.
	 */
	rebaselineFromCurrent(): void {
		this.baseline.setFromLineCache(this.currentTotalLines > 0
			? this.currentLines
			: new Map(), this.currentTotalLines);
		this.dirty.clear();
		// Emit an empty diff so consumers clear their decorations
		this._emitResult({ diffMap: new Map(), deletedBlocks: [] });
	}

	/**
	 * Updates the baseline from a pre-split line array (e.g. from Rust HEAD fetch).
	 * Schedules an immediate diff against the current editor content.
	 */
	updateBaselineFromLines(lines: string[], filePath: string): void {
		this.baseline.setFromLines(lines, filePath);
		this.dirty.clear();
		this._scheduleCompute();
	}

	// ── Edit notifications ────────────────────────────────────────────────────

	/**
	 * Called by EditorBuffer whenever the text changes.
	 *
	 * @param lineCache   The editor's current line cache.
	 * @param totalLines  Current total line count.
	 * @param startLine   First changed line (0-indexed).
	 * @param endLine     Last changed line inclusive (0-indexed).
	 */
	notifyEdit(
		lineCache:   Map<number, string>,
		totalLines:  number,
		startLine:   number,
		endLine:     number
	): void {
		this.currentLines      = lineCache;
		this.currentTotalLines = totalLines;
		this.dirty.markDirty(startLine, endLine);
		this._scheduleCompute();
	}

	/**
	 * Updates the current content snapshot WITHOUT triggering a diff.
	 * Use this for viewport-scroll updates where content hasn't changed.
	 */
	updateCurrentContent(lineCache: Map<number, string>, totalLines: number): void {
		this.currentLines      = lineCache;
		this.currentTotalLines = totalLines;
	}

	// ── Immediate compute (synchronous) ───────────────────────────────────────

	/**
	 * Forces an immediate diff computation, bypassing the RAF debounce.
	 * Returns the result directly and also fires the onDiffReady callback.
	 */
	computeNow(): LineDiffResult {
		this._cancelScheduled();
		return this._runDiff();
	}

	// ── Subscription ─────────────────────────────────────────────────────────

	/** Registers a callback to receive diff results. Returns an unsubscribe fn. */
	onDiffReady(cb: DiffReadyCallback): () => void {
		this.callbacks.push(cb);
		return () => {
			const idx = this.callbacks.indexOf(cb);
			if (idx !== -1) this.callbacks.splice(idx, 1);
		};
	}

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	/** Cancels any pending RAF and releases resources. */
	dispose(): void {
		this._cancelScheduled();
		this.callbacks = [];
		this.baseline.clear();
		this.dirty.clear();
	}

	// ── Accessors ─────────────────────────────────────────────────────────────

	get baselineManager(): BaselineMapManager {
		return this.baseline;
	}

	// ── Internal ──────────────────────────────────────────────────────────────

	private _scheduleCompute(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
		}
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			if (!this.dirty.isDirty) return;
			const result = this._runDiff();
			this._emitResult(result);
		});
	}

	/** Forces a diff compute regardless of dirty state (used after baseline change). */
	private _scheduleForcedCompute(): void {
		if (this.rafId !== null) cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.dirty.clear();
			const result = this._runDiff();
			this._emitResult(result);
		});
	}

	private _cancelScheduled(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private _runDiff(): LineDiffResult {
		if (!this.baseline.isReady || this.currentTotalLines === 0) {
			return { diffMap: new Map(), deletedBlocks: [] };
		}
		const baselineArr = this.baseline.getLines();
		const N           = this.currentTotalLines;

		// For lines not yet loaded in the editor (lazy chunks), fall back to
		// baseline content so they appear unchanged rather than "all deleted".
		const currentArr = new Array<string>(N);
		for (let i = 0; i < N; i++) {
			currentArr[i] = this.currentLines.has(i)
				? this.currentLines.get(i)!
				: (baselineArr[i] ?? '');
		}

		const result = computeLineDiffs(baselineArr, currentArr);
		this.dirty.clear();
		return result;
	}

	private _emitResult(result: LineDiffResult): void {
		for (const cb of this.callbacks) {
			try { cb(result); } catch (e) { console.error('[DiffScheduler] callback error', e); }
		}
	}
}
