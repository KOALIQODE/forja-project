/**
 * diff/index.ts — Public barrel for the incremental diff system.
 *
 * Import everything consumers need from this single entry point:
 *
 *   import {
 *     DiffScheduler,
 *     GitHunkManager,
 *     HunkPreviewEngine,
 *     DiffRenderInvalidationManager,
 *     ViewportDiffCache,
 *   } from '$lib/utils/diff';
 *
 * Types are also re-exported so callers don't need to reach into sub-modules.
 */

// ── Phase 1 — Core incremental diff ──────────────────────────────────────────
export { BaselineMapManager }            from './BaselineMapManager';
export { DirtyRangeNormalizer }          from './DirtyRangeNormalizer';
export { DiffScheduler }                 from './DiffScheduler';
export { myersDiff, computeLineDiffs, lineCacheToArray } from './lineDiffs';

// ── Phase 2 — Partial render ──────────────────────────────────────────────────
export { DiffRenderInvalidationManager } from './DiffRenderInvalidationManager';
export { ViewportDiffCache }             from './ViewportDiffCache';

// ── Phase 3 — Git hunks ───────────────────────────────────────────────────────
export { GitHunkManager }                from './GitHunkManager';

// ── Phase 4 — Hunk preview popup ─────────────────────────────────────────────
export { HunkPreviewEngine }             from './HunkPreviewEngine';

// ── Shared types ──────────────────────────────────────────────────────────────
export type {
	DiffOp,
	LineStatus,
	DiffMap,
	DeletedBlock,
	LineDiffResult,
	Hunk,
	HunkStatus,
	DiffDecoration,
	DeletedMarker,
	PreviewLine,
	HunkPreview,
	DirtyRange,
} from './types';

export { DIFF_COLORS } from './types';
