/**
 * diff/types.ts — Shared types for the incremental diff system.
 *
 * Used across all diff modules (TypeScript side) and by EditorBuffer
 * when consuming diff decorations and hunk navigation.
 */

// ── Core diff primitives ──────────────────────────────────────────────────────

/** Raw edit operation produced by the Myers algorithm. */
export interface DiffOp {
	type: 'equal' | 'insert' | 'delete';
	/** Range in the old (baseline) array [start, end) — end is exclusive. */
	oldStart: number;
	oldEnd: number;
	/** Range in the new (current) array [start, end) — end is exclusive. */
	newStart: number;
	newEnd: number;
}

/** Per-line annotation for lines that exist in the current file. */
export type LineStatus = 'added' | 'modified';

/**
 * Map<newLineNumber (0-indexed), LineStatus>
 * Only 'added' and 'modified' lines are stored; unchanged lines are absent.
 */
export type DiffMap = Map<number, LineStatus>;

/**
 * Represents a contiguous block of lines that were deleted from the baseline.
 * Rendered as a thin red marker BETWEEN lines in the gutter.
 *
 * `afterLine` is the last existing line in the new file before the deletion
 * (−1 means the deletion is at the very top of the file).
 */
export interface DeletedBlock {
	/** Line after which this deletion appears in the current file (0-indexed, −1 = top). */
	afterLine: number;
	/** Start in baseline (0-indexed, inclusive). */
	oldStart: number;
	/** End in baseline (0-indexed, exclusive). */
	oldEnd: number;
	/** Baseline content of the deleted lines (for preview). */
	oldContent: string[];
}

/** Combined result of a full diff computation. */
export interface LineDiffResult {
	diffMap: DiffMap;
	deletedBlocks: DeletedBlock[];
}

// ── Hunk (grouped change) ─────────────────────────────────────────────────────

export type HunkStatus = 'added' | 'modified' | 'deleted';

/**
 * A hunk groups one or more adjacent changed lines into a single navigable unit,
 * matching the "git hunk" concept used in VSCode / Neovim gutter decorations.
 */
export interface Hunk {
	/** Stable identifier: `${newStart}-${newEnd}-${status}` */
	id: string;

	/** First line in the current file that belongs to this hunk (0-indexed). */
	newStart: number;
	/** Exclusive end in the current file. */
	newEnd: number;

	/** First matching line in the baseline (0-indexed). */
	oldStart: number;
	/** Exclusive end in the baseline. */
	oldEnd: number;

	status: HunkStatus;

	/**
	 * For pure deletions: the deletion marker appears AFTER this line
	 * in the current file (same semantics as DeletedBlock.afterLine).
	 */
	afterLine: number;
}

// ── Render decorations ────────────────────────────────────────────────────────

/** Colors used for gutter bars and minimap dots. */
export interface DiffDecoration {
	/** Line in the current file (0-indexed). */
	line: number;
	status: LineStatus;
	/** CSS hex color for gutter bar. */
	color: string;
}

/** A thin red marker rendered between gutter lines to signal a deletion. */
export interface DeletedMarker {
	/** Rendered after this line in the viewport (same as DeletedBlock.afterLine). */
	afterLine: number;
	/** How many lines were deleted (affects marker thickness). */
	count: number;
}

// ── Hunk preview ─────────────────────────────────────────────────────────────

export interface PreviewLine {
	type: 'context' | 'added' | 'deleted';
	text: string;
	lineNo: number | null; // null for context that is off-screen
}

export interface HunkPreview {
	hunkId: string;
	lines: PreviewLine[];
	/** Number of context lines shown above/below. */
	contextLines: number;
}

// ── Dirty ranges ─────────────────────────────────────────────────────────────

/** [startLine, endLine] inclusive range of lines dirtied by an edit. */
export type DirtyRange = [number, number];

// ── Gutter color palette ──────────────────────────────────────────────────────

export const DIFF_COLORS = {
	added:    '#4ec94e',  // green
	modified: '#e5a50a',  // amber
	deleted:  '#e05252',  // red
} as const satisfies Record<string, string>;
