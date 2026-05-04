/**
 * diff/HunkPreviewEngine.ts — Phase 4
 *
 * Generates a hover-preview for a Hunk — the popup that appears when you
 * hover over a gutter decoration, showing the before/after diff lines styled
 * similarly to VSCode's dirty-diff hover.
 *
 * Output is a plain HunkPreview object; the actual HTML rendering is the
 * responsibility of the UI layer (keep logic and rendering separate).
 *
 * Cache: previews are memoised by hunkId so repeated hovers are O(1).
 */

import type { Hunk, HunkPreview, PreviewLine } from './types';

/** Number of context lines shown above and below the changed block. */
const CONTEXT_LINES = 3;

export class HunkPreviewEngine {
	/** Memoised previews keyed by hunk.id. */
	private cache = new Map<string, HunkPreview>();

	// ── Public API ────────────────────────────────────────────────────────────

	/**
	 * Returns the preview for `hunk`, building and caching it if necessary.
	 *
	 * @param hunk          The hunk to preview.
	 * @param baselineLines The baseline (old) content.
	 * @param currentLines  The current (new) content.
	 */
	getPreview(
		hunk:          Hunk,
		baselineLines: string[],
		currentLines:  string[]
	): HunkPreview {
		if (this.cache.has(hunk.id)) return this.cache.get(hunk.id)!;
		const preview = buildPreview(hunk, baselineLines, currentLines);
		this.cache.set(hunk.id, preview);
		return preview;
	}

	/**
	 * Invalidates the cached preview for a specific hunk.
	 * Call when the diff result changes and old previews may be stale.
	 */
	invalidate(hunkId: string): void {
		this.cache.delete(hunkId);
	}

	/** Clears the entire preview cache. */
	clearCache(): void {
		this.cache.clear();
	}

	// ── HTML rendering helper ─────────────────────────────────────────────────

	/**
	 * Converts a HunkPreview into an HTML string suitable for injection into
	 * a `<div>` popup overlay.  Uses inline styles to avoid CSS class conflicts.
	 */
	static toHTML(preview: HunkPreview): string {
		const lines = preview.lines.map(line => {
			const escapedText = escapeHTML(line.text);
			const lineNo      = line.lineNo !== null
				? `<span class="diff-preview-lineno">${line.lineNo + 1}</span>`
				: `<span class="diff-preview-lineno">   </span>`;

			let cls = 'diff-preview-line';
			if (line.type === 'added')   cls += ' diff-preview-added';
			if (line.type === 'deleted') cls += ' diff-preview-deleted';

			return `<div class="${cls}">${lineNo}<span class="diff-preview-text">${escapedText}</span></div>`;
		}).join('');

		return `<div class="diff-preview-container">${lines}</div>`;
	}
}

// ── Builder ───────────────────────────────────────────────────────────────────

function buildPreview(
	hunk:          Hunk,
	baselineLines: string[],
	currentLines:  string[]
): HunkPreview {
	const previewLines: PreviewLine[] = [];

	switch (hunk.status) {
		case 'added': {
			// Show context before + added lines
			const contextStart = Math.max(0, hunk.newStart - CONTEXT_LINES);
			for (let l = contextStart; l < hunk.newStart; l++) {
				previewLines.push({ type: 'context', text: currentLines[l] ?? '', lineNo: l });
			}
			for (let l = hunk.newStart; l < hunk.newEnd; l++) {
				previewLines.push({ type: 'added', text: currentLines[l] ?? '', lineNo: l });
			}
			// Context after
			const contextEnd = Math.min(currentLines.length, hunk.newEnd + CONTEXT_LINES);
			for (let l = hunk.newEnd; l < contextEnd; l++) {
				previewLines.push({ type: 'context', text: currentLines[l] ?? '', lineNo: l });
			}
			break;
		}

		case 'deleted': {
			// Show the deleted baseline content
			const contextStart = Math.max(0, hunk.afterLine - CONTEXT_LINES + 1);
			for (let l = contextStart; l <= hunk.afterLine; l++) {
				previewLines.push({ type: 'context', text: currentLines[l] ?? '', lineNo: l });
			}
			for (let l = hunk.oldStart; l < hunk.oldEnd; l++) {
				previewLines.push({ type: 'deleted', text: baselineLines[l] ?? '', lineNo: null });
			}
			break;
		}

		case 'modified': {
			// Show deleted baseline lines then added current lines
			const contextStart = Math.max(0, hunk.newStart - CONTEXT_LINES);
			for (let l = contextStart; l < hunk.newStart; l++) {
				previewLines.push({ type: 'context', text: currentLines[l] ?? '', lineNo: l });
			}
			// Deleted (old content)
			for (let l = hunk.oldStart; l < hunk.oldEnd; l++) {
				previewLines.push({ type: 'deleted', text: baselineLines[l] ?? '', lineNo: null });
			}
			// Added (new content)
			for (let l = hunk.newStart; l < hunk.newEnd; l++) {
				previewLines.push({ type: 'added', text: currentLines[l] ?? '', lineNo: l });
			}
			// Context after
			const contextEnd = Math.min(currentLines.length, hunk.newEnd + CONTEXT_LINES);
			for (let l = hunk.newEnd; l < contextEnd; l++) {
				previewLines.push({ type: 'context', text: currentLines[l] ?? '', lineNo: l });
			}
			break;
		}
	}

	return {
		hunkId:       hunk.id,
		lines:        previewLines,
		contextLines: CONTEXT_LINES,
	};
}

// ── Util ──────────────────────────────────────────────────────────────────────

function escapeHTML(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/ /g, '&nbsp;');
}
