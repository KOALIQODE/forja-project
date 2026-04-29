/**
 * diff/GitHunkManager.ts — Phase 3
 *
 * Groups consecutive diff lines into navigable Hunks — the "git hunk"
 * abstraction that powers next/prev hunk navigation and revert-by-block.
 *
 * A new Hunk is started whenever there is a gap of more than `GAP_LINES`
 * unchanged lines between two changed regions (mirrors git's default context
 * of 3 lines, using 0 as the break point for efficiency).
 */

import type { LineDiffResult, Hunk, HunkStatus, DeletedBlock } from './types';

/** Maximum gap between changed lines before we start a new hunk. */
const GAP_LINES = 0;

export class GitHunkManager {
	private hunks: Hunk[] = [];

	// ── Update ────────────────────────────────────────────────────────────────

	/**
	 * Rebuilds the hunk list from a fresh diff result.
	 * Call this in the `onDiffReady` callback from DiffScheduler.
	 */
	update(result: LineDiffResult, baselineLines: string[]): void {
		this.hunks = buildHunks(result, baselineLines);
	}

	/** Clears all hunks. */
	clear(): void {
		this.hunks = [];
	}

	// ── Queries ───────────────────────────────────────────────────────────────

	/** Returns all current hunks (sorted by position). */
	getHunks(): readonly Hunk[] {
		return this.hunks;
	}

	/**
	 * Returns the hunk that contains `line` (0-indexed line in current file),
	 * or null if `line` is unchanged.
	 */
	getHunkAtLine(line: number): Hunk | null {
		for (const h of this.hunks) {
			if (h.status === 'deleted') {
				// Deleted hunks anchor to afterLine; match if line == afterLine
				if (h.afterLine === line) return h;
			} else {
				if (line >= h.newStart && line < h.newEnd) return h;
			}
		}
		return null;
	}

	/**
	 * Returns the next hunk after `fromLine`, wrapping around to the first if
	 * none exists below.  Returns null if there are no hunks at all.
	 */
	nextHunk(fromLine: number): Hunk | null {
		if (this.hunks.length === 0) return null;
		const candidates = this.hunks.filter(h => hunkStart(h) > fromLine);
		return candidates.length > 0
			? candidates[0]
			: this.hunks[0]; // wrap
	}

	/**
	 * Returns the previous hunk before `fromLine`, wrapping around to the last.
	 */
	prevHunk(fromLine: number): Hunk | null {
		if (this.hunks.length === 0) return null;
		const candidates = this.hunks.filter(h => hunkStart(h) < fromLine);
		return candidates.length > 0
			? candidates[candidates.length - 1]
			: this.hunks[this.hunks.length - 1]; // wrap
	}

	/** Total number of hunks. */
	get count(): number {
		return this.hunks.length;
	}
}

// ── Hunk builder ─────────────────────────────────────────────────────────────

function buildHunks(result: LineDiffResult, baselineLines: string[]): Hunk[] {
	const hunks: Hunk[] = [];

	// ── Changed lines (added / modified) ─────────────────────────────────────

	// Collect sorted changed lines
	const changedLines = Array.from(result.diffMap.keys()).sort((a, b) => a - b);

	// Group into contiguous blocks separated by more than GAP_LINES
	let groupStart = -1;
	let groupEnd   = -1;

	const flush = (start: number, end: number) => {
		hunks.push(makeHunk(start, end, result));
	};

	for (const line of changedLines) {
		if (groupStart === -1) {
			groupStart = groupEnd = line;
		} else if (line - groupEnd <= GAP_LINES + 1) {
			groupEnd = line;
		} else {
			flush(groupStart, groupEnd);
			groupStart = groupEnd = line;
		}
	}
	if (groupStart !== -1) flush(groupStart, groupEnd);

	// ── Deleted blocks ────────────────────────────────────────────────────────

	for (const block of result.deletedBlocks) {
		hunks.push(makeDeletedHunk(block, baselineLines));
	}

	// ── Sort by position ──────────────────────────────────────────────────────

	hunks.sort((a, b) => hunkStart(a) - hunkStart(b));

	return hunks;
}

function makeHunk(groupStart: number, groupEnd: number, result: LineDiffResult): Hunk {
	// Determine the dominant status: if ALL lines are 'added' → added, else modified
	let allAdded = true;
	for (let l = groupStart; l <= groupEnd; l++) {
		if (result.diffMap.get(l) !== 'added') { allAdded = false; break; }
	}
	const status: HunkStatus = allAdded ? 'added' : 'modified';

	return {
		id:        `${groupStart}-${groupEnd}-${status}`,
		newStart:  groupStart,
		newEnd:    groupEnd + 1,
		oldStart:  groupStart, // approximation; refined by Rust get_git_hunks
		oldEnd:    groupEnd + 1,
		status,
		afterLine: groupStart - 1,
	};
}

function makeDeletedHunk(block: DeletedBlock, _baselineLines: string[]): Hunk {
	return {
		id:        `del-${block.afterLine}-${block.oldStart}-${block.oldEnd}`,
		newStart:  block.afterLine + 1,
		newEnd:    block.afterLine + 1,
		oldStart:  block.oldStart,
		oldEnd:    block.oldEnd,
		status:    'deleted',
		afterLine: block.afterLine,
	};
}

/** Returns the "display start line" for a hunk (for sorting / navigation). */
function hunkStart(h: Hunk): number {
	return h.status === 'deleted' ? h.afterLine : h.newStart;
}
